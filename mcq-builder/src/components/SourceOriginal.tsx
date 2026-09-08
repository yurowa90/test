import { useEffect, useRef, useState } from 'react';
import type { SourceReference } from '../types';
import { ATTACHMENT_ACCEPT, loadAttachments, releaseAttachments } from '../lib/attachments';
import type { Attachment } from '../lib/attachments';
import { applySourceReading } from '../lib/source-reading';
import type { SourceReading } from '../lib/source-reading';

interface Props {
  source: SourceReference;
  busy: boolean;
  onChange: (patch: Partial<SourceReference>) => void;
  onRead: (sourceId: string, attachments: Attachment[]) => Promise<SourceReading | null>;
}

export default function SourceOriginal({ source, busy, onChange, onRead }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [reading, setReading] = useState<SourceReading | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => releaseAttachments(attachments), [attachments]);

  async function selectFiles(files: File[]) {
    if (!files.length || preparing || busy) return;
    setPreparing(true); setError('');
    try {
      const loaded = await loadAttachments(files);
      if (!mounted.current) { releaseAttachments(loaded); return; }
      setAttachments(loaded); setReading(null); onChange({ verified: false });
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '첨부를 읽지 못했습니다. 기존 파일은 유지했습니다.'); }
    finally { if (mounted.current) setPreparing(false); }
  }

  return <section className="source-original" aria-label="출처 원문 첨부">
    <label>출처 원문 첨부 (PDF·그림)
      <input type="file" accept={ATTACHMENT_ACCEPT} multiple disabled={busy || preparing} onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void selectFiles(files); }} />
    </label>
    <p>PDF·PNG·JPG·JPEG·WebP · 최대 3개, 합계 8MB. 논문 그래프나 교과서 그림을 이미지로 첨부할 수 있습니다.</p>
    {preparing && <p role="status">첨부 원문을 여는 중입니다.</p>}
    {error && <p className="editorial-alert" role="alert">{error}</p>}
    {attachments.length > 0 && <>
      <div className="source-original-previews">{attachments.map(a => <figure key={a.url}>
        <figcaption>{a.name}</figcaption>
        {a.mimeType === 'application/pdf' ? <object data={a.url} type="application/pdf" aria-label={a.name}><a href={a.url} target="_blank" rel="noreferrer">원문 PDF 열기</a></object> : <img src={a.url} alt={`출처 원문: ${a.name}`} />}
        <a href={a.url} target="_blank" rel="noreferrer">원문 크게 열기</a>
      </figure>)}</div>
      <div className="growth-actions">
        <button type="button" disabled={busy || preparing} onClick={async () => { setError(''); const result = await onRead(source.id, attachments); if (mounted.current && result) setReading(result); }}>첨부 원문에서 수치·내용 읽기</button>
        <button type="button" disabled={busy || preparing} onClick={() => { setAttachments([]); setReading(null); setError(''); }}>첨부 해제</button>
      </div>
      <p>그림을 보며 아래 자료를 직접 입력할 수도 있습니다. ‘수치·내용 읽기’를 누르면 첨부 원문을 Google Gemini로 전송합니다.</p>
      <p>첨부 원본은 이 입력 화면에서만 유지됩니다. 아래 자료에 반영한 판독 내용은 자동 저장됩니다.</p>
    </>}
    {reading && <div className="source-reading-result">
      <h5>첨부 원문 판독 결과</h5>
      <label>수치·조건을 원문과 대조한 뒤 반영하세요.<textarea rows={7} disabled={busy} value={reading.dataExcerpt} onChange={e => setReading({ ...reading, dataExcerpt: e.target.value })} /></label>
      {reading.notes.length > 0 && <ul>{reading.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>}
      <div className="growth-actions"><button type="button" disabled={busy || !reading.dataExcerpt.trim()} onClick={() => { onChange(applySourceReading(source, reading)); setReading(null); }}>{source.dataExcerpt.trim() ? '읽기 결과를 기존 자료에 추가' : '읽기 결과를 아래 자료에 반영'}</button><button type="button" disabled={busy} onClick={() => setReading(null)}>판독 결과 닫기</button></div>
      <p>반영 후 출처의 ‘원문 대조 확인’을 다시 체크해야 합니다.</p>
    </div>}
  </section>;
}
