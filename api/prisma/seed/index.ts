/**
 * تعبئة البيانات المرجعية: الدولة والمحافظات والأقضية والأحياء والتخصصات.
 *
 * التشغيل: npm run db:seed
 * آمن للتكرار — يستخدم upsert، فإعادة تشغيله لا تُنشئ صفوفاً مكررة
 * ولا تمسّ ما عدّلته الإدارة من إحداثيات أو تفعيل/تعطيل.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/lib/password.js";

const here = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

type AreaSeed = { nameAr: string; nameEn?: string };
type DistrictSeed = { slug: string; nameAr: string; nameEn: string; areas: AreaSeed[] };
type GovernorateSeed = {
  slug: string;
  nameAr: string;
  nameEn: string;
  centerLat: number;
  centerLng: number;
  sortOrder: number;
  districts: DistrictSeed[];
};
type LocationsFile = {
  country: { code: string; nameAr: string; nameEn: string; dialCode: string; timezone: string };
  governorates: GovernorateSeed[];
};
type SpecialtySeed = { slug: string; nameAr: string; nameEn: string; aliases: string[] };

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(here, "data", name), "utf-8")) as T;
}

async function seedLocations() {
  const { country, governorates } = readJson<LocationsFile>("iraq-locations.json");

  const savedCountry = await prisma.country.upsert({
    where: { code: country.code },
    update: { nameAr: country.nameAr, nameEn: country.nameEn, dialCode: country.dialCode, timezone: country.timezone },
    create: country,
  });

  let districtCount = 0;
  let areaCount = 0;

  for (const gov of governorates) {
    const savedGov = await prisma.governorate.upsert({
      where: { slug: gov.slug },
      update: {
        nameAr: gov.nameAr,
        nameEn: gov.nameEn,
        centerLat: gov.centerLat,
        centerLng: gov.centerLng,
        sortOrder: gov.sortOrder,
      },
      create: {
        countryId: savedCountry.id,
        slug: gov.slug,
        nameAr: gov.nameAr,
        nameEn: gov.nameEn,
        centerLat: gov.centerLat,
        centerLng: gov.centerLng,
        sortOrder: gov.sortOrder,
      },
    });

    for (const district of gov.districts) {
      const savedDistrict = await prisma.district.upsert({
        where: { governorateId_slug: { governorateId: savedGov.id, slug: district.slug } },
        update: { nameAr: district.nameAr, nameEn: district.nameEn },
        create: {
          governorateId: savedGov.id,
          slug: district.slug,
          nameAr: district.nameAr,
          nameEn: district.nameEn,
        },
      });
      districtCount++;

      // الأحياء بلا slug فريد، فنطابق بالاسم داخل القضاء الواحد
      for (const area of district.areas) {
        const existing = await prisma.area.findFirst({
          where: { districtId: savedDistrict.id, nameAr: area.nameAr },
          select: { id: true },
        });
        if (existing) {
          await prisma.area.update({ where: { id: existing.id }, data: { nameEn: area.nameEn ?? null } });
        } else {
          await prisma.area.create({
            data: { districtId: savedDistrict.id, nameAr: area.nameAr, nameEn: area.nameEn ?? null },
          });
        }
        areaCount++;
      }
    }
  }

  console.log(`  المحافظات: ${governorates.length}`);
  console.log(`  الأقضية:   ${districtCount}`);
  console.log(`  الأحياء:   ${areaCount}`);
}

async function seedSpecialties() {
  const specialties = readJson<SpecialtySeed[]>("specialties.json");

  for (const [index, specialty] of specialties.entries()) {
    await prisma.specialty.upsert({
      where: { slug: specialty.slug },
      update: {
        nameAr: specialty.nameAr,
        nameEn: specialty.nameEn,
        aliases: specialty.aliases,
        sortOrder: index + 1,
      },
      create: {
        slug: specialty.slug,
        nameAr: specialty.nameAr,
        nameEn: specialty.nameEn,
        aliases: specialty.aliases,
        sortOrder: index + 1,
      },
    });
  }

  console.log(`  التخصصات:  ${specialties.length}`);
}

/**
 * حساب المالك الأول. بدونه لا يستطيع أحد الدخول لتسجيل الأطباء،
 * لأن المنصة لا تسمح بالتسجيل الذاتي لأي دور غير المريض.
 */
async function seedOwner() {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD;

  if (!email || !password) {
    console.log("  المالك:     تخطّي — عيّن OWNER_EMAIL وOWNER_PASSWORD لإنشائه");
    return;
  }
  if (password.length < 10) {
    throw new Error("OWNER_PASSWORD يجب أن يكون ١٠ خانات على الأقل");
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    console.log(`  المالك:     موجود مسبقاً (${email}) — لم يُمسّ باسووردهُ`);
    console.log(`              إن لم يعد باسوورد .env يفتحه، شغّل: npm run owner:reset`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      fullName: process.env.OWNER_NAME?.trim() || "مالك المنصة",
      role: "OWNER",
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    },
  });
  console.log(`  المالك:     أُنشئ (${email}) — غيّر الباسوورد أول دخول`);
}

async function main() {
  console.log("تعبئة البيانات المرجعية…");
  await seedLocations();
  await seedSpecialties();
  await seedOwner();
  console.log("تمت التعبئة.");
}

main()
  .catch((error) => {
    console.error("فشلت التعبئة:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
