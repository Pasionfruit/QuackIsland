/**
 * The podium: where everybody ends up after every round.
 *
 * Three steps - second, first, third, the way a podium stands - with whoever
 * earned each one on top of it, and everybody else flat on their face on the
 * sand in front. **How they stand is how they came:** first is jumping for
 * joy, second is happy, third keeps a straight face, and fourth and below fall
 * flat on their faces. Who goes where is `podium.ts`; this only draws it.
 *
 * **Ties share a step.** Two level at the top both jump on the first step and
 * the second step stands empty, because whoever came next was third. **If
 * everybody ties, everybody loses**: the steps stand empty and the whole field
 * is on the sand.
 *
 * The bottom corners are the two ways on: the **minigame dashboard** on the
 * left, which is the same step back the escape key takes, and **replay** on the
 * right, which is the host's - the same as play is. A guest gets a line saying
 * who they are waiting for where the host gets the button.
 *
 * The interface figures echo the island's duck model in SVG,
 * painted the colour each player was in the game. A podium is a moment rather
 * than a scene, and a DOM page costs no draw calls at all.
 */
import { useEffect } from 'react'
import { useNet } from '../../09-net'
import { minigameById } from './catalogue'
import { FONT, ISLAND, bar, button, screen, wordmark } from './look'
import { rankStandings, type Placed, type Pose } from './podium'
import type { MinigameRun } from './registry'
import { PODIUM_MUSIC, clicked, playOnce, stopOne } from './sound'
import { backOut, replayMinigame } from './state'

/** For a player the game did not give a colour, in the order they placed. */
const FALLBACK = ['#e0563f', '#3f8fd6', '#f0b429', '#5eb85b', '#a45ee0', '#e07a3a', '#2fb3a8', '#d6508f'] as const

/** Each step: how tall, what it is made of, and where it stands in the row. */
const STEPS = {
  1: { height: 'clamp(90px, 26vh, 260px)', face: '#ffc94d', edge: '#d79a22' },
  2: { height: 'clamp(62px, 18vh, 180px)', face: '#dfe5ec', edge: '#a9b4c0' },
  3: { height: 'clamp(40px, 11vh, 110px)', face: '#e8a878', edge: '#b87545' },
} as const

/** Left to right, the way a podium stands: second, first, third. */
const ROW = [2, 1, 3] as const

export function Podium({ run }: { run: MinigameRun }) {
  const net = useNet()
  const { placed, allTied } = rankStandings(run.standings ?? [])
  const coloured = placed.map((p, i) => ({ ...p, colour: p.colour ?? FALLBACK[i % FALLBACK.length] }))
  const onStep = (step: 1 | 2 | 3) => coloured.filter((p) => p.step === step)
  const flat = coloured.filter((p) => p.step === null)

  useEffect(() => {
    playOnce(PODIUM_MUSIC)
    return () => stopOne(PODIUM_MUSIC)
  }, [])

  return (
    <div style={{ ...screen, background: `linear-gradient(180deg, ${ISLAND.sky} 0%, #c4e9f2 100%)` }} data-podium data-all-tied={allTied}>
      <style>{KEYFRAMES}</style>
      <div style={bar}>
        <span style={wordmark}>{minigameById(run.id).title}</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: ISLAND.fadedInk }}>results</span>
      </div>

      <div style={headline} data-headline>
        {headlineFor(coloured, allTied)}
      </div>

      <div style={stage}>
        {ROW.map((step) => (
          <div key={step} style={column} data-step={step}>
            <div style={standing}>
              {onStep(step).map((p) => (
                <Figure key={p.id} player={p} size={sizeFor(onStep(step).length)} />
              ))}
            </div>
            <div
              style={{
                ...block,
                height: STEPS[step].height,
                background: STEPS[step].face,
                boxShadow: `inset 0 -8px 0 ${STEPS[step].edge}`,
              }}
            >
              {step}
            </div>
          </div>
        ))}
      </div>

      <div style={sand} data-step="ground">
        {flat.map((p, i) => (
          <Flop key={p.id} player={p} delay={0.5 + i * 0.18} />
        ))}
      </div>

      <div style={footer}>
        {net.host ? (
          <button type="button" onClick={clicked(backOut)} style={{ ...button, ...corner }} data-dashboard>
            minigame dashboard
          </button>
        ) : null}
        {net.host ? (
          <button type="button" onClick={clicked(replayMinigame)} style={{ ...corner, ...replay }} data-replay>
            replay
          </button>
        ) : (
          <span style={{ ...corner, ...waiting }} data-waiting>
            waiting for the host
          </span>
        )}
      </div>
    </div>
  )
}

/** One line over the podium saying what happened. */
function headlineFor(placed: Placed[], allTied: boolean): string {
  if (placed.length === 0) return 'Nobody finished'
  if (allTied) return 'Everybody tied - so everybody loses!'
  const top = placed.filter((p) => p.rank === 1)
  if (top.length > 1) return `A tie for first: ${listOf(top.map(nameOf))}!`
  return top[0].mine ? 'You win!' : `${nameOf(top[0])} wins!`
}

