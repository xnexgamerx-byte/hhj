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
OWNER_EMAIL="${OWNER_EMAIL:-owner@doctorsehti.iq}"
OWNER_PASSWORD="${OWNER_PASSWORD:-DoctorsehtiOwner2026}"

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

# نلتقط الاعتمادات هنا لا في آخر السكربت: هناك تكون الدفّة في mobile/ فيفشل
# grep، ومع set -euo pipefail يموت السكربت صامتاً قبل طباعة الملخّص.
# و|| true تحمي لو تغيّرت صيغة الملف.
SHOW_EMAIL=$(grep '^OWNER_EMAIL=' .env | cut -d'"' -f2 || true)
SHOW_PASS=$(grep '^OWNER_PASSWORD=' .env | cut -d'"' -f2 || true)
npm install --silent
npm run db:push --silent
npm run db:seed

# هل يفتح باسوورد .env حسابَ المالك فعلاً؟ عند إعادة التشغيل بعد تغيير
# الباسوورد من الواجهة يصير الملفّ يقول شيئاً والقاعدةُ شيئاً آخر — فلا نطبع
# اعتماداتٍ لا تعمل، بل نطبع طريقة إصلاحها.
OWNER_CHECK=0
npm run --silent owner:reset -- --check >/dev/null 2>&1 || OWNER_CHECK=$?
case $OWNER_CHECK in
  0) OWNER_NOTE="دخول المالك:  ${SHOW_EMAIL}  /  ${SHOW_PASS}
سيُطلب منك تغيير الباسوورد أول دخول." ;;
  2) OWNER_NOTE="دخول المالك:  ${SHOW_EMAIL}  /  ${SHOW_PASS}" ;;
  *) OWNER_NOTE="دخول المالك:  ${SHOW_EMAIL}
باسوورد api/.env لم يعد يفتح الحساب — غُيّر من الواجهة على الأرجح.
لإعادته إلى ما في الملف:  cd api && npm run owner:reset" ;;
esac

say "٣/٥ · إعداد لوحات الويب"
cd ../web && npm install --silent

say "٤/٥ · إعداد التطبيق"
cd ../mobile && npm install --silent

say "٥/٥ · جاهز"
cat <<DONE

شغّل كلاً في نافذة طرفية مستقلة:

  cd api    && npm run dev     الخادم على ٣٠٠٠
  cd web    && npm run dev     اللوحات على ٣٠٠١
  cd mobile && npm start       التطبيق — امسح رمز QR بتطبيق Expo Go

${OWNER_NOTE}

DONE
