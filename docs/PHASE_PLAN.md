# PHASE_PLAN — 단계별 개발 계획

- 문서 버전: 0.1 (PHASE 0)
- 대원칙: **원샷 코딩 금지.** 앞 PHASE의 완료 조건과 다음 단계 진입 조건을 만족하기 전에는 다음 PHASE 코드를 작성하지 않는다. 각 PHASE 내부 작업 순서는 항상 다음을 따른다: 요구사항 분석 → 구현 목표 정의 → 영향 파일 목록 → 데이터 구조 → 보안 위험 검토 → 구현 계획 → 최소 코드 구현 → 테스트 → 오류 수정 → 완료 보고.

## 선행 결정 사항 (PHASE 1 시작 전 확인 필요)

| # | 항목 | 상태 |
|---|---|---|
| D1 | 저장소에 남아 있는 기존 Vite 실험 코드(src/, index.html, vite.config.ts 등) 처리 — 삭제 또는 별도 브랜치/폴더 보관 | **사용자 확인 필요** |
| D2 | Supabase 프로젝트 생성 (조직·리전 선택, 무료/유료 티어) | 사용자 준비 필요 |
| D3 | Google OAuth Client 발급 (교사 로그인용) | PHASE 2 전까지 준비 |
| D4 | 서비스 이름 확정 (문서상 가칭: 씽크루프) | 미정 (개발 차단 요소 아님) |

---

## PHASE 0 — 제품 요구사항 및 아키텍처 ✅ (본 문서 세트)

- 목표: 구현 전 설계 확정
- 산출물: PRODUCT_SPEC / USER_FLOW / ARCHITECTURE / DATABASE_DESIGN / AI_ARCHITECTURE / SECURITY_MODEL / PHASE_PLAN
- 완료 조건: 7개 문서 작성 완료, 코드·마이그레이션·npm install 미실행
- 다음 단계 진입 조건: 사용자(교사)가 설계 검토 후 승인, D1·D2 결정

## PHASE 1 — Next.js 프로젝트 및 Supabase 기본 연결

| 항목 | 내용 |
|---|---|
| 목표 | 실행 가능한 빈 앱 + Supabase 연결 확인 |
| 구현 기능 | Next.js(App Router, TS, Tailwind) 스캐폴드 · supabase-js 클라이언트 3종(browser/server/middleware) · 환경 변수 로딩 · 연결 상태 확인용 내부 페이지 · Supabase CLI 초기화(마이그레이션 폴더 구성) |
| 변경 파일 | `package.json`, `app/layout.tsx`, `app/page.tsx`, `lib/supabase/{client,server,middleware}.ts`, `supabase/config.toml`, `.env.example`, `.gitignore` |
| DB 변경 | 없음 (프로젝트 연결만) |
| 테스트 | `next build` 통과 · 로컬 실행 후 Supabase 연결 확인 · `.env` 미커밋 확인 |
| 완료 조건 | 빌드·실행·연결 3종 통과, stable 버전 확인 결과를 ARCHITECTURE.md에 기록 |
| 진입 조건(→2) | 위 완료 조건 + Supabase 프로젝트 접근 정보 확보 |

## PHASE 2 — Teacher Auth + Student Anonymous Auth

| 항목 | 내용 |
|---|---|
| 목표 | 교사 Google 로그인, 학생 익명 세션 발급 |
| 구현 기능 | Google OAuth 로그인/로그아웃 · 로그인 시 profiles upsert · 익명 sign-in 유틸 · 교사 라우트 보호(미들웨어) · 익명 토큰의 교사 화면 접근 차단 |
| 변경 파일 | `app/(teacher)/login/`, `app/(teacher)/dashboard/`(빈 껍데기), `lib/supabase/middleware.ts`, `lib/domain/auth.ts` |
| DB 변경 | `profiles` 테이블 + RLS + moddatetime 트리거 (마이그레이션 1개) |
| 테스트 | 교사 로그인→profiles 생성 확인 · 비로그인/익명 토큰으로 교사 라우트 접근 차단 · 교사 A가 B의 profile 조회 불가(RLS) |
| 완료 조건 | 위 테스트 통과, Supabase Anonymous Sign-In 활성화 확인 |
| 진입 조건(→3) | 인증 흐름 안정 (재로그인·세션 갱신 포함) |

