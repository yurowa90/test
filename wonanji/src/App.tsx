import { useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultOrder } from "./engine/assemble";
import { lint } from "./engine/lint";
import type { LoadedDoc } from "./engine/load";
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

// 이 앱은 아무것도 저장하지 않습니다(localStorage·sessionStorage·IndexedDB 사용 안 함).
// 올린 파일과 결과는 이 페이지의 메모리에만 있고, 새로고침하거나 탭을 닫으면 사라집니다.
const STEPS = [
  { id: "s-template", label: "양식" },
  { id: "s-sources", label: "출제 파일" },
  { id: "s-order", label: "문항·정답" },
  { id: "s-options", label: "편집 옵션" },
  { id: "s-result", label: "원안지" },
];

export default function App() {
  const [tpl, setTpl] = useState<TemplateAnalysis | null>(null);
  const [spec, setSpec] = useState<FormatSpec | null>(null);
  const [docs, setDocs] = useState<LoadedDoc[]>([]);
  const [order, setOrder] = useState<Question[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Map<string, number[]>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [out, setOut] = useState<BuildOutput | null>(null);

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
    setAnswers(new Map());
    setOut(null);
  }, [sources]);

  // 화면에서 지정한 정답을 문항에 반영(검수·조립 모두 이 값을 씀)
  const active = useMemo(
    () =>
      order
        .filter((q) => !excluded.has(q.id))
        .map((q) => (answers.has(q.id) ? { ...q, answers: answers.get(q.id)!, answerOverride: answers.get(q.id)! } : q)),
    [order, excluded, answers],
  );
  const preIssues = useMemo(() => (tpl && spec && active.length ? lint(tpl, sources, active, spec) : []), [tpl, spec, sources, active]);

  async function openTemplate(name: string, get: () => Promise<LoadedDoc>) {
    setErrors([]);
    setBusy("양식을 읽는 중… 처음에는 한글 엔진(약 10MB)을 내려받아 몇 초 걸립니다.");
    try {
      const doc = await get();
      if (doc.format === "pdf" || doc.format === "image") throw new Error("양식은 HWP·HWPX 파일로 올려 주세요(PDF·이미지는 출제 파일로 올릴 수 있습니다).");
      const t = readTemplate(doc);
      setTpl(t);
      setSpec(t.spec);
      setOut(null);
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
      const kind = /\.pdf$/i.test(f.name) ? "PDF를 읽고 그림을 자르는 중" : /\.(png|jpe?g|webp)$/i.test(f.name) ? "이미지 글자를 인식하는 중(시간이 걸립니다)" : "읽는 중";
      setBusy(`「${f.name}」 ${kind}…`);
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

  function setAnswer(id: string, a: number[] | null) {
    setAnswers((m) => {
      const n = new Map(m);
      if (a) n.set(id, a);
      else n.delete(id);
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
      requestAnimationFrame(() => document.getElementById("s-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setErrors([`원안지를 만들지 못했습니다: ${errText(e)}`]);
    } finally {
      setBusy(null);
    }
  }

  function report(o: BuildOutput): string {
    const lines = [
      `원안지 편집 검수 보고서 (${new Date().toLocaleString("ko-KR")})`,
      `양식: ${tpl?.name}`,
      `출제 파일: ${sources.map((s) => s.name).join(", ")}`,
      `결과: ${o.pages}쪽, 선택형 ${active.filter((q) => q.kind === "mcq").length}문항, 논술형 ${active.filter((q) => q.kind === "essay").length}문항`,
      "",
    ];
    const label = { error: "확인 필요", warn: "검토 권장", info: "참고" } as const;
    for (const i of o.issues) {
      const n = i.questionId ? o.numbers.get(i.questionId) : undefined;
      lines.push(`[${label[i.severity]}] ${i.rule}${n ? ` (${n}번)` : ""}: ${i.message}`, `    근거: ${i.source}`);
    }
    lines.push("", "자동으로 고친 것(형식만, 문항 글자는 바꾸지 않음):");
    for (const c of o.changes) lines.push(`  - ${c.questionId ? `${o.numbers.get(c.questionId) ?? ""}번 ` : ""}${c.kind}: ${c.detail}`);
    return lines.join("\n");
  }

  function onDownload(kind: "hwp" | "hwpx" | "report") {
    if (!out) return;
    if (kind === "hwp") download(out.hwp, "원안지.hwp");
    else if (kind === "hwpx") download(out.hwpx, "원안지.hwpx");
    else download(report(out), "원안지_검수보고서.txt", "text/plain;charset=utf-8");
  }

  const mcqN = active.filter((q) => q.kind === "mcq").length;
  const essayN = active.filter((q) => q.kind === "essay").length;
  const current = out ? 4 : order.length ? 2 : tpl ? 1 : 0;
  return (
    <div className="min-h-screen pb-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <header className="relative mt-6 border-t-4 border-ink pb-4 pt-3">
          <span className="kicker">정기시험 원안지 수합·편집 &nbsp;/&nbsp; 브라우저 안에서만 처리</span>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="serif text-[clamp(30px,3vw,40px)] font-bold leading-tight">원안지 편집기</h1>
              <p className="mt-1 max-w-2xl text-[13.5px] text-ink-2">
                여러 선생님의 출제 파일(HWP·HWPX·PDF·사진)을 학교 원안지 양식에 모아, 글꼴·크기·줄간격·번호·〈보기〉·표·그림 크기를 양식에 맞추고 편집 규칙을 검수합니다.
              </p>
            </div>
            <div className="flex border border-ink text-[12px] font-bold">
              <span className="bg-ink px-3 py-1.5 text-paper">서버 전송 없음 · 저장 없음</span>
              <span className="border-l border-line px-3 py-1.5">HWP · PDF · 사진</span>
              <span className="border-l border-line px-3 py-1.5">한글 원안지</span>
            </div>
          </div>
          <div className="absolute inset-x-0 -bottom-1 border-b border-line-strong" />
        </header>
        <div className="border-b border-ink" />
        <p className="mt-3 border-l-[3px] border-l-ink bg-paper px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">
          <b className="text-ink">이 페이지에는 별도의 데이터베이스가 없습니다.</b> 올린 파일과 결과는 이 브라우저 탭의 메모리에만 있고, 내려받은 뒤 새로고침하거나 탭을 닫으면 어디에도 남지 않습니다.
          평가 점수에 들어가는 정기시험 문항 편집이 아니라 <b className="text-ink">형성평가·모의고사 제작용</b>으로 사용해 주세요.
        </p>

        {/* 작업 요약 띠 */}
        <nav aria-label="작업 단계" className="sticky top-0 z-20 mt-5 flex flex-wrap items-center justify-between gap-3 border border-line border-l-[3px] border-l-primary bg-surface px-3 py-2 shadow-[0_1px_0_rgba(43,31,34,0.06)]">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-2">
            <b className="text-[13px] text-ink">{tpl ? tpl.name : "양식 미선택"}</b>
            <span className="border-l border-line-strong pl-3">출제 파일 {sources.length || docs.length}개</span>
            <span className="border-l border-line-strong pl-3">
              선택형 {mcqN} · 논술형 {essayN}
            </span>
            {out && <span className="border-l border-line-strong pl-3">{out.pages}쪽</span>}
          </div>
          <ol className="-mx-1 flex max-w-full gap-0.5 overflow-x-auto whitespace-nowrap">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={i === current ? "step" : undefined}
                  className={`block px-2 py-1 text-[11.5px] font-bold ${i === current ? "bg-primary text-white" : i < current ? "text-ok" : "text-ink-3"}`}
                >
                  {i + 1}. {s.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {busy && (
          <div role="status" className="sticky top-12 z-10 mt-3 border border-primary bg-primary-soft px-4 py-2 text-sm font-semibold text-primary-hover">
            {busy}
          </div>
        )}
        {errors.length > 0 && (
          <div role="alert" className="mt-3 border border-danger/40 border-l-[3px] border-l-danger bg-danger-soft px-4 py-2 text-sm text-danger">
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}

        <main className="mt-6 space-y-6">
          <Step id="s-template" n={1} kicker="양식" title="학교 원안지 양식" sub="유의사항·예시 문항이 든 양식, 또는 학력평가 문제지처럼 문항이 채워진 문서를 그대로 올리세요. 글자·문단·번호 방식·〈보기〉·표·그림 규격을 읽습니다." accent={current === 0}>
            {tpl ? (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="serif truncate text-lg font-semibold">{tpl.name}</p>
                  <Dropzone compact disabled={!!busy} onFiles={([f]) => openTemplate(f.name, () => readFile(f))} accept="hwp">
                    <span className="text-sm font-semibold text-primary">다른 양식으로 바꾸기</span>
                  </Dropzone>
                </div>
                <TemplateCard tpl={tpl} />
              </>
            ) : (
              <div className="space-y-2">
                <Dropzone disabled={!!busy} onFiles={([f]) => openTemplate(f.name, () => readFile(f))} accept="hwp">
                  <p className="font-semibold">양식 파일(.hwp, .hwpx)을 끌어 놓거나 눌러서 고르세요</p>
                  <p className="mt-1 text-sm text-ink-3">예: 2026학년도 1학기 2차 정기시험 출제 문항지 양식.hwp · 학력평가 문제지.hwp</p>
                </Dropzone>
              </div>
            )}
          </Step>

          <Step id="s-sources" n={2} kicker="출제 파일" title="선생님별 출제 파일" sub="HWP·HWPX는 그대로, PDF는 글자를 입력한 글로 옮기고 그림·그래프는 잘라 넣으며, 사진·캡처는 글자를 인식합니다. 빈 번호 자리·양식 머리 표·확인 사항은 알아서 뺍니다." accent={current === 1}>
            <Dropzone multiple disabled={!!busy} onFiles={addSources} compact={docs.length > 0} accept="all">
              <p className="font-semibold">{docs.length ? "파일 더 올리기" : "출제 파일(.hwp, .hwpx, .pdf, 사진)을 끌어 놓거나 눌러서 고르세요. 여러 개를 한꺼번에 올릴 수 있습니다"}</p>
              {!docs.length && <p className="mt-1 text-sm text-ink-3">PDF·사진의 정답은 3단계에서 지정합니다(형광펜 정보가 없음).</p>}
            </Dropzone>
            {!tpl && docs.length > 0 && (
              <div className="mt-3 border border-warn/40 border-l-[3px] border-l-warn bg-warn-soft px-4 py-2 text-sm text-warn">
                <p>
                  출제 파일 {docs.length}개를 받았습니다. <b>1단계에 학교 양식을 올리면</b> 문항을 나눕니다.
                </p>
                <ul className="mt-1 space-y-0.5 text-ink-2">
                  {docs.map((d, i) => (
                    <li key={d.name} className="flex items-center justify-between gap-2">
                      <span className="truncate">{d.name}</span>
                      <button type="button" onClick={() => setDocs((x) => x.filter((_, k) => k !== i))} className="shrink-0 px-2 text-xs hover:text-danger">
                        빼기
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.failed.map((f) => (
              <div key={f.docIdx} role="alert" className="mt-3 flex items-start justify-between gap-3 border border-danger/40 bg-danger-soft px-4 py-2 text-sm text-danger">
                <span>{f.message}</span>
                <button type="button" onClick={() => setDocs((x) => x.filter((_, k) => k !== f.docIdx))} className="shrink-0 px-2 text-xs">
                  빼기
                </button>
              </div>
            ))}
            {sources.length > 0 && (
              <div className="mt-4">
                <SourceList sources={sources} docs={analysis.docOf.map((i) => docs[i])} onRemove={(i) => setDocs((d) => d.filter((_, k) => k !== analysis.docOf[i]))} />
              </div>
            )}
          </Step>

          {order.length > 0 && tpl && spec && (
            <>
              <Step id="s-order" n={3} kicker="문항·정답" title="문항 배열과 정답" sub="합칠 순서와 뺄 문항을 정하고, 정답 표시가 없는 문항은 정답을 고르세요. 문항마다 양식과 다른 기호·크기 문제를 함께 보여 줍니다." accent={current === 2}>
                <QuestionBoard
                  order={order}
                  excluded={excluded}
                  answers={answers}
                  issues={preIssues}
                  onMove={move}
                  onToggle={toggle}
                  onAnswer={setAnswer}
                  onReset={() => {
                    setOrder(defaultOrder(sources));
                    setExcluded(new Set());
                    setOut(null);
                  }}
                />
              </Step>

              <Step id="s-options" n={4} kicker="편집 옵션" title="편집 규격" sub="양식에서 읽은 값으로 채워 두었습니다. 문항 글자와 기호는 바꾸지 않고, 형식(글꼴·간격·번호·크기)만 맞춥니다.">
                <FormatOptions
                  spec={spec}
                  sources={sources}
                  onChange={(s) => {
                    setSpec(s);
                    setOut(null);
                  }}
                />
              </Step>

              <Step id="s-result" n={5} kicker="원안지" title="원안지 만들기" accent={current >= 3}>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" disabled={!!busy || !active.length} onClick={make} className="btn btn-primary">
                    {out ? "옵션을 반영해 다시 만들기" : "원안지 만들기"}
                  </button>
                  <span className="text-sm text-ink-2">
                    선택형 {mcqN}문항 · 논술형 {essayN}문항{answers.size ? ` · 직접 지정한 정답 ${answers.size}문항` : ""}
                  </span>
                </div>
                {out && (
                  <div className="mt-6">
                    <ResultView out={out} order={active} baseName="원안지" onDownload={onDownload} />
                  </div>
                )}
              </Step>
            </>
          )}

          <details className="fold panel px-5 py-4">
            <summary>
              <span>
                <span className="kicker">안내</span>
                <span className="serif text-lg font-semibold">이 도구가 하는 일과 하지 않는 일</span>
              </span>
            </summary>
            <div className="mt-4">
              <RulesGuide />
            </div>
          </details>
        </main>

        <footer className="mt-10 border-t border-line-strong pt-3 text-xs text-ink-3">
          한글 문서 읽기·그리기: rhwp(@rhwp/core, MIT) · PDF: pdf.js(Apache-2.0) · 글자 인식: Tesseract(Apache-2.0). 모든 파일은 이 브라우저 안에서만 처리되고 어디에도 저장되지 않습니다(데이터베이스·서버 없음). 형성평가·모의고사 제작용으로 쓰시고, 평가 점수에 들어가는 정기시험 문항 편집에는 쓰지 마세요. “한글”, “HWP”, “HWPX”는 한글과컴퓨터의 상표입니다. 결과 파일은 반드시 한글에서 최종 확인하세요.
        </footer>
      </div>
    </div>
  );
}

function Step({ id, n, kicker, title, sub, accent, children }: { id: string; n: number; kicker: string; title: string; sub?: string; accent?: boolean; children: ReactNode }) {
  return (
    <section id={id} className={`panel scroll-mt-16 px-5 pb-6 pt-5 sm:px-6 ${accent ? "panel-accent" : ""}`}>
      <div className="mb-5 flex gap-4 border-b border-line pb-4">
        <span className="step-no pt-1">{String(n).padStart(2, "0")}</span>
        <div className="min-w-0">
          <span className="kicker">{kicker}</span>
          <h2 className="serif text-[21px] font-bold leading-snug">{title}</h2>
          {sub && <p className="mt-0.5 max-w-3xl text-[13px] leading-relaxed text-ink-2">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
