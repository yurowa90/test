import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold">씽크루프 (가칭)</h1>
      <p className="text-slate-600">
        독서·과학교육을 위한 AI 학습 대화 플랫폼 — 개발 중 (PHASE 1)
      </p>
      <Link
        href="/status"
        className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
      >
        Supabase 연결 상태 확인
      </Link>
    </main>
  );
}
