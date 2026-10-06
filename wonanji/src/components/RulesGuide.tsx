const AUTO = [
  "글꼴·글자 크기·줄간격·자간을 양식 예시 문항에 맞춤(본문·〈보기〉·표 안). 자간은 양식 값에 원본의 상대 차이를 더함",
  "문항 번호는 양식의 방식(개요 번호·문단 번호·‘1.’ 직접 입력) 그대로 1번부터, 논술형은 【문항n-논술형】",
  "배점 표기 모양([4.0점]·[4점])과 물음표 뒤 한 칸, 배점만 있는 줄은 오른쪽 정렬",
  "선지: 짧으면 탭 간격으로 한 줄 5·3·2개, 길면 한 줄 하나(내어쓰기). 탭 간격도 양식 비율로 조정",
  "〈보기〉 상자를 양식 예시의 틀(격자·테두리·여백·이름표·항목 내어쓰기)로 다시 짜고 폭을 맞춤(항목 글자는 그대로). 단 폭을 넘는 표·그림은 비율을 지켜 축소, 글자 크기 변화에 맞춰 표 폭 조정",
  "발문의 부정어(않은·아닌·없는·틀린·다른) 밑줄(+진하게), 문항 안 빈 줄·문항 사이 간격 통일",
  "어절 단위 줄바꿈·외톨이줄 보호를 문단 모양에 설정, 마지막 줄에 두세 글자만 남는 문단은 자간을 조금 줄여 앞 줄로(트래킹)",
  "정답 형광펜(또는 화면에서 지정한 정답)을 글자 음영으로 교사용 HWP·HWPX에 보존, 학생 배부용 파일은 그 음영만 지움",
  "PDF는 글자를 입력한 글로 옮기고, 그림·그래프만 잘라 그림으로 넣음. 분수는 한글 수식으로",
];

const FLAG = [
  "기호 불일치: 〈보기〉 ㄱ·ㄴ·ㄷ, ㉠·(가), 불릿, 괄호 모양이 양식(없으면 다른 문항 다수)과 다름 — 바꾸지 않고 알림. 물결표·가운뎃점·괄호·발문 속 〈보기〉는 선생님이 확인하고 단추를 누를 때만 양식 기호로 바꿈",
  "문항 번호 중복·누락(번호 분담일 때는 파일끼리, 이어 붙이기일 때는 파일 안에서), 내용이 거의 같은 문항(같은 시험지의 PDF와 사진 등), 머리 표 과목명 불일치, 쪽 기준으로 고정된 개체, 줄여도 넘치는 개체",
  "사진에서 인식이 불확실한 글자(빨간색) — 3단계에서 원본 사진과 나란히 보며 고침",
  "정답 표시 없음·복수, 정답 편중·3연속, 배점 합계·소수점 배점·논술형 배점",
  "〈보기〉 발문(‘있는 대로’), 부정 발문+‘가장’, 경계 불분명 표현, 그림이 〈보기〉 뒤, 간접 발문 없음",
  "논술형 ‘~하시오.’ 종결, ‘구체적으로’·의문사, 답지 길이순, 곧은 따옴표, 검정 외 글자색",
];

const HUMAN = [
  "성취기준 부합, 수업과의 연계, 교육과정 범위",
  "정답 시비·복수 정답 가능성, 오답지의 매력도",
  "그림 선명도·회색조 인쇄 상태, 자료 출처·저작권",
  "PDF·사진에서 옮긴 글자와 수식이 원문과 같은지(특히 첨자·기호)",
  "특정 집단에 대한 편향, 윤리적·교육적 적절성",
];

export default function RulesGuide() {
  return (
    <div className="space-y-5">
      <blockquote className="border-l-4 border-l-primary bg-paper px-4 py-3">
        <p className="serif text-[15.5px] font-semibold leading-relaxed text-ink">형식은 맞추고, 내용은 건드리지 않습니다.</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
          기호 하나를 임의로 바꾸면 〈보기〉·선지와 짝이 어긋나 문항 오류가 될 수 있습니다. 그래서 앱은 글자·기호·숫자를 스스로 바꾸지 않고, 다른 점을 화면과 편집 검수 보고서에 알립니다. 물결표·가운뎃점·전각 괄호·발문 속 〈보기〉처럼 뜻과 상관없는 표기는 교사가 확인하고 ‘양식 기호로 바꾸기’를 누를 때만 바꾸며, 〈보기〉 항목 기호·㉠·불릿은 원본에서 고치도록 했습니다. 교사가 바꾼 것은 보고서에 따로 적습니다.
        </p>
      </blockquote>
      <div className="border border-line bg-paper px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
        <b className="text-ink">합치는 방식 두 가지.</b> ① 선생님별 번호 분담: 각자 맡은 번호만 쓰고 나머지 번호는 비워 둔 파일을 원래 번호순으로 모읍니다. ② 출처별로 이어 붙이기: 파일마다 1번부터 매긴 시험지·PDF·사진을 파일 순서대로 붙이고 번호를 새로 매깁니다. 올린 파일의 번호를 보고 알맞은 쪽을 먼저 골라 두며, 3단계에서 바꿀 수 있습니다.
      </div>
      <div className="grid gap-5 text-sm md:grid-cols-3">
        <Col n="A" title="자동으로 맞춥니다" rule="border-t-ok" tone="text-ok" items={AUTO} />
        <Col n="B" title="검수로 알려 줍니다" rule="border-t-warn" tone="text-warn" items={FLAG} />
        <Col n="C" title="선생님이 판단하세요" rule="border-t-ink" tone="text-ink" items={HUMAN} />
      </div>
      <p className="text-[11.5px] leading-relaxed text-ink-3">
        검수 근거로 쓰는 내장 참고 자료: 학교 「정기시험 문항 제작 및 출제 유의사항」(이 도구를 만든 학교의 지침)과 『2026학년도 전국연합학력평가 평가문항 제작 방법 직무연수(통합과학)』. 다른 학교·과목에서 쓸 때는 그 학교의 출제 지침을 우선하세요. 양식의 유의사항 문구는 올린 양식에서 직접 읽습니다.
      </p>
    </div>
  );
}

function Col({ n, title, rule, tone, items }: { n: string; title: string; rule: string; tone: string; items: string[] }) {
  return (
    <div className={`border-t-[3px] ${rule} pt-2`}>
      <h4 className={`mb-2 flex items-baseline gap-2 font-bold ${tone}`}>
        <span className="serif text-[18px]">{n}</span>
        <span>{title}</span>
      </h4>
      <ul className="space-y-1.5 text-[12.5px] leading-snug text-ink-2">
        {items.map((t) => (
          <li key={t} className="border-b border-line/60 pb-1.5 last:border-0">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
