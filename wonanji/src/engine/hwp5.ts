// HWP 5.0 바이너리에서 문단별 "영역 태그"(PARA_RANGE_TAG, 형광펜 등)를 읽습니다.
// rhwp의 HWPX 내보내기는 형광펜을 옮기지 않으므로, 원안지의 정답 표시를 지키기 위해
// 원본 바이너리에서 직접 읽어 HWPX 문단에 다시 입힙니다.
// 근거: 한글과컴퓨터, 「한글 문서 파일 형식 5.0」 공개 문서(레코드 구조, 문단의 영역 태그, 제어 문자 표).
import * as CFB from "cfb";
import { deflateSync, inflateSync, unzlibSync } from "fflate";

const HWPTAG_BEGIN = 0x10;
const PARA_HEADER = HWPTAG_BEGIN + 50;
const PARA_TEXT = HWPTAG_BEGIN + 51;
const PARA_RANGE_TAG = HWPTAG_BEGIN + 54;

/** 문단 하나의 "보이는 항목" 문자열과, 각 항목이 칠해져 있는지 여부. */
export interface ParaMarks {
  seq: string;
  color: (string | null)[];
}

// 제어 문자 분류(공개 문서 표 6). char: 1칸, inline/extended: 8칸.
const CHAR_CTRL = new Set([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31]);

function colorRefToHex(v: number): string {
  const r = v & 0xff;
  const g = (v >> 8) & 0xff;
  const b = (v >> 16) & 0xff;
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function decompress(data: Uint8Array): Uint8Array {
  try {
    return inflateSync(data);
  } catch {
    return unzlibSync(data);
  }
}

interface Rec {
  tag: number;
  level: number;
  data: Uint8Array;
}

function* records(buf: Uint8Array): Generator<Rec> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 0;
  while (p + 4 <= buf.length) {
    const h = dv.getUint32(p, true);
    p += 4;
    const tag = h & 0x3ff;
    const level = (h >>> 10) & 0x3ff;
    let size = (h >>> 20) & 0xfff;
    if (size === 0xfff) {
      if (p + 4 > buf.length) return;
      size = dv.getUint32(p, true);
      p += 4;
    }
    if (p + size > buf.length) return;
    yield { tag, level, data: buf.subarray(p, p + size) };
    p += size;
  }
}

/** PARA_TEXT를 "보이는 항목"(글자, 탭, 공백류, 줄바꿈)으로 풀고 각 항목의 위치(WCHAR 단위)를 기록합니다. */
function itemsFromText(data: Uint8Array): { seq: string[]; pos: number[] } {
  const n = Math.floor(data.length / 2);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const seq: string[] = [];
  const pos: number[] = [];
  let i = 0;
  while (i < n) {
    const c = dv.getUint16(i * 2, true);
    if (c < 32) {
      if (CHAR_CTRL.has(c)) {
        if (c === 10) {
          seq.push("\n");
          pos.push(i);
        } else if (c === 24) {
          seq.push("-");
          pos.push(i);
        } else if (c === 30 || c === 31) {
          seq.push(" ");
          pos.push(i);
        }
        i += 1;
      } else {
        if (c === 9) {
          seq.push("\t");
          pos.push(i);
        }
        i += 8;
      }
      continue;
    }
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < n) {
      const lo = dv.getUint16((i + 1) * 2, true);
      seq.push(String.fromCharCode(c, lo));
      pos.push(i);
      i += 2;
      continue;
    }
    seq.push(String.fromCharCode(c));
    pos.push(i);
    i += 1;
  }
  return { seq, pos };
}

export interface Hwp5Info {
  compressed: boolean;
  encrypted: boolean;
  distribution: boolean;
  /** 구역별, 전위 순서의 모든 문단(표 안·글상자 안·머리말 포함). */
  sections: ParaMarks[][];
  highlightCount: number;
}

