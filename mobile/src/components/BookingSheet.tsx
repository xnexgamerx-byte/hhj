import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Icon } from "@/components/icons";
import { Alert, Button, Chips, Divider, Field, IconTile, Input, T } from "@/components/ui";
import { api, getSession, saveSession, type Patient, type SessionUser } from "@/lib/api";
import { formatDay, toArabic } from "@/lib/format";
import { radius, space, usePalette } from "@/theme";

/** ما اختاره المريض: وقت محدّد أو دور ضمن فترة */
export type Chosen = { startAt: string; label: string; queue: number | null };

/**
 * الحالات المزمنة الشائعة في العراق.
 *
 * السكري وضغط الدم أوّلاً لأنهما الأكثر انتشاراً، وهما ما يسأل عنه الطبيب
 * قبل أي وصفة. المريض يلمس لا يكتب — والحقل الحرّ يبقى لما لا تغطّيه القائمة.
 */
const CONDITIONS = ["سكري", "ضغط", "قلب", "ربو", "حساسية دواء", "حامل"] as const;

/** ما يعتبره المريض «معلوماتي كاملة» — دون هذا نسأله */
function isComplete(patient: Patient | undefined): boolean {
  return Boolean(patient && patient.fullName.trim().length >= 3 && patient.phone && patient.address && patient.birthYear);
}

const thisYear = new Date().getFullYear();
const ageOf = (birthYear: number | null) => (birthYear ? String(thisYear - birthYear) : "");

/**
 * ‎+9647XXXXXXXXX ⇐ ‎07XXXXXXXXX.
 *
 * الحساب يُخزَّن بصيغة E.164 لأنها ما يقبله مزوّد الرسائل، لكن العراقي يكتب
 * رقمه ‎07 لا ‎+964. عرضُه بالصيغة الدولية في حقلٍ قابلٍ للتحرير يدفعه إلى
 * «تصحيحه» — فنعرضه كما يعرفه.
 */
function localPhone(value: string | null | undefined): string {
  if (!value) return "";
  return value.startsWith("+964") ? `0${value.slice(4)}` : value;
}

