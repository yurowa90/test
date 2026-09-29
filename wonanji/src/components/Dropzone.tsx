import { useState, type ReactNode } from "react";

interface Props {
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  children: ReactNode;
  compact?: boolean;
  /** hwp: 양식(HWP·HWPX만), all: 문항 파일(HWP·HWPX·PDF·이미지) */
  accept?: "hwp" | "all";
}

// 확장자와 함께 한글 문서 MIME도 적어 두어, 모바일 브라우저가 .hwp를 흐리게 막는 일을 줄입니다.
const HWP = ".hwp,.hwpx,application/x-hwp,application/haansofthwp,application/vnd.hancom.hwp,application/vnd.hancom.hwpx,application/hwp+zip";
const ALL = `${HWP},.pdf,application/pdf,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp`;

/**
 * 파일 올리기 영역. <label>로 감싼 기본 파일 입력을 써서, 스크립트로 click()을 부르지 않고도
 * 모든 브라우저(Safari·모바일 포함)에서 파일 선택 창이 열립니다. 끌어 놓기도 됩니다.
 * 파일 종류는 여기서 거르지 않고, 읽을 때 내용으로 판별해 오류를 보여 줍니다.
 */
export default function Dropzone({ multiple, disabled, onFiles, children, compact, accept = "all" }: Props) {
  const [over, setOver] = useState(false);
  const take = (list: FileList | null) => {
    if (!list || !list.length) return;
    const files = [...list];
    onFiles(multiple ? files : files.slice(0, 1));
  };
  return (
    <label
      aria-disabled={disabled || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) take(e.dataTransfer.files);
      }}
      className={`block w-full border border-dashed text-left transition-colors focus-within:border-primary ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      } ${compact ? "px-4 py-2.5" : "px-5 py-7"} ${over ? "border-primary bg-primary-soft" : "border-line-strong bg-[#f6f2f0] hover:border-primary hover:bg-primary-soft/60"}`}
    >
      {children}
      <input
        type="file"
        accept={accept === "hwp" ? HWP : ALL}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
