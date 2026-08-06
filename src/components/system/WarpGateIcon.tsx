import { useId } from "react";

/**
 * Static system-map silhouette of the horseshoe warp station.
 * Portal sits at viewBox center (32,32); mouth opens toward −Y and the
 * hub sits on +Y — system view rotates so the hub docks into the beam.
 */
export function WarpGateIcon({
  accent = "#4fd2ff",
  className = "",
}: {
  accent?: string;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const glowId = `wg-glow-${uid}`;
  const rayId = `wg-rays-${uid}`;

  const cx = 32;
  const cy = 32;
  const rOut = 14;
  const rIn = 9;
  // Tip half-angle from vertical: opening faces up (−Y), hub at +Y.
  const tip = 0.92;

  const tipAx = cx + Math.cos(-Math.PI / 2 + tip) * rOut;
  const tipAy = cy + Math.sin(-Math.PI / 2 + tip) * rOut;
  const tipBx = cx + Math.cos(-Math.PI / 2 - tip) * rOut;
  const tipBy = cy + Math.sin(-Math.PI / 2 - tip) * rOut;
  const tipAInX = cx + Math.cos(-Math.PI / 2 + tip) * rIn;
  const tipAInY = cy + Math.sin(-Math.PI / 2 + tip) * rIn;
  const tipBInX = cx + Math.cos(-Math.PI / 2 - tip) * rIn;
  const tipBInY = cy + Math.sin(-Math.PI / 2 - tip) * rIn;

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      <defs>
        <radialGradient id={glowId} cx="50%" cy="50%" r="42%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="22%" stopColor={accent} stopOpacity="0.95" />
          <stop offset="55%" stopColor={accent} stopOpacity="0.3" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={rayId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.8" />
          <stop offset="45%" stopColor={accent} stopOpacity="0.2" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={cx} cy={cy} r="20" fill={`url(#${rayId})`} opacity="0.45" />

      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(a) * 15}
            y2={cy + Math.sin(a) * 15}
            stroke={accent}
            strokeWidth={i % 2 === 0 ? 1.2 : 0.55}
            strokeOpacity={i % 2 === 0 ? 0.45 : 0.2}
            strokeLinecap="round"
          />
        );
      })}

      <circle cx={cx} cy={cy} r="7.5" fill={`url(#${glowId})`} />
      <circle cx={cx} cy={cy} r="2.4" fill="#ffffff" opacity="0.95" />

      {/* Crescent: long outer arc through bottom, short inner arc */}
      <path
        d={`
          M ${tipAx} ${tipAy}
          A ${rOut} ${rOut} 0 1 1 ${tipBx} ${tipBy}
          L ${tipBInX} ${tipBInY}
          A ${rIn} ${rIn} 0 1 0 ${tipAInX} ${tipAInY}
          Z
        `}
        fill="#c9d0d6"
        stroke="#7e8892"
        strokeWidth="0.65"
      />

      {/* Window ports on outer hull (bottom half of arc) */}
      {Array.from({ length: 16 }, (_, i) => {
        const t = i / 15;
        const a = -Math.PI / 2 + tip + t * (2 * Math.PI - 2 * tip);
        const r = rOut - 1;
        return (
          <circle
            key={i}
            cx={cx + Math.cos(a) * r}
            cy={cy + Math.sin(a) * r}
            r={0.5}
            fill={accent}
            opacity={0.8}
          />
        );
      })}

      {/* Hub at +Y (bottom) — docks into the Dyson beam after rotation */}
      <ellipse cx={cx} cy={cy + rOut - 0.5} rx="7" ry="3.2" fill="#14181e" />
      <rect
        x={cx - 5.5}
        y={cy + rOut - 6}
        width="11"
        height="4.5"
        rx="1"
        fill="#1e242c"
      />
      <rect
        x={cx - 3}
        y={cy + rOut - 8}
        width="6"
        height="3"
        rx="0.7"
        fill="#2a313a"
      />

      {[
        [-5, 1.5, -7.5, 6.5],
        [-2.5, 2, -3.5, 7.5],
        [0, 2.2, 0, 8],
        [2.5, 2, 3.5, 7.5],
        [5, 1.5, 7.5, 6.5],
        [-7, 0, -10, 4],
        [7, 0, 10, 4],
      ].map(([dx1, dy1, dx2, dy2], i) => (
        <line
          key={i}
          x1={cx + dx1}
          y1={cy + rOut - 1.5 + dy1}
          x2={cx + dx2}
          y2={cy + rOut - 1.5 + dy2}
          stroke="#0a0c10"
          strokeWidth="1.15"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
