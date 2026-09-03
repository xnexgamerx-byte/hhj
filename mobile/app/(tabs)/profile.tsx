import { useCallback, useState } from "react";
import { Alert as RNAlert, Linking, Pressable, ScrollView, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { PlainHeader } from "@/components/PlainHeader";
import { Icon } from "@/components/icons";
import { Avatar, Button, Card, Divider, EmptyState, IconTile, Segmented, T } from "@/components/ui";
import { api, clearSession, getSession, type Patient, type SessionUser } from "@/lib/api";
import { toArabic } from "@/lib/format";
import { radius, space, usePalette } from "@/theme";
import { useThemeMode } from "@/theme-mode";

/** حساب المريض: من هو، ولمن يحجز، والخروج. */
export default function ProfileScreen() {
  const palette = usePalette();
  const { mode, setMode } = useThemeMode();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);

  useFocusEffect(
    useCallback(() => {
      getSession().then((session) => {
        setUser(session);
        if (session?.role === "PATIENT") {
          api.get<Patient[]>("/me/patients").then(setPatients).catch(() => setPatients([]));
        } else {
          setPatients([]);
        }
      });
    }, []),
  );

  function askLogout() {
    RNAlert.alert("تسجيل الخروج", "راح تحتاج تكتب اسمك ورقم هاتفك من جديد عند الحجز القادم.", [
      { text: "تراجع", style: "cancel" },
      {
        text: "خروج",
        style: "destructive",
        onPress: async () => {
          await clearSession();
          setUser(null);
          router.replace("/");
        },
      },
    ]);
  }

  // الطبيب والسكرتير حسابٌ آخر بمسارٍ آخر: يفتحان لوحة عيادتهما لا حساب مريض
  if (user && (user.role === "DOCTOR" || user.role === "STAFF")) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <PlainHeader title="حسابي" />
        <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }}>
          <Card level={2} style={{ flexDirection: "row", alignItems: "center", gap: space(3.5) }}>
            <Avatar name={user.fullName} size={62} ring />
            <View style={{ flex: 1, gap: 2 }}>
              <T size={16.5} weight="bold" numberOfLines={1}>
                {user.fullName}
              </T>
              <T size={13} tone="faint">
                {user.role === "DOCTOR" ? "طبيب" : "سكرتير"}
              </T>
            </View>
          </Card>

          <Button
            label="حجوزات عيادتي"
            size="lg"
            full
            icon={(c, s) => <Icon.calendar size={s} color={c} />}
            onPress={() => router.push("/clinic")}
          />
          <Button label="تسجيل الخروج" variant="outline" full onPress={askLogout} />
        </ScrollView>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <PlainHeader title="حسابي" />
        <View style={{ padding: space(4), gap: space(3) }}>
          <Card>
            <EmptyState
              icon={(c, s) => <Icon.user size={s} color={c} />}
              title="لم تسجّل الدخول بعد"
              hint="تدخل تلقائياً برقم هاتفك عند أول حجز — بلا كلمة مرور."
              action={<Button label="ابحث عن طبيب" onPress={() => router.replace("/")} />}
            />
          </Card>
          {/* مدخل الأطباء أسفل الشاشة وبوزنٍ خفيف: هم قلّةٌ بين المستخدمين،
              وإبرازه يجعل كل مريضٍ يتساءل أين إيميله وباسووردُه */}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/staff-login")}
            style={{ alignSelf: "center", padding: space(2) }}
            hitSlop={8}
          >
            <T size={13.5} weight="semibold" tone="muted">
              طبيب أو سكرتير؟ ادخل من هنا
            </T>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <PlainHeader title="حسابي" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space(4), paddingBottom: space(8), gap: space(4) }}
      >
        <Card level={2} style={{ flexDirection: "row", alignItems: "center", gap: space(3.5) }}>
          <Avatar name={user.fullName} size={62} ring />
          <View style={{ flex: 1, gap: 2 }}>
            <T size={16.5} weight="bold" numberOfLines={1}>
              {user.fullName}
            </T>
            <T size={13} tone="faint">
              حساب مريض
            </T>
          </View>
        </Card>

        {/* من يحجز لهم */}
        <View style={{ gap: space(2.5) }}>
          <T size={16} weight="bold">
            المرضى في حسابك
          </T>
          <Card padded={false} style={{ paddingVertical: space(1) }}>
            {patients.length === 0 ? (
              <T size={13} tone="faint" style={{ padding: space(4) }}>
                لا يوجد بعد — يُضاف المريض تلقائياً عند أول حجز باسمه.
              </T>
            ) : (
              patients.map((patient, i) => (
                <View key={patient.id}>
                  {i > 0 ? <Divider inset={space(4)} /> : null}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: space(3),
                      paddingHorizontal: space(4),
                      paddingVertical: space(3),
                    }}
                  >
                    <IconTile size={38} round bg={palette.primarySoft}>
                      <Icon.user size={19} color={palette.primary} />
                    </IconTile>
                    <T size={14} weight="semibold" style={{ flex: 1 }}>
                      {patient.fullName}
                    </T>
                    {patient.isSelf ? (
                      <T size={12} tone="faint">
                        أنا
                      </T>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </Card>
        </View>

        {/* المظهر */}
        <View style={{ gap: space(2.5) }}>
          <T size={16} weight="bold">
            مظهر التطبيق
          </T>
          <Card style={{ gap: space(2.5) }}>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "system", label: "تلقائي" },
                { value: "light", label: "فاتح" },
                { value: "dark", label: "داكن" },
              ]}
            />
            <T size={12} tone="faint">
              {mode === "system"
                ? "يتبع إعداد هاتفك — يُظلم مع الليل ويفتح مع النهار."
                : mode === "light"
                  ? "فاتح دائماً، مهما كان إعداد هاتفك."
                  : "داكن دائماً، مهما كان إعداد هاتفك."}
            </T>
          </Card>
        </View>

        {/* روابط */}
        <Card padded={false} style={{ paddingVertical: space(1) }}>
          <Row
            icon={(c, s) => <Icon.calendar size={s} color={c} />}
            label="مواعيدي"
            onPress={() => router.push("/bookings")}
          />
          <Divider inset={space(4)} />
          <Row
            icon={(c, s) => <Icon.pin size={s} color={c} />}
            label="تغيير المحافظة"
            onPress={() => router.replace("/")}
          />
          <Divider inset={space(4)} />
          <Row
            icon={(c, s) => <Icon.phone size={s} color={c} />}
            label="تواصل مع الدعم"
            onPress={() => Linking.openURL("https://wa.me/9647700000000")}
          />
        </Card>

        <Button
          label="تسجيل الخروج"
          variant="danger"
          full
          icon={(c, s) => <Icon.close size={s} color={c} />}
          onPress={askLogout}
        />
      </ScrollView>
    </View>
  );
}

function Row({
  icon,
  label,
  onPress,
}: {
  icon: (color: string, size: number) => React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space(3),
        paddingHorizontal: space(4),
        paddingVertical: space(3.5),
        borderRadius: radius.md,
        backgroundColor: pressed ? palette.surface2 : "transparent",
      })}
    >
      <IconTile size={38} round bg={palette.primarySoft}>
        {icon(palette.primary, 19)}
      </IconTile>
      <T size={14.5} weight="semibold" style={{ flex: 1 }}>
        {label}
      </T>
      {/* في الواجهة العربية سهم المتابعة يشير يساراً */}
      <Icon.chevronLeft size={18} color={palette.faint} />
    </Pressable>
  );
}
