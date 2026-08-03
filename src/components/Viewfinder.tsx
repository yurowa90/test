import type { CapturedImage } from "../types";

interface Props {
  image: CapturedImage | null;
  writing: boolean;
  onOpenCamera: () => void;
  onOpenGallery: () => void;
  onClear: () => void;
}

export default function Viewfinder({
  image,
  writing,
  onOpenCamera,
  onOpenGallery,
  onClear,
}: Props) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-film-deep ring-1 ring-film-line">
      {image ? (
        <img
          src={image.dataUrl}
          alt="담은 장면"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
          <p className="text-sm text-chrome-dim">장면을 담아 주세요</p>
          <div className="flex gap-2">
            <button
              onClick={onOpenCamera}
              className="rounded-lg border border-film-line bg-film-panel px-4 py-2 text-sm font-semibold text-chrome hover:border-chrome/40"
            >
              카메라로 찍기
            </button>
            <button
              onClick={onOpenGallery}
              className="rounded-lg border border-film-line px-4 py-2 text-sm text-chrome-dim hover:text-chrome"
            >
              사진 고르기
            </button>
          </div>
        </div>
      )}

      {/* 뷰파인더 모서리 브래킷 */}
      <div aria-hidden className="pointer-events-none absolute inset-3">
        <span className="absolute top-0 left-0 h-5 w-5 border-t-2 border-l-2 border-chrome/40" />
        <span className="absolute top-0 right-0 h-5 w-5 border-t-2 border-r-2 border-chrome/40" />
        <span className="absolute bottom-0 left-0 h-5 w-5 border-b-2 border-l-2 border-chrome/40" />
        <span className="absolute right-0 bottom-0 h-5 w-5 border-r-2 border-b-2 border-chrome/40" />
      </div>

      {image && !writing && (
        <button
          onClick={onClear}
          className="absolute top-3 right-3 rounded-full bg-film-deep/80 px-3 py-1.5 text-xs font-semibold text-chrome backdrop-blur hover:text-receipt"
        >
          ↺ 다시 담기
        </button>
      )}

      {writing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-film-deep/75 backdrop-blur-[2px]">
          <span className="blink h-2.5 w-2.5 rounded-full bg-shutter" aria-hidden />
          <p className="font-receipt text-sm text-receipt">
            찰칵 — 시를 짓는 중…
          </p>
        </div>
      )}
    </div>
  );
}
