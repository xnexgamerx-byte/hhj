/**
 * يقارن الحزم الأصيلة المثبَّتة بما يتوقّعه إصدار Expo الحالي.
 *
 * لماذا: حزم مثل expo-router تطلب react-native-reanimated بالمدى `*`، فيأخذ
 * npm أحدث المنشور — وقد يكون متقدّماً على ما بُني عليه SDK بإصدارٍ رئيسي
 * كامل. لا يظهر ذلك في الويب ولا في الفحص النوعي، ويظهر في بناء أندرويد
 * فيفشل برسالة لا تدلّ على السبب.
 *
 * `npx expo install --check` يفعل شيئاً مشابهاً لكنه يسأل خوادم إكسبو؛ هذا
 * يقرأ الجدول المرافق للحزمة نفسها فيعمل بلا شبكة.
 *
 * التشغيل: npm run check:native
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const expected = require("expo/bundledNativeModules.json");
const semver = require("semver");

const mismatched = [];
for (const [name, want] of Object.entries(expected)) {
  let installed;
  try {
    installed = require(`${name}/package.json`).version;
  } catch {
    continue; // غير مثبَّتة، ولا يعني ذلك خطأً
  }
  if (!semver.satisfies(installed, want)) mismatched.push({ name, installed, want });
}

if (mismatched.length === 0) {
  console.log("✔ كل الحزم الأصيلة توافق إصدار Expo الحالي");
  process.exit(0);
}

console.error("✘ حزم أصيلة لا توافق إصدار Expo الحالي:\n");
for (const { name, installed, want } of mismatched) {
  console.error(`  ${name}`);
  console.error(`    مثبَّت: ${installed}   المتوقَّع: ${want}`);
}
console.error("\nثبّت المتوقَّع منها ثم أعد الفحص. تركُها كما هي يفشل بناء أندرويد.");
process.exit(1);
