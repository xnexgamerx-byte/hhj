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
 * عنوان الخادم: متغيّر البيئة أولاً (يُحقن وقت البناء)، ثم إعدادات التطبيق.
 * لا يُترك ثابتاً في الشفرة لأن نسخة التطوير ونسخة الإنتاج تختلفان.
 */
const BASE: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  "http://localhost:3000";

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

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "NETWORK", "تعذّر الاتصال. تحقق من الإنترنت");
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
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ── الأنواع المشتركة مع الخادم ──────────────────────────────────
export type Governorate = { id: number; slug: string; nameAr: string };
export type Specialty = { id: number; slug: string; nameAr: string; doctorCount: number };

export type DoctorCard = {
  id: string;
  title: string;
  fullName: string;
  yearsOfExperience: number | null;
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
};
