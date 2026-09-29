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

function paraPr(id: number, o: { align?: string; outline?: boolean; ls?: number; intent?: number; left?: number; next?: number }) {
  const m = (k: number) =>
    `<hh:margin><hc:intent value="${(o.intent ?? 0) * k}" unit="HWPUNIT"/><hc:left value="${(o.left ?? 0) * k}" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="${(o.next ?? 0) * k}" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="${o.ls ?? 160}" unit="HWPUNIT"/>`;
  return `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="0" suppressLineNumbers="0" checked="0"><hh:align horizontal="${o.align ?? "JUSTIFY"}" vertical="BASELINE"/><hh:heading type="${o.outline ? "OUTLINE" : "NONE"}" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/><hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${m(1)}</hp:case><hp:default>${m(2)}</hp:default></hp:switch><hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>`;
}

const BORDER = (id: number, line: string) =>
  `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="${line}" width="0.12 mm" color="#000000"/><hh:rightBorder type="${line}" width="0.12 mm" color="#000000"/><hh:topBorder type="${line}" width="0.12 mm" color="#000000"/><hh:bottomBorder type="${line}" width="0.12 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>`;

/**
 * 글자 모양: 0 본문(11pt), 1 번호(12pt 굵게), 2 다른 글꼴 10pt·자간 -5, 3 형광 정답, 4 굵게+밑줄
 * 문단 모양: 0 본문, 1 개요 번호(문항 머리), 2 오른쪽 정렬, 3 왼쪽 130%·아래 간격, 4 내어쓰기
 */
function header(faces: string[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hh:head ${NS} version="1.2" secCnt="1"><hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList>${fontfaces(faces)}<hh:borderFills itemCnt="2">${BORDER(1, "NONE")}${BORDER(2, "SOLID")}</hh:borderFills><hh:charProperties itemCnt="5">${charPr(0, {})}${charPr(1, { h: 1200, bold: true })}${charPr(2, { h: 1000, font: 1, spacing: -5 })}${charPr(3, { shade: "#FFFF00" })}${charPr(4, { bold: true, ul: true })}</hh:charProperties><hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties><hh:numberings itemCnt="1"><hh:numbering id="1" start="0"><hh:paraHead start="1" level="1" align="LEFT" useInstWidth="0" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="1" checkable="0">^1.</hh:paraHead></hh:numbering></hh:numberings><hh:paraProperties itemCnt="5">${paraPr(0, {})}${paraPr(1, { outline: true })}${paraPr(2, { align: "RIGHT" })}${paraPr(3, { align: "LEFT", ls: 130, next: 800 })}${paraPr(4, { intent: -1500 })}</hh:paraProperties><hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles></hh:refList></hh:head>`;
}

type Run = [cp: number, text: string];
export type Para = { pp?: number; runs?: Run[]; text?: string; cp?: number; table?: string[] };

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
    const cells = p.table
      .map(
        (t, i) =>
          `<hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${para({ pp: 3, text: t, cp: 2 })}</hp:subList><hp:cellAddr colAddr="0" rowAddr="${i}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="28000" height="1800"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc></hp:tr>`,
      )
      .join("");
    body += `<hp:run charPrIDRef="0"><hp:tbl id="${900 + pid}" zOrder="1" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${p.table.length}" colCnt="1" cellSpacing="0" borderFillIDRef="2" noAdjust="0"><hp:sz width="28000" widthRelTo="ABSOLUTE" height="${1800 * p.table.length}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>${cells}</hp:tbl></hp:run>`;
  }
  return `<hp:p id="${pid++}" paraPrIDRef="${p.pp ?? 0}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${body}</hp:p>`;
}

const SEC_PR = `<hp:run charPrIDRef="0"><hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:pagePr landscape="WIDELY" width="72852" height="103180" gutterType="LEFT_ONLY"><hp:margin header="0" footer="2267" gutter="0" left="5669" right="5669" top="7086" bottom="4535"/></hp:pagePr></hp:secPr><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="2" sameSz="1" sameGap="1416"/></hp:ctrl><hp:t/></hp:run>`;

export function makeHwpx(paras: Para[], faces = ["신명 중명조", "휴먼명조"]): Uint8Array {
  pid = 1;
  const first = `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${SEC_PR}</hp:p>`;
  const section = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hs:sec ${NS}>${first}${paras.map(para).join("")}</hs:sec>`;
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
