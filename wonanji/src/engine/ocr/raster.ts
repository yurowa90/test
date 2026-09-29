// 사진·캡처 이미지를 다루는 작은 도구들(회색조, 크기 바꾸기, 기울기 바로잡기, 흑백 나누기, 덩어리 찾기).
// 브라우저와 Node에서 똑같이 돌도록 픽셀 배열만 씁니다.

export interface RGBA {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface Gray {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function toGray(img: RGBA): Gray {
  const { width, height, data } = img;
  const out = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    const a = data[j + 3] / 255;
    // 투명한 부분은 흰 종이로
    const l = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    out[i] = Math.round(l * a + 255 * (1 - a));
  }
  return { width, height, data: out };
}

/** 크기 바꾸기: 줄일 때는 칸 평균, 키울 때는 쌍선형 */
export function scaleGray(g: Gray, s: number): Gray {
  const W = Math.max(1, Math.round(g.width * s));
  const H = Math.max(1, Math.round(g.height * s));
  const out = new Uint8Array(W * H);
  if (s < 1) {
    const inv = 1 / s;
    for (let y = 0; y < H; y++) {
      const sy0 = Math.floor(y * inv);
      const sy1 = Math.min(g.height, Math.max(sy0 + 1, Math.floor((y + 1) * inv)));
      for (let x = 0; x < W; x++) {
        const sx0 = Math.floor(x * inv);
        const sx1 = Math.min(g.width, Math.max(sx0 + 1, Math.floor((x + 1) * inv)));
        let sum = 0;
        for (let yy = sy0; yy < sy1; yy++) {
          const row = yy * g.width;
          for (let xx = sx0; xx < sx1; xx++) sum += g.data[row + xx];
        }
        out[y * W + x] = sum / ((sy1 - sy0) * (sx1 - sx0));
      }
    }
    return { width: W, height: H, data: out };
  }
  for (let y = 0; y < H; y++) {
    const fy = Math.min(g.height - 1, Math.max(0, (y + 0.5) / s - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(g.height - 1, y0 + 1);
    const dy = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(g.width - 1, Math.max(0, (x + 0.5) / s - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(g.width - 1, x0 + 1);
      const dx = fx - x0;
      const a = g.data[y0 * g.width + x0] * (1 - dx) + g.data[y0 * g.width + x1] * dx;
      const b = g.data[y1 * g.width + x0] * (1 - dx) + g.data[y1 * g.width + x1] * dx;
      out[y * W + x] = a * (1 - dy) + b * dy;
    }
  }
  return { width: W, height: H, data: out };
}

export function scaleRGBA(img: RGBA, s: number): RGBA {
  const W = Math.max(1, Math.round(img.width * s));
  const H = Math.max(1, Math.round(img.height * s));
  const out = new Uint8ClampedArray(W * H * 4);
  const inv = 1 / s;
  for (let y = 0; y < H; y++) {
    const sy0 = Math.floor(y * inv);
    const sy1 = Math.min(img.height, Math.max(sy0 + 1, Math.floor((y + 1) * inv)));
    for (let x = 0; x < W; x++) {
      const sx0 = Math.floor(x * inv);
      const sx1 = Math.min(img.width, Math.max(sx0 + 1, Math.floor((x + 1) * inv)));
      const acc = [0, 0, 0, 0];
      for (let yy = sy0; yy < sy1; yy++) {
        for (let xx = sx0; xx < sx1; xx++) {
          const j = (yy * img.width + xx) * 4;
          acc[0] += img.data[j];
          acc[1] += img.data[j + 1];
          acc[2] += img.data[j + 2];
          acc[3] += img.data[j + 3];
        }
      }
      const n = (sy1 - sy0) * (sx1 - sx0);
      const o = (y * W + x) * 4;
      for (let c = 0; c < 4; c++) out[o + c] = acc[c] / n;
    }
  }
  return { width: W, height: H, data: out };
}

/** 가운데를 축으로 angle(라디안)만큼 돌립니다. 빈 곳은 흰색. */
export function rotateRGBA(img: RGBA, angle: number): RGBA {
  const { width: W, height: H, data } = img;
  const out = new Uint8ClampedArray(W * H * 4).fill(255);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const cx = W / 2;
  const cy = H / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // 결과 픽셀 → 원본 좌표(역회전)
      const dx = x - cx;
      const dy = y - cy;
      const sx = c * dx + s * dy + cx;
      const sy = -s * dx + c * dy + cy;
      const ix = Math.round(sx);
      const iy = Math.round(sy);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const j = (iy * W + ix) * 4;
      const o = (y * W + x) * 4;
      out[o] = data[j];
      out[o + 1] = data[j + 1];
      out[o + 2] = data[j + 2];
      out[o + 3] = 255;
    }
  }
  return { width: W, height: H, data: out };
}

export function cropRGBA(img: RGBA, r: Rect): RGBA {
  const x0 = Math.max(0, Math.floor(r.x0));
  const y0 = Math.max(0, Math.floor(r.y0));
  const x1 = Math.min(img.width, Math.ceil(r.x1));
  const y1 = Math.min(img.height, Math.ceil(r.y1));
  const W = Math.max(1, x1 - x0);
  const H = Math.max(1, y1 - y0);
  const out = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 0; y < y1 - y0; y++) {
    const src = ((y0 + y) * img.width + x0) * 4;
    out.set(img.data.subarray(src, src + (x1 - x0) * 4), y * W * 4);
  }
  return { width: W, height: H, data: out };
}

export function cropGray(g: Gray, r: Rect): Gray {
  const x0 = Math.max(0, Math.floor(r.x0));
  const y0 = Math.max(0, Math.floor(r.y0));
  const x1 = Math.min(g.width, Math.ceil(r.x1));
  const y1 = Math.min(g.height, Math.ceil(r.y1));
  const W = Math.max(1, x1 - x0);
  const H = Math.max(1, y1 - y0);
  const out = new Uint8Array(W * H).fill(255);
  for (let y = 0; y < y1 - y0; y++) out.set(g.data.subarray((y0 + y) * g.width + x0, (y0 + y) * g.width + x1), y * W);
  return { width: W, height: H, data: out };
}

export function grayToRGBA(g: Gray): RGBA {
  const out = new Uint8ClampedArray(g.width * g.height * 4);
  for (let i = 0, j = 0; i < g.data.length; i++, j += 4) {
    out[j] = out[j + 1] = out[j + 2] = g.data[i];
    out[j + 3] = 255;
  }
  return { width: g.width, height: g.height, data: out };
}

export function otsu(g: Gray): number {
  const hist = new Array(256).fill(0);
  for (const v of g.data) hist[v]++;
  const total = g.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let th = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      th = t;
    }
  }
  return th;
}

