import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { PlainHeader } from "@/components/PlainHeader";
import { Icon } from "@/components/icons";
import { Alert, Button, Card, EmptyState, IconTile, Loading, T } from "@/components/ui";
import { api, getSession, type InboxFeed, type Notification, type SessionUser } from "@/lib/api";
import { radius, space, usePalette } from "@/theme";

/**
 * صندوق الإشعارات.
 *
 * كل إشعارٍ هنا حدثٌ مسّ موعد المريض: تثبيتٌ أو تذكيرٌ أو إلغاءٌ أو دعوةُ
 * تقييم. لذلك يقود الضغط إلى «مواعيدي» لا إلى تفصيلٍ منفصل — الإشعار طريقٌ
 * إلى الشيء لا شيءٌ بذاته.
 */
export default function NotificationsScreen() {
  const palette = usePalette();
  const router = useRouter();
  const [feed, setFeed] = useState<InboxFeed | null>(null);
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    return api
      .get<InboxFeed>("/me/notifications")
      .then((data) => {
        setFeed(data);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  // عند كل دخولٍ للشاشة: الإشعار الذي وصل والمريض هنا يجب أن يظهر
  useFocusEffect(
    useCallback(() => {
      getSession().then((session) => {
        setUser(session);
        if (session?.role === "PATIENT") void load();
      });
    }, [load]),
  );

  // الزائر لا يُستقبل بخطأ أحمر «سجّل الدخول أولاً»: هو لم يخطئ، وإنما لم
  // يحجز بعد. نفس ما تفعله «مواعيدي» — دعوةٌ لا إنذار
  if (user === null || (user && user.role !== "PATIENT")) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <PlainHeader back title="الإشعارات" />
        <View style={{ padding: space(4) }}>
          <Card>
            <EmptyState
              icon={(c, s) => <Icon.bell size={s} color={c} />}
              title="لا إشعارات بعد"
              hint="بعد أول حجز يصلك تأكيده هنا، ثم تذكيرٌ قبل الموعد بيوم وبساعتين."
              action={<Button label="ابحث عن طبيب" onPress={() => router.replace("/")} />}
            />
          </Card>
        </View>
      </View>
    );
  }

  async function open(item: Notification) {
    if (!item.isRead) {
      setFeed((current) =>
        current
          ? {
              items: current.items.map((x) => (x.id === item.id ? { ...x, isRead: true } : x)),
              unread: Math.max(0, current.unread - 1),
            }
          : current,
      );
      // التأشير لا يُنتظر ولا يُعطّل التنقّل: أسوأ ما يحدث أن تبقى نقطةٌ
      // زرقاء حتى الفتحة القادمة
      api.post(`/me/notifications/${item.id}/read`).catch(() => {});
    }
    if (item.linkTo) router.push(item.linkTo as never);
  }

  async function readAll() {
    setFeed((current) => (current ? { items: current.items.map((x) => ({ ...x, isRead: true })), unread: 0 } : current));
    api.post("/me/notifications/read").catch(() => {});
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <PlainHeader back title="الإشعارات" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space(4), paddingBottom: space(8), gap: space(2.5) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={palette.primary}
          />
        }
      >
        {error ? <Alert message={error} /> : null}
        {(feed === null || user === undefined) && !error ? <Loading label="جارٍ جلب الإشعارات…" /> : null}

        {feed && feed.unread > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={readAll}
            style={{ alignSelf: "flex-start", paddingVertical: space(1), paddingHorizontal: space(1) }}
            hitSlop={8}
          >
            <T size={13.5} weight="bold" tone="primary">
              تأشير الكل كمقروء
            </T>
          </Pressable>
        ) : null}

        {feed?.items.length === 0 ? (
          <EmptyState
            icon={(c, s) => <Icon.bell size={s} color={c} />}
            title="لا إشعارات بعد"
            hint="حين تحجز موعداً يصلك تأكيده هنا، ثم تذكيرٌ قبله بيوم وبساعتين."
          />
        ) : null}

        {feed?.items.map((item) => (
          <NotificationCard key={item.id} item={item} onPress={() => open(item)} />
        ))}
      </ScrollView>
    </View>
  );
}

/** أيقونةٌ ولونٌ لكل نوع — العين تفرز قبل أن تقرأ */
function toneFor(title: string) {
  if (title.includes("أُلغي")) return { icon: "close", tone: "danger" } as const;
  if (title.includes("تقييم") || title.includes("زيارتك")) return { icon: "star", tone: "gold" } as const;
  if (title.includes("موعدك")) return { icon: "clock", tone: "warn" } as const;
  return { icon: "checkCircle", tone: "ok" } as const;
}

function NotificationCard({ item, onPress }: { item: Notification; onPress: () => void }) {
  const palette = usePalette();
  const kind = toneFor(item.title);
  const color = palette[kind.tone];
  const soft = palette[`${kind.tone}Soft` as const];
  const Glyph = Icon[kind.icon];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.body}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: space(3),
        padding: space(3.5),
        borderRadius: radius.lg,
        // غير المقروء بسطحٍ مرفوع وحدٍّ ملوّن — لا بنقطةٍ صغيرة وحدها
        backgroundColor: item.isRead ? palette.surface : palette.primaryTint,
        borderWidth: 1.4,
        borderColor: item.isRead ? palette.line : palette.primarySoft,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <IconTile size={42} round bg={soft}>
        <Glyph size={20} color={color} />
      </IconTile>

      <View style={{ flex: 1, gap: space(1) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
          <T size={14.5} weight="bold" style={{ flex: 1 }}>
            {item.title}
          </T>
          {!item.isRead ? (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.primary }} />
          ) : null}
        </View>
        <T size={13} tone="muted" lineHeight={19}>
          {item.body}
        </T>
        <T size={11.5} tone="faint">
          {relativeTime(item.createdAt)}
        </T>
      </View>
    </Pressable>
  );
}

/**
 * «قبل ساعتين» أوضح من تاريخٍ كامل في قائمةٍ يُمسح النظر عليها.
 * وما جاوز الأسبوع يعود تاريخاً: «قبل ٢٣ يوماً» لا يعني شيئاً.
 */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const minutes = Math.floor((Date.now() - then) / 60000);
  const ar = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

  if (minutes < 1) return "الآن";
  if (minutes < 60) return `قبل ${ar(minutes)} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${ar(hours)} ساعة`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "أمس";
  if (days < 7) return `قبل ${ar(days)} أيام`;
  return new Intl.DateTimeFormat("ar-IQ", { day: "numeric", month: "long" }).format(new Date(iso));
}
