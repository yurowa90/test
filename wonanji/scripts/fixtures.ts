// 테스트용 합성 HWPX(실제 시험 문항은 저장소에 넣지 않습니다).
import { strToU8 } from "fflate";
import { zip } from "../src/engine/zip";

const NS =
  'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:opf="http://www.idpf.org/2007/opf/"';
const LANGS = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"];

function fontfaces(faces: string[]) {
  return `<hh:fontfaces itemCnt="7">${LANGS.map(
    (l) => `<hh:fontface lang="${l}" fontCnt="${faces.length}">${faces.map((f, i) => `<hh:font id="${i}" face="${f}" type="TTF" isEmbedded="0"/>`).join("")}</hh:fontface>`,
  ).join("")}</hh:fontfaces>`;
}

function charPr(id: number, o: { h?: number; font?: number; bold?: boolean; ul?: boolean; shade?: string; spacing?: number }) {
  const f = o.font ?? 0;
  const ref = `hangul="${f}" latin="${f}" hanja="${f}" japanese="${f}" other="${f}" symbol="${f}" user="${f}"`;
  const sp = o.spacing ?? 0;
  return `<hh:charPr id="${id}" height="${o.h ?? 1100}" textColor="#000000" shadeColor="${o.shade ?? "none"}" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"><hh:fontRef ${ref}/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="${sp}" latin="${sp}" hanja="${sp}" japanese="${sp}" other="${sp}" symbol="${sp}" user="${sp}"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${o.bold ? "<hh:bold/>" : ""}<hh:underline type="${o.ul ? "BOTTOM" : "NONE"}" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/></hh:charPr>`;
}

function paraPr(id: number, o: { align?: string; outline?: boolean; level?: number; ls?: number; intent?: number; left?: number; next?: number }) {
  const m = (k: number) =>
    `<hh:margin><hc:intent value="${(o.intent ?? 0) * k}" unit="HWPUNIT"/><hc:left value="${(o.left ?? 0) * k}" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="${(o.next ?? 0) * k}" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="${o.ls ?? 160}" unit="HWPUNIT"/>`;
  return `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="0" suppressLineNumbers="0" checked="0"><hh:align horizontal="${o.align ?? "JUSTIFY"}" vertical="BASELINE"/><hh:heading type="${o.outline ? "OUTLINE" : "NONE"}" idRef="0" level="${o.level ?? 0}"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/><hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${m(1)}</hp:case><hp:default>${m(2)}</hp:default></hp:switch><hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>`;
}

const BORDER = (id: number, line: string) =>
  `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="${line}" width="0.12 mm" color="#000000"/><hh:rightBorder type="${line}" width="0.12 mm" color="#000000"/><hh:topBorder type="${line}" width="0.12 mm" color="#000000"/><hh:bottomBorder type="${line}" width="0.12 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>`;

/**
 * 글자 모양: 0 본문(11pt), 1 번호(12pt 굵게), 2 다른 글꼴 10pt·자간 -5, 3 형광 정답, 4 굵게+밑줄
 * 문단 모양: 0 본문, 1 개요 번호(문항 머리), 2 오른쪽 정렬, 3 왼쪽 130%·아래 간격, 4 내어쓰기, 5 개요 2수준,
 *           6 가운데(상자 이름표), 7 워드식 내어쓰기(left 1500 + intent -1500: 한글에서는 두 배로 들여써짐)
 */
