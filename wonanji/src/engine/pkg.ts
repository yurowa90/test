import { attr, kid, kids, parseXml, serializeXml } from "./dom";
import { strToU8Bytes, u8ToStr, unzip, zip, type FileMap } from "./zip";

/** HWPX(OWPML) 패키지 하나. header.xml / sectionN.xml / content.hpf를 DOM으로 들고 있습니다. */
export class HwpxPackage {
  files: FileMap;
  header: Document;
  hpf: Document;
  hpfPath: string;
  sectionPaths: string[];
  sections: Document[];

  private constructor(files: FileMap) {
    this.files = files;
    this.hpfPath = [...files.keys()].find((k) => /content\.hpf$/i.test(k)) ?? "Contents/content.hpf";
    this.hpf = parseXml(this.text(this.hpfPath));
    const manifest = kid(this.hpf.documentElement, "manifest");
    const items = manifest ? kids(manifest).filter((e) => e.localName === "item") : [];
    const headerItem = items.find((i) => /header\.xml$/i.test(i.getAttribute("href") ?? ""));
    const headerPath = headerItem?.getAttribute("href") ?? "Contents/header.xml";
    this.header = parseXml(this.text(headerPath));
    this.sectionPaths = items
      .map((i) => i.getAttribute("href") ?? "")
      .filter((h) => /section\d+\.xml$/i.test(h))
      .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
    if (!this.sectionPaths.length) throw new Error("본문 구역(section)을 찾지 못했습니다.");
    this.sections = this.sectionPaths.map((p) => parseXml(this.text(p)));
  }

  static fromBytes(bytes: Uint8Array): HwpxPackage {
    return new HwpxPackage(unzip(bytes));
  }

  text(path: string): string {
    const f = this.files.get(path);
    if (!f) throw new Error(`HWPX 안에 ${path}가 없습니다.`);
    return u8ToStr(f);
  }

  get headerPath(): string {
    const manifest = kid(this.hpf.documentElement, "manifest");
    const item = manifest && kids(manifest).find((i) => /header\.xml$/i.test(attr(i, "href") ?? ""));
    return item?.getAttribute("href") ?? "Contents/header.xml";
  }

  /** 모든 DOM을 다시 직렬화해 zip 바이트로 만듭니다. */
  toBytes(): Uint8Array {
    const files: FileMap = new Map(this.files);
    files.set(this.headerPath, strToU8Bytes(serializeXml(this.header)));
    this.sections.forEach((d, i) => files.set(this.sectionPaths[i], strToU8Bytes(serializeXml(d))));
    files.set(this.hpfPath, strToU8Bytes(serializeXml(this.hpf)));
    return zip(files);
  }

  /** 본문 최상위 문단들(모든 구역을 이어 붙임). */
  topParagraphs(): Element[] {
    return this.sections.flatMap((d) => kids(d.documentElement).filter((e) => e.localName === "p"));
  }
}
