/**
 * مزوّدو الدفع.
 *
 * الغرض من العربون واحد: تقليل الغياب. مبلغ صغير يُخصم من أجرة الكشف عند
 * الحضور ولا يُسترد عند الغياب يغيّر سلوك المريض أكثر من أي تذكير.
 *
 * في العراق: ZainCash وFastPay وAsiaHawala وQi. كلها تحتاج حساب تاجر
 * ومفاتيح، ولا يمكن تفعيلها من الكود وحده — لذلك المزوّد مجرَّد هنا،
 * ويُفعَّل الحقيقي بوضع المفاتيح في البيئة.
 */

export type CheckoutRequest = {
  paymentId: string;
  amount: number;
  currency: string;
  /** يظهر للمريض في صفحة الدفع */
  description: string;
  /** يعود إليه المتصفح بعد الدفع */
  returnUrl: string;
};

export type CheckoutResult =
  | { ok: true; providerRef: string; checkoutUrl: string | null; settledImmediately: boolean }
  | { ok: false; error: string };

export type VerifyResult = { status: "PENDING" | "PAID" | "FAILED"; providerRef: string | null };

export interface PaymentProvider {
  readonly name: string;
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  verify(providerRef: string): Promise<VerifyResult>;
}

/**
 * الدفع في العيادة: لا بوابة إلكترونية، والعربون يُسجَّل ويُحصَّل نقداً.
 * هذا هو الوضع الافتراضي، ويصلح للإطلاق قبل جاهزية حساب التاجر.
 */
export class ManualProvider implements PaymentProvider {
  readonly name = "manual";

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    return { ok: true, providerRef: `MANUAL-${request.paymentId.slice(0, 8)}`, checkoutUrl: null, settledImmediately: false };
  }

  async verify(providerRef: string): Promise<VerifyResult> {
    // لا يُحسم إلا بتأشير العيادة يدوياً
    return { status: "PENDING", providerRef };
  }
}

/**
 * ZainCash — الأكثر انتشاراً في العراق.
 * يتطلب: ZAINCASH_MSISDN وZAINCASH_MERCHANT_ID وZAINCASH_SECRET.
 * التوقيع بـJWT بمفتاح التاجر، والمبلغ بالدينار بلا كسور.
 */
export class ZainCashProvider implements PaymentProvider {
  readonly name = "zaincash";

  constructor(
    private readonly config: { msisdn: string; merchantId: string; secret: string; baseUrl: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    // التوقيع بـHS256 على حمولة يحددها المزوّد
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({
      amount: request.amount,
      serviceType: request.description,
      msisdn: this.config.msisdn,
      orderId: request.paymentId,
      redirectUrl: request.returnUrl,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(this.config.secret));

    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}/transaction/init`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, merchantId: this.config.merchantId, lang: "ar" }),
        signal: AbortSignal.timeout(20_000),
      });

      const text = await response.text();
      if (!response.ok) return { ok: false, error: `${response.status}: ${text.slice(0, 300)}` };

      const parsed = JSON.parse(text) as { id?: string };
      if (!parsed.id) return { ok: false, error: `رد غير متوقع: ${text.slice(0, 200)}` };

      return {
        ok: true,
        providerRef: parsed.id,
        checkoutUrl: `${this.config.baseUrl}/transaction/pay?id=${parsed.id}`,
        settledImmediately: false,
      };
    } catch (error) {
      return { ok: false, error: `تعذّر الاتصال ببوابة الدفع: ${(error as Error).message}` };
    }
  }

  async verify(providerRef: string): Promise<VerifyResult> {
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({ id: providerRef, msisdn: this.config.msisdn })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(this.config.secret));

    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}/transaction/get`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, merchantId: this.config.merchantId }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = (await response.json()) as { status?: string };
      const status = data.status === "success" ? "PAID" : data.status === "failed" ? "FAILED" : "PENDING";
      return { status, providerRef };
    } catch {
      return { status: "PENDING", providerRef };
    }
  }
}

export function createPaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProvider {
  const { ZAINCASH_MSISDN, ZAINCASH_MERCHANT_ID, ZAINCASH_SECRET } = env;
  if (ZAINCASH_MSISDN && ZAINCASH_MERCHANT_ID && ZAINCASH_SECRET) {
    return new ZainCashProvider({
      msisdn: ZAINCASH_MSISDN,
      merchantId: ZAINCASH_MERCHANT_ID,
      secret: ZAINCASH_SECRET,
      baseUrl: env.ZAINCASH_BASE_URL ?? "https://api.zaincash.iq",
    });
  }
  return new ManualProvider();
}
