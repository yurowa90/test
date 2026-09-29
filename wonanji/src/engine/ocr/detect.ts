// 흑백으로 나눈 이미지에서 선(표·상자·밑줄), 동그라미 기호(①·㉠·ⓐ·○), 그림 덩어리를 찾습니다. 단위는 픽셀.
import type { Comp, Gray, Rect } from "./raster";

export interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 선 두께(px) */
  lw: number;
  dir: "h" | "v";
}

interface Run {
  a: number;
  b: number;
}

/** 가로·세로로 길게 이어진 어두운 픽셀(선). onSeg는 선에 속한 픽셀 표시 */
export function findSegments(bin: Uint8Array, W: number, H: number, em: number): { segs: Seg[]; onSeg: Uint8Array } {
  const onSeg = new Uint8Array(W * H);
  const bridge = Math.max(1, Math.round(em * 0.04));
  const maxThick = Math.max(2, em * 0.28);
  const segs: Seg[] = [];

  const scan = (dir: "h" | "v") => {
    const len = dir === "h" ? W : H;
    const lines = dir === "h" ? H : W;
    const minLen = dir === "h" ? em * 1.6 : em * 1.45;
    const at = (line: number, i: number) => (dir === "h" ? bin[line * W + i] : bin[i * W + line]);
    type Active = { a: number; b: number; start: number; last: number; runs: { line: number; a: number; b: number }[] };
    let active: Active[] = [];
    const close = (s: Active) => {
      const thick = s.last - s.start + 1;
      if (thick > maxThick) return;
      // 선 길이: 가장 긴 줄 기준(비스듬한 끝을 너그럽게)
      const a = Math.min(...s.runs.map((r) => r.a));
      const b = Math.max(...s.runs.map((r) => r.b));
      if (b - a < minLen) return;
      const mid = (s.start + s.last + 1) / 2;
      segs.push(dir === "h" ? { x0: a, x1: b, y0: mid, y1: mid, lw: thick, dir } : { x0: mid, x1: mid, y0: a, y1: b, lw: thick, dir });
      for (const r of s.runs) for (let i = r.a; i < r.b; i++) onSeg[dir === "h" ? r.line * W + i : i * W + r.line] = 1;
    };
    for (let line = 0; line <= lines; line++) {
      const runs: Run[] = [];
      if (line < lines) {
        let start = -1;
        let gap = 0;
        for (let i = 0; i <= len; i++) {
          const on = i < len && at(line, i) === 1;
          if (on) {
            if (start < 0) start = i;
            gap = 0;
          } else if (start >= 0) {
            gap++;
            if (gap > bridge || i === len) {
              const end = i - gap + 1;
              if (end - start >= minLen * 0.5) runs.push({ a: start, b: end });
              start = -1;
              gap = 0;
            }
          }
        }
      }
      const next: Active[] = [];
      const used = new Set<Run>();
      for (const s of active) {
        const hit = runs.find((r) => !used.has(r) && Math.min(r.b, s.b) - Math.max(r.a, s.a) > 0.6 * Math.min(r.b - r.a, s.b - s.a));
        if (hit) {
          used.add(hit);
          s.a = Math.min(s.a, hit.a);
          s.b = Math.max(s.b, hit.b);
          s.last = line;
          s.runs.push({ line, ...hit });
          next.push(s);
        } else close(s);
      }
      for (const r of runs) if (!used.has(r)) next.push({ a: r.a, b: r.b, start: line, last: line, runs: [{ line, ...r }] });
      active = next;
    }
  };
  scan("h");
  scan("v");

  // 끊긴 선 잇기(사진 잡티·압축 흔적)
  const tol = Math.max(2, em * 0.1);
  const gapMax = em * 0.35;
  const merged: Seg[] = [];
  for (const dir of ["h", "v"] as const) {
    const list = segs.filter((s) => s.dir === dir).sort((a, b) => (dir === "h" ? a.y0 - b.y0 || a.x0 - b.x0 : a.x0 - b.x0 || a.y0 - b.y0));
    const out: Seg[] = [];
    for (const s of list) {
      const hit = out.find((o) =>
        dir === "h" ? Math.abs(o.y0 - s.y0) <= tol && s.x0 - o.x1 <= gapMax && o.x0 - s.x1 <= gapMax : Math.abs(o.x0 - s.x0) <= tol && s.y0 - o.y1 <= gapMax && o.y0 - s.y1 <= gapMax,
      );
      if (hit) {
        if (dir === "h") {
          hit.x0 = Math.min(hit.x0, s.x0);
          hit.x1 = Math.max(hit.x1, s.x1);
        } else {
          hit.y0 = Math.min(hit.y0, s.y0);
          hit.y1 = Math.max(hit.y1, s.y1);
        }
        hit.lw = Math.max(hit.lw, s.lw);
      } else out.push({ ...s });
    }
    merged.push(...out);
  }
  return { segs: merged, onSeg };
}

