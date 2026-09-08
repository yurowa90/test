export type Attachment = {
  name: string;
  mimeType: string;
  data: string;
  url: string;
  size: number;
};

export const ATTACHMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

const MAX_FILES = 3;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const EXTENSION_MIMES: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
};
const SUPPORTED_MIMES = new Set(Object.values(EXTENSION_MIMES));

function declaredMime(file: File): string {
  const mime = file.type.trim().toLowerCase();
  return mime === "image/jpg" ? "image/jpeg" : mime;
}

function extensionMime(file: File): string | undefined {
  const extension = /\.([^.]+)$/.exec(file.name)?.[1].toLowerCase();
  if (extension && !Object.hasOwn(EXTENSION_MIMES, extension)) {
    throw new Error(`${file.name}: PDF, PNG, JPG, JPEG, WebP 파일만 첨부할 수 있습니다.`);
  }
  return extension ? EXTENSION_MIMES[extension] : undefined;
}

function detectedMime(bytes: Uint8Array): string | undefined {
  const startsWith = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length && signature.every((byte, i) => bytes[offset + i] === byte);
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return undefined;
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(chunks.join(""));
}

/** Reads a complete replacement selection without changing or releasing existing attachments. */
export async function loadAttachments(files: File[]): Promise<Attachment[]> {
  if (files.length > MAX_FILES) throw new Error("원문 파일은 최대 3개까지 첨부할 수 있습니다.");
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) {
    throw new Error("원문 파일의 합계 용량은 8MB 이하여야 합니다.");
  }
  const declared = files.map(file => {
    if (file.size === 0) throw new Error(`${file.name}: 빈 파일은 첨부할 수 없습니다.`);
    const mime = declaredMime(file);
    const extension = extensionMime(file);
    if (mime && mime !== "application/octet-stream" && !SUPPORTED_MIMES.has(mime)) {
      throw new Error(`${file.name}: PDF, PNG, JPG, JPEG, WebP 파일만 첨부할 수 있습니다.`);
    }
    if (SUPPORTED_MIMES.has(mime) && extension && mime !== extension) {
      throw new Error(`${file.name}: 확장자와 파일 형식이 일치하지 않습니다.`);
    }
    return { mime, extension };
  });

  const attachments: Attachment[] = [];
  try {
    for (const [index, file] of files.entries()) {
      let buffer: ArrayBuffer;
      try {
        buffer = await file.arrayBuffer();
      } catch {
        throw new Error(`${file.name}: 파일을 읽지 못했습니다. 파일을 다시 선택해 주세요.`);
      }
      const bytes = new Uint8Array(buffer);
      const mimeType = detectedMime(bytes);
      const { mime, extension } = declared[index];
      if (!mimeType || (extension && extension !== mimeType) || (SUPPORTED_MIMES.has(mime) && mime !== mimeType)) {
        throw new Error(`${file.name}: 파일 내용이 PDF, PNG, JPG, JPEG, WebP 형식과 일치하지 않습니다.`);
      }
      const data = encodeBase64(bytes);
      // A normalized Blob also gives extension-only uploads the correct preview Content-Type.
      const url = URL.createObjectURL(new Blob([buffer], { type: mimeType }));
      attachments.push({ name: file.name, mimeType, data, url, size: file.size });
    }
    return attachments;
  } catch (error) {
    releaseAttachments(attachments);
    throw error;
  }
}

export function releaseAttachments(attachments: Attachment[]): void {
  for (const attachment of attachments) URL.revokeObjectURL(attachment.url);
}
