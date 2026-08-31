/**
 * عميل الواجهة البرمجية للتطبيق.
 *
 * رموز الدخول تُخزَّن في الحافظة الآمنة للجهاز (Keychain على آيفون،
 * Keystore على أندرويد) لا في تخزين عادي — لأنها تكافئ كلمة مرور.
 * على الويب تُستعمل localStorage لأن الحافظة الآمنة غير متاحة هناك.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * عنوان الخادم.
 *
 * الترتيب: متغيّر البيئة، ثم استنتاجه من خادم التطوير، ثم إعدادات التطبيق.
 *
 * الاستنتاج هو ما يجعل التجربة على هاتف حقيقي تعمل بلا إعداد: حين تفتح
 * التطبيق عبر Expo Go يكون Metro على حاسوبك، فنأخذ عنوانه ونستعمل المنفذ
 * ٣٠٠٠. بدونه يشير localhost داخل الهاتف إلى الهاتف نفسه لا إلى حاسوبك،
 * وهو أكثر ما يُربك في أول تجربة.
 */
const API_PORT = process.env.EXPO_PUBLIC_API_PORT ?? "3000";

function inferDevHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;
  if (!hostUri) return null;

  const host = hostUri.split(":")[0];
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return `http://${host}:${API_PORT}`;
}

/**
 * على الويب: الخادم على نفس الجهاز الذي جاءت منه الصفحة.
 *
 * يهمّ حين تُفتح النسخة المصدَّرة من متصفّح الهاتف عبر الشبكة المحلية —
 * وهي طريق تجربة التطبيق على جهاز حقيقي دون Expo Go. لولاه لقصد localhost
 * الهاتفَ نفسه ولما وصل طلبٌ واحد.
 */
function inferWebHost(): string | null {
  if (Platform.OS !== "web") return null;
  const host = typeof window === "undefined" ? null : window.location?.hostname;
  if (!host) return null;
  return `http://${host}:${API_PORT}`;
}

// نصّ فارغ في متغيّر البيئة أسوأ من غيابه: `??` تمرّره فتنقطع سلسلة
// الاستنتاج كلّها ويبقى العنوان فارغاً
const ENV_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || null;

const BASE: string =
  ENV_URL ??
  inferDevHost() ??
  inferWebHost() ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  "http://localhost:3000";

// ١٥ ثانية: سخيّة لشبكة بطيئة، وقصيرة بما يكفي ألّا يظنّ أحد أنّ التطبيق معطّل
const REQUEST_TIMEOUT_MS = 15_000;

const ACCESS_KEY = "mawid.access";
const REFRESH_KEY = "mawid.refresh";
const USER_KEY = "mawid.user";

export type SessionUser = { id: string; fullName: string; role: "PATIENT" | "DOCTOR" | "STAFF" | "OWNER" };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// ── التخزين ─────────────────────────────────────────────────────
const memory = new Map<string, string>();

async function readKey(key: string): Promise<string | null> {
  if (memory.has(key)) return memory.get(key)!;
  try {
    const value =
      Platform.OS === "web" ? globalThis.localStorage?.getItem(key) ?? null : await SecureStore.getItemAsync(key);
    if (value !== null) memory.set(key, value);
    return value;
  } catch {
    return null;
  }
}

