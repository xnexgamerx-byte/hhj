#!/usr/bin/env bash
#
# يرجع القاعدة — والصور إن أُعطيت — من نسخة:
#
#   ./restore.sh backups/db-20261005-003000.dump [backups/uploads-20261005-003000.tgz]
#
# يمحو القاعدة الحالية كاملةً ويضع النسخة مكانها، فيطلب تأكيداً صريحاً.
# وقبل المحو يأخذ نسخةً مما هنا: الإرجاع نفسه يمكن التراجع عنه.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

dump="${1:?اكتب مسار نسخة القاعدة، مثل: ./restore.sh backups/db-20261005-003000.dump}"
uploads="${2:-}"
[ -f "$dump" ] || { echo "لا يوجد ملف: $dump" >&2; exit 1; }
[ -z "$uploads" ] || [ -f "$uploads" ] || { echo "لا يوجد ملف: $uploads" >&2; exit 1; }

read -r -p "سيُمحى كل ما في القاعدة الآن ويحلّ محلّه $(basename "$dump"). اكتب «نعم» للمتابعة: " answer
[ "$answer" = "نعم" ] || { echo "أُلغي — لم يُمسّ شيء"; exit 1; }

./backup.sh

# الخادم يُوقف أوّلاً: لا أحد يكتب في قاعدةٍ تُمحى
docker compose stop api
docker compose exec -T db dropdb -U doctorsehti --if-exists --force doctorsehti
docker compose exec -T db createdb -U doctorsehti doctorsehti
docker compose exec -T db pg_restore -U doctorsehti -d doctorsehti --no-owner --no-acl --exit-on-error < "$dump"

if [ -n "$uploads" ]; then
  docker compose run --rm --no-deps -T --entrypoint tar api -C /data/uploads -xzf - < "$uploads"
fi

# عند إقلاعه يرحّل القاعدة إلى آخر بنية إن كانت النسخة أقدم من الشفرة
docker compose start api
echo "أُرجعت النسخة، والخادم يعمل من جديد."