export interface Circle extends Rect {
  ring: Comp;
  /** 원 안 글자 덩어리 */
  inner: Comp[];
  /** 안 글자가 고리에 붙어 한 덩어리 */
  touching: boolean;
}

/** 동그라미 기호: 속이 빈 둥근 고리 덩어리(안의 숫자·자모는 따로 떨어진 덩어리) */
export function findCircles(comps: Comp[], labels: Int32Array, W: number, em: number): Circle[] {
  const out: Circle[] = [];
  const byArea = comps.filter((c) => {
    const w = c.x1 - c.x0;
    const h = c.y1 - c.y0;
    return Math.min(w, h) >= em * 0.72 && Math.max(w, h) <= em * 1.35 && Math.abs(w - h) <= 0.2 * Math.max(w, h);
  });
  for (const c of byArea) {
    const w = c.x1 - c.x0;
    const h = c.y1 - c.y0;
    const density = c.n / (w * h);
    if (density < 0.08 || density > 0.55) continue;
    const cx = (c.x0 + c.x1) / 2;
    const cy = (c.y0 + c.y1) / 2;
    const rx = w / 2;
    const ry = h / 2;
    // 둘레 32곳 중 대부분에 고리가 있어야
    let hit = 0;
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      let found = false;
      for (let f = 0.72; f <= 1.0 && !found; f += 0.04) {
        const x = Math.round(cx + Math.cos(a) * rx * f - 0.5);
        const y = Math.round(cy + Math.sin(a) * ry * f - 0.5);
        if (x >= c.x0 && x < c.x1 && y >= c.y0 && y < c.y1 && labels[y * W + x] === c.id) found = true;
      }
      if (found) hit++;
    }
    // 네모(ㅁ)는 대각선 방향이 비어 26 아래로 떨어집니다. 사진에서는 고리가 번져 조금 덜 둥글게 잡힙니다.
    if (hit < 26) continue;
    // 고리와 가운데 사이(반지름 0.62~0.72)는 비어 있어야 합니다(안 글자가 고리에 닿아도 이 띠는 대체로 빔).
    let band = 0;
    let bandOn = 0;
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      for (const f of [0.62, 0.68]) {
        const x = Math.round(cx + Math.cos(a) * rx * f - 0.5);
        const y = Math.round(cy + Math.sin(a) * ry * f - 0.5);
        band++;
        if (labels[y * W + x] === c.id) bandOn++;
      }
    }
    // 안 글자가 고리에 닿으면 띠에 걸리므로, 고리가 거의 완전할 때는 너그럽게
    if (bandOn > band * (hit >= 31 ? 0.55 : hit >= 29 ? 0.45 : 0.3)) continue;
    const inner = comps.filter((o) => o !== c && o.x0 > c.x0 && o.x1 < c.x1 && o.y0 > c.y0 && o.y1 < c.y1);
    // 안 글자가 고리에 붙은 경우: 고리 안쪽 타원(반지름 0.7 안)에 이 덩어리 픽셀이 있음
    let core = 0;
    for (let y = Math.floor(cy - ry * 0.7); y <= cy + ry * 0.7; y++) {
      for (let x = Math.floor(cx - rx * 0.7); x <= cx + rx * 0.7; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy < 0.49 && labels[y * W + x] === c.id) core++;
      }
    }
    out.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, ring: c, inner, touching: core >= 3 });
  }
  return out;
}

export interface FigBox extends Rect {
  kind: "fill" | "image";
  color?: string;
}

/**
 * 그림 덩어리: 글자보다 큰 덩어리 가운데 선(표·상자 테두리)이 아닌 것.
 * 촘촘히 칠한 네모(막대그래프 막대, 칠한 칸)는 fill, 나머지는 image.
 */
