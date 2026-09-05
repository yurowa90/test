import { useEffect, useRef, useState } from "react";
import { DEFAULT_MODEL, GeminiError, listModels, normalizeKey, normalizeModel, testConnection } from "../lib/gemini-client";
import type { GeminiModel } from "../lib/gemini-client";

interface Props {
  initialKey: string; initialModel: string;
  onSave: (key: string, model: string) => void;
  onClear: () => void; onClose: () => void;
}

// Mount only while open: cancelled edits and deleted keys cannot survive reopening.
export default function ApiKeyModal({ initialKey, initialModel, onSave, onClear, onClose }: Props) {
  const [key, setKey] = useState(initialKey);
  const [model, setModel] = useState(initialModel || DEFAULT_MODEL);
  const [models, setModels] = useState<GeminiModel[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => { request.current?.abort(); element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, []);
  function invalidate() { setTested(false); setMessage(""); setError(""); }
  async function check(mode: "list" | "test") {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); invalidate();
    try {
      const cleanKey = normalizeKey(key);
      if (mode === "list") {
        const available = await listModels(cleanKey, controller.signal);
        if (controller.signal.aborted) return;
        setModels(available);
        setMessage(available.length ? `문항 생성 후보 모델 ${available.length}개를 조회했습니다. 사용할 모델을 선택하고 연결 시험을 해 주세요.` : "문항 생성에 필요한 출력 길이를 지원하는 모델이 없습니다. Google 프로젝트 설정을 확인하세요.");
      } else {
        await testConnection(cleanKey, normalizeModel(model), controller.signal);
        if (controller.signal.aborted) return;
        setTested(true); setMessage("선택한 키·모델의 JSON 응답을 확인했습니다. 저장하면 적용됩니다. 실제 문항의 품질·남은 할당량을 보장하는 시험은 아닙니다.");
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof GeminiError ? e.message : "연결 확인 중 오류가 발생했습니다. 다시 시도하세요.");
    } finally { if (!controller.signal.aborted) setBusy(false); request.current = null; }
  }
  const unavailable = models !== null && !models.some(m => m.id === model);
  const fieldClass = "mt-1.5 w-full rounded border border-paper-line bg-white px-3 py-2 text-sm";
  return <dialog ref={dialog} aria-labelledby="apikey-title" onCancel={onClose}
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded bg-paper p-6 text-ink shadow-2xl backdrop:bg-ink/50">
    <form onSubmit={e => { e.preventDefault(); if (tested && !busy) onSave(normalizeKey(key), normalizeModel(model)); }}>
      <h2 id="apikey-title" className="serif text-xl font-bold">Gemini API 연결 설정</h2>
      <p className="mt-2 text-sm text-ink-soft">키와 문항 입력은 Google API로 직접 전송됩니다. 저장한 키는 이 브라우저에 남으므로 공용 컴퓨터에서는 사용 후 삭제하세요.</p>
      <label className="mt-4 block text-sm font-semibold">API 키
        <input autoFocus type="password" value={key} disabled={busy} onChange={e => { setKey(e.target.value); setModels(null); invalidate(); }} autoComplete="off" spellCheck={false} placeholder="Google AI Studio에서 발급한 키" className={fieldClass} />
      </label>
      <button type="button" disabled={busy || !key.trim()} onClick={() => void check("list")} className="mt-3 rounded border border-paper-line px-3 py-2 text-sm disabled:opacity-40">1. 사용 가능한 모델 조회</button>
      <label className="mt-4 block text-sm font-semibold">모델
        <select value={model} disabled={busy} onChange={e => { setModel(e.target.value); invalidate(); }} className={fieldClass}>
          {!models?.some(m => m.id === model) && <option value={model}>{model} · 조회 전 또는 목록에 없음</option>}
          {models?.map(m => <option key={m.id} value={m.id}>{m.label} ({m.id})</option>)}
        </select>
      </label>
      <p className="mt-2 text-xs text-ink-soft">목록은 이 키로 조회한 텍스트 생성 후보입니다. JSON 호환성·할당량은 연결 시험에서 확인합니다. 모델을 자동으로 바꾸지 않습니다.</p>
      {unavailable && <p className="mt-2 text-sm text-rose-700">현재 모델이 목록에 없습니다. 조회된 다른 모델을 선택하세요.</p>}
      <button type="button" disabled={busy || !key.trim() || unavailable} onClick={() => void check("test")} className="mt-3 rounded border border-paper-line px-3 py-2 text-sm disabled:opacity-40">2. 선택한 모델 연결 시험</button>
      <p className="mt-2 text-xs text-ink-soft">연결 시험은 짧은 예시만 전송하며 토큰 비용·할당량이 소모될 수 있습니다. 작성 중인 문항은 전송하지 않습니다.</p>
      <div role="status" aria-live="polite" className="mt-3 text-sm">{busy ? "Google API 확인 중입니다. 취소하면 요청을 중단합니다." : message}</div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      <p className="mt-4 text-xs"><a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline">AI Studio 키 관리</a> · <a href="https://aistudio.google.com/usage" target="_blank" rel="noreferrer" className="underline">사용량·할당량 확인</a></p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {initialKey && <button type="button" disabled={busy} onClick={onClear} className="mr-auto px-3 py-2 text-sm text-rose-700">저장된 키 삭제</button>}
        <button type="button" onClick={onClose} className="px-3 py-2 text-sm">취소</button>
        <button type="submit" disabled={!tested || busy} className="rounded bg-blueprint px-4 py-2 text-sm text-white disabled:opacity-40">3. 확인한 설정 저장</button>
      </div>
    </form>
  </dialog>;
}
