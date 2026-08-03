import { useState } from "react";
import { DEFAULT_MODEL } from "../lib/gemini";
import type { PrintTarget } from "../types";

interface Props {
  open: boolean;
  initialKey: string;
  initialModel: string;
  initialPrint: PrintTarget;
  onSave: (key: string, model: string, print: PrintTarget) => void;
  onClose: () => void;
}

const MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (권장 · 빠름)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (고품질 · 느림)" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
];

const inputClass =
  "mt-1.5 w-full rounded-lg border border-film-line bg-film-deep px-3 py-2 text-sm text-receipt focus:border-chrome/60 focus:outline-none";

export default function SettingsModal({
  open,
  initialKey,
  initialModel,
  initialPrint,
  onSave,
  onClose,
}: Props) {
  const [key, setKey] = useState(initialKey);
  const [model, setModel] = useState(initialModel || DEFAULT_MODEL);
  const [print, setPrint] = useState<PrintTarget>(initialPrint);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-film-panel p-6 ring-1 ring-film-line"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="settings-title" className="text-lg font-bold text-receipt">
          카메라 설정
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-chrome-dim">
          API 키는 이 브라우저에만 저장되며(localStorage) 서버로 전송되지
          않습니다. 호출은 브라우저에서 Google로 직접 전송됩니다.
        </p>

        <label className="mt-5 block text-sm font-semibold text-chrome">
          Gemini API 키
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AIza..."
            autoComplete="off"
            className={`${inputClass} font-mono`}
          />
        </label>

        <label className="mt-4 block text-sm font-semibold text-chrome">
          모델
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={inputClass}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-sm font-semibold text-chrome">
          인쇄 방식
          <select
            value={print}
            onChange={(e) => setPrint(e.target.value as PrintTarget)}
            className={inputClass}
          >
            <option value="a4">일반 프린터 — A4에 인쇄해 잘라 쓰기</option>
            <option value="58">감열 프린터 58mm (PT-210 등 휴대용)</option>
            <option value="80">감열 프린터 80mm (매장용)</option>
          </select>
        </label>

        <p className="mt-4 text-xs text-chrome-dim">
          키는{" "}
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-receipt underline decoration-chrome/40 underline-offset-2"
          >
            Google AI Studio
          </a>
          에서 무료로 발급할 수 있습니다.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-chrome-dim hover:text-chrome"
          >
            취소
          </button>
          <button
            onClick={() => onSave(key.trim(), model, print)}
            disabled={!key.trim()}
            className="rounded-lg bg-receipt px-4 py-2 text-sm font-bold text-ink hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
