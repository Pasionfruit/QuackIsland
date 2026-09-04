import { PixelCanvas } from '../components/PixelCanvas'
import { ART_H, ART_W, GAMES, type GameEntry } from '../games/registry'
import { ROSTER } from '../games/smash/engine/characters'
import { drawBody } from '../games/smash/engine/render'
import { px } from '../lib/pixel'
import type { CharDef } from '../games/smash/engine/types'

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
        <PixelCanvas width={ART_W} height={ART_H} draw={game.art} fluid />
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
    <div className="fighter">
      <PixelCanvas
        width={44}
        height={44}
        scale={1}
        draw={(ctx, frame) => {
          px(ctx, 0, 0, 44, 44, '#0a0920')
          for (let i = 0; i < 8; i++) px(ctx, (i * 13) % 44, (i * 7) % 30, 1, 1, '#2a2560')
          const bob = Math.sin(frame * 0.07) * 1.2
          drawBody(ctx, def, 22, 38 + bob, { facing: 1, scale: 1.05 })
          px(ctx, 8, 40, 28, 2, '#161238')
        }}
      />
      <div style={{ flex: 1 }}>
        <div className="fighter__name" style={{ color: def.colors.body }}>
          {def.name}
        </div>
        <div className="fighter__title">{def.title}</div>
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
          <div className="panel__title">Welcome to Polyland</div>
          <h2>
            One roster.
            <br />
            Many games.
          </h2>
          <p>
            Polyland is a little arcade cabinet for a cast of polygon characters. Every game here
            reuses the same fighters, the same palette and the same chunky pixels - start with the
            fighter, then take the cast anywhere.
          </p>
          <button className="btn btn--primary" onClick={() => onOpen('smash')}>
            Play Polyland Smash
          </button>
        </div>
        <div className="panel">
          <div className="panel__title">Cabinet status</div>
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
              <div className="stat__label">Fighters</div>
            </div>
            <div className="stat">
              <div className="stat__num">1</div>
              <div className="stat__label">Stage</div>
            </div>
          </div>
          <div className="keys" style={{ marginTop: 14 }}>
            <div className="keyrow">
              <span>Renderer</span>
              <kbd>480 x 270</kbd>
            </div>
            <div className="keyrow">
              <span>Simulation</span>
              <kbd>60 Hz fixed</kbd>
            </div>
            <div className="keyrow">
              <span>Input</span>
              <kbd>Keyboard</kbd>
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
        <div className="panel__title">Roster</div>
        <div className="roster">
          {ROSTER.map((def) => (
            <FighterCard key={def.id} def={def} />
          ))}
          <div className="fighter" style={{ justifyContent: 'center', color: 'var(--dimmer)' }}>
            <span className="pixel" style={{ fontSize: 9 }}>
              + MORE SHAPES SOON
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
