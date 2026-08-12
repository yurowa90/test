# 씽크루프 (가칭) — AI 학습 대화 플랫폼

한국 중·고등학교 독서교육·과학교육을 위한 AI 학습 대화 플랫폼.

- 교사가 AI 수업을 설계하고, 학생은 가입 없이 코드로 참여해 AI와 학습 대화를 나눕니다.
- AI는 정답 제공보다 질문·피드백으로 사고를 확장합니다 (소크라틱 대화).
- 모든 대화는 Supabase에 저장되고, 교사는 대시보드에서 관찰·평가·피드백을 확정합니다.
- Gemini API Key는 교사 소유(BYOK)이며 서버에 영구 저장하지 않습니다.

## 문서

설계 문서는 [`docs/`](./docs)에 있습니다. 시작점: [PRODUCT_SPEC.md](./docs/PRODUCT_SPEC.md), 개발 순서: [PHASE_PLAN.md](./docs/PHASE_PLAN.md)

## 기술 스택

Next.js 16 (App Router) · TypeScript · React 19 · Tailwind CSS 4 · Supabase (PostgreSQL/Auth/Realtime/Edge Functions) · Google Gemini (@google/genai)

## 개발 시작

```bash
npm install
cp .env.example .env.local   # Supabase URL·anon key 입력
npm run dev                  # http://localhost:3000
```

연결 확인: `/status` 페이지에서 Supabase Auth·DB API 연결 상태를 진단할 수 있습니다.

## 저장소 구조

- `app/`, `lib/`, `components/` — Next.js 애플리케이션
- `supabase/` — 마이그레이션·Edge Functions (PHASE 2부터)
- `docs/` — 설계 문서 (PHASE 0)
- `legacy-ubd-designer/` — 이전 실험 프로젝트 보관 (본 플랫폼과 무관)
