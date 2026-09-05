import type {
  AnalysisResult,
  Assembly,
  FinalItem,
  Scenario,
  Stimulus,
  TeacherInput,
  WizardStep,
} from "../types";
import { CIRCLED, composeStem, pickLabel } from "../lib/assemble";
import StimulusBody from "./StimulusBody";
import ScientificFigure from "./ScientificFigure";
import { sourceNote } from "../lib/export";

interface Props {
  step: WizardStep;
  input: TeacherInput;
  analysis: AnalysisResult | null;
  scenario: Scenario | null;
  stimulus: Stimulus | null;
  assembly: Assembly | null;
  final: FinalItem | null;
}

function EmptyPreview({ input }: { input: TeacherInput }) {
  return (
    <div className="preview-empty">
      <span className="preview-empty-index">01</span>
      <h2>{input.standard ? "평가 요소를 분석할 준비가 됐습니다" : "성취기준을 선택하세요"}</h2>
      <p>
        {input.standard
          ? "오른쪽 설정에서 출처와 문항 조건을 확인한 뒤 평가 요소 분석을 시작하세요."
          : "오른쪽 설정에서 과목과 성취기준을 선택하면 문항 설계 정보가 여기에 정리됩니다."}
      </p>
    </div>
  );
}

export default function WorkspacePreview({
  step,
  input,
  analysis,
  scenario,
  stimulus,
  assembly,
  final,
}: Props) {
  const statements = final?.statements ?? assembly?.picks.map((pick) => pick.text) ?? [];
  const answer = assembly && assembly.answerIndex >= 0 ? CIRCLED[assembly.answerIndex] : "-";

  return (
    <article className="preview-sheet" aria-label="문항 설계 미리보기">
      <header className="preview-sheet-head">
        <div>
          <span>학력평가형 과학 문항</span>
          <strong>{input.subject || "과목 미지정"}</strong>
        </div>
        <div className="preview-sheet-stamps" aria-label="문서 상태">
          <span>교사용</span>
          <span>{step === "result" ? "검토" : "초안"}</span>
        </div>
      </header>

      {!analysis ? (
        <EmptyPreview input={input} />
      ) : !stimulus ? (
        <div className="preview-analysis">
          <span className="preview-section-number">01</span>
          <p className="preview-kicker">교육과정 분석</p>
          <h2>{analysis.assessmentElement}</h2>
          <dl>
            <div>
              <dt>평가 목표</dt>
              <dd>{analysis.assessmentGoal}</dd>
            </div>
            <div>
              <dt>행동 영역</dt>
              <dd>{analysis.behaviorDomain}</dd>
            </div>
            <div>
              <dt>문제 장면</dt>
              <dd>{scenario?.title || "오른쪽에서 장면을 선택하세요"}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="preview-item">
          <div className="preview-item-meta">
            <span>{input.standardCode || "직접 입력"}</span>
            <span>{analysis.behaviorDomain}</span>
            <span>{scenario?.stimulusType || "자료"}</span>
          </div>
          <p className="preview-question-number">1.</p>
          <p className="preview-indirect-stem">{final?.indirectStem || stimulus.indirectStem}</p>
          <div className="preview-stimulus">
            <StimulusBody text={final?.body || stimulus.body} />
            <ScientificFigure figure={final?.figure ?? stimulus.figure} source={sourceNote(input, stimulus)} />
          </div>
          {assembly ? (
            <>
              <p className="preview-direct-stem">
                {composeStem(
                  stimulus.stemPrefix,
                  assembly.directStem,
                  final?.conditions || stimulus.conditions,
                )}
              </p>
              {assembly.format === "hapdab" ? (
                <div className="preview-bogi">
                  <strong>보 기</strong>
                  {statements.length > 0 ? (
                    <ul>
                      {statements.map((statement, index) => (
                        <li key={`${statement}-${index}`}>
                          <span>{pickLabel("hapdab", index)}.</span>
                          {statement}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>오른쪽에서 명제를 선택하세요.</p>
                  )}
                </div>
              ) : (
                <ol className="preview-options">
                  {statements.map((statement, index) => (
                    <li key={`${statement}-${index}`}>
                      <span>{CIRCLED[index]}</span>
                      {statement}
                    </li>
                  ))}
                </ol>
              )}
              {assembly.format === "hapdab" && assembly.choices.length > 0 && (
                <div className="preview-choice-row">
                  {assembly.choices.map((choice, index) => (
                    <span key={`${choice}-${index}`}>
                      {CIRCLED[index]} {choice}
                    </span>
                  ))}
                </div>
              )}
              <div className="preview-teacher-note">
                <span>교사 확인</span>
                <strong>정답 {answer}</strong>
              </div>
            </>
          ) : (
            <p className="preview-awaiting">자료가 생성됐습니다. 오른쪽에서 명제를 조립하세요.</p>
          )}
        </div>
      )}

      <footer className="preview-sheet-foot">
        <dl>
          <div>
            <dt>평가 유형</dt>
            <dd>정기시험용 선다형</dd>
          </div>
          <div>
            <dt>출처</dt>
            <dd>{input.sourceMode === "reference" ? `교사 대조 출처 ${input.sources.filter((source) => source.verified).length}개` : "교육용 합성 자료"}</dd>
          </div>
          <div>
            <dt>문항 수</dt>
            <dd>1개</dd>
          </div>
        </dl>
      </footer>
    </article>
  );
}
