const AUTO = [
  "글꼴·글자 크기·줄간격을 양식 예시 문항과 같게(본문·〈보기〉·표 안)",
  "문항 번호는 양식의 자동 번호로 1번부터, 논술형은 【문항n-논술형】을 12pt 진하게",
  "배점 [4.0점] 표기, 물음표 뒤 한 칸, 배점만 있는 줄은 오른쪽 정렬",
  "선지: 짧으면 탭 간격으로 한 줄 5·3·2개, 길면 한 줄 하나(내어쓰기), 답 번호는 문항 번호보다 1칸 안쪽",
  "발문의 부정어(않은·아닌·없는·틀린·다른) 밑줄(+진하게)",
  "문항 안 빈 줄 정리, 〈보기〉 상자와 선지 사이 한 줄, 문항 사이 빈 줄 통일",
  "정답 형광펜을 글자 음영으로 옮겨 HWP·HWPX 모두에 보존",
  "양식의 유의사항·예시 문항·작성 안내는 지우고 머리 표·논술형 안내·확인 사항은 유지",
];

const FLAG = [
  "문항 번호 중복·누락, 머리 표 과목명 불일치",
  "정답 표시 없음·복수, 정답 편중·3연속, 배점 합계·소수점 배점·논술형 배점",
  "〈보기〉 발문(기호 수가 다르면 ‘있는 대로’), 부정 발문+‘가장’, ‘거리가 먼’ 같은 경계 불분명 표현, 발문 어휘",
  "그림이 〈보기〉 뒤에 있음, 간접 발문 없음, (1)·(2) 기호, 〈보기〉 기호 순서, 곧은 따옴표, 검정 외 글자색",
  "논술형 ‘~하시오.’ 종결, ‘구체적으로’·의문사·‘찾아 쓰시오’, 답지 길이순, 쪽 기준으로 고정된 개체",
];

const HUMAN = [
  "성취기준 부합, 수업과의 연계, 교육과정 범위",
  "정답 시비·복수 정답 가능성, 오답지의 매력도",
  "그림 선명도·회색조 인쇄 상태, 자료 출처·저작권",
  "특정 집단에 대한 편향, 윤리적·교육적 적절성",
];

export default function RulesGuide() {
  return (
    <div className="grid gap-4 text-sm md:grid-cols-3">
      <Col title="자동으로 맞춥니다" tone="text-ok" items={AUTO} />
      <Col title="검수로 알려 줍니다" tone="text-warn" items={FLAG} />
      <Col title="선생님이 판단하세요" tone="text-ink-soft" items={HUMAN} />
      <p className="text-xs leading-relaxed text-ink-faint md:col-span-3">
        근거: 학교 원안지 양식의 유의사항, 학교 「정기시험 문항 제작 및 출제 유의사항」, 『2026학년도 전국연합학력평가 평가문항 제작 방법 직무연수(통합과학)』 pp.88–92. 두 학교 문서가
        부정어 표시 방식에서 서로 다르므로(밑줄+진하게 / 밑줄만) 편집 옵션에서 고르도록 했습니다.
      </p>
    </div>
  );
}

function Col({ title, tone, items }: { title: string; tone: string; items: string[] }) {
  return (
    <div>
      <h4 className={`mb-1.5 font-semibold ${tone}`}>{title}</h4>
      <ul className="list-disc space-y-1 pl-4 text-ink-soft">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
