import type { TeacherInput, WizardStep } from "../types";
import ReferenceCoach from "./ReferenceCoach";

interface Guide {
  title: string;
  principle: string;
  questions: string[];
  reference: string;
}

const GUIDES: Record<WizardStep, Guide> = {
  input: {
    title: "성취기준에서 바로 문항으로 가지 않는 이유",
    principle:
      "문항 유형보다 먼저 교육과정 범위와 평가하려는 행동을 고정해야 내용 타당도를 확보할 수 있습니다.",
    questions: [
      "학생에게 확인하려는 지식과 사고는 무엇인가?",
      "수업에서 다루지 않은 개념이나 자료가 섞이지 않았는가?",
      "자료의 출처와 이용 조건을 다시 확인할 수 있는가?",
    ],
    reference: "경기도교육청(2024) 『평가문항 제작 방법』 pp.5–14, p.52",
  },
  analysis: {
    title: "평가 요소와 문제 장면을 분리하는 이유",
    principle:
      "평가 요소는 측정할 능력이고 문제 장면은 그 능력을 드러내는 맥락입니다. 장면이 화려해도 평가 요소를 가리면 좋은 문항이 아닙니다.",
    questions: [
      "이 장면이 선택한 평가 요소를 가장 직접적으로 드러내는가?",
      "자료를 읽어야만 답할 수 있도록 장면과 질문이 연결되는가?",
      "행동 영역이 성취기준의 수행 동사와 일치하는가?",
    ],
    reference: "경기도교육청(2024) 『평가문항 제작 방법』 p.52, 과목별 제작 절차 pp.66–72",
  },
  bank: {
    title: "명제 풀에서 조립하는 이유",
    principle:
      "정답 하나를 먼저 만드는 대신 참·거짓 명제를 비교하면 오답의 매력도, 명제 독립성, 선택지 동질성을 교사가 직접 통제할 수 있습니다.",
    questions: [
      "각 명제가 다른 명제와 무관하게 참·거짓 판정되는가?",
      "거짓 명제가 실제 학생 오개념을 반영하는가?",
      "문장 길이와 문법 구조가 정답의 단서가 되지 않는가?",
    ],
    reference: "경기도교육청(2024) 『평가문항 제작 방법』 pp.42–51",
  },
  result: {
    title: "AI 점검과 교사 검토를 분리하는 이유",
    principle:
      "생성 모델의 자기점검은 독립 검토가 아닙니다. 정답 유일성, 교육과정 범위, 자료 정확성은 출제자가 원자료와 대조해야 합니다.",
    questions: [
      "자료·발문·〈보기〉·선택지가 하나의 평가 요소로 연결되는가?",
      "자료를 보지 않고 선택지 요령만으로 풀 수 있지 않은가?",
      "시행 후 정답률·변별도·답지 반응률로 난도를 재평가할 수 있는가?",
    ],
    reference: "경기도교육청(2024) 『평가문항 제작 방법』 pp.11–14, 문항 검토 절차 p.52",
  },
};

export default function PedagogyGuide({ step, input }: { step: WizardStep; input: TeacherInput }) {
  const guide = GUIDES[step];
  return (
    <><details className="pedagogy-guide" open>
      <summary>
        <span>출제 원리</span>
        <strong>{guide.title}</strong>
      </summary>
      <div className="pedagogy-guide-body">
        <p>{guide.principle}</p>
        <h3>교사 판단 질문</h3>
        <ol>
          {guide.questions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ol>
        <p className="pedagogy-reference">근거: {guide.reference}</p>
      </div>
    </details><ReferenceCoach input={input} step={step} /></>
  );
}