function header(faces: string[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hh:head ${NS} version="1.2" secCnt="1"><hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList>${fontfaces(faces)}<hh:borderFills itemCnt="2">${BORDER(1, "NONE")}${BORDER(2, "SOLID")}</hh:borderFills><hh:charProperties itemCnt="5">${charPr(0, {})}${charPr(1, { h: 1200, bold: true })}${charPr(2, { h: 1000, font: 1, spacing: -5 })}${charPr(3, { shade: "#FFFF00" })}${charPr(4, { bold: true, ul: true })}</hh:charProperties><hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties><hh:numberings itemCnt="1"><hh:numbering id="1" start="0"><hh:paraHead start="1" level="1" align="LEFT" useInstWidth="0" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="1" checkable="0">^1.</hh:paraHead></hh:numbering></hh:numberings><hh:paraProperties itemCnt="8">${paraPr(0, {})}${paraPr(1, { outline: true })}${paraPr(2, { align: "RIGHT" })}${paraPr(3, { align: "LEFT", ls: 130, next: 800 })}${paraPr(4, { intent: -1500 })}${paraPr(5, { outline: true, level: 1 })}${paraPr(6, { align: "CENTER" })}${paraPr(7, { intent: -1500, left: 1500 })}</hh:paraProperties><hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles></hh:refList></hh:head>`;
}

type Run = [cp: number, text: string];
/** bogi: 〈보기〉 상자. grid = 이름표 칸(1행) + 항목 칸(2행), cell = 한 칸에 이름표 문단과 항목 문단(PDF·사진에서 만든 상자 모양) */
export type Para = { pp?: number; runs?: Run[]; text?: string; cp?: number; table?: string[]; tableWidth?: number; bogi?: { label: string; items: string[]; style: "grid" | "cell"; cp?: number; shape?: boolean } };

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tText(s: string) {
  return esc(s).replace(/\t/g, '<hp:tab width="4000" leader="0" type="1"/>');
}

let pid = 1;
function para(p: Para): string {
  const runs: Run[] = p.runs ?? [[p.cp ?? 0, p.text ?? ""]];
  let body = runs.map(([cp, t]) => `<hp:run charPrIDRef="${cp}"><hp:t>${tText(t)}</hp:t></hp:run>`).join("");
  if (p.table) {
    const tw = p.tableWidth ?? 28000;
    const cells = p.table
      .map(
        (t, i) =>
          `<hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${para({ pp: 3, text: t, cp: 2 })}</hp:subList><hp:cellAddr colAddr="0" rowAddr="${i}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${tw}" height="1800"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc></hp:tr>`,
      )
      .join("");
    body += `<hp:run charPrIDRef="0"><hp:tbl id="${900 + pid}" zOrder="1" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${p.table.length}" colCnt="1" cellSpacing="0" borderFillIDRef="2" noAdjust="0"><hp:sz width="${tw}" widthRelTo="ABSOLUTE" height="${1800 * p.table.length}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>${cells}</hp:tbl></hp:run>`;
  }
  if (p.bogi) {
    const tw = p.tableWidth ?? 28000;
    const tc = (inner: string, row: number, h: number) =>
      `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${inner}</hp:subList><hp:cellAddr colAddr="0" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${tw}" height="${h}"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`;
    const labelP = para({ pp: 6, text: p.bogi.label });
    const RECT = `<hp:rect id="${800 + pid}" zOrder="2" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${850 + pid}" ratio="0"><hp:offset x="0" y="0"/><hp:orgSz width="3000" height="1500"/><hp:curSz width="3000" height="1500"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="1500" centerY="750" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hp:lineShape color="#000000" width="12" style="SOLID" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="1" tailfill="1" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/><hp:sz width="3000" widthRelTo="ABSOLUTE" height="1500" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>사각형</hp:shapeComment><hc:pt0 x="0" y="0"/><hc:pt1 x="3000" y="0"/><hc:pt2 x="3000" y="1500"/><hc:pt3 x="0" y="1500"/></hp:rect>`;
    const shapeP = p.bogi.shape ? `<hp:p id="${pid++}" paraPrIDRef="6" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${RECT}<hp:t/></hp:run></hp:p>` : "";
    const itemPs = p.bogi.items.map((t) => para({ pp: p.bogi!.style === "cell" ? 7 : 4, text: t, cp: p.bogi!.cp })).join("") + shapeP;
    const rows = p.bogi.style === "grid" ? `<hp:tr>${tc(labelP, 0, 1800)}</hp:tr><hp:tr>${tc(itemPs, 1, 5400)}</hp:tr>` : `<hp:tr>${tc(labelP + itemPs, 0, 7200)}</hp:tr>`;
    body += `<hp:run charPrIDRef="0"><hp:tbl id="${900 + pid}" zOrder="1" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${p.bogi.style === "grid" ? 2 : 1}" colCnt="1" cellSpacing="0" borderFillIDRef="2" noAdjust="0"><hp:sz width="${tw}" widthRelTo="ABSOLUTE" height="7200" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="284" bottom="284"/><hp:inMargin left="141" right="141" top="141" bottom="141"/>${rows}</hp:tbl></hp:run>`;
  }
  return `<hp:p id="${pid++}" paraPrIDRef="${p.pp ?? 0}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${body}</hp:p>`;
}

