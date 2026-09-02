/**
 * يفحص تباين كل زوج (نصّ على خلفية) في اللوحتين مقابل معيار WCAG.
 *
 * لماذا آليّاً: التباين لا يُحكم بالنظر — لونان يبدوان مقروءين على شاشة
 * مكتب يختفي أحدهما في شمس بغداد أو على هاتف رخيص. والمعيار رقمٌ يُحسب:
 * ٤٫٥ للنصّ العادي و٣ للكبير والحدود.
 *
 * التشغيل: npm run check:contrast
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "src", "theme.ts");
const source = readFileSync(SRC, "utf8");

/** يقرأ كائن ألوان من ملف الثيم بلا تنفيذه */
function palette(name) {
  const block = new RegExp(`const ${name}[^=]*= \\{([\\s\\S]*?)\\n\\};`).exec(source)?.[1];
  if (!block) throw new Error(`لم أجد لوحة ${name}`);
  const out = {};
  for (const [, key, value] of block.matchAll(/^\s*(\w+):\s*"(#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\))"/gm)) {
    out[key] = value;
  }
  return out;
}

function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value.slice(0, 6);
  const n = Number.parseInt(full, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** [نصّ, خلفية, الحدّ المطلوب, وصف] */
function pairs(p) {
  return [
    [p.ink, p.bg, 4.5, "النصّ الأساسي على الخلفية"],
    [p.ink, p.surface, 4.5, "النصّ الأساسي على السطح"],
    [p.ink, p.surface2, 4.5, "النصّ الأساسي على السطح الثاني"],
    [p.muted, p.bg, 4.5, "النصّ الثانوي على الخلفية"],
    [p.muted, p.surface, 4.5, "النصّ الثانوي على السطح"],
    [p.faint, p.surface, 3, "النصّ الخافت على السطح"],
    [p.onPrimary, p.primary, 4.5, "نصّ الزر الأساسي"],
    [p.onPrimary, p.primaryLift, 4.5, "نصّ الزر عند الرفع"],
    [p.onHero, p.heroFrom, 4.5, "عنوان اللافتة على أوّل التدرّج"],
    [p.onHero, p.heroTo, 4.5, "عنوان اللافتة على آخره"],
    [p.onHeroMuted, p.heroFrom, 4.5, "شرح اللافتة على أوّل التدرّج"],
    [p.onHeroMuted, p.heroTo, 4.5, "شرح اللافتة على آخره"],
    [p.primary, p.primarySoft, 4.5, "الكحلي على خلفيته الفاتحة"],
    [p.brand, p.brandSoft, 4.5, "العلامة على خلفيتها"],
    [p.gold, p.goldSoft, 4.5, "الذهبي على خلفيته"],
    [p.onGold, p.goldBright, 4.5, "نصّ على الذهبي الفاتح"],
    [p.ok, p.okSoft, 4.5, "النجاح على خلفيته"],
    [p.warn, p.warnSoft, 4.5, "التنبيه على خلفيته"],
    [p.danger, p.dangerSoft, 4.5, "الخطأ على خلفيته"],
    [p.danger, p.surface, 4.5, "الخطأ على السطح"],
    [p.lineStrong, p.surface, 3, "الحدّ القويّ على السطح"],
  ];
}

/** درجات التخصصات: كل درجة نصٌّ على خلفيتها */
function tintPairs(name) {
  const block = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\] as const;`).exec(source)?.[1] ?? "";
  return [...block.matchAll(/bg:\s*"(#[0-9A-Fa-f]{6})",\s*fg:\s*"(#[0-9A-Fa-f]{6})"/g)].map(
    ([, bg, fg], i) => [fg, bg, 4.5, `درجة التخصص ${i + 1}`],
  );
}

let failures = 0;
for (const [label, name, tintName] of [
  ["الفاتح", "light", "tints"],
  ["الداكن", "dark", "tintsDark"],
]) {
  const p = palette(name);
  const all = [...pairs(p), ...tintPairs(tintName)];
  const bad = all.filter(([fg, bg, min]) => fg && bg && ratio(fg, bg) < min);
  failures += bad.length;
  console.log(`\n  \x1b[1m${label}\x1b[0m — ${all.length} زوجاً`);
  if (bad.length === 0) {
    console.log("    \x1b[1;32m✔ كلها تتجاوز الحدّ\x1b[0m");
  } else {
    for (const [fg, bg, min, what] of bad) {
      console.log(`    \x1b[1;31m✘\x1b[0m ${what.padEnd(28)} ${fg} على ${bg} = ${ratio(fg, bg).toFixed(2)} (المطلوب ${min})`);
    }
  }
}

console.log("");
process.exit(failures ? 1 : 0);