## PHASE 3 — Class / Lesson / Participant 시스템

| 항목 | 내용 |
|---|---|
| 목표 | 수업 생성~학생 참여까지 (AI 없이) 완결 |
| 구현 기능 | Class CRUD · Lesson CRUD(설정 항목 전체, status 전이 draft↔active→ended) · join_code 생성 · `join_lesson(code, nickname)` RPC(익명 인증→participant+conversation 생성) · 학생 참여 화면 · lesson_student_view |
| 변경 파일 | `app/(teacher)/classes/`, `app/(teacher)/lessons/[id]/edit/`, `app/(student)/join/[code]/`, `lib/domain/{class,lesson,participant}.ts` |
| DB 변경 | `classes`, `lessons`, `participants`, `conversations` + 전 테이블 RLS + `join_lesson` RPC + `lesson_student_view` (마이그레이션 2~3개) |
| 테스트 | 수업 생성→코드 참여→participant 생성 E2E · 닉네임 중복 거부 · draft/ended 수업 참여 거부 · RLS 교차 접근 시나리오(DATABASE_DESIGN.md §5.2의 1~5) |
| 완료 조건 | 교사·학생 흐름이 AI 없이 동작, RLS 테스트 통과 |
| 진입 조건(→4) | 학생 30명 규모 참여 시나리오 수동 확인 |

## PHASE 4 — Gemini API Key Validator

| 항목 | 내용 |
|---|---|
| 목표 | 채팅 구현 전, 키 진단 기능 독립 완성 (BYOK 신뢰 기반 확보) |
| 구현 기능 | `/settings/ai` 화면 · sessionStorage 키 보관 · `validate-gemini-key` EF(@google/genai 최초 도입) · 오류 정규화 10종 + 한국어 안내 · `lib/ai/` 4개 모듈(models/errors/types/prompts 뼈대) · ai_usage_logs 기록 시작 |
| 변경 파일 | `app/(teacher)/settings/ai/`, `lib/ai/*`, `supabase/functions/_shared/ai/{gemini-client,gemini-validator}.ts`, `supabase/functions/validate-gemini-key/` |
| DB 변경 | `ai_usage_logs` + RLS (마이그레이션 1개) |
| 테스트 | 유효 키 성공 · 무효 키→KEY_INVALID · 오탈자 모델→MODEL_NOT_AVAILABLE · 429 모의→RATE_LIMITED/QUOTA_EXHAUSTED 구분 · 네트워크 차단→NETWORK_ERROR · 키가 로그·DB 어디에도 없음 확인 |
| 완료 조건 | 실제 교사 키로 검증 성공, 오류별 한국어 안내 표시, `gemini-3.6-flash` 접근 가능 확인(불가 시 중앙 설정 조정 후 문서 기록) |
| 진입 조건(→5) | 키 검증 안정 + 오류 정규화 로직에 대한 단위 테스트 통과 |

## PHASE 5 — Student AI Conversation

| 항목 | 내용 |
|---|---|
| 목표 | 학생-AI 대화 완성 (저장·idempotency·한도·요약) |
| 구현 기능 | `lesson-key` EF(임시 키 암호화 등록/삭제, 수업 시작·종료 연동) · `chat` EF(AI_ARCHITECTURE.md §5.3의 8단계) · `summarize` EF · 학생 대화 화면(제목/목표/대화/입력/진행 상태) · 응답 횟수 제한 · Realtime 수신 |
| 변경 파일 | `app/(student)/chat/`, `supabase/functions/{lesson-key,chat,summarize}/`, `lib/ai/prompts/chat-system.ts`, `components/student/*` |
| DB 변경 | `messages`, `conversation_summaries`, `lesson_ai_credentials`(deny-all) + RLS (마이그레이션 1~2개) |
| 테스트 | 대화 E2E · 동일 client_message_id 재전송→중복 0건 · Gemini 실패 시 학생 메시지 보존·재시도 성공 · 횟수 소진 시 차단 · 학생 B 대화 접근 불가 · 요약 생성 확인 · 키 미노출 확인(네트워크 탭·번들) |
| 완료 조건 | 학생 1명 전체 대화 흐름 안정, idempotency 테스트 통과 |
| 진입 조건(→6) | 소규모 동시 접속(5~10명) 대화 시나리오 통과 |

