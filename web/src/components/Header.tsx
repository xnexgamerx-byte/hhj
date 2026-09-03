"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clearSession, getSession, type SessionUser } from "@/lib/api";

const HOME_BY_ROLE: Record<SessionUser["role"], string> = {
  PATIENT: "/my",
  DOCTOR: "/doctor",
  STAFF: "/doctor",
  OWNER: "/owner",
};

export function Header({ subtitle }: { subtitle?: string }) {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => setUser(getSession()), []);

  return (
    <header
      className="sticky top-0 z-30 backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--surface) 88%, transparent)", borderBottom: "1px solid var(--line)" }}
    >
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          {/* الشعار نفسه فوق الزمرّدي نفسه، كما في أيقونة التطبيق */}
          <span
            className="grid place-items-center w-8 h-8 rounded-[9px]"
            style={{ background: "var(--primary)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- صورةٌ ثابتة بحجمٍ ثابت، لا حاجة لتحسين next/image */}
            <img src="/brand-mark.png" alt="" width={20} height={20} />
          </span>
          <span className="text-[17px] font-bold" style={{ fontFamily: "var(--font-display)" }}>
            دكتورلي
          </span>
        </Link>

        {subtitle && (
          <span className="text-[13px] hidden sm:inline" style={{ color: "var(--faint)" }}>
            · {subtitle}
          </span>
        )}

        <div className="flex-1" />

        {user ? (
          <div className="flex items-center gap-2">
            <Link
              href={HOME_BY_ROLE[user.role]}
              className="text-[13.5px] font-semibold px-3 py-1.5 rounded-[9px]"
              style={{ background: "var(--surface-2)" }}
            >
              {user.fullName}
            </Link>
            <button
              onClick={() => {
                clearSession();
                window.location.href = "/";
              }}
              className="text-[13px] px-2.5 py-1.5 rounded-[9px]"
              style={{ color: "var(--muted)" }}
            >
              خروج
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="text-[13.5px] font-semibold px-3.5 py-1.5 rounded-[9px]"
            style={{ background: "var(--surface-2)", color: "var(--ink)" }}
          >
            دخول الأطباء
          </Link>
        )}
      </div>
    </header>
  );
}
