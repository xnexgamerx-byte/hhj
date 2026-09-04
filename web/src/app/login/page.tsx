"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Header } from "@/components/Header";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { api, saveSession, type SessionUser } from "@/lib/api";

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
  user: SessionUser;
};

export default function LoginPage() {
  const router = useRouter();
  /** رقم الطبيب والسكرتير، أو إيميل المالك — الخادم يميّزهما بصيغتهما */
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mustChange, setMustChange] = useState(false);
  const [role, setRole] = useState<SessionUser["role"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goHome(userRole: SessionUser["role"]) {
    router.push(userRole === "OWNER" ? "/owner" : "/doctor");
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const session = await api.post<LoginResponse>("/auth/login", { identifier, password });
      saveSession(session);
      setRole(session.user.role);
      // الباسوورد الأولي يعرفه المالك أيضاً، فلا يُسمح بالمتابعة قبل تغييره
      if (session.mustChangePassword) setMustChange(true);
      else goHome(session.user.role);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      setError("الباسوورد الجديد وتأكيده غير متطابقين");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/password/change", { currentPassword: password, newPassword });
      // الجلسة القديمة تُبطل مع تغيير الباسوورد، فندخل من جديد بالباسوورد الجديد
      const session = await api.post<LoginResponse>("/auth/login", { identifier, password: newPassword });
      saveSession(session);
      goHome(session.user.role);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header subtitle="دخول الأطباء والإدارة" />
      <main className="max-w-sm mx-auto px-4 pt-12 pb-20">
        <Card>
          <h1 className="text-[20px] font-bold mb-1" style={{ fontFamily: "var(--font-display)" }}>
            {mustChange ? "غيّر باسووردك" : "تسجيل الدخول"}
          </h1>
          <p className="text-[13.5px] mb-5" style={{ color: "var(--muted)" }}>
            {mustChange
              ? "هذا أول دخول لك. اختر باسووردًا جديداً يعرفه أنت وحدك."
              : "للأطباء والسكرتيرين والإدارة. المرضى يدخلون برقم الهاتف عند الحجز."}
          </p>

          {error && (
            <div className="mb-4">
              <Alert>{error}</Alert>
            </div>
          )}

          {!mustChange ? (
            <form
              className="grid gap-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <Field label="رقم الهاتف" hint="الطبيب والسكرتير يدخلان برقمهما — والمالك بإيميله">
                <Input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  dir="ltr"
                  placeholder="07701234567"
                />
              </Field>
              <Field label="الباسوورد">
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  dir="ltr"
                />
              </Field>
              <Button type="submit" size="lg" full loading={busy} disabled={!identifier || !password}>
                دخول
              </Button>
            </form>
          ) : (
            <form
              className="grid gap-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                changePassword();
              }}
            >
              <Field label="الباسوورد الجديد" hint="٨ خانات على الأقل، وفيه حرف ورقم">
                <Input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  dir="ltr"
                />
              </Field>
              <Field label="تأكيد الباسوورد">
                <Input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  dir="ltr"
                />
              </Field>
              <Button type="submit" size="lg" full loading={busy} disabled={newPassword.length < 8}>
                حفظ ومتابعة
              </Button>
            </form>
          )}
        </Card>

        {role && !mustChange && (
          <p className="text-center text-[13px] mt-4" style={{ color: "var(--muted)" }}>
            جارٍ التحويل…
          </p>
        )}
      </main>
    </>
  );
}
