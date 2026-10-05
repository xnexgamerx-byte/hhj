#!/usr/bin/env bash
#
# نسخة احتياطية: القاعدة كاملة والصور، في ‎backups/‎ بجانب هذا الملف.
# يشغّله cron كل ليلة (setup.sh)، وupdate.sh قبل كل تحديث، وrestore.sh قبل كل إرجاع.
#
# يُبقي آخر أربعة عشر يوماً. وهذه النسخ على الخادم نفسه، فلا تحمي من ضياعه
# كلّه — لذلك فعّل «Backups» من لوحة Hetzner أيضاً (انظر الدليل).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

KEEP_DAYS="${KEEP_DAYS:-14}"
stamp="$(date -u +%Y%m%d-%H%M%S)"
mkdir -p backups
chmod 700 backups
# الكتابة إلى ‎.partial‎ ثم إعادة التسمية: نسخةٌ انقطعت في منتصفها لا تبدو سليمة
trap 'rm -f backups/*.partial' EXIT

docker compose exec -T db pg_dump -U doctorsehti -Fc doctorsehti > "backups/db-$stamp.dump.partial"
mv "backups/db-$stamp.dump.partial" "backups/db-$stamp.dump"

# حاويةٌ مؤقّتة على قرص الصور لا ‎exec‎ في الخادم: النسخة تُؤخذ ولو كان الخادم
# متوقّفاً أو يتعثّر عند الإقلاع — وهي ساعةُ الحاجة إليها
docker compose run --rm --no-deps -T --entrypoint tar api -C /data/uploads -czf - . \
  > "backups/uploads-$stamp.tgz.partial"
mv "backups/uploads-$stamp.tgz.partial" "backups/uploads-$stamp.tgz"

find backups -maxdepth 1 \( -name 'db-*.dump' -o -name 'uploads-*.tgz' \) -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) نسخة احتياطية: backups/db-$stamp.dump و backups/uploads-$stamp.tgz"
