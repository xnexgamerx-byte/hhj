import Fastify from "fastify";
import { registerRoutes } from "./http/routes.js";
import { errorHandler } from "./http/guard.js";
import { prisma } from "./lib/prisma.js";
import { getWhatsAppProvider } from "./notifications/dispatch.js";

export async function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    // الأسماء والعناوين العربية تجعل الأجسام أطول من المعتاد
    bodyLimit: 1_048_576,
  });

  app.setErrorHandler(errorHandler);
  await registerRoutes(app);
  return app;
}

async function start() {
  // فشل مبكر وواضح خير من خادم يعمل بلا سر توقيع
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error("JWT_SECRET مفقود أو أقصر من ٣٢ خانة. راجع ملف ‎.env");
    process.exit(1);
  }

  const app = await buildServer();
  const port = Number(process.env.PORT ?? 3000);

  try {
    await app.listen({ port, host: "0.0.0.0" });
    app.log.info(`مزوّد الواتساب: ${getWhatsAppProvider().name}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    });
  }
}

// يُشغَّل الخادم فقط عند التنفيذ المباشر، لا عند الاستيراد في الاختبارات
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  void start();
}