export function findFigures(comps: Comp[], labels: Int32Array, onSeg: Uint8Array, gray: Gray, em: number, words: Rect[] = []): FigBox[] {
  const W = gray.width;
  const out: FigBox[] = [];
  for (const c of comps) {
    const w = c.x1 - c.x0;
    const h = c.y1 - c.y0;
    const big = w > em * 2 || h > em * 2;
    const solid = c.n > em * em * 0.5 && c.n / (w * h) > 0.6;
    if (!big && !solid) continue;
    // 굵은 글씨에서 이웃 글자가 붙은 덩어리: 글줄 높이 이하이고 대부분 인식한 낱말 안
    if (h < em * 1.6) {
      let cov = 0;
      for (const r of words) cov += Math.max(0, Math.min(r.x1, c.x1) - Math.max(r.x0, c.x0)) * Math.max(0, Math.min(r.y1, c.y1) - Math.max(r.y0, c.y0));
      if (cov > w * h * 0.5) continue;
    }
    let seg = 0;
    let sum = 0;
    let rim = 0;
    const band = Math.max(4, em * 0.3);
    for (let y = c.y0; y < c.y1; y++) {
      for (let x = c.x0; x < c.x1; x++) {
        const i = y * W + x;
        if (labels[i] !== c.id) continue;
        if (onSeg[i]) seg++;
        if (x - c.x0 < band || c.x1 - 1 - x < band || y - c.y0 < band || c.y1 - 1 - y < band) rim++;
        sum += gray.data[i];
      }
    }
    if (seg >= c.n * 0.75) continue;
    // 속 빈 사각형(상자·표 테두리): 픽셀 대부분이 가장자리 띠에 있음. 사진에서는 선이 휘거나 굵어져 선분으로 다 잡히지 않습니다.
    if (big && w > em * 3 && h > em * 1.5 && rim >= c.n * 0.7) continue;
    const density = c.n / (w * h);
    if (solid || (density > 0.6 && Math.min(w, h) > em * 0.4)) {
      const v = Math.round(sum / c.n);
      const hex = v.toString(16).padStart(2, "0");
      out.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, kind: "fill", color: `#${hex}${hex}${hex}` });
    } else out.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, kind: "image" });
  }
  return out;
}

/**
 * 선지 줄 자모(ㄱ·ㄴ·ㄷ·ㄹ·ㅁ)를 모양으로 가립니다. 인쇄체는 위·아래·왼쪽·오른쪽 가장자리 획으로 뚜렷이 갈립니다.
 * 확실하지 않으면 null.
 */
export function classifyJamo(bin: Uint8Array, W: number, box: Rect): string | null {
  const x0 = Math.floor(box.x0);
  const y0 = Math.floor(box.y0);
  const w = Math.max(1, Math.ceil(box.x1) - x0);
  const h = Math.max(1, Math.ceil(box.y1) - y0);
  if (w < 4 || h < 4) return null;
  const at = (x: number, y: number) => bin[(y0 + y) * W + x0 + x] === 1;
  const colCov = (ya: number, yb: number) => {
    let n = 0;
    for (let x = 0; x < w; x++) {
      for (let y = Math.floor(ya * h); y < Math.ceil(yb * h); y++) {
        if (at(x, y)) {
          n++;
          break;
        }
      }
    }
    return n / w;
  };
  const rowCov = (xa: number, xb: number) => {
    let n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = Math.floor(xa * w); x < Math.ceil(xb * w); x++) {
        if (at(x, y)) {
          n++;
          break;
        }
      }
    }
    return n / h;
  };
  let ink = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y)) ink++;
  if (ink > w * h * 0.6) return null; // 칠한 덩어리
  const T = colCov(0, 0.28);
  const B = colCov(0.72, 1);
  const M = colCov(0.38, 0.62);
  const L = rowCov(0, 0.28);
  const R = rowCov(0.72, 1);
  const hi = (v: number) => v > 0.68;
  const lo = (v: number) => v < 0.5;
  if (hi(T) && hi(B) && hi(M) && L < 0.85 && R < 0.85) return "ㄹ";
  if (hi(T) && hi(B) && hi(L) && hi(R) && lo(M)) return "ㅁ";
  // ㄷ은 위·아래 획 끝의 부리 때문에 오른쪽이 절반쯤 차 보입니다(ㅁ은 거의 다 참).
  if (hi(T) && hi(B) && hi(L) && R < 0.62 && lo(M)) return "ㄷ";
  if (hi(T) && hi(R) && lo(B) && lo(L)) return "ㄱ";
  if (hi(L) && hi(B) && lo(T) && lo(R)) return "ㄴ";
  return null;
}
