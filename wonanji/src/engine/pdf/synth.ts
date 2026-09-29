// PDF에서 읽은 문항 구조를 HWPX 출제 파일로 만듭니다(글자는 입력한 글자로, 그림은 잘라 낸 이미지로).
// 이렇게 만든 파일은 HWP 출제 파일과 똑같이 문항 분할·서식 통일·조립 과정을 거칩니다.
import { strToU8 } from "fflate";
import { zip } from "../zip";
import type { Box, Run } from "./lines";
import type { Block, BoxBlock, FigureBlock, ParaBlock, PdfLayout, TableBlock } from "./layout";

export interface CropResult {
  png: Uint8Array;
  /** 픽셀 크기 */
  width: number;
  height: number;
}
export type CropFn = (page: number, box: Box) => Promise<CropResult>;

const NS =
  'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:opf="http://www.idpf.org/2007/opf/"';
const LANGS = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"];
const HU = 100; // 1pt = 100 HWPUNIT

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

class Registry {
  private map = new Map<string, number>();
  items: string[] = [];
  constructor(private start = 0) {}
  get(key: string, make: (id: number) => string): number {
    const hit = this.map.get(key);
    if (hit != null) return hit;
    const id = this.start + this.items.length;
    this.items.push(make(id));
    this.map.set(key, id);
    return id;
  }
}

function charPrXml(id: number, h: number, o: { sub?: boolean; sup?: boolean; ul?: boolean; bold?: boolean }) {
  const all = (v: string | number) => LANGS.map((l) => `${l.toLowerCase()}="${v}"`).join(" ");
  return `<hh:charPr id="${id}" height="${h}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"><hh:fontRef ${all(0)}/><hh:ratio ${all(100)}/><hh:spacing ${all(0)}/><hh:relSz ${all(100)}/><hh:offset ${all(0)}/>${o.bold ? "<hh:bold/>" : ""}<hh:underline type="${o.ul ? "BOTTOM" : "NONE"}" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>${o.sup ? "<hh:supscript/>" : ""}${o.sub ? "<hh:subscript/>" : ""}</hh:charPr>`;
}

function paraPrXml(id: number, o: { align: string; left: number; intent: number; outline: boolean }) {
  const m = (k: number) =>
    `<hh:margin><hc:intent value="${o.intent * k}" unit="HWPUNIT"/><hc:left value="${o.left * k}" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>`;
  return `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="0" suppressLineNumbers="0" checked="0"><hh:align horizontal="${o.align}" vertical="BASELINE"/><hh:heading type="${o.outline ? "OUTLINE" : "NONE"}" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/><hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${m(1)}</hp:case><hp:default>${m(2)}</hp:default></hp:switch><hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>`;
}

function borderXml(id: number, sides: { l: boolean; r: boolean; t: boolean; b: boolean }) {
  const s = (on: boolean) => `type="${on ? "SOLID" : "NONE"}" width="0.12 mm" color="#000000"`;
  return `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder ${s(sides.l)}/><hh:rightBorder ${s(sides.r)}/><hh:topBorder ${s(sides.t)}/><hh:bottomBorder ${s(sides.b)}/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>`;
}

const POS_INLINE = `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`;

/** 수식 글자 폭(글자 크기 배수)과 줄 수: 분수는 분자·분모 중 긴 쪽, 첨자는 작게 */
export function eqSize(script: string): { w: number; lines: number } {
  const m = /^\{(.*)\}\s*over\s*\{(.*)\}$/.exec(script);
  const width = (s: string) => {
    let w = 0;
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if ((ch === "_" || ch === "^") && s[i + 1] === "{") {
        depth++;
        i++;
        continue;
      }
      if (ch === "}") {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (ch === "{" || ch === "\\") continue;
      const k = depth ? 0.6 : 1;
      const c = ch.codePointAt(0) ?? 0;
      w += k * (ch === "~" ? 0.3 : c < 0x80 ? (/[A-Z]/.test(ch) ? 0.68 : 0.55) : 1);
    }
    return w;
  };
  if (m) return { w: Math.max(width(m[1]), width(m[2])) + 0.3, lines: 2 };
  return { w: width(script), lines: 1 };
}

export interface SynthResult {
  bytes: Uint8Array;
  /** 문항 번호(원래 번호) */
  numbers: number[];
  notes: string[];
  columnWidthHU: number;
}

