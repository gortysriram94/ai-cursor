import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ThemeProvider from "./components/ThemeProvider";
import AgentStatus from "./components/AgentStatus";
import AiJobWorker from "./components/AiJobWorker";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "AI Cursor — Your AI layer. Every app.",
  description: "Press Alt+A anywhere on your desktop to reply, summarize, fill forms, and write faster — without leaving the app you're in. Free download for Windows.",
  openGraph: {
    title: "AI Cursor — Your AI layer. Every app.",
    description: "Press Alt+A on any text. AI replies, fills forms, and writes for you — inside any Windows app.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        {/* Runs synchronously before first paint — sets theme with zero flash */}
        <script dangerouslySetInnerHTML={{ __html: `
(function(){
  try {
    var t = localStorage.getItem('pushpa_theme') || 'light';
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.style.backgroundColor = t === 'light' ? '#F9FAFB' : '#1A1611';
  } catch(e) {}
})();
        `}} />
      </head>
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider>
          {children}
          <AgentStatus />
          <AiJobWorker />
        </ThemeProvider>
      </body>
    </html>
  );
}
