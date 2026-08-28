import type { ReactNode } from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { SPECIALTY_SHAPES, type Shape as SpecialtyShape } from "@/components/specialty-paths";

/**
 * أيقونات متّجهة مرسومة هنا بدل مكتبة جاهزة: المكتبات العامة تعطي أيقونة
 * «مستشفى» واحدة لكل التخصصات، والمريض يميّز عيادة العيون من الأسنان بالشكل
 * قبل أن يقرأ. كلها على شبكة ٢٤×٢٤ بنفس سماكة الخط كي تبدو عائلة واحدة.
 */

type Props = { size?: number; color?: string; weight?: number };

function Ico({ size = 24, color = "#0C1F19", weight = 1.7, children }: Props & { children: ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      color={color}
      stroke={color}
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

/* ── التخصصات ────────────────────────────────────────────────── */

/** يرسم شكلاً واحداً من بيانات التخصص */
function Shape({ shape, index }: { shape: SpecialtyShape; index: number }) {
  const fill = shape.f ? "currentColor" : undefined;
  const stroke = shape.f ? "none" : undefined;
  if (shape.t === "c")
    return <Circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} strokeWidth={shape.sw} fill={fill} stroke={stroke} />;
  if (shape.t === "r")
    return (
      <Rect key={index} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} strokeWidth={shape.sw} fill={fill} stroke={stroke} />
    );
  return <Path key={index} d={shape.d} strokeWidth={shape.sw} fill={fill} stroke={stroke} />;
}

/** التخصصات التي لا رسم لها بعد تأخذ سمّاعة الطبيب — أوضح من مربّع فارغ. */
export function SpecialtyIcon({ slug, size = 24, color, weight }: Props & { slug: string }) {
  const shapes = SPECIALTY_SHAPES[slug] ?? SPECIALTY_SHAPES["general-practice"];
  return (
    <Ico size={size} color={color} weight={weight}>
      {shapes.map((shape, i) => (
        <Shape key={i} shape={shape} index={i} />
      ))}
    </Ico>
  );
}

export const hasSpecialtyArt = (slug: string) => slug in SPECIALTY_SHAPES;

/* ── أيقونات الواجهة ─────────────────────────────────────────── */

export const Icon = {
  search: (p: Props) => (
    <Ico {...p}>
      <Circle cx="11" cy="11" r="7" />
      <Path d="M20 20l-3.6-3.6" />
    </Ico>
  ),
  calendar: (p: Props) => (
    <Ico {...p}>
      <Rect x="3.4" y="5" width="17.2" height="15.6" rx="3" />
      <Path d="M3.4 10h17.2M8.4 3v4M15.6 3v4" />
    </Ico>
  ),
  clock: (p: Props) => (
    <Ico {...p}>
      <Circle cx="12" cy="12" r="8.6" />
      <Path d="M12 7.2V12l3.2 1.9" />
    </Ico>
  ),
  pin: (p: Props) => (
    <Ico {...p}>
      <Path d="M19 10.4c0 5-7 11-7 11s-7-6-7-11a7 7 0 0 1 14 0Z" />
      <Circle cx="12" cy="10.2" r="2.6" />
    </Ico>
  ),
  user: (p: Props) => (
    <Ico {...p}>
      <Circle cx="12" cy="8" r="4" />
      <Path d="M4.6 20.4a7.4 7.4 0 0 1 14.8 0" />
    </Ico>
  ),
  bell: (p: Props) => (
    <Ico {...p}>
      <Path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.4-2 6.4h16S18 14 18 9Z" />
      <Path d="M13.7 19a2 2 0 0 1-3.4 0" />
    </Ico>
  ),
  star: ({ filled, ...p }: Props & { filled?: boolean }) => (
    <Svg
      width={p.size ?? 24}
      height={p.size ?? 24}
      viewBox="0 0 24 24"
      fill={filled ? (p.color ?? "#E7C069") : "none"}
      stroke={p.color ?? "#E7C069"}
      strokeWidth={p.weight ?? 1.7}
      strokeLinejoin="round"
    >
      <Path d="m12 3.2 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6L3.2 9.6l6.1-.9L12 3.2Z" />
    </Svg>
  ),
  chevronLeft: (p: Props) => (
    <Ico {...p}>
      <Path d="M15 5.4 8.4 12l6.6 6.6" />
    </Ico>
  ),
  chevronRight: (p: Props) => (
    <Ico {...p}>
      <Path d="M9 5.4 15.6 12 9 18.6" />
    </Ico>
  ),
  chevronDown: (p: Props) => (
    <Ico {...p}>
      <Path d="M5.4 9 12 15.6 18.6 9" />
    </Ico>
  ),
  check: (p: Props) => (
    <Ico {...p}>
      <Path d="M4.6 12.6 9.4 17.4 19.4 6.6" />
    </Ico>
  ),
  checkCircle: (p: Props) => (
    <Ico {...p}>
      <Circle cx="12" cy="12" r="8.6" />
      <Path d="M8.2 12.2 11 15l5-5.6" />
    </Ico>
  ),
  close: (p: Props) => (
    <Ico {...p}>
      <Path d="M6 6l12 12M18 6 6 18" />
    </Ico>
  ),
  phone: (p: Props) => (
    <Ico {...p}>
      <Path d="M21 16.5v2.6a1.8 1.8 0 0 1-2 1.8 17.6 17.6 0 0 1-15.9-15.9 1.8 1.8 0 0 1 1.8-2h2.6a1.8 1.8 0 0 1 1.8 1.6c.1 1 .3 1.9.7 2.8a1.8 1.8 0 0 1-.4 1.9l-1.1 1.1a14.4 14.4 0 0 0 5.4 5.4l1.1-1.1a1.8 1.8 0 0 1 1.9-.4c.9.4 1.8.6 2.8.7a1.8 1.8 0 0 1 1.6 1.8Z" />
    </Ico>
  ),
  ticket: (p: Props) => (
    <Ico {...p}>
      <Path d="M3.4 8.4V6.6a2 2 0 0 1 2-2h13.2a2 2 0 0 1 2 2v1.8a2.6 2.6 0 0 0 0 5.2v3.8a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2v-3.8a2.6 2.6 0 0 0 0-5.2Z" />
      <Path d="M13.4 4.6v2.4M13.4 10.8v2.4M13.4 17v2.4" />
    </Ico>
  ),
  sparkle: (p: Props) => (
    <Ico {...p}>
      <Path d="m12 3 2.1 4.9L19 10l-4.9 2.1L12 17l-2.1-4.9L5 10l4.9-2.1L12 3Z" />
      <Path d="M18.6 15.4l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8.8-1.8Z" />
    </Ico>
  ),
  grid: (p: Props) => (
    <Ico {...p}>
      <Rect x="3.4" y="3.4" width="7.2" height="7.2" rx="2.2" />
      <Rect x="13.4" y="3.4" width="7.2" height="7.2" rx="2.2" />
      <Rect x="3.4" y="13.4" width="7.2" height="7.2" rx="2.2" />
      <Rect x="13.4" y="13.4" width="7.2" height="7.2" rx="2.2" />
    </Ico>
  ),
};

export type IconRenderer = (p: Props) => ReactNode;
