interface OrbitRingProps {
  radius: number;
  /** Center of the system canvas in world px. Defaults to CSS 50%/50%. */
  center?: number;
}

export function OrbitRing({ radius, center }: OrbitRingProps) {
  const size = radius * 2;
  const style =
    center != null
      ? {
          left: center,
          top: center,
          width: size,
          height: size,
          transform: "translate(-50%, -50%)",
        }
      : {
          width: size,
          height: size,
        };

  return (
    <div
      className={`absolute rounded-full border border-panel-border/50 pointer-events-none ${
        center == null ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" : ""
      }`}
      style={style}
    />
  );
}
