/**
 * The picture a puzzle is cut from: **your own face**.
 *
 * The island's pill, drawn flat the way the podium draws it, in your colour -
 * two eyes and a smile - standing on the beach with the sun behind it, and
 * your name across the bottom. Drawn in the frame's own units, `TABLE.frame`
 * square, so a piece is the same drawing seen through a window onto one cell.
 *
 * Every piece has to be told apart from the others and the right way up told
 * from the wrong, so something sits in every cell: the sun top left, a cloud
 * top right, an eye each side of the middle, the smile across it, and the name
 * along the bottom.
 */
import { useId } from 'react'
import { TABLE } from './rules'

const S = TABLE.frame
const INK = '#2a1712'

export function Portrait({ colour, name }: { colour: string; name: string }) {
  const id = useId().replace(/:/g, '')
  const sky = `${id}-sky`
  const shine = `${id}-shine`
  const label = name.length > 12 ? `${name.slice(0, 11)}…` : name
  return (
    <g>
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fc8f2" />
          <stop offset="1" stopColor="#cdeefc" />
        </linearGradient>
        <linearGradient id={shine} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Sky, sea and sand. */}
      <rect x={0} y={0} width={S} height={S} fill={`url(#${sky})`} />
      <rect x={0} y={218} width={S} height={40} fill="#3aa6c9" />
      <path d={`M0 250 q45 -10 90 0 t90 0 t90 0 t90 0 V${S} H0z`} fill="#f3d9a4" />
      <path d="M0 262 q45 -8 90 0 t90 0 t90 0 t90 0" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth={4} />

      {/* The sun, top left. */}
      <g transform="translate(58 58)">
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={-4} y={-50} width={8} height={16} rx={4} fill="#ffb627" transform={`rotate(${i * 36})`} />
        ))}
        <circle r={28} fill="#ffd23f" />
        <circle cx={-9} cy={-4} r={3} fill={INK} />
        <circle cx={9} cy={-4} r={3} fill={INK} />
        <path d="M-9 7 q9 8 18 0" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      </g>

      {/* A cloud, top right, and a gull. */}
      <g fill="#fff">
        <circle cx={268} cy={62} r={20} />
        <circle cx={295} cy={52} r={26} />
        <circle cx={322} cy={66} r={18} />
        <rect x={262} y={62} width={64} height={22} rx={11} />
      </g>
      <path d="M232 112 q8 -8 16 0 q8 -8 16 0" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />

      {/* A shell bottom left, a starfish bottom right. */}
      <path d="M40 300 a22 22 0 0 1 44 0 z" fill="#f28c8c" />
      <path d="M62 278 v22 M50 283 l8 17 M74 283 l-8 17" stroke="#c75f5f" strokeWidth={2.5} />
      <path
        d="M306 272 l6 14 15 1 -11 10 4 15 -14 -8 -13 8 3 -15 -11 -10 15 -1z"
        fill="#ff8a3d"
        stroke="#d9642a"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* You: the pill in your colour, with your face on it. */}
      <rect x={110} y={70} width={140} height={330} rx={70} fill={colour} />
      <rect x={110} y={70} width={140} height={330} rx={70} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={4} />
      <rect x={124} y={84} width={34} height={150} rx={17} fill={`url(#${shine})`} />
      <circle cx={153} cy={150} r={11} fill={INK} />
      <circle cx={207} cy={150} r={11} fill={INK} />
      <circle cx={157} cy={146} r={3.5} fill="#fff" />
      <circle cx={211} cy={146} r={3.5} fill="#fff" />
      <circle cx={138} cy={178} r={9} fill="#ff7a8a" opacity={0.45} />
      <circle cx={222} cy={178} r={9} fill="#ff7a8a" opacity={0.45} />
      <path d="M160 172 q20 24 40 0" fill="none" stroke={INK} strokeWidth={7} strokeLinecap="round" />

      {/* Your name across the bottom. */}
      <rect x={70} y={300} width={220} height={44} rx={22} fill="#fff" stroke={colour} strokeWidth={5} />
      <text
        x={S / 2}
        y={330}
        textAnchor="middle"
        fontSize={24}
        fontWeight={800}
        fill={INK}
        fontFamily="ui-rounded, 'Segoe UI', system-ui, sans-serif"
      >
        {label}
      </text>

      <rect x={2} y={2} width={S - 4} height={S - 4} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth={4} />
    </g>
  )
}
