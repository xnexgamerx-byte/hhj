# shellcheck shell=bash
# ‎$DB_URL‎ بين علامتين مفردتين عمداً في كل أمر: يتوسّع داخل حاوية postgres لا هنا
# shellcheck disable=SC2016

# أدوات Postgres لمهامّ GitHub Actions: نقل القاعدة (migrate-db.yml)، ونسخها
# الاحتياطي (backup-db.yml)، وإرجاعها (restore-db.yml). تُحمَّل في كل خطوة:
#
#   source .github/scripts/pg.sh
#
# الأدوات من صور postgres الرسمية بالإصدار المطلوب، والرابط يمرّ إليها عبر
# البيئة لا سطر الأوامر. والمستودع عامّ وسجلّ كل تشغيلٍ يقرؤه أيّ أحد، فلا
# يُطبع هنا شيءٌ من البيانات: لا صفوف ولا أعداد، والأخطاء مختصرة بلا القيم
# التي قد تحملها.

# check_url <اسم السرّ> <الرابط>: يرفض الغائب والمشوَّه والداخليّ، ويحجب العنوان
# من السجلّ — رسائل الأخطاء تذكره
check_url() {
  local secret=$1 url=$2 host
  if [ -z "$url" ]; then
    echo "::error::السرّ $secret غير معيَّن — أضفه من Settings ← Secrets and variables ← Actions"
    return 1
  fi
  case "$url" in
    postgres://*@* | postgresql://*@*) ;;
    *)
      echo "::error::$secret ليس رابط قاعدة بيانات: يبدأ بـpostgresql:// وفيه @"
      return 1
      ;;
  esac
  host=${url##*@}
  host=${host%%[:/?]*}
  echo "::add-mask::$host"
  # الرابطان الداخليان لا يصلهما إلا ما يعمل داخل منصّتهما
  case "$host" in
    *.railway.internal)
      echo "::error::$secret رابط Railway الداخلي — انسخ DATABASE_PUBLIC_URL بدله"
      return 1
      ;;
    *.*) ;;
    *)
      echo "::error::$secret رابط Render الداخلي — انسخ External Database URL بدله"
      return 1
      ;;
  esac
}

# pg_run <الإصدار> <الرابط> <أمر sh> [معاملات…]: أمرٌ في صورة postgres بالإصدار
# المطلوب، والرابط في ‎$DB_URL‎ داخلها
pg_run() {
  local major=$1 url=$2 script=$3
  shift 3
  DB_URL=$url docker run --rm -i -e DB_URL "postgres:$major-alpine" sh -c "$script" sh "$@"
}

# pg_major <الرابط>: الإصدار الرئيسي لخادم القاعدة، من ‎server_version_num‎ (‏180001 ← 18)
pg_major() {
  pg_run 18 "$1" 'exec psql -X -At -v ON_ERROR_STOP=1 -d "$DB_URL" -c "show server_version_num"' < /dev/null \
    | awk '{ print int($1 / 10000) }'
}

# pg_dump_public <الإصدار> <الرابط>: مخطّط public كاملاً — فيه جداول التطبيق
# كلّها — نصّاً SQL على المخرج. بلا مالكين ولا صلاحيات: القاعدة الهدف لها
# مستخدمها. ولا إحصاءات المحسِّن (يعرفها الإصدار ١٨ فما فوق): تُحسب من جديد بعد الإحلال
pg_dump_public() {
  local major=$1 url=$2 extra=()
  if [ "$major" -ge 18 ]; then extra+=(--no-statistics); fi
  pg_run "$major" "$url" \
    'exec pg_dump -d "$DB_URL" --schema=public --no-owner --no-acl --no-comments --no-publications --no-subscriptions "$@"' \
    "${extra[@]}" < /dev/null
}

# pg_replace <الإصدار> <الرابط> <ملف SQL>: يمحو مخطّط public ويضع الملف مكانه
# في معاملةٍ واحدة (‎-1‎) تقف عند أول خطأ — إمّا كلّه وإمّا القاعدة كما كانت.
# والمخرجات إلى العدم لأنها أعداد صفوف
pg_replace() {
  local major=$1 url=$2 file=$3 create='CREATE SCHEMA public;'
  # النسخة تنشئ المخطّط بنفسها حين يُطلب بالاسم. وإن لم تفعل في إصدارٍ ما
  # أُنشئ هنا، فلا يتوقف الإحلال على ذلك
  if grep -qx 'CREATE SCHEMA public;' "$file"; then create=''; fi
  {
    echo 'SET client_min_messages = warning;'
    echo 'DROP SCHEMA IF EXISTS public CASCADE;'
    echo "$create"
    cat "$file"
    echo 'ANALYZE;'
  } | pg_run "$major" "$url" 'exec psql -X -q -1 -v ON_ERROR_STOP=1 -v VERBOSITY=terse -d "$DB_URL" -f -' > /dev/null
}

# pg_counts <الإصدار> <الرابط>: سطرٌ «جدول عدد» لكل جدولٍ في public، للمقارنة
# لا للطباعة. استعلامٌ يكتب استعلاماً لكل جدول، و‎\gexec‎ ينفّذها واحداً واحداً
pg_counts() {
  pg_run "$1" "$2" 'exec psql -X -At -v ON_ERROR_STOP=1 -d "$DB_URL" -f -' <<'SQL'
select format('select %L || '' '' || count(*) from public.%I', table_name, table_name)
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name
\gexec
SQL
}

# pg_uploads <الإصدار> <الرابط>: كل مسار صورةٍ مرفوعة (‎/uploads/…‎) في أي عمودٍ
# نصّيٍّ من القاعدة، مرّةً واحدة. يبحث في الأعمدة كلّها لا في قائمةٍ ثابتة:
# عمود صورٍ يُضاف لاحقاً يدخل النسخ وحده
pg_uploads() {
  pg_run "$1" "$2" 'exec psql -X -At -v ON_ERROR_STOP=1 -d "$DB_URL" -f -' <<'SQL' | sort -u
select format('select %I from public.%I where %I like ''/uploads/%%''', column_name, table_name, column_name)
from information_schema.columns
where table_schema = 'public' and data_type in ('text', 'character varying')
\gexec
SQL
}

# check_passphrase: كلمة سرّ النسخ موجودةٌ وطويلة بما يكفي — النسخ تُرفع ملفّاتٍ
# ينزّلها أيّ أحد، وكلمة السرّ وحدها تحميها
check_passphrase() {
  if [ -z "${PASSPHRASE:-}" ]; then
    echo "::error::السرّ BACKUP_PASSPHRASE غير معيَّن — أضفه من Settings ← Secrets and variables ← Actions"
    return 1
  fi
  if [ "${#PASSPHRASE}" -lt 32 ]; then
    echo "::error::BACKUP_PASSPHRASE أقصر من ٣٢ خانة — اجعلها أطول: هي وحدها تحمي النسخ"
    return 1
  fi
}

# encrypt / decrypt: المدخل إلى المخرج، بـAES-256 وكلمة السرّ في ‎$PASSPHRASE‎.
# وكلمة السرّ تمرّ عبر واصفٍ مستقلّ (3) لا سطر الأوامر
encrypt() {
  gpg --batch --quiet --yes --pinentry-mode loopback --passphrase-fd 3 \
    --symmetric --cipher-algo AES256 --compress-algo none 3<<< "$PASSPHRASE"
}
decrypt() {
  gpg --batch --quiet --yes --pinentry-mode loopback --passphrase-fd 3 --decrypt 3<<< "$PASSPHRASE"
}
