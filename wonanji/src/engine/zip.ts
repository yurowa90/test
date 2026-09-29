import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

export type FileMap = Map<string, Uint8Array>;

export function unzip(bytes: Uint8Array): FileMap {
  const raw = unzipSync(bytes);
  return new Map(Object.entries(raw));
}

/** HWPX(OCF)는 mimetype이 맨 앞, 무압축이어야 합니다. */
export function zip(files: FileMap): Uint8Array {
  const input: Zippable = {};
  const mt = files.get("mimetype");
  if (mt) input["mimetype"] = [mt, { level: 0 }];
  for (const [path, data] of files) {
    if (path === "mimetype") continue;
    input[path] = [data, { level: 6 }];
  }
  return zipSync(input);
}

export const u8ToStr = (u: Uint8Array) => strFromU8(u);
export const strToU8Bytes = (s: string) => strToU8(s);

export function sniffFormat(bytes: Uint8Array): "hwp" | "hwpx" | "unknown" {
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return "hwp";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "hwpx";
  return "unknown";
}
