// header.xml의 참조 목록(글꼴·테두리/배경·글자 모양·탭·번호·문단 모양·스타일)을 다룹니다.
// 여러 출제 파일의 문단을 양식 문서로 옮길 때, 각 파일의 ID를 양식 문서의 ID로 다시 매깁니다.
import { attr, hh, isEl, kid, kids, NS, serializeNode, walk } from "./dom";
import type { HwpxPackage } from "./pkg";
import { isBlank, modValue, splitCp } from "./text";
import type { FormatSpec } from "./types";

export const LANGS = ["hangul", "latin", "hanja", "japanese", "other", "symbol", "user"] as const;
export type Lang = (typeof LANGS)[number];
const LANG_OF_FACE: Record<string, Lang> = {
  HANGUL: "hangul", LATIN: "latin", HANJA: "hanja", JAPANESE: "japanese", OTHER: "other", SYMBOL: "symbol", USER: "user",
};

type ListName = "borderFills" | "charProperties" | "tabProperties" | "numberings" | "bullets" | "paraProperties" | "styles";
const ITEM_OF: Record<ListName, string> = {
  borderFills: "borderFill",
  charProperties: "charPr",
  tabProperties: "tabPr",
  numberings: "numbering",
  bullets: "bullet",
  paraProperties: "paraPr",
  styles: "style",
};
const REFLIST_ORDER = ["fontfaces", "borderFills", "charProperties", "tabProperties", "numberings", "bullets", "paraProperties", "styles", "memoProperties", "trackChanges", "trackChangeAuthors"];

// 기호 글꼴은 글자 자체가 글꼴에 매여 있으므로 바꾸지 않습니다.
const SYMBOL_FONTS = /^(symbol|wingdings|webdings|mt extra|hy그래픽|휴먼옛체?)/i;

export class HeaderIndex {
  doc: Document;
  refList: Element;
  byId: Record<ListName, Map<string, Element>>;
  fonts: Record<Lang, Map<string, Element>>;
  bin: Map<string, { href: string; mediaType: string; el: Element }>;

