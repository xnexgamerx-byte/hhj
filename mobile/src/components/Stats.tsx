import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { IconTile, T } from "@/components/ui";
import { space, usePalette } from "@/theme";

/** أربع خانات دائرية بالأرقام المهمة — نمط الكيت المرجعي في صفحة الطبيب */
export function StatRow({
  items,
}: {
  items: { icon: (color: string, size: number) => ReactNode; value: string; label: string }[];
}) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row" }}>
      {items.map((item) => (
        <View key={item.label} style={{ flex: 1, alignItems: "center", gap: space(1.5) }}>
          <IconTile size={52} round bg={palette.primaryTint}>
            {item.icon(palette.primary, 23)}
          </IconTile>
          <T size={15} weight="bold" align="center">
            {item.value}
          </T>
          <T size={11.5} tone="faint" align="center" numberOfLines={1}>
            {item.label}
          </T>
        </View>
      ))}
    </View>
  );
}

/** تبويبات بخطّ سفلي تحت النشط */
export function Tabs<K extends string>({
  tabs,
  active,
  onPick,
}: {
  tabs: { key: K; label: string; count?: number }[];
  active: K;
  onPick: (key: K) => void;
}) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: palette.line }}>
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onPick(tab.key)}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: space(3),
              borderBottomWidth: 2.5,
              // الشفّاف يحفظ نفس الارتفاع للتبويب غير النشط فلا يقفز الشريط
              borderBottomColor: on ? palette.primary : "transparent",
              marginBottom: -1,
            }}
          >
            <T size={14} weight={on ? "bold" : "medium"} tone={on ? "primary" : "faint"}>
              {tab.label}
              {tab.count !== undefined ? ` (${tab.count})` : ""}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}
