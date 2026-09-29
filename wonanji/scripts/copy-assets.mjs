// pdf.js 글꼴·문자표와 글자 인식(OCR) 엔진·한국어 데이터를 public/vendor로 복사합니다.
// 시험 보안: 모든 자원을 이 사이트에서 제공하고 외부 CDN을 쓰지 않습니다.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const out = path.resolve("public/vendor");
const pkgDir = (name) => path.dirname(require.resolve(`${name}/package.json`));
const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    const s = path.join(from, f);
    const d = path.join(to, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else if (!fs.existsSync(d) || fs.statSync(d).size !== fs.statSync(s).size) fs.copyFileSync(s, d);
  }
};
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (!fs.existsSync(to) || fs.statSync(to).size !== fs.statSync(from).size) fs.copyFileSync(from, to);
};

const pdf = pkgDir("pdfjs-dist");
copyDir(path.join(pdf, "cmaps"), path.join(out, "pdfjs/cmaps"));
copyDir(path.join(pdf, "standard_fonts"), path.join(out, "pdfjs/standard_fonts"));

const tess = pkgDir("tesseract.js");
const core = pkgDir("tesseract.js-core");
copy(path.join(tess, "dist/worker.min.js"), path.join(out, "ocr/worker.min.js"));
for (const f of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]) {
  copy(path.join(core, f), path.join(out, "ocr/core", f));
}
for (const lang of ["kor", "eng"]) {
  copy(path.join(pkgDir(`@tesseract.js-data/${lang}`), `4.0.0_best_int/${lang}.traineddata.gz`), path.join(out, `ocr/lang/${lang}.traineddata.gz`));
}
console.log("vendor assets →", path.relative(process.cwd(), out));
