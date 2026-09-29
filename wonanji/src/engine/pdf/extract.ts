// PDF 한 쪽에서 글자·선·면·그림을 쪽 좌표(왼쪽 위 원점, pt)로 뽑습니다.
// pdf.js는 브라우저와 Node가 불러오는 방법이 달라, 문서 객체와 연산 코드표(OPS)를 주입받습니다.

export interface PText {
  str: string;
  /** 글자 기준선 왼쪽 끝 */
  x: number;
  y: number;
  w: number;
  size: number;
  font: string;
  /** 가로가 아닌 글자(세로 축 이름 등) */
  rot: boolean;
  /** 쪽 번호(0부터) */
  page: number;
  /** 글꼴에 유니코드 대응이 없어 글자를 알 수 없는 조각(그리스 문자 등) → 그 자리를 그림으로 */
  unknown?: boolean;
  /** 글자 조각이 차지하는 영역(회전 글자 포함) */
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface PSeg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  lw: number;
  /** h: 가로선, v: 세로선, d: 사선 */
  dir: "h" | "v" | "d";
  dashed: boolean;
}

export interface PBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** fill: 칠한 면, image: 그림, curve: 곡선이 든 경로 */
  kind: "fill" | "image" | "curve";
  color?: string;
}

export interface PdfPageData {
  index: number;
  width: number;
  height: number;
  texts: PText[];
  segs: PSeg[];
  boxes: PBox[];
}

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function extractPage(page: any, OPS: Record<string, number>, index: number): Promise<PdfPageData> {
  const vp = page.getViewport({ scale: 1 });
  const vt = vp.transform as M;
  const width: number = vp.width;
  const height: number = vp.height;

  const texts: PText[] = [];
  const tc = await page.getTextContent();
  for (const it of tc.items as any[]) {
    if (typeof it.str !== "string") continue;
    const t = it.transform as M;
    const [x, y] = apply(vt, t[4], t[5]);
    const size = Math.hypot(t[2], t[3]);
    if (size < 3) continue; // 보이지 않는 표지 글자
    const unknown = !it.str && it.width > size * 0.3;
    if (!it.str && !unknown) continue;
    // 글자 방향(a,b)·위쪽(c,d) 벡터로 네 귀퉁이를 구해 쪽 좌표 영역을 만듭니다.
    const la = Math.hypot(t[0], t[1]) || 1;
    const lu = Math.hypot(t[2], t[3]) || 1;
    const dir = [t[0] / la, t[1] / la];
    const up = [t[2] / lu, t[3] / lu];
    const corner = (u: number, v: number) => apply(vt, t[4] + dir[0] * u + up[0] * v, t[5] + dir[1] * u + up[1] * v);
    const cs = [corner(0, -size * 0.22), corner(it.width, -size * 0.22), corner(0, size * 0.88), corner(it.width, size * 0.88)];
    const bbox = { x0: Math.min(...cs.map((c) => c[0])), x1: Math.max(...cs.map((c) => c[0])), y0: Math.min(...cs.map((c) => c[1])), y1: Math.max(...cs.map((c) => c[1])) };
    texts.push({ str: unknown ? "\u25A1" : it.str, x, y, w: it.width, size, font: it.fontName, rot: Math.abs(t[1]) > 1e-3 || Math.abs(t[2]) > 1e-3, page: index, unknown: unknown || undefined, bbox });
  }

  const names: Record<number, string> = {};
  for (const [k, v] of Object.entries(OPS)) names[v] = k;
  const ops = await page.getOperatorList();
  const segs: PSeg[] = [];
  const boxes: PBox[] = [];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: { ctm: M; lw: number; dash: boolean; fill: string }[] = [];
  let lw = 1;
  let dash = false;
  let fill = "#000000";
  const toPage = (x: number, y: number) => apply(vt, ...apply(ctm, x, y));
  const scaleLw = (w: number) => w * Math.hypot(ctm[0], ctm[1]);

  for (let i = 0; i < ops.fnArray.length; i++) {
    const name = names[ops.fnArray[i]];
    const a = ops.argsArray[i];
    switch (name) {
      case "save":
        stack.push({ ctm, lw, dash, fill });
        break;
      case "restore": {
        const s = stack.pop();
        if (s) ({ ctm, lw, dash, fill } = s);
        break;
      }
      case "transform":
        ctm = mul(ctm, a as M);
        break;
      case "paintFormXObjectBegin":
        stack.push({ ctm, lw, dash, fill });
        if (a?.[0]) ctm = mul(ctm, a[0] as M);
        break;
      case "paintFormXObjectEnd": {
        const s = stack.pop();
        if (s) ({ ctm, lw, dash, fill } = s);
        break;
      }
      case "setLineWidth":
        lw = a[0];
        break;
      case "setDash":
        dash = Array.isArray(a?.[0]) && a[0].length > 0;
        break;
      case "setFillRGBColor":
        fill = typeof a[0] === "string" ? a[0] : "#000000";
        break;
      case "setFillGray":
        fill = typeof a[0] === "number" && a[0] > 0.95 ? "#ffffff" : "#000000";
        break;
      case "paintImageXObject":
      case "paintInlineImageXObject":
      case "paintImageMaskXObject": {
        const pts = [toPage(0, 0), toPage(1, 0), toPage(0, 1), toPage(1, 1)];
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        boxes.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), kind: "image" });
        break;
      }
      case "constructPath": {
        const op = names[a[0]];
        const data: ArrayLike<number> | undefined = a[1]?.[0];
        if (!data || op === "endPath") break; // 자르기 경로
        const stroke = /stroke/i.test(op);
        const isFill = /fill/i.test(op);
        // 하위 경로 단위로 선분을 풉니다.
        const subs: [number, number][][] = [];
        let cur: [number, number][] = [];
        let curved = false;
        for (let k = 0; k < data.length; ) {
          const code = data[k++];
          if (code === 0) {
            if (cur.length) subs.push(cur);
            cur = [toPage(data[k++], data[k++])];
          } else if (code === 1) cur.push(toPage(data[k++], data[k++]));
          else if (code === 2) {
            curved = true;
            k += 4;
            cur.push(toPage(data[k++], data[k++]));
          } else if (code === 3) {
            curved = true;
            k += 2;
            cur.push(toPage(data[k++], data[k++]));
          } else if (code === 4) {
            if (cur.length) cur.push(cur[0]);
          } else break;
        }
        if (cur.length) subs.push(cur);
        const all = subs.flat();
        if (!all.length) break;
        const bx0 = Math.min(...all.map((p) => p[0]));
        const bx1 = Math.max(...all.map((p) => p[0]));
        const by0 = Math.min(...all.map((p) => p[1]));
        const by1 = Math.max(...all.map((p) => p[1]));
        if (curved) {
          boxes.push({ x0: bx0, y0: by0, x1: bx1, y1: by1, kind: "curve" });
          break;
        }
        if (isFill && !stroke) {
          // 얇게 칠한 면은 선(구분선 등)으로 봅니다.
          const w = bx1 - bx0;
          const h = by1 - by0;
          if (w < 2.2 && h > 4) segs.push({ x0: (bx0 + bx1) / 2, y0: by0, x1: (bx0 + bx1) / 2, y1: by1, lw: w, dir: "v", dashed: false });
          else if (h < 2.2 && w > 4) segs.push({ x0: bx0, y0: (by0 + by1) / 2, x1: bx1, y1: (by0 + by1) / 2, lw: h, dir: "h", dashed: false });
          else boxes.push({ x0: bx0, y0: by0, x1: bx1, y1: by1, kind: "fill", color: fill });
          break;
        }
        if (stroke) {
          const w = scaleLw(lw);
          for (const sp of subs) {
            for (let k = 1; k < sp.length; k++) {
              const [x0, y0] = sp[k - 1];
              const [x1, y1] = sp[k];
              const dx = Math.abs(x1 - x0);
              const dy = Math.abs(y1 - y0);
              if (dx < 0.01 && dy < 0.01) continue;
              const dir = dy < 0.6 ? "h" : dx < 0.6 ? "v" : "d";
              segs.push({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), lw: w, dir, dashed: dash });
            }
          }
          if (isFill) boxes.push({ x0: bx0, y0: by0, x1: bx1, y1: by1, kind: "fill", color: fill });
        }
        break;
      }
    }
  }
  // 같은 선을 두 번 그린 PDF가 많아 겹치는 선분은 하나로 합칩니다.
  const key = (g: PSeg) => `${g.dir}:${g.x0.toFixed(1)}:${g.y0.toFixed(1)}:${g.x1.toFixed(1)}:${g.y1.toFixed(1)}`;
  const seen = new Set<string>();
  const uniqSegs = segs.filter((g) => (seen.has(key(g)) ? false : (seen.add(key(g)), true)));
  return { index, width, height, texts, segs: uniqSegs, boxes };
}
