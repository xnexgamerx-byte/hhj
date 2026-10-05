#!/usr/bin/env bash
#
# ينزّل آخر نسخة من الفرع الرئيسي ويعيد بناء الخادم وتشغيله:
#
#   ./update.sh
#
# القاعدة والصور على أقراصها لا تُمسّ. ونسخةٌ احتياطية قبل كل تحديث: الخادم
# يرحّل القاعدة عند إقلاعه، وترحيلٌ فاشل بلا نسخةٍ قبله لا رجعة منه.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

./backup.sh
git -C ../.. pull --ff-only
# أحدث إصدارٍ فرعي من القاعدة وCaddy وأساس الخادم: إصلاحات أمنية تصل مع كل
# تحديث. والإصدار الرئيسي ثابت (postgres:17) — ترقيته ترحيلٌ له خطواته
docker compose pull db caddy
docker compose build --pull api
docker compose up -d
docker image prune -f >/dev/null
docker compose ps