## PHASE 6 — Teacher Conversation Dashboard

| 항목 | 내용 |
|---|---|
| 목표 | 교사의 실시간 관찰·열람 |
| 구현 기능 | Class Overview(참여/진행/완료 인원, 평균 턴) · Student List(닉네임·상태·턴 수·최근 접속) · Student Detail(대화 전문·요약) · Realtime 구독(messages/participants) · 수업 시작/종료 버튼(키 등록/삭제 연동) |
| 변경 파일 | `app/(teacher)/lessons/[id]/dashboard/`, `app/(teacher)/lessons/[id]/students/[participantId]/`, `components/teacher/*` |
| DB 변경 | 없음 (집계 뷰 필요 시 read-only 뷰 1개) |
| 테스트 | 학생 발화가 교사 화면에 실시간 반영 · 타 교사 수업 대시보드 접근 불가 · 30명 목록 렌더 성능 확인 |
| 완료 조건 | 수업 1회를 대시보드만으로 관찰 가능 |
| 진입 조건(→7) | 교사 시나리오(시작→관찰→종료) 무결점 통과 |

## PHASE 7 — AI Evaluation

| 항목 | 내용 |
|---|---|
| 목표 | 루브릭 기반 평가 실행·저장·열람 |
| 구현 기능 | 루브릭 CRUD 화면(criterion 편집) · `evaluate` EF(구조화 JSON, zod 검증, evidence 검증) · 수업 단위 일괄 실행 + 개별 재실행 · Student Detail에 criterion별 점수·근거·이유 표시 · 근거 클릭→해당 메시지 스크롤 |
| 변경 파일 | `app/(teacher)/lessons/[id]/edit/`(루브릭 탭), `supabase/functions/evaluate/`, `lib/ai/prompts/evaluation.ts`, `lib/domain/rubric.ts` |
| DB 변경 | `rubrics`, `rubric_criteria`, `evaluations`, `evaluation_items` + RLS (마이그레이션 1~2개) |
| 테스트 | 평가 실행→criterion별 결과 저장 · evidence_message_ids 전수 실재 검증 · 불량 JSON 응답 재시도→실패 시 failed 처리 · 학생의 evaluations 접근 불가 · running 중복 실행 차단 |
| 완료 조건 | 실제 대화 3건 이상에 대해 근거 연결이 유효한 평가 생성 |
| 진입 조건(→8) | 평가 JSON 스키마 검증 단위 테스트 통과 |

## PHASE 8 — AI Feedback

| 항목 | 내용 |
|---|---|
| 목표 | AI 피드백 초안 → 교사 검토·수정·확정 → (설정 시) 학생 공개 |
| 구현 기능 | 평가 완료 시 종합 피드백 초안 생성(ai_draft) · 교사 편집 UI(초안 대비 수정) · 확정(confirmed) 처리 · 학생 화면에 확정 피드백 표시(show_score_to_student 조건) |
| 변경 파일 | Student Detail 피드백 패널, `app/(student)/chat/`(피드백 표시), `lib/domain/feedback.ts` |
| DB 변경 | `teacher_feedback` + RLS(학생 조건부 select 포함) (마이그레이션 1개) |
| 테스트 | 초안→수정→확정 흐름 · 확정 전 학생에게 완전 비노출 · show_score=false 수업에서 확정 후에도 비노출 · 타 학생 피드백 접근 불가 |
| 완료 조건 | 교사 확정 워크플로 완결, 공개 조건 테스트 통과 |
| 진입 조건(→9) | 평가~피드백 E2E 1회 완주 |

## PHASE 9 — Reading Education Templates

| 항목 | 내용 |
|---|---|
| 목표 | 독서교육 내장 템플릿 제공 |
| 구현 기능 | `lesson_templates` 시스템(목록·미리보기·수업 생성 시 적용: system_instruction/기본 목표/기본 루브릭 복제) · 독서 템플릿 seed(텍스트 이해, 근거 찾기, 추론, 질문 생성, 인물 관점 분석, 관점 비교, 비판적 읽기, 논증 검토, 책-경험 연결, 성찰, 비경쟁 독서토론 준비 중 우선순위 선별 5~8종) |
| 변경 파일 | 수업 생성 화면(템플릿 선택 단계), `lib/domain/template.ts`, seed 마이그레이션 |
| DB 변경 | `lesson_templates` + RLS + 내장 seed (마이그레이션 1~2개) |
| 테스트 | 템플릿 적용→수업 생성→루브릭 복제 확인 · 내장 템플릿 수정 불가(복제만) · 교사 개인 템플릿 격리 |
| 완료 조건 | 독서 템플릿으로 수업 1회 완주(대화 품질 교사 검수 포함) |
| 진입 조건(→10) | 템플릿 구조가 과학 템플릿을 추가 코드 변경 없이 수용 가능함을 확인 |

