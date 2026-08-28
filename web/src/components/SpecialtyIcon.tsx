import { SPECIALTY_SHAPES, type Shape } from "@/lib/specialty-paths";

/**
 * أيقونة التخصص — نفس أشكال تطبيق الجوال بالضبط.
 * currentColor يجعلها ترث لون النصّ، فتعمل على أي خلفية بلا تمرير لون.
 */
export function SpecialtyIcon({
  slug,
  size = 24,
  weight = 1.7,
  className,
}: {
  slug: string;
  size?: number;
  weight?: number;
  className?: string;
}) {
  const shapes: Shape[] = SPECIALTY_SHAPES[slug] ?? SPECIALTY_SHAPES["general-practice"];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {shapes.map((shape, i) => {
        const filled = shape.f ? { fill: "currentColor", stroke: "none" } : {};
        if (shape.t === "c")
          return <circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} strokeWidth={shape.sw} {...filled} />;
        if (shape.t === "r")
          return (
            <rect
              key={i}
              x={shape.x}
              y={shape.y}
              width={shape.w}
              height={shape.h}
              rx={shape.rx}
              strokeWidth={shape.sw}
              {...filled}
            />
          );
        return <path key={i} d={shape.d} strokeWidth={shape.sw} {...filled} />;
      })}
    </svg>
  );
}
