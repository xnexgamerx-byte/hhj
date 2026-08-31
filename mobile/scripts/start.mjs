/**
 * يشغّل خادم Metro، بعد تنبيهٍ إن كان خادم الواجهة البرمجية متوقفاً.
 *
 * لماذا: نسيان نافذة الخادم يظهر في التطبيق كتعذّر اتصال لا كخادمٍ متوقف،
 * فيُبحث عن العطل في الشبكة وجدار الحماية والعنوان — وهي رحلة طويلة ثمنها
 * سطرٌ واحد كان يمكن قوله هنا في لحظته.
 *
 * التشغيل: npm start
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const API_PORT = process.env.EXPO_PUBLIC_API_PORT ?? "3000";

async function apiIsUp() {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 2500);
  try {
    const response = await fetch(`http://127.0.0.1:${API_PORT}/health`, { signal: abort.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

if (!(await apiIsUp())) {
  console.log(
    [
      "",
      "  \x1b[1;33m⚠  خادم الواجهة البرمجية متوقف\x1b[0m",
      `     لا شيء يستمع على المنفذ ${API_PORT}، فسيفتح التطبيق بلا بيانات.`,
      "",
      "     شغّله في نافذة أخرى واتركها مفتوحة:",
      "       cd api && npm run dev",
      "",
      "     Metro يكمل الآن — أعد تحميل التطبيق بعد إقلاع الخادم.",
      "",
    ].join("\n"),
  );
}

// المسار الصريح لا الاسم المجرّد: الاسم يعتمد على أن npm حقن node_modules/.bin
// في المسار، فيسقط السكربت بـENOENT إن شُغّل بنود مباشرةً
const local = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "expo.cmd" : "expo");
const bin = existsSync(local) ? local : "expo";

// stdio موروث كي تبقى مفاتيح Metro التفاعلية تعمل (r للتحميل، m للقائمة)
const child = spawn(bin, ["start", "--dev-client", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
child.on("error", (error) => {
  console.error(`تعذّر تشغيل Metro: ${error.message}`);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
