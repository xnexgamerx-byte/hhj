#!/usr/bin/env bash
# تهيئة المشروع من الصفر: قاعدة البيانات، ثم الخادم، ثم الواجهات.
# التشغيل: bash setup.sh
set -euo pipefail

cd "$(dirname "$0")"
say() { printf "\n\033[1;36m%s\033[0m\n" "$1"; }
die() { printf "\n\033[1;31m%s\033[0m\n" "$1" >&2; exit 1; }

# حساب المالك: مرّر إيميلك وباسووردك ليصيرا حسابك من أول تشغيل
#   OWNER_EMAIL=you@example.com OWNER_PASSWORD='...' bash setup.sh
# نتذكّر هل مُرّرا صراحةً، كي نحدّث ملفاً موجوداً من تشغيل سابق
OWNER_GIVEN="${OWNER_EMAIL:-}${OWNER_PASSWORD:-}"
OWNER_EMAIL="${OWNER_EMAIL:-owner@mawid.iq}"
OWNER_PASSWORD="${OWNER_PASSWORD:-MawidOwner2026}"

command -v node >/dev/null || die "لم أجد Node.js — ثبّته أولاً من nodejs.org"

# الفحص قبل أي عمل: الباسوورد القصير كان يُكتشف بعد التنصيب والتعبئة كلّها،
# فيضيع الوقت وتبقى القاعدة بلا حساب مالك
OWNER_EMAIL="$OWNER_EMAIL" OWNER_PASSWORD="$OWNER_PASSWORD" node api/scripts/setup-env.mjs --check || exit 1

say "١/٥ · تشغيل قاعدة البيانات"
if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  docker compose up -d
  printf "بانتظار جاهزية القاعدة"
  for _ in $(seq 1 30); do
    if docker compose exec -T db pg_isready -U mawid -d mawid >/dev/null 2>&1; then
      printf " ✓\n"
      break
    fi
    printf "."
    sleep 1
  done
else
  echo "دوكر غير متاح — شغّل PostgreSQL بنفسك واضبط DATABASE_URL في api/.env"
fi

say "٢/٥ · إعداد الخادم"
cd api
# إنشاء الملف أو تحديث سطرَي المالك — بالـNode كي يعمل على ويندوز أيضاً
OWNER_EMAIL="$OWNER_EMAIL" OWNER_PASSWORD="$OWNER_PASSWORD" OWNER_GIVEN="$OWNER_GIVEN" \
  node scripts/setup-env.mjs
npm install --silent
npm run db:push --silent
npm run db:seed

say "٣/٥ · إعداد لوحات الويب"
cd ../web && npm install --silent

say "٤/٥ · إعداد التطبيق"
cd ../mobile && npm install --silent

say "٥/٥ · جاهز"
# الاعتمادات من api/.env لا من الافتراضات — قد يكون الملف موجوداً من تشغيل سابق
EMAIL=$(grep '^OWNER_EMAIL=' api/.env 2>/dev/null | cut -d'"' -f2)
PASS=$(grep '^OWNER_PASSWORD=' api/.env 2>/dev/null | cut -d'"' -f2)
cat <<DONE

شغّل كلاً في نافذة طرفية مستقلة:

  cd api    && npm run dev     الخادم على ٣٠٠٠
  cd web    && npm run dev     اللوحات على ٣٠٠١
  cd mobile && npm start       التطبيق — امسح رمز QR بتطبيق Expo Go

دخول المالك:  ${EMAIL:-owner@mawid.iq}  /  ${PASS:-MawidOwner2026}
سيُطلب منك تغيير الباسوورد أول دخول.

DONE
