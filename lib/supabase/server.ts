import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// 서버 컴포넌트/Route Handler에서 사용하는 Supabase 클라이언트.
// 사용자 세션 쿠키의 JWT를 그대로 전달하므로 RLS가 동일하게 적용된다.
// service role key는 여기서도 사용하지 않는다 (ARCHITECTURE.md §3).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 서버 컴포넌트에서 호출된 경우 쿠키 쓰기가 불가능하다.
            // 세션 갱신은 미들웨어(updateSession)가 담당한다.
          }
        },
      },
    },
  );
}
