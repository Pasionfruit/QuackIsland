/**
 * Pet Race, on the screen.
 *
 * The course is drawn in its own canvas by `PetRaceScene`; this is the shell:
 * the table you choose from, the keys and the mouse in, `useRaceNet` deciding
 * what they do, and the words - the clock, where you are in the field, what is
 * left in the tank, and the results.
 *
 * **Ten seconds at the table.** Five cards with the numbers on them; click one,
 * or press 1 to 5. You may change your mind as often as you like until the
 * table comes down. Choose nothing and you get the fish, which is a punishment
 * and is supposed to be.
 *
 * **WASD to move, hold left click to boost.** Boost is a hold rather than a
 * press because what it spends is a tank measured in seconds - there is nothing
 * for a single click to mean. The button is watched on the window as well as on
 * the course, so letting go with the pointer off the canvas still lets go.
 */
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap } from 'three'
import { getNet, useNet, usePeers } from '../../09-net'
import { CountOver, replayMinigame, useFinish, type MinigameRun } from '../../15-minigames'
import { FOV } from './camera'
import { TRACK } from './course'
import { PETS, petById, petBars, type PetId } from './pets'
import { PetRaceScene } from './PetRaceScene'
import { COLOURS, petOf, placings, progress, tankOf, timeLeft, type Game, type Racer } from './rules'
import { myId, newGame, waitingGame } from './setup'
import { useRaceNet } from './useRaceNet'

const LOOK = {
  ink: '#33321f',
  faded: '#7d7b60',
  card: '#f7f2df',
  sun: '#ffc94d',
  danger: '#c8443c',
  good: '#2f9e5b',
  boost: '#f0a41c',
} as const

const FONT = "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

const FACES: Record<PetId, string> = { dog: '🐕', cat: '🐈', rabbit: '🐇', hamster: '🐹', fish: '🐟' }

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

const seconds = (s: number) => `${s.toFixed(2)}s`

