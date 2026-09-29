import { useState, type ReactNode } from "react";

interface Props {
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  children: ReactNode;
  compact?: boolean;
}

// 확장자와 함께 한글 문서 MIME도 적어 두어, 모바일 브라우저가 .hwp를 흐리게 막는 일을 줄입니다.
const ACCEPT = ".hwp,.hwpx,application/x-hwp,application/haansofthwp,application/vnd.hancom.hwp,application/vnd.hancom.hwpx,application/hwp+zip";

/**
 * 파일 올리기 영역. <label>로 감싼 기본 파일 입력을 써서, 스크립트로 click()을 부르지 않고도
 * 모든 브라우저(Safari·모바일 포함)에서 파일 선택 창이 열립니다. 끌어 놓기도 됩니다.
 * 파일 종류는 여기서 거르지 않고, 읽을 때 내용으로 판별해 오류를 보여 줍니다.
 */
export default function Dropzone({ multiple, disabled, onFiles, children, compact }: Props) {
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
      className={`block w-full rounded-lg border-2 border-dashed text-left transition-colors focus-within:border-thread ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      } ${compact ? "px-4 py-3" : "px-5 py-7"} ${over ? "border-thread bg-thread-soft/60" : "border-paper-line bg-white hover:border-thread/60 hover:bg-paper-deep/40"}`}
    >
      {children}
      <input
        type="file"
        accept={ACCEPT}
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
