import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { defaultOrder, detectMerge } from "./engine/assemble";
import { lint } from "./engine/lint";
import type { LoadedDoc } from "./engine/load";
import { errText } from "./engine/rhwp";
import type { FormatSpec, MergeMode, Question, SourceAnalysis, SymbolFix, TemplateAnalysis } from "./engine/types";
import { build, download, readFile, readSource, readTemplate, type BuildOutput } from "./pipeline";
import { buildReport, exportWork, importWork, scoreOf } from "./work";
import Dropzone from "./components/Dropzone";
import TemplateCard from "./components/TemplateCard";
import SourceList from "./components/SourceList";
import QuestionBoard from "./components/QuestionBoard";
import FormatOptions from "./components/FormatOptions";
import ResultView, { type DownloadKind } from "./components/ResultView";
import RulesGuide from "./components/RulesGuide";

// 이 앱은 아무것도 저장하지 않습니다(localStorage·sessionStorage·IndexedDB 사용 안 함).
// 올린 파일과 결과는 이 페이지의 메모리에만 있고, 새로고침하거나 탭을 닫으면 사라집니다.
// 작업을 이어서 하려면 교사가 ‘작업 저장(.json)’으로 순서·정답·옵션을 파일로 내려받아 둡니다(문항 파일은 들어가지 않음).
const STEPS = [
  { id: "s-template", label: "양식" },
  { id: "s-sources", label: "문항 파일" },
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
  const [scores, setScores] = useState<Map<string, number>>(new Map());
  const [fixes, setFixes] = useState<Map<string, SymbolFix[]>>(new Map());
  const [fileOrder, setFileOrder] = useState<number[]>([]);
  const [editRev, setEditRev] = useState(0);
  const [busy, setBusyState] = useState<{ text: string; start: number } | null>(null);
  const [now, setNow] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [out, setOut] = useState<BuildOutput | null>(null);
  const [stale, setStale] = useState(false);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const setBusy = (text: string | null) => {
    setBusyState(text ? { text, start: Date.now() } : null);
    setNow(Date.now());
  };
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);
  const elapsed = busy ? Math.max(0, Math.round((now - busy.start) / 1000)) : 0;

  // 고정 작업 띠의 높이(모바일에서 두세 줄)를 CSS 변수로: 단계 이동·진행 표시가 띠에 가리지 않게
  useEffect(() => {
    const el = navRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--nav-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 실수로 새로고침·탭 닫기를 하면 작업이 모두 사라지므로 브라우저 확인 창을 띄웁니다(저장소는 쓰지 않음).
  useEffect(() => {
    if (!docs.length) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [docs.length]);

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
    const m = detectMerge(sources);
    const fo = sources.map((_, i) => i);
    setFileOrder(fo);
    setSpec((s) => (s ? { ...s, merge: m } : s));
    setOrder(defaultOrder(sources, m, fo));
    setExcluded(new Set());
    setAnswers(new Map());
    setScores(new Map());
    setFixes(new Map());
    setOut(null);
    setStale(false);
  }, [sources]);

  // 사진 파일의 원본 그림(3단계 글자 교정에서 대조용)
  const imageUrls = useMemo(() => {
    const m = new Map<number, string>();
    analysis.docOf.forEach((di, si) => {
      const d = docs[di];
      if (d?.format === "image") m.set(si, URL.createObjectURL(new Blob([d.bytes as BlobPart], { type: /\.png$/i.test(d.name) ? "image/png" : /\.webp$/i.test(d.name) ? "image/webp" : "image/jpeg" })));
    });
    return m;
  }, [analysis, docs]);
  useEffect(() => () => imageUrls.forEach((u) => URL.revokeObjectURL(u)), [imageUrls]);

  // 화면에서 지정한 정답·배점·기호 바꾸기를 문항에 반영(검수·조립 모두 이 값을 씀)
  const active = useMemo(
    () =>
      order
        .filter((q) => !excluded.has(q.id))
        .map((q) => {
          const a = answers.get(q.id);
          const sc = scores.get(q.id);
          const fx = fixes.get(q.id);
          if (!a && sc == null && !fx) return q;
          return { ...q, ...(a ? { answers: a, answerOverride: a } : {}), ...(sc != null ? { scoreOverride: sc } : {}), ...(fx ? { symbolFixes: fx } : {}) };
        }),
    // editRev: 교사가 글자를 고치면 문항 내용(발문·요약)이 바뀌므로 다시 계산
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order, excluded, answers, scores, fixes, editRev],
  );
  const preIssues = useMemo(() => (tpl && spec && active.length ? lint(tpl, sources, active, spec) : []), [tpl, spec, sources, active]);
  const excludedList = useMemo(() => order.filter((q) => excluded.has(q.id)), [order, excluded]);
  const markStale = () => setStale(true);

  async function openTemplate(name: string, get: () => Promise<LoadedDoc>) {
    setErrors([]);
    setNotice(null);
    setBusy("양식을 읽는 중… 처음에는 한글 엔진(약 10MB)을 내려받아 몇 초 걸립니다.");
    try {
      const doc = await get();
      if (doc.format === "pdf" || doc.format === "image") throw new Error("양식은 HWP·HWPX 파일로 올려 주세요(PDF·이미지는 문항 파일로 올릴 수 있습니다).");
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
    setNotice(null);
    const next: LoadedDoc[] = [];
    const errs: string[] = [];
    for (const [i, f] of files.entries()) {
      if (docs.some((d) => d.name === f.name)) {
        errs.push(`「${f.name}」은 이미 올렸습니다.`);
        continue;
      }
      const kind = /\.pdf$/i.test(f.name) ? "PDF를 읽고 그림을 자르는 중" : /\.(png|jpe?g|webp)$/i.test(f.name) ? "사진 글자를 인식하는 중(한 장에 10~30초)" : "읽는 중";
      setBusy(`${files.length > 1 ? `(${i + 1}/${files.length}) ` : ""}「${f.name}」 ${kind}…`);
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

  async function tryDemo() {
    setBusy("예시 파일을 만드는 중…");
    try {
      const { demoFiles } = await import("./demo/samples");
      const d = demoFiles();
      await openTemplate(d.template.name, () => readFile(d.template));
      await addSources(d.sources);
      setNotice("예시 파일(합성 문항)로 채웠습니다. 김선생 1·3번, 이선생 2번·논술형을 번호 분담 방식으로 모읍니다. 3단계부터 둘러보세요.");
    } catch (e) {
      setErrors([`예시 파일을 만들지 못했습니다: ${errText(e)}`]);
      setBusy(null);
    }
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
    markStale();
  }

  /** 포함한 문항 가운데 n번째 자리로 옮깁니다(같은 종류 안에서). */
  function moveTo(id: string, n: number) {
    setOrder((o) => {
      const q = o.find((x) => x.id === id);
      if (!q) return o;
      const same = o.filter((x) => x.kind === q.kind && x.id !== id);
      const incl = same.filter((x) => !excluded.has(x.id));
      const before = incl[n - 1];
      const at = before ? same.indexOf(before) : same.length;
      same.splice(at, 0, q);
      const mcq = q.kind === "mcq" ? same : o.filter((x) => x.kind === "mcq");
      const essay = q.kind === "essay" ? same : o.filter((x) => x.kind === "essay");
      return [...mcq, ...essay];
    });
    markStale();
    setFocus({ id, n: Date.now() });
  }

  function toggle(id: string) {
    setExcluded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    markStale();
  }

  function setAnswer(id: string, a: number[] | null) {
    setAnswers((m) => {
      const n = new Map(m);
      if (a) n.set(id, a);
      else n.delete(id);
      return n;
    });
    markStale();
  }

  /** 정답 한꺼번에: 형광펜 표시와 같으면 지정하지 않고 형광펜을 그대로 둡니다. */
  function setAnswersBulk(list: [string, number][]) {
    const byId = new Map(order.map((q) => [q.id, q]));
    setAnswers((m) => {
      const n = new Map(m);
      for (const [id, a] of list) {
        const d = byId.get(id)?.answers ?? [];
        if (d.length === 1 && d[0] === a) n.delete(id);
        else n.set(id, [a]);
      }
      return n;
    });
    markStale();
  }

  function setScore(id: string, v: number | null) {
    setScores((m) => {
      const n = new Map(m);
      if (v == null) n.delete(id);
      else n.set(id, v);
      return n;
    });
    markStale();
  }

  function setFix(id: string, f: SymbolFix[] | null) {
    setFixes((m) => {
      const n = new Map(m);
      if (f?.length) n.set(id, f);
      else n.delete(id);
      return n;
    });
    markStale();
  }

  function fixAll(ids: string[], f: SymbolFix[]) {
    setFixes((m) => {
      const n = new Map(m);
      for (const id of ids) {
        const cur = n.get(id) ?? [];
        n.set(id, [...cur, ...f.filter((x) => !cur.some((c) => c.fam === x.fam && c.from === x.from))]);
      }
      return n;
    });
    markStale();
  }

  function setMerge(m: MergeMode) {
    if (!spec) return;
    setSpec({ ...spec, merge: m });
    setOrder(defaultOrder(sources, m, fileOrder));
    markStale();
  }

  function changeFileOrder(fo: number[]) {
    setFileOrder(fo);
    if (spec) setOrder(defaultOrder(sources, spec.merge, fo));
    markStale();
  }

  function saveWork() {
    if (!tpl || !spec) return;
    const json = exportWork(tpl.name, sources, { order, excluded, answers, scores, fixes, spec, fileOrder });
    const d = new Date();
    download(json, `원안지_작업설정_${d.getMonth() + 1}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}.json`, "application/json;charset=utf-8");
    setNotice("작업 설정을 내려받았습니다. 정답이 들어 있으니 보관에 주의하세요. 다음에 같은 양식·문항 파일을 올린 뒤 3단계 ‘작업 불러오기’로 되살립니다.");
  }

  async function loadWork(f: File) {
    if (!tpl || !spec) return;
    setErrors([]);
    try {
      const r = importWork(await f.text(), tpl.name, sources, { order, excluded, answers, scores, fixes, spec, fileOrder });
      setOrder(r.state.order);
      setExcluded(r.state.excluded);
      setAnswers(r.state.answers);
      setScores(r.state.scores);
      setFixes(r.state.fixes);
      setSpec(r.state.spec);
      setFileOrder(r.state.fileOrder);
      if (r.edits) setEditRev((x) => x + 1);
      markStale();
      setNotice(
        `작업 설정을 불러왔습니다: 문항 ${r.matched}개의 순서${r.state.answers.size ? `, 지정 정답 ${r.state.answers.size}` : ""}${r.state.scores.size ? `, 지정 배점 ${r.state.scores.size}` : ""}${r.edits ? `, 고친 글자 ${r.edits}문단` : ""}.${r.missing ? ` 지금 올린 파일에서 찾지 못한 문항 ${r.missing}개는 건너뛰었습니다.` : ""}${r.templateMismatch ? " 저장할 때와 양식 이름이 다릅니다." : ""}`,
      );
    } catch (e) {
      setErrors([errText(e)]);
    }
  }

  function focusQuestion(id: string) {
    setFocus({ id, n: Date.now() });
  }

  async function make() {
    if (!tpl || !spec) return;
    setErrors([]);
    setBusy("원안지를 만드는 중… (조립 → 줄 맞춤 → 균등 배치 → 미리보기)");
    try {
      setOut(await build(tpl, sources, active, spec));
      setStale(false);
      requestAnimationFrame(() => document.getElementById("s-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setErrors([`원안지를 만들지 못했습니다: ${errText(e)}`]);
    } finally {
      setBusy(null);
    }
  }

  async function onDownload(kind: DownloadKind, base: string) {
    if (!out || !tpl || !spec) return;
    const name = base.trim() || "원안지";
    if (kind === "hwp") download(out.hwp, `${name}_교사용.hwp`);
    else if (kind === "hwpx") download(out.hwpx, `${name}_교사용.hwpx`);
    else if (kind === "report") download(buildReport({ tplName: tpl.name, sources, active, excluded: excludedList, spec, out }), `${name}_검수보고서.txt`, "text/plain;charset=utf-8");
    else {
      setBusy("학생 배부용(정답 음영 없음) 파일을 만드는 중…");
      try {
        const s = await out.student();
        download(s.hwp, `${name}_학생용.hwp`);
        setNotice(`학생 배부용 파일을 내려받았습니다. 선택형 정답 음영 ${s.cleared}곳을 지웠습니다(글자·배치는 교사용과 같음).`);
      } catch (e) {
        setErrors([`학생 배부용 파일을 만들지 못했습니다: ${errText(e)}`]);
      } finally {
        setBusy(null);
      }
    }
  }

  // 만들기 전 요약: 결과에 그대로 남는 빈칸·확인 거리
  const summary = useMemo(() => {
    if (!spec) return [];
    const items: { label: string; ids: string[]; tone: "danger" | "warn" }[] = [];
    const noAns = active.filter((q) => q.kind === "mcq" && !q.answers.length).map((q) => q.id);
    const noScore = active.filter((q) => scoreOf(q, spec) == null).map((q) => q.id);
    const ids = (rule: string, sev?: string) => [...new Set(preIssues.filter((i) => i.rule === rule && (!sev || i.severity === sev) && i.questionId).map((i) => i.questionId!))];
    if (noAns.length) items.push({ label: `정답 미지정 ${noAns.length}`, ids: noAns, tone: "danger" });
    if (noScore.length) items.push({ label: `배점 없음 ${noScore.length}`, ids: noScore, tone: "danger" });
    const ocr = ids("글자 인식 확인");
    if (ocr.length) items.push({ label: `사진 글자 확인 ${ocr.length}`, ids: ocr, tone: "warn" });
    const dup = ids("번호 중복");
    if (dup.length) items.push({ label: `번호 중복 ${dup.length}`, ids: dup, tone: "danger" });
    const same = ids("중복 문항 의심");
    if (same.length) items.push({ label: `중복 문항 의심 ${same.length}`, ids: same, tone: "warn" });
    return items;
  }, [active, preIssues, spec]);

  const mcqN = active.filter((q) => q.kind === "mcq").length;
  const essayN = active.filter((q) => q.kind === "essay").length;
  const noAnswerN = active.filter((q) => q.kind === "mcq" && !q.answers.length).length;
  const current = out ? 4 : order.length ? 2 : tpl ? 1 : 0;
  const negRule = tpl?.rules.find((r) => r.key === "negation")?.value ?? tpl?.rules.find((r) => r.key === "negation")?.text ?? null;
  return (
    <div className="min-h-screen pb-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <header className="relative mt-6 border-t-4 border-ink pb-4 pt-3">
          <span className="kicker">원안지 수합·편집 &nbsp;/&nbsp; 형성평가·모의고사용 &nbsp;/&nbsp; 브라우저 안에서만 처리</span>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="serif text-[clamp(30px,3vw,40px)] font-bold leading-tight">원안지 편집기</h1>
              <p className="mt-1 max-w-2xl text-[13.5px] text-ink-2">여러 형태의 문항 파일과 형식을 동일한 양식으로 맞추고 검수합니다.</p>
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
          <b className="text-ink">이 페이지에는 별도의 데이터베이스가 없습니다.</b> 올린 파일과 결과는 이 브라우저 탭의 메모리에만 있고, 새로고침하거나 탭을 닫으면 어디에도 남지 않습니다. 평가 점수에 들어가는 정기시험 문항 편집이 아니라 <b className="text-ink">형성평가·모의고사 제작용</b>으로 사용해 주세요.
          {docs.length > 0 && (
            <span className="mt-1 block font-semibold text-warn">
              지금 작업은 이 탭에만 있습니다. 새로고침하면 처음부터 다시 해야 하니, 길게 작업할 때는 3단계의 ‘작업 저장(.json)’으로 순서·정답·배점을 보관하세요.
            </span>
          )}
        </p>

        {/* 작업 요약 띠 */}
        <nav ref={navRef} aria-label="작업 단계" className="sticky top-0 z-20 mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border border-line border-l-[3px] border-l-primary bg-surface px-3 py-2 shadow-[0_1px_0_rgba(43,31,34,0.06)]">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-ink-2">
            <b className="max-w-[12rem] truncate text-[13px] text-ink">{tpl ? tpl.name : "양식 미선택"}</b>
            <span className="border-l border-line-strong pl-3">문항 파일 {sources.length || docs.length}개</span>
            <span className="border-l border-line-strong pl-3">
              선택형 {mcqN} · 논술형 {essayN}
            </span>
            {out && (
              <span className="border-l border-line-strong pl-3">
                {out.pages}쪽{stale ? " (바뀜)" : ""}
              </span>
            )}
          </div>
          <ol className="-mx-1 flex max-w-full gap-0.5 overflow-x-auto whitespace-nowrap">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} aria-current={i === current ? "step" : undefined} className={`block px-2 py-1.5 text-[12px] font-bold ${i === current ? "bg-primary text-white" : i < current ? "text-ok" : "text-ink-3"}`}>
                  {i + 1}. {s.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {busy && (
          <div role="status" className="sticky top-nav z-10 mt-3 flex items-center gap-3 border border-primary bg-primary-soft px-4 py-2 text-sm font-semibold text-primary-hover">
            <span className="inline-block h-3 w-3 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden />
            <span className="min-w-0 flex-1">{busy.text}</span>
            <span className="shrink-0 tabular-nums text-ink-2">{elapsed}초</span>
          </div>
        )}
        {errors.length > 0 && (
          <div role="alert" className="mt-3 border border-danger/40 border-l-[3px] border-l-danger bg-danger-soft px-4 py-2 text-sm text-danger">
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}
        {notice && (
          <div role="status" className="mt-3 flex items-start justify-between gap-3 border border-ok/40 border-l-[3px] border-l-ok bg-ok-soft px-4 py-2 text-sm text-ok">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="shrink-0 px-1 text-xs" aria-label="알림 닫기">
              닫기
            </button>
          </div>
        )}

        <main className="mt-6 space-y-6">
          <Step id="s-template" n={1} kicker="학교 양식 읽기" title="평가 문제지 양식" sub="유의사항·예시 문항이 든 양식, 또는 학력평가 문제지처럼 문항이 채워진 문서를 그대로 올리세요. 글자·문단·번호 방식·〈보기〉·표·그림 규격을 읽습니다." accent={current === 0}>
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
                  <p className="mt-1 text-sm text-ink-3">예: 학력평가 문항지.hwp · 형성평가 문제지.hwp</p>
                </Dropzone>
                <p className="text-[12.5px] text-ink-2">
                  양식이 손에 없으면{" "}
                  <button type="button" disabled={!!busy} onClick={tryDemo} className="font-bold text-primary underline underline-offset-2 disabled:opacity-50">
                    예시 파일로 해 보기
                  </button>
                  — 합성 양식과 선생님 두 명의 문항 파일로 전체 흐름을 둘러봅니다(실제 문항 아님).
                </p>
              </div>
            )}
          </Step>

          <Step id="s-sources" n={2} kicker="HWP · PDF · 사진" title="문항 파일" sub="HWP·HWPX는 그대로, PDF는 글자를 입력한 글로 옮기고 그림·그래프는 잘라 넣으며, 사진·캡처는 글자를 인식합니다. 빈 번호 자리·양식 머리 표·확인 사항은 알아서 뺍니다." accent={current === 1}>
            <Dropzone multiple disabled={!!busy} onFiles={addSources} compact={docs.length > 0} accept="all">
              <p className="font-semibold">{docs.length ? "파일 더 올리기" : "문항 파일(.hwp, .hwpx, .pdf, 사진)을 끌어 놓거나 눌러서 고르세요. 여러 개를 한꺼번에 올릴 수 있습니다"}</p>
              {!docs.length && <p className="mt-1 text-sm text-ink-3">PDF·사진의 정답은 3단계에서 지정합니다(형광펜 정보가 없음).</p>}
            </Dropzone>
            {!tpl && docs.length > 0 && (
              <div className="mt-3 border border-warn/40 border-l-[3px] border-l-warn bg-warn-soft px-4 py-2 text-sm text-warn">
                <p>
                  문항 파일 {docs.length}개를 받았습니다. <b>1단계에 학교 양식을 올리면</b> 문항을 나눕니다.
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
              <Step id="s-order" n={3} kicker="순서 · 정답 · 배점" title="문항·정답" sub="합치는 방식과 순서를 정하고, 뺄 문항을 고르고, 정답·배점이 없는 문항을 채우세요. 문항마다 양식과 다른 기호·크기 문제와 사진 인식 글자를 함께 봅니다." accent={current === 2}>
                <QuestionBoard
                  order={order}
                  excluded={excluded}
                  answers={answers}
                  scores={scores}
                  fixes={fixes}
                  issues={preIssues}
                  spec={spec}
                  sources={sources}
                  imageUrls={imageUrls}
                  fileOrder={fileOrder}
                  focus={focus}
                  onMove={move}
                  onMoveTo={moveTo}
                  onToggle={toggle}
                  onIncludeAll={() => {
                    setExcluded(new Set());
                    markStale();
                  }}
                  onAnswer={setAnswer}
                  onAnswers={setAnswersBulk}
                  onScore={setScore}
                  onFix={setFix}
                  onMerge={setMerge}
                  onFileOrder={changeFileOrder}
                  onResetOrder={() => {
                    setOrder(defaultOrder(sources, spec.merge, fileOrder));
                    markStale();
                  }}
                  onEdited={() => {
                    setEditRev((x) => x + 1);
                    markStale();
                  }}
                  onSaveWork={saveWork}
                  onLoadWork={loadWork}
                />
              </Step>

              <Step id="s-options" n={4} kicker="글꼴 · 간격 · 번호" title="편집 옵션" sub="양식에서 읽은 값으로 채워 두었습니다. 문항 글자와 기호는 바꾸지 않고, 형식(글꼴·간격·번호·크기)만 맞춥니다.">
                <FormatOptions
                  spec={spec}
                  sources={sources}
                  boxFrame={!!tpl?.boxProto}
                  negRule={negRule}
                  onChange={(s) => {
                    setSpec(s);
                    markStale();
                  }}
                />
              </Step>

              <Step id="s-result" n={5} kicker="미리보기 · 검수 · 내려받기" title="원안지 만들기" accent={current >= 3}>
                {summary.length > 0 && (
                  <div className="mb-3 border border-line bg-paper px-3 py-2">
                    <p className="text-[12.5px] font-bold text-ink">만들기 전에 확인할 것 — 이대로 만들면 결과에 그대로 남습니다</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {summary.map((s) => (
                        <button
                          key={s.label}
                          type="button"
                          onClick={() => focusQuestion(s.ids[0])}
                          className={`border px-2 py-1 text-[12px] font-bold ${s.tone === "danger" ? "border-danger/50 bg-danger-soft text-danger" : "border-warn/50 bg-warn-soft text-warn"} hover:underline`}
                          title="3단계의 첫 문항으로 가기"
                        >
                          {s.label} →
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" disabled={!!busy || !active.length} onClick={make} className="btn btn-primary">
                    {out ? "바뀐 내용으로 다시 만들기" : noAnswerN ? `원안지 만들기 (정답 없는 문항 ${noAnswerN}개 포함)` : "원안지 만들기"}
                  </button>
                  <span className="text-sm text-ink-2">
                    선택형 {mcqN}문항 · 논술형 {essayN}문항{answers.size ? ` · 직접 지정한 정답 ${answers.size}문항` : ""}
                    {scores.size ? ` · 지정 배점 ${scores.size}문항` : ""}
                  </span>
                </div>
                {out && (
                  <div className="mt-6">
                    <ResultView out={out} order={active} excluded={excludedList} spec={spec} stale={stale} busy={!!busy} onRebuild={make} onDownload={onDownload} onFocusQuestion={focusQuestion} onFixAll={fixAll} />
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
          한글 문서 읽기·그리기: rhwp(@rhwp/core, MIT) · PDF: pdf.js(Apache-2.0) · 글자 인식: Tesseract(Apache-2.0). “한글”, “HWP”, “HWPX”는 한글과컴퓨터의 상표입니다. 결과 파일은 반드시 한글에서 최종 확인하세요.
        </footer>
      </div>
    </div>
  );
}

function Step({ id, n, kicker, title, sub, accent, children }: { id: string; n: number; kicker: string; title: string; sub?: string; accent?: boolean; children: ReactNode }) {
  return (
    <section id={id} className={`panel scroll-mt-nav px-5 pb-6 pt-5 sm:px-6 ${accent ? "panel-accent" : ""}`}>
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
