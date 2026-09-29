import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 배포 서버(vercel.json·netlify.toml)와 같은 보안 헤더를 미리보기 서버에도 걸어, CSP 아래에서 동작하는지 로컬에서 확인합니다.
// 시험 파일이 든 페이지가 외부 스크립트·자원을 불러오거나 내보내지 못하게 합니다.
const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' blob: data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: {
    headers: { "Content-Security-Policy": CSP, "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" },
  },
  build: {
    // rhwp WASM(약 9.5MB)은 별도 에셋으로 두고 필요할 때만 불러옵니다.
    assetsInlineLimit: 0,
  },
});
