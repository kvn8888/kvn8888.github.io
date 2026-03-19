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
        {/* Prevent flash of wrong theme — sets .dark class before first paint */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var t = localStorage.getItem('theme');
            var dark = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
            if (dark) document.documentElement.classList.add('dark');
          })();
        `}} />
        {/* Critical inline CSS — duplicates the minimum variables from globals.css
            so body gets the correct background BEFORE the external stylesheet loads.
            Uses :root/.dark selectors (not inline style) so ThemeProvider's class
            toggle correctly switches variables without needing a refresh. */}
        <style dangerouslySetInnerHTML={{ __html: `
          :root { --background: #ffffff; --foreground: #0a0a0a; }
          .dark { --background: #0d0a08; --foreground: #f0ece8; }
          body { background: var(--background); color: var(--foreground); }
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
