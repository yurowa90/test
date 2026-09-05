/** Only data is accepted from AI. SVG markup is produced by our renderer. */
export interface ItemFigure {
  kind: "bar" | "line" | "process";
  title: string;
  xLabel: string;
  yLabel: string;
  categories: string[];
  xValues: number[];
  series: { name: string; values: number[] }[];
  steps: { title: string; lines: string[] }[];
  caption: string;
  evidence: string;
}

const text = { type: "string" };
const strings = { type: "array", items: text, maxItems: 10 };
const numbers = { type: "array", items: { type: "number" }, maxItems: 10 };
export const FIGURE_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["bar", "line", "process"] },
    title: text, xLabel: text, yLabel: text, categories: strings, xValues: numbers,
    series: { type: "array", maxItems: 4, items: { type: "object", properties: { name: text, values: numbers }, required: ["name", "values"] } },
    steps: { type: "array", maxItems: 6, items: { type: "object", properties: { title: text, lines: { type: "array", items: text, maxItems: 3 } }, required: ["title", "lines"] } },
    caption: text, evidence: text,
  },
  required: ["kind", "title", "xLabel", "yLabel", "categories", "xValues", "series", "steps", "caption", "evidence"],
};

export const FIGURE_RULES = `그림은 실행 코드가 아닌 figure 데이터로 작성합니다.
- bar: 범주별 막대그래프. categories 2~10개, series 1~4개, 각 values 개수는 categories와 일치. xValues와 steps는 빈 배열.
- line: 수치 x축 꺾은선그래프. categories는 빈 배열, xValues는 엄격한 오름차순의 실제 수치 2~10개. 각 series.values 개수는 xValues와 일치. steps는 빈 배열.
- process: 수치가 없는 관계·과정 모식도. steps 2~6개, 각 title과 lines 1~3개로 관측된 상태·단계를 간결하게 표현합니다. categories, xValues, series는 빈 배열, xLabel·yLabel은 빈 문자열입니다. 선 연결은 단계의 순서만 나타냅니다.
- 그래프에 쓰는 수치는 현재 자료 본문·조건 또는 교사가 확인한 원자료에 명시된 값만 사용합니다. ‘증가’, ‘감소’, ‘비율이 커짐’만 있는 경우 퍼센트나 개체 수를 만들지 말고 process로 표현합니다. 자료에 없는 중간 시점·보간값·오차 막대도 추가하지 않습니다.
- title 60자 이내, 축 제목 40자 이내에 단위 명시, 범주·계열 이름 30자 이내. steps의 title 40자 이내, 각 lines 60자 이내. caption 180자 이내는 학생용 설명입니다. 정답·해설·‘적응/선택이 일어났다’처럼 학생이 추론해야 할 결론을 넣지 않습니다.
- evidence 300자 이내에 사용한 본문 값 또는 원자료 위치를 교사용으로 기록합니다. 원문을 읽지 않았다면 확인했다고 하지 않습니다. 출처 표시는 앱이 붙입니다.
- 지원 범위는 막대·꺾은선·과정 모식도입니다. 정밀한 해부도·회로도·지도 등이 꼭 필요하고 이 형식으로 대체하면 정보가 손실될 경우 억지로 모식도를 만들지 않습니다.`;

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, n: number, required = true): v is string => typeof v === "string" && v.length <= n && (!required || !!v.trim());
const numeric = (v: unknown): v is number[] => Array.isArray(v) && v.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e12);

