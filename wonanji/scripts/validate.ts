// 결과 HWPX의 구조 검증: 본문이 가리키는 모든 ID가 header·목록에 실제로 있는지, 개수 표기가 맞는지 확인합니다.
// 사용: npx tsx scripts/validate.ts out/merged.hwpx
import "./node-env";
import fs from "node:fs";
import { kid, kids, walk } from "../src/engine/dom";
import { HeaderIndex } from "../src/engine/header";
import { HwpxPackage } from "../src/engine/pkg";

export function validateHwpx(bytes: Uint8Array): string[] {
  const pkg = HwpxPackage.fromBytes(bytes);
  const h = new HeaderIndex(pkg);
  const errs: string[] = [];
  const need = (list: keyof HeaderIndex["byId"], id: string | null, where: string) => {
    if (id == null) return;
    if (!h.byId[list].has(id)) errs.push(`${where}: ${list} ${id} 없음`);
  };
  const files = new Set(pkg.files.keys());
  for (const [id, b] of h.bin) if (!files.has(b.href)) errs.push(`BinData ${id} 파일 없음: ${b.href}`);

  // header 내부 참조
  for (const [, cp] of h.byId.charProperties) {
    need("borderFills", cp.getAttribute("borderFillIDRef"), `charPr ${cp.getAttribute("id")}`);
    const ref = kid(cp, "fontRef");
    if (ref) {
      for (const lang of ["hangul", "latin", "hanja", "japanese", "other", "symbol", "user"] as const) {
        const f = ref.getAttribute(lang);
        if (f != null && !h.fonts[lang].has(f)) errs.push(`charPr ${cp.getAttribute("id")}: ${lang} 글꼴 ${f} 없음`);
      }
    }
  }
  for (const [, pp] of h.byId.paraProperties) {
    need("tabProperties", pp.getAttribute("tabPrIDRef"), `paraPr ${pp.getAttribute("id")}`);
    const head = kid(pp, "heading");
    const t = head?.getAttribute("type");
    if (t === "NUMBER") need("numberings", head!.getAttribute("idRef"), `paraPr ${pp.getAttribute("id")}`);
    if (t === "BULLET") need("bullets", head!.getAttribute("idRef"), `paraPr ${pp.getAttribute("id")}`);
    need("borderFills", kid(pp, "border")?.getAttribute("borderFillIDRef") ?? null, `paraPr ${pp.getAttribute("id")}`);
  }
  for (const box of kids(h.refList)) {
    const cnt = box.getAttribute("itemCnt");
    if (cnt != null && Number(cnt) !== kids(box).length) errs.push(`${box.localName} itemCnt ${cnt} ≠ 실제 ${kids(box).length}`);
  }

  // 본문 참조
  const ids = new Set<string>();
  for (const sec of pkg.sections) {
    walk(sec.documentElement, (e) => {
      const where = `section <${e.localName}>`;
      if (e.localName === "p") {
        need("paraProperties", e.getAttribute("paraPrIDRef"), where);
        need("styles", e.getAttribute("styleIDRef"), where);
      }
      if (e.localName === "run") need("charProperties", e.getAttribute("charPrIDRef"), where);
      if (e.hasAttribute("borderFillIDRef")) need("borderFills", e.getAttribute("borderFillIDRef"), where);
      const bi = e.getAttribute("binaryItemIDRef");
      if (bi != null && !h.bin.has(bi)) errs.push(`${where}: 그림 ${bi}가 목록에 없음`);
      const cp = e.getAttribute("charPrIDRef");
      if (cp != null && e.localName !== "run" && cp !== "4294967295") need("charProperties", cp, where);
      if (["tbl", "pic", "equation", "rect", "ellipse", "container"].includes(e.localName)) {
        const id = e.getAttribute("id");
        if (id) {
          if (ids.has(id)) errs.push(`개체 id ${id} 중복`);
          ids.add(id);
        }
      }
      if (/[|@]/.test(e.getAttribute("charPrIDRef") ?? "") || /[|@]/.test(e.getAttribute("paraPrIDRef") ?? "")) {
        errs.push(`${where}: 처리되지 않은 임시 참조 ${e.getAttribute("charPrIDRef") ?? e.getAttribute("paraPrIDRef")}`);
      }
    });
  }
  return errs;
}

if (process.argv[2]) {
  const errs = validateHwpx(new Uint8Array(fs.readFileSync(process.argv[2])));
  console.log(errs.length ? errs.slice(0, 30).join("\n") : "구조 검증 통과");
  process.exitCode = errs.length ? 1 : 0;
}
