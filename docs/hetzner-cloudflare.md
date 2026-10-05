# الانتقال إلى Cloudflare وHetzner

دليلٌ خطوةً بخطوة لنقل دكتور صحتي من Render:

| الجزء | الآن | بعد الانتقال |
|---|---|---|
| الدومين | — | Cloudflare |
| اللوحات وموقع الحجز (`web/`) | Render | Cloudflare Pages |
| نسخة التطبيق للويب (`mobile/`) | Render | Cloudflare Pages |
| الخادم (`api/`) | Render | Hetzner |
| قاعدة البيانات والصور | Render | Hetzner، على الخادم نفسه |

**Render يبقى يعمل حتى الخطوة الأخيرة.** الجديد يُبنى ويُجرَّب بجانبه، ولا يتحوّل
المستخدمون إلا بعد التأكد. ومن توقّف في منتصف الطريق لم يخسر شيئاً.

في الأمثلة `example.com` مكان دومينك.

## ما يلزمك قبل البدء

- **حساب Cloudflare ودومين:** تشتريه من Cloudflare نفسها، أو من أي مكان ثم تنقل
  خوادم أسمائه (nameservers) إليها.
- **حساب Hetzner Cloud:** قد تطلب إثبات هوية وبطاقة دفع عند التسجيل — تأكد منه أولاً.
- **لوحة Render:** منها تنسخ رابط قاعدة البيانات ومتغيّرَي الواتساب.

## ١. الخادم على Hetzner

١. في Hetzner Cloud: مشروعٌ جديد ← **Add Server**:
   - **Location:** ألمانيا (Nuremberg أو Falkenstein) — الأقرب إلى العراق.
   - **Image:** Ubuntu 24.04.
   - **Type:** أصغر خادم x86 بذاكرة ٤ غيغابايت يكفي للبداية.
   - **SSH key:** أضف مفتاحك؛ أأمن من كلمة سرّ.
   - **Backups:** فعّله. نسخةٌ يومية من الخادم كلّه تُحفظ خارجه، والنسخ الليلية
     التي يجهّزها السكربت على الخادم نفسه فلا تحمي من ضياعه.

٢. ادخل إليه: `ssh root@<عنوان-الخادم>` ثم:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/xnexgamerx-byte/hhj /opt/doctorsehti
bash /opt/doctorsehti/deploy/hetzner/setup.sh
```

يسأل عن عنوان الخادم (`api.example.com`) وبريدك وحساب المالك، ثم يثبّت Docker
والجدار الناري والتحديثات الأمنية التلقائية والنسخ الاحتياطي الليلي، ويشغّل
القاعدة والخادم وCaddy أمامهما. وفي آخره يطبع عنوان الخادم لسجلّ DNS.

٣. في Cloudflare ← **DNS** ← **Add record**:

| Type | Name | IPv4 address | Proxy status |
|---|---|---|---|
| A | `api` | عنوان الخادم | **DNS only** (السحابة رمادية) |

رماديةً لا برتقالية: Caddy يأخذ شهادة HTTPS بنفسه، ويرى عنوان كل مستخدمٍ
الحقيقي — وحدّ المعدّل في الخادم يُحسب به. خلف وسيط Cloudflare يبدو المستخدمون
كلّهم آتين من عناوينها، فيقتسمون حدّاً واحداً.

٤. بعد دقيقة افتح `https://api.example.com/health`. ظهور `{"ok":true}` يعني أن
الشهادة صدرت والخادم جاهز.

٥. انسخ `WHATSAPP_TOKEN` و`WHATSAPP_PHONE_NUMBER_ID` من Render (خدمة
`doctorsehti-api` ← **Environment**) إلى الخادم:

```bash
cd /opt/doctorsehti/deploy/hetzner && nano .env
```

```bash
docker compose up -d
```

## ٢. اللوحات وموقع الحجز على Cloudflare Pages

Cloudflare ← **Workers & Pages** ← **Create** ← **Pages** ← **Connect to Git** ←
المستودع `xnexgamerx-byte/hhj`:

| الإعداد | القيمة |
|---|---|
| Project name | `doctorsehti-web` |
| Production branch | `claude/doctor-booking-app-aary82` |
| Root directory | `web` |
| Build command | `npm run build:static` |
| Build output directory | `out` |
| Environment variables | `NEXT_PUBLIC_API_URL` = `https://api.example.com` · `NODE_VERSION` = `22` |

ثم **Custom domains**: `example.com` و`www.example.com`.

البناء يرفض أن يكمل إن غاب `NEXT_PUBLIC_API_URL` أو لم يبدأ بـ`https://`: العنوان
يُكتب داخل الملفّات، وموقعٌ لا يجد خادمه أسوأ من بناءٍ فاشل. وكل دمجٍ في الفرع
الرئيسي يعيد البناء والنشر وحده.

## ٣. نسخة التطبيق للويب على Cloudflare Pages

مشروعٌ ثانٍ بالطريقة نفسها:

| الإعداد | القيمة |
|---|---|
| Project name | `doctorsehti-app` |
| Production branch | `claude/doctor-booking-app-aary82` |
| Root directory | `mobile` |
| Build command | `npx expo export --platform web` |
| Build output directory | `dist` |
| Environment variables | `EXPO_PUBLIC_API_URL` = `https://api.example.com` · `NODE_VERSION` = `22` |

ثم **Custom domains**: `app.example.com`. التطبيق صفحةٌ واحدة، وCloudflare تخدمها
لكل رابطٍ بداخله تلقائياً.

## ٤. نقل البيانات — تجربة أولى

