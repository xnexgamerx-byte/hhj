import { networkInterfaces } from "node:os";
import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { registerRoutes } from "./http/routes.js";
import { errorHandler } from "./http/guard.js";
import { prisma } from "./lib/prisma.js";
import { getWhatsAppProvider } from "./notifications/dispatch.js";
import { startScheduler, stopScheduler } from "./scheduler.js";

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      // عبر process.stdout لا عبر الواصف الخام: pino يكتب البايتات مباشرة
      // إلى fd 1، وطرفية ويندوز تفسّرها بترميز صفحتها فينهار كل نصّ عربي في
      // السجل إلى رموز. أما stdout فيمرّ بتحويل نود إلى WriteConsoleW فيسلم.
      stream: process.stdout,
    },
    // الأسماء والعناوين العربية تجعل الأجسام أطول من المعتاد
    bodyLimit: 1_048_576,
    // خلف وسيط (نفق أو استضافة) يصل كل طلب من عنوان الوسيط نفسه، فيقتسم
    // المستخدمون حصّة واحدة ويحجب أوّلُهم البقية. ومع ذلك لا يُفعَّل إلا
    // بإعلان صريح: تصديق X-Forwarded-For بلا وسيطٍ فعليّ يجعل تزويره ممكناً.
    trustProxy: process.env.TRUST_PROXY === "true",
  });

  // ترويسات أمان قياسية. سياسة المحتوى مطفأة: الخادم لا يقدّم صفحات بل JSON
  await app.register(helmet, { contentSecurityPolicy: false });

  // حدٌّ عامّ يوقف الطوفان الظاهر لا أكثر، وهو مقصود على سعته: شبكات الهاتف
  // في العراق تُخرج آلاف المشتركين من عناوين عامة قليلة، فالحدّ الضيّق على
  // العنوان يحجب شبكةً بأكملها ويصيب من لا ذنب له. الحدود الدقيقة تُوضع حيث
  // يمكن تمييز الفاعل: على الحساب عند الدخول، وعلى الرقم عند طلب الرمز.
  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 1000),
    timeWindow: "1 minute",
    // فحص الصحة يُستدعى كل دقيقة من المراقبة، ولا معنى لعدّه
    allowList: (request) => request.url === "/health",
    // بلا errorResponseBuilder: الإضافة ترمي ما يعيده حرفياً، فكائنٌ عاديّ
    // يصل بلا statusCode فيُبلَّغ عنه بـ٥٠٠. والافتراضيّ يضبط ٤٢٩، ومعالج
    // الأخطاء عندنا يترجمه إلى رسالة عربية واحدة لكل المسارات.
  });

  // الواجهة تعمل على أصل مختلف عن الخادم، فبدون CORS لا يصلها شيء.
  // في الإنتاج تُحصر القائمة بنطاق الموقع الحقيقي عبر WEB_ORIGIN.
  const allowed = (process.env.WEB_ORIGIN ?? "http://localhost:3001").split(",").map((o) => o.trim());
  const isProduction = process.env.NODE_ENV === "production";

  // في التطوير وحده: أصلٌ على شبكة محلية خاصة مسموح مهما كان منفذه. بدونه
  // لا تُجرَّب النسخة المصدَّرة من متصفّح الهاتف — أصلها عنوان الحاسوب على
  // الشبكة، ولا يعرفه أحد سلفاً ليكتبه في WEB_ORIGIN. ولا يتّسع هذا للإنتاج:
  // هناك تبقى القائمة وحدها هي الحَكَم.
  const PRIVATE_LAN = /^https?:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)[\d.]+(:\d+)?$/;

  await app.register(cors, {
    origin(origin, callback) {
      // الطلبات بلا أصل (تطبيق أصيل، curl، فحص صحة) لا يحكمها CORS
      if (!origin || allowed.includes("*") || allowed.includes(origin)) return callback(null, true);
      if (!isProduction && PRIVATE_LAN.test(origin)) return callback(null, true);
      callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: false,
  });

  app.setErrorHandler(errorHandler);
  await registerRoutes(app);
  return app;
}