export function readHwp5Marks(bytes: Uint8Array): Hwp5Info {
  const cfb = CFB.read(bytes, { type: "array" });
  const fh = CFB.find(cfb, "/FileHeader");
  const info: Hwp5Info = { compressed: true, encrypted: false, distribution: false, sections: [], highlightCount: 0 };
  if (fh?.content) {
    const c = fh.content as Uint8Array;
    const props = c[36] | (c[37] << 8) | (c[38] << 16) | (c[39] << 24);
    info.compressed = (props & 1) !== 0;
    info.encrypted = (props & 2) !== 0;
    info.distribution = (props & 4) !== 0;
  }
  if (info.encrypted || info.distribution) return info;

  for (let s = 0; ; s++) {
    const entry = CFB.find(cfb, `/BodyText/Section${s}`);
    if (!entry?.content) break;
    const raw = new Uint8Array(entry.content as ArrayLike<number>);
    const buf = info.compressed ? decompress(raw) : raw;
    const paras: ParaMarks[] = [];
    let cur: { seq: string[]; pos: number[]; tags: { start: number; end: number; color: string }[] } | null = null;
    const flush = () => {
      if (!cur) return;
      const color = cur.pos.map((p) => {
        const hit = cur!.tags.find((t) => p >= t.start && p < t.end);
        return hit ? hit.color : null;
      });
      info.highlightCount += color.filter(Boolean).length;
      paras.push({ seq: cur.seq.join(""), color });
      cur = null;
    };
    for (const r of records(buf)) {
      if (r.tag === PARA_HEADER) {
        flush();
        cur = { seq: [], pos: [], tags: [] };
      } else if (r.tag === PARA_TEXT && cur) {
        const it = itemsFromText(r.data);
        cur.seq = it.seq;
        cur.pos = it.pos;
      } else if (r.tag === PARA_RANGE_TAG && cur) {
        const dv = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength);
        for (let o = 0; o + 12 <= r.data.length; o += 12) {
          const start = dv.getUint32(o, true);
          const end = dv.getUint32(o + 4, true);
          const tag = dv.getUint32(o + 8, true);
          const kind = tag >>> 24;
          // 상위 8비트 2 = 형광펜(하위 24비트가 COLORREF 색). 교정 부호 등 다른 태그는 무시합니다.
          if (kind === 2 && end > start) cur.tags.push({ start, end, color: colorRefToHex(tag & 0xffffff) });
        }
      }
    }
    flush();
    info.sections.push(paras);
  }
  return info;
}

const PARA_LINE_SEG = HWPTAG_BEGIN + 53;

function writeHeader(out: number[], tag: number, level: number, size: number) {
  const big = size >= 0xfff;
  const h = (tag & 0x3ff) | ((level & 0x3ff) << 10) | ((big ? 0xfff : size) << 20);
  out.push(h & 0xff, (h >>> 8) & 0xff, (h >>> 16) & 0xff, (h >>> 24) & 0xff);
  if (big) out.push(size & 0xff, (size >>> 8) & 0xff, (size >>> 16) & 0xff, (size >>> 24) & 0xff);
}

/**
 * HWP 바이너리에서 줄 배치 캐시(PARA_LINE_SEG)를 지우고 문단 머리의 줄 수를 0으로 둡니다.
 * 서식을 바꾼 뒤 남은 옛 캐시 대신, 한글이 문서를 열 때 줄 배치를 새로 계산하게 합니다.
 */
export function stripHwpLineSegs(bytes: Uint8Array): Uint8Array {
  const cfb = CFB.read(bytes, { type: "array" });
  const fh = CFB.find(cfb, "/FileHeader");
  const c = fh?.content as Uint8Array | undefined;
  const compressed = c ? (c[36] & 1) !== 0 : true;
  for (let s = 0; ; s++) {
    const entry = CFB.find(cfb, `/BodyText/Section${s}`);
    if (!entry?.content) break;
    const raw = new Uint8Array(entry.content as ArrayLike<number>);
    const buf = compressed ? decompress(raw) : raw;
    const out: number[] = [];
    for (const r of records(buf)) {
      if (r.tag === PARA_LINE_SEG) continue;
      let data = r.data;
      if (r.tag === PARA_HEADER && data.length >= 18) {
        data = data.slice();
        data[16] = 0;
        data[17] = 0;
      }
      writeHeader(out, r.tag, r.level, data.length);
      for (let i = 0; i < data.length; i++) out.push(data[i]);
    }
    const plain = new Uint8Array(out);
    const next = compressed ? deflateSync(plain, { level: 6 }) : plain;
    entry.content = next as unknown as CFB.CFB$Blob;
    entry.size = next.length;
  }
  const written = CFB.write(cfb, { type: "array" }) as ArrayLike<number>;
  return written instanceof Uint8Array ? written : new Uint8Array(written);
}

