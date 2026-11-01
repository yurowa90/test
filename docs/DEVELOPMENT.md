# 개발 문서

사용 안내는 [README](../README.md)에 있습니다. 이 문서는 코드를 고치거나 배포하는 사람을 위한 것입니다.

## 스택

- Vite + React 19 + TypeScript, Tailwind CSS v4
- 백엔드 없음. BYOK(Bring Your Own Key) 방식으로 브라우저에서 Gemini API를 직접 호출합니다. 키와 모델 선택은 localStorage에 저장합니다.
- Gemini `responseSchema`로 JSON 출력을 강제해 파싱 오류를 막습니다.
- Vercel 정적 배포용 `vercel.json`이 들어 있습니다.

## 로컬 실행과 빌드

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc 타입 검사 + 정적 빌드 → dist/
```

## 생성 단계

- **Pass 1** (`generateStage1`): 성취기준 → 전이 목표·영속적 이해 2·본질적 질문 2.
- **Pass 2a** (`generateGraspsCandidates`): 확정된 Stage 1 → 6요소별 후보 문장 2~3개.
- **Pass 2b** (`generateGraspsFinal`): 교사가 고른 6요소 → 학생용 안내문 + 정렬 루브릭.

`src/lib/gemini.ts`는 429·503 응답을 1회 재시도하고, 오류를 한국어로 보여 줍니다.

## 구조

```
src/
├─ App.tsx                # 4단계 위저드 상태 머신 (input → stage1 → candidates → result)
├─ components/
│  ├─ InputForm.tsx       # 교과·학년·성취기준 입력
│  ├─ Stage1Review.tsx    # 인라인 편집 가능한 Stage 1 검토 (건너뛸 수 없는 관문)
│  ├─ CandidateSelect.tsx # 요소별 후보 선택·편집 (Pass 2a → 2b 사이)
│  ├─ GraspsResult.tsx    # 6요소 카드 + 안내문 + 정렬 루브릭
│  └─ ApiKeyModal.tsx     # BYOK 키·모델 설정
├─ lib/
│  ├─ gemini.ts           # generateStage1 / generateGraspsCandidates / generateGraspsFinal
│  ├─ standards.ts        # 공식 성취기준 로드 + 학교급/과목/영역 단계별 목록
│  ├─ prompts.ts          # 프롬프트 빌더 + JSON 스키마
│  ├─ markers.ts          # 정렬 표식 색상
│  ├─ export.ts           # toMarkdown / 복사 / 다운로드
│  └─ storage.ts          # localStorage 래퍼
├─ knowledge/             # 시스템 프롬프트에 넣는 요약 지식 (출처는 README '근거 자료')
│  ├─ ubd_stage1.md
│  ├─ grasps.md
│  ├─ six_facets.md
│  ├─ udl.md
│  └─ quality_checklist.md
└─ types.ts

public/
└─ science_standards.json  # 2022 개정 과학과 성취기준 473 + 성취수준 A~E 371
```

GRASPS의 P는 원저에서 Product/Performance/Purpose로 혼용되므로 코드 내부 키는 `performanceProduct`로 통일했습니다.