async function writeKey(key: string, value: string | null): Promise<void> {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (Platform.OS === "web") {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
    } else if (value === null) {
      await SecureStore.deleteItemAsync(key);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  } catch {
    /* الجلسة تبقى في الذاكرة حتى لو تعذّر الحفظ */
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const raw = await readKey(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export async function saveSession(payload: {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}): Promise<void> {
  await writeKey(ACCESS_KEY, payload.accessToken);
  await writeKey(REFRESH_KEY, payload.refreshToken);
  await writeKey(USER_KEY, JSON.stringify(payload.user));
}

export async function clearSession(): Promise<void> {
  await Promise.all([writeKey(ACCESS_KEY, null), writeKey(REFRESH_KEY, null), writeKey(USER_KEY, null)]);
}

// ── الطلبات ─────────────────────────────────────────────────────
async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = await readKey(ACCESS_KEY);
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // مهلة صريحة: fetch بلا مهلة يعلّق إلى الأبد حين تُبتلع الحزم بصمت —
  // جدار حماية يحجب المنفذ، أو شبكة تسقط في منتصف الطلب — فيبقى المستخدم
  // أمام دوّارة لا تنتهي ولا يعرف أن شيئاً تعطّل.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers, signal: abort.signal });
  } catch (error) {
    const timedOut = (error as Error)?.name === "AbortError";
    // في التطوير نذكر العنوان: أكثر ما يعطّل أول تجربة على هاتف حقيقي هو
    // جدار الحماية على منفذ الخادم، ولا يُخمَّن ذلك من "تعذّر الاتصال"
    const where = __DEV__ ? ` (${BASE})` : "";
    throw new ApiError(
      0,
      timedOut ? "TIMEOUT" : "NETWORK",
      timedOut
        ? `لم يستجب الخادم${where}. تأكد أنه يعمل وأن جدار الحماية لا يحجب منفذه.`
        : `تعذّر الاتصال${where}. تحقق من الإنترنت`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 && retry && (await tryRefresh())) {
    return request<T>(path, init, false);
  }
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? "UNKNOWN", data?.message ?? "حدث خطأ غير متوقع");
  }
  return data as T;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = await readKey(REFRESH_KEY);
  if (!refreshToken) return false;
  try {
    const response = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      await clearSession();
      return false;
    }
    await saveSession(await response.json());
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ── الأنواع المشتركة مع الخادم ──────────────────────────────────
export type Governorate = { id: number; slug: string; nameAr: string };
export type Specialty = { id: number; slug: string; nameAr: string; doctorCount: number };

export type ClinicCard = {
  id: string;
  nameAr: string;
  landmark: string | null;
  governorate: string;
  district: string;
  doctorCount: number;
  specialties: string[];
  minFee: number;
  ratingAvg: number;
  ratingCount: number;
};

export type DoctorCard = {
  id: string;
  title: string;
  fullName: string;
  yearsOfExperience: number | null;
  ratingAvg: number;
  ratingCount: number;
  specialties: string[];
  practices: {
    id: string;
    feeAmount: number;
    bookingMode: "SLOT" | "QUEUE";
    clinicName: string;
    landmark: string | null;
    governorate: string;
    district: string;
  }[];
  nextAvailable: { date: string; weekdayName: string; freeCount: number } | null;
};

export type DoctorProfile = {
  id: string;
  title: string;
  fullName: string;
  bio: string | null;
  yearsOfExperience: number | null;
  ratingAvg: number;
  ratingCount: number;
  specialties: string[];
  practices: {
    id: string;
    feeAmount: number;
    bookingMode: "SLOT" | "QUEUE";
    slotMinutes: number;
    cancelCutoffMinutes: number;
    clinicName: string;
    landmark: string | null;
    addressLine: string | null;
    phone: string | null;
    governorate: string;
    district: string;
    schedules: { weekday: number; startTime: string; endTime: string }[];
  }[];
};

export type Slot = { start: string; time: string; taken: boolean };

export type Session = {
  sessionStart: string;
  sessionEnd: string;
  startTime: string;
  endTime: string;
  bookingMode: "SLOT" | "QUEUE";
  slots: Slot[];
  capacity: number;
  booked: number;
  remaining: number;
  nextQueueNumber: number;
};

export type Day = {
  date: string;
  weekdayName: string;
  isClosed: boolean;
  closedReason: string | null;
  hasSchedule: boolean;
  sessions: Session[];
  freeCount: number;
};

export type Patient = { id: string; fullName: string; isSelf: boolean };

export type Review = { id: string; rating: number; comment: string | null; createdAt: string; patientName: string };

export type ReviewableVisit = { appointmentId: string; reference: string; doctorName: string; visitedAt: string };

export type Booking = {
  id: string;
  reference: string;
  status: string;
  bookingMode: "SLOT" | "QUEUE";
  queueNumber: number;
  slotStart: string;
  sessionStart: string;
  sessionEnd: string;
  isUpcoming: boolean;
  patientName: string;
  doctorName: string;
  clinicName: string;
  landmark: string | null;
  clinicPhone: string | null;
  feeAmount: number;
  canReview: boolean;
};

export type BookingResult = {
  appointmentId: string;
  reference: string;
  queueNumber: number;
  status: string;
};
