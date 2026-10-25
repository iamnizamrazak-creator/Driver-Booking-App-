// Hand-drawn Kerala backwaters: Western Ghats, a Kochi Chinese fishing net,
// a kettuvallam houseboat, coconut palms and a red laterite road with a car.
// Pure SVG, so it's crisp at any size and costs no image downloads.

type Variant = 'dawn' | 'dusk';

const PALETTES = {
  dawn: {
    sky: ['#f5b961', '#fbe2b4', '#eef1dc'],
    sun: '#fff5d9',
    glow: '#ffe3a1',
    hillFar: '#a8c8a1',
    hillNear: '#76a97c',
    bank: '#3f7a57',
    water: ['#a5d3c6', '#4b978a', '#235f57'],
    shine: '#fff3cf',
    palm: '#143f2d',
    wood: '#3b2a1e',
    roof: '#caa05a',
    roofLine: '#9c7334',
    grass: '#4f8f5b',
    road: '#b5573c',
    roadEdge: '#d27b55',
    car: '#fbf6e9',
    glass: '#2f6f69',
    bird: '#5a4a3a',
  },
  dusk: {
    sky: ['#2a1b3d', '#8b3d5e', '#f2915a'],
    sun: '#ffc27a',
    glow: '#ff9f5c',
    hillFar: '#6b4566',
    hillNear: '#432d52',
    bank: '#2a1d36',
    water: ['#c27467', '#5d3b5f', '#21152f'],
    shine: '#ffc98d',
    palm: '#160d22',
    wood: '#1b1122',
    roof: '#5a3b4c',
    roofLine: '#3e2836',
    grass: '#2d2240',
    road: '#6e3428',
    roadEdge: '#8f4a35',
    car: '#ffe7c4',
    glass: '#3a2a48',
    bird: '#2a1b3d',
  },
};

function Palm({ base, crown, size, color }: { base: [number, number]; crown: [number, number]; size: number; color: string }) {
  const [bx, by] = base;
  const [cx, cy] = crown;
  const bend = (cx - bx) * 0.35;
  const fronds = [-178, -150, -122, -95, -62, -32, -5, 22, 160, 195];
  return (
    <g>
      <path
        d={`M${bx} ${by} Q${(bx + cx) / 2 - bend} ${(by + cy) / 2} ${cx} ${cy}`}
        stroke={color}
        strokeWidth={size * 0.09}
        strokeLinecap="round"
        fill="none"
      />
      {fronds.map((deg) => {
        const a = (deg * Math.PI) / 180;
        const len = size * (0.75 + 0.25 * Math.abs(Math.cos(a)));
        const ex = cx + Math.cos(a) * len;
        const ey = cy + Math.sin(a) * len * 0.55 + size * 0.42; // droop
        const mx = (cx + ex) / 2;
        const my = (cy + ey) / 2;
        const dx = ex - cx;
        const dy = ey - cy;
        const d = Math.hypot(dx, dy) || 1;
        let nx = -dy / d;
        let ny = dx / d;
        if (ny > 0) {
          nx = -nx;
          ny = -ny;
        }
        const w = size * 0.28;
        return (
          <path
            key={deg}
            d={`M${cx} ${cy} Q${mx + nx * w} ${my + ny * w} ${ex} ${ey} Q${mx + nx * w * 0.35} ${my + ny * w * 0.35} ${cx} ${cy}Z`}
            fill={color}
          />
        );
      })}
      <circle cx={cx - size * 0.04} cy={cy + size * 0.06} r={size * 0.045} fill={color} />
      <circle cx={cx + size * 0.05} cy={cy + size * 0.07} r={size * 0.045} fill={color} />
    </g>
  );
}

