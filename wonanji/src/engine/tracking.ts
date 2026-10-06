// 고아 줄 줄이기(자간 트래킹): 문단의 마지막 줄에 두세 글자만 남으면 그 문단의 자간을 조금 줄여 앞 줄로 끌어올립니다.
// 줄 배치는 rhwp(미리보기 엔진)의 줄 나눔으로 어림합니다. 한글의 글꼴 폭과 조금 다를 수 있으므로
// −3%·−6% 두 단계만 시도하고, 효과가 없으면 되돌립니다. 글자·기호는 바꾸지 않고 글자 모양(자간)만 바꿉니다.
import { serializeVariants, type AssembleResult } from "./assemble";
import { kids } from "./dom";
import { HeaderIndex } from "./header";
import { deepText } from "./text";
import type { Change, FormatSpec } from "./types";

const LANGS = ["hangul", "latin", "hanja", "japanese", "other", "symbol", "user"];
/** 시도할 자간(%) 단계 */
const STEPS = [-3, -6];
/** 마지막 줄에 남은 글자(문장 부호 제외)가 이 수 이하이면 고아 줄 */
const ORPHAN_MAX = 3;

export interface TrackingResult {
  changes: Change[];
}

/**
 * rhwp는 글자 단위로 줄을 나누지만, 결과 문단은 어절 단위 줄바꿈(KEEP_WORD)이므로 한글은 어절을 통째로 다음 줄로 내립니다.
 * 글자 단위 줄 길이를 줄 용량으로 보고 어절을 다시 채워, 한글이 만들 줄을 어림합니다.
 */
function wordLines(text: string, starts: number[]): string[] {
  const caps: number[] = [];
  for (let k = 0; k + 1 < starts.length; k++) caps.push(Math.max(1, starts[k + 1] - starts[k]));
  const full = caps.length ? Math.max(...caps) : text.length;
  const tokens = text.match(/\S+\s*/g) ?? [];
  const lines: string[] = [];
  let cur = "";
  for (const tok of tokens) {
    const cap = caps[lines.length] ?? full;
    if (cur && cur.length + tok.trimEnd().length > cap) {
      lines.push(cur.trimEnd());
      cur = "";
    }
    cur += tok;
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines;
}

/** 마지막 줄이 고아 줄이면 그 줄의 글, 아니면 null */
function orphanTail(p: Element, starts: number[]): string | null {
  if (starts.length < 2) return null;
  const lines = wordLines(deepText(p), starts);
  if (lines.length < 2) return null;
  const tail = lines[lines.length - 1].trim();
  const visible = tail.replace(/[\s.,!?:;)\]〉」』…·"'’”]/g, "");
  return visible.length > 0 && visible.length <= ORPHAN_MAX ? tail : null;
}

export async function tightenOrphans(res: AssembleResult, spec: FormatSpec, measure: (hwpx: Uint8Array) => Promise<number[][]>): Promise<TrackingResult> {
  const changes: Change[] = [];
  if (!spec.tracking) return { changes };
  const tops = kids(res.root).filter((e) => e.localName === "p");
  // 대상: 문항 문단 가운데 글자만 있고(개체·탭 없음), 미리보기가 줄 배치를 새로 계산하는 문단. 선지 줄(①~⑤)은 제외.
  const eligible = (p: Element) => {
    if (!res.owners.has(p) || !res.fresh.has(p)) return false;
    const runs = kids(p).filter((r) => r.localName === "run");
    if (runs.some((r) => kids(r).some((c) => c.localName !== "t"))) return false;
    const t = deepText(p);
    return t.length >= 8 && !/[\t①-⑳]/.test(t);
  };
  const index = new HeaderIndex(res.pkg);
  const derived = new Map<string, string>();
  const spaced = (id: string, delta: number) => {
    const key = `${id}|${delta}`;
    const hit = derived.get(key);
    if (hit) return hit;
    const src = index.charPr(id);
    if (!src) return id;
    const c = src.cloneNode(true) as Element;
    const sp = kids(c).find((x) => x.localName === "spacing");
    if (sp) for (const lang of LANGS) sp.setAttribute(lang, String(Math.max(-50, Math.min(50, Number(sp.getAttribute(lang) ?? 0) + delta))));
    const nid = res.header.add("charProperties", c);
    derived.set(key, nid);
    return nid;
  };
  const original = new Map<Element, string[]>();
  const apply = (p: Element, delta: number) => {
    const runs = kids(p).filter((r) => r.localName === "run");
    if (!original.has(p)) original.set(p, runs.map((r) => r.getAttribute("charPrIDRef") ?? "0"));
    const orig = original.get(p)!;
    runs.forEach((r, i) => r.setAttribute("charPrIDRef", delta === 0 ? orig[i] : spaced(orig[i], delta)));
  };
  const reserialize = () => {
    res.header.finalize();
    Object.assign(res, serializeVariants(res.pkg, res.root));
  };
  let segs = await measure(res.forPreview);
  if (segs.length !== tops.length) return { changes };
  let candidates = tops.map((p, i) => ({ p, i, tail: eligible(p) ? orphanTail(p, segs[i]) : null })).filter((c) => c.tail);
  if (!candidates.length) return { changes };
  const tailOf = new Map(candidates.map((c) => [c.p, c.tail!]));
  const level = new Map<Element, number>();
  for (const step of STEPS) {
    for (const c of candidates) {
      level.set(c.p, step);
      apply(c.p, step);
    }
    reserialize();
    segs = await measure(res.forPreview);
    if (segs.length !== tops.length) break;
    candidates = candidates.filter((c) => orphanTail(c.p, segs[c.i]));
    if (!candidates.length) break;
  }
  // 두 단계로도 줄지 않으면 되돌립니다(자간만 좁아지고 효과가 없으므로).
  for (const c of candidates) {
    apply(c.p, 0);
    level.delete(c.p);
  }
  if (candidates.length) reserialize();
  for (const [p, d] of level) {
    changes.push({ questionId: res.owners.get(p) ?? null, kind: "자간 트래킹", detail: `자간 ${d}%: 마지막 줄에 홀로 남던 ‘${tailOf.get(p)}’을(를) 앞 줄로` });
  }
  return { changes };
}