const SEC_PR = `<hp:run charPrIDRef="0"><hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:pagePr landscape="WIDELY" width="72852" height="103180" gutterType="LEFT_ONLY"><hp:margin header="0" footer="2267" gutter="0" left="5669" right="5669" top="7086" bottom="4535"/></hp:pagePr></hp:secPr><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="2" sameSz="1" sameGap="1416"/></hp:ctrl><hp:t/></hp:run>`;

/**
 * opts.mergeFirst: 학력평가·수능 문제지처럼 구역 정의(secPr)를 첫 문단(1번 문항 발문)에 함께 둡니다.
 */
export function makeHwpx(paras: Para[], faces = ["신명 중명조", "휴먼명조"], opts: { mergeFirst?: boolean } = {}): Uint8Array {
  pid = 1;
  let body: string;
  if (opts.mergeFirst && paras.length) {
    const firstXml = para(paras[0]).replace(/(<hp:p [^>]*>)/, `$1${SEC_PR}`);
    body = firstXml + paras.slice(1).map(para).join("");
  } else {
    body = `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${SEC_PR}</hp:p>` + paras.map(para).join("");
  }
  const section = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hs:sec ${NS}>${body}</hs:sec>`;
  const hpf = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><opf:package ${NS} version="" unique-identifier="" id=""><opf:metadata/><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/></opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`;
  const files = new Map<string, Uint8Array>([
    ["mimetype", strToU8("application/hwp+zip")],
    ["Contents/header.xml", strToU8(header(faces))],
    ["Contents/section0.xml", strToU8(section)],
    ["Contents/content.hpf", strToU8(hpf)],
  ]);
  return zip(files);
}

export const TEMPLATE: Para[] = [
  { table: ["출제 교사 000 (인)", "2026학년도 제1학기 2차 정기시험"] },
  { text: "※ 유의사항 ※ (유의사항의 내용은 삭제 요망)" },
  { text: "◦글씨체 : 신명 중명조" },
  { text: "◦포인트 : 11p [문항번호(논술형 포함): 12p, 진하게]" },
  { text: "◦줄간격 : 160" },
  { text: "◦부정어 : 밑줄, 진하게" },
  { text: "◦배점: 소수점으로 입력(4점일 경우 4.0점으로 입력)" },
  { text: "" },
  { pp: 1, text: "다음 중 예시 문항으로 옳은 것은? [3.0점]" },
  { text: " ① 가\t\t② 나\t\t③ 다" },
  { text: " ④ 라\t\t⑤ 마" },
  { text: "" },
  { text: "" },
  { pp: 1, runs: [[0, "다음 중 예시로 옳지 "], [4, "않은"], [0, " 것은?"]] },
  { pp: 2, text: "[4.0점]" },
  { pp: 4, text: "① 첫째 예시 선지" },
  { pp: 4, text: "② 둘째 예시 선지" },
  { pp: 4, text: "③ 셋째 예시 선지" },
  { pp: 4, text: "④ 넷째 예시 선지" },
  { pp: 4, text: "⑤ 다섯째 예시 선지" },
  { text: "" },
  { cp: 1, text: "다음 문항부터는 논술형 문항입니다." },
  { cp: 1, text: "→ 위 멘트는 교과목 특성에 맞게 변형 가능" },
  { text: "" },
  { cp: 1, text: "【문항1-논술형】" },
  { text: "                .....시오. [ 점]" },
  { text: "" },
  { text: "" },
  { table: ["* 확인 사항 답안지의 해당란에 필요한 내용을 정확히 기입했는지 확인하시오."] },
];

