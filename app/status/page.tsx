export const dynamic = "force-dynamic";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

async function checkSupabase(): Promise<CheckResult[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return [
      {
        name: "환경 변수",
        ok: false,
        detail:
          "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다. .env.example을 참고해 .env.local을 만들어 주세요.",
      },
    ];
  }

  const results: CheckResult[] = [
    { name: "환경 변수", ok: true, detail: "URL·anon key 설정됨" },
  ];

  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    results.push({
      name: "Auth 서비스",
      ok: res.ok,
      detail: res.ok ? "정상" : `HTTP ${res.status}`,
    });
  } catch {
    results.push({
      name: "Auth 서비스",
      ok: false,
      detail: "연결 실패 — URL을 확인해 주세요",
    });
  }

  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: anonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    results.push({
      name: "PostgREST (DB API)",
      ok: res.ok,
      detail: res.ok ? "정상 (anon key 유효)" : `HTTP ${res.status} — anon key를 확인해 주세요`,
    });
  } catch {
    results.push({
      name: "PostgREST (DB API)",
      ok: false,
      detail: "연결 실패 — URL을 확인해 주세요",
    });
  }

  return results;
}

export default async function StatusPage() {
  const results = await checkSupabase();
  const allOk = results.every((r) => r.ok);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-2xl font-bold">Supabase 연결 상태</h1>
      <p className="mb-6 text-sm text-slate-500">
        개발용 진단 페이지 (PHASE 1) — 요청 시점에 실시간으로 확인합니다.
      </p>
      <ul className="space-y-3">
        {results.map((r) => (
          <li
            key={r.name}
            className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-4"
          >
            <span aria-hidden>{r.ok ? "✅" : "❌"}</span>
            <div>
              <p className="font-medium">{r.name}</p>
              <p className="text-sm text-slate-600">{r.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm">
        {allOk
          ? "모든 항목 정상 — PHASE 2를 진행할 수 있습니다."
          : "실패 항목이 있습니다. 안내에 따라 설정을 확인해 주세요."}
      </p>
    </main>
  );
}
