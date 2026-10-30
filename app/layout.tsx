import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans, Fira_Code } from "next/font/google";
import "./globals.css";

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const firaCode = Fira_Code({
  variable: "--font-mono-fallback",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Que_Me — SQL Query & Diagnostic Studio",
  description: "Investigation and SQL query generation dashboard for TradingAccount operations and database diagnostics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cormorantGaramond.variable} ${dmSans.variable} ${firaCode.variable} antialiased dark`}
    >
      <body className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-body selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