/** 선생님 1: 1·3번 출제, 2번은 빈 자리. 3번은 다른 글꼴·130% 줄간격·배점 (3점). */
export const TEACHER1: Para[] = [
  { table: ["출제 교사 김선생 (인)", "( 통합과학 ) 과목"] },
  { pp: 1, text: "지구 역사에서 생물이 처음 등장한 시기는? [2.5점]" },
  { runs: [[0, " "], [3, "①"], [0, " 선캄브리아기      ② 고생대          ③ 중생대  "]] },
  { text: " ④ 신생대            ⑤ 빙하기" },
  { text: "" },
  { pp: 1, text: " " },
  { pp: 1, runs: [[2, "  다음 중 광합성에 대한 설명으로 옳지 않은 것은? (3점)"]] },
  { pp: 3, cp: 2, text: "" },
  { pp: 3, runs: [[2, "① 빛에너지를 화학 에너지로 전환한다."]] },
  { pp: 3, runs: [[2, "② 엽록체에서 일어난다."]] },
  { pp: 3, runs: [[2, "③ 이산화 탄소를 흡수한다."]] },
  { pp: 3, runs: [[2, "④ 산소를 방출한다."]] },
  { pp: 3, runs: [[3, "⑤ 동물 세포에서만 일어난다."]] },
  { text: "" },
  { text: "" },
  { table: ["* 확인 사항 답안지의 해당란에 필요한 내용을 정확히 기입했는지 확인하시오."] },
];

/** 선생님 2: 1번 빈 자리, 2번 출제(〈보기〉 상자), 논술형 2번. */
export const TEACHER2: Para[] = [
  { table: ["출제 교사 이선생 (인)", "( 통합과학 ) 과목"] },
  { pp: 1, text: "" },
  { pp: 1, text: "다음은 에너지에 대한 설명이다. 이에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은? [4점]" },
  { table: ["〈 보 기 〉", "ㄱ. 빛은 에너지이다.", "ㄴ. 열은 에너지이다.", "ㄷ. 소리는 에너지이다."] },
  { runs: [[0, "① ㄱ\t② ㄷ\t"], [3, "③"], [0, " ㄱ, ㄴ\t④ ㄴ, ㄷ\t⑤ ㄱ, ㄴ, ㄷ"]] },
  { text: "" },
  { cp: 1, text: "다음 문항부터는 논술형 문항입니다." },
  { cp: 1, text: "【문항2-논술형】 [6.0점]" },
  { text: "광합성과 세포 호흡의 관계를 에너지 전환과 관련지어 서술하시오." },
];

/**
 * 학력평가형 양식: 첫 문단에 구역 정의 + 1번 발문, 번호 모양 뒤 공백 없이 발문을 공백으로 시작,
 * 2점 문항은 배점 표기 없음·3점 문항만 [3점], 〈보기〉 표시는 "보 기", 〈보기〉 상자 폭 26000.
 */
const HP_Q = (stem: string, score?: string): Para[] => [
  { pp: 1, text: ` ${stem}${score ? " " + score : ""}` },
  { table: ["보 기", "ㄱ. 가는 나이다.", "ㄴ. 다는 라이다."], tableWidth: 26000 },
  { text: "① ㄱ\t② ㄴ\t③ ㄱ, ㄴ\t④ ㄴ, ㄷ\t⑤ ㄱ, ㄴ, ㄷ" },
];
export const HAKPYEONG: Para[] = [
  ...HP_Q("그림은 어느 지역의 지층이다. 이에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?"),
  { text: "" },
  ...HP_Q("표는 암석의 특징이다. 이에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?", "[3점]"),
  ...HP_Q("그림은 해수의 순환이다. 이에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?"),
  { text: "" },
  ...HP_Q("그래프는 기온 변화이다. 이에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?", "[3점]"),
  { text: "" },
  { text: "" },
  { table: ["※ 확인 사항 답안지의 해당란에 필요한 내용을 정확히 기입(표기)했는지 확인하시오."] },
];

/** 개요 2수준으로 번호를 단 출제 파일 + 〈보기〉 상자가 단보다 넓음(34000) + 〈보기〉 표시 "< 보 기 >" */
export const LEVEL2: Para[] = [
  { pp: 5, text: "다음은 세포에 대한 설명이다. 이에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은? [3점]" },
  { table: ["< 보 기 >", "ㄱ. 핵이 있다.", "ㄴ. 막이 있다."], tableWidth: 34000 },
  { runs: [[0, "① ㄱ\t"], [3, "②"], [0, " ㄴ\t③ ㄱ, ㄴ\t④ ㄴ, ㄷ\t⑤ ㄱ, ㄴ, ㄷ"]] },
  { pp: 5, text: "생물의 특성으로 옳은 것은? [2점]" },
  { runs: [[3, "①"], [0, " 물질대사\t② 항상성\t③ 발생\t④ 생식\t⑤ 적응"]] },
];

