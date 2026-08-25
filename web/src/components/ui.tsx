"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/* ── الأزرار ─────────────────────────────────────────────────── */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  full?: boolean;
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-[10px] transition-colors " +
  "disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";

const SIZES = {
  sm: "text-[13px] px-3 py-1.5",
  md: "text-[14px] px-4 py-2.5",
  lg: "text-[15px] px-5 py-3",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  full,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "var(--primary)", color: "var(--on-primary)" },
    accent: { background: "var(--accent)", color: "var(--on-accent)" },
    outline: { background: "transparent", color: "var(--ink)", border: "1px solid var(--line-strong)" },
    ghost: { background: "transparent", color: "var(--muted)" },
    danger: { background: "var(--danger-soft)", color: "var(--danger)" },
  };

  return (
    <button
      {...rest}
      disabled={disabled || loading}
      style={styles[variant]}
      className={`${BUTTON_BASE} ${SIZES[size]} ${full ? "w-full" : ""} ${className} hover:brightness-95`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        borderRadius: "50%",
        display: "inline-block",
        animation: "mawid-spin .7s linear infinite",
      }}
    >
      <style>{`@keyframes mawid-spin{to{transform:rotate(360deg)}}`}</style>
    </span>
  );
}

/* ── البطاقات ────────────────────────────────────────────────── */

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-[14px] ${padded ? "p-5" : ""} ${className}`}
      style={{ background: "var(--surface)", border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)" }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-[17px] font-bold" style={{ fontFamily: "var(--font-display)" }}>
        {children}
      </h2>
      {action}
    </div>
  );
}

/* ── الشارات ─────────────────────────────────────────────────── */

const TONES = {
  ok: { bg: "var(--ok-soft)", fg: "var(--ok)" },
  warn: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  danger: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  primary: { bg: "var(--primary-soft)", fg: "var(--primary)" },
  accent: { bg: "var(--accent-soft)", fg: "var(--accent)" },
  muted: { bg: "var(--surface-3)", fg: "var(--muted)" },
};

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: TONES[tone].bg, color: TONES[tone].fg }}
    >
      {children}
    </span>
  );
}

/* ── الحقول ──────────────────────────────────────────────────── */

const FIELD_CLASS =
  "w-full rounded-[10px] px-3 py-2.5 text-[14px] outline-none transition-colors";

const fieldStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
};

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-semibold mb-1.5">{label}</span>
      {children}
      {hint && !error && (
        <span className="block text-[12px] mt-1" style={{ color: "var(--faint)" }}>
          {hint}
        </span>
      )}
      {error && (
        <span className="block text-[12px] mt-1 font-medium" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={fieldStyle} className={`${FIELD_CLASS} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={fieldStyle} className={`${FIELD_CLASS} ${props.className ?? ""}`} />;
}

/* ── الحالات ─────────────────────────────────────────────────── */

export function Alert({ children, tone = "danger" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return (
    <div
      className="rounded-[10px] px-4 py-3 text-[14px] font-medium"
      style={{ background: TONES[tone].bg, color: TONES[tone].fg }}
      role="alert"
    >
      {children}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-12 px-6">
      <p className="text-[15px] font-semibold">{title}</p>
      {hint && (
        <p className="text-[13.5px] mt-1.5 max-w-sm mx-auto" style={{ color: "var(--muted)" }}>
          {hint}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Loading({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-[14px]" style={{ color: "var(--muted)" }}>
      <Spinner />
      {label}
    </div>
  );
}

/* ── لوحة الإحصاءات ──────────────────────────────────────────── */

export function StatTile({
  label,
  value,
  sub,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-[12.5px] font-medium" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <span className="text-[26px] font-bold leading-tight tnum" style={{ color: TONES[tone].fg }}>
        {value}
      </span>
      {sub && (
        <span className="text-[12.5px]" style={{ color: "var(--faint)" }}>
          {sub}
        </span>
      )}
    </Card>
  );
}
