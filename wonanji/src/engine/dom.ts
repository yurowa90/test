// 브라우저(DOMParser)와 Node 테스트(@xmldom/xmldom)에서 같은 코드를 쓰기 위한 얇은 DOM 계층.
// querySelector 같은 브라우저 전용 API는 쓰지 않고 childNodes 순회만 사용합니다.

export const NS = {
  hp: "http://www.hancom.co.kr/hwpml/2011/paragraph",
  hh: "http://www.hancom.co.kr/hwpml/2011/head",
  hc: "http://www.hancom.co.kr/hwpml/2011/core",
  hs: "http://www.hancom.co.kr/hwpml/2011/section",
  opf: "http://www.idpf.org/2007/opf/",
} as const;

interface DomImpl {
  DOMParser: { new (): { parseFromString(s: string, type: string): Document } };
  XMLSerializer: { new (): { serializeToString(n: Node): string } };
}

let impl: DomImpl | null = null;

export function setDomImpl(next: DomImpl) {
  impl = next;
}

function getImpl(): DomImpl {
  if (impl) return impl;
  const g = globalThis as unknown as Partial<DomImpl>;
  if (g.DOMParser && g.XMLSerializer) {
    impl = { DOMParser: g.DOMParser, XMLSerializer: g.XMLSerializer };
    return impl;
  }
  throw new Error("XML DOM 구현을 찾을 수 없습니다.");
}

export function parseXml(text: string): Document {
  const doc = new (getImpl().DOMParser)().parseFromString(text, "application/xml");
  const root = doc.documentElement;
  if (!root || root.localName === "parsererror") {
    throw new Error("XML을 해석하지 못했습니다.");
  }
  return doc;
}

export function serializeXml(doc: Document): string {
  let s = new (getImpl().XMLSerializer)().serializeToString(doc);
  if (!s.startsWith("<?xml")) {
    s = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' + s;
  }
  return s;
}

export function serializeNode(node: Node): string {
  return new (getImpl().XMLSerializer)().serializeToString(node);
}

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;

export function isEl(n: Node | null | undefined): n is Element {
  return !!n && n.nodeType === ELEMENT_NODE;
}

export function kids(el: Node): Element[] {
  const out: Element[] = [];
  for (let c = el.firstChild; c; c = c.nextSibling) if (isEl(c)) out.push(c);
  return out;
}

export function kid(el: Node, name: string): Element | null {
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (isEl(c) && c.localName === name) return c;
  }
  return null;
}

export function kidsNamed(el: Node, name: string): Element[] {
  return kids(el).filter((c) => c.localName === name);
}

/** 전위 순회로 모든 하위 요소를 방문합니다. 콜백이 false를 돌려주면 그 요소의 자식은 건너뜁니다. */
export function walk(el: Element, fn: (e: Element) => boolean | void) {
  const stack: Element[] = [el];
  while (stack.length) {
    const e = stack.pop()!;
    if (fn(e) === false) continue;
    const ch = kids(e);
    for (let i = ch.length - 1; i >= 0; i--) stack.push(ch[i]);
  }
}

export function descendants(el: Element, name: string): Element[] {
  const out: Element[] = [];
  walk(el, (e) => {
    if (e !== el && e.localName === name) out.push(e);
  });
  return out;
}

/** 이름이 같은 첫 하위 요소(깊이 무관). */
export function find(el: Element, name: string): Element | null {
  let hit: Element | null = null;
  walk(el, (e) => {
    if (hit) return false;
    if (e !== el && e.localName === name) {
      hit = e;
      return false;
    }
  });
  return hit;
}

export function attr(el: Element, name: string): string | null {
  return el.hasAttribute(name) ? el.getAttribute(name) : null;
}

export function attrNum(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name);
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function removeEl(el: Node) {
  el.parentNode?.removeChild(el);
}

export function hp(doc: Document, name: string): Element {
  return doc.createElementNS(NS.hp, "hp:" + name);
}

export function hh(doc: Document, name: string): Element {
  return doc.createElementNS(NS.hh, "hh:" + name);
}

/** 조상 중 이름이 일치하는 요소가 있는지(자기 자신 제외). stop 요소에서 멈춥니다. */
export function hasAncestor(el: Element, names: string[], stop?: Element | null): boolean {
  let p = el.parentNode;
  while (p && isEl(p) && p !== stop) {
    if (names.includes(p.localName)) return true;
    p = p.parentNode;
  }
  return false;
}
