#!/usr/bin/env bash
#
# يجهّز خادم Hetzner جديداً (Ubuntu 24.04) ويشغّل عليه دكتور صحتي — مرّةً واحدة:
#
#   apt-get update && apt-get install -y git
#   git clone https://github.com/xnexgamerx-byte/hhj /opt/doctorsehti
#   bash /opt/doctorsehti/deploy/hetzner/setup.sh
#
# يسأل عن عنوان الخادم وبريدك، ويولّد الأسرار، ويثبّت Docker والجدار الناري
# والنسخ الاحتياطي الليلي. وتكراره آمن: ‎.env‎ القائم لا يُمسّ ولا تُعاد أسراره —
# كلمة سرٍّ جديدة لقاعدةٍ قائمة تقطع الخادم عنها.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

say() { printf '\n\033[1;32m%s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "شغّله بصلاحية root: sudo bash $0"
# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || die "هذا السكربت لـUbuntu ‏24.04، والنظام هنا: ${PRETTY_NAME:-غير معروف}"

# يكتب القيمة في سطرها من .env
set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" == "$key="* ]]; then printf '%s=%s\n' "$key" "$value"; else printf '%s\n' "$line"; fi
  done < .env > "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
}

say "١/٥ · الحزم: Docker والجدار الناري والتحديثات الأمنية التلقائية"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q docker.io docker-compose-v2 git ufw unattended-upgrades openssl
systemctl enable --now docker

say "٢/٥ · ذاكرة احتياطية (swap) — بناء الخادم يحتاجها على الخوادم الصغيرة"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "٣/٥ · الجدار الناري: SSH وHTTP وHTTPS وحدها"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null

say "٤/٥ · الإعدادات"
if [ -f .env ]; then
  echo ".env موجود — يبقى كما هو"
else
  read -r -p "عنوان الخادم (مثل api.example.com): " api_domain
  [[ "$api_domain" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "عنوانٌ غير صالح: $api_domain"
  read -r -p "بريدك (تراسلك عليه Let's Encrypt بشأن شهادة HTTPS): " acme_email
  base="${api_domain#api.}"
  default_origins="https://$base,https://www.$base,https://app.$base"
  read -r -p "مواقع اللوحات [$default_origins]: " origins
  read -r -p "إيميل المالك: " owner_email
  read -r -s -p "باسوورد المالك، عشرة أحرف فأكثر (لا يُستعمل إن نقلت البيانات من Render): " owner_password
  echo
  [ "${#owner_password}" -ge 10 ] || die "الباسوورد ${#owner_password} أحرف، والمطلوب عشرة على الأقل"
  # ما يكتبه المستخدم يُحفظ بين علامتي اقتباس مفردتين: Docker يقرؤه حرفياً فلا
  # يفسّر فيه $ ولا # ولا المسافات. والعلامة المفردة نفسها وحدها لا تُحفظ هكذا
  for value in "$acme_email" "$owner_email" "$owner_password"; do
    [[ "$value" != *"'"* ]] || die "علامة الاقتباس المفردة (') لا تُقبل هنا — اختر قيمةً بدونها"
  done

  cp .env.example .env
  chmod 600 .env
  set_env API_DOMAIN "$api_domain"
  set_env ACME_EMAIL "'$acme_email'"
  set_env WEB_ORIGIN "${origins:-$default_origins}"
  set_env OWNER_EMAIL "'$owner_email'"
  set_env OWNER_PASSWORD "'$owner_password'"
  # ست عشرية: تدخل رابط القاعدة كما هي بلا ترميز، و٤٨ بايتاً تتجاوز حدّ الـ٣٢ خانة
  set_env DB_PASSWORD "$(openssl rand -hex 24)"
  set_env JWT_SECRET "$(openssl rand -hex 48)"
  echo "كُتب .env — وأسراره مولّدة هنا ولا تظهر في أي مكان آخر"
fi

say "٥/٥ · البناء والتشغيل — أول مرّة تأخذ بضع دقائق"
docker compose up -d --build

# النسخ الاحتياطي ٠٠:٣٠ بالتوقيت العالمي — ٣:٣٠ فجراً في بغداد، أهدأ ساعة
printf '30 0 * * * root %s/backup.sh >> /var/log/doctorsehti-backup.log 2>&1\n' "$HERE" > /etc/cron.d/doctorsehti-backup
chmod 644 /etc/cron.d/doctorsehti-backup

domain="$(grep '^API_DOMAIN=' .env | cut -d= -f2-)"
ip="$(ip -4 route get 1.1.1.1 | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}')"
say "الخادم يعمل."
cat <<EOF

الخطوة التالية في Cloudflare ← DNS:
  سجلّ A   الاسم: ${domain%%.*}   القيمة: ${ip}   ‏Proxy status: DNS only (رمادية)

بعد دقيقة من إضافته افتح:  https://${domain}/health
فإن ظهر {"ok":true} فالشهادة صدرت والخادم جاهز.

نقل البيانات من Render:   ./import-from-render.sh  (انظر الدليل)
تحديث الخادم لاحقاً:      ./update.sh
EOF
