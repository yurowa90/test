import type { TeacherInput, WizardStep } from "../types.ts";

export const DESIGN_SOURCES = {
  general: { title: "평가문항 제작기법(공개용)", pages: 135, coverage: "텍스트 추출·제작 원리 중심 검토. PDF 한 쪽에 인쇄본 두 쪽이 배치되어 있습니다." },
  physics: { title: "2024 평가문항 제작 방법(물리학)_압축", pages: 180, coverage: "텍스트 추출·수정 사례 검토. 전자기 유도 사례의 그림을 대조했습니다." },
  earth: { title: "2024 평가문항 제작 방법(지구과학)_압축", pages: 178, coverage: "텍스트 추출·수정 사례 15건 검토. 자기장 사례의 그림을 대조했습니다." },
  biology: { title: "생명과학3단원", pages: 56, coverage: "교과서 3단원이 아닌 ‘평가 문항 제작의 실제’ 발췌본입니다. 수정 사례와 방형구 그림을 검토했습니다." },
  chemistry: { title: "화학3단원", pages: 56, coverage: "교과서 3단원이 아닌 ‘평가 문항 제작의 실제’ 발췌본입니다. 수정 사례와 기체 모형을 검토했습니다." },
  bioExams: { title: "생명과학1 기출(평가원 2014~2026 수능)", pages: 160, coverage: "텍스트 추출 후 대표 문항의 구조를 분석했습니다. 전 문항의 정답·빈도를 검증한 결과는 아닙니다." },
  bio2: { title: "2025 마더텅 수능기출문제집 생명과학2_문제편(정답표시O)", pages: 344, coverage: "이미지형 PDF. 목차·구성 확인 후 PDF 80·120·160·200쪽을 대표 분석했습니다. 수록 정답은 독립 검증하지 않았습니다." },
} as const;

type Subject = "공통" | "물리학" | "화학" | "생명과학" | "지구과학";
type Citation = { source: keyof typeof DESIGN_SOURCES; pages: number[] };
export interface DesignLesson {
  id: string;
  subject: Subject;
  tags: string[];
  stages: WizardStep[];
  title: string;
  problem: string;
  change: string;
  reason: string;
  question: string;
  citations: Citation[];
  kind: "제작 지침 요약" | "기출 구조 분석";
}

