// @rhwp/core(WASM) 호출부. 브라우저와 Node가 서로 다른 방식으로 모듈을 초기화하므로
// 초기화 함수만 주입받고, 나머지 변환·렌더 로직은 여기서 공통으로 씁니다.
import type { HwpDocument } from "@rhwp/core";

export interface RhwpModule {
  HwpDocument: typeof HwpDocument;
  version(): string;
}

let loader: (() => Promise<RhwpModule>) | null = null;
let loaded: Promise<RhwpModule> | null = null;

export function setRhwpLoader(fn: () => Promise<RhwpModule>) {
  loader = fn;
  loaded = null;
}

export function getRhwp(): Promise<RhwpModule> {
  if (!loader) throw new Error("rhwp 로더가 설정되지 않았습니다.");
  if (!loaded) loaded = loader();
  return loaded;
}

function withDoc<T>(mod: RhwpModule, bytes: Uint8Array, fn: (d: HwpDocument) => T): T {
  let doc: HwpDocument;
  try {
    doc = new mod.HwpDocument(bytes);
  } catch (e) {
    throw new Error("한글 문서를 열지 못했습니다: " + errText(e));
  }
  try {
    return fn(doc);
  } finally {
    doc.free();
  }
}

export function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export interface LossReport {
  count: number;
  items: string[];
}

function parseLoss(json: string): LossReport {
  try {
    const o = JSON.parse(json) as { count?: number; losses?: unknown[] };
    return {
      count: o.count ?? 0,
      items: (o.losses ?? []).map((l) => (typeof l === "string" ? l : JSON.stringify(l))),
    };
  } catch {
    return { count: 0, items: [] };
  }
}

/** HWP/HWPX 어느 쪽이든 rhwp를 거쳐 같은 방언의 HWPX로 바꿉니다. */
export async function toHwpx(bytes: Uint8Array): Promise<{ hwpx: Uint8Array; loss: LossReport; pages: number }> {
  const mod = await getRhwp();
  return withDoc(mod, bytes, (doc) => {
    const info = JSON.parse(doc.getDocumentInfo()) as { encrypted?: boolean };
    if (info.encrypted) throw new Error("암호가 걸린 문서입니다. 한글에서 암호를 해제한 뒤 다시 올려 주세요.");
    const out = doc.exportHwpxWithReport();
    const loss = parseLoss(out.contentLoss());
    const hwpx = out.takeBytes();
    out.free();
    return { hwpx, loss, pages: doc.pageCount() };
  });
}

/** HWPX → HWP. 원본 줄 배치 캐시를 둔 HWPX를 넣고, 결과에서는 캐시를 지웁니다(stripHwpLineSegs). */
export async function hwpxToHwp(hwpx: Uint8Array): Promise<{ hwp: Uint8Array; loss: LossReport; pages: number }> {
  const mod = await getRhwp();
  return withDoc(mod, hwpx, (doc) => {
    const out = doc.exportHwpWithReport();
    const loss = parseLoss(out.contentLoss());
    const hwp = out.takeBytes();
    out.free();
    return { hwp, loss, pages: doc.pageCount() };
  });
}

export async function renderPages(bytes: Uint8Array, maxPages = 40): Promise<string[]> {
  const mod = await getRhwp();
  return withDoc(mod, bytes, (doc) => {
    const n = Math.min(doc.pageCount(), maxPages);
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(doc.renderPageSvg(i));
    return out;
  });
}
