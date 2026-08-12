# GRASPS 설계 도우미 (MVP)

성취기준에서 GRASPS를 곧바로 뽑는 대신, **백워드 설계(UbD)의 정렬 원리**를 지키는 2단계 생성 파이프라인 웹앱입니다.

> 성취기준 → GRASPS 직행은 "무엇에 대한 이해의 증거인가"가 비어 있는 과제를 만듭니다(Wiggins가 경고한 activity-oriented design). 이 앱은 Stage 1을 먼저 확정하고, 그 이해를 평가하는 과제를 생성합니다.

## 파이프라인 (4단계 위저드, 2단계 생성)

1. **입력**: **2022 개정 교육과정 과학과 공식 성취기준 473개**(초·중·고 22과목)에서 학교급→과목→영역→성취기준으로 골라 넣습니다(직접 입력 모드도 있음). 성취수준 A~E가 있는 371개 기준을 고르면, 그 공식 A~E 서술이 뒤 단계 루브릭 눈금의 근거로 쓰입니다.
2. **Pass 1 — Stage 1 추출**: 성취기준 → 전이 목표 · 영속적 이해 2 · 본질적 질문 2 (교사가 인라인으로 검토·수정하는 **필수 관문**)
3. **Pass 2a — GRASPS 요소 후보**: 확정된 Stage 1 → 6요소(G·R·A·S·P·S) 각각 **2~3개 후보 문장** 생성. 교사가 요소별로 하나를 고르고 필요하면 손봅니다. (원저 Wiggins & McTighe, Fig 7.7의 복수 문장 틀 설계를 반영)
4. **Pass 2b — 완성**: 교사가 확정한 6요소 → 6요소를 통합한 학생용 안내문 + 루브릭. 루브릭 준거는 확정된 산출물·상황 진술에서 역추적 가능하도록 정렬되며, 공식 성취수준이 있는 기준이면 루브릭 수준을 그 A~E(과학탐구실험은 A~C) 체계에 맞춰 생성합니다.

**시그니처 — 정렬을 눈으로**: 각 영속적 이해에 색 표식(U1, U2…)이 붙고, 그 이해를 평가하는 루브릭 준거에 **같은 표식**이 다시 나타납니다. "이해 → 평가"의 정렬이 시각적으로 확인됩니다.

선택: **UDL 산출물 옵션** 토글을 켜면 같은 이해를 여러 산출 형태(보고서·발표·영상·모형)로 드러내도록 P를 다양화합니다(UDL 3.0 행동·표현의 다양한 수단).

## 스택

- Vite + React 19 + TypeScript, Tailwind CSS v4
- 백엔드 없음 — **BYOK**(Bring Your Own Key) Gemini. API 키는 브라우저 localStorage에만 저장되고 Google로 직접 호출됩니다.
- Gemini `responseSchema`로 JSON 강제 출력 → 파싱 오류 방지.
- Vercel 정적 배포용(`vercel.json` 포함).

## 로컬 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc 타입체크 + 정적 빌드 → dist/
```

앱을 열고 우상단 **API 키 설정**에서 [Google AI Studio](https://aistudio.google.com/app/apikey) 키를 등록하세요.

## 구조

```
src/
├─ App.tsx                # 3스텝 위저드 상태 머신 (input → stage1 → result)
├─ components/
│  ├─ InputForm.tsx       # 교과·학년·성취기준 입력
│  ├─ Stage1Review.tsx    # 인라인 편집 가능한 Stage 1 검토 (건너뛸 수 없는 관문)
│  ├─ CandidateSelect.tsx # 요소별 후보 선택·편집 (Pass 2a → 2b 사이)
│  ├─ GraspsResult.tsx    # 6요소 카드 + 안내문 + 정렬 루브릭
│  └─ ApiKeyModal.tsx     # BYOK 키·모델 설정
├─ lib/
│  ├─ gemini.ts           # generateStage1 / generateGraspsCandidates / generateGraspsFinal
│  │                      #   (responseSchema 강제, 429/503 1회 재시도, 한국어 에러)
│  ├─ standards.ts        # 공식 성취기준 로드 + 학교급/과목/영역 캐스케이드 헬퍼
│  ├─ prompts.ts          # buildStage1*/buildCandidates*/buildFinal* + JSON 스키마
│  ├─ markers.ts          # 정렬 마커 팔레트
│  ├─ export.ts           # toMarkdown / 복사 / 다운로드
│  └─ storage.ts          # localStorage 래퍼
├─ knowledge/             # Phase 0 증류 지식 (시스템 프롬프트에 임베드)
│  ├─ ubd_stage1.md       # Stage 1 판별 기준 + Figure 1·2 원문 예시
│  ├─ grasps.md           # GRASPS 6요소 + Stage 2 원리
│  ├─ six_facets.md       # 이해의 여섯 측면 (과제·루브릭 설계 렌즈)
│  ├─ udl.md              # UDL 3.0 행동·표현의 다양화
│  └─ quality_checklist.md
└─ types.ts

public/
└─ science_standards.json  # 2022 개정 과학과 성취기준 473 + 성취수준 A~E 371
```

## 근거 자료 (Phase 0)

`knowledge/`는 아래 원자료를 앱 목적에 맞게 증류한 요약입니다. 각 파일에 1차 출처와 페이지·그림 번호를 표기했습니다.

- **McTighe, J. & Wiggins, G. (2012). *Understanding by Design® Framework* [백서]. ASCD.** — `ubd_stage1.md`, `six_facets.md`, `quality_checklist.md`, `grasps.md`의 Stage 2 원리가 이 문서(3단계, 7개 원칙, Figure 1·2, 이해의 여섯 측면, 정렬, Appendix A·B)에 근거합니다.
- Wiggins, G. & McTighe, J. (2005). *Understanding by Design* (Expanded 2nd ed.), 제7장 pp. 157–159, Figure 7.7 "GRASPS Task Design Prompts". ASCD. — **GRASPS 6요소 약어의 1차 출처.** 2012 백서에는 "GRASPS"라는 약어가 등장하지 않으므로, 약어 정의·프롬프트·예시는 이 원저 기준입니다. (P는 Product/Performance/Purpose로 혼용 → 코드 내부 키 `performanceProduct`로 통일)
- CAST (2024). *UDL Guidelines version 3.0.* https://udlguidelines.cast.org — `udl.md`. (2.2와 체크포인트 문구가 다르므로 3.0 기준임을 명시)

원문 인용이 필요하면 각 원자료를 직접 확인하세요.
