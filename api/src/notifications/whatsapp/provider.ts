/**
 * مزوّدو إرسال الواتساب.
 *
 * الطريق الرسمي الوحيد هو WhatsApp Cloud API من ميتا. المكتبات غير الرسمية
 * (whatsapp-web.js وأمثالها) تخالف شروط واتساب وتؤدي إلى حظر الرقم — لا تُستعمل.
 *
 * قبل تشغيل CloudApiProvider يلزم:
 *   ١. حساب Meta Business موثّق
 *   ٢. رقم هاتف مخصص للـ API — لا يمكن استعماله في تطبيق واتساب العادي بعدها
 *   ٣. قالبا new_booking وbooking_cancelled معتمدان من ميتا باللغة العربية
 *   ٤. WHATSAPP_TOKEN وWHATSAPP_PHONE_NUMBER_ID في البيئة
 */
import type { WhatsAppMessage } from "./templates.js";

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string; retryable: boolean };

export interface WhatsAppProvider {
  readonly name: string;
  send(to: string, message: WhatsAppMessage): Promise<SendResult>;
}

const GRAPH_VERSION = "v21.0";

/** الإرسال الحقيقي عبر واجهة ميتا الرسمية. */
export class CloudApiProvider implements WhatsAppProvider {
  readonly name = "whatsapp-cloud-api";

  constructor(
    private readonly token: string,
    private readonly phoneNumberId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(to: string, message: WhatsAppMessage): Promise<SendResult> {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${this.phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: message.templateName,
        language: { code: message.languageCode },
        components: [
          {
            type: "body",
            parameters: message.params.map((text) => ({ type: "text", text })),
          },
        ],
      },
    };

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      // انقطاع شبكة أو مهلة — يستحق إعادة محاولة
      return { ok: false, error: `تعذّر الاتصال بواتساب: ${(error as Error).message}`, retryable: true };
    }

    const text = await response.text();
    if (!response.ok) {
      // ‎4xx يعني طلباً خاطئاً (قالب غير معتمد، رقم غير صالح) فلا فائدة من الإعادة.
      // ‎429 و5xx مؤقتان ويستحقان إعادة محاولة.
      const retryable = response.status === 429 || response.status >= 500;
      return { ok: false, error: `${response.status}: ${text.slice(0, 500)}`, retryable };
    }

    const parsed = JSON.parse(text) as { messages?: { id: string }[] };
    return { ok: true, providerMessageId: parsed.messages?.[0]?.id ?? null };
  }
}

/**
 * للتطوير والاختبار: يطبع الرسالة بدل إرسالها، ويعطي رابط wa.me يفتح
 * محادثة الطبيب بالنص جاهزاً — يصلح كحل مؤقت يدوي قبل اعتماد قوالب ميتا.
 */
export class ConsoleProvider implements WhatsAppProvider {
  readonly name = "console";
  readonly sent: { to: string; message: WhatsAppMessage }[] = [];

  constructor(private readonly log: (line: string) => void = console.log) {}

  async send(to: string, message: WhatsAppMessage): Promise<SendResult> {
    this.sent.push({ to, message });
    this.log(`\n── واتساب ← ${to} ─────────────────\n${message.body}\n${waMeLink(to, message.body)}\n`);
    return { ok: true, providerMessageId: null };
  }
}

/** رابط يفتح محادثة واتساب مع الرقم والنص معبّأً مسبقاً. */
export function waMeLink(to: string, body: string): string {
  return `https://wa.me/${to.replace(/^\+/, "")}?text=${encodeURIComponent(body)}`;
}

/** يختار المزوّد من متغيرات البيئة: الحقيقي إن توفّرت أوراق الاعتماد، وإلا الطباعة. */
export function createWhatsAppProvider(env: NodeJS.ProcessEnv = process.env): WhatsAppProvider {
  const token = env.WHATSAPP_TOKEN;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  if (token && phoneNumberId) return new CloudApiProvider(token, phoneNumberId);
  return new ConsoleProvider();
}
