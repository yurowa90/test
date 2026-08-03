import type { Poem } from "../types";

/**
 * 영수증을 캔버스에 그린다.
 * - 블루투스 인쇄: dots 폭(58mm=384, 80mm=576) 그대로 1비트 래스터로 변환
 * - PNG 저장: scale을 올려 선명한 이미지로 저장
 * 한글 폰트가 없는 감열 프린터가 대부분이라, 텍스트를 프린터 폰트 대신
 * 비트맵으로 렌더링해 보내는 것이 이 파일의 존재 이유다.
 */
export interface ReceiptOptions {
  /** 프린터 가로 도트 수 (58mm=384, 80mm=576) */
  dots: number;
  /** 렌더 배율 (인쇄=1, PNG=2 권장) */
  scale?: number;
  /** 영수증에 찍을 날짜·시각 문자열 */
  dateText: string;
  /** 시 형식 라벨 (자유시 등) */
  formLabel: string;
}

const FONT_FAMILY = `"Nanum Gothic Coding", ui-monospace, monospace`;

/** 캔버스에 그리기 전에 영수증 폰트를 로드해 둔다 (실패 시 시스템 고정폭으로 대체) */
export async function ensureReceiptFont(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(`400 24px ${FONT_FAMILY}`),
      document.fonts.load(`700 24px ${FONT_FAMILY}`),
    ]);
  } catch {
    /* 폰트 로드 실패 — 대체 폰트로 진행 */
  }
}

function font(weight: 400 | 700, size: number): string {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}

/** 공백 우선, 공백이 없으면 음절 단위로 접는 그리디 줄바꿈 */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text) return [""];
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const tryLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(tryLine).width <= maxWidth) {
      line = tryLine;
      continue;
    }
    if (line) {
      out.push(line);
      line = "";
    }
    let piece = "";
    for (const ch of word) {
      if (ctx.measureText(piece + ch).width <= maxWidth) {
        piece += ch;
      } else {
        if (piece) out.push(piece);
        piece = ch;
      }
    }
    line = piece;
  }
  out.push(line);
  return out;
}

interface TextOp {
  kind: "text";
  text: string;
  weight: 400 | 700;
  size: number;
  advance: number;
}
interface GapOp {
  kind: "gap";
  advance: number;
}
interface RuleOp {
  kind: "rule";
  advance: number;
}
type Op = TextOp | GapOp | RuleOp;

export function renderReceipt(
  poem: Poem,
  opts: ReceiptOptions,
): HTMLCanvasElement {
  const dots = opts.dots;
  const scale = opts.scale ?? 1;
  const u = dots / 384; // 58mm 기준 배율
  const margin = Math.round(22 * u);
  const contentWidth = dots - margin * 2;

  const sHeader = Math.round(17 * u);
  const sSmall = Math.round(15 * u);
  const sBody = Math.round(22 * u);
  const sTitle = Math.round(27 * u);
  const lhBody = Math.round(35 * u);

  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("캔버스를 사용할 수 없는 브라우저입니다.");

  const ops: Op[] = [];
  const text = (
    raw: string,
    weight: 400 | 700,
    size: number,
    lineHeight: number,
  ) => {
    measure.font = font(weight, size);
    for (const line of wrap(measure, raw, contentWidth)) {
      ops.push({ kind: "text", text: line, weight, size, advance: lineHeight });
    }
  };
  const gap = (px: number) => ops.push({ kind: "gap", advance: Math.round(px) });

  // ── 구성 ──────────────────────────────────
  gap(30 * u);
  text("P O E T R Y", 700, sHeader, sHeader * 1.35);
  text("C A M E R A", 700, sHeader, sHeader * 1.35);
  gap(10 * u);
  text("*   *   *", 400, sSmall, sSmall * 1.2);
  gap(28 * u);
  text(poem.title, 700, sTitle, sTitle * 1.45);
  gap(20 * u);
  for (const line of poem.lines) {
    if (line === "") {
      gap(lhBody * 0.55);
    } else {
      text(line, 400, sBody, lhBody);
    }
  }
  gap(30 * u);
  ops.push({ kind: "rule", advance: Math.round(2 * u) });
  gap(20 * u);
  text(`${opts.formLabel} · ${opts.dateText}`, 400, sSmall, sSmall * 1.5);
  gap(8 * u);
  text("이 시는 사진을 본 AI가 지었습니다", 400, sSmall, sSmall * 1.5);
  gap(34 * u);

  // ── 그리기 ────────────────────────────────
  const height = ops.reduce((sum, op) => sum + op.advance, 0);
  const canvas = document.createElement("canvas");
  canvas.width = dots * scale;
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 사용할 수 없는 브라우저입니다.");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#faf7ef";
  ctx.fillRect(0, 0, dots, height);
  ctx.fillStyle = "#1a1613";
  ctx.strokeStyle = "#1a1613";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  let y = 0;
  for (const op of ops) {
    if (op.kind === "text" && op.text !== "") {
      ctx.font = font(op.weight, op.size);
      // baseline을 행 박스 하단 근처에 두어 행간이 고르게 보이도록
      ctx.fillText(op.text, dots / 2, y + op.advance - op.size * 0.28);
    } else if (op.kind === "rule") {
      ctx.lineWidth = Math.max(2, Math.round(2 * u));
      ctx.setLineDash([Math.round(6 * u), Math.round(6 * u)]);
      ctx.beginPath();
      ctx.moveTo(margin, y + op.advance / 2);
      ctx.lineTo(dots - margin, y + op.advance / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    y += op.advance;
  }

  return canvas;
}
