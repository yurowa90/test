import { useRef, useState, type ReactNode } from "react";

interface Props {
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  children: ReactNode;
  compact?: boolean;
}

const ACCEPT = ".hwp,.hwpx";

export default function Dropzone({ multiple, disabled, onFiles, children, compact }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (list: FileList | null) => {
    if (!list) return;
    const files = [...list].filter((f) => /\.(hwp|hwpx)$/i.test(f.name));
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) take(e.dataTransfer.files);
      }}
      className={`w-full rounded-lg border-2 border-dashed text-left transition-colors disabled:opacity-50 ${
        compact ? "px-4 py-3" : "px-5 py-7"
      } ${over ? "border-thread bg-thread-soft/60" : "border-paper-line bg-white hover:border-thread/60 hover:bg-paper-deep/40"}`}
    >
      {children}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </button>
  );
}
