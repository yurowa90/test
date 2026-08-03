import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // GitHub Pages 하위 경로(/test/)에서도 동작하도록 상대 경로 빌드
  base: "./",
  plugins: [react(), tailwindcss()],
});
