/**
 * The picture a puzzle is cut from: **your own face**.
 *
 * The island's duck, illustrated in your colour, with its bill, feathered wing
 * and webbed feet, on a layered beach with the sun behind it, and
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

      {/* Layers at the horizon, a palm and ripples make each puzzle cell distinct. */}
      <path d="M225 221 q35 -36 90 -14 l45 14z" fill="#659b85" />
      <path d="M289 222 q23 -39 10 -77" stroke="#b48a60" strokeWidth={9} fill="none" />
      <g fill="#559177" stroke="#397963" strokeWidth={1.5}>
        <path d="M300 147 q-34 -30 -54 -4 q31 -9 54 4z" />
        <path d="M300 147 q-21 -43 8 -49 q-12 22 -8 49z" />
        <path d="M300 147 q29 -36 48 -13 q-27 -3 -48 13z" />
        <path d="M300 147 q35 -8 43 24 q-22 -19 -43 -24z" />
      </g>
      <circle cx={300} cy={153} r={6} fill="#936f4b" />
      <circle cx={309} cy={154} r={5} fill="#a67b51" />
      <path d="M18 231 h35 m224 4 h49 M36 243 h24 m230 -1 h44" stroke="#c6f1ed" strokeWidth={3} strokeLinecap="round" />
      <ellipse cx={180} cy={291} rx={101} ry={13} fill="#b89167" opacity={0.3} />

      {/* The shared island character, illustrated as a duck in the player's colour. */}
      <path d="M100 231 Q69 215 59 184 Q91 191 113 218" fill={colour} stroke={INK} strokeOpacity={0.15} strokeWidth={3} />
      <ellipse cx={180} cy={235} rx={100} ry={65} fill={colour} />
      <ellipse cx={180} cy={235} rx={100} ry={65} fill={`url(#${shine})`} />
      <ellipse cx={184} cy={253} rx={55} ry={39} fill="#fff2d3" opacity={0.74} />
      <ellipse cx={131} cy={236} rx={37} ry={31} fill={colour} stroke={INK} strokeOpacity={0.16} strokeWidth={3} transform="rotate(-19 131 236)" />
      <path d="M108 238 q18 21 41 8 m-34 3 q12 15 24 12" stroke="#fff4d9" strokeOpacity={0.38} strokeWidth={4} fill="none" strokeLinecap="round" />
      <ellipse cx={178} cy={149} rx={60} ry={65} fill={colour} />
      <path d="M136 121 q7 -23 29 -24" stroke="#fff9df" strokeOpacity={0.35} strokeWidth={10} fill="none" strokeLinecap="round" />
      <circle cx={156} cy={139} r={9} fill={INK} />
      <circle cx={198} cy={139} r={9} fill={INK} />
      <circle cx={159} cy={136} r={3} fill="#fff" />
      <circle cx={201} cy={136} r={3} fill="#fff" />
      <circle cx={141} cy={163} r={9} fill="#ef9088" opacity={0.5} />
      <circle cx={214} cy={163} r={9} fill="#ef9088" opacity={0.5} />
      <rect x={149} y={159} width={76} height={29} rx={14} fill="#efa543" stroke="#c58032" strokeWidth={2} />
      <path d="M156 176 q31 8 62 -1" stroke="#a66c2f" strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <ellipse cx={168} cy={167} rx={3} ry={2} fill="#a66c2f" />
      <ellipse cx={201} cy={167} rx={3} ry={2} fill="#a66c2f" />
      <path d="M137 288 l-15 20 23 -2 14 3 12 -12 -19 -7 M210 288 l-8 19 22 -3 17 3 -8 -16z" fill="#e9a247" stroke="#c88738" strokeWidth={2} />

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
