// Node에서 엔진을 돌리기 위한 환경: xmldom + rhwp WASM 동기 초기화.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { setDomImpl } from "../src/engine/dom";
import { setRhwpLoader, type RhwpModule } from "../src/engine/rhwp";

setDomImpl({ DOMParser: DOMParser as never, XMLSerializer: XMLSerializer as never });

// rhwp는 줄 나눔 계산에 글자 폭 측정 함수를 요구합니다. Node에는 캔버스가 없으므로 근사치를 씁니다.
(globalThis as Record<string, unknown>).measureTextWidth = (font: string, text: string) => {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  const px = m ? Number(m[1]) : 13;
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    w += c >= 0x1100 ? px : c === 0x20 ? px * 0.33 : px * 0.55;
  }
  return w;
};

const require = createRequire(import.meta.url);
setRhwpLoader(async () => {
  const mod = (await import("@rhwp/core")) as unknown as RhwpModule & { initSync(o: { module: Uint8Array }): void };
  const wasm = path.join(path.dirname(require.resolve("@rhwp/core")), "rhwp_bg.wasm");
  mod.initSync({ module: fs.readFileSync(wasm) });
  return mod;
});

export function readBytes(p: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(p));
}
