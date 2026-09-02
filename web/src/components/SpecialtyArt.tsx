import { SPECIALTY_ART } from "@/lib/specialty-art";
import { SpecialtyIcon } from "@/components/SpecialtyIcon";

/**
 * رسمة التخصص الملوّنة — نفس نصّ الجوال بالضبط، يولّده سكربت المزامنة.
 *
 * `dangerouslySetInnerHTML` هنا آمن: المحتوى ثابتٌ في المستودع لا يأتي من
 * مُدخل، ونقرأه بمفتاحٍ من جدولنا لا من العنوان. وما لا رسمة له يقع على
 * الأيقونة الخطّية بدل مربّعٍ فارغ.
 */
export function SpecialtyArt({
  slug,
  size = 44,
  className,
}: {
  slug: string;
  size?: number;
  className?: string;
}) {
  const body = SPECIALTY_ART[slug];
  if (!body) return <SpecialtyIcon slug={slug} size={Math.round(size * 0.72)} className={className} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
