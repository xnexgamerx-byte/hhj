"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Badge, Card, EmptyState, Input, Loading, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { countLabel, COUNTS, formatFee, toArabic } from "@/lib/format";

type Doctor = {
  id: string;
  title: string;
  fullName: string;
  yearsOfExperience: number | null;
  specialties: string[];
  practices: {
    id: string;
    feeAmount: number;
    bookingMode: "SLOT" | "QUEUE";
    clinicName: string;
    landmark: string | null;
    governorate: string;
    district: string;
  }[];
  nextAvailable: { date: string; weekdayName: string; freeCount: number } | null;
};

type Specialty = { id: number; nameAr: string; doctorCount: number };
type Governorate = { id: number; nameAr: string };

function DoctorsInner() {
  const params = useSearchParams();
  const router = useRouter();

  const governorateId = params.get("governorateId") ?? "";
  const specialtyId = params.get("specialtyId") ?? "";

  const [doctors, setDoctors] = useState<Doctor[] | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Governorate[]>("/locations/governorates").then(setGovernorates).catch(() => {});
  }, []);

  useEffect(() => {
    if (!governorateId) return;
    api
      .get<Specialty[]>(`/specialties/available?governorateId=${governorateId}`)
      .then(setSpecialties)
      .catch(() => {});
  }, [governorateId]);

  useEffect(() => {
    setDoctors(null);
    const search = new URLSearchParams();
    if (governorateId) search.set("governorateId", governorateId);
    if (specialtyId) search.set("specialtyId", specialtyId);
    if (query.trim()) search.set("q", query.trim());

    // مهلة قصيرة حتى لا نرسل طلباً مع كل حرف
    const timer = setTimeout(() => {
      api
        .get<Doctor[]>(`/doctors?${search}`)
        .then(setDoctors)
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [governorateId, specialtyId, query]);

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/doctors?${next}`);
  }

  return (
    <>
      <Header subtitle="الأطباء" />

      <main className="max-w-6xl mx-auto px-4 pb-20 pt-6">
        <div className="grid gap-3 sm:grid-cols-3 mb-6">
          <div>
            <label className="block text-[13px] font-semibold mb-1.5">المحافظة</label>
            <Select value={governorateId} onChange={(e) => updateFilter("governorateId", e.target.value)}>
              <option value="">كل المحافظات</option>
              {governorates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nameAr}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-[13px] font-semibold mb-1.5">التخصص</label>
            <Select value={specialtyId} onChange={(e) => updateFilter("specialtyId", e.target.value)}>
              <option value="">كل التخصصات</option>
              {specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameAr} ({toArabic(s.doctorCount)})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-[13px] font-semibold mb-1.5">بحث بالاسم</label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="اسم الطبيب أو التخصص"
              type="search"
            />
          </div>
        </div>

        {error && (
          <Card>
            <p style={{ color: "var(--danger)" }}>{error}</p>
          </Card>
        )}

        {doctors === null && !error && <Loading label="جارٍ البحث…" />}

        {doctors?.length === 0 && (
          <Card>
            <EmptyState
              title="لا يوجد طبيب مطابق"
              hint="جرّب توسيع البحث: محافظة أخرى، أو تخصصاً مختلفاً، أو امسح كلمة البحث."
            />
          </Card>
        )}

        <div className="grid gap-3">
          {doctors?.map((doctor) => {
            const practice = doctor.practices[0];
            return (
              <Link
                key={doctor.id}
                href={`/doctors/${doctor.id}`}
                className="block rounded-[14px] p-4 transition-shadow hover:shadow-[var(--shadow)]"
                style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
              >
                <div className="flex gap-4">
                  <span
                    className="grid place-items-center w-12 h-12 rounded-full text-[17px] font-bold shrink-0"
                    style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
                    aria-hidden
                  >
                    {doctor.fullName.charAt(0)}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-[16px] font-bold leading-snug">
                          {doctor.title} {doctor.fullName}
                        </p>
                        <p className="text-[13.5px] mt-0.5" style={{ color: "var(--primary)" }}>
                          {doctor.specialties.join(" · ")}
                        </p>
                      </div>
                      {practice && (
                        <span className="text-[14px] font-bold tnum shrink-0">{formatFee(practice.feeAmount)}</span>
                      )}
                    </div>

                    {practice && (
                      <p className="text-[13px] mt-2 leading-relaxed" style={{ color: "var(--muted)" }}>
                        {practice.clinicName} — {practice.governorate}، {practice.district}
                        {practice.landmark && <span className="block">{practice.landmark}</span>}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      {doctor.nextAvailable ? (
                        <Badge tone="ok">
                          أقرب موعد: {doctor.nextAvailable.weekdayName} —{" "}
                          {countLabel(doctor.nextAvailable.freeCount, COUNTS.seat)}
                        </Badge>
                      ) : (
                        <Badge tone="muted">لا توجد أوقات متاحة حالياً</Badge>
                      )}
                      {practice?.bookingMode === "QUEUE" && <Badge tone="accent">نظام أدوار</Badge>}
                      {doctor.yearsOfExperience && (
                        <Badge tone="muted">خبرة {countLabel(doctor.yearsOfExperience, COUNTS.year)}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}

export default function DoctorsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DoctorsInner />
    </Suspense>
  );
}
