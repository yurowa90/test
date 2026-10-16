import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // 각 페이지는 `title`만 내보내면 "페이지명 · 씽크루프 (가칭)"이 된다.
  title: {
    default: "씽크루프 (가칭)",
    template: "%s · 씽크루프 (가칭)",
  },
  description: "독서·과학교육을 위한 AI 학습 대화 플랫폼",
};

export const viewport: Viewport = {
  // 모바일 브라우저 UI 색 = body 바탕(slate-50)
  themeColor: "#f8fafc",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
