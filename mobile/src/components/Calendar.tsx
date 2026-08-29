import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/icons";
import { T } from "@/components/ui";
import { toArabic } from "@/lib/format";
import { radius, space, usePalette } from "@/theme";

/** حالة اليوم في الشبكة — تحدّد لونه وقابليته للضغط */
export type DayState = { date: string; free: number; hasSchedule: boolean; isClosed: boolean };

const WEEK_SHORT = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];
const MONTHS_AR = [
  "كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران",
  "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول",
];

/** YYYY-MM-DD → أجزاء بلا مناطق زمنية: النصّ نفسه هو المصدر */
const parts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
};
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** رقم يوم الأسبوع لأول الشهر: ٠ = الأحد. حساب محلّي بلا Date كي لا تتدخّل المنطقة الزمنية */
function firstWeekday(y: number, m: number): number {
  return new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
}
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * تقويم شهري لاختيار يوم الحجز.
 *
 * الشريط الأفقي كان يُظهر أسبوعاً فيضطر المريض إلى السحب أعمى بحثاً عن يوم فيه
 * أماكن. الشبكة الشهرية تُظهر الشهر كلّه دفعة واحدة، والأيام التي فيها دوام
 * مؤشَّرة بنقطة تحت الرقم.
 */
export function Calendar({
  days,
  selected,
  onSelect,
}: {
  days: DayState[];
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const palette = usePalette();
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  // نبدأ من شهر أول يوم متاح لا من شهر اليوم — قد يكون الطبيب مشغولاً حتى الشهر القادم
  const anchor = selected ?? days.find((d) => d.free > 0)?.date ?? days[0]?.date;
  const [cursor, setCursor] = useState(() => {
    const p = anchor ? parts(anchor) : { y: new Date().getFullYear(), m: new Date().getMonth() + 1 };
    return { y: p.y, m: p.m };
  });

  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;
  const canPrev = !!first && iso(cursor.y, cursor.m, 1) > first;
  const canNext = !!last && iso(cursor.y, cursor.m, daysInMonth(cursor.y, cursor.m)) < last;

  const step = (delta: number) => {
    setCursor((c) => {
      const m = c.m + delta;
      if (m < 1) return { y: c.y - 1, m: 12 };
      if (m > 12) return { y: c.y + 1, m: 1 };
      return { y: c.y, m };
    });
  };

  const lead = firstWeekday(cursor.y, cursor.m);
  const count = daysInMonth(cursor.y, cursor.m);
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={{ backgroundColor: palette.surface2, borderRadius: radius.lg, padding: space(4), gap: space(3) }}>
      {/* الشهر والتنقّل */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <T size={15.5} weight="bold" style={{ flex: 1 }}>
          {MONTHS_AR[cursor.m - 1]} {toArabic(cursor.y)}
        </T>
        <View style={{ flexDirection: "row", gap: space(1) }}>
          <Arrow label="الشهر السابق" enabled={canPrev} onPress={() => step(-1)}>
            <Icon.chevronRight size={18} color={canPrev ? palette.ink : palette.lineStrong} />
          </Arrow>
          <Arrow label="الشهر التالي" enabled={canNext} onPress={() => step(1)}>
            <Icon.chevronLeft size={18} color={canNext ? palette.ink : palette.lineStrong} />
          </Arrow>
        </View>
      </View>

      {/* أسماء الأيام */}
      <View style={{ flexDirection: "row" }}>
        {WEEK_SHORT.map((w) => (
          <T key={w} size={11.5} tone="faint" align="center" weight="medium" style={{ flex: 1 }}>
            {w}
          </T>
        ))}
      </View>

      {/* الشبكة */}
      <View style={{ gap: space(1) }}>
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <View key={row} style={{ flexDirection: "row" }}>
            {cells.slice(row * 7, row * 7 + 7).map((day, i) => {
              if (day === null) return <View key={i} style={{ flex: 1, height: 42 }} />;
              const date = iso(cursor.y, cursor.m, day);
              const info = byDate.get(date);
              const open = !!info && info.free > 0;
              const active = date === selected;

              return (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: !open }}
                  accessibilityLabel={`${toArabic(day)} ${MONTHS_AR[cursor.m - 1]}${
                    open ? ` — ${toArabic(info!.free)} مكان` : " — لا مواعيد"
                  }`}
                  disabled={!open}
                  onPress={() => onSelect(date)}
                  style={{ flex: 1, height: 42, alignItems: "center", justifyContent: "center" }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: radius.sm,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: active ? palette.primary : "transparent",
                    }}
                  >
                    <T
                      size={14}
                      weight={active || open ? "semibold" : "regular"}
                      align="center"
                      tone={active ? "onPrimary" : open ? "ink" : "lineStrong"}
                    >
                      {toArabic(day)}
                    </T>
                  </View>
                  {/* النقطة تقول «هنا أماكن» بلا أن تزاحم الرقم */}
                  <View
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      marginTop: -4,
                      backgroundColor: open && !active ? palette.primary : "transparent",
                    }}
                  />
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function Arrow({
  label,
  enabled,
  onPress,
  children,
}: {
  label: string;
  enabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      hitSlop={6}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: palette.surface,
        opacity: enabled ? 1 : 0.5,
      }}
    >
      {children}
    </Pressable>
  );
}