export function PetRaceScreen({ run }: { run: MinigameRun }) {
  // First hook on purpose: the run-localrot skill reads the race from here.
  const [game, setGame] = useState<Game>(() => (getNet().host ? newGame() : waitingGame()))
  // Held back through the two seconds of Finish; see `useFinish`.
  const results = useFinish(game.over, () =>
    placings(game).map((e) => ({ id: e.racer.id, place: e.place, name: nameOf(e.racer.id), colour: COLOURS[e.index % COLOURS.length], mine: e.racer.id === me })),
  )
  const paused = useRef(run.paused)
  paused.current = run.paused

  const net = useNet()
  const peers = usePeers()
  const me = net.id ?? myId()
  const wire = useRaceNet()
  const live = useRef(game)
  live.current = game

  const keys = useRef({ up: false, down: false, left: false, right: false })
  const boost = useRef(false)
  const [pick, setPick] = useState<PetId | null>(null)
  const picked = useRef<PetId | null>(null)
  picked.current = pick

  const nameOf = (id: string) => (id === me ? 'you' : (peers.find((p) => p.id === id)?.name ?? id))

  const choosing = game.phase === 'choosing' && !game.over

  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = keys.current
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          k.up = down
          break
        case 'KeyS':
        case 'ArrowDown':
          k.down = down
          break
        case 'KeyA':
        case 'ArrowLeft':
          k.left = down
          break
        case 'KeyD':
        case 'ArrowRight':
          k.right = down
          break
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
        case 'Digit4':
        case 'Digit5': {
          // The table only: 1 to 5 are the five cards, left to right.
          if (down && live.current.phase === 'choosing') setPick(PETS[Number(e.code.slice(5)) - 1].id)
          break
        }
        default:
          return
      }
      e.preventDefault()
    }
    const down = (e: KeyboardEvent) => set(e, true)
    const up = (e: KeyboardEvent) => set(e, false)
    const forget = () => {
      keys.current = { up: false, down: false, left: false, right: false }
      boost.current = false
    }
    const release = (e: MouseEvent) => {
      if (e.button === 0) boost.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', forget)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', forget)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', forget)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', forget)
    }
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const current = live.current
      const k = keys.current
      // Up on the keyboard is down the course, which is -Z.
      const hands = {
        x: (k.right ? 1 : 0) - (k.left ? 1 : 0),
        z: (k.down ? 1 : 0) - (k.up ? 1 : 0),
        boost: boost.current,
      }
      if (wire.advance(current, dt, { hands, pet: picked.current }, paused.current)) setGame({ ...current })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const ready = game.racers.length > 0
  const mine = game.racers.find((r) => r.mine)
  const order = placings(game)
  const place = order.find((entry) => entry.racer.id === me)?.place ?? 0
  const left = timeLeft(game)
  const tank = mine ? tankOf(mine) : 0
  const petsPicked = game.racers.filter((r) => r.pet !== null).length

  return (
    <div style={page}>
      <div style={hud}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Pet Race</span>
        {ready ? (
          <>
            <span style={{ ...pill, background: left <= 5 && game.phase === 'racing' ? LOOK.danger : LOOK.ink, color: '#fff' }} data-time-left={Math.ceil(left)}>
              {game.over ? 'done' : `${Math.ceil(left)}s`}
            </span>
            <span style={{ ...pill, background: LOOK.card }} data-phase={game.over ? 'over' : game.phase}>
              {game.over
                ? 'race over'
                : game.phase === 'choosing'
                  ? `choose your pet - ${petsPicked}/${game.racers.length} in`
                  : game.phase === 'countdown'
                    ? 'get set…'
                    : `${ordinal(place)} of ${game.racers.length}`}
            </span>
            {mine && game.phase !== 'choosing' ? (
              <span style={{ ...pill, background: LOOK.card }} data-pet={petOf(mine)}>
                {FACES[petOf(mine)]} {petById(petOf(mine)).name}
              </span>
            ) : null}
            {mine && game.phase === 'racing' ? (
              <span style={{ ...pill, background: LOOK.card, minWidth: 108 }} data-distance={Math.round(progress(mine))}>
                {Math.round(progress(mine))}/{TRACK.length} m
              </span>
            ) : null}
          </>
        ) : (
          <span style={{ color: LOOK.faded }}>waiting for the host…</span>
        )}
        <span style={{ flex: 1 }} />
        {mine && game.phase === 'racing' ? <Tank tank={tank} racer={mine} /> : null}
      </div>

      <div
        style={board}
        data-board
        onPointerDown={(e) => {
          if (e.button !== 0 || paused.current) return
          boost.current = true
        }}
      >
        {ready ? <Stage live={live} /> : null}
        {ready && !game.over ? <Standings game={game} me={me} nameOf={nameOf} /> : null}
        {ready && game.phase === 'racing' ? <Hints /> : null}
        {/* The screen's own three-two-one and Start!, voiced - only here, as the
            race is counted in, rather than before the choosing. */}
        <CountOver left={ready && game.phase === 'countdown' && !game.over ? left : null} />
        {ready && choosing ? <Table game={game} pick={pick} onPick={setPick} left={left} /> : null}
      </div>

      {results && ready ? <Over game={game} me={me} nameOf={nameOf} onAgain={net.host ? replayMinigame : null} /> : null}
    </div>
  )
}

/**
 * What is left in the tank, whether it is going down this second, and - the one
 * that needs saying in words - whether the button is doing nothing because you
 * ran it dry and have not got your breath back yet.
 */
function Tank({ tank, racer }: { tank: number; racer: Racer }) {
  const state = racer.boosting ? 'boosting' : racer.winded ? 'winded' : 'ready'
  return (
    <span style={{ ...pill, background: LOOK.card, display: 'flex', alignItems: 'center', gap: 6 }} data-tank={Math.round(tank * 100)} data-burn={state}>
      <span style={{ fontWeight: 700, color: racer.winded ? LOOK.danger : LOOK.ink }}>{racer.winded ? 'winded' : 'tank'}</span>
      <span style={{ width: 96, height: 9, borderRadius: 999, background: '#dcd6bd', overflow: 'hidden' }}>
        <span
          style={{
            display: 'block',
            width: `${Math.round(tank * 100)}%`,
            height: '100%',
            background: racer.boosting ? LOOK.boost : racer.winded ? LOOK.danger : tank > 0.3 ? LOOK.good : LOOK.sun,
            transition: 'width 90ms linear',
          }}
        />
      </span>
    </span>
  )
}

