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
 * Drawn, not modelled: the bodies are the island's red pill in flat SVG,
 * painted the colour each player was in the game. A podium is a moment rather
 * than a scene, and a DOM page costs no draw calls at all.
 */
import { useEffect } from 'react'
import { useNet } from '../../09-net'
import { minigameById } from './catalogue'
import { FONT, ISLAND, bar, button, screen, wordmark } from './look'
import { rankStandings, type Placed, type Pose } from './podium'
import type { MinigameRun } from './registry'
import { PODIUM_MUSIC, playOnce, stopOne } from './sound'
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
          <button type="button" onClick={backOut} style={{ ...button, ...corner }} data-dashboard>
            minigame dashboard
          </button>
        ) : null}
        {net.host ? (
          <button type="button" onClick={replayMinigame} style={{ ...corner, ...replay }} data-replay>
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
          <Arms pose={pose} colour={player.colour!} />
          <rect x={25} y={20} width={50} height={116} rx={25} fill={player.colour} />
          <Face pose={pose} />
        </svg>
      </div>
      <Name player={player} />
    </div>
  )
}

/** Up for joy; hanging for everything else. */
function Arms({ pose, colour }: { pose: Pose; colour: string }) {
  const up = pose === 'joy'
  const arm = { stroke: colour, strokeWidth: 12, strokeLinecap: 'round' as const }
  return up ? (
    <>
      <line x1={30} y1={70} x2={8} y2={28} {...arm} />
      <line x1={70} y1={70} x2={92} y2={28} {...arm} />
    </>
  ) : (
    <>
      <line x1={29} y1={68} x2={17} y2={104} {...arm} />
      <line x1={71} y1={68} x2={83} y2={104} {...arm} />
    </>
  )
}

/** Eyes and a mouth, in the ink the island's avatar uses for its face. */
function Face({ pose }: { pose: Pose }) {
  const ink = '#2a1712'
  const line = { stroke: ink, strokeWidth: 4.5, strokeLinecap: 'round' as const, fill: 'none' }
  if (pose === 'joy') {
    return (
      <>
        <path d="M35 52 q6 -9 12 0" {...line} />
        <path d="M53 52 q6 -9 12 0" {...line} />
        <path d="M37 62 h26 q0 18 -13 18 q-13 0 -13 -18z" fill={ink} />
        <path d="M43 75 q7 -6 14 0 q-7 5 -14 0z" fill="#e8705a" />
      </>
    )
  }
  return (
    <>
      <circle cx={41} cy={50} r={4.5} fill={ink} />
      <circle cx={59} cy={50} r={4.5} fill={ink} />
      {pose === 'happy' ? <path d="M39 63 q11 11 22 0" {...line} /> : <path d="M40 67 h20" {...line} />}
    </>
  )
}

/** A body flat on its face in the sand: we see its back, and the stars. */
function Flop({ player, delay }: { player: Placed; delay: number }) {
  return (
    <div style={flopWrap} data-pose="flop" data-player={player.id}>
      <div className="localrot-podium-move" style={{ animation: `localrot-flop 0.7s cubic-bezier(.55,0,.8,.4) ${delay}s both`, transformOrigin: '92% 90%' }}>
        <svg viewBox="0 0 150 64" style={{ display: 'block', width: 'calc(min(120px, 15vh) * 1.1)', height: 'auto' }} aria-hidden>
          {/* Arms flung out ahead, where the face went down. */}
          <line x1={24} y1={30} x2={4} y2={16} stroke={player.colour} strokeWidth={10} strokeLinecap="round" />
          <line x1={24} y1={50} x2={4} y2={60} stroke={player.colour} strokeWidth={10} strokeLinecap="round" />
          <rect x={12} y={16} width={132} height={44} rx={22} fill={player.colour} />
          <rect x={12} y={16} width={132} height={44} rx={22} fill="rgba(0,0,0,0.12)" />
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
