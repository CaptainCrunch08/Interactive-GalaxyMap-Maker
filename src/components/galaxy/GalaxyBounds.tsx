import {
  GALAXY_EDGE_PADDING,
} from "../../types/campaign";

const STROKE = "rgba(79, 210, 255, 0.3)";
const STROKE_SOFT = "rgba(79, 210, 255, 0.14)";
const STROKE_FAINT = "rgba(79, 210, 255, 0.11)";
const FADE = "rgba(2, 6, 12, 0.55)";

/**
 * Playable-area frame. Drawn in world units (no nonScalingStroke) so the
 * square stays geometrically square under CSS zoom/pan transforms.
 */
export function GalaxyBounds({ size }: { size: number }) {
  const pad = GALAXY_EDGE_PADDING;
  const x = pad;
  const y = pad;
  const inner = size - pad * 2;
  const corner = Math.min(160, inner * 0.03);
  const tick = 28;
  const dashPad = 12;
  // World-space strokes — scale with the map so all four sides match
  const strokeMain = 10;
  const strokeSoft = 6;
  const strokeDash = 4;

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      style={{
        width: size,
        height: size,
        maxWidth: "none",
        maxHeight: "none",
        overflow: "visible",
      }}
    >
      <defs>
        <mask
          id="galaxy-bounds-fade-mask"
          maskUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={size}
          height={size}
        >
          <rect width={size} height={size} fill="white" />
          <rect x={x} y={y} width={inner} height={inner} fill="black" />
        </mask>
      </defs>

      <rect
        width={size}
        height={size}
        fill={FADE}
        mask="url(#galaxy-bounds-fade-mask)"
        opacity={0.85}
      />

      {/* Perfect square playable frame */}
      <rect
        x={x}
        y={y}
        width={inner}
        height={inner}
        fill="none"
        stroke={STROKE_SOFT}
        strokeWidth={strokeSoft}
      />

      <rect
        x={x + dashPad}
        y={y + dashPad}
        width={inner - dashPad * 2}
        height={inner - dashPad * 2}
        fill="none"
        stroke={STROKE_FAINT}
        strokeWidth={strokeDash}
        strokeDasharray="40 40"
      />

      <path
        d={`M ${x} ${y + corner} V ${y} H ${x + corner}`}
        fill="none"
        stroke={STROKE}
        strokeWidth={strokeMain}
        strokeLinecap="square"
      />
      <path
        d={`M ${x + inner - corner} ${y} H ${x + inner} V ${y + corner}`}
        fill="none"
        stroke={STROKE}
        strokeWidth={strokeMain}
        strokeLinecap="square"
      />
      <path
        d={`M ${x} ${y + inner - corner} V ${y + inner} H ${x + corner}`}
        fill="none"
        stroke={STROKE}
        strokeWidth={strokeMain}
        strokeLinecap="square"
      />
      <path
        d={`M ${x + inner - corner} ${y + inner} H ${x + inner} V ${y + inner - corner}`}
        fill="none"
        stroke={STROKE}
        strokeWidth={strokeMain}
        strokeLinecap="square"
      />

      <line
        x1={x + inner / 2 - tick / 2}
        y1={y}
        x2={x + inner / 2 + tick / 2}
        y2={y}
        stroke={STROKE}
        strokeWidth={strokeMain}
      />
      <line
        x1={x + inner / 2 - tick / 2}
        y1={y + inner}
        x2={x + inner / 2 + tick / 2}
        y2={y + inner}
        stroke={STROKE}
        strokeWidth={strokeMain}
      />
      <line
        x1={x}
        y1={y + inner / 2 - tick / 2}
        x2={x}
        y2={y + inner / 2 + tick / 2}
        stroke={STROKE}
        strokeWidth={strokeMain}
      />
      <line
        x1={x + inner}
        y1={y + inner / 2 - tick / 2}
        x2={x + inner}
        y2={y + inner / 2 + tick / 2}
        stroke={STROKE}
        strokeWidth={strokeMain}
      />

      <text
        x={x + inner / 2}
        y={y + 36}
        textAnchor="middle"
        fill="rgba(79, 210, 255, 0.22)"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 18,
          letterSpacing: "0.25em",
          textTransform: "uppercase",
        }}
      >
        Map limit
      </text>
    </svg>
  );
}
