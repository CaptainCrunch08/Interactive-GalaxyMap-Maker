type PulsarJetsProps = {
  /** Length of one jet from center to tip (px). */
  length: number;
  /** Width of the jet near the star (px). */
  baseWidth: number;
  color?: string;
  highlight?: string;
  /** Rotation of the bipolar axis in degrees. */
  angleDeg: number;
  className?: string;
  /** Stronger streaming / flicker (system view). Galaxy map stays calm. */
  animated?: boolean;
};

/**
 * Deterministic tilt (degrees) from an id so each pulsar keeps a stable jet axis.
 */
export function pulsarJetAngle(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 180;
}

function JetBeam({
  length,
  baseWidth,
  color,
  highlight,
  angleDeg,
  core = false,
  animated = false,
}: {
  length: number;
  baseWidth: number;
  color: string;
  highlight: string;
  angleDeg: number;
  core?: boolean;
  animated?: boolean;
}) {
  const h = core ? Math.max(2, baseWidth * 0.35) : baseWidth;
  return (
    <span
      className={`absolute left-1/2 top-1/2 pointer-events-none ${
        animated
          ? core
            ? "pulsar-jet-beam pulsar-jet-beam--core"
            : "pulsar-jet-beam"
          : ""
      }`}
      style={{
        width: length,
        height: h,
        marginTop: -h / 2,
        transformOrigin: "0% 50%",
        transform: `rotate(${angleDeg}deg)`,
        background: core
          ? `linear-gradient(90deg, ${highlight} 0%, ${highlight}bb 45%, transparent 100%)`
          : animated
            ? `repeating-linear-gradient(90deg, ${highlight}ee 0px, ${color}dd 14px, ${color}44 28px, ${highlight}cc 42px, ${color}88 56px)`
            : `linear-gradient(90deg, ${highlight}dd 0%, ${color}cc 30%, ${color}55 68%, transparent 100%)`,
        backgroundSize: animated && !core ? "120px 100%" : undefined,
        clipPath: core
          ? "polygon(0% 30%, 100% 46%, 100% 54%, 0% 70%)"
          : "polygon(0% 20%, 100% 46%, 100% 54%, 0% 80%)",
        filter: `drop-shadow(0 0 ${core ? 3 : 6}px ${core ? highlight : color})`,
        opacity: core ? 0.95 : 0.85,
      }}
    />
  );
}

/**
 * Bipolar relativistic jets — two opposing beams through the pulsar.
 * Place behind the star body; pointer-events none.
 */
export function PulsarJets({
  length,
  baseWidth,
  color = "#22d3ee",
  highlight = "#ecfeff",
  angleDeg,
  className = "",
  animated = false,
}: PulsarJetsProps) {
  return (
    <span
      className={`absolute inset-0 pointer-events-none pulsar-jets ${
        animated ? "pulsar-jets--animated" : ""
      } ${className}`}
      aria-hidden
    >
      <JetBeam
        length={length}
        baseWidth={baseWidth}
        color={color}
        highlight={highlight}
        angleDeg={angleDeg}
        animated={animated}
      />
      <JetBeam
        length={length}
        baseWidth={baseWidth}
        color={color}
        highlight={highlight}
        angleDeg={angleDeg + 180}
        animated={animated}
      />
      <JetBeam
        length={length}
        baseWidth={baseWidth}
        color={color}
        highlight={highlight}
        angleDeg={angleDeg}
        core
        animated={animated}
      />
      <JetBeam
        length={length}
        baseWidth={baseWidth}
        color={color}
        highlight={highlight}
        angleDeg={angleDeg + 180}
        core
        animated={animated}
      />
    </span>
  );
}
