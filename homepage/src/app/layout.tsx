import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuroraBackground, ThemeProvider, UpdateToast } from "@/app/components";
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
  title: "KevinC.dev — Software Engineer",
  description: "Personal portfolio of Kevin C, a software engineering student at RIT. Projects, demos, and more.",
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme — sets class AND background before external CSS loads */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var t = localStorage.getItem('theme');
            var dark = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
            if (dark) document.documentElement.classList.add('dark');
            document.documentElement.style.setProperty('--background', dark ? '#0d0a08' : '#ffffff');
            document.documentElement.style.setProperty('--foreground', dark ? '#faf9f5' : '#1a1a1a');
          })();
        `}} />
        {/* Critical inline CSS — body gets its background immediately,
            no waiting for external stylesheet to download */}
        <style dangerouslySetInnerHTML={{ __html: `
          body { background: var(--background); }
        `}} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          {/* AuroraBackground lives here in the root layout so it persists
              across ALL page navigations — never unmounts, never flashes */}
          <AuroraBackground />
          {children}
          <UpdateToast />
        </ThemeProvider>
      </body>
    </html>
  );
}
