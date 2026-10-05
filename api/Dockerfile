# خادم دكتور صحتي في حاوية — تبنيها Railway من هذا الملف (الخطوات في
# docs/railway-cloudflare.md).
#
# Render لا تستعملها (تشغّل الخادم بـnode مباشرة)، فوجودها لا يغيّر النشر هناك.
FROM node:22-bookworm-slim

# محرّك Prisma يحتاج OpenSSL، والنسخة الخفيفة من دبيان بلا مكتباته
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ما يخصّ الصورة لا النشر، فلا يُكتب في إعدادات Railway ولا يُنسى هناك:
#   UPLOAD_DIR   الصور على قرصٍ دائم يُركَّب هنا (Volume في Railway)
#   TRUST_PROXY  كل طلبٍ يصل عبر حافة Railway، وهي تُسقط X-Forwarded-For الذي
#                يرسله المستخدم وتكتب عنوانه الحقيقي أوّلاً — فتصديقه آمن.
#                وبدونه يبدو المستخدمون كلّهم آتين من عناوين الحافة، فيقتسمون
#                حدّ الدخول ويحجب أوّلُهم البقية. ومن يشغّل الصورة بلا وسيطٍ
#                كهذا أمامها يجعله false، وإلا زوّر كلُّ طالبٍ عنوانه
#   PORT         المنفذ الذي تعطيه Railway أصلاً، فيتطابق التشغيل هنا وهناك
ENV NODE_ENV=production \
  UPLOAD_DIR=/data/uploads \
  TRUST_PROXY=true \
  PORT=8080

# الاعتماديات قبل الشفرة: تُعاد فقط حين يتغيّر package-lock لا مع كل تعديل.
# والمخطّط معها لأن ‎prisma generate‎ يجري بعد التثبيت ويحتاجه.
# وtsx وprisma في dependencies أصلاً، فيكفي التثبيت بلا أدوات التطوير
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY . .

# بصلاحيات root لا مستخدمٍ محدود: Railway تركّب القرص الدائم مملوكاً لـroot،
# فلا يكتب فيه غيره. وحلّ وثائقها نفسه تشغيلُ الحاوية بـroot (‎RAILWAY_RUN_UID=0‎)
EXPOSE 8080
CMD ["sh", "scripts/container-start.sh"]
