import { C } from '@/design/tokens';

interface RingProps {
  /** Progress as a fraction; values outside 0–1 are clamped. */
  pct: number;
  /** Over budget — the ring and its label switch to berry. */
  over?: boolean;
  size?: number;
  label: string;
  sub?: string;
}

/**
 * The calorie ring. SVG rather than a CSS conic-gradient so the stroke can
 * animate and so the colour can flip to berry the moment the day goes over.
 *
 * Decorative: `label` and `sub` are real text next to it, so the ring itself is
 * hidden from assistive tech instead of announcing a duplicate number.
 */
export function Ring({ pct, over = false, size = 58, label, sub }: RingProps) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, pct));

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true" focusable="false">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={C.line}
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={over ? C.berry : C.cloud}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="disp font-bold" style={{ fontSize: 15, color: over ? C.berry : C.ink }}>
          {label}
        </span>
        {sub ? <span style={{ fontSize: 8, color: C.sub, marginTop: 2 }}>{sub}</span> : null}
      </div>
    </div>
  );
}