export function KeralaScene({
  variant = 'dawn',
  className,
  showCar = true,
  align = 'xMidYMax',
}: {
  variant?: Variant;
  className?: string;
  showCar?: boolean;
  align?: 'xMidYMax' | 'xMidYMid';
}) {
  const p = PALETTES[variant];
  const id = `ks-${variant}`;
  return (
    <svg className={className} viewBox="0 0 400 300" preserveAspectRatio={`${align} slice`} role="img" aria-label="Kerala backwaters at sunrise">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset="0.6" stopColor={p.sky[1]} />
          <stop offset="1" stopColor={p.sky[2]} />
        </linearGradient>
        <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.water[0]} />
          <stop offset="0.5" stopColor={p.water[1]} />
          <stop offset="1" stopColor={p.water[2]} />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor={p.glow} stopOpacity="0.9" />
          <stop offset="1" stopColor={p.glow} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* sky, sun, birds */}
      <rect width="400" height="300" fill={`url(#${id}-sky)`} />
      <circle cx="252" cy="158" r="80" fill={`url(#${id}-glow)`} />
      <circle cx="252" cy="158" r="28" fill={p.sun} />
      <g stroke={p.bird} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.7">
        <path d="M200 70 q5 -5 10 0 q5 -5 10 0" />
        <path d="M228 58 q4 -4 8 0 q4 -4 8 0" />
        <path d="M184 88 q3 -3 6 0 q3 -3 6 0" />
      </g>

      {/* Western Ghats */}
      <path d="M0 176 C40 150 72 140 112 156 S182 134 222 150 S300 128 342 148 S390 140 400 150 V210 H0Z" fill={p.hillFar} />
      <path d="M0 192 C50 172 92 180 140 174 S232 166 272 180 S362 168 400 178 V212 H0Z" fill={p.hillNear} />

      {/* far bank with small palms */}
      <rect y="198" width="400" height="10" fill={p.bank} />
      {[150, 178, 205, 236, 330, 362].map((x, i) => (
        <Palm key={x} base={[x, 204]} crown={[x + (i % 2 ? 3 : -3), 184 - (i % 3) * 3]} size={12} color={p.bank} />
      ))}

      {/* backwater */}
      <rect y="206" width="400" height="94" fill={`url(#${id}-water)`} />
      <g fill={p.shine} opacity="0.7">
        <rect x="232" y="212" width="40" height="2" rx="1" />
        <rect x="240" y="219" width="26" height="2" rx="1" />
        <rect x="246" y="226" width="14" height="2" rx="1" />
        <rect x="249" y="233" width="8" height="1.5" rx="1" />
      </g>
      <g stroke="#ffffff" strokeOpacity="0.28" strokeWidth="1.2" strokeLinecap="round">
        <path d="M40 240 h22 M110 250 h30 M220 258 h18 M330 246 h26 M12 256 h14" />
      </g>

      {/* Chinese fishing net (cheena vala) */}
      <g stroke={p.wood} strokeLinecap="round" fill="none">
        <path d="M30 226 h56" strokeWidth="4" />
        <path d="M42 226 L92 150 L74 226" strokeWidth="2.2" />
        <path d="M58 226 L146 108" strokeWidth="2.6" />
        <path d="M92 150 L22 206" strokeWidth="1.2" />
        <path d="M146 108 L112 168 M146 108 L176 164 M146 108 L130 178 M146 108 L162 176" strokeWidth="1" />
        <path d="M112 168 Q144 196 176 164" strokeWidth="1.4" />
        <path d="M120 176 L170 172 M128 182 L164 180 M124 171 L134 186 M144 170 L146 189 M164 168 L158 186" strokeWidth="0.6" opacity="0.8" />
      </g>
      <g fill={p.wood}>
        <circle cx="30" cy="214" r="2.6" />
        <circle cx="38" cy="219" r="2.2" />
        <circle cx="25" cy="221" r="2" />
      </g>

      {/* kettuvallam houseboat + reflection */}
      {[1, -1].map((s) => (
        <g key={s} transform={s === -1 ? 'translate(0 498) scale(1 -1)' : undefined} opacity={s === -1 ? 0.22 : 1}>
          <path d="M192 246 Q192 224 216 222 L262 222 Q286 224 286 246Z" fill={p.roof} />
          <path d="M204 246 V230 M218 246 V226 M232 246 V225 M246 246 V225 M260 246 V226 M274 246 V230" stroke={p.roofLine} strokeWidth="1" />
          <rect x="222" y="234" width="8" height="7" rx="1" fill={p.wood} />
          <rect x="246" y="234" width="8" height="7" rx="1" fill={p.wood} />
          <path d="M174 240 Q178 251 196 252 L282 252 Q298 250 304 236 Q292 246 282 246 L196 246 Q184 246 174 240Z" fill={p.wood} />
        </g>
      ))}

      {/* foreground bank, laterite road and car */}
      <path d="M0 266 Q110 252 220 262 T400 258 V300 H0Z" fill={p.grass} />
      <path d="M0 276 Q120 262 230 272 T400 268 V300 H0Z" fill={p.road} />
      <path d="M0 276 Q120 262 230 272 T400 268" stroke={p.roadEdge} strokeWidth="2" fill="none" />
      {showCar && (
        <g transform="translate(118 254)">
          <g stroke={p.car} strokeOpacity="0.6" strokeWidth="1.3" strokeLinecap="round">
            <path d="M-16 10 h10 M-22 14 h14" />
          </g>
          <path d="M0 15 Q0 9 6 8 L14 7 L22 1 Q24 0 27 0 L42 0 Q45 0 47 2 L54 7 L61 8.5 Q65 9.5 65 14 L65 18 Q65 19 64 19 L1 19 Q0 19 0 18Z" fill={p.car} />
          <path d="M17 7 L24 2.5 L32 2.5 L32 7Z M35 2.5 L42 2.5 Q44 2.5 45 3.5 L49 7 L35 7Z" fill={p.glass} />
          <circle cx="29" cy="5" r="1.6" fill={p.car} opacity="0.9" />
          <circle cx="15" cy="19" r="5" fill={p.wood} />
          <circle cx="51" cy="19" r="5" fill={p.wood} />
          <circle cx="15" cy="19" r="2" fill={p.car} />
          <circle cx="51" cy="19" r="2" fill={p.car} />
        </g>
      )}

      {/* foreground coconut palms */}
      <Palm base={[372, 300]} crown={[320, 80]} size={66} color={p.palm} />
      <Palm base={[392, 300]} crown={[392, 132]} size={46} color={p.palm} />
      <Palm base={[-6, 300]} crown={[14, 128]} size={44} color={p.palm} />
    </svg>
  );
}