export function figureIssue(value: unknown): string | null {
  if (!record(value) || !["bar", "line", "process"].includes(String(value.kind))) return "그림 유형을 선택하세요.";
  if (!str(value.title, 60) || !str(value.caption, 180, false) || !str(value.evidence, 300)) return "그림 제목(60자 이내)과 근거(300자 이내)를 입력하고 설명은 180자 이내로 줄이세요.";
  if (!str(value.xLabel, 40, false) || !str(value.yLabel, 40, false)) return "축 제목은 40자 이내로 입력하세요.";
  if (!Array.isArray(value.categories) || !numeric(value.xValues) || !Array.isArray(value.series) || !Array.isArray(value.steps)) return "그림 데이터 목록 형식을 확인하세요.";
  if (value.kind === "process") {
    if (value.series.length || value.categories.length || value.xValues.length) return "모식도에는 수치 그래프 데이터를 함께 넣지 않습니다.";
    if (value.steps.length < 2 || value.steps.length > 6 || !value.steps.every(s => record(s) && str(s.title, 40) && Array.isArray(s.lines) && s.lines.length >= 1 && s.lines.length <= 3 && s.lines.every(l => str(l, 60)))) return "모식도는 2~6단계, 단계 제목 40자·설명 1~3줄(각 60자 이내)로 입력하세요.";
  } else {
    if (!value.xLabel.trim() || !value.yLabel.trim()) return "두 축의 물리량과 단위를 입력하세요.";
    const count = value.kind === "bar" ? value.categories.length : value.xValues.length;
    if (count < 2 || count > 10) return "그래프의 자료 지점은 2~10개여야 합니다.";
    if (value.kind === "bar" && (value.xValues.length || !value.categories.every(c => str(c, 30)) || new Set(value.categories).size !== count)) return "막대그래프의 범주 이름은 서로 다르게 30자 이내로 입력하세요.";
    if (value.kind === "line" && (value.categories.length || value.xValues.some((x, i, a) => i > 0 && x <= a[i - 1]))) return "꺾은선그래프의 x값은 중복 없이 작은 값부터 입력하세요.";
    if (value.steps.length || value.series.length < 1 || value.series.length > 4 || !value.series.every(s => record(s) && str(s.name, 30) && numeric(s.values) && s.values.length === count)) return "계열은 1~4개이며 모든 행에 같은 개수의 유효한 수치가 필요합니다.";
    if (new Set(value.series.map(s => s.name)).size !== value.series.length) return "계열 이름을 서로 다르게 입력하세요.";
  }
  return null;
}

export function validFigure(value: unknown): value is ItemFigure { return figureIssue(value) === null; }

/** A numeric presence check, not a claim of scientific/source verification. */
export function missingFigureValues(figure: ItemFigure, evidence: string): number[] {
  if (figure.kind === "process") return [];
  const values = new Set((evidence.replace(/−/g, "-").replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, "").match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/gi) ?? []).map(Number));
  return [...new Set([...figure.xValues, ...figure.series.flatMap(series => series.values)].filter(value => !values.has(value)))];
}
export function escapeXml(value: string): string { return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
const fmt = (n: number) => Number(n.toPrecision(5)).toString();
const colors = ["#ffffff", "#252525", "#777777", "#cccccc"];
const wrap = (s: string, width: number): string[] => Array.from(s).reduce<string[]>((a, c, i) => { if (i % width === 0) a.push(""); a[a.length - 1] += c; return a; }, []);
const label = (x: number, y: number, s: string, size = 15, anchor = "start") => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}">${escapeXml(s)}</text>`;
const multiline = (x: number, y: number, s: string, width: number, size = 15, anchor = "start") => wrap(s, width).map((l, i) => label(x, y + i * (size + 5), l, size, anchor)).join("");