من Render: صفحة قاعدة البيانات ← **Connections** ← انسخ **External Database URL**.
ثم على الخادم:

```bash
cd /opt/doctorsehti/deploy/hetzner
./import-from-render.sh 'postgresql://…' https://doctorsehti-api.onrender.com
```

- ينسخ قاعدة Render كاملةً ويضعها مكان ما على الخادم، بعد تأكيدٍ منك بـ«نعم».
- يسحب الصور من روابطها العامة على Render، ويتحقق من كل صورةٍ ببصمة محتواها.
- كل تشغيلٍ يبدأ من نسخةٍ جديدة، فتكراره آمن.

ثم جرّب: ادخل `https://example.com/login` بحساب المالك **بباسووردك على Render** —
الحسابات انتقلت كما هي — وتصفّح الأطباء والصور واللافتات، واحجز موعداً تجريبياً من
`https://app.example.com`.

ما يُكتب على Render بعد هذه النسخة لا ينتقل، لذلك تُعاد الخطوة نفسها لحظة التحويل.

## ٥. نسخة APK الجديدة

GitHub ← **Settings** ← **Secrets and variables** ← **Actions** ← **Variables** ←
**New repository variable**: الاسم `API_URL` والقيمة `https://api.example.com`. ثم
**Actions** ← «بناء نسخة أندرويد للتجربة» ← **Run workflow**.

جهّزها ولا توزّعها بعد: من يثبّتها قبل التحويل يكتب على الخادم الجديد، والنقل
الأخير يضع مكان ما كتب.

## ٦. التحويل

في ساعةٍ هادئة — منتصف الليل في بغداد مثلاً:

١. **أوقف الكتابة على Render:** خدمة `doctorsehti-api` ← **Suspend**. يتوقف معها
   التطبيق القديم والمواقع القديمة، فلا يُكتب شيءٌ يضيع. وقاعدة البيانات خدمةٌ
   منفصلة تبقى تعمل، ومنها يُنسخ.

٢. أعد النقل:

```bash
./import-from-render.sh 'postgresql://…' https://doctorsehti-api.onrender.com
```

   الصور سُحبت في التجربة، ولا يلزم إلا ما رُفع بعدها. فلا ترفع صوراً جديدة يوم
   التحويل: خادم Render الموقوف لا يعطيها. وإن ظهرت صورٌ تعذّرت، شغّل خدمة Render
   دقائق (**Resume**) ثم:

```bash
docker compose exec -T api npm run uploads:pull -- https://doctorsehti-api.onrender.com
```

٣. وزّع نسخة APK الجديدة، وأعطِ الجميع عناوين المواقع الجديدة.

٤. أبقِ خدمات Render موقوفةً لا محذوفة أسبوعاً — شبكة أمان. ثم احذفها ومعها
   القاعدة ليتوقف الدفع.

## بعد الانتقال

| ماذا | كيف |
|---|---|
| تحديث الخادم بعد دمج تغيير | `./update.sh` في `deploy/hetzner` — يأخذ نسخة احتياطية أولاً |
| اللوحات ونسخة التطبيق | تُبنى وتُنشر وحدها مع كل دمج |
| النسخ الاحتياطي | كل ليلة ٣:٣٠ بتوقيت بغداد في `deploy/hetzner/backups/`، لأربعة عشر يوماً |
| الإرجاع من نسخة | `./restore.sh backups/db-….dump backups/uploads-….tgz` |
| سجلّ الخادم | `docker compose logs -f api` |
| نسيت باسوورد المالك | اكتب الجديد في `OWNER_PASSWORD` داخل `.env` ثم الأمران أدناه |

```bash
docker compose up -d api
```

```bash
docker compose exec api npm run owner:reset
```

## إن لم يعمل شيء

- **`https://api.example.com/health` لا يفتح:** تأكد أن سجلّ `api` رماديّ ويشير
  إلى عنوان الخادم، ثم انظر `docker compose logs caddy`.
- **اللوحات تقول «تعذّر الاتصال بالخادم»:** إمّا `NEXT_PUBLIC_API_URL` خطأ في
  Cloudflare — صحّحه وأعد البناء (Deployments ← Retry deployment)، وإمّا دومين
  الموقع غائبٌ عن `WEB_ORIGIN` في `.env` — أضفه ثم `docker compose up -d`.
- **بناء Cloudflare يفشل برسالة عن `NEXT_PUBLIC_API_URL`:** المتغيّر غير معيَّن أو
  بلا `https://`.

## لماذا هكذا

- **Docker Compose:** القاعدة والخادم وCaddy في ملفٍّ واحد (`deploy/hetzner/compose.yaml`)،
  والتحديث أمرٌ واحد. ولا منفذ منشوراً إلا لـCaddy: القاعدة والخادم لا يُريان من
  الإنترنت، فلا يصلهما طلبٌ يدّعي عنواناً غير عنوانه.
- **القاعدة على الخادم نفسه:** Hetzner لا تقدّم قاعدةً مُدارة، والبيانات صغيرة.
  وصار النسخ الاحتياطي علينا — لذلك السكربت الليلي وخيار Backups معاً.
- **الصور على قرص الخادم:** الشفرة تكتبها على القرص أصلاً (`UPLOAD_DIR`)، فلم
  يتغيّر فيها سطر.
- **صفحة الطبيب صار رابطها `/doctors/profile?id=…`** بدل `/doctors/<id>`: اللوحات
  ملفّاتٌ ثابتة تُبنى مرّة، والأطباء يُسجَّلون كل يوم بعدها. والروابط القديمة التي
  شاركها المرضى تُحوَّل إلى الجديدة تلقائياً على Render حتى الانتقال.
