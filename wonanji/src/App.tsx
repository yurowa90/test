import { useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultOrder } from "./engine/assemble";
import { lint } from "./engine/lint";
import { loadDocument, type LoadedDoc } from "./engine/load";
import { errText } from "./engine/rhwp";
import type { FormatSpec, Question, SourceAnalysis, TemplateAnalysis } from "./engine/types";
import { build, download, readFile, readSource, readTemplate, type BuildOutput } from "./pipeline";
import Dropzone from "./components/Dropzone";
import TemplateCard from "./components/TemplateCard";
import SourceList from "./components/SourceList";
import QuestionBoard from "./components/QuestionBoard";
import FormatOptions from "./components/FormatOptions";
import ResultView from "./components/ResultView";
import RulesGuide from "./components/RulesGuide";

const SAVED_TEMPLATE = "wonanji:template";

function saveTemplate(name: string, bytes: Uint8Array) {
  try {
    if (bytes.length > 3_000_000) return;
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    localStorage.setItem(SAVED_TEMPLATE, JSON.stringify({ name, data: btoa(bin) }));
  } catch {
    /* 저장 공간이 없거나 막혀 있으면 조용히 넘어갑니다 */
  }
}

function loadSavedTemplate(): { name: string; bytes: Uint8Array } | null {
  try {
    const raw = localStorage.getItem(SAVED_TEMPLATE);
    if (!raw) return null;
    const { name, data } = JSON.parse(raw) as { name: string; data: string };
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { name, bytes };
  } catch {
    return null;
  }
}

