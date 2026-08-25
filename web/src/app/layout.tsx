import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "موعد · حجز مواعيد الأطباء",
  description: "احجز موعدك عند طبيبك في محافظتك — أوقات محدّثة وحجز مثبّت",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1413" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        {/* الخطوط مستضافة محلياً: لا تأخير ولا انكشاف لبطء أو حجب خادم خارجي */}
        <link
          rel="preload"
          href="/fonts/ibm-plex-sans-arabic-400-arabic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/ibm-plex-sans-arabic-600-arabic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
