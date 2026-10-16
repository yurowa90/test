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

## 디자인·접근성 규칙

- **대비(WCAG 2.2 SC 1.4.3, 4.5:1)**: 작은 글자의 보조색 `slate-500`은 `slate-50`(4.55:1)·흰 바탕(4.76:1)에서만 씁니다. `slate-100`(4.35:1)·`slate-200`(3.86:1) 바탕 위 작은 글자는 `slate-600` 이상을 씁니다.
- **상태는 글자로**: 정상·실패 같은 상태를 이모지·아이콘·색만으로 나타내지 않습니다. 아이콘은 장식으로 보고 `aria-hidden`을 붙입니다.
- **한국어 줄바꿈**: `body`에 `word-break: keep-all`(어절 단위)을 적용합니다. flex 안에서 긴 영문 토큰(환경 변수·URL)을 담는 자식에는 `min-w-0`을 줍니다.
- **모션**: 동작 줄이기(`prefers-reduced-motion: reduce`) 사용자에게는 전역에서 애니메이션·전환을 1ms로 줄입니다 (`app/globals.css`).
- **head**: 페이지마다 `export const metadata = { title: "…" }`만 두면 "… · 씽크루프 (가칭)"이 됩니다. 파비콘은 `app/icon.svg`, 브라우저 UI 색은 `app/layout.tsx`의 `viewport.themeColor`입니다.

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