/** Baseline at zero; numeric x spacing; no inferred/interpolated data. */
export function figureSvg(figure: ItemFigure, source = ""): string {
  const issue = figureIssue(figure);
  if (issue) throw new Error(issue);
  let drawing = multiline(380, 32, figure.title, 38, 19, "middle");
  let bottom = 470;
  if (figure.kind === "process") {
    let y = 100;
    drawing += label(380, 76, "과정 모식도 · 개체 수·비율을 나타내지 않음", 13, "middle");
    figure.steps.forEach((step, i) => {
      const lines = step.lines.flatMap(l => wrap(l, 38));
      const titleLines = wrap(step.title, 32);
      const h = 30 + titleLines.length * 22 + lines.length * 20;
      drawing += `<rect x="100" y="${y}" width="560" height="${h}" rx="8" fill="white" stroke="#222" stroke-width="1.5"/>`;
      titleLines.forEach((line, j) => { drawing += label(380, y + 27 + j * 22, line, 17, "middle"); });
      lines.forEach((line, j) => { drawing += label(380, y + 29 + titleLines.length * 22 + j * 20, line, 15, "middle"); });
      y += h;
      if (i < figure.steps.length - 1) drawing += `<path d="M380 ${y + 6}v22" stroke="#222" stroke-width="2"/><path d="M374 ${y + 22}l6 9 6-9" fill="none" stroke="#222" stroke-width="2"/>`;
      y += 42;
    });
    bottom = y;
  } else {
    figure.series.forEach((series, i) => {
      const x = 90 + (i % 2) * 320, y = 74 + Math.floor(i / 2) * 21;
      drawing += `<rect x="${x}" y="${y - 11}" width="17" height="12" fill="${colors[i]}" stroke="#222"/>` + label(x + 25, y, series.name, 13);
    });
    const left = 100, top = 160, width = 580, height = 210;
    const values = figure.series.flatMap(s => s.values);
    const min = Math.min(0, ...values), max = Math.max(0, ...values) || (min === 0 ? 1 : 0), range = max - min;
    const y = (v: number) => top + height - (v - min) / range * height;
    drawing += multiline(left, 128, figure.yLabel, 42, 14);
    for (let i = 0; i <= 4; i++) {
      const v = min + range * i / 4, py = y(v);
      drawing += `<path d="M${left} ${py}h${width}" stroke="#ccc"/>` + label(left - 12, py + 4, fmt(v), 12, "end");
    }
    drawing += `<path d="M${left} ${top}v${height}h${width} M${left} ${y(0)}h${width}" fill="none" stroke="#222" stroke-width="1.5"/>`;
    const n = figure.kind === "bar" ? figure.categories.length : figure.xValues.length;
    const x = (i: number) => figure.kind === "bar" ? left + width * (i + 0.5) / n : left + width * (figure.xValues[i] - figure.xValues[0]) / (figure.xValues[n - 1] - figure.xValues[0]);
    for (let i = 0; i < n; i++) {
      const name = figure.kind === "bar" ? figure.categories[i] : fmt(figure.xValues[i]);
      drawing += multiline(x(i), top + height + 23, name, n > 5 ? 5 : 10, 12, "middle");
    }
    bottom = top + height + 35 + (figure.kind === "bar" ? Math.max(...figure.categories.map(c => wrap(c, n > 5 ? 5 : 10).length)) * 17 : 20);
    drawing += label(390, bottom, figure.xLabel, 14, "middle");
    figure.series.forEach((series, si) => {
      if (figure.kind === "bar") {
        const bw = width / n * 0.7 / figure.series.length;
        series.values.forEach((v, i) => {
          const px = x(i) - bw * figure.series.length / 2 + si * bw;
          drawing += `<rect x="${px}" y="${Math.min(y(0), y(v))}" width="${bw}" height="${Math.abs(y(v) - y(0))}" fill="${colors[si]}" stroke="#222"><title>${escapeXml(`${figure.categories[i]} · ${series.name}: ${v}`)}</title></rect>`;
        });
      } else {
        drawing += `<polyline points="${series.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}" fill="none" stroke="#222" stroke-width="2" stroke-dasharray="${["none", "8 5", "2 4", "10 4 2 4"][si]}"/>`;
        series.values.forEach((v, i) => { drawing += `<circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="${colors[si]}" stroke="#222"><title>${escapeXml(`${figure.xValues[i]} · ${series.name}: ${v}`)}</title></circle>`; });
      }
    });
    bottom += 28;
  }
  const notes = [figure.caption, source].filter(Boolean).flatMap(s => wrap(s, 58));
  notes.forEach((line, i) => { drawing += label(30, bottom + i * 18, line, 12); });
  const h = bottom + notes.length * 18 + 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 ${h}" width="760" height="${h}" role="img"><title>${escapeXml(figure.title)}</title><desc>${escapeXml(figure.kind === "process" ? "수치 없는 과정 모식도" : `${figure.xLabel}, ${figure.yLabel}`)}</desc><rect width="760" height="${h}" fill="white"/><g fill="#171717" font-family="Arial, 'Noto Sans KR', sans-serif">${drawing}</g></svg>`;
}

export function figureDataUrl(figure: ItemFigure, source = ""): string { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(figureSvg(figure, source))}`; }

/** TSV is editable with a spreadsheet; empty cells must never silently become zero. */
export function chartFromTable(table: string, base: ItemFigure): ItemFigure {
  const rows = table.trim().split(/\r?\n/).map(row => row.split("\t").map(s => s.trim()));
  const header = rows.shift() ?? [];
  if (header.length < 2 || rows.some(row => row.length !== header.length || row.some(cell => !cell))) throw new Error("표는 탭으로 구분하고 빈 셀 없이 모든 행의 열 수를 맞추세요.");
  const number = (s: string) => { if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s)) throw new Error("수치 셀에는 숫자만 입력하세요. 단위는 축 제목에 적으세요."); return Number(s); };
  return { ...base, categories: base.kind === "bar" ? rows.map(row => row[0]) : [], xValues: base.kind === "line" ? rows.map(row => number(row[0])) : [], series: header.slice(1).map((name, i) => ({ name, values: rows.map(row => number(row[i + 1])) })), steps: [] };
}

export function figureTable(figure: ItemFigure): string {
  if (figure.kind === "process") return figure.steps.map(s => [s.title, ...s.lines].join(" | ")).join("\n");
  return [[figure.xLabel, ...figure.series.map(s => s.name)].join("\t"), ...(figure.kind === "bar" ? figure.categories : figure.xValues).map((x, i) => [x, ...figure.series.map(s => s.values[i])].join("\t"))].join("\n");
}
