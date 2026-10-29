import React from 'react';

interface MoonPhaseSvgProps {
  phaseAngle: number; // 0 to 360 (0 = New, 90 = First Quarter, 180 = Full, 270 = Last Quarter)
  size?: number;
  className?: string;
}

/**
 * Renders an astronomically accurate lunar disk SVG with craters and spherical terminator curve
 * computed from the exact synodic phaseAngle (0 - 360 deg).
 */
export const MoonPhaseSvg: React.FC<MoonPhaseSvgProps> = ({
  phaseAngle,
  size = 88,
  className = '',
}) => {
  const r = 40;
  const cx = 50;
  const cy = 50;
  const normAngle = ((phaseAngle % 360) + 360) % 360;
  const rad = (normAngle * Math.PI) / 180;

  // Compute sunlit limb and terminator elliptical arc
  // For waxing (0..180), sunlit side is on the right (Northern Hemisphere convention)
  // For waning (180..360), sunlit side is on the left
  const isWaxing = normAngle <= 180;
  const cosPhase = Math.cos(rad);
  const rx = Math.abs(cosPhase) * r;

  let litPath = '';
  if (normAngle < 2 || normAngle > 358) {
    litPath = ''; // New Moon
  } else if (normAngle > 178 && normAngle < 182) {
    // Full Moon
    litPath = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  } else if (isWaxing) {
    // Right semicircle is outer limb: from top (cx, cy-r) to bottom (cx, cy+r) clockwise (sweep=1)
    // Terminator returns from bottom to top: if crescent (normAngle < 90), curve bulges right (sweep=0)
    // if gibbous (normAngle > 90), curve bulges left (sweep=1)
    const termSweep = normAngle < 90 ? 0 : 1;
    litPath = `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} A ${rx.toFixed(2)} ${r} 0 0 ${termSweep} ${cx} ${cy - r} Z`;
  } else {
    // Waning: Left semicircle is outer limb: from top (cx, cy-r) to bottom (cx, cy+r) counter-clockwise (sweep=0)
    const termSweep = normAngle < 270 ? 0 : 1;
    litPath = `M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r} A ${rx.toFixed(2)} ${r} 0 0 ${termSweep} ${cx} ${cy - r} Z`;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={`Lunar disk at ${Math.round(normAngle)} degrees phase angle`}
    >
      <defs>
        <radialGradient id="moonLitGrad" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FAF6EC" />
          <stop offset="65%" stopColor="#E5DEC9" />
          <stop offset="100%" stopColor="#C4B693" />
        </radialGradient>
        <radialGradient id="moonDarkGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#141A29" />
          <stop offset="100%" stopColor="#0B0E17" />
        </radialGradient>
      </defs>

      {/* Outer decorative observatory degree ring */}
      <circle
        cx={cx}
        cy={cy}
        r={46}
        fill="none"
        stroke="#262E42"
        strokeWidth="0.75"
        strokeDasharray="2 3"
      />

      {/* Base Earthshine / Dark Lunar Disk */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="url(#moonDarkGrad)"
        stroke="#262E42"
        strokeWidth="1"
      />

      {/* Illuminated Lunar Surface */}
      {litPath && <path d={litPath} fill="url(#moonLitGrad)" />}

      {/* Subtle Lunar Mare & Crater Contours */}
      <g opacity="0.22" fill="#5C5346" pointerEvents="none">
        <ellipse cx="38" cy="36" rx="9" ry="7" />
        <ellipse cx="56" cy="32" rx="7" ry="5" />
        <ellipse cx="62" cy="46" rx="8" ry="9" />
        <ellipse cx="42" cy="58" rx="11" ry="8" />
        <circle cx="52" cy="70" r="3.5" />
      </g>

      {/* Fine Antique Gold Rim */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#D4AF37"
        strokeOpacity="0.45"
        strokeWidth="1"
      />
    </svg>
  );
};

export const ToriiIcon: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 20,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M3 5c3 1.2 15 1.2 18 0" />
    <path d="M4 9h16" />
    <path d="M7 5.5V20" />
    <path d="M17 5.5V20" />
    <path d="M12 5.5V9" />
  </svg>
);