const ALL_STAGES: WizardStep[] = ["input", "analysis", "bank", "result"];
export const DESIGN_LESSONS: DesignLesson[] = [
  {
    id: "evidence-first", subject: "공통", tags: [], stages: ALL_STAGES, kind: "제작 지침 요약",
    title: "풀이 행동이 평가 목표의 증거가 되게 하기",
    problem: "평가하려는 개념보다 기호 찾기와 반복 계산이 풀이를 지배합니다.",
    change: "주 평가 요소 하나를 정하고, ‘자료에서 읽기 → 개념 적용 → 판단’의 경로를 적습니다. 보조 추론은 주 평가 요소에 연결합니다.",
    reason: "문항을 어렵게 만드는 일과 목표 능력을 측정하는 일은 다릅니다.",
    question: "계산을 줄여도 평가하려는 사고가 남습니까?",
    citations: [{ source: "general", pages: [4, 8, 10, 11] }, { source: "chemistry", pages: [16, 29] }],
  },
  {
    id: "source-integrity", subject: "공통", tags: [], stages: ALL_STAGES, kind: "제작 지침 요약",
    title: "원자료를 단순화해도 수치와 조건은 보존하기",
    problem: "복잡한 연구 그림을 단순화하면서 측정값이나 연구 조건까지 임의로 바꾸면 다른 결과가 됩니다.",
    change: "원자료의 위치·단위·표본 조건을 기록하고, 생략·반올림·정규화 내역을 남깁니다. 값을 새로 만들었다면 합성 자료로 구분합니다.",
    reason: "자료 가독성 원칙을 적용하되 실제 연구 결과인 것처럼 보이게 해서는 안 됩니다. 재구성 기록은 앱에서 추가한 검증 장치입니다.",
    question: "교사가 원자료와 재구성 결과를 다시 대조할 수 있습니까?",
    citations: [{ source: "biology", pages: [17, 19] }, { source: "general", pages: [9] }],
  },
  {
    id: "peer-feedback", subject: "공통", tags: [], stages: ["result"], kind: "제작 지침 요약",
    title: "사전 예상과 시행 후 난도를 구분하기",
    problem: "성취수준 A~E나 출제자의 예상만으로 실제 정답률을 단정합니다.",
    change: "동료 교사의 독립 풀이로 모호성을 확인하고, 시행 후 정답률·답지 반응을 수정 기록과 연결합니다.",
    reason: "교사의 출제 전문성은 설계 근거와 실제 학생 반응을 비교하며 축적됩니다.",
    question: "학생이 틀린 이유가 목표 개념 때문인지 표현·조건 때문인지 구분했습니까?",
    citations: [{ source: "general", pages: [4, 6] }],
  },
  {
    id: "physical-model", subject: "물리학", tags: ["자기", "전자기", "유도", "힘"], stages: ALL_STAGES, kind: "제작 지침 요약",
    title: "실제 장치에서 빠뜨린 작용 확인하기",
    problem: "코일의 자기장만 고려하면서 자석 자체의 자기장도 받는 나침반을 관측 도구로 제시합니다.",
    change: "관측 대상에 작용하는 요인을 먼저 목록화합니다. 필요한 효과를 분리할 수 없으면 실험 장면을 바꿉니다.",
    reason: "모형에서 생략한 효과가 측정 결과에 영향을 주면 의도한 정답을 보장할 수 없습니다.",
    question: "그림 속 장치가 실제로도 제시한 관측 결과를 낼 수 있습니까?",
    citations: [{ source: "physics", pages: [84, 85] }],
  },
  {
    id: "chemical-conditions", subject: "화학", tags: ["기체", "분자", "상태", "혼합"], stages: ALL_STAGES, kind: "제작 지침 요약",
    title: "입자 그림과 실험 조건 연결하기",
    problem: "입자 개수 그림만 주고 온도·압력·물질의 상태·혼합 조건을 생략합니다.",
    change: "비교에 필요한 조건을 그림이나 표 가까이에 명시하고, 관측 가능한 실험과 이론적 모형을 구분합니다.",
    reason: "입자 모형의 관계가 실제 측정값과 연결되려면 적용 조건이 필요합니다.",
    question: "학생이 조건을 추측해야만 부피나 양을 비교할 수 있지는 않습니까?",
    citations: [{ source: "chemistry", pages: [33, 39] }],
  },
  {
    id: "chemical-load", subject: "화학", tags: ["양적", "농도", "반응", "몰"], stages: ALL_STAGES, kind: "제작 지침 요약",
    title: "미지수 개수보다 추론의 질로 설계하기",
    problem: "물질과 수치를 많이 숨기고 같은 계산을 여러 명제에서 반복합니다.",
    change: "평가 요소와 무관한 미지수는 공개하고, 부피·농도는 표로 정리합니다. 명제마다 확인하는 사고를 구분합니다.",
    reason: "독해·탐색 부담을 줄이면 화학 개념에 근거한 추론이 드러납니다.",
    question: "ㄱ을 풀 때 한 계산을 ㄴ·ㄷ에서 반복시키고 있지는 않습니까?",
    citations: [{ source: "chemistry", pages: [16, 29, 35, 37] }],
  },
  {
    id: "biology-linked-data", subject: "생명과학", tags: ["생태", "방형구", "막", "수송"], stages: ALL_STAGES, kind: "제작 지침 요약",
    title: "모든 자료가 판단에 기여하게 하기",
    problem: "필요한 전체 개체 수가 표와 떨어져 있거나, 두 그래프 중 하나는 보지 않아도 풀립니다.",
    change: "분모가 되는 전체량을 해당 표에 붙이고, 각 자료가 어느 명제의 근거인지 연결해 봅니다.",
    reason: "자료의 개수가 많다고 자료 해석 능력을 더 잘 측정하는 것은 아닙니다.",
    question: "자료 하나를 가려도 답이 같다면 그 자료가 꼭 필요합니까?",
    citations: [{ source: "biology", pages: [21, 23] }],
  },
  {
    id: "biology-time-unit", subject: "생명과학", tags: ["신경", "근육", "항상성", "흥분", "DNA", "세포"], stages: ALL_STAGES, kind: "기출 구조 분석",
    title: "측정 시점·위치·기준량을 맞추기",
    problem: "거리·시간·전위 표의 기준이 다르거나 DNA 상대량이 세포당인지 핵당인지 불분명합니다.",
    change: "기호마다 대상·위치·시점을 정의하고, 표 제목에 측정량과 기준 단위를 적습니다. 관측값과 추론값을 구분합니다.",
    reason: "생명과학Ⅰ 대표 문항은 여러 표와 그림의 조건을 연결하는 구조를 사용합니다. 이 구조를 새 문항에 적용할 때 기준을 명시해야 합니다.",
    question: "표와 그림의 같은 기호가 같은 대상과 시점을 뜻합니까?",
    citations: [{ source: "bioExams", pages: [3, 156] }, { source: "biology", pages: [51, 54] }],
  },
  {
    id: "enzyme-axes", subject: "생명과학", tags: ["효소", "기질", "저해", "촉매"], stages: ALL_STAGES, kind: "기출 구조 분석",
    title: "그래프의 속도와 누적량 구분하기",
    problem: "시간에 따른 생성물 양 그래프와 기질 농도에 따른 초기 반응 속도 그래프를 같은 방식으로 읽게 합니다.",
    change: "축의 물리량·단위와 통제 변인을 먼저 정하고, 어느 구간의 기울기 또는 최종량을 비교하는지 명시합니다.",
    reason: "생명과학Ⅱ 효소 문항의 그래프 비교 구조를 참고한 설계 질문입니다. 수록 그래프의 수치를 새 실험값으로 사용하지 않습니다.",
    question: "이 명제는 기울기, 특정 시점의 양, 최종량 중 무엇을 비교합니까?",
    citations: [{ source: "bio2", pages: [80] }],
  },
  {
    id: "metabolism-process", subject: "생명과학", tags: ["호흡", "발효", "대사", "ATP"], stages: ALL_STAGES, kind: "기출 구조 분석",
    title: "물질과 과정을 다른 기호로 정의하기",
    problem: "과정의 발생 여부를 나타낸 O/X 표를 물질의 존재 여부로 읽거나, 생성과 소비를 혼동하게 됩니다.",
    change: "과정·물질·세포를 구분해 정의하고 표의 O/X 의미, 반응 조건, 생성·소비 방향을 명시합니다.",
    reason: "여러 자료를 연결하는 추론과 모호한 기호를 해독하는 부담은 구분해야 합니다.",
    question: "미지수 하나를 공개하면 핵심 대사 추론이 더 잘 드러납니까?",
    citations: [{ source: "bio2", pages: [120] }, { source: "biology", pages: [25] }],
  },
  {
    id: "experiment-controls", subject: "생명과학", tags: ["실험", "형질", "전환", "유전", "효소"], stages: ALL_STAGES, kind: "기출 구조 분석",
    title: "대조군과 처리 순서로 결론 뒷받침하기",
    problem: "실험 이름만 기억하면 답할 수 있거나, 결과를 특정 원인에 귀속할 대조 조건이 빠져 있습니다.",
    change: "처리 전후 상태·처리 순서·비교군·관찰 결과를 표로 연결하고, 가능한 다른 설명을 검토합니다.",
    reason: "형질 전환 실험의 처리 도식과 결과 표에서 추출한 구조입니다. 결론은 제시한 실험이 뒷받침하는 범위로 한정합니다.",
    question: "이 대조군이 없으면 배제할 수 없는 다른 설명은 무엇입니까?",
    citations: [{ source: "bio2", pages: [160] }, { source: "bioExams", pages: [1] }],
  },
  {
    id: "genetic-direction", subject: "생명과학", tags: ["번역", "전사", "코돈", "염기", "돌연변이"], stages: ALL_STAGES, kind: "기출 구조 분석",
    title: "서열 방향과 해석 시작점 명시하기",
    problem: "DNA 가닥의 종류와 5′·3′ 방향, 번역 시작·종결 조건을 숨긴 채 서열 추론을 요구합니다.",
    change: "주형 가닥인지 등을 먼저 정의하고 방향과 해석 범위를 표시합니다. 고난도 기출의 조건 수를 그대로 옮기지 않습니다.",
    reason: "서열 문항의 구조를 참고하되 선택한 현행 성취기준에 필요한 추론만 남겨야 합니다.",
    question: "이 조건 조합이 현재 수업 범위에서 설명 가능한가요?",
    citations: [{ source: "bio2", pages: [200] }, { source: "biology", pages: [31] }],
  },
  {
    id: "earth-reference-frame", subject: "지구과학", tags: ["자기", "편각", "복각", "방향"], stages: ALL_STAGES, kind: "제작 지침 요약",
    title: "방향의 기준과 부호 있는 값 구분하기",
    problem: "이동 중 나침반 회전의 기준을 생략하거나 음수인 복각의 값과 크기를 혼용합니다.",
    change: "진북 등 방향 기준을 제시하고, 부호 있는 값인지 절댓값인지 명확히 씁니다.",
    reason: "기준을 바꾸면 같은 그림에서도 명제의 판단이 달라질 수 있습니다.",
    question: "‘크다’와 ‘시계 방향’의 기준을 학생이 하나로 해석할 수 있습니까?",
    citations: [{ source: "earth", pages: [94, 95] }],
  },
  {
    id: "earth-figure-scale", subject: "지구과학", tags: ["중력", "열류량", "지각", "판 구조", "단면"], stages: ALL_STAGES, kind: "제작 지침 요약",
    title: "모식도의 길이를 실측값처럼 읽게 하지 않기",
    problem: "작은 차이를 과장한 화살표에서 양을 읽게 하거나 단면 위치 없이 열류량 원인을 단정합니다.",
    change: "정량 비교에는 실제 값·단위를 제공하고, 모식도임을 표시합니다. 위치와 영향 요인을 판단할 단면·조건을 보완합니다.",
    reason: "그림의 가독성과 과학적 비례 관계를 함께 관리해야 합니다.",
    question: "그림 길이만 보고 결론을 내릴 때 오해할 여지가 있습니까?",
    citations: [{ source: "earth", pages: [92, 93, 105, 106] }],
  },
  {
    id: "earth-symbols", subject: "지구과학", tags: ["별", "행성", "박편", "암석", "광도"], stages: ALL_STAGES, kind: "제작 지침 요약",
    title: "기호가 대상인지 속성인지 끝까지 유지하기",
    problem: "발문에서는 기호가 온도·광도를 뜻하지만 보기에서는 별 자체를 지칭합니다.",
    change: "대상 이름과 측정량을 구분하고 발문·표·보기에서 동일하게 사용합니다. 박편 사진은 배율과 식별 가능성을 확인합니다.",
    reason: "그림을 이해하지 못한 오답과 기호의 중의성 때문에 생긴 오답을 구분해야 합니다.",
    question: "각 기호를 정의한 말로 바꿔 읽어도 모든 문장이 성립합니까?",
    citations: [{ source: "earth", pages: [103, 104, 109, 110] }],
  },
];

