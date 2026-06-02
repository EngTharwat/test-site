import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { PwaSetup } from "@/lib/pwa";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const viewport: Viewport = {
  themeColor: '#0F1115',
}

export const metadata: Metadata = {
  title: "PMBoards — Plan. Track. Progress.",
  description: "PMO platform for sewer network projects. Plan, track and control your infrastructure projects.",
  manifest: '/site.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'PMBoards',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    title:       'PMBoards — Plan. Track. Progress.',
    description: 'PMO platform for sewer network projects.',
    url:         'https://pmboards.com',
    siteName:    'PMBoards',
    locale:      'en_US',
    type:        'website',
  },
  twitter: {
    card:        'summary',
    title:       'PMBoards',
    description: 'PMO platform for sewer network projects.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} h-full antialiased`} suppressHydrationWarning>
      {/* Runs before hydration — applies dark class instantly so there is no flash */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('pmboards-theme');if(t!=='light')document.documentElement.classList.add('dark');}())` }} />
      </head>
      <body className="min-h-full flex flex-col bg-white text-black">
        <AuthProvider>{children}</AuthProvider>
        <PwaSetup />
      </body>
    </html>
  );
}
