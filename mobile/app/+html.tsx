import type { PropsWithChildren } from "react";
import { ScrollViewStyleReset } from "expo-router/html";

/**
 * غلاف HTML لنسخة الويب.
 *
 * ‏`dir="rtl"` هنا ضروري: على أندرويد وآيفون يتكفّل I18nManager بالاتجاه، أما على
 * الويب فالتخطيط يتبع اتجاه المستند. بدونه يظهر سهم الرجوع يساراً، ويبدأ شريط
 * الأيام من اليسار، وتنقلب ترتيب الصفوف كلها.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: baseStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

/** خلفية الصفحة تتبع وضع الجهاز حتى لا يومض الأبيض قبل تحميل التطبيق */
const baseStyle = `
body { background-color: #F4F7F7; }
@media (prefers-color-scheme: dark) {
  body { background-color: #0C1413; }
}
`;