## PHASE 10 — Science Education Templates

| 항목 | 내용 |
|---|---|
| 목표 | 과학교육 내장 템플릿 제공 |
| 구현 기능 | 과학 템플릿 seed(개념 이해, 과학적 질문 생성, 가설 생성, 자료 해석, 증거 평가, CER, 인과관계 추론, 대안 설명, 반례 검토, 실험 설계, 과학적 문제 해결, SSI 중 우선순위 선별 5~8종) — 코드 변경은 seed와 프롬프트 검수 위주 |
| 변경 파일 | seed 마이그레이션, 필요 시 프롬프트 조립기 미세 조정 |
| DB 변경 | seed 추가만 |
| 테스트 | 과학 템플릿 수업 1회 완주 · CER 등 구조화 대화 품질 검수 |
| 완료 조건 | 독서·과학 양쪽 템플릿 목록 제공 |
| 진입 조건(→11) | 전 기능 동작 상태 (기능 추가 동결) |

## PHASE 11 — Security / RLS / Integration Test

| 항목 | 내용 |
|---|---|
| 목표 | 보안 검증과 통합 테스트로 릴리스 판정 |
| 구현 기능 | RLS 자동 테스트(교사 A/B·학생 A/B·anon 매트릭스 — DATABASE_DESIGN.md §5.2 전체) · SECURITY_MODEL.md §4 위협 17종 점검 · 프롬프트 주입 회귀 세트 · 키 금지 위치 스캔 · rate limit 부하 테스트 · E2E(참여→대화→평가→확정) 자동화 |
| 변경 파일 | `tests/`(RLS·EF·E2E), CI 설정 파일 |
| DB 변경 | 없음 (발견된 결함 수정 마이그레이션만) |
| 테스트 | 본 PHASE 자체가 테스트. 발견 결함은 심각도 분류 후 전건 수정 |
| 완료 조건 | 보안 체크리스트(SECURITY_MODEL.md §7) 전 항목 통과, E2E 그린 |
| 진입 조건(→12) | 치명·높음 결함 0건 |

## PHASE 12 — Production Optimization

| 항목 | 내용 |
|---|---|
| 목표 | 운영 준비 (성능·비용·배포) |
| 구현 기능 | 쿼리·인덱스 점검(30명 동시 기준) · 번들 최적화 · 컨텍스트 토큰 예산 튜닝(N·요약 주기) · 만료 데이터 정리 작업(임시 키·오래된 로그) · 배포 대상 확정·배포 파이프라인 · 운영 문서(교사 온보딩 가이드, 장애 대응) |
| 변경 파일 | 배포 설정, `docs/OPERATIONS.md`(신규) |
| DB 변경 | 인덱스 보강 정도 |
| 테스트 | 스테이징에서 실제 수업 리허설 1회(교사 1 + 학생 20~30) |
| 완료 조건 | 리허설 무장애 완주, 배포 절차 문서화 |
| 진입 조건 | — (릴리스) |

---

## PHASE 진행 규칙 요약

1. 각 PHASE는 독립적으로 동작 가능한 최소 기능을 만든다 — 다음 PHASE 기능을 선행 구현하지 않는다.
2. DB 마이그레이션은 해당 PHASE에서 필요한 테이블만 만든다 (전체 스키마 일괄 생성 금지). 단, 각 마이그레이션은 RLS·트리거·인덱스를 반드시 동반한다.
3. 각 PHASE 완료 보고에는 다음을 포함한다: 구현 내역 / 테스트 결과 / 발견·수정한 오류 / 다음 PHASE 진입 조건 충족 여부.
4. post-MVP 백로그(PDF 업로드, 링크 자료, participant 병합 도구, 상위 평가 모델 분리 등)는 PHASE 12 이후 별도 계획으로 다룬다.