const nameOf = (p: Placed) => (p.mine ? 'you' : (p.name ?? p.id))

function listOf(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * How wide a body is: grows with the window, and a crowd of ties on one step
 * shrinks to fit it.
 */
function sizeFor(count: number): string {
  const share = count <= 2 ? 1 : count <= 4 ? 0.62 : 0.45
  return `calc(min(120px, 15vh) * ${share})`
}

/** A body standing on a step, pulling the face that goes with it. */
function Figure({ player, size }: { player: Placed; size: string }) {
  const pose = player.pose
  return (
    <div style={{ ...figure, width: size }} data-pose={pose} data-player={player.id}>
      <div className="localrot-podium-move" style={{ animation: MOVES[pose], transformOrigin: '50% 100%', width: '100%' }}>
        <svg viewBox="0 0 100 140" style={{ display: 'block', width: '100%', height: 'auto' }} aria-hidden>
          <DuckFigure pose={pose} colour={player.colour!}/>
        </svg>
      </div>
      <Name player={player} />
    </div>
  )
}

/** Raised wings, webbed feet and a broad bill match the world's duck silhouette. */
function DuckFigure({ pose, colour }: { pose: Pose; colour: string }) {
  const up = pose === 'joy'
  return (
    <>
      <ellipse cx={50} cy={135} rx={34} ry={4} fill="rgba(0,0,0,.12)"/>
      <path d="M19 97 Q5 86 6 69 Q24 73 31 92 M69 92 Q76 73 94 69 Q95 86 81 97" fill={colour}/>
      <path d="M31 118 v9 l-12 8 9-1 6 4 6-4 10 1-10-8 v-9 M61 118 v9 l-10 8 10-1 6 4 6-4 9 1-12-8 v-9" fill="#ed9b36"/>
      <ellipse cx={50} cy={96} rx={31} ry={31} fill={colour}/>
      <ellipse cx={50} cy={99} rx={22} ry={24} fill="#fff0cc"/>
      {up ? <>
        <path d="M28 97 Q8 84 5 49 Q21 52 32 78 Z M72 97 Q92 84 95 49 Q79 52 68 78 Z" fill={colour}/>
        <path d="M25 88 Q11 74 9 56 M75 88 Q89 74 91 56" stroke="rgba(0,0,0,.12)" strokeWidth={3} fill="none"/>
      </> : <>
        <ellipse cx={24} cy={97} rx={10} ry={22} transform="rotate(-15 24 97)" fill={colour}/>
        <ellipse cx={76} cy={97} rx={10} ry={22} transform="rotate(15 76 97)" fill={colour}/>
        <path d="M17 96 l7 12 M83 96 l-7 12" stroke="rgba(0,0,0,.12)" strokeWidth={3}/>
      </>}
      <ellipse cx={50} cy={53} rx={23} ry={27} fill={colour}/>
      <ellipse cx={44} cy={40} rx={11} ry={7} fill="rgba(255,255,255,.13)"/>
      <Face pose={pose}/>
    </>
  )
}

/** Duck eyes and bill, with an open bill when cheering. */
function Face({ pose }: { pose: Pose }) {
  const ink = '#2a1712'
  const line = { stroke: ink, strokeWidth: 4.5, strokeLinecap: 'round' as const, fill: 'none' }
  return (
    <>
      {pose==='joy' ? <><path d="M35 48 q5 -7 10 0" {...line}/><path d="M55 48 q5 -7 10 0" {...line}/></> : <>
        <ellipse cx={40} cy={48} rx={5.5} ry={7} fill="#fffbea"/><ellipse cx={60} cy={48} rx={5.5} ry={7} fill="#fffbea"/>
        <circle cx={41} cy={49} r={3.5} fill={ink}/><circle cx={59} cy={49} r={3.5} fill={ink}/>
      </>}
      <ellipse cx={50} cy={pose==='joy'?69:64} rx={20} ry={pose==='joy'?10:5} fill="#a95f30"/>
      <ellipse cx={50} cy={pose==='joy'?74:67} rx={19} ry={4} fill="#e49534"/>
      <ellipse cx={50} cy={61} rx={22} ry={7} fill="#f4b54b"/>
      <circle cx={44} cy={59} r={1.2} fill="#a56731"/><circle cx={56} cy={59} r={1.2} fill="#a56731"/>
    </>
  )
}

/** A body flat on its face in the sand: we see its back, and the stars. */
function Flop({ player, delay }: { player: Placed; delay: number }) {
  return (
    <div style={flopWrap} data-pose="flop" data-player={player.id}>
      <div className="localrot-podium-move" style={{ animation: `localrot-flop 0.7s cubic-bezier(.55,0,.8,.4) ${delay}s both`, transformOrigin: '92% 90%' }}>
        <svg viewBox="0 0 150 64" style={{ display: 'block', width: 'calc(min(120px, 15vh) * 1.1)', height: 'auto' }} aria-hidden>
          <path d="M112 28 L143 11 136 35 146 47 119 49" fill={player.colour}/>
          <ellipse cx={80} cy={38} rx={45} ry={23} fill={player.colour}/>
          <ellipse cx={74} cy={32} rx={28} ry={12} fill="rgba(0,0,0,.12)"/>
          <circle cx={32} cy={32} r={22} fill={player.colour}/>
          <ellipse cx={15} cy={40} rx={14} ry={7} fill="#ed9b36"/>
          <path d="M28 29 l8 5 M36 29 l-8 5" stroke="#243e40" strokeWidth={3} strokeLinecap="round"/>
          <path d="M105 52 l9 10 5-6 8 4-4-9" fill="#ed9b36"/>
        </svg>
      </div>
      <div className="localrot-podium-move" style={{ ...stars, animation: `localrot-stars 1.4s linear ${delay + 0.7}s infinite both` }} aria-hidden>
        ✦ ✧ ✦
      </div>
      <Name player={player} />
    </div>
  )
}

function Name({ player }: { player: Placed }) {
  return (
    <div style={{ ...label, fontWeight: player.mine ? 800 : 600, color: player.mine ? ISLAND.deepSea : ISLAND.ink }}>
      {nameOf(player)}
    </div>
  )
}

const MOVES: Record<Pose, string> = {
  joy: 'localrot-joy 0.62s ease-in-out infinite',
  happy: 'localrot-happy 1.6s ease-in-out infinite',
  straight: 'none',
  flop: 'none',
}

const KEYFRAMES = `
@keyframes localrot-joy {
  0%, 100% { transform: translateY(0) scale(1.08, 0.9); }
  15% { transform: translateY(0) scale(0.94, 1.08); }
  50% { transform: translateY(-34%) scale(1, 1); }
  85% { transform: translateY(0) scale(1, 1); }
}
@keyframes localrot-happy {
  0%, 100% { transform: rotate(-4deg); }
  50% { transform: rotate(4deg) translateY(-3%); }
}
@keyframes localrot-flop {
  0% { transform: rotate(90deg); }
  70% { transform: rotate(-6deg); }
  85% { transform: rotate(3deg); }
  100% { transform: rotate(0deg); }
}
@keyframes localrot-stars {
  0% { opacity: 0; transform: translateX(-4px); }
  20%, 80% { opacity: 1; }
  100% { opacity: 0; transform: translateX(4px); }
}
@media (prefers-reduced-motion: reduce) {
  .localrot-podium-move { animation: none !important; }
}
`

const headline: React.CSSProperties = {
  flex: '0 0 auto',
  padding: '18px 16px 0',
  textAlign: 'center',
  font: `900 34px/1.15 ${FONT}`,
  color: '#ffffff',
  textShadow: '0 3px 0 rgba(31,109,146,0.55)',
}

/** The three steps. Takes what height there is and stands on the bottom of it. */
const stage: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  gap: 6,
  padding: '0 16px',
}