/** 칸 평균(적분 영상)으로 주변보다 어두운 픽셀을 1로. 사진의 고르지 않은 조명에도 버팁니다. */
export function binarize(g: Gray, win: number, k = 0.15, ceiling = 205): Uint8Array {
  const { width: W, height: H, data } = g;
  const integ = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += data[y * W + x];
      integ[(y + 1) * (W + 1) + x + 1] = integ[y * (W + 1) + x + 1] + row;
    }
  }
  const r = Math.max(3, Math.floor(win / 2));
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const ya = Math.max(0, y - r);
    const yb = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const xa = Math.max(0, x - r);
      const xb = Math.min(W, x + r + 1);
      const s = integ[yb * (W + 1) + xb] - integ[ya * (W + 1) + xb] - integ[yb * (W + 1) + xa] + integ[ya * (W + 1) + xa];
      const mean = s / ((yb - ya) * (xb - xa));
      const v = data[y * W + x];
      if (v < ceiling && v < mean * (1 - k)) out[y * W + x] = 1;
    }
  }
  return out;
}

export interface Comp {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 픽셀 수 */
  n: number;
}

/** 8방향 연결 덩어리. labels[i] = 덩어리 번호(0은 배경) */
export function components(bin: Uint8Array, W: number, H: number): { labels: Int32Array; comps: Comp[] } {
  const labels = new Int32Array(W * H);
  const comps: Comp[] = [];
  const stack = new Int32Array(W * H);
  let next = 1;
  for (let i = 0; i < bin.length; i++) {
    if (!bin[i] || labels[i]) continue;
    const c: Comp = { id: next, x0: W, y0: H, x1: 0, y1: 0, n: 0 };
    let sp = 0;
    stack[sp++] = i;
    labels[i] = next;
    while (sp) {
      const p = stack[--sp];
      const x = p % W;
      const y = (p - x) / W;
      c.n++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const q = yy * W + xx;
          if (bin[q] && !labels[q]) {
            labels[q] = next;
            stack[sp++] = q;
          }
        }
      }
    }
    c.x1 += 1;
    c.y1 += 1;
    comps.push(c);
    next++;
  }
  return { labels, comps };
}

