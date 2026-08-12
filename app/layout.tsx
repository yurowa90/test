import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "씽크루프 (가칭)",
  description: "독서·과학교육을 위한 AI 학습 대화 플랫폼",
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