const column: React.CSSProperties = {
  flex: '0 1 190px',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
}

const standing: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-end',
  gap: 4,
  minHeight: 40,
}

const block: React.CSSProperties = {
  borderRadius: '14px 14px 0 0',
  display: 'flex',
  justifyContent: 'center',
  paddingTop: 8,
  boxSizing: 'border-box',
  font: `900 40px/1 ${FONT}`,
  color: 'rgba(74,53,36,0.55)',
}

const figure: React.CSSProperties = {
  flex: '0 1 auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minWidth: 0,
}

/** The sand in front of the podium, where everybody who fell lies. */
const sand: React.CSSProperties = {
  flex: '0 0 auto',
  minHeight: 78,
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  alignItems: 'flex-end',
  gap: '4px 18px',
  padding: '10px 16px 0',
  background: ISLAND.sand,
  borderTop: `3px solid ${ISLAND.warmSand}`,
}

const flopWrap: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}

const stars: React.CSSProperties = {
  position: 'absolute',
  top: -6,
  left: 0,
  font: `700 13px/1 ${FONT}`,
  color: ISLAND.sun,
  textShadow: '0 1px 0 rgba(0,0,0,0.25)',
  letterSpacing: 2,
}

const label: React.CSSProperties = {
  maxWidth: 110,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  font: `600 13px/1.3 ${FONT}`,
  marginTop: 2,
}

/** Two corners and nothing between them. */
const footer: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  padding: '12px 16px 16px',
  background: ISLAND.sand,
}

const corner: React.CSSProperties = {
  padding: '10px 20px',
  font: `700 15px/1.2 ${FONT}`,
  whiteSpace: 'nowrap',
}

const replay: React.CSSProperties = {
  borderRadius: 999,
  border: 'none',
  background: ISLAND.sun,
  boxShadow: '0 4px 0 #d79a22',
  color: ISLAND.ink,
  cursor: 'pointer',
}

const waiting: React.CSSProperties = {
  borderRadius: 999,
  background: ISLAND.warmSand,
  color: ISLAND.fadedInk,
}
