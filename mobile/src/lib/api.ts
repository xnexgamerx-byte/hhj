/**
 * عميل الواجهة البرمجية للتطبيق.
 *
 * رموز الدخول تُخزَّن في الحافظة الآمنة للجهاز (Keychain على آيفون،
 * Keystore على أندرويد) لا في تخزين عادي — لأنها تكافئ كلمة مرور.
 * على الويب تُستعمل localStorage لأن الحافظة الآمنة غير متاحة هناك.
 */
import Constants from "expo-constants";
import { NativeModules, Platform, TurboModuleRegistry } from "react-native";
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

/**
 * يستخرج المضيف من عنوان، ويردّ null لما لا يدلّ على حاسوبٍ في الشبكة.
 *
 * المخطّط يُفحص لا يُتخطّى: عنوانٌ كـfile:///…/index.android.bundle يعني حزمة
 * مضمّنة لا خادم تطوير، وتخطّي المخطّط يجعل "file" نفسه يبدو اسم مضيف.
 */
function hostFrom(url: string | null | undefined): string | null {
  if (!url) return null;

  let host: string | null;
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url)?.[1]?.toLowerCase();
  if (scheme) {
    // http وhttps عنوانا Metro، وexp وexps عنوانا إكسبو. ما عداهما ليس خادماً
    if (!["http", "https", "exp", "exps"].includes(scheme)) return null;
    host = /^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)/i.exec(url)?.[1] ?? null;
  } else {
    // بلا مخطّط: نقبل "مضيف" أو "مضيف:منفذ" فقط. الاكتفاء بأول مقطع يجعل
    // بادئة مخطّطٍ مركّب مثل jar:file://… تبدو اسم مضيف
    host = /^([^/:?#]+)(?::\d+)?(?:[/?#]|$)/.exec(url)?.[1] ?? null;
  }

  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return `http://${host}:${API_PORT}`;
}

/**
 * عنوان الحاسوب كما رواه المشغّل الأصيل: من أين نُزّلت الشفرة فعلاً.
 *
 * أوثق مصدر على الإطلاق — الحزمة جاءت من خادم Metro، فعنوانه هو عنوان
 * الحاسوب يقيناً لا استنتاجاً.
 *
 * يُقرأ عبر TurboModuleRegistry لا NativeModules: المعمارية الجديدة
 * (newArchEnabled) تعمل بلا جسر، فـNativeModules.SourceCode فيها غير معرّف
 * وترجع الدالة null صامتة — فينزلق التسلسل إلى localhost، وهو داخل الهاتف
 * الهاتفُ نفسه. وهذا بالضبط ما وقع.
 */
function inferFromBundleUrl(): string | null {
  if (Platform.OS === "web") return null;
  try {
    const turbo = TurboModuleRegistry.get<{ getConstants: () => { scriptURL?: string } }>("SourceCode");
    const legacy = (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode;
    return hostFrom(turbo?.getConstants?.().scriptURL ?? legacy?.scriptURL);
  } catch {
    return null; // وحدة أصيلة غائبة يجب ألّا تُسقط التطبيق عند التحميل
  }
}

/** بيانات المنشور — تعمل في Expo Go، وقد تغيب في بناء التطوير */
function inferDevHost(): string | null {
  return hostFrom(
    Constants.expoConfig?.hostUri ??
      (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost ??
      Constants.experienceUrl,
  );
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
  return typeof window === "undefined" ? null : hostFrom(window.location?.hostname);
}

// نصّ فارغ في متغيّر البيئة أسوأ من غيابه: `??` تمرّره فتنقطع سلسلة
// الاستنتاج كلّها ويبقى العنوان فارغاً
const ENV_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || null;

const BASE: string =
  ENV_URL ??
  inferFromBundleUrl() ??
  inferDevHost() ??
  inferWebHost() ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  "http://localhost:3000";

/**
 * يحوّل مسار صورةٍ مرفوعة («/uploads/…») إلى رابطٍ كامل على الخادم نفسه.
 *
 * الخادم يعيد مساراً نسبياً لا رابطاً مطلقاً عن قصد: عنوانه يتبدّل بين
 * جهازٍ ونفقٍ ومنصّة استضافة، ورابطٌ مطلقٌ محفوظ في القاعدة يصير خطأً ثابتاً
 * بعد أول انتقال. الحلّ أن يعرف كلٌّ عنوانه: القاعدة تحفظ المسار، والعميل
 * يعرف الأصل الذي يكلّمه.
 */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^(https?:)?\/\//i.test(path) || path.startsWith("data:")) return path;
  return `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

// على جهاز حقيقي، localhost يعني الجهاز نفسه — فبلوغُه هنا يقين خطأ لا احتمال.
// نرفعه إلى السطح بدل أن يظهر بعد حين كـ«تعذّر الاتصال» يُبحث له عن سبب في
// الشبكة وجدار الحماية، وهي رحلة لا تنتهي عند أحد.
const LOST = Platform.OS !== "web" && /^https?:\/\/(localhost|127\.0\.0\.1)\b/.test(BASE);

// ١٥ ثانية: سخيّة لشبكة بطيئة، وقصيرة بما يكفي ألّا يظنّ أحد أنّ التطبيق معطّل
const REQUEST_TIMEOUT_MS = 15_000;

if (__DEV__) {
  console.log(`[موعد] عنوان الخادم: ${BASE}`);
  if (LOST) {
    console.warn(
      "[موعد] تعذّر معرفة عنوان حاسوبك، وlocalhost داخل الهاتف يعني الهاتف نفسه.\n" +
        "        اكتب العنوان يدوياً في mobile/.env ثم أعد تشغيل Metro:\n" +
        "          EXPO_PUBLIC_API_URL=http://<عنوان-حاسوبك>:" +
        API_PORT,
    );
  }
}

const ACCESS_KEY = "mawid.access";

const REFRESH_KEY = "mawid.refresh";
const USER_KEY = "mawid.user";

export type SessionUser = {
  id: string;
  fullName: string;
  role: "PATIENT" | "DOCTOR" | "STAFF" | "OWNER";
  phone: string | null;
};

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
/**
 * يفرّق بين أشكال فشل الشبكة بزمن الفشل، لا بنوع الخطأ وحده.
 *
 * طبقة HTTP في أندرويد تُسقِط الطلب بمهلتها الخاصة قبل مهلتنا، فترمي خطأ
 * شبكة عادياً لا AbortError — فيتساوى في الرسالة منفذٌ مرفوض فوراً ومنفذٌ
 * تُبتلع حزمه بصمت، وهما عطلان مختلفان تماماً:
 *
 *   فشلٌ سريع  ⇐ وصل الطلب ورُفض: لا شيء يستمع على المنفذ (الخادم متوقف)
 *   فشلٌ بطيء  ⇐ لم يصل جواب أصلاً: جدار حماية يحجب المنفذ
 */
const SLOW_FAILURE_MS = 4000;

function networkFailure(error: Error, elapsedMs: number): ApiError {
  if (!__DEV__) {
    return new ApiError(0, "NETWORK", "تعذّر الاتصال. تحقق من الإنترنت");
  }
  // عنوانٌ ضائع سببٌ قائم بذاته: لا معنى لاتهام الخادم ولا جدار الحماية وقد
  // كان الطلب ذاهباً إلى الهاتف نفسه من البداية
  if (LOST) {
    return new ApiError(
      0,
      "NO_HOST",
      `تعذّر معرفة عنوان حاسوبك، فقُصد ${BASE} — وهو الهاتف نفسه. اكتب العنوان في mobile/.env: EXPO_PUBLIC_API_URL`,
    );
  }
  // رابط نفقٍ مؤقّت يموت اسمه في DNS عند إغلاقه، فيبدو الفشل رفضَ اتصال
  // ويُتّهم الخادم وهو يعمل. والعلّة أنّ الرابط يُحقن وقت بناء الحزمة.
  if (/trycloudflare\.com|ngrok/.test(BASE)) {
    return new ApiError(
      0,
      "STALE_TUNNEL",
      `لم يُستجب من ${BASE} — أُعيد تشغيل النفق على الأرجح فتبدّل رابطه. أعد تشغيل Metro، أو: npm run api:auto`,
    );
  }
  const swallowed = error?.name === "AbortError" || elapsedMs >= SLOW_FAILURE_MS;
  return swallowed
    ? new ApiError(0, "TIMEOUT", `لم يصل الطلب (${BASE}) — جدار الحماية يحجب المنفذ على الأرجح.`)
    : new ApiError(0, "NETWORK", `رُفض الاتصال (${BASE}) — الخادم لا يعمل على الأرجح.`);
}

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
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers, signal: abort.signal });
  } catch (error) {
    throw networkFailure(error as Error, Date.now() - startedAt);
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
  photoUrl: string | null;
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
  photoUrl: string | null;
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

/** لافتة الشاشة الرئيسية كما يحرّرها المالك */
export type BannerItem = {
  id: string;
  imageUrl: string | null;
  title: string | null;
  body: string | null;
  linkKind: string | null;
  linkValue: string | null;
};

export type BannerFeed = { banners: BannerItem[]; rotateSeconds: number };

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

export type Patient = {
  id: string;
  fullName: string;
  isSelf: boolean;
  birthYear: number | null;
  gender: "MALE" | "FEMALE" | null;
  phone: string | null;
  address: string | null;
};

export type Review = { id: string; rating: number; comment: string | null; createdAt: string; patientName: string };

export type ReviewableVisit = { appointmentId: string; reference: string; doctorName: string; visitedAt: string };

export type Booking = {
  id: string;
  reference: string;
  status: string;
  bookingMode: "SLOT" | "QUEUE";
  queueNumber: number;
  /** رقم المريض ذلك اليوم في تلك العيادة — ما يحفظه ويُنادى به */
  dailyNumber: number | null;
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
  dailyNumber: number;
  serviceDate: string;
  status: string;
};