/**
 * عناوين الحاسوب على الشبكة المحلية — ما يستعمله الهاتف عبر Expo Go.
 *
 * localhost داخل الهاتف يشير إلى الهاتف نفسه، وهو أكثر ما يُربك في أول
 * تجربة. وطباعتها هنا تتيح فتحها من متصفّح الهاتف للتأكد قبل اتهام التطبيق:
 * جدار حماية ويندوز يحجب المنفذ افتراضياً عند أول تشغيل.
 */
function lanAddresses(): string[] {
  const out: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      // الشبكات الخاصة وحدها: البقية عناوين محوّلات وهمية أو شبكات خاصة افتراضية
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address)) out.push(entry.address);
    }
  }
  return out;
}

async function start() {
  // فشل مبكر وواضح خير من خادم يعمل بلا سر توقيع
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    // الرسالة تقول ما يُفعل لا ما حدث فقط: من يراها أول مرة لا يعرف
    // أنّ السرّ يُولَّد بأمر واحد، فيظنّ العطل في المشروع
    console.error(
      [
        "JWT_SECRET مفقود أو أقصر من ٣٢ خانة في api/.env",
        "  ولّده بأمر واحد:  npm run env:fix",
      ].join("\n"),
    );
    process.exit(1);
  }

  // فحص القاعدة قبل الاستماع: بدونه يقلع الخادم سليماً وكل طلب يعود بـ٥٠٠،
  // فيبدو العطل في الواجهة وهو في الاتصال
  try {
    await prisma.$queryRaw`select 1`;
  } catch {
    const url = process.env.DATABASE_URL ?? "(غير معيّن)";
    // نخفي كلمة المرور: السجلات تُنسخ وتُلصق في الرسائل
    console.error(
      [
        "تعذّر الاتصال بقاعدة البيانات.",
        `  DATABASE_URL: ${url.replace(/:\/\/([^:]+):[^@]*@/, "://$1:***@")}`,
        "  شغّلها أولاً:  docker compose up -d",
        "  وتأكّد أن المنفذ في DATABASE_URL هو نفسه منفذ الحاوية.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const app = await buildServer();
  const port = Number(process.env.PORT ?? 3000);
  const lan = lanAddresses();

  try {
    await app.listen({ port, host: "0.0.0.0" });
    // سطر واضح بلا JSON: السجل المهيكل لا يقول للمشغّل «جاهز» بلمحة
    console.log(
      [
        "",
        "  موعد · الخادم جاهز",
        `  http://localhost:${port}`,
        // أكثر من عنوان يعني محوّلات وهمية إلى جانب الشبكة الحقيقية، ولا سبيل
        // للجزم أيّها شبكة الواي-فاي — فنعرضها ونترك الاختيار لمن يرى هاتفه
        ...(lan.length === 1
          ? [`  من الهاتف:   http://${lan[0]}:${port}`]
          : lan.length > 1
            ? ["  من الهاتف — جرّب ما يوافق شبكة الواي-فاي:", ...lan.map((ip) => `      http://${ip}:${port}`)]
            : []),
        `  واتساب: ${getWhatsAppProvider().name}`,
        "",
      ].join("\n"),
    );

    // المهام الدورية داخل الخادم. تُعطَّل عند التشغيل خلف عدة نسخ إن أُريد
    // فصلها في عامل مستقل — القيود في قاعدة البيانات تمنع الازدواج أصلاً.
    if (process.env.SCHEDULER !== "off") startScheduler((line) => app.log.info(line));
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      stopScheduler();
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    });
  }
}

// يُشغَّل الخادم فقط عند التنفيذ المباشر، لا عند الاستيراد في الاختبارات.
// pathToFileURL لا التركيب اليدوي: على ويندوز يكون argv[1] بالشكل
// C:\Users\... فينتج "file://C:\..." ولا يطابق "file:///C:/..." الذي في
// import.meta.url، فلا تُستدعى start() ويقف الخادم صامتاً بلا رسالة.
const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entry && import.meta.url === entry) {
  void start();
}