export const DESIGN_SCOPE_NOTE = "출제 구조를 배우는 참고자료입니다. 과거 교육과정·당시 시험 지침을 포함하므로 현재 선택한 성취기준과 수업 범위를 우선합니다. 논문·전공서적의 실측 데이터 출처나 정답 검증을 대신하지 않습니다.";

export function formatDesignCitation(citation: Citation): string {
  return `${DESIGN_SOURCES[citation.source].title} · PDF ${citation.pages.join("·")}쪽`;
}

const SUBJECT_WORDS: Record<Exclude<Subject, "공통">, string[]> = {
  물리학: ["물리", "역학", "전자기", "운동량", "전기장", "힘과 운동"],
  화학: ["화학", "원소", "몰 농도", "산화", "중화", "화학 결합"],
  생명과학: ["생명", "생물", "세포", "유전", "생태", "효소", "물질대사", "광합성"],
  지구과학: ["지구", "지질", "해양", "기후", "천체", "판 구조", "태양계", "행성", "은하"],
};

export function selectDesignLessons(input: Pick<TeacherInput, "subject" | "domain" | "standard">, step: WizardStep): DesignLesson[] {
  const text = `${input.subject} ${input.domain} ${input.standard}`.toLowerCase();
  const subjects = Object.entries(SUBJECT_WORDS)
    .filter(([, words]) => words.some(word => text.includes(word.toLowerCase())))
    .map(([subject]) => subject);
  const relevant = DESIGN_LESSONS.filter(lesson => lesson.stages.includes(step));
  const common = relevant.filter(lesson => lesson.subject === "공통");
  const specific = relevant.filter(lesson => subjects.includes(lesson.subject))
    .map(lesson => ({ lesson, score: lesson.tags.filter(tag => text.includes(tag.toLowerCase())).length }))
    .sort((a, b) => b.score - a.score);
  // One shared data set drives teacher guidance, model instructions and teacher export.
  return [...common, ...specific.slice(0, 3).map(entry => entry.lesson)];
}

