import type { NextConfig } from "next";

/**
 * ‎STATIC_EXPORT=1‎ يبني اللوحات ملفّاتٍ ثابتة في ‎out/‎ تُرفع على Cloudflare
 * Pages (‎npm run build:static‎). وبدونه يبقى البناء خادمَ Next الذي تشغّله
 * Render بـ‎next start‎ — فالوضعان قائمان معاً حتى يتمّ الانتقال، ولا ينكسر
 * النشر الحالي بدمج هذا التغيير.
 *
 * والتصدير الثابت ممكنٌ لأن الصفحات كلها تجلب بياناتها في المتصفّح: لا شيء
 * فيها يحتاج خادماً وقت الطلب.
 */
const staticExport = process.env.STATIC_EXPORT === "1";

const config: NextConfig = {
  reactStrictMode: true,
  ...(staticExport
    ? { output: "export" as const }
    : {
        // صفحة الطبيب كانت ‎/doctors/<id>‎ وصارت ‎/doctors/profile?id=…‎ (انظر
        // صفحتها). روابطُ قديمة شاركها مرضى على واتساب تبقى تفتح على Render حتى
        // الانتقال، والنطاق الجديد بلا روابط قديمة فلا يحتاجها — والتصدير
        // الثابت لا يدعم التحويلات أصلاً. والمعرّف UUID، فلا يطابق «profile»
        async redirects() {
          return [
            {
              source: "/doctors/:id([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
              destination: "/doctors/profile?id=:id",
              permanent: true,
            },
          ];
        },
      }),
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
  },
};

export default config;
