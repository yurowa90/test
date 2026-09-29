import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // rhwp WASM(약 9.5MB)은 별도 에셋으로 두고 필요할 때만 불러옵니다.
    assetsInlineLimit: 0,
  },
});
