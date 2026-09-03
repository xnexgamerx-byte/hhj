/**
 * عميل الواجهة البرمجية.
 * يحمل رمز الدخول تلقائياً، ويحوّل أخطاء الخادم إلى رسائل عربية قابلة للعرض.
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * مسارُ صورةٍ مرفوعة («/uploads/…») ⇐ رابطٌ كامل على الخادم.
 * الخادم يحفظ المسار لا الرابط: عنوانه يتبدّل بين جهازٍ ونفقٍ واستضافة.
 */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^(https?:)?\/\//i.test(path) || path.startsWith("data:")) return path;
  return `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

const ACCESS_KEY = "doctorli.access";
const REFRESH_KEY = "doctorli.refresh";
const USER_KEY = "doctorli.user";

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

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* وضع التصفح الخاص يمنع التخزين — التطبيق يبقى صالحاً للجلسة الحالية */
  }
}

export function getSession(): SessionUser | null {
  const raw = read(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function saveSession(payload: {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
  mustChangePassword?: boolean;
}) {
  write(ACCESS_KEY, payload.accessToken);
  write(REFRESH_KEY, payload.refreshToken);
  write(USER_KEY, JSON.stringify(payload.user));
}

export function clearSession() {
  write(ACCESS_KEY, null);
  write(REFRESH_KEY, null);
  write(USER_KEY, null);
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = read(ACCESS_KEY);
  const headers = new Headers(init.headers);
  // FormData يضع ترويسته بنفسه مع حدّ الأجزاء — فرضُ application/json عليها
  // يجعل الخادم يعجز عن تحليل الرفع
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "NETWORK", "تعذّر الاتصال بالخادم. تحقق من الإنترنت");
  }

  // الرمز منتهٍ: نجدّده مرة واحدة ثم نعيد الطلب
  if (response.status === 401 && retry) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, init, false);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error ?? "UNKNOWN",
      data?.message ?? "حدث خطأ غير متوقع",
    );
  }
  return data as T;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = read(REFRESH_KEY);
  if (!refreshToken) return false;
  try {
    const response = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      clearSession();
      return false;
    }
    saveSession(await response.json());
    return true;
  } catch {
    return false;
  }
}

/**
 * رفع ملف. لا يمرّ بـ`request` لأن ذاك يضع Content-Type: application/json،
 * وحقل الرفع يحتاج أن يضع المتصفّح حدَّ الأجزاء (boundary) بنفسه — وضبطُه
 * يدوياً يعطّل التحليل على الخادم بلا رسالة مفهومة.
 */
export async function uploadFile(path: string, file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("file", file);
  return request<{ url: string }>(path, { method: "POST", body: form });
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
