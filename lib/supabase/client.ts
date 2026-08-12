import { createBrowserClient } from "@supabase/ssr";

// 브라우저에서 사용하는 Supabase 클라이언트.
// anon key만 사용하며 모든 접근은 RLS의 통제를 받는다.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