/** 번호가 전혀 없는 출제 파일: 선지 ⑤ 다음 문단이 새 문항 */
export const UNNUMBERED: Para[] = [
  { table: ["출제 교사 박선생 (인)", "( 통합과학 ) 과목"] },
  { text: "다음 중 광물에 대한 설명으로 옳은 것은? [3점]" },
  { runs: [[3, "①"], [0, " 가\t② 나\t③ 다\t④ 라\t⑤ 마"]] },
  { text: "다음 중 암석의 순환으로 옳은 것은? [3점]" },
  { runs: [[0, "① 가\t"], [3, "②"], [0, " 나\t③ 다\t④ 라\t⑤ 마"]] },
];

/** 번호를 글자로 직접 쓰는 양식 */
export const LITERAL_TEMPLATE: Para[] = [
  { table: ["출제 교사 000 (인)", "2026학년도 제1학기 2차 정기시험"] },
  { text: "1. 다음 중 예시 문항으로 옳은 것은? [3.0점]" },
  { text: " ① 가\t\t② 나\t\t③ 다" },
  { text: " ④ 라\t\t⑤ 마" },
  { text: "" },
  { text: "2. 다음 중 예시로 옳지 않은 것은? [4.0점]" },
  { text: " ① 가\t\t② 나\t\t③ 다" },
  { text: " ④ 라\t\t⑤ 마" },
];

/** 〈보기〉 예시 상자(이름표 칸 + 항목 칸)가 있는 양식 */
export const BOX_TEMPLATE: Para[] = [
  ...TEMPLATE.slice(0, 11),
  { text: "" },
  { pp: 1, text: "다음 설명 중 옳은 것만을 〈보기〉에서 고른 것은? [3.0점]" },
  { bogi: { label: "〈 보 기 〉", items: ["ㄱ. 예시 항목 하나이다.", "ㄴ. 예시 항목 둘이다."], style: "grid" }, tableWidth: 29000 },
  { text: "" },
  { text: " ① ㄱ\t\t② ㄴ\t\t③ ㄱ, ㄴ" },
  ...TEMPLATE.slice(11),
];

/** PDF·사진에서 만든 것 같은 1칸 상자(이름표가 칸 안, 워드식 내어쓰기)를 쓴 문항 파일 */
export const BOX_SOURCE: Para[] = [
  { table: ["출제 교사 최선생 (인)", "( 통합과학 ) 과목"] },
  { pp: 1, text: "다음 중 세포에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은? [3.0점]" },
  { pp: 6, bogi: { label: "< 보 기 >", items: ["ㄱ. 핵이 있다.", "ㄴ. 막이 있다.", "ㄷ. 리보솜이 있다."], style: "cell" }, tableWidth: 30000 },
  { text: "" },
  { runs: [[0, " ① ㄱ\t\t② ㄴ\t\t"], [3, "③ ㄱ, ㄷ"]] },
  { text: "" },
  { pp: 1, text: "다음 중 옳은 것은? [2.0점]" },
  { runs: [[0, " "], [3, "①"], [0, " 가\t\t② 나\t\t③ 다"]] },
  { text: "" },
  { table: ["* 확인 사항 답안지의 해당란에 필요한 내용을 정확히 기입했는지 확인하시오."] },
];

/** 10pt 다른 글꼴 항목 + 빈 문단 + 도형이 든 1칸 상자(그림 표로 취급되는 경우): 글은 본문 크기로, 빈 문단은 원본 크기 유지 */
export const BOX_SOURCE_FIGURE: Para[] = [
  { table: ["출제 교사 정선생 (인)", "( 통합과학 ) 과목"] },
  { pp: 1, text: "다음 중 옳은 것만을 <보기>에서 고른 것은? [3.0점]" },
  { pp: 6, bogi: { label: "< 보 기 >", items: ["ㄱ. 작은 글자 항목이다.", "", "ㄴ. 둘째 항목이다."], style: "cell", cp: 2, shape: true }, tableWidth: 30000 },
  { text: "" },
  { runs: [[0, " "], [3, "①"], [0, " ㄱ\t\t② ㄴ\t\t③ ㄱ, ㄴ"]] },
  { text: "" },
  { table: ["* 확인 사항 답안지의 해당란에 필요한 내용을 정확히 기입했는지 확인하시오."] },
];
