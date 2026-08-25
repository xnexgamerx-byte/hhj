"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Alert, Badge, Button, Card, EmptyState, Loading } from "@/components/ui";
import { api, getSession } from "@/lib/api";
import { formatClock, formatDay, formatFee, STATUS_LABELS, toArabic } from "@/lib/format";

type Booking = {
  id: string;
  reference: string;
  status: string;
  bookingMode: "SLOT" | "QUEUE";
  queueNumber: number;
  slotStart: string;
  sessionStart: string;
  sessionEnd: string;
  isUpcoming: boolean;
  patientName: string;
  doctorName: string;
  clinicName: string;
  landmark: string | null;
  clinicPhone: string | null;
  feeAmount: number;
};

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<Booking[]>("/me/bookings")
      .then(setBookings)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!getSession()) {
      setError("سجّل الدخول لعرض حجوزاتك");
      setBookings([]);
      return;
    }
    load();
  }, [load]);

  async function cancel(id: string) {
    if (!confirm("هل تريد إلغاء هذا الحجز؟")) return;
    setCancelling(id);
    try {
      await api.post(`/bookings/${id}/cancel`, {});
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCancelling(null);
    }
  }

  const upcoming = bookings?.filter((b) => b.isUpcoming) ?? [];
  const past = bookings?.filter((b) => !b.isUpcoming) ?? [];

  return (
    <>
      <Header subtitle="حجوزاتي" />
      <main className="max-w-2xl mx-auto px-4 pb-20 pt-6">
        {error && (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        )}

        {bookings === null && <Loading />}

        {bookings?.length === 0 && !error && (
          <Card>
            <EmptyState
              title="لا توجد حجوزات بعد"
              hint="ابحث عن طبيب في محافظتك واحجز موعدك."
              action={
                <Link href="/">
                  <Button>ابحث عن طبيب</Button>
                </Link>
              }
            />
          </Card>
        )}

        {upcoming.length > 0 && (
          <section className="mb-8">
            <h2 className="text-[17px] font-bold mb-3" style={{ fontFamily: "var(--font-display)" }}>
              المواعيد القادمة
            </h2>
            <div className="grid gap-3">
              {upcoming.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  onCancel={() => cancel(booking.id)}
                  cancelling={cancelling === booking.id}
                />
              ))}
            </div>
          </section>
        )}

        {past.length > 0 && (
          <section>
            <h2 className="text-[17px] font-bold mb-3" style={{ fontFamily: "var(--font-display)" }}>
              السابقة
            </h2>
            <div className="grid gap-3">
              {past.map((booking) => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

function BookingCard({
  booking,
  onCancel,
  cancelling,
}: {
  booking: Booking;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const status = STATUS_LABELS[booking.status] ?? { label: booking.status, tone: "muted" as const };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[15.5px] font-bold">{booking.doctorName}</p>
          <p className="text-[13.5px] mt-0.5" style={{ color: "var(--muted)" }}>
            {booking.clinicName}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div
        className="mt-3 pt-3 grid gap-1.5 text-[14px]"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <p className="font-semibold tnum" style={{ color: "var(--primary)" }}>
          {formatDay(booking.sessionStart.slice(0, 10))}
          {" — "}
          {booking.bookingMode === "SLOT"
            ? formatClock(booking.slotStart)
            : `الدور ${toArabic(booking.queueNumber)} بين ${formatClock(booking.sessionStart)} و${formatClock(booking.sessionEnd)}`}
        </p>
        {booking.patientName && (
          <p className="text-[13px]" style={{ color: "var(--muted)" }}>
            المريض: {booking.patientName}
          </p>
        )}
        {booking.landmark && (
          <p className="text-[13px]" style={{ color: "var(--muted)" }}>
            {booking.landmark}
          </p>
        )}
        <div className="flex items-center gap-3 flex-wrap mt-1">
          <span className="text-[13px] font-bold tnum">{booking.reference}</span>
          <span className="text-[13px] tnum" style={{ color: "var(--muted)" }}>
            {formatFee(booking.feeAmount)}
          </span>
        </div>
      </div>

      {(onCancel || booking.clinicPhone) && (
        <div className="flex gap-2 mt-3">
          {booking.clinicPhone && (
            <a href={`tel:${booking.clinicPhone}`} className="flex-1">
              <Button variant="outline" size="sm" full>
                اتصال بالعيادة
              </Button>
            </a>
          )}
          {onCancel && (
            <Button variant="danger" size="sm" onClick={onCancel} loading={cancelling} className="flex-1">
              إلغاء الحجز
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
