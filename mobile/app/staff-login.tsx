import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { PlainHeader } from "@/components/PlainHeader";
import { Icon } from "@/components/icons";
import { Alert, Button, Card, Field, IconTile, Input, T } from "@/components/ui";
import { api, saveSession, type SessionUser } from "@/lib/api";
import { space, usePalette } from "@/theme";

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
  user: SessionUser;
};

/**
 * دخول الطبيب والسكرتير — برقم الهاتف وباسوورد، لا برمز تحقّق.
 *
 * مسارٌ منفصل عن دخول المريض لأن المسارين مختلفان في جوهرهما: المريض يسجّل
 * نفسه برقمه بلا كلمة مرور، والطبيب حسابٌ ينشئه المالك ويسلّمه باسووردَه.
 * وخلطهما في شاشةٍ واحدة يجعل تسعة وتسعين بالمئة من المستخدمين يمرّون على
 * حقلٍ لا يخصّهم.
 *
 * والهوية هنا رقمُ الهاتف لا الإيميل: الطبيب يحفظ رقمه ولا يحفظ إيميلاً
 * أنشأه له غيره. (الخادم يقبل الاثنين في الحقل نفسه، فيبقى دخول المالك
 * بإيميله من لوحة الويب سليماً.)
 */
export default function StaffLoginScreen() {
  const palette = usePalette();
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [mustChange, setMustChange] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const session = await api.post<LoginResponse>("/auth/login", {
        identifier: phone.trim(),
        password,
      });
      // الباسوورد الأولي يعرفه المالك أيضاً، فلا متابعة قبل تغييره
      if (session.mustChangePassword) {
        setMustChange(true);
        return;
      }
      await saveSession(session);
      router.replace("/clinic");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/password/change", { currentPassword: password, newPassword });
      // الجلسة القديمة تُبطل مع التغيير، فندخل من جديد بالباسوورد الجديد
      const session = await api.post<LoginResponse>("/auth/login", {
        identifier: phone.trim(),
        password: newPassword,
      });
      await saveSession(session);
      router.replace("/clinic");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <PlainHeader back title="دخول العيادة" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: space(4), gap: space(4) }}
          keyboardShouldPersistTaps="handled"
        >
          <Card level={2} style={{ alignItems: "center", gap: space(2), paddingVertical: space(5) }}>
            <IconTile size={58} round bg={palette.primarySoft}>
              <Icon.user size={28} color={palette.primary} />
            </IconTile>
            <T size={17} weight="bold" align="center">
              {mustChange ? "غيّر الباسوورد الأولي" : "دخول الطبيب والسكرتير"}
            </T>
            <T size={13} tone="muted" align="center" lineHeight={20}>
              {mustChange
                ? "الباسوورد الذي سلّمك إياه المالك يعرفه هو أيضاً. اختر واحداً يخصّك."
                : "برقم هاتفك والباسوورد الذي أنشأه لك المالك."}
            </T>
          </Card>

          {error ? <Alert message={error} /> : null}

          {mustChange ? (
            <View style={{ gap: space(3) }}>
              <Field label="الباسوورد الجديد" hint="٨ خانات على الأقل، وفيه حرف ورقم">
                <Input value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" />
              </Field>
              <Button
                label="احفظ وادخل"
                size="lg"
                full
                loading={busy}
                disabled={newPassword.length < 8}
                onPress={changePassword}
              />
            </View>
          ) : (
            <View style={{ gap: space(3) }}>
              <Field label="رقم الهاتف">
                <Input
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="07701234567"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoComplete="username"
                  style={{ textAlign: "left" }}
                />
              </Field>
              <Field label="الباسوورد">
                <Input
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="current-password"
                  style={{ textAlign: "left" }}
                />
              </Field>
              <Button
                label="دخول"
                size="lg"
                full
                loading={busy}
                disabled={!phone.trim() || !password}
                onPress={submit}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
