import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Xian — Seven Studies",
  description: "A horizontal WebGL portrait gallery.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
