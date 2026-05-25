import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "PMBoards — Plan. Track. Progress.",
  description: "PMO platform for sewer network projects. Plan, track and control your infrastructure projects.",
  icons: {
    icon:      [{ url: '/favicon.svg',           type: 'image/svg+xml' }],
    apple:     [{ url: '/apple-touch-icon.svg',  type: 'image/svg+xml', sizes: '180x180' }],
    shortcut:  [{ url: '/favicon.svg',           type: 'image/svg+xml' }],
  },
  manifest: '/site.webmanifest',
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
    <html lang="en" className={`${spaceGrotesk.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-black">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
