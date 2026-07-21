import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavLinks } from "@/components/NavLinks";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Show Prep",
  description: "NPC bodybuilding contest-prep management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-10 border-b border-borderc bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tracking-tight">
                Show Prep
              </span>
              <span className="text-xs text-muted">contest-prep HQ</span>
            </div>
            <NavLinks />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
