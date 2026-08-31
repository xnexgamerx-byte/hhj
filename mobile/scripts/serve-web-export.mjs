/**
 * خادم ثابت لتجربة نسخة الويب المصدَّرة (npm run export:web).
 * كل مسار غير موجود يعود لـ index.html لأن المخرَج أحادي الصفحة.
 */
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

// منفذ قابل للتغيير: DIST_PORT=3012 npm run serve:web
const PORT = Number(process.env.DIST_PORT ?? 3002);

// fileURLToPath لا pathname: الأخير يعطي "/C:/Users/..." على ويندوز
// فيفسد join ويصير كل مسار غير موجود
const ROOT = fileURLToPath(new URL("../dist/", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".ttf": "font/ttf", ".css": "text/css", ".svg": "image/svg+xml" };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  for (const candidate of [join(ROOT, path), join(ROOT, "index.html")]) {
    try {
      const body = await readFile(candidate);
      res.writeHead(200, { "Content-Type": TYPES[extname(candidate)] ?? "application/octet-stream" });
      return res.end(body);
    } catch { /* نجرّب التالي */ }
  }
  res.writeHead(404).end("not found");
}).listen(PORT, () => console.log(`dist على ${PORT}`));
