import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { PlainHeader, BottomBar } from "@/components/PlainHeader";
import { Calendar, type DayState } from "@/components/Calendar";
import { BookingSheet, type Chosen } from "@/components/BookingSheet";
import { Icon } from "@/components/icons";
import { Alert, Avatar, Badge, Button, EmptyState, IconTile, Loading, T } from "@/components/ui";
import { api, mediaUrl, type Day, type DoctorProfile, type Session } from "@/lib/api";
import { countLabel, COUNTS, formatDay, formatFee, formatTimeLabel, toArabic, todayISO } from "@/lib/format";
import { radius, shadow, space, usePalette } from "@/theme";

/**
 * اختيار اليوم ثم الوقت — شاشة الحجز في الكيت المرجعي.
 * لا تُعرض إلا الأوقات الشاغرة؛ المحجوز لا يصل من الخادم أصلاً.
 */
export default function BookScreen() {
  const palette = usePalette();
  const { id, practiceId } = useLocalSearchParams<{ id: string; practiceId?: string }>();

  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [practice, setPractice] = useState<string | null>(practiceId ?? null);
  const [days, setDays] = useState<Day[] | null>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  // الاختيار شيء وفتح نافذة التأكيد شيء آخر: لو فُتحت بمجرّد اللمس لما استطاع
  // المريض تبديل رأيه، ولصار الزر السفلي بلا وظيفة
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DoctorProfile>(`/doctors/${id}`)
      .then((data) => {
        setProfile(data);
        if (!practice) setPractice(data.practices[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  }, [id, practice]);

  const loadAvailability = useCallback((p: string) => {
    setDays(null);
    api
      .get<Day[]>(`/practices/${p}/availability?from=${todayISO()}`)
      .then((data) => {
        setDays(data);
        // نحفظ اليوم الذي اختاره المريض عبر إعادة التحميل بعد الحجز؛ القفز إلى
        // أول يوم فيه أماكن كان يبدّل الشاشة تحت يده بلا سبب
        setActiveDate((current) =>
          current && data.some((d) => d.date === current)
            ? current
            : (data.find((d) => d.freeCount > 0)?.date ?? data[0]?.date ?? null),
        );
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (practice) loadAvailability(practice);
  }, [practice, loadAvailability]);

  const day = days?.find((d) => d.date === activeDate);
  const current = profile?.practices.find((p) => p.id === practice);

  const calendarDays: DayState[] =
    days?.map((d) => ({ date: d.date, free: d.freeCount, hasSchedule: d.hasSchedule, isClosed: d.isClosed })) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <PlainHeader back title="حجز موعد" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space(4), paddingBottom: space(8), gap: space(5) }}
      >
        {error ? <Alert message={error} /> : null}

        {/* مع مَن أحجز؟ الشاشة كانت تسأل عن اليوم قبل أن تقول عند من — والمريض
            قد يصلها من بحثٍ فيه عشرة أطباء متشابهي الاسم */}
        {profile && current ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space(3),
              backgroundColor: palette.surface,
              borderRadius: radius.lg,
              borderWidth: 1.4,
              borderColor: palette.line,
              padding: space(3.5),
            }}
          >
            <Avatar name={profile.fullName} uri={mediaUrl(profile.photoUrl)} size={46} />
            <View style={{ flex: 1, gap: 1 }}>
              <T size={15} weight="bold" numberOfLines={1}>
                {profile.title} {profile.fullName}
              </T>
              <T size={13} tone="muted" numberOfLines={1}>
                {current.clinicName}
              </T>
            </View>
            <View style={{ alignItems: "flex-start" }}>
              <T size={14.5} weight="bold" tone="primary">
                {formatFee(current.feeAmount)}
              </T>
              <T size={11.5} tone="faint">
                سعر الكشف
              </T>
            </View>
          </View>
        ) : null}

        {/* عيادتان لطبيبٍ واحد: كان يُختار أوّلها صامتاً فيحجز المريض في الكرخ
            وهو يقصد الكرادة. الاختيار ظاهرٌ الآن ما دام هناك ما يُختار */}
        {profile && profile.practices.length > 1 ? (
          <View style={{ gap: space(2.5) }}>
            <T size={16.5} weight="bold">
              اختر العيادة
            </T>
            <View style={{ gap: space(2) }}>
              {profile.practices.map((option) => {
                const active = option.id === practice;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      if (option.id === practice) return;
                      setChosen(null);
                      setPractice(option.id);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: space(3),
                      padding: space(3.5),
                      borderRadius: radius.md,
                      backgroundColor: active ? palette.primarySoft : palette.surface,
                      borderWidth: 1.4,
                      borderColor: active ? palette.primary : palette.line,
                    }}
                  >
                    <Icon.pin size={18} color={active ? palette.primary : palette.faint} />
                    <View style={{ flex: 1 }}>
                      <T size={14.5} weight="semibold">
                        {option.clinicName}
                      </T>
                      <T size={12.5} tone="muted">
                        {/* شرطةٌ لا نقطة: «·» تلتبس بـ«٠» حين تلاصق رقماً */}
                        {option.district} — {formatFee(option.feeAmount)}
                      </T>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {days === null && !error ? <Loading label="جارٍ جلب الأوقات…" /> : null}

        {days ? (
          <>
            <View style={{ gap: space(3) }}>
              <T size={16.5} weight="bold">
                اختر اليوم
              </T>
              <Calendar
                days={calendarDays}
                selected={activeDate}
                onSelect={(date) => {
                  setActiveDate(date);
                  setChosen(null);
                }}
              />
            </View>

            <View style={{ gap: space(3) }}>
              <T size={16.5} weight="bold">
                اختر الوقت
              </T>

              {!day || day.isClosed ? (
                <EmptyState
                  icon={(c, s) => <Icon.calendar size={s} color={c} />}
                  title="العيادة مغلقة هذا اليوم"
                  hint={day?.closedReason ? `السبب: ${day.closedReason}` : "اختر يوماً آخر من التقويم."}
                />
              ) : day.sessions.length === 0 ? (
                <EmptyState
                  icon={(c, s) => <Icon.clock size={s} color={c} />}
                  title={day.hasSchedule ? "اكتملت حجوزات هذا اليوم" : "لا دوام في هذا اليوم"}
                  hint={
                    day.hasSchedule
                      ? "لم يبقَ مكان شاغر. الأيام التي فيها أماكن مؤشَّرة بنقطة في التقويم."
                      : "الطبيب لا يداوم في هذا اليوم."
                  }
                />
              ) : (
                <View style={{ gap: space(5) }}>
                  {day.sessions.map((session) => (
                    <SessionBlock
                      key={session.sessionStart}
                      session={session}
                      selected={chosen?.startAt ?? null}
                      onPick={(startAt, label, queue) => setChosen({ startAt, label, queue })}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>

      <BottomBar>
        {chosen && day ? (
          <T size={12.5} tone="muted" align="center" style={{ marginBottom: space(2) }}>
            {formatDay(day.date)} — {chosen.label}
          </T>
        ) : null}
        <Button
          label={chosen ? "متابعة الحجز" : "اختر وقتاً أولاً"}
          size="lg"
          full
          disabled={!chosen}
          onPress={() => setConfirming(true)}
        />
      </BottomBar>

      {confirming && chosen && day && current && profile ? (
        <BookingSheet
          practiceId={current.id}
          doctorName={`${profile.title} ${profile.fullName}`}
          clinicName={current.clinicName}
          date={day.date}
          chosen={chosen}
          cancelCutoffMinutes={current.cancelCutoffMinutes}
          onClose={() => setConfirming(false)}
          onBooked={() => {
            setConfirming(false);
            setChosen(null);
            if (practice) loadAvailability(practice);
          }}
        />
      ) : null}
    </View>
  );
}

/* ── فترة دوام واحدة ─────────────────────────────────────────── */

function SessionBlock({
  session,
  selected,
  onPick,
}: {
  session: Session;
  selected: string | null;
  onPick: (startAt: string, label: string, queue: number | null) => void;
}) {
  const palette = usePalette();
  const range = `${formatTimeLabel(session.startTime)} – ${formatTimeLabel(session.endTime)}`;

  if (session.bookingMode === "QUEUE") {
    const active = selected === session.sessionStart;
    return (
      <View style={{ gap: space(2.5) }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <T size={14} weight="semibold" style={{ flex: 1 }}>
            {range}
          </T>
          <Badge
            tone={session.remaining > 3 ? "ok" : "warn"}
            label={`بقي ${toArabic(session.remaining)} من ${toArabic(session.capacity)}`}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          onPress={() => onPick(session.sessionStart, range, session.nextQueueNumber)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space(3),
            padding: space(4),
            borderRadius: radius.md,
            backgroundColor: active ? palette.primary : palette.surface,
            borderWidth: 1.4,
            borderColor: active ? palette.primary : palette.line,
          }}
        >
          <IconTile size={42} round bg={active ? "rgba(255,255,255,0.18)" : palette.primaryTint}>
            <Icon.ticket size={21} color={active ? "#FFFFFF" : palette.primary} />
          </IconTile>
          <View style={{ flex: 1 }}>
            <T size={15} weight="bold" tone={active ? "onPrimary" : "ink"}>
              دورك سيكون رقم {toArabic(session.nextQueueNumber)}
            </T>
            <T size={13} tone={active ? "onPrimary" : "muted"}>
              تحضر ضمن الفترة — بلا وقت محدد
            </T>
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: space(2.5) }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <T size={14} weight="semibold" style={{ flex: 1 }}>
          {range}
        </T>
        <Badge
          tone="ok"
          label={countLabel(session.remaining, COUNTS.slot)}
        />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
        {session.slots.map((slot) => {
          const active = selected === slot.start;
          return (
            <Pressable
              key={slot.start}
              accessibilityRole="button"
              accessibilityLabel={formatTimeLabel(slot.time)}
              accessibilityState={{ selected: active }}
              onPress={() => onPick(slot.start, formatTimeLabel(slot.time), null)}
              style={{
                minWidth: 86,
                flexGrow: 1,
                paddingVertical: space(3),
                borderRadius: radius.md,
                alignItems: "center",
                backgroundColor: active ? palette.primary : palette.surface,
                borderWidth: 1.4,
                borderColor: active ? palette.primary : palette.line,
                ...(active ? shadow(1, palette.shadowTint) : null),
              }}
            >
              <T size={14} weight="semibold" tone={active ? "onPrimary" : "ink"} align="center">
                {formatTimeLabel(slot.time)}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
