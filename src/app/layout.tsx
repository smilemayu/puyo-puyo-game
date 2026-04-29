import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ぷよぷよ",
  description: "Modern Puyo Puyo game built with Next.js",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
