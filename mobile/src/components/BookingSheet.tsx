import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Icon } from "@/components/icons";
import { Alert, Button, Field, IconTile, Input, T } from "@/components/ui";
import { api, getSession, saveSession, type Patient, type SessionUser } from "@/lib/api";
import { formatDay, toArabic } from "@/lib/format";
import { radius, space, usePalette } from "@/theme";

/** ما اختاره المريض: وقت محدّد أو دور ضمن فترة */
export type Chosen = { startAt: string; label: string; queue: number | null };

/** لوحة الحجز: دخول برقم الهاتف إن لزم، ثم اختيار المريض والتأكيد. */
export function BookingSheet({
  practiceId,
  doctorName,
  clinicName,
  date,
  chosen,
  cancelCutoffMinutes,
  onClose,
  onBooked,
}: {
  practiceId: string;
  doctorName: string;
  clinicName: string;
  date: string;
  chosen: Chosen;
  cancelCutoffMinutes: number;
  onClose: () => void;
  onBooked: () => void;
}) {
  const palette = usePalette();
  const router = useRouter();

  const [user, setUser] = useState<SessionUser | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string; queueNumber: number } | null>(null);

  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const loadPatients = useCallback(() => {
    api
      .get<Patient[]>("/me/patients")
      .then((list) => {
        setPatients(list);
        setPatientId(list.find((p) => p.isSelf)?.id ?? list[0]?.id ?? "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getSession().then((session) => {
      setUser(session);
      if (session?.role === "PATIENT") loadPatients();
    });
  }, [loadPatients]);

  async function requestCode() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ devCode?: string }>("/auth/otp/request", { phone });
      setOtpSent(true);
      setDevCode(result.devCode ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setBusy(true);
    setError(null);
    try {
      const session = await api.post<{ accessToken: string; refreshToken: string; user: SessionUser }>(
        "/auth/otp/verify",
        { phone, code, fullName },
      );
      await saveSession(session);
      setUser(session.user);
      loadPatients();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ reference: string; queueNumber: number }>("/bookings", {
        doctorClinicId: practiceId,
        patientId,
        startAt: chosen.startAt,
        patientNote: note.trim() || undefined,
      });
      setDone(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="إغلاق بالنقر خارج النافذة"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: palette.overlay }}
      />
      <View
        style={{
          backgroundColor: palette.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          maxHeight: "88%",
        }}
      >
        <ScrollView
          contentContainerStyle={{ padding: space(5), paddingBottom: space(10), gap: space(4) }}
          keyboardShouldPersistTaps="handled"
        >
          {done ? (
            <View style={{ alignItems: "center", gap: space(2), paddingVertical: space(3) }}>
              <IconTile size={68} round bg={palette.okSoft}>
                <Icon.checkCircle size={34} color={palette.ok} />
              </IconTile>
              <T size={19} weight="bold" align="center">
                تم تثبيت حجزك
              </T>
              <T size={14} tone="muted" align="center">
                أرسلنا التفاصيل إلى الطبيب.
              </T>
              <T size={26} weight="bold" tone="primary" align="center">
                {done.reference}
              </T>
              <T size={12.5} tone="faint" align="center">
                الرقم المرجعي — اذكره للعيادة
              </T>
              {done.queueNumber > 0 ? (
                <T size={15} weight="semibold" align="center">
                  دورك رقم {toArabic(done.queueNumber)}
                </T>
              ) : null}
              <View style={{ gap: space(2), alignSelf: "stretch", marginTop: space(3) }}>
                <Button
                  label="مواعيدي"
                  full
                  onPress={() => {
                    onBooked();
                    router.push("/bookings");
                  }}
                />
                <Button label="إغلاق" variant="outline" full onPress={onBooked} />
              </View>
            </View>
          ) : (
            <>
              <T size={18} weight="bold">
                تأكيد الحجز
              </T>

              <View style={{ backgroundColor: palette.primarySoft, borderRadius: radius.lg, padding: space(4), gap: 2 }}>
                <T size={15} weight="bold">
                  {doctorName}
                </T>
                <T size={13} tone="muted">
                  {clinicName}
                </T>
                <T size={14} weight="semibold" tone="primary">
                  {formatDay(date)} — {chosen.label}
                  {chosen.queue !== null ? ` · الدور ${toArabic(chosen.queue)}` : ""}
                </T>
              </View>

              {error ? <Alert message={error} /> : null}

              {!user || user.role !== "PATIENT" ? (
                <View style={{ gap: space(3) }}>
                  <T size={13.5} tone="muted">
                    أدخل رقم هاتفك ليصلك رمز تحقق — بلا كلمة مرور.
                  </T>
                  <Field label="رقم الهاتف">
                    <Input
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="07701234567"
                      keyboardType="phone-pad"
                      editable={!otpSent}
                    />
                  </Field>

                  {!otpSent ? (
                    <Button label="إرسال الرمز" full loading={busy} disabled={phone.length < 10} onPress={requestCode} />
                  ) : (
                    <>
                      <Field label="الاسم الكامل" hint="يظهر للطبيب في قائمة مرضاه">
                        <Input value={fullName} onChangeText={setFullName} placeholder="الاسم الثلاثي" />
                      </Field>
                      <Field label="رمز التحقق" hint={devCode ? `رمز التطوير: ${devCode}` : "وصلك برسالة نصية"}>
                        <Input
                          value={code}
                          onChangeText={setCode}
                          placeholder="******"
                          keyboardType="number-pad"
                          maxLength={6}
                          style={{ textAlign: "center", letterSpacing: 8 }}
                        />
                      </Field>
                      <Button label="تأكيد الرمز" full loading={busy} disabled={code.length < 6} onPress={verifyCode} />
                    </>
                  )}
                </View>
              ) : (
                <View style={{ gap: space(3) }}>
                  <Field label="الموعد لمن؟" hint="تستطيع الحجز لأفراد عائلتك من حسابك">
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
                      {patients.map((patient) => {
                        const active = patient.id === patientId;
                        return (
                          <Pressable
                            key={patient.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            onPress={() => setPatientId(patient.id)}
                            style={{
                              paddingHorizontal: space(3),
                              paddingVertical: space(2),
                              borderRadius: radius.md,
                              backgroundColor: active ? palette.primary : palette.surface2,
                              borderWidth: 1,
                              borderColor: active ? palette.primary : palette.line,
                            }}
                          >
                            <T size={13.5} weight="semibold" tone={active ? "onPrimary" : "ink"}>
                              {patient.fullName}
                              {patient.isSelf ? " (أنا)" : ""}
                            </T>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Field>

                  <Field label="ملاحظة للطبيب" hint="اختياري — تصل مع تفاصيل الحجز">
                    <Input
                      value={note}
                      onChangeText={setNote}
                      placeholder="مثلاً: ألم في الصدر منذ يومين"
                      multiline
                      numberOfLines={2}
                    />
                  </Field>

                  <T size={12.5} tone="faint">
                    يمكنك الإلغاء حتى {toArabic(Math.round(cancelCutoffMinutes / 60))} ساعة قبل الموعد.
                  </T>

                  <Button
                    label="تثبيت الحجز"
                    variant="primary"
                    size="lg"
                    full
                    loading={busy}
                    disabled={!patientId}
                    onPress={confirm}
                  />
                  <Button label="رجوع" variant="ghost" full onPress={onClose} />
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