/** The table: five pets, their numbers, and ten seconds. */
function Table({ game, pick, onPick, left }: { game: Game; pick: PetId | null; onPick: (pet: PetId) => void; left: number }) {
  return (
    <div style={tableWrap} data-table>
      {/* Light on the dark backdrop: this sits over the course, not on a card. */}
      <div style={{ textAlign: 'center', marginBottom: 12, color: '#ffffff', textShadow: '0 2px 6px rgba(0,0,0,0.55)' }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Choose your pet</div>
        <div style={{ opacity: 0.88 }}>
          {Math.ceil(left)}s — no choice means the fish{pick ? '' : ', and you have not chosen'}
        </div>
      </div>
      <div style={cards}>
        {PETS.map((pet, i) => {
          const chosen = pick === pet.id
          const others = game.racers.filter((r) => r.pet === pet.id && !r.mine).length
          return (
            <button
              key={pet.id}
              type="button"
              data-pick={pet.id}
              data-chosen={chosen ? 1 : 0}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onPick(pet.id)
              }}
              style={{
                ...card,
                borderColor: chosen ? LOOK.sun : 'transparent',
                boxShadow: chosen ? `0 0 0 3px ${LOOK.sun}, 0 4px 0 rgba(0,0,0,0.16)` : '0 4px 0 rgba(0,0,0,0.16)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 22 }}>{FACES[pet.id]}</span>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{pet.name}</span>
                <span style={{ flex: 1 }} />
                <span style={{ color: LOOK.faded, fontSize: 11 }}>{i + 1}</span>
              </div>
              <div style={{ color: LOOK.faded, fontSize: 11, minHeight: 44, textAlign: 'left', lineHeight: 1.35 }}>{pet.blurb}</div>
              <Bars pet={pet.id} />
              <div style={{ fontSize: 11, color: others > 0 ? LOOK.ink : 'transparent' }}>
                {others} other{others === 1 ? '' : 's'}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The five numbers as bars, each against the best pet at that thing. */
function Bars({ pet }: { pet: PetId }) {
  const bars = petBars(pet)
  const rows: [string, number][] = [
    ['speed', bars.speed],
    ['boost', bars.boost],
    ['tank', bars.stamina],
    ['regrow', bars.regen],
    ['grip', bars.grip],
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, margin: '6px 0' }}>
      {rows.map(([name, value]) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
          <span style={{ width: 38, textAlign: 'left', color: LOOK.faded }}>{name}</span>
          <span style={{ flex: 1, height: 6, borderRadius: 999, background: '#e2dcc4', overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${Math.round(Math.max(0, value) * 100)}%`, height: '100%', background: LOOK.ink }} />
          </span>
        </div>
      ))}
    </div>
  )
}

/** The field as it stands, whoever is ahead first. */
function Standings({ game, me, nameOf }: { game: Game; me: string; nameOf: (id: string) => string }) {
  return (
    <div style={standings} data-standings>
      {placings(game).map((entry) => (
        <div key={entry.racer.id} style={row}>
          <span style={{ opacity: 0.55, minWidth: 14, fontSize: 12 }}>{entry.place}</span>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
          <span>{FACES[petOf(entry.racer)]}</span>
          <span
            style={{
              flex: 1,
              fontWeight: entry.racer.id === me ? 700 : 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {nameOf(entry.racer.id)}
          </span>
          <span style={{ fontSize: 11, color: entry.racer.finishedAt !== null ? LOOK.good : LOOK.faded }}>
            {entry.racer.finishedAt !== null ? seconds(entry.racer.finishedAt) : `${Math.round(progress(entry.racer))}m`}
          </span>
        </div>
      ))}
    </div>
  )
}

function Hints() {
  return (
    <div style={hints}>
      <span>
        <b>WASD</b> run
      </span>
      <span>
        <b>hold left click</b> boost
      </span>
    </div>
  )
}

/** The canvas, rendered once - see `PetRaceScene`. */
const Stage = memo(function Stage({ live }: { live: RefObject<Game> }) {
  return (
    <Canvas
      shadows={SHADOWS}
      dpr={DPR}
      camera={CAMERA}
      gl={GL}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
    >
      <PetRaceScene live={live} />
    </Canvas>
  )
})

const SHADOWS = { type: PCFShadowMap }
const DPR: [number, number] = [1, 2]
const CAMERA = { fov: FOV, near: 0.3, far: 400, position: [0, 7.4, 15] as [number, number, number] }
const GL = { antialias: true, powerPreference: 'high-performance' as const }

/** The results: first home first, and whoever never got there by how far they got. */
function Over({ game, me, nameOf, onAgain }: { game: Game; me: string; nameOf: (id: string) => string; onAgain: (() => void) | null }) {
  const order = placings(game)
  const mine = order.find((entry) => entry.racer.id === me)
  const winners = order.filter((entry) => entry.place === 1)
  const home = winners[0]?.racer.finishedAt !== null && winners[0]?.racer.finishedAt !== undefined
  const headline = !mine
    ? 'Race over'
    : mine.racer.finishedAt === null
      ? 'Never made it home'
      : mine.place === 1
        ? 'First past the post!'
        : `${ordinal(mine.place)} place`
  const sub = home
    ? `${winners.map((w) => nameOf(w.racer.id)).join(' and ')} got there in ${seconds(winners[0].racer.finishedAt!)} on the ${petById(petOf(winners[0].racer)).name.toLowerCase()}.`
    : 'Nobody finished. Thirty seconds is not very long.'
  return (
    <div style={overBackdrop}>
      <div style={overCard}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{headline}</div>
        <div style={{ color: LOOK.faded, marginBottom: 12 }}>{sub}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {order.map((entry) => (
            <div key={entry.racer.id} style={row} data-place={entry.place}>
              <span style={{ opacity: 0.5, minWidth: 18 }}>{entry.place}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: COLOURS[entry.index % COLOURS.length] }} />
              <span>{FACES[petOf(entry.racer)]}</span>
              <span style={{ flex: 1, fontWeight: entry.racer.id === me ? 700 : 400 }}>{nameOf(entry.racer.id)}</span>
              <span style={{ opacity: 0.6, fontSize: 12 }}>{petById(petOf(entry.racer)).name}</span>
              <span style={{ fontWeight: 700, minWidth: 72, textAlign: 'right' }}>
                {entry.racer.finishedAt !== null ? seconds(entry.racer.finishedAt) : `${Math.round(entry.racer.best)} m`}
              </span>
            </div>
          ))}
        </div>
        {onAgain ? (
          <button type="button" onClick={onAgain} style={againButton} data-again>
            again
          </button>
        ) : (
          <div style={{ ...againButton, opacity: 0.55, textAlign: 'center' }}>waiting for the host</div>
        )}
      </div>
    </div>
  )
}

const page: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 42,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: '#a9d8ef',
  color: LOOK.ink,
  font: `14px/1.5 ${FONT}`,
  userSelect: 'none',
}

const hud: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  background: LOOK.card,
  borderBottom: '2px solid #e4dcc0',
  flexWrap: 'wrap',
}

const pill: React.CSSProperties = {
  padding: '3px 12px',
  borderRadius: 999,
  font: `600 12px/1.5 ${FONT}`,
  whiteSpace: 'nowrap',
}

const board: React.CSSProperties = { flex: 1, minHeight: 0, width: '100%', position: 'relative', cursor: 'pointer' }

const standings: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  width: 200,
  maxWidth: 'calc(100% - 24px)',
  padding: '8px 12px',
  borderRadius: 14,
  background: 'rgba(247, 242, 223, 0.92)',
  boxShadow: '0 3px 0 rgba(0,0,0,0.12)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  font: `13px/1.4 ${FONT}`,
  pointerEvents: 'none',
}

const hints: React.CSSProperties = {
  position: 'absolute',
  left: 12,
  bottom: 12,
  display: 'flex',
  gap: 12,
  padding: '6px 12px',
  borderRadius: 999,
  background: 'rgba(247, 242, 223, 0.88)',
  font: `12px/1.4 ${FONT}`,
  pointerEvents: 'none',
}

const tableWrap: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  background: 'rgba(18, 30, 20, 0.62)',
  color: LOOK.ink,
}

const cards: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  justifyContent: 'center',
  maxWidth: '100%',
}

const card: React.CSSProperties = {
  width: 176,
  padding: '10px 12px',
  borderRadius: 16,
  border: '2px solid transparent',
  background: LOOK.card,
  color: LOOK.ink,
  font: `13px/1.4 ${FONT}`,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  textAlign: 'left',
}

const overBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(20, 34, 20, 0.5)',
}

const overCard: React.CSSProperties = {
  width: 460,
  maxWidth: 'calc(100vw - 32px)',
  padding: '18px 20px',
  borderRadius: 20,
  background: LOOK.card,
  boxShadow: '0 6px 0 rgba(0,0,0,0.18)',
  font: `14px/1.5 ${FONT}`,
  color: LOOK.ink,
}

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

const againButton: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 16px',
  borderRadius: 999,
  border: 'none',
  background: LOOK.sun,
  boxShadow: '0 4px 0 #d79a22',
  color: LOOK.ink,
  font: `700 16px/1.2 ${FONT}`,
  cursor: 'pointer',
}