export function designReferencePrompt(input: TeacherInput, step: WizardStep): string {
  return `<design_references>\n${DESIGN_SCOPE_NOTE}\n아래는 앱이 정리한 설계 관점이며 원문 인용문이 아닙니다. 기출의 문장·수치·정답을 복제하거나 이 자료를 stimulus.sourceIds에 넣지 마십시오. 현재 성취기준에 해당하는 관점만 적용합니다. 해설에는 실제 적용한 자료 단서와 추론을 설명하고, 잠긴 문항에서 문제를 발견하면 review에 기록합니다.\n${selectDesignLessons(input, step).map(lesson =>
    `- ${lesson.title}: ${lesson.change} 확인: ${lesson.question} [${lesson.citations.map(formatDesignCitation).join(" / ")}]`,
  ).join("\n")}\n</design_references>`;
}

export function designReferenceMarkdown(input: TeacherInput): string {
  return `## 출제 학습 참고자료\n\n${DESIGN_SCOPE_NOTE}\n\n${selectDesignLessons(input, "result").map(lesson =>
    `### ${lesson.title}\n\n- 개선 관점: ${lesson.change}\n- 교사 질문: ${lesson.question}\n- 참고: ${lesson.citations.map(formatDesignCitation).join(" / ")}`,
  ).join("\n\n")}`;
}
