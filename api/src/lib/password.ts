/**
 * تجزئة الباسوورد باستعمال scrypt من مكتبة Node القياسية — بلا اعتماديات خارجية.
 * لا يُخزَّن الباسوورد نفسه في أي مكان، ولا يظهر في أي سجل.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PREFIX = "scrypt";

/** يُنتج سلسلة بالشكل: scrypt$<salt-hex>$<hash-hex> */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(plain.normalize("NFKC"), salt, KEY_LENGTH);
  return `${PREFIX}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** مقارنة بزمن ثابت — المقارنة العادية تسرّب معلومات عن الباسوورد الصحيح. */
export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [prefix, saltHex, hashHex] = stored.split("$");
  if (prefix !== PREFIX || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(plain.normalize("NFKC"), Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * باسوورد أولي ينشئه المالك ويسلّمه للطبيب.
 * بلا الحروف والأرقام المتشابهة (0/O، 1/l/I) لأنه يُملى شفهياً أو يُكتب على ورقة.
 */
const SAFE_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateTemporaryPassword(length = 12): string {
  const bytes = randomBytes(length * 2);
  let password = "";
  for (let i = 0; password.length < length && i < bytes.length; i++) {
    // رفض القيم التي تقع خارج المضاعف الأخير للأبجدية لتفادي انحياز التوزيع
    const limit = 256 - (256 % SAFE_ALPHABET.length);
    if (bytes[i] < limit) password += SAFE_ALPHABET[bytes[i] % SAFE_ALPHABET.length];
  }
  return password.length === length ? password : generateTemporaryPassword(length);
}

/** الحد الأدنى المقبول عند تغيير الطبيب لباسووردهِ. */
export function validatePasswordStrength(plain: string): string | null {
  if (plain.length < 8) return "الباسوورد يجب أن يكون ٨ خانات على الأقل";
  if (!/[A-Za-z]/.test(plain)) return "الباسوورد يجب أن يحتوي حرفاً واحداً على الأقل";
  if (!/[0-9]/.test(plain)) return "الباسوورد يجب أن يحتوي رقماً واحداً على الأقل";
  return null;
}
