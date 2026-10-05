#!/usr/bin/env bash
#
# ينقل بيانات دكتور صحتي من Render إلى هذا الخادم: القاعدة كاملة، ثم الصور.
#
#   ./import-from-render.sh 'postgresql://…' [https://doctorsehti-api.onrender.com]
#
# الأول «External Database URL» من صفحة قاعدة البيانات في Render (بين علامتي
# اقتباس مفردتين — فيه رموزٌ تفسّرها الصدفة). والثاني عنوان خادم Render القديم:
# منه تُسحب الصور بروابطها العامة، فلا يلزم دخولٌ إلى قرصه.
#
# تكراره آمن: كل تشغيلٍ يأخذ نسخةً جديدة من Render ويضعها مكان ما هنا، والصور
# السليمة لا تُنزَّل مرّتين. فالتشغيل الأول تجربة، والأخير لحظة التحويل.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

render_db="${1:?اكتب رابط قاعدة Render: ./import-from-render.sh 'postgresql://…'}"
old_api="${2:-https://doctorsehti-api.onrender.com}"
old_api="${old_api%/}"
stamp="$(date -u +%Y%m%d-%H%M%S)"
mkdir -p backups
chmod 700 backups
trap 'rm -f backups/*.partial' EXIT

echo "١/٣ · نسخة من قاعدة Render…"
# pg_dump من الإصدار ١٧ يقرأ قواعد الإصدارات قبله، ونسخته يقرؤها خادمنا (١٧ كذلك)
docker run --rm postgres:17-alpine pg_dump "$render_db" -Fc --no-owner --no-acl \
  > "backups/render-$stamp.dump.partial"
mv "backups/render-$stamp.dump.partial" "backups/render-$stamp.dump"

echo "٢/٣ · وضعها مكان القاعدة هنا…"
./restore.sh "backups/render-$stamp.dump"

echo "٣/٣ · الصور من $old_api…"
if ! docker compose exec -T api npm run --silent uploads:pull -- "$old_api"; then
  cat <<EOF

القاعدة انتقلت كاملة، وبعض الصور تعذّر نقلها — القائمة أعلاه. صورةٌ ردّ عليها
الخادم القديم 404 مفقودةٌ هناك أيضاً. ولإعادة محاولة الصور وحدها:
  docker compose exec -T api npm run uploads:pull -- $old_api
EOF
  exit 1
fi

echo
echo "انتقلت البيانات. جرّب الدخول بحساب المالك على اللوحات الجديدة قبل التحويل."
