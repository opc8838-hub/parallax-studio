import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "视差工坊 — 可编辑的图片特效画廊",
  description: "上传自己的图片，编辑横向视差与七种 WebGL 悬停效果，实时预览并自动保存。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
