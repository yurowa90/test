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
// 글꼴(자체 호스팅): Pretendard 가변 글꼴(동적 서브셋)과 Noto Serif KR 400·600·700(woff2만).
// 외부 글꼴 CDN을 쓰면 접속 사실이 제3자에게 알려지므로 이 사이트에서 직접 제공합니다.
const pret = pkgDir("pretendard");
copy(path.join(pret, "dist/web/variable/pretendardvariable-dynamic-subset.css"), path.join(out, "fonts/pretendard/pretendardvariable-dynamic-subset.css"));
copyDir(path.join(pret, "dist/web/variable/woff2-dynamic-subset"), path.join(out, "fonts/pretendard/woff2-dynamic-subset"));
const noto = pkgDir("@fontsource/noto-serif-kr");
fs.mkdirSync(path.join(out, "fonts/noto-serif-kr"), { recursive: true });
for (const w of ["400", "600", "700"]) {
  const css = fs.readFileSync(path.join(noto, `${w}.css`), "utf8").replace(/,\s*url\([^)]*\.woff\)\s*format\('woff'\)/g, "");
  fs.writeFileSync(path.join(out, `fonts/noto-serif-kr/${w}.css`), css);
  for (const m of css.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)) copy(path.join(noto, "files", m[1]), path.join(out, "fonts/noto-serif-kr/files", m[1]));
}
console.log("vendor assets →", path.relative(process.cwd(), out));