  constructor(public pkg: HwpxPackage) {
    this.doc = pkg.header;
    let refList = kid(this.doc.documentElement, "refList");
    if (!refList) {
      refList = hh(this.doc, "refList");
      this.doc.documentElement.appendChild(refList);
    }
    this.refList = refList;
    this.byId = {} as Record<ListName, Map<string, Element>>;
    for (const ln of Object.keys(ITEM_OF) as ListName[]) {
      const m = new Map<string, Element>();
      const box = kid(refList, ln);
      if (box) for (const e of kids(box)) if (e.localName === ITEM_OF[ln]) m.set(e.getAttribute("id") ?? "", e);
      this.byId[ln] = m;
    }
    this.fonts = Object.fromEntries(LANGS.map((l) => [l, new Map<string, Element>()])) as Record<Lang, Map<string, Element>>;
    const ff = kid(refList, "fontfaces");
    if (ff) {
      for (const face of kids(ff)) {
        const lang = LANG_OF_FACE[face.getAttribute("lang") ?? ""];
        if (!lang) continue;
        for (const f of kids(face)) if (f.localName === "font") this.fonts[lang].set(f.getAttribute("id") ?? "", f);
      }
    }
    this.bin = new Map();
    const manifest = kid(pkg.hpf.documentElement, "manifest");
    for (const it of manifest ? kids(manifest) : []) {
      if (it.localName !== "item") continue;
      const href = it.getAttribute("href") ?? "";
      if (/^BinData\//i.test(href)) this.bin.set(it.getAttribute("id") ?? "", { href, mediaType: it.getAttribute("media-type") ?? "", el: it });
    }
  }

  charPr(id: string) { return this.byId.charProperties.get(id) ?? null; }
  paraPr(id: string) { return this.byId.paraProperties.get(id) ?? null; }

  fontFace(lang: Lang, id: string | null): string | null {
    if (id == null) return null;
    return this.fonts[lang].get(id)?.getAttribute("face") ?? null;
  }

  /** 글자 모양의 한글/영문 글꼴 이름. */
  charFace(cpId: string, lang: Lang = "hangul"): string | null {
    const cp = this.charPr(cpId);
    const ref = cp && kid(cp, "fontRef");
    return ref ? this.fontFace(lang, ref.getAttribute(lang)) : null;
  }

  charHeight(cpId: string): number | null {
    const cp = this.charPr(cpId);
    return cp ? Number(cp.getAttribute("height") ?? 0) : null;
  }

  /** 글자 모양이 음영/형광으로 칠해졌는지(원안지 정답 표시). */
  shadeOf(cpToken: string): string | null {
    const m = modValue(cpToken, "shade");
    if (m === "none") return null;
    if (m) return m;
    const cp = this.charPr(splitCp(cpToken).base);
    const s = cp?.getAttribute("shadeColor");
    if (!s || s === "none" || /^#?ffffff$/i.test(s)) return null;
    return s;
  }
}

function sig(el: Element): string {
  const c = el.cloneNode(true) as Element;
  c.removeAttribute("id");
  return serializeNode(c);
}

/** 결과 문서(양식 사본)의 header. 새 항목을 덧붙이고 중복을 합칩니다. */
export class OutputHeader extends HeaderIndex {
  private sigs = new Map<string, Map<string, string>>();
  private nextBin = 1;

  constructor(pkg: HwpxPackage) {
    super(pkg);
    for (const [, v] of this.bin) {
      const m = /(\d+)/.exec(v.href.split("/").pop() ?? "");
      if (m) this.nextBin = Math.max(this.nextBin, Number(m[1]) + 1);
    }
  }

  private box(ln: ListName): Element {
    let b = kid(this.refList, ln);
    if (!b) {
      b = hh(this.doc, ln);
      b.setAttribute("itemCnt", "0");
      const order = REFLIST_ORDER.indexOf(ln);
      const after = kids(this.refList).find((e) => REFLIST_ORDER.indexOf(e.localName) > order);
      this.refList.insertBefore(b, after ?? null);
    }
    return b;
  }

  private nextId(ln: ListName): string {
    let max = ln === "numberings" || ln === "bullets" || ln === "borderFills" ? 0 : -1;
    for (const k of this.byId[ln].keys()) max = Math.max(max, Number(k));
    return String(max + 1);
  }

  /** 요소(이미 결과 문서 소유)를 목록에 추가. 같은 내용이 있으면 기존 ID를 돌려줍니다. */
  add(ln: ListName, el: Element): string {
    let sm = this.sigs.get(ln);
    if (!sm) {
      sm = new Map();
      for (const [id, e] of this.byId[ln]) sm.set(sig(e), id);
      this.sigs.set(ln, sm);
    }
    const s = sig(el);
    const hit = sm.get(s);
    if (hit != null) return hit;
    const id = this.nextId(ln);
    el.setAttribute("id", id);
    this.box(ln).appendChild(el);
    this.byId[ln].set(id, el);
    sm.set(s, id);
    return id;
  }

  fontId(lang: Lang, face: string, proto?: Element | null): string {
    for (const [id, f] of this.fonts[lang]) if (f.getAttribute("face") === face) return id;
    const ff = kid(this.refList, "fontfaces");
    const faceBox = ff && kids(ff).find((f) => LANG_OF_FACE[f.getAttribute("lang") ?? ""] === lang);
    if (!faceBox) return "0";
    const id = String(this.fonts[lang].size);
    const el = proto ? (this.doc.importNode(proto, true) as Element) : hh(this.doc, "font");
    el.setAttribute("id", id);
    el.setAttribute("face", face);
    if (!proto) {
      el.setAttribute("type", "TTF");
      el.setAttribute("isEmbedded", "0");
    }
    faceBox.appendChild(el);
    this.fonts[lang].set(id, el);
    return id;
  }

  addBin(bytes: Uint8Array, ext: string, mediaType: string): string {
    const n = this.nextBin++;
    const id = `image${n}`;
    const href = `BinData/${id}.${ext}`;
    this.pkg.files.set(href, bytes);
    const manifest = kid(this.pkg.hpf.documentElement, "manifest")!;
    const it = this.pkg.hpf.createElementNS(NS.opf, "opf:item");
    it.setAttribute("id", id);
    it.setAttribute("href", href);
    it.setAttribute("media-type", mediaType);
    it.setAttribute("isEmbeded", "1");
    manifest.appendChild(it);
    this.bin.set(id, { href, mediaType, el: it });
    return id;
  }

  finalize() {
    for (const ln of Object.keys(ITEM_OF) as ListName[]) {
      const b = kid(this.refList, ln);
      if (b) b.setAttribute("itemCnt", String(kids(b).filter((e) => e.localName === ITEM_OF[ln]).length));
    }
    const ff = kid(this.refList, "fontfaces");
    if (ff) for (const face of kids(ff)) face.setAttribute("fontCnt", String(kids(face).filter((e) => e.localName === "font").length));
  }
}

// ── 문단 모양 switch(case/default) 도우미 ─────────────────────────
// case 가지는 HWPUNIT, default 가지는 그 두 배 값으로 저장됩니다(한글 2010 이전 호환).

function branches(paraPr: Element): Element[] {
  const out: Element[] = [];
  for (const sw of kids(paraPr).filter((e) => e.localName === "switch")) {
    for (const b of kids(sw)) if (b.localName === "case" || b.localName === "default") out.push(b);
  }
  return out;
}

export function getMargin(paraPr: Element, name: "intent" | "left" | "right" | "prev" | "next"): number {
  const c = branches(paraPr).find((b) => b.localName === "case") ?? paraPr;
  const m = kid(c, "margin");
  const v = m && kid(m, name);
  return v ? Number(v.getAttribute("value") ?? 0) : 0;
}

export function setMargin(paraPr: Element, name: "intent" | "left" | "right" | "prev" | "next", hu: number) {
  for (const b of branches(paraPr)) {
    const m = kid(b, "margin");
    const v = m && kid(m, name);
    if (v) v.setAttribute("value", String(Math.round(b.localName === "default" ? hu * 2 : hu)));
  }
}

export function setLineSpacing(paraPr: Element, type: string, value: number) {
  for (const b of branches(paraPr)) {
    const ls = kid(b, "lineSpacing");
    if (ls) {
      ls.setAttribute("type", type);
      ls.setAttribute("value", String(value));
    }
  }
}

export function getLineSpacing(paraPr: Element): { type: string; value: number } {
  const c = branches(paraPr).find((b) => b.localName === "case") ?? paraPr;
  const ls = kid(c, "lineSpacing");
  return { type: ls?.getAttribute("type") ?? "PERCENT", value: Number(ls?.getAttribute("value") ?? 160) };
}

function copyMargins(from: Element, to: Element, names: ("intent" | "left" | "right" | "prev" | "next")[]) {
  for (const n of names) setMargin(to, n, getMargin(from, n));
}

function setChild(parent: Element, name: string, proto: Element | null, doc: Document) {
  const old = kid(parent, name);
  if (proto) {
    const c = doc.importNode(proto, true) as Element;
    if (old) parent.replaceChild(c, old);
    else parent.appendChild(c);
  } else if (old) parent.removeChild(old);
}

const CHARPR_ORDER = ["fontRef", "ratio", "spacing", "relSz", "offset", "italic", "bold", "underline", "strikeout", "outline", "shadow", "emboss", "engrave", "supscript", "subscript"];

function reorderCharPr(cp: Element) {
  const ch = kids(cp);
  ch.sort((a, b) => {
    const ia = CHARPR_ORDER.indexOf(a.localName);
    const ib = CHARPR_ORDER.indexOf(b.localName);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  for (const c of ch) cp.appendChild(c);
}

export type ParaCtx = "body" | "cell" | "box";

/** 줄간격을 바꾸면 모양이 흐트러지는 개체(수식은 글줄의 일부로 보아 제외) */
const FIGURE_TAGS = new Set(["tbl", "pic", "rect", "ellipse", "arc", "polygon", "curve", "line", "connectLine", "container", "ole", "textart", "chart", "video"]);

/**
 * 출제 파일 하나의 header → 결과 header 가져오기.
 * raw 모드는 원본 모양 그대로 복사하고, norm 모드는 FormatSpec에 맞춰 통일합니다.
 */
export class Importer {
  private maps = new Map<string, string>();
  src: HeaderIndex;
  /** 출제 파일 단 폭 대비 결과 단 폭(1보다 작으면 탭 위치를 그만큼 줄입니다) */
  tabScale: number;
  private srcBase: Element | null | undefined;

  constructor(srcPkg: HwpxPackage, public out: OutputHeader, public spec: FormatSpec | null, opts: { tabScale?: number } = {}) {
    this.src = new HeaderIndex(srcPkg);
    this.tabScale = Math.min(1, opts.tabScale ?? 1);
  }

  /** 출제 파일 본문에서 가장 많이 쓰인 글자 모양(자간·장평의 기준) */
  private sourceBase(): Element | null {
    if (this.srcBase !== undefined) return this.srcBase;
    const count = new Map<string, number>();
    for (const sec of this.src.pkg.sections) {
      walk(sec.documentElement, (e) => {
        if (e.localName !== "run") return;
        let n = 0;
        for (const t of kids(e)) if (t.localName === "t") n += (t.textContent ?? "").length;
        if (n) {
          const id = splitCp(e.getAttribute("charPrIDRef") ?? "0").base;
          count.set(id, (count.get(id) ?? 0) + n);
        }
      });
    }
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    this.srcBase = top != null ? this.src.charPr(top) : null;
    return this.srcBase;
  }

  /**
   * 자간·장평: 양식 본문 값을 기준으로, 출제 파일에서 본문 기준과 달리 준 만큼(줄 맞춤용 부분 조정)만 더합니다.
   * 예) 양식 자간 -5, 출제 파일 본문 0·이 글자 -8 → -13
   */
  private relativeSpacing(c: Element, src: Element) {
    const base = this.sourceBase();
    for (const [name, lo, hi, mode] of [["spacing", -50, 50, "add"], ["ratio", 50, 200, "mul"]] as const) {
      const tplEl = kid(c, name);
      const srcEl = kid(src, name);
      if (!tplEl || !srcEl) continue;
      const baseEl = base ? kid(base, name) : null;
      for (const lang of LANGS) {
        const t = Number(tplEl.getAttribute(lang) ?? (mode === "add" ? 0 : 100));
        const s = Number(srcEl.getAttribute(lang) ?? (mode === "add" ? 0 : 100));
        const b = Number(baseEl?.getAttribute(lang) ?? (mode === "add" ? 0 : 100)) || (mode === "add" ? 0 : 100);
        const v = mode === "add" ? t + (s - b) : Math.round((t * s) / b);
        tplEl.setAttribute(lang, String(Math.min(hi, Math.max(lo, v))));
      }
    }
  }

  private memo(key: string, fn: () => string): string {
    const hit = this.maps.get(key);
    if (hit != null) return hit;
    const v = fn();
    this.maps.set(key, v);
    return v;
  }

  private clone(el: Element): Element {
    return this.out.doc.importNode(el, true) as Element;
  }

  bin(id: string): string {
    return this.memo("bin:" + id, () => {
      const b = this.src.bin.get(id);
      if (!b) return id;
      const bytes = this.src.pkg.files.get(b.href);
      if (!bytes) return id;
      const ext = (b.href.split(".").pop() ?? "bin").toLowerCase();
      return this.out.addBin(bytes, ext, b.mediaType);
    });
  }

  private fixRefs(el: Element) {
    walk(el, (e) => {
      const bf = e.getAttribute("borderFillIDRef");
      if (bf != null && e.localName !== "charPr") e.setAttribute("borderFillIDRef", this.borderFill(bf));
      const bi = e.getAttribute("binaryItemIDRef");
      if (bi != null) e.setAttribute("binaryItemIDRef", this.bin(bi));
    });
  }

  borderFill(id: string): string {
    return this.memo("bf:" + id, () => {
      const e = this.src.byId.borderFills.get(id);
      if (!e) return id;
      const c = this.clone(e);
      this.fixRefs(c);
      return this.out.add("borderFills", c);
    });
  }

  tabPr(id: string): string {
    return this.memo("tab:" + id, () => {
      const e = this.src.byId.tabProperties.get(id);
      if (!e) return "0";
      const c = this.clone(e);
      // 원본 단이 더 넓으면 탭 위치도 같은 비율로 줄여, 탭으로 맞춘 줄이 결과 단을 넘지 않게 합니다.
      if (this.tabScale < 0.995) {
        walk(c, (x) => {
          if (x.localName === "tabItem" && x.hasAttribute("pos")) x.setAttribute("pos", String(Math.round(Number(x.getAttribute("pos")) * this.tabScale)));
        });
      }
      return this.out.add("tabProperties", c);
    });
  }

  numbering(id: string, kind: "numberings" | "bullets"): string {
    return this.memo(kind + ":" + id, () => {
      const e = this.src.byId[kind].get(id);
      if (!e) return id;
      const c = this.clone(e);
      walk(c, (x) => {
        const cp = x.getAttribute("charPrIDRef");
        if (cp != null && cp !== "4294967295") x.setAttribute("charPrIDRef", this.charPrRaw(cp));
      });
      this.fixRefs(c);
      return this.out.add(kind, c);
    });
  }

  private remapFonts(cp: Element, srcCp: Element) {
    const ref = kid(cp, "fontRef");
    const srcRef = kid(srcCp, "fontRef");
    if (!ref || !srcRef) return;
    for (const lang of LANGS) {
      const sid = srcRef.getAttribute(lang);
      const face = this.src.fontFace(lang, sid);
      if (face) ref.setAttribute(lang, this.out.fontId(lang, face, this.src.fonts[lang].get(sid!)));
    }
  }

  /** 원본 글자 모양을 그대로 복사(머리 표 등). */
  charPrRaw(id: string): string {
    return this.memo("cpraw:" + id, () => {
      const e = this.src.charPr(id);
      if (!e) return this.spec?.bodyCharPrId ?? "0";
      const c = this.clone(e);
      this.remapFonts(c, e);
      c.setAttribute("borderFillIDRef", this.borderFill(e.getAttribute("borderFillIDRef") ?? "1"));
      return this.out.add("charProperties", c);
    });
  }

  paraPrRaw(id: string): string {
    return this.memo("ppraw:" + id, () => {
      const e = this.src.paraPr(id);
      if (!e) return this.spec?.bodyParaPrId ?? "0";
      const c = this.clone(e);
      this.fixParaRefs(c);
      return this.out.add("paraProperties", c);
    });
  }

  private fixParaRefs(c: Element) {
    const tab = c.getAttribute("tabPrIDRef");
    if (tab != null) c.setAttribute("tabPrIDRef", this.tabPr(tab));
    const head = kid(c, "heading");
    const ht = head?.getAttribute("type");
    if (head && (ht === "NUMBER" || ht === "BULLET")) {
      head.setAttribute("idRef", this.numbering(head.getAttribute("idRef") ?? "0", ht === "NUMBER" ? "numberings" : "bullets"));
    }
    const border = kid(c, "border");
    if (border) border.setAttribute("borderFillIDRef", this.borderFill(border.getAttribute("borderFillIDRef") ?? "1"));
  }

  /** 양식 기준으로 통일한 글자 모양. token = "원본ID|수정자…" */
  charPrNorm(token: string, ctx: ParaCtx): string {
    const spec = this.spec!;
    return this.memo(`cpn:${token}:${ctx}`, () => {
      const { base, mods } = splitCp(token);
      const src = this.src.charPr(base);
      const baseEl = this.out.charPr(spec.bodyCharPrId)!;
      const c = baseEl.cloneNode(true) as Element;
      if (src) {
        for (const n of ["italic", "bold", "underline", "strikeout", "outline", "shadow", "emboss", "engrave", "supscript", "subscript", "relSz", "offset"]) {
          setChild(c, n, kid(src, n), this.out.doc);
        }
        if (!spec.resetSpacing) this.relativeSpacing(c, src);
        c.setAttribute("shadeColor", src.getAttribute("shadeColor") ?? "none");
        c.setAttribute("symMark", src.getAttribute("symMark") ?? "NONE");
        c.setAttribute("textColor", spec.keepColors ? (src.getAttribute("textColor") ?? "#000000") : "#000000");
        const srcBf = src.getAttribute("borderFillIDRef");
        if (srcBf != null) c.setAttribute("borderFillIDRef", this.borderFill(srcBf));
        const face = this.src.fontFace("hangul", kid(src, "fontRef")?.getAttribute("hangul") ?? null) ?? "";
        const lface = this.src.fontFace("latin", kid(src, "fontRef")?.getAttribute("latin") ?? null) ?? "";
        if (SYMBOL_FONTS.test(face) || SYMBOL_FONTS.test(lface)) {
          setChild(c, "fontRef", kid(src, "fontRef"), this.out.doc);
          this.remapFonts(c, src);
        }
        const keepSize = (ctx === "box" || ctx === "cell") && spec.cellMode === "keep";
        if (keepSize) c.setAttribute("height", src.getAttribute("height") ?? baseEl.getAttribute("height")!);
      }
      if (!src || !((ctx === "box" || ctx === "cell") && spec.cellMode === "keep")) {
        c.setAttribute("height", String(Math.round(spec.sizePt * 100)));
      }
      for (const m of mods) {
        const [k, v] = m.split("=");
        if (k === "shade" && v) c.setAttribute("shadeColor", v);
        if (k === "neg") {
          let u = kid(c, "underline");
          if (!u) {
            u = hh(this.out.doc, "underline");
            c.appendChild(u);
          }
          u.setAttribute("type", "BOTTOM");
          u.setAttribute("shape", "SOLID");
          u.setAttribute("color", "#000000");
          const bold = kid(c, "bold");
          if (spec.negationStyle === "underline-bold" && !bold) c.appendChild(hh(this.out.doc, "bold"));
          if (spec.negationStyle === "underline" && bold) c.removeChild(bold);
        }
        if (k === "bold" && !kid(c, "bold")) c.appendChild(hh(this.out.doc, "bold"));
        if (k === "size" && v) c.setAttribute("height", v);
      }
      reorderCharPr(c);
      return this.out.add("charProperties", c);
    });
  }

  /**
   * 양식 기준으로 통일한 문단 모양.
   * token: 원본 paraPr ID 또는 "@head" | "@score" | "@gap" | "@choice:N"
   */
  paraPrNorm(token: string, ctx: ParaCtx, keepNext: boolean, keepSpacing = false): string {
    const spec = this.spec!;
    return this.memo(`ppn:${token}:${ctx}:${keepNext ? 1 : 0}:${keepSpacing ? 1 : 0}`, () => {
      const body = this.out.paraPr(spec.bodyParaPrId)!;
      let c: Element;
      if (token === "@head") {
        c = this.out.paraPr(spec.headParaPrId)!.cloneNode(true) as Element;
      } else if (token === "@score") {
        c = body.cloneNode(true) as Element;
        kid(c, "align")?.setAttribute("horizontal", "RIGHT");
      } else if (token === "@gap") {
        c = body.cloneNode(true) as Element;
      } else if (token.startsWith("@choice:")) {
        const n = Number(token.split(":")[1]);
        c = body.cloneNode(true) as Element;
        kid(c, "align")?.setAttribute("horizontal", "LEFT");
        setMargin(c, "left", spec.choiceIndentHU);
        setMargin(c, "intent", n === 1 ? -spec.hangHU : 0);
        c.setAttribute("tabPrIDRef", this.choiceTabs(n));
      } else {
        const src = this.src.paraPr(token);
        c = body.cloneNode(true) as Element;
        if (src) {
          const align = kid(src, "align")?.getAttribute("horizontal") ?? "JUSTIFY";
          kid(c, "align")?.setAttribute("horizontal", ctx === "body" && align === "LEFT" ? "JUSTIFY" : align);
          copyMargins(src, c, ctx === "body" ? ["intent", "left", "right"] : ["intent", "left", "right", "prev", "next"]);
          const tab = src.getAttribute("tabPrIDRef");
          if (tab != null) c.setAttribute("tabPrIDRef", this.tabPr(tab));
          const head = kid(src, "heading");
          const ht = head?.getAttribute("type");
          const ch = kid(c, "heading");
          if (ch) {
            if (head && (ht === "NUMBER" || ht === "BULLET")) {
              ch.setAttribute("type", ht);
              ch.setAttribute("idRef", this.numbering(head.getAttribute("idRef") ?? "0", ht === "NUMBER" ? "numberings" : "bullets"));
              ch.setAttribute("level", head.getAttribute("level") ?? "0");
            } else {
              ch.setAttribute("type", "NONE");
              ch.setAttribute("idRef", "0");
              ch.setAttribute("level", "0");
            }
          }
          const border = kid(src, "border");
          const bfId = border?.getAttribute("borderFillIDRef");
          if (border && bfId && this.hasVisibleBorder(bfId)) {
            const nb = this.clone(border);
            nb.setAttribute("borderFillIDRef", this.borderFill(bfId));
            setChild(c, "border", nb, this.out.doc);
          }
          if (ctx !== "body" && spec.cellMode === "keep") {
            const ls = getLineSpacing(src);
            setLineSpacing(c, ls.type, ls.value);
          }
        }
      }
      const srcPp = token.startsWith("@") ? null : this.src.paraPr(token);
      if (keepSpacing && srcPp) {
        // 그림·표가 든 문단, 표 안의 빈 문단: 줄간격이 개체 높이·칸 높이를 좌우하므로 원본 유지
        const ls = getLineSpacing(srcPp);
        setLineSpacing(c, ls.type, ls.value);
      } else if (!(ctx !== "body" && spec.cellMode === "keep" && !token.startsWith("@"))) {
        setLineSpacing(c, "PERCENT", spec.lineSpacing);
      }
      if (ctx === "body" && !token.startsWith("@choice")) {
        setMargin(c, "prev", 0);
        setMargin(c, "next", 0);
      }
      const bs = kid(c, "breakSetting");
      if (bs) bs.setAttribute("keepWithNext", keepNext ? "1" : "0");
      return this.out.add("paraProperties", c);
    });
  }

  private hasVisibleBorder(bfId: string): boolean {
    const e = this.src.byId.borderFills.get(bfId);
    if (!e) return false;
    for (const side of ["leftBorder", "rightBorder", "topBorder", "bottomBorder"]) {
      const b = kid(e, side);
      if (b && b.getAttribute("type") && b.getAttribute("type") !== "NONE") return true;
    }
    let fill = false;
    walk(e, (x) => {
      const fc = x.getAttribute("faceColor");
      if (fc && fc !== "none" && !/^#?ffffff$/i.test(fc)) fill = true;
    });
    return fill;
  }

  /** 선지 N개/줄 배열용 탭 정의(단 폭을 N등분). */
  private choiceTabs(n: number): string {
    const spec = this.spec!;
    return this.memo("choicetab:" + n, () => {
      const doc = this.out.doc;
      const tab = hh(doc, "tabPr");
      tab.setAttribute("autoTabLeft", "0");
      tab.setAttribute("autoTabRight", "0");
      if (n > 1) {
        const usable = spec.columnWidthHU - spec.choiceIndentHU;
        const sw = doc.createElementNS(NS.hp, "hp:switch");
        const cs = doc.createElementNS(NS.hp, "hp:case");
        cs.setAttributeNS(NS.hp, "hp:required-namespace", "http://www.hancom.co.kr/hwpml/2016/HwpUnitChar");
        const df = doc.createElementNS(NS.hp, "hp:default");
        for (let k = 1; k < n; k++) {
          const pos = Math.round((usable * k) / n);
          const a = hh(doc, "tabItem");
          a.setAttribute("pos", String(pos));
          a.setAttribute("type", "LEFT");
          a.setAttribute("leader", "NONE");
          a.setAttribute("unit", "HWPUNIT");
          cs.appendChild(a);
          const b = hh(doc, "tabItem");
          b.setAttribute("pos", String(pos * 2));
          b.setAttribute("type", "LEFT");
          b.setAttribute("leader", "NONE");
          df.appendChild(b);
        }
        sw.appendChild(cs);
        sw.appendChild(df);
        tab.appendChild(sw);
      }
      return this.out.add("tabProperties", tab);
    });
  }

  /**
   * 가져온 하위 트리의 ID 참조를 다시 매깁니다.
   * mode=raw: 모양을 그대로 복사, mode=norm: 통일(문단 모양은 p에 붙은 data-role/토큰 기준).
   */
  importTree(root: Element, mode: "raw" | "norm", keepNextOf?: (p: Element) => boolean) {
    const ctxOf = (e: Element): ParaCtx => {
      let n = e.parentNode;
      while (n && isEl(n) && n !== root.parentNode) {
        if (n.localName === "tc") return "cell";
        if (n.localName === "drawText" || n.localName === "caption") return "box";
        n = n.parentNode;
      }
      return "body";
    };
    // 그림 배치용 표(그림·도형이 든 표): 글꼴만 바꾸고 크기·줄간격은 원본 유지 → 그림 자리가 흐트러지지 않게
    const frozen = new Set<Element>();
    if (mode === "norm") {
      walk(root, (e) => {
        if (e.localName !== "tbl") return;
        let fig = false;
        walk(e, (x) => {
          if (x !== e && FIGURE_TAGS.has(x.localName) && x.localName !== "tbl") fig = true;
        });
        if (fig) walk(e, (x) => void (x.localName === "p" && frozen.add(x)));
      });
    }
    const blankCell = new Set<Element>();
    walk(root, (e) => {
      const ln = e.localName;
      if (ln === "p") {
        const pp = e.getAttribute("paraPrIDRef") ?? "0";
        const ctx = ctxOf(e);
        const blank = isBlank(e);
        if ((ctx !== "body" && blank) || frozen.has(e)) blankCell.add(e);
        const hasFigure = kids(e).some((r) => r.localName === "run" && kids(r).some((c) => FIGURE_TAGS.has(c.localName)));
        if (mode === "raw") e.setAttribute("paraPrIDRef", this.paraPrRaw(pp));
        else e.setAttribute("paraPrIDRef", this.paraPrNorm(pp, ctx, keepNextOf ? keepNextOf(e) : false, hasFigure || blankCell.has(e)));
        e.setAttribute("styleIDRef", "0");
      } else if (ln === "run") {
        const cp = e.getAttribute("charPrIDRef") ?? "0";
        // "|tpl": 이미 결과(양식) 문서의 ID
        if (splitCp(cp).mods.includes("tpl")) {
          e.setAttribute("charPrIDRef", splitCp(cp).base);
          return;
        }
        const inBlankCell = e.parentNode && blankCell.has(e.parentNode as Element);
        e.setAttribute("charPrIDRef", mode === "raw" ? this.charPrRaw(splitCp(cp).base) : this.charPrNorm(cp, inBlankCell ? "box" : ctxOf(e)));
      } else {
        const bf = e.getAttribute("borderFillIDRef");
        if (bf != null) e.setAttribute("borderFillIDRef", this.borderFill(bf));
        const bi = e.getAttribute("binaryItemIDRef");
        if (bi != null) e.setAttribute("binaryItemIDRef", this.bin(bi));
        if (ln === "secPr") {
          const os = e.getAttribute("outlineShapeIDRef");
          if (os != null && os !== "0") e.setAttribute("outlineShapeIDRef", this.numbering(os, "numberings"));
        }
        if (mode === "norm" && ln === "equation" && this.spec?.normalizeEquationSize) {
          const bu = Number(e.getAttribute("baseUnit") ?? 0);
          const target = Math.round(this.spec.sizePt * 100);
          if (bu > 0 && bu !== target && ctxOf(e) === "body") {
            const r = target / bu;
            e.setAttribute("baseUnit", String(target));
            const sz = kid(e, "sz");
            if (sz) {
              sz.setAttribute("width", String(Math.round(Number(sz.getAttribute("width") ?? 0) * r)));
              sz.setAttribute("height", String(Math.round(Number(sz.getAttribute("height") ?? 0) * r)));
            }
          }
        }
      }
    });
  }
}

export function attrOr(el: Element | null, name: string, fb: string): string {
  return (el && attr(el, name)) ?? fb;
}
