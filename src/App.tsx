import { useEffect, useRef, useState } from "react";
import type { CapturedImage, PaperWidth, PoemForm, PoemResult } from "./types";
import {
  BluetoothPrinter,
  BluetoothPrinterError,
  isBluetoothSupported,
} from "./lib/bluetooth";
import { canvasToEscpos } from "./lib/escpos";
import { DEFAULT_MODEL, GeminiError, generatePoem } from "./lib/gemini";
import { ImageError, fileToCaptured } from "./lib/image";
import { FORMS, formLabel } from "./lib/prompts";
import { ensureReceiptFont, renderReceipt } from "./lib/receipt";
import {
  API_KEY_STORAGE,
  FORM_STORAGE,
  MODEL_STORAGE,
  PAPER_STORAGE,
  storage,
} from "./lib/storage";
import Receipt, { TearEdge } from "./components/Receipt";
import SettingsModal from "./components/SettingsModal";
import Viewfinder from "./components/Viewfinder";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function formatDate(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${DAY_NAMES[d.getDay()]}) ${hh}:${mm}`;
}

const actionClass =
  "rounded-lg border border-film-line bg-film-panel px-3 py-2.5 text-sm font-semibold text-chrome hover:border-chrome/40 disabled:cursor-not-allowed disabled:opacity-40";

export default function App() {
  const [apiKey, setApiKey] = useState(() => storage.get(API_KEY_STORAGE) ?? "");
  const [model, setModel] = useState(
    () => storage.get(MODEL_STORAGE) || DEFAULT_MODEL,
  );
  const [paper, setPaper] = useState<PaperWidth>(() =>
    storage.get(PAPER_STORAGE) === "80" ? 80 : 58,
  );
  const [form, setForm] = useState<PoemForm>(() => {
    const saved = storage.get(FORM_STORAGE);
    return FORMS.some((f) => f.id === saved) ? (saved as PoemForm) : "free";
  });

  const [image, setImage] = useState<CapturedImage | null>(null);
  const [result, setResult] = useState<PoemResult | null>(null);
  const [writing, setWriting] = useState(false);
  const [btBusy, setBtBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const printerRef = useRef<BluetoothPrinter | null>(null);
  const getPrinter = () => (printerRef.current ??= new BluetoothPrinter());

  const btSupported = isBluetoothSupported();

  // 시스템 인쇄 CSS가 용지 폭을 알 수 있도록 body에 표시
  useEffect(() => {
    document.body.dataset.paper = String(paper);
  }, [paper]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    try {
      const captured = await fileToCaptured(file);
      setImage(captured);
      setResult(null);
    } catch (e) {
      setError(
        e instanceof ImageError ? e.message : "사진을 불러오지 못했습니다.",
      );
    }
  };

  const shoot = async () => {
    if (writing) return;
    if (!image) {
      cameraInput.current?.click();
      return;
    }
    if (!apiKey) {
      setSettingsOpen(true);
      return;
    }
    setWriting(true);
    setError(null);
    try {
      const poem = await generatePoem(image, form, apiKey, model);
      setResult({ poem, form, takenAt: new Date() });
    } catch (e) {
      setError(
        e instanceof GeminiError
          ? e.message
          : "시를 짓는 데 실패했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setWriting(false);
    }
  };

  const buildCanvas = async (scale: number) => {
    if (!result) throw new Error("시가 없습니다.");
    await ensureReceiptFont();
    return renderReceipt(result.poem, {
      dots: paper === 80 ? 576 : 384,
      scale,
      dateText: formatDate(result.takenAt),
      formLabel: formLabel(result.form),
    });
  };

  const printBluetooth = async () => {
    if (!result || btBusy) return;
    setBtBusy(true);
    setError(null);
    try {
      const bytes = canvasToEscpos(await buildCanvas(1));
      await getPrinter().print(bytes);
      setNotice(`${getPrinter().name}(으)로 보냈습니다`);
    } catch (e) {
      setError(
        e instanceof BluetoothPrinterError
          ? e.message
          : "인쇄에 실패했습니다. 프린터 상태를 확인해 주세요.",
      );
    } finally {
      setBtBusy(false);
    }
  };

  const savePng = async () => {
    if (!result) return;
    const canvas = await buildCanvas(2);
    const t = result.takenAt;
    const stamp = `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, "0")}${String(t.getDate()).padStart(2, "0")}-${String(t.getHours()).padStart(2, "0")}${String(t.getMinutes()).padStart(2, "0")}`;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `poem-${stamp}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
    setNotice("영수증 이미지를 저장했습니다");
  };

  const copyText = async () => {
    if (!result) return;
    const text = `${result.poem.title}\n\n${result.poem.lines.join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      setNotice("시를 복사했습니다");
    } catch {
      setError("복사에 실패했습니다. PNG 저장을 대신 사용해 주세요.");
    }
  };

  const reset = () => {
    setImage(null);
    setResult(null);
    setError(null);
  };

  const dateText = result ? formatDate(result.takenAt) : "";
  const resultFormLabel = result ? formLabel(result.form) : "";

  return (
    <>
      <div
        id="app-root"
        className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-6 pb-16"
      >
        <header className="flex items-start justify-between">
          <div>
            <p className="m-0 flex items-center gap-2 text-[13px] font-bold tracking-[0.3em] text-chrome">
              <span
                className="inline-block h-2 w-2 rounded-full bg-shutter"
                aria-hidden
              />
              POETRY CAMERA
            </p>
            <p className="m-0 mt-1 text-xs text-chrome-dim">
              찍으면, 시가 나옵니다
            </p>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="카메라 설정"
            className="rounded-full border border-film-line p-2 text-chrome-dim hover:text-chrome"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
            </svg>
          </button>
        </header>

        <main className="mt-5 flex flex-col">
          <Viewfinder
            image={image}
            writing={writing}
            onOpenCamera={() => cameraInput.current?.click()}
            onOpenGallery={() => galleryInput.current?.click()}
            onClear={reset}
          />

          {/* 필름 고르듯 시 형식 선택 */}
          <div
            className="mt-4 flex justify-center gap-2"
            role="radiogroup"
            aria-label="시 형식"
          >
            {FORMS.map((f) => (
              <button
                key={f.id}
                role="radio"
                aria-checked={form === f.id}
                onClick={() => {
                  setForm(f.id);
                  storage.set(FORM_STORAGE, f.id);
                }}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  form === f.id
                    ? "border-receipt bg-receipt text-ink"
                    : "border-film-line text-chrome-dim hover:text-chrome"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* 셔터 */}
          <div className="mt-5 flex flex-col items-center gap-2.5">
            <button
              onClick={shoot}
              disabled={writing}
              aria-label={image ? "이 장면으로 시 짓기" : "카메라 열기"}
              className={`h-[72px] w-[72px] rounded-full border-4 transition-colors disabled:opacity-50 ${
                image
                  ? "border-receipt/80 bg-shutter active:bg-shutter-deep"
                  : "border-film-line bg-film-panel hover:border-chrome/40"
              }`}
            />
            <p className="m-0 text-xs text-chrome-dim">
              {writing
                ? "짓는 중…"
                : image
                  ? "셔터를 누르면 이 장면으로 시를 짓습니다"
                  : "셔터를 누르면 카메라가 열립니다"}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-shutter/50 bg-shutter/10 px-4 py-3 text-sm leading-relaxed text-[#f2b3a3]"
            >
              {error}
            </div>
          )}

          {/* 프린터 배출구 */}
          <div className="mt-7">
            <div
              className="rounded-2xl bg-film-panel px-5 py-3 ring-1 ring-film-line"
              aria-hidden
            >
              <div className="mx-auto h-1.5 w-3/4 rounded-full bg-film-deep shadow-[inset_0_1px_3px_rgba(0,0,0,0.9)]" />
            </div>

            {result && (
              <>
                <div className="overflow-hidden px-6 pb-1">
                  <div
                    key={result.takenAt.getTime()}
                    className="receipt-feed mx-auto w-[288px] max-w-full text-[13px]"
                  >
                    <Receipt
                      poem={result.poem}
                      dateText={dateText}
                      formLabel={resultFormLabel}
                    />
                    <TearEdge />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={printBluetooth}
                    disabled={btBusy || !btSupported}
                    className="col-span-2 rounded-lg bg-receipt px-3 py-3 text-sm font-bold text-ink hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {btBusy ? "인쇄 중…" : "블루투스 프린터로 인쇄"}
                  </button>
                  <button onClick={() => window.print()} className={actionClass}>
                    시스템 인쇄
                  </button>
                  <button onClick={savePng} className={actionClass}>
                    PNG 저장
                  </button>
                  <button onClick={copyText} className={actionClass}>
                    시 복사
                  </button>
                  <button onClick={reset} className={actionClass}>
                    다시 찍기
                  </button>
                </div>
                {!btSupported && (
                  <p className="mt-2.5 text-xs leading-relaxed text-chrome-dim">
                    이 브라우저는 블루투스 인쇄를 지원하지 않습니다(Android
                    Chrome·데스크톱 Chrome 필요). PNG로 저장한 뒤 RawBT 같은
                    프린터 앱으로 인쇄할 수 있습니다.
                  </p>
                )}
              </>
            )}
          </div>
        </main>

        <footer className="mt-10 text-center text-[11px] leading-relaxed text-chrome-dim">
          <p className="m-0">
            사진은 시를 짓는 동안 Google Gemini API로만 전송되며, 별도 서버에
            저장되지 않습니다.
          </p>
          <p className="m-0 mt-1">
            <a
              href="https://github.com/bokito-studio/poetry-camera-rpi"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-chrome/40 underline-offset-2 hover:text-chrome"
            >
              Poetry Camera
            </a>
            에서 영감을 받은 DIY 웹 버전
          </p>
        </footer>
      </div>

      {/* 시스템 인쇄 전용 사본 — @media print에서만 보인다 */}
      {result && (
        <div id="printable">
          <Receipt
            poem={result.poem}
            dateText={dateText}
            formLabel={resultFormLabel}
          />
        </div>
      )}

      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files);
          e.target.value = "";
        }}
      />

      {settingsOpen && (
        <SettingsModal
          open={settingsOpen}
          initialKey={apiKey}
          initialModel={model}
          initialPaper={paper}
          onSave={(key, newModel, newPaper) => {
            setApiKey(key);
            setModel(newModel);
            setPaper(newPaper);
            storage.set(API_KEY_STORAGE, key);
            storage.set(MODEL_STORAGE, newModel);
            storage.set(PAPER_STORAGE, String(newPaper));
            setSettingsOpen(false);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {notice && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-receipt px-4 py-2 text-sm font-bold text-ink shadow-lg"
        >
          {notice}
        </div>
      )}
    </>
  );
}
