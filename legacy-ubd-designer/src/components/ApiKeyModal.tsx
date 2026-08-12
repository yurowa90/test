import { useState } from "react";
import { DEFAULT_MODEL } from "../lib/gemini";

interface Props {
  open: boolean;
  initialKey: string;
  initialModel: string;
  onSave: (key: string, model: string) => void;
  onClose: () => void;
}

const MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (권장 · 빠름)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (고품질 · 느림)" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
];

export default function ApiKeyModal({
  open,
  initialKey,
  initialModel,
  onSave,
  onClose,
}: Props) {
  const [key, setKey] = useState(initialKey);
  const [model, setModel] = useState(initialModel || DEFAULT_MODEL);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="apikey-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-paper p-6 shadow-2xl ring-1 ring-paper-line"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="apikey-title" className="serif text-xl font-bold text-ink">
          Gemini API 키
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          키는 이 브라우저에만 저장되며(localStorage) 서버로 전송되지 않습니다.
          호출은 브라우저에서 Google로 직접 전송됩니다.
        </p>

        <label className="mt-5 block text-sm font-semibold text-ink">
          API 키
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AIza..."
            autoComplete="off"
            className="mt-1.5 w-full rounded-lg border border-paper-line bg-white px-3 py-2 font-mono text-sm text-ink focus:border-thread focus:outline-none"
          />
        </label>

        <label className="mt-4 block text-sm font-semibold text-ink">
          모델
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-sm text-ink focus:border-thread focus:outline-none"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <p className="mt-4 text-xs text-ink-soft">
          키는{" "}
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-blueprint underline decoration-thread/50 underline-offset-2"
          >
            Google AI Studio
          </a>
          에서 무료로 발급할 수 있습니다.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-paper-line/50"
          >
            취소
          </button>
          <button
            onClick={() => onSave(key.trim(), model)}
            disabled={!key.trim()}
            className="rounded-lg bg-blueprint px-4 py-2 text-sm font-semibold text-white hover:bg-blueprint-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