/**
 * لوحة الحجز: دخول برقم الهاتف إن لزم، ثم بيانات المريض والتأكيد.
 *
 * المبدأ الذي يجعلها سهلة: نسأل مرّةً واحدة.
 * العيادة تسأل الاسم والهاتف والعنوان والعمر في كل زيارة أولى، فنسألها في
 * أول حجز ونحفظها في المريض. الحجز الثاني يعرضها في سطرٍ مع «تعديل» — لمسةٌ
 * واحدة تثبّت الموعد. أربعة حقول في كل مرّة ليست شاشةً بسيطة مهما رُتّبت.
 */
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ dailyNumber: number; reference: string; queueNumber: number } | null>(null);

  // بيانات المريض
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [age, setAge] = useState("");

  // الملاحظة
  const [conditions, setConditions] = useState<string[]>([]);
  const [note, setNote] = useState("");

  // الدخول
  const [loginPhone, setLoginPhone] = useState("");
  const [loginName, setLoginName] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const patient = patients.find((p) => p.id === patientId);

  /** يملأ الحقول من المريض المختار، ويفتح التعديل إن كانت ناقصة */
  const adopt = useCallback((chosenPatient: Patient | undefined, accountPhone?: string | null) => {
    setFullName(chosenPatient?.fullName ?? "");
    setPhone(localPhone(chosenPatient?.phone ?? accountPhone));
    setAddress(chosenPatient?.address ?? "");
    setAge(ageOf(chosenPatient?.birthYear ?? null));
    setEditing(!isComplete(chosenPatient));
  }, []);

  const loadPatients = useCallback(
    (accountPhone?: string | null) => {
      api
        .get<Patient[]>("/me/patients")
        .then((list) => {
          setPatients(list);
          const first = list.find((p) => p.isSelf) ?? list[0];
          setPatientId(first?.id ?? "");
          adopt(first, accountPhone);
        })
        .catch(() => {});
    },
    [adopt],
  );

  useEffect(() => {
    getSession().then((session) => {
      setUser(session);
      if (session?.role === "PATIENT") loadPatients(session.phone);
    });
  }, [loadPatients]);

  async function requestCode() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ devCode?: string }>("/auth/otp/request", { phone: loginPhone });
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
        { phone: loginPhone, code, fullName: loginName },
      );
      await saveSession(session);
      setUser(session.user);
      loadPatients(session.user.phone);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** الملاحظة النهائية: ما لُمس من الحالات ثم ما كُتب بحرّية */
  const composedNote = useMemo(() => {
    const parts = [];
    if (conditions.length > 0) parts.push(conditions.join(" · "));
    if (note.trim()) parts.push(note.trim());
    return parts.join(" — ");
  }, [conditions, note]);

  const ageNumber = Number(age);
  const ageValid = age.trim() === "" || (Number.isInteger(ageNumber) && ageNumber >= 0 && ageNumber <= 120);
  const detailsReady = fullName.trim().length >= 3 && phone.trim().length >= 10 && ageValid;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      // البيانات تُحفظ في المريض قبل الحجز: هي صفته لا صفة موعده، فتصلح
      // للحجز القادم أيضاً. وفشلها لا يُفشل الحجز — الموعد أهمّ من العنوان
      if (editing) {
        try {
          const saved = await api.patch<Patient>(`/me/patients/${patientId}`, {
            fullName: fullName.trim(),
            phone: phone.trim() || null,
            address: address.trim() || null,
            birthYear: age.trim() ? thisYear - ageNumber : null,
          });
          setPatients((list) => list.map((p) => (p.id === saved.id ? saved : p)));
          setEditing(false);
        } catch {
          /* نكمل الحجز: بيانات ناقصة أهون من موعد ضائع */
        }
      }

      const result = await api.post<{ dailyNumber: number; reference: string; queueNumber: number }>("/bookings", {
        doctorClinicId: practiceId,
        patientId,
        startAt: chosen.startAt,
        patientNote: composedNote || undefined,
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
          maxHeight: "90%",
        }}
      >
        <ScrollView
          contentContainerStyle={{ padding: space(5), paddingBottom: space(10), gap: space(4) }}
          keyboardShouldPersistTaps="handled"
        >
          {done ? (
            <Confirmation
              done={done}
              patientName={patient?.fullName ?? ""}
              doctorName={doctorName}
              clinicName={clinicName}
              date={date}
              timeLabel={chosen.label}
              onOpenBookings={() => {
                onBooked();
                router.push("/bookings");
              }}
              onClose={onBooked}
            />
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
                      value={loginPhone}
                      onChangeText={setLoginPhone}
                      placeholder="07701234567"
                      keyboardType="phone-pad"
                      editable={!otpSent}
                    />
                  </Field>

                  {!otpSent ? (
                    <Button
                      label="إرسال الرمز"
                      full
                      loading={busy}
                      disabled={loginPhone.length < 10}
                      onPress={requestCode}
                    />
                  ) : (
                    <>
                      <Field label="الاسم الكامل" hint="يظهر للطبيب في قائمة مرضاه">
                        <Input value={loginName} onChangeText={setLoginName} placeholder="الاسم الثلاثي" />
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
                <View style={{ gap: space(4) }}>
                  {patients.length > 1 ? (
                    <Field label="الموعد لمن؟">
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
                        {patients.map((p) => {
                          const active = p.id === patientId;
                          return (
                            <Pressable
                              key={p.id}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                              onPress={() => {
                                setPatientId(p.id);
                                adopt(p, user.phone);
                              }}
                              style={{
                                paddingHorizontal: space(3.5),
                                paddingVertical: space(2.25),
                                borderRadius: radius.pill,
                                backgroundColor: active ? palette.primary : palette.surface2,
                                borderWidth: 1.4,
                                borderColor: active ? palette.primary : palette.lineStrong,
                              }}
                            >
                              <T size={13.5} weight="semibold" tone={active ? "onPrimary" : "ink"}>
                                {p.fullName}
                                {p.isSelf ? " (أنا)" : ""}
                              </T>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Field>
                  ) : null}

                  {editing ? (
                    <View style={{ gap: space(3) }}>
                      <T size={13.5} tone="muted">
                        تسألها العيادة مرّةً واحدة، ونحفظها لحجوزك القادمة.
                      </T>
                      <Field label="اسم المريض">
                        <Input value={fullName} onChangeText={setFullName} placeholder="الاسم الثلاثي" />
                      </Field>
                      <Field label="رقم الهاتف">
                        <Input
                          value={phone}
                          onChangeText={setPhone}
                          placeholder="07701234567"
                          keyboardType="phone-pad"
                        />
                      </Field>
                      <Field label="العنوان" hint="القضاء والحي يكفيان">
                        <Input value={address} onChangeText={setAddress} placeholder="الكرخ — حي الجامعة" />
                      </Field>
                      <Field label="العمر" hint={ageValid ? undefined : "اكتب العمر بالسنين"}>
                        <Input
                          value={age}
                          onChangeText={setAge}
                          placeholder="32"
                          keyboardType="number-pad"
                          maxLength={3}
                        />
                      </Field>
                    </View>
                  ) : (
                    <SavedDetails
                      fullName={fullName}
                      phone={phone}
                      address={address}
                      age={age}
                      onEdit={() => setEditing(true)}
                    />
                  )}

                  <Divider />

                  <Field label="عندك حالة يعرفها الطبيب؟" hint="اختياري — يلمسها المريض فتصل مع الحجز">
                    <Chips
                      options={CONDITIONS}
                      selected={conditions}
                      onToggle={(value) =>
                        setConditions((list) =>
                          list.includes(value) ? list.filter((c) => c !== value) : [...list, value],
                        )
                      }
                    />
                  </Field>

                  <Input
                    value={note}
                    onChangeText={setNote}
                    placeholder="أي شيء آخر للطبيب — مثلاً: ألم في الصدر منذ يومين"
                    multiline
                    numberOfLines={2}
                  />

                  <T size={12.5} tone="faint">
                    يمكنك الإلغاء حتى {toArabic(Math.round(cancelCutoffMinutes / 60))} ساعة قبل الموعد.
                  </T>

                  <Button
                    label="تثبيت الحجز"
                    variant="primary"
                    size="lg"
                    full
                    loading={busy}
                    disabled={!patientId || !detailsReady}
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

/* ── البيانات المحفوظة: سطرٌ لا استمارة ──────────────────────── */

function SavedDetails({
  fullName,
  phone,
  address,
  age,
  onEdit,
}: {
  fullName: string;
  phone: string;
  address: string;
  age: string;
  onEdit: () => void;
}) {
  const palette = usePalette();
  return (
    <View
      style={{
        backgroundColor: palette.surface2,
        borderRadius: radius.lg,
        borderWidth: 1.4,
        borderColor: palette.line,
        padding: space(4),
        gap: space(1),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
        <T size={14.5} weight="bold" style={{ flex: 1 }}>
          {fullName}
        </T>
        <Pressable accessibilityRole="button" onPress={onEdit} hitSlop={8}>
          <T size={13} weight="bold" tone="primary">
            تعديل
          </T>
        </Pressable>
      </View>
      {/* سطران لا سطر: رقمُ هاتفٍ وعمرٌ في نصٍّ عربيٍّ واحد يعيد المحرّك ترتيبهما
          ثنائيَّ الاتجاه فيلتصقان رقماً واحداً بلا معنى — رأيتها على الشاشة */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
        <T size={13} tone="muted">
          {toArabic(phone)}
        </T>
        {age ? (
          <T size={13} tone="muted">
            {toArabic(age)} سنة
          </T>
        ) : null}
      </View>
      {address ? (
        <T size={13} tone="muted">
          {address}
        </T>
      ) : null}
    </View>
  );
}

/* ── ما بعد التثبيت: الرقم هو البطل ──────────────────────────── */

function Confirmation({
  done,
  patientName,
  doctorName,
  clinicName,
  date,
  timeLabel,
  onOpenBookings,
  onClose,
}: {
  done: { dailyNumber: number; reference: string; queueNumber: number };
  patientName: string;
  doctorName: string;
  clinicName: string;
  date: string;
  timeLabel: string;
  onOpenBookings: () => void;
  onClose: () => void;
}) {
  const palette = usePalette();
  return (
    <View style={{ gap: space(4), paddingVertical: space(2) }}>
      <View style={{ alignItems: "center", gap: space(2) }}>
        <IconTile size={64} round bg={palette.okSoft}>
          <Icon.checkCircle size={32} color={palette.ok} />
        </IconTile>
        <T size={19} weight="bold" align="center">
          تم تثبيت حجزك
        </T>
      </View>

      {/* الرقم بأكبر خطٍّ في التطبيق: هو ما يُطلب منه عند البابِ لا الكود */}
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette.primary,
          borderRadius: radius.xl,
          paddingVertical: space(5),
          paddingHorizontal: space(4),
          gap: space(1),
        }}
      >
        <T size={13} weight="semibold" tone="onPrimary" style={{ opacity: 0.85 }}>
          رقمك في العيادة
        </T>
        <T size={64} weight="bold" tone="onPrimary" lineHeight={74}>
          {toArabic(done.dailyNumber)}
        </T>
        <T size={13.5} weight="semibold" tone="onPrimary" align="center" style={{ opacity: 0.9 }}>
          {patientName}
        </T>
      </View>

      <T size={13} tone="muted" align="center" lineHeight={20}>
        احفظ الرقم. عند الحضور قل رقمك واسمك — الرقم مسجَّل باسمك في قائمة اليوم.
      </T>

      <View
        style={{
          backgroundColor: palette.surface2,
          borderRadius: radius.lg,
          padding: space(4),
          gap: space(1),
        }}
      >
        <T size={14} weight="bold">
          {doctorName}
        </T>
        <T size={13} tone="muted">
          {clinicName}
        </T>
        <T size={13.5} weight="semibold" tone="primary">
          {formatDay(date)} — {timeLabel}
        </T>
        {done.queueNumber > 0 ? (
          <T size={13} tone="muted">
            دورك داخل الفترة: {toArabic(done.queueNumber)}
          </T>
        ) : null}
      </View>

      <View style={{ gap: space(2) }}>
        <Button label="مواعيدي" full onPress={onOpenBookings} />
        <Button label="إغلاق" variant="outline" full onPress={onClose} />
      </View>
    </View>
  );
}
