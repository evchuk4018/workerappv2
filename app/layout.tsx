import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./chat.css";
import "./controls.css";
import "./settings.css";
import "./responsive.css";

export const metadata: Metadata = {
  title: "DeepSeek Chat",
  description: "A focused DeepSeek V4 chat experience",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