/** 기울기 추정: 글줄이 수평일 때 가로 투영의 분산이 가장 큽니다(±4°). */
export function estimateSkew(bin: Uint8Array, W: number, H: number): number {
  const pts: number[] = [];
  const step = Math.max(1, Math.floor(Math.sqrt((W * H) / 400000)));
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (bin[y * W + x]) pts.push(x, y);
  if (pts.length < 200) return 0;
  const score = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    const s = Math.sin(a);
    const c = Math.cos(a);
    // 칸 폭 = 표본 간격(더 좁으면 0°에서만 점이 한 칸 건너 몰려 점수가 부풀어 오릅니다)
    const bw = step;
    const bins = new Float64Array(Math.ceil((H + 2 * W) / bw) + 1);
    for (let i = 0; i < pts.length; i += 2) {
      const yy = Math.floor((-s * pts[i] + c * pts[i + 1] + W) / bw);
      if (yy >= 0 && yy < bins.length) bins[yy]++;
    }
    let sum = 0;
    for (const b of bins) sum += b * b;
    return sum;
  };
  let best = 0;
  let bestScore = score(0);
  for (let d = -4; d <= 4.001; d += 0.25) {
    const sc = score(d);
    if (sc > bestScore) {
      bestScore = sc;
      best = d;
    }
  }
  for (let d = best - 0.2; d <= best + 0.201; d += 0.05) {
    const sc = score(d);
    if (sc > bestScore) {
      bestScore = sc;
      best = d;
    }
  }
  return (best * Math.PI) / 180;
}

/**
 * 글줄 높이의 중앙값(px). 2단 문제지에서 양쪽 글줄이 겹쳐 보이지 않도록 세로 띠 8개로 나눠 가로 투영합니다.
 */
export function lineHeight(bin: Uint8Array, W: number, H: number): number {
  const strips = 8;
  const runs: number[] = [];
  for (let s = 0; s < strips; s++) {
    const xa = Math.floor((W * s) / strips);
    const xb = Math.floor((W * (s + 1)) / strips);
    const th = Math.max(1, (xb - xa) * 0.01);
    let start = -1;
    for (let y = 0; y <= H; y++) {
      let n = 0;
      if (y < H) for (let x = xa; x < xb; x++) n += bin[y * W + x];
      const on = y < H && n > th;
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        if (y - start >= 4) runs.push(y - start);
        start = -1;
      }
    }
  }
  if (!runs.length) return 24;
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)];
}

/**
 * 2단 나누기: 가운데 부근의 긴 세로선, 없으면 글자가 거의 없는 세로 빈 띠. 없으면 null.
 */
export function columnSplit(bin: Uint8Array, W: number, H: number, em: number): number | null {
  const ya = Math.floor(H * 0.12);
  const yb = Math.floor(H * 0.92);
  const colInk = new Uint32Array(W);
  const colRun = new Uint32Array(W);
  for (let x = Math.floor(W * 0.3); x < W * 0.7; x++) {
    let n = 0;
    let run = 0;
    let best = 0;
    for (let y = ya; y < yb; y++) {
      const on = bin[y * W + x] || (x > 0 && bin[y * W + x - 1]) || (x + 1 < W && bin[y * W + x + 1]);
      if (on) {
        n++;
        run++;
        if (run > best) best = run;
      } else run = 0;
    }
    colInk[x] = n;
    colRun[x] = best;
  }
  // 구분선: 세로로 쪽 높이 40% 넘게 이어진 선
  let lineX = -1;
  let lineRun = 0;
  for (let x = Math.floor(W * 0.3); x < W * 0.7; x++) {
    if (colRun[x] > (yb - ya) * 0.4 && colRun[x] > lineRun) {
      lineRun = colRun[x];
      lineX = x;
    }
  }
  if (lineX >= 0) return lineX;
  // 빈 띠: 잉크가 거의 없는 열이 글자 한 개 폭 이상 이어진 곳 중 가장 넓은 곳
  const th = (yb - ya) * 0.004;
  let best: [number, number] | null = null;
  let start = -1;
  for (let x = Math.floor(W * 0.3); x <= W * 0.7; x++) {
    const empty = x < W * 0.7 && colInk[x] <= th;
    if (empty && start < 0) start = x;
    if (!empty && start >= 0) {
      if (x - start >= em * 0.9 && (!best || x - start > best[1] - best[0])) best = [start, x];
      start = -1;
    }
  }
  return best ? Math.round((best[0] + best[1]) / 2) : null;
}
