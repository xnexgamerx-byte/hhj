"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Card, EmptyState, Loading, Select } from "@/components/ui";
import { SpecialtyArt } from "@/components/SpecialtyArt";
import { api } from "@/lib/api";
import { toArabic } from "@/lib/format";

type Governorate = { id: number; slug: string; nameAr: string };
type Specialty = { id: number; slug: string; nameAr: string; nameEn: string; doctorCount: number };

const GOVERNORATE_KEY = "mawid.governorate";

export default function HomePage() {
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [governorateId, setGovernorateId] = useState<number | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Governorate[]>("/locations/governorates")
      .then((list) => {
        setGovernorates(list);
        // نتذكّر محافظة المستخدم فيفتح التطبيق عليها مباشرة في كل مرة
        const saved = Number(localStorage.getItem(GOVERNORATE_KEY));
        setGovernorateId(saved && list.some((g) => g.id === saved) ? saved : (list[0]?.id ?? null));
      })
      .catch((e) => setError(e.message));
  }, []);

  const loadSpecialties = useCallback((id: number) => {
    setSpecialties(null);
    api
      .get<Specialty[]>(`/specialties/available?governorateId=${id}`)
      .then(setSpecialties)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (governorateId === null) return;
    localStorage.setItem(GOVERNORATE_KEY, String(governorateId));
    loadSpecialties(governorateId);
  }, [governorateId, loadSpecialties]);

  const governorateName = governorates.find((g) => g.id === governorateId)?.nameAr ?? "";

  return (
    <>
      <Header />

      <main className="max-w-6xl mx-auto px-4 pb-20">
        {/* اختيار المحافظة أول ما يراه المستخدم — كل شيء بعده يتبعه */}
        <section className="pt-8 pb-6">
          <h1
            className="text-[26px] sm:text-[32px] font-bold leading-tight text-balance"
            style={{ fontFamily: "var(--font-display)" }}
          >
            احجز موعدك عند طبيبك
          </h1>
          <p className="text-[15px] mt-2 max-w-xl" style={{ color: "var(--muted)" }}>
            أوقات محدّثة من الطبيب نفسه، وحجز مثبّت برقم مرجعي — بلا اتصال ولا انتظار.
          </p>

          <div className="mt-5 max-w-xs">
            <label className="block text-[13px] font-semibold mb-1.5">محافظتك</label>
            <Select
              value={governorateId ?? ""}
              onChange={(e) => setGovernorateId(Number(e.target.value))}
              aria-label="اختر المحافظة"
            >
              {governorates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nameAr}
                </option>
              ))}
            </Select>
          </div>
        </section>

        {error && (
          <Card>
            <p style={{ color: "var(--danger)" }}>{error}</p>
          </Card>
        )}

        <section>
          <h2 className="text-[17px] font-bold mb-3" style={{ fontFamily: "var(--font-display)" }}>
            التخصصات في {governorateName}
          </h2>

          {specialties === null && !error && <Loading />}

          {specialties?.length === 0 && (
            <Card>
              <EmptyState
                title="لا يوجد أطباء في هذه المحافظة بعد"
                hint="جرّب محافظة أخرى — نضيف أطباء جدداً باستمرار."
              />
            </Card>
          )}

          {specialties && specialties.length > 0 && (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {specialties.map((specialty) => (
                <Link
                  key={specialty.id}
                  href={`/doctors?governorateId=${governorateId}&specialtyId=${specialty.id}`}
                  className="group rounded-[14px] p-4 transition-shadow hover:shadow-[var(--shadow)]"
                  style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
                >
                  <span
                    className="grid place-items-center w-14 h-14 rounded-[16px] mb-3"
                    style={{ background: "var(--art-tile)" }}
                    aria-hidden
                  >
                    <SpecialtyArt slug={specialty.slug} size={42} />
                  </span>
                  <span className="block text-[15px] font-semibold leading-snug">{specialty.nameAr}</span>
                  <span className="block text-[12.5px] mt-1 tnum" style={{ color: "var(--muted)" }}>
                    {toArabic(specialty.doctorCount)} طبيب
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <Link
            href={`/doctors?governorateId=${governorateId}`}
            className="block rounded-[14px] p-5 text-center text-[14.5px] font-semibold"
            style={{ background: "var(--surface-2)", border: "1px dashed var(--line-strong)", color: "var(--primary)" }}
          >
            عرض كل الأطباء في {governorateName}
          </Link>
        </section>
      </main>
    </>
  );
}
