import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./dm-sans.css";

const cormorant = localFont({
  src: [
    { path: '../public/fonts/CormorantGaramond.ttf', weight: '300 700', style: 'normal' },
    { path: '../public/fonts/CormorantGaramond-Italic.ttf', weight: '300 700', style: 'italic' },
  ],
  variable: "--font-cormorant",
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Leafilms",
  description: "Leafilms — innholdsproduksjon",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Leafilms",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#181920",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="no">
      <body
        className={`leafilms-dm-sans ${cormorant.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
