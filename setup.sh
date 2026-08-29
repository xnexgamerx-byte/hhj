#!/usr/bin/env bash
# تهيئة المشروع من الصفر: قاعدة البيانات، ثم الخادم، ثم الواجهات.
# التشغيل: bash setup.sh
set -euo pipefail

cd "$(dirname "$0")"
say() { printf "\n\033[1;36m%s\033[0m\n" "$1"; }

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
[ -f .env ] || {
  cp .env.example .env
  SECRET=$(openssl rand -base64 48 2>/dev/null || head -c 36 /dev/urandom | base64)
  # حساب المالك: مرّر إيميلك وباسووردك ليصيرا حسابك من أول تشغيل
  #   OWNER_EMAIL=you@example.com OWNER_PASSWORD='...' bash setup.sh
  OWNER_EMAIL="${OWNER_EMAIL:-owner@mawid.iq}"
  OWNER_PASSWORD="${OWNER_PASSWORD:-MawidOwner2026}"
  # sed -i يختلف بين لينكس وماك، فنكتب الملف بدلاً منه
  python3 - "$SECRET" "$OWNER_EMAIL" "$OWNER_PASSWORD" <<'PY'
import sys, pathlib
secret, owner_email, owner_password = sys.argv[1], sys.argv[2], sys.argv[3]
p = pathlib.Path(".env")
lines = []
for line in p.read_text(encoding="utf-8").splitlines():
    if line.startswith("JWT_SECRET="):
        line = f'JWT_SECRET="{secret}"'
    elif line.startswith("DATABASE_URL="):
        line = 'DATABASE_URL="postgresql://mawid:mawid@localhost:5432/mawid?schema=public"'
    elif line.startswith("OWNER_EMAIL="):
        line = f'OWNER_EMAIL="{owner_email}"'
    elif line.startswith("OWNER_PASSWORD="):
        line = f'OWNER_PASSWORD="{owner_password}"'
    lines.append(line)
p.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
  echo "أُنشئ api/.env بسر توقيع عشوائي — حساب المالك: $OWNER_EMAIL"
}
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
