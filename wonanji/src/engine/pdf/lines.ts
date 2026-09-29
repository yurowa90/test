// PDF 글자 조각을 글줄·문단으로 묶습니다(아래·위 첨자, 밑줄, 분수 포함).
import type { PSeg, PText } from "./extract";

export interface Run {
  text: string;
  sub?: boolean;
  sup?: boolean;
  underline?: boolean;
  /** 인식이 불확실한 글자(빨간색) */
  unsure?: boolean;
  /** 한글 수식 스크립트(분수 등). 있으면 text 대신 수식 개체로 넣습니다. */
  eq?: string;
  /** 글자로 읽지 못한 기호: 그 자리를 잘라 넣을 그림 영역 */
  crop?: { page: number; box: Box };
}

export interface Glyph {
  ch: string;
  x: number;
  w: number;
  y: number;
  size: number;
  sub?: boolean;
  sup?: boolean;
  ul?: boolean;
  unsure?: boolean;
  eq?: string;
  crop?: { page: number; box: Box };
}

export interface Line {
  glyphs: Glyph[];
  y: number;
  x0: number;
  x1: number;
  size: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const inside = (b: Box, x: number, y: number, pad = 0) => x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad;

function charEm(ch: string): number {
  if (ch === " " || ch === " ") return 0.3;
  if (/[.,:;'"`!|]/.test(ch)) return 0.3;
  if (/[()[\]{}]/.test(ch)) return 0.35;
  const c = ch.codePointAt(0) ?? 0;
  if (c < 0x80) return /[A-Z]/.test(ch) ? 0.7 : /[0-9]/.test(ch) ? 0.55 : 0.5;
  return 1;
}

/** 글자 조각을 글자 단위로 나누고 폭을 비례 배분합니다. */
export function toGlyphs(t: PText): Glyph[] {
  if (t.unknown) {
    return [{ ch: "\uFFFC", x: t.x, w: t.w, y: t.y, size: t.size, crop: { page: t.page, box: { x0: t.x - 0.5, y0: t.y - t.size * 0.9, x1: t.x + t.w + 0.5, y1: t.y + t.size * 0.28 } } }];
  }
  const chars = [...t.str];
  const em = chars.map(charEm);
  const total = em.reduce((a, b) => a + b, 0) || 1;
  const out: Glyph[] = [];
  let x = t.x;
  chars.forEach((ch, i) => {
    const w = (t.w * em[i]) / total;
    out.push({ ch, x, w, y: t.y, size: t.size, unsure: t.uncertain || undefined });
    x += w;
  });
  return out;
}

/** 가장 흔한 글자 크기(본문 크기) */
export function bodySize(texts: PText[]): number {
  const count = new Map<number, number>();
  for (const t of texts) {
    if (t.rot) continue;
    const k = Math.round(t.size * 2) / 2;
    count.set(k, (count.get(k) ?? 0) + t.str.replace(/\s/g, "").length);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 11;
}

export interface Fraction {
  bar: PSeg;
  num: PText[];
  den: PText[];
}

/** 분수: 짧은 가로선 바로 위와 아래에 글자가 있는 것 */
export function findFractions(texts: PText[], segs: PSeg[], body: number): Fraction[] {
  const out: Fraction[] = [];
  const near = (a: number, b: number, t = 1.5) => Math.abs(a - b) <= t;
  for (const s of segs) {
    if (s.dir !== "h" || s.x1 - s.x0 > 220 || s.x1 - s.x0 < 3) continue;
    // 외톨이 선만: 끝이 다른 선에 닿거나(표 칸), 위아래 가까이 같은 폭의 가로선이 있으면(표 행) 분수가 아닙니다.
    const touching = segs.some((o) => o !== s && (
      (o.dir === "v" && o.x0 >= s.x0 - 1.5 && o.x0 <= s.x1 + 1.5 && o.y0 <= s.y0 + 1.5 && o.y1 >= s.y0 - 1.5) ||
      (o.dir === "h" && near(o.y0, s.y0) && (near(o.x1, s.x0) || near(o.x0, s.x1)))));
    // 표의 행 구분선처럼 비슷한 길이·위치의 가로선이 위아래로 가까이 있으면 분수가 아님
    const len = s.x1 - s.x0;
    const stacked = segs.some((o) => o !== s && o.dir === "h" && Math.abs(o.y0 - s.y0) > 1 && Math.abs(o.y0 - s.y0) < body * 2.2 &&
      Math.abs(o.x1 - o.x0 - len) < len * 0.25 && Math.abs(o.x0 - s.x0) < 3);
    if (touching || stacked) continue;
    const over = (t: PText) => t.x < s.x1 - 0.5 && t.x + t.w > s.x0 + 0.5 && !t.rot;
    const num = texts.filter((t) => over(t) && t.y <= s.y0 - 0.3 && t.y >= s.y0 - body * 0.75);
    const den = texts.filter((t) => over(t) && t.y >= s.y0 + body * 0.35 && t.y <= s.y0 + body * 1.3);
    if (!num.length || !den.length) continue;
    // 분자·분모가 선 폭 안에 들어 있어야 합니다(밑줄+다음 줄 오인 방지).
    const within = (ts: PText[]) => ts.every((t) => t.x >= s.x0 - 3 && t.x + t.w <= s.x1 + 3);
    if (!within(num) || !within(den)) continue;
    out.push({ bar: s, num, den });
  }
  return out;
}

/** 글자 모음 → 수식 스크립트 조각 */
export function eqText(glyphs: Glyph[]): string {
  let s = "";
  let mode: "" | "sub" | "sup" = "";
  const close = () => {
    if (mode) s += "}";
    mode = "";
  };
  for (const g of glyphs) {
    const want: "" | "sub" | "sup" = g.sub ? "sub" : g.sup ? "sup" : "";
    if (want !== mode) {
      close();
      if (want === "sub") s += "_{";
      if (want === "sup") s += "^{";
      mode = want;
    }
    s += g.ch === " " ? "~" : /[{}]/.test(g.ch) ? "\\" + g.ch : g.ch;
  }
  close();
  return s.replace(/~+$/, "").replace(/^~+/, "");
}

/**
 * 글자 조각들을 글줄로. 본문 크기 조각으로 먼저 줄을 만들고, 작은 조각은 가까운 줄에 첨자로 붙입니다.
 * underlines: 밑줄 선분, fractions: 분수(분자·분모 조각은 빼고 수식 글자 하나로 넣음)
 */
export function buildLines(texts: PText[], body: number, underlines: PSeg[] = [], fractions: Fraction[] = []): Line[] {
  const used = new Set<PText>();
  for (const f of fractions) for (const t of [...f.num, ...f.den]) used.add(t);
  const items = texts.filter((t) => !t.rot && !used.has(t) && t.str.length);
  const big = items.filter((t) => t.size >= body * 0.82).sort((a, b) => a.y - b.y || a.x - b.x);
  const small = items.filter((t) => t.size < body * 0.82);
  const lines: { y: number; size: number; items: PText[] }[] = [];
  for (const t of big) {
    const hit = lines.find((l) => Math.abs(l.y - t.y) < Math.max(1.2, 0.3 * Math.min(l.size, t.size)));
    if (hit) {
      hit.items.push(t);
      hit.size = Math.max(hit.size, t.size);
    } else lines.push({ y: t.y, size: t.size, items: [t] });
  }
  const flags = new Map<PText, "sub" | "sup" | undefined>();
  for (const t of small) {
    let best: (typeof lines)[number] | null = null;
    let bd = Infinity;
    for (const l of lines) {
      const d = Math.abs(l.y - t.y);
      const xs = l.items.map((i) => i.x);
      const xe = l.items.map((i) => i.x + i.w);
      const near = t.x >= Math.min(...xs) - body * 3 && t.x <= Math.max(...xe) + body * 3;
      if (near && d < l.size * 0.75 && d < bd) {
        best = l;
        bd = d;
      }
    }
    if (best) {
      best.items.push(t);
      const off = t.y - best.y;
      flags.set(t, off > best.size * 0.12 ? "sub" : off < -best.size * 0.12 ? "sup" : undefined);
    } else lines.push({ y: t.y, size: t.size, items: [t] });
  }
  // 분수는 가로선 높이 근처 줄에 수식 글자로 넣습니다.
  const extra = new Map<(typeof lines)[number], Glyph[]>();
  for (const f of fractions) {
    const ny = f.bar.y0 + body * 0.35;
    let best = lines[0];
    let bd = Infinity;
    for (const l of lines) {
      const d = Math.abs(l.y - ny);
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    const num = linearize(f.num, body);
    const den = linearize(f.den, body);
    const g: Glyph = { ch: "￼", x: f.bar.x0, w: f.bar.x1 - f.bar.x0, y: best ? best.y : ny, size: body, eq: `{${eqText(num)}} over {${eqText(den)}}` };
    if (best && bd < body * 1.2) extra.set(best, [...(extra.get(best) ?? []), g]);
    else {
      const nl = { y: ny, size: body, items: [] as PText[] };
      lines.push(nl);
      extra.set(nl, [g]);
    }
  }

  const out: Line[] = [];
  for (const l of lines) {
    const gl: Glyph[] = [];
    const sorted = [...l.items].sort((a, b) => a.x - b.x);
    let prevEnd: number | null = null;
    let prevSpace = true;
    const pushGap = (x: number, size: number) => {
      if (prevEnd == null) return;
      const gap = x - prevEnd;
      if (gap > size * 1.8) gl.push({ ch: "\t", x: prevEnd, w: gap, y: l.y, size });
      else if (gap > size * 0.18 && !prevSpace) gl.push({ ch: " ", x: prevEnd, w: gap, y: l.y, size });
    };
    const all: (PText | Glyph)[] = [...sorted, ...(extra.get(l) ?? [])].sort((a, b) => a.x - b.x);
    for (const t of all) {
      if ("eq" in t && (t as Glyph).eq) {
        pushGap(t.x, body);
        gl.push(t as Glyph);
        prevEnd = t.x + t.w;
        prevSpace = false;
        continue;
      }
      const pt = t as PText;
      const f = flags.get(pt);
      pushGap(pt.x, l.size);
      for (const g of toGlyphs(pt)) {
        if (f === "sub") g.sub = true;
        if (f === "sup") g.sup = true;
        gl.push(g);
      }
      prevEnd = pt.x + pt.w;
      prevSpace = /\s$/.test(pt.str);
    }
    // 첨자에는 숫자·로마자·부호만(물결표·쉼표·공백은 본문 글자로)
    for (const g of gl) if ((g.sub || g.sup) && !/[0-9A-Za-zα-ωΑ-Ω+\-−＋－′'*]/.test(g.ch)) g.sub = g.sup = undefined;
    // 밑줄: 글자 가운데가 선분 안에 있고 선이 글자 기준선 바로 아래
    for (const u of underlines) {
      if (u.y0 < l.y - 0.5 || u.y0 > l.y + l.size * 0.45) continue;
      for (const g of gl) if (g.x + g.w / 2 >= u.x0 && g.x + g.w / 2 <= u.x1 && g.ch.trim()) g.ul = true;
    }
    // 앞뒤 공백 정리
    while (gl.length && !gl[0].ch.trim() && !gl[0].eq) gl.shift();
    while (gl.length && !gl[gl.length - 1].ch.trim() && !gl[gl.length - 1].eq) gl.pop();
    if (!gl.length) continue;
    out.push({ glyphs: gl, y: l.y, x0: gl[0].x, x1: gl[gl.length - 1].x + gl[gl.length - 1].w, size: l.size });
  }
  return out.sort((a, b) => a.y - b.y || a.x0 - b.x0);
}

/** 분자·분모처럼 한 덩이 글자를 왼쪽부터 글자열로(첨자 포함) */
function linearize(ts: PText[], body: number): Glyph[] {
  const lines = buildLines(ts, Math.max(...ts.map((t) => t.size)) || body);
  return lines.flatMap((l, i) => (i ? [{ ch: " ", x: 0, w: 0, y: 0, size: body } as Glyph, ...l.glyphs] : l.glyphs));
}

export function lineText(l: Line): string {
  return l.glyphs.map((g) => (g.eq || g.crop ? "￼" : g.ch)).join("");
}

/** 글줄 → 서식 조각 */
export function lineRuns(l: Line): Run[] {
  const runs: Run[] = [];
  for (const g of l.glyphs) {
    if (g.eq) {
      runs.push({ text: "", eq: g.eq });
      continue;
    }
    if (g.crop) {
      runs.push({ text: "", crop: g.crop });
      continue;
    }
    const last = runs[runs.length - 1];
    const same = last && !last.eq && !last.crop && !!last.sub === !!g.sub && !!last.sup === !!g.sup && !!last.underline === !!g.ul && !!last.unsure === !!g.unsure;
    if (same) last.text += g.ch;
    else runs.push({ text: g.ch, sub: g.sub || undefined, sup: g.sup || undefined, underline: g.ul || undefined, unsure: g.unsure || undefined });
  }
  return runs;
}
