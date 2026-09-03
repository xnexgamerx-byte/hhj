/**
 * اختيار الثيم: يتبع النظام افتراضاً، ويمكن تثبيته على فاتح أو داكن.
 *
 * الاتّباع التلقائي هو السلوك الصحيح لأكثر الناس — الهاتف يعرف متى يُظلم.
 * لكن بعضهم يريد التطبيق فاتحاً دائماً لأنّه يقرؤه في الشمس، أو داكناً
 * دائماً لأنّه يفتحه في الليل. فالخيار موجود ولا يُفرض.
 *
 * والاختيار يُحفظ على الجهاز: ثيمٌ يعود إلى النظام كلّما أُغلق التطبيق ليس
 * اختياراً بل إزعاج.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";

export type ThemeMode = "system" | "light" | "dark";

const KEY = "doctorsehti.theme";

type ThemeState = {
  /** ما اختاره المستخدم */
  mode: ThemeMode;
  /** ما يُرسم فعلاً بعد حلّ "system" */
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

function isMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

async function read(): Promise<ThemeMode | null> {
  try {
    const raw =
      Platform.OS === "web"
        ? globalThis.localStorage?.getItem(KEY) ?? null
        : await SecureStore.getItemAsync(KEY);
    return isMode(raw) ? raw : null;
  } catch {
    return null; // تخزينٌ متعذّر يعني اتّباع النظام، لا سقوط التطبيق
  }
}

async function write(mode: ThemeMode): Promise<void> {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, mode);
    else await SecureStore.setItemAsync(KEY, mode);
  } catch {
    // لا شيء: الاختيار يبقى لهذه الجلسة
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setStored] = useState<ThemeMode>("system");

  // القراءة غير متزامنة، فأول إطار يُرسم باتّباع النظام ثم يُصحَّح إن لزم
  useEffect(() => {
    void read().then((saved) => {
      if (saved) setStored(saved);
    });
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setStored(next);
    void write(next);
  }, []);

  const value = useMemo<ThemeState>(
    () => ({ mode, resolved: mode === "system" ? (system === "dark" ? "dark" : "light") : mode, setMode }),
    [mode, system, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * يعمل بلا مزوّد أيضاً: شاشة تُعرض خارج الشجرة — في اختبار أو أداة — يجب
 * ألّا تسقط، بل تتبع النظام كما لو لم يُختر شيء.
 */
export function useThemeMode(): ThemeState {
  const system = useColorScheme();
  const context = useContext(ThemeContext);
  const fallbackResolved = system === "dark" ? "dark" : "light";
  return (
    context ?? {
      mode: "system",
      resolved: fallbackResolved,
      setMode: () => {},
    }
  );
}
