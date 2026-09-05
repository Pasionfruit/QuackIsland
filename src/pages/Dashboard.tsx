import { PAL } from '../art/palette'
import { campfire, pine } from '../art/props'
import { SceneCanvas } from '../components/SceneCanvas'
import { ART_H, ART_W, GAMES, type GameEntry } from '../games/registry'
import { ROSTER, drawChar } from '../games/smash/engine/characters'
import type { CharDef } from '../games/smash/engine/types'
import { rect } from '../lib/draw'

const STATUS_LABEL: Record<GameEntry['status'], string> = {
  live: 'Playable',
  prototype: 'Prototype',
  concept: 'Concept',
}

function GameCard({ game, onOpen }: { game: GameEntry; onOpen: (id: string) => void }) {
  const playable = game.status === 'live'
  const open = () => playable && onOpen(game.id)
  return (
    <div
      className={`card ${playable ? 'card--playable' : 'card--locked'}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      role="button"
      tabIndex={playable ? 0 : -1}
      aria-disabled={!playable}
    >
      <div className="card__art">
        <SceneCanvas width={ART_W} height={ART_H} draw={game.art} fluid />
        <span className={`chip card__badge ${playable ? 'chip--live' : 'chip--soon'}`}>
          <span className="dot" /> {STATUS_LABEL[game.status]}
        </span>
      </div>
      <div className="card__body">
        <span className="card__title">{game.title}</span>
        <span className="card__desc">{game.blurb}</span>
        <span className="card__foot">
          <span>
            {game.genre} &middot; {game.players}
          </span>
          <span className="card__cta">{playable ? 'PLAY >' : 'SOON'}</span>
        </span>
      </div>
    </div>
  )
}

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="bar">
      <span style={{ width: 46 }}>{label}</span>
      <span className="bar__track">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`bar__pip ${i <= value ? 'bar__pip--on' : ''}`} />
        ))}
      </span>
    </div>
  )
}

function FighterCard({ def }: { def: CharDef }) {
  return (
    <div className={`fighter ${def.locked ? 'fighter--locked' : ''}`}>
      <SceneCanvas
        width={48}
        height={48}
        draw={(ctx, frame) => {
          rect(ctx, 0, 0, 48, 48, '#cfdfd8')
          rect(ctx, 0, 30, 48, 18, PAL.grass)
          rect(ctx, 0, 30, 48, 2, PAL.grassLit)
          pine(ctx, 7, 32, 16)
          pine(ctx, 41, 32, 13)
          const bob = Math.sin(frame * 0.06) * 1
          drawChar(ctx, def, 24, 42 + bob, {
            facing: 1,
            scale: 36 / def.height,
            phase: frame,
            shadow: true,
          })
        }}
      />
      <div style={{ flex: 1 }}>
        <div className="fighter__name" style={{ color: def.theme.dark }}>
          {def.name}
          {def.locked && <span className="fighter__lock">LOCKED</span>}
        </div>
        <div className="fighter__title">{def.locked ? def.unlockHint ?? def.title : def.title}</div>
        <div className="bars">
          <StatBar label="PWR" value={def.stats.power} />
          <StatBar label="SPD" value={def.stats.speed} />
          <StatBar label="WGT" value={def.stats.weight} />
        </div>
      </div>
    </div>
  )
}

export function Dashboard({ onOpen }: { onOpen: (id: string) => void }) {
  const live = GAMES.filter((g) => g.status === 'live').length

  return (
    <div>
      <section className="hero">
        <div className="panel hero__copy">
          <div className="panel__title">Welcome to Animal Instinct</div>
          <h2>
            One camp.
            <br />
            Many games.
          </h2>
          <p>
            Animal Instinct is a little world of low-poly animals with jobs and opinions. Every
            game here shares the same cast, the same palette and the same two-players-one-keyboard
            rule - and anything on the shelf can be hosted for friends to join.
          </p>
          <div className="chiprow">
            <span className="chip">Keyboard only</span>
            <span className="chip">Two players, one keyboard</span>
            <span className="chip">Host a room, friends join</span>
            <span className="chip">Runs in the browser</span>
          </div>
          <button className="btn btn--primary" onClick={() => onOpen('smash')}>
            Play Knockout!
          </button>
        </div>
        <div className="panel">
          <div className="panel__title">Around the camp</div>
          <div className="statgrid">
            <div className="stat">
              <div className="stat__num">{live}</div>
              <div className="stat__label">Playable</div>
            </div>
            <div className="stat">
              <div className="stat__num">{GAMES.length - live}</div>
              <div className="stat__label">In concept</div>
            </div>
            <div className="stat">
              <div className="stat__num">{ROSTER.length}</div>
              <div className="stat__label">Characters</div>
            </div>
            <div className="stat">
              <div className="stat__num">1</div>
              <div className="stat__label">Map</div>
            </div>
          </div>
          <div className="firestrip">
            <SceneCanvas
              width={150}
              height={40}
              fluid
              draw={(ctx, frame) => {
                rect(ctx, 0, 0, 150, 40, '#dfe6d9')
                rect(ctx, 0, 28, 150, 12, PAL.grass)
                rect(ctx, 0, 28, 150, 2, PAL.grassLit)
                pine(ctx, 14, 30, 22)
                pine(ctx, 134, 30, 18)
                campfire(ctx, 75, 32, frame, 0.9)
                drawChar(ctx, ROSTER[0], 54, 32, {
                  facing: 1,
                  scale: 24 / ROSTER[0].height,
                  phase: frame,
                  shadow: true,
                })
                drawChar(ctx, ROSTER[1], 98, 32, {
                  facing: -1,
                  scale: 26 / ROSTER[1].height,
                  phase: frame + 40,
                  shadow: true,
                })
              }}
            />
          </div>
          <div className="keys" style={{ marginTop: 12 }}>
            <div className="keyrow">
              <span>Two on one keyboard</span>
              <kbd>Always</kbd>
            </div>
            <div className="keyrow">
              <span>Host &amp; join</span>
              <kbd>Room code</kbd>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="panel__title">Games</div>
        <div className="gamegrid">
          {GAMES.map((g) => (
            <GameCard key={g.id} game={g} onOpen={onOpen} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="panel__title">The cast</div>
        <div className="roster">
          {ROSTER.map((def) => (
            <FighterCard key={def.id} def={def} />
          ))}
          <div className="fighter" style={{ justifyContent: 'center', color: 'var(--dimmer)' }}>
            <span className="pixel" style={{ fontSize: 9 }}>
              + MORE ANIMALS SOON
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