export default function App() {
  const [tpl, setTpl] = useState<TemplateAnalysis | null>(null);
  const [spec, setSpec] = useState<FormatSpec | null>(null);
  const [docs, setDocs] = useState<LoadedDoc[]>([]);
  const [order, setOrder] = useState<Question[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [out, setOut] = useState<BuildOutput | null>(null);
  const [saved] = useState(() => loadSavedTemplate());

  // 파일마다 따로 분석해, 한 파일이 실패해도 나머지와 화면은 그대로 둡니다.
  const analysis = useMemo(() => {
    const sources: SourceAnalysis[] = [];
    const docOf: number[] = [];
    const failed: { docIdx: number; message: string }[] = [];
    if (tpl) {
      docs.forEach((d, i) => {
        try {
          sources.push(readSource(sources.length, d, tpl));
          docOf.push(i);
        } catch (e) {
          failed.push({ docIdx: i, message: `「${d.name}」 문항을 나누지 못했습니다: ${errText(e)}` });
        }
      });
    }
    return { sources, docOf, failed };
  }, [docs, tpl]);
  const sources = analysis.sources;
  useEffect(() => {
    setOrder(defaultOrder(sources));
    setExcluded(new Set());
    setOut(null);
  }, [sources]);

  const active = useMemo(() => order.filter((q) => !excluded.has(q.id)), [order, excluded]);
  const preIssues = useMemo(() => (tpl && spec && active.length ? lint(tpl, sources, active, spec) : []), [tpl, spec, sources, active]);

  async function openTemplate(name: string, get: () => Promise<LoadedDoc>) {
    setErrors([]);
    setBusy("양식을 읽는 중… 처음에는 한글 엔진(약 10MB)을 내려받아 몇 초 걸립니다.");
    try {
      const doc = await get();
      const t = readTemplate(doc);
      setTpl(t);
      setSpec(t.spec);
      setOut(null);
      saveTemplate(doc.name, doc.bytes);
    } catch (e) {
      setErrors([`양식 「${name}」: ${errText(e)}`]);
    } finally {
      setBusy(null);
    }
  }

  async function addSources(files: File[]) {
    setErrors([]);
    const next: LoadedDoc[] = [];
    const errs: string[] = [];
    for (const f of files) {
      if (docs.some((d) => d.name === f.name)) {
        errs.push(`「${f.name}」은 이미 올렸습니다.`);
        continue;
      }
      setBusy(`「${f.name}」 읽는 중…`);
      try {
        next.push(await readFile(f));
      } catch (e) {
        errs.push(`「${f.name}」: ${errText(e)}`);
      }
    }
    setBusy(null);
    setErrors(errs);
    if (next.length) setDocs((d) => [...d, ...next]);
  }

  function move(id: string, dir: -1 | 1) {
    setOrder((o) => {
      const i = o.findIndex((q) => q.id === id);
      if (i < 0) return o;
      let j = i + dir;
      while (j >= 0 && j < o.length && o[j].kind !== o[i].kind) j += dir;
      if (j < 0 || j >= o.length) return o;
      const n = [...o];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
    setOut(null);
  }

  function toggle(id: string) {
    setExcluded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setOut(null);
  }

  async function make() {
    if (!tpl || !spec) return;
    setErrors([]);
    setBusy("원안지를 만드는 중…");
    try {
      setOut(await build(tpl, sources, active, spec));
    } catch (e) {
      setErrors([`원안지를 만들지 못했습니다: ${errText(e)}`]);
    } finally {
      setBusy(null);
    }
  }

  function report(o: BuildOutput): string {
    const lines = [`원안지 편집 검수 보고서 (${new Date().toLocaleString("ko-KR")})`, `양식: ${tpl?.name}`, `출제 파일: ${sources.map((s) => s.name).join(", ")}`, `결과: ${o.pages}쪽, 선택형 ${active.filter((q) => q.kind === "mcq").length}문항, 논술형 ${active.filter((q) => q.kind === "essay").length}문항`, ""];
    const label = { error: "확인 필요", warn: "검토 권장", info: "참고" } as const;
    for (const i of o.issues) {
      const n = i.questionId ? o.numbers.get(i.questionId) : undefined;
      lines.push(`[${label[i.severity]}] ${i.rule}${n ? ` (${n}번)` : ""}: ${i.message}`, `    근거: ${i.source}`);
    }
    lines.push("", "자동으로 고친 것:");
    for (const c of o.changes) lines.push(`  - ${c.questionId ? `${o.numbers.get(c.questionId) ?? ""}번 ` : ""}${c.kind}: ${c.detail}`);
    return lines.join("\n");
  }

  function onDownload(kind: "hwp" | "hwpx" | "report") {
    if (!out) return;
    if (kind === "hwp") download(out.hwp, "원안지.hwp");
    else if (kind === "hwpx") download(out.hwpx, "원안지.hwpx");
    else download(report(out), "원안지_검수보고서.txt", "text/plain;charset=utf-8");
  }

  return (
    <div className="min-h-screen">
      <header className="blueprint-grid text-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <p className="text-xs tracking-[0.2em] text-thread-soft/80">정기시험 원안지 수합·편집</p>
          <h1 className="serif mt-1 text-3xl font-bold">원안지 편집기</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/80">
            여러 선생님이 만든 HWP 출제 파일을 학교 원안지 양식에 모아, 글꼴·크기·줄간격·선지 배열·배점 표기를 맞추고 편집 규칙을 검수합니다.
          </p>
          <p className="mt-3 inline-block rounded bg-white/10 px-2.5 py-1 text-xs text-white/90">
            시험 보안: 파일은 이 브라우저 안에서만 처리되며 어떤 서버로도 보내지 않습니다.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {busy && (
          <div role="status" className="sticky top-2 z-10 rounded-md bg-blueprint px-4 py-2 text-sm text-white shadow">
            {busy}
          </div>
        )}
        {errors.length > 0 && (
          <div role="alert" className="rounded-md bg-danger-soft px-4 py-2 text-sm text-danger">
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}

        <Step n={1} title="학교 원안지 양식" sub="유의사항·예시 문항이 들어 있는 양식 파일을 그대로 올리세요. 규칙을 읽어 편집 기준으로 씁니다.">
          {tpl ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="truncate font-semibold">{tpl.name}</p>
                <Dropzone compact disabled={!!busy} onFiles={([f]) => openTemplate(f.name, () => readFile(f))}>
                  <span className="text-sm text-ink-soft">다른 양식으로 바꾸기</span>
                </Dropzone>
              </div>
              <TemplateCard tpl={tpl} />
            </>
          ) : (
            <div className="space-y-2">
              <Dropzone
                disabled={!!busy}
                onFiles={([f]) => openTemplate(f.name, () => readFile(f))}
              >
                <p className="font-semibold">양식 파일(.hwp, .hwpx)을 끌어 놓거나 눌러서 고르세요</p>
                <p className="mt-1 text-sm text-ink-faint">예: 2026학년도 1학기 2차 정기시험 출제 문항지 양식.hwp</p>
              </Dropzone>
              {saved && (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => openTemplate(saved.name, () => loadDocument(saved.name, saved.bytes))}
                  className="text-sm text-blueprint underline-offset-2 hover:underline"
                >
                  지난번 양식 다시 쓰기: {saved.name}
                </button>
              )}
            </div>
          )}
        </Step>

        <Step n={2} title="출제 파일" sub="선생님별 출제 파일을 모두 올리세요. 빈 번호 자리·양식 머리 표·확인 사항은 알아서 뺍니다.">
          <Dropzone multiple disabled={!!busy} onFiles={addSources} compact={docs.length > 0}>
            <p className="font-semibold">{docs.length ? "파일 더 올리기" : "출제 파일(.hwp, .hwpx)을 끌어 놓거나 눌러서 고르세요. 여러 개를 한꺼번에 올릴 수 있습니다"}</p>
          </Dropzone>
          {!tpl && docs.length > 0 && (
            <div className="mt-3 rounded-md bg-warn-soft px-4 py-2 text-sm text-warn">
              <p>
                출제 파일 {docs.length}개를 받았습니다. <b>1번에 학교 양식을 올리면</b> 문항을 나눕니다.
              </p>
              <ul className="mt-1 space-y-0.5 text-ink-soft">
                {docs.map((d, i) => (
                  <li key={d.name} className="flex items-center justify-between gap-2">
                    <span className="truncate">{d.name}</span>
                    <button type="button" onClick={() => setDocs((x) => x.filter((_, k) => k !== i))} className="shrink-0 rounded px-2 text-xs hover:bg-danger-soft hover:text-danger">
                      빼기
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {analysis.failed.map((f) => (
            <div key={f.docIdx} role="alert" className="mt-3 flex items-start justify-between gap-3 rounded-md bg-danger-soft px-4 py-2 text-sm text-danger">
              <span>{f.message}</span>
              <button type="button" onClick={() => setDocs((x) => x.filter((_, k) => k !== f.docIdx))} className="shrink-0 rounded px-2 text-xs hover:bg-white/60">
                빼기
              </button>
            </div>
          ))}
          {sources.length > 0 && (
            <div className="mt-3">
              <SourceList sources={sources} onRemove={(i) => setDocs((d) => d.filter((_, k) => k !== analysis.docOf[i]))} />
            </div>
          )}
        </Step>

        {order.length > 0 && tpl && spec && (
          <>
            <Step n={3} title="문항 배열" sub="합칠 순서와 뺄 문항을 정합니다.">
              <QuestionBoard
                order={order}
                excluded={excluded}
                issues={preIssues}
                onMove={move}
                onToggle={toggle}
                onReset={() => {
                  setOrder(defaultOrder(sources));
                  setExcluded(new Set());
                  setOut(null);
                }}
              />
            </Step>

            <Step n={4} title="편집 옵션" sub="양식에서 읽은 값으로 채워 두었습니다.">
              <FormatOptions
                spec={spec}
                sources={sources}
                onChange={(s) => {
                  setSpec(s);
                  setOut(null);
                }}
              />
            </Step>

            <Step n={5} title="원안지 만들기">
              <button type="button" disabled={!!busy || !active.length} onClick={make} className="rounded-md bg-thread px-5 py-2.5 font-semibold text-white hover:brightness-95 disabled:opacity-50">
                {out ? "옵션을 반영해 다시 만들기" : "원안지 만들기"}
              </button>
              {out && (
                <div className="mt-6">
                  <ResultView out={out} order={active} baseName="원안지" onDownload={onDownload} />
                </div>
              )}
            </Step>
          </>
        )}

        <details className="rounded-lg border border-paper-line bg-white px-5 py-4">
          <summary className="cursor-pointer font-semibold">이 도구가 하는 일과 하지 않는 일</summary>
          <div className="mt-4">
            <RulesGuide />
          </div>
        </details>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-ink-faint sm:px-6">
        한글 문서 읽기·그리기: rhwp(@rhwp/core, MIT). “한글”, “HWP”, “HWPX”는 한글과컴퓨터의 상표입니다. 결과 파일은 반드시 한글에서 최종 확인하세요.
      </footer>
    </div>
  );
}

function Step({ n, title, sub, dim, children }: { n: number; title: string; sub?: string; dim?: boolean; children: ReactNode }) {
  return (
    <section className={`rounded-lg border border-paper-line bg-white/70 px-5 py-5 ${dim ? "opacity-50" : ""}`}>
      <div className="mb-4 flex items-baseline gap-3">
        <span className="serif text-2xl font-bold text-thread">{n}</span>
        <div>
          <h2 className="serif text-xl font-semibold">{title}</h2>
          {sub && <p className="text-sm text-ink-faint">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
