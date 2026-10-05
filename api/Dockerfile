# خادم دكتور صحتي في حاوية — يبنيها deploy/hetzner/compose.yaml.
#
# Render لا تستعملها (تشغّل الخادم بـnode مباشرة)، فوجودها لا يغيّر النشر هناك.
FROM node:22-bookworm-slim

# محرّك Prisma يحتاج OpenSSL، والنسخة الخفيفة من دبيان بلا مكتباته
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# الاعتماديات قبل الشفرة: تُعاد فقط حين يتغيّر package-lock لا مع كل تعديل.
# والمخطّط معها لأن ‎prisma generate‎ يجري بعد التثبيت ويحتاجه.
# وtsx وprisma في dependencies أصلاً، فيكفي التثبيت بلا أدوات التطوير
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY . .

# الصور على قرصٍ دائم يُركَّب هنا. المجلّد يُنشأ مملوكاً لـnode قبل التركيب،
# فيرث القرص الجديد ملكيّته ويكتب فيه الخادم بلا صلاحيات root
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node

EXPOSE 3000

# الترحيل قبل الإقلاع، والتعبئة لا تكرّر ما وُجد — الترتيب نفسه على Render.
#
# والخادم بـnode مباشرةً لا بـ‎npm start‎: npm لا يمرّر إشارة الإيقاف إلى
# الخادم، فيخرج هو ويبقى الخادم حتى يُقتل قسراً. جرّبناه: npm خرج والخادم ظلّ
# يجيب. أمّا هكذا فتصله الإشارة نفسها فيغلق الطلبات والقاعدة بهدوء
CMD ["sh", "-c", "npm run db:migrate:deploy && (npm run db:seed || true) && exec node --import tsx src/server.ts"]
