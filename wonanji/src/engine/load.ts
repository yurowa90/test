// 파일 한 개를 읽어 rhwp 방언의 HWPX 패키지로 만들고, 형광펜(정답 표시)을 되살립니다.
import { descendants } from "./dom";
import { readHwp5Marks, type ParaMarks } from "./hwp5";
import { HwpxPackage } from "./pkg";
import { toHwpx, type LossReport } from "./rhwp";
import { itemsOf, restyle, textOf, visibleItems } from "./text";
import { sniffFormat } from "./zip";

export interface LoadedDoc {
  name: string;
  format: "hwp" | "hwpx";
  bytes: Uint8Array;
  pkg: HwpxPackage;
  loss: LossReport;
  pages: number;
  highlights: number;
  notes: string[];
}

/** 구역 안의 모든 문단(표·글상자·머리말 안 포함)을 전위 순서로. */
export function allParagraphs(section: Document): Element[] {
  return descendants(section.documentElement, "p");
}

/** 원본 HWPX(한글 저장본)의 형광펜 시작/끝 표지를 문단별 색 배열로 읽습니다. */
function readHwpxMarks(bytes: Uint8Array): ParaMarks[][] {
  const pkg = HwpxPackage.fromBytes(bytes);
  return pkg.sections.map((sec) =>
    allParagraphs(sec).map((p) => {
      const items = itemsOf(p);
      const color: (string | null)[] = [];
      const seq: string[] = [];
      let cur: string | null = null;
      for (const it of items) {
        if (it.kind === "mark") {
          const n = (it.node as Element).localName;
          if (n === "markpenBegin") cur = (it.node as Element).getAttribute("color") ?? "#FFFF00";
          else if (n === "markpenEnd") cur = null;
          continue;
        }
        if (it.kind === "obj") continue;
        seq.push(it.ch);
        color.push(cur);
      }
      return { seq: seq.join(""), color };
    }),
  );
}

/** 표지 색 배열을 rhwp HWPX 문단에 음영 수정자로 입힙니다. 반환: 입힌 글자 수, 맞추지 못한 문단 수 */
function applyMarks(pkg: HwpxPackage, marks: ParaMarks[][]): { applied: number; missed: number } {
  let applied = 0;
  let missed = 0;
  pkg.sections.forEach((sec, s) => {
    const paras = allParagraphs(sec);
    const seqs = paras.map((p) => textOf(visibleItems(itemsOf(p))));
    const list = marks[s] ?? [];
    let j = 0;
    for (const mp of list) {
      let found = -1;
      for (let k = j; k < Math.min(paras.length, j + 12); k++) {
        if (seqs[k] === mp.seq) {
          found = k;
          break;
        }
      }
      if (found < 0) {
        if (mp.color.some(Boolean)) missed++;
        continue;
      }
      j = found + 1;
      if (!mp.color.some(Boolean)) continue;
      const p = paras[found];
      const items = itemsOf(p);
      const visIdx = new Map<number, number>();
      let v = 0;
      items.forEach((it, i) => {
        if (it.kind !== "obj" && it.kind !== "mark") visIdx.set(i, v++);
      });
      restyle(p, (_it, i) => {
        const vi = visIdx.get(i);
        const c = vi == null ? null : mp.color[vi];
        if (c) applied++;
        return c ? "shade=" + c : null;
      });
    }
  });
  return { applied, missed };
}

export async function loadDocument(name: string, bytes: Uint8Array): Promise<LoadedDoc> {
  const format = sniffFormat(bytes);
  if (format === "unknown") throw new Error(`${name}: HWP/HWPX 파일이 아닙니다.`);
  const notes: string[] = [];
  let marks: ParaMarks[][] = [];
  try {
    if (format === "hwp") {
      const info = readHwp5Marks(bytes);
      if (info.encrypted) throw new Error(`${name}: 암호가 걸린 문서입니다. 한글에서 암호를 해제한 뒤 올려 주세요.`);
      if (info.distribution) throw new Error(`${name}: 배포용 문서는 읽을 수 없습니다.`);
      marks = info.sections;
    } else {
      marks = readHwpxMarks(bytes);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith(name)) throw e;
    notes.push("형광펜 표시를 읽지 못했습니다. 정답 표시는 결과에서 다시 확인해 주세요.");
  }
  const { hwpx, loss, pages } = await toHwpx(bytes);
  const pkg = HwpxPackage.fromBytes(hwpx);
  let highlights = 0;
  if (marks.some((s) => s.some((p) => p.color.some(Boolean)))) {
    const r = applyMarks(pkg, marks);
    highlights = r.applied;
    if (r.missed) notes.push(`형광펜 표시 ${r.missed}곳의 위치를 맞추지 못했습니다(정답 표시 확인 필요).`);
  }
  return { name, format, bytes, pkg, loss, pages, highlights, notes };
}