export async function synthesizeHwpx(layout: PdfLayout, crop: CropFn): Promise<SynthResult> {
  const body = Math.round(layout.bodySize * HU);
  const colW = Math.round(layout.columnWidth * HU);
  const chars = new Registry(0);
  const paras = new Registry(0);
  const borders = new Registry(1);
  borders.get("none", (id) => borderXml(id, { l: false, r: false, t: false, b: false }));
  borders.get("all", (id) => borderXml(id, { l: true, r: true, t: true, b: true }));
  const files = new Map<string, Uint8Array>();
  const manifest: string[] = [];
  let nextId = 1;
  let objId = 1000;
  let unknownGlyphs = 0;
  let figures = 0;
  let equations = 0;

  const cp = (h: number, r: Partial<Run> & { bold?: boolean } = {}) =>
    chars.get(`${h}|${r.sub ? 1 : 0}|${r.sup ? 1 : 0}|${r.underline ? 1 : 0}|${r.bold ? 1 : 0}`, (id) => charPrXml(id, h, { sub: r.sub, sup: r.sup, ul: r.underline, bold: r.bold }));
  const pp = (align: string, left = 0, intent = 0, outline = false) => {
    const a = align === "center" ? "CENTER" : align === "right" ? "RIGHT" : align === "left" ? "LEFT" : "JUSTIFY";
    const L = Math.round(left * HU);
    const I = Math.round(intent * HU);
    return paras.get(`${a}|${L}|${I}|${outline}`, (id) => paraPrXml(id, { align: a, left: L, intent: I, outline }));
  };
  cp(body);
  pp("justify");

  const addImage = (c: CropResult): string => {
    const n = files.size + 1;
    const id = `image${n}`;
    files.set(`BinData/${id}.png`, c.png);
    manifest.push(`<opf:item id="${id}" href="BinData/${id}.png" media-type="image/png" isEmbeded="1"/>`);
    return id;
  };

  const picXml = (binId: string, c: CropResult, wHU: number, hHU: number) => {
    const ow = Math.max(1, Math.round(c.width * 75));
    const oh = Math.max(1, Math.round(c.height * 75));
    const id = objId++;
    const inst = objId++;
    return `<hp:pic id="${id}" zOrder="${id}" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${inst}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${ow}" height="${oh}"/><hp:curSz width="${wHU}" height="${hHU}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${Math.round(wHU / 2)}" centerY="${Math.round(hHU / 2)}" rotateimage="0"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="${(wHU / ow).toFixed(8)}" e2="0" e3="0" e4="0" e5="${(hHU / oh).toFixed(8)}" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${ow}" y="0"/><hc:pt2 x="${ow}" y="${oh}"/><hc:pt3 x="0" y="${oh}"/></hp:imgRect><hp:imgClip left="0" right="${ow}" top="0" bottom="${oh}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${ow}" dimheight="${oh}"/><hc:img binaryItemIDRef="${binId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/><hp:sz width="${wHU}" widthRelTo="ABSOLUTE" height="${hHU}" heightRelTo="ABSOLUTE" protect="0"/>${POS_INLINE}<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>그림입니다.</hp:shapeComment></hp:pic>`;
  };

  const eqXml = (script: string, h: number) => {
    const id = objId++;
    equations++;
    const { w, lines } = eqSize(script);
    const width = Math.round(w * h + h * 0.3);
    const height = Math.round(h * (lines > 1 ? 2.45 : 1.25));
    const baseLine = lines > 1 ? 66 : 86;
    return `<hp:equation id="${id}" zOrder="${id}" numberingType="EQUATION" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" version="Equation Version 60" baseLine="${baseLine}" textColor="#000000" baseUnit="${h}" lineMode="CHAR" font="HYhwpEQ"><hp:script>${esc(script)}</hp:script><hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/>${POS_INLINE}<hp:outMargin left="56" right="56" top="0" bottom="0"/><hp:shapeComment>수식입니다.</hp:shapeComment></hp:equation>`;
  };

  /** 글자 조각 → run들. 탭은 탭 요소로. 모르는 기호는 그 자리를 잘라 그림으로. */
  const runsXml = async (runs: Run[], h: number): Promise<{ xml: string; tallest: number; hasPic: boolean }> => {
    let xml = "";
    let tallest = h;
    let hasPic = false;
    for (const r of runs) {
      if (r.eq) {
        xml += `<hp:run charPrIDRef="${cp(h)}">${eqXml(r.eq, h)}</hp:run>`;
        tallest = Math.max(tallest, Math.round(h * 2.3));
        continue;
      }
      if (r.crop) {
        const c = await crop(r.crop.page, r.crop.box);
        const w = Math.round((r.crop.box.x1 - r.crop.box.x0) * HU);
        const hh = Math.round((r.crop.box.y1 - r.crop.box.y0) * HU);
        xml += `<hp:run charPrIDRef="${cp(h)}">${picXml(addImage(c), c, w, hh)}</hp:run>`;
        unknownGlyphs++;
        hasPic = true;
        continue;
      }
      if (!r.text) continue;
      const t = esc(r.text).replace(/\t/g, '<hp:tab width="1000" leader="0" type="1"/>');
      xml += `<hp:run charPrIDRef="${cp(h, r)}"><hp:t>${t}</hp:t></hp:run>`;
    }
    if (!xml) xml = `<hp:run charPrIDRef="${cp(h)}"><hp:t/></hp:run>`;
    return { xml, tallest, hasPic };
  };

  const lineseg = (height: number, width: number) =>
    `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="${height}" textheight="${height}" baseline="${Math.round(height * 0.85)}" spacing="${Math.round(body * 0.6)}" horzpos="0" horzsize="${width}" flags="393216"/></hp:linesegarray>`;

  const pXml = (ppId: number, inner: string, seg = "") => `<hp:p id="${nextId++}" paraPrIDRef="${ppId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${inner}${seg}</hp:p>`;

  const paraXml = async (b: ParaBlock, h: number, width: number, outline = false) => {
    const r = await runsXml(b.runs, h);
    return pXml(pp(b.align, outline ? 0 : b.left, outline ? 0 : b.intent, outline), r.xml, r.hasPic ? lineseg(r.tallest, width) : "");
  };

  const figureXml = async (f: FigureBlock, width: number, outline = false) => {
    const c = await crop(f.page, f.bbox);
    figures++;
    const w = Math.round((f.bbox.x1 - f.bbox.x0) * HU);
    const h = Math.round((f.bbox.y1 - f.bbox.y0) * HU);
    return pXml(pp(outline ? "justify" : "center", 0, 0, outline), `<hp:run charPrIDRef="${cp(body)}">${picXml(addImage(c), c, w, h)}<hp:t/></hp:run>`, lineseg(h, width));
  };

  const tblOpen = (rows: number, cols: number, w: number, h: number, bf: number, inMargin: [number, number, number, number]) => {
    const id = objId++;
    return `<hp:tbl id="${id}" zOrder="${id}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rows}" colCnt="${cols}" cellSpacing="0" borderFillIDRef="${bf}" noAdjust="0"><hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/>${POS_INLINE}<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="${inMargin[0]}" right="${inMargin[1]}" top="${inMargin[2]}" bottom="${inMargin[3]}"/>`;
  };
  const tcXml = (inner: string, c: { col: number; row: number; cs: number; rs: number; w: number; h: number; bf: number; margin: [number, number, number, number]; vAlign: string }) =>
    `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${c.bf}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${c.vAlign}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${inner}</hp:subList><hp:cellAddr colAddr="${c.col}" rowAddr="${c.row}"/><hp:cellSpan colSpan="${c.cs}" rowSpan="${c.rs}"/><hp:cellSz width="${c.w}" height="${c.h}"/><hp:cellMargin left="${c.margin[0]}" right="${c.margin[1]}" top="${c.margin[2]}" bottom="${c.margin[3]}"/></hp:tc>`;

  const tableXml = async (t: TableBlock): Promise<string> => {
    const cellBody = Math.round(Math.min(layout.bodySize, t.fontSize) * HU);
    const colHU = t.colW.map((w) => Math.round(w * HU));
    // 행 높이는 최소 높이로 줍니다(한글·rhwp 모두 내용에 맞춰 늘림). 글꼴·단 폭이 바뀌어도 글이 잘리지 않게.
    const oneLine = Math.round(cellBody * 1.6) + 200;
    const rowHU = t.rowH.map((h) => Math.min(Math.round(h * HU), oneLine));
    const width = colHU.reduce((a, b) => a + b, 0);
    const height = rowHU.reduce((a, b) => a + b, 0);
    const rows: string[] = rowHU.map(() => "");
    for (const c of t.cells) {
      const w = colHU.slice(c.c, c.c + c.cs).reduce((a, b) => a + b, 0);
      const h = rowHU.slice(c.r, c.r + c.rs).reduce((a, b) => a + b, 0);
      const bf = borders.get(`${+c.borders.l}${+c.borders.r}${+c.borders.t}${+c.borders.b}`, (id) => borderXml(id, c.borders));
      let inner = "";
      for (const p of c.blocks) inner += await paraXml(p, cellBody, w);
      if (!inner) inner = pXml(pp("center"), `<hp:run charPrIDRef="${cp(cellBody)}"><hp:t/></hp:run>`);
      rows[c.r] += tcXml(inner, { col: c.c, row: c.r, cs: c.cs, rs: c.rs, w, h, bf, margin: [140, 140, 100, 100], vAlign: "CENTER" });
    }
    return tblOpen(rowHU.length, colHU.length, width, height, borders.get("none", () => ""), [140, 140, 100, 100]) + rows.map((r) => `<hp:tr>${r}</hp:tr>`).join("") + "</hp:tbl>";
  };

  const blockXml = async (b: Block, width: number, outline = false): Promise<string> => {
    if (b.type === "para") return paraXml(b, body, width, outline);
    if (b.type === "figure") return figureXml(b, width, outline);
    if (b.type === "table") {
      const x = pXml(pp(outline ? "justify" : "center", 0, 0, outline), `<hp:run charPrIDRef="${cp(body)}">${await tableXml(b)}<hp:t/></hp:run>`);
      return b.legend ? x + (await paraXml(b.legend, Math.round(body * 0.85), width)) : x;
    }
    return boxXml(b, width, outline);
  };

  const boxXml = async (b: BoxBlock, width: number, outline: boolean): Promise<string> => {
    const w = Math.min(width, Math.round((b.bbox.x1 - b.bbox.x0) * HU));
    const inner: string[] = [];
    if (b.label) inner.push(pXml(pp("center"), `<hp:run charPrIDRef="${cp(body)}"><hp:t>${esc(b.label)}</hp:t></hp:run>`));
    for (const x of b.blocks) inner.push(await blockXml(x, w - 1020));
    // 상자 높이도 최소 높이(내용에 맞춰 늘어남)
    const h = Math.round(body * 1.6) + 566;
    const tbl = tblOpen(1, 1, w, h, borders.get("all", () => ""), [510, 510, 283, 283]) +
      `<hp:tr>${tcXml(inner.join(""), { col: 0, row: 0, cs: 1, rs: 1, w, h, bf: borders.get("all", () => ""), margin: [510, 510, 283, 283], vAlign: "TOP" })}</hp:tr></hp:tbl>`;
    return pXml(pp(outline ? "justify" : "center", 0, 0, outline), `<hp:run charPrIDRef="${cp(body)}">${tbl}<hp:t/></hp:run>`);
  };

  // ── 본문 ──
  const out: string[] = [];
  const numbers: number[] = [];
  for (const q of layout.questions) {
    numbers.push(q.number);
    const blocks = [...q.blocks];
    // 머리 문단: 첫 문단(발문 첫머리). 문단이 없으면 첫 개체 문단을 머리로.
    const first = blocks.shift();
    if (!first) {
      out.push(pXml(pp("justify", 0, 0, true), `<hp:run charPrIDRef="${cp(body)}"><hp:t>(내용 없음)</hp:t></hp:run>`));
      continue;
    }
    out.push(await blockXml(first, colW, true));
    for (const b of blocks) out.push(await blockXml(b, colW));
    out.push(pXml(pp("justify"), `<hp:run charPrIDRef="${cp(body)}"><hp:t/></hp:run>`));
  }

  const W = colW + 2 * 4000;
  const secPr = `<hp:run charPrIDRef="0"><hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:pagePr landscape="WIDELY" width="${W}" height="${Math.round(layout.pageSize.height * HU)}" gutterType="LEFT_ONLY"><hp:margin header="0" footer="0" gutter="0" left="4000" right="4000" top="4000" bottom="4000"/></hp:pagePr></hp:secPr><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl><hp:t/></hp:run>`;
  const section = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hs:sec ${NS}><hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${secPr}</hp:p>${out.join("")}</hs:sec>`;

  const fontfaces = `<hh:fontfaces itemCnt="7">${LANGS.map((l) => `<hh:fontface lang="${l}" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface>`).join("")}</hh:fontfaces>`;
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hh:head ${NS} version="1.2" secCnt="1"><hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList>${fontfaces}<hh:borderFills itemCnt="${borders.items.length}">${borders.items.join("")}</hh:borderFills><hh:charProperties itemCnt="${chars.items.length}">${chars.items.join("")}</hh:charProperties><hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties><hh:numberings itemCnt="1"><hh:numbering id="1" start="0"><hh:paraHead start="1" level="1" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0">^1.</hh:paraHead></hh:numbering></hh:numberings><hh:paraProperties itemCnt="${paras.items.length}">${paras.items.join("")}</hh:paraProperties><hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles></hh:refList></hh:head>`;
  const hpf = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><opf:package ${NS} version="" unique-identifier="" id=""><opf:metadata/><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>${manifest.join("")}</opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`;
  const all = new Map<string, Uint8Array>([
    ["mimetype", strToU8("application/hwp+zip")],
    ["Contents/header.xml", strToU8(header)],
    ["Contents/section0.xml", strToU8(section)],
    ["Contents/content.hpf", strToU8(hpf)],
    ...files,
  ]);
  const notes: string[] = [];
  notes.push(`PDF에서 ${layout.questions.length}문항을 읽었습니다(그림 ${figures}개는 잘라 넣고, 분수 ${equations}개는 수식으로 입력).`);
  if (unknownGlyphs) notes.push(`글자로 읽지 못한 기호 ${unknownGlyphs}곳(그리스 문자 등)은 원본 모양 그대로 작은 그림으로 넣었습니다. 한글에서 글자로 바꿔 주세요.`);
  return { bytes: zip(all), numbers, notes: [...layout.notes, ...notes], columnWidthHU: colW };
}
