import { CONTROL_HINTS } from '../lib/input'
import { SceneCanvas } from '../components/SceneCanvas'
import { ART_H, ART_W, type GameEntry } from './registry'

/**
 * The panel every unbuilt Polyland game gets.
 *
 * It is deliberately the same shape as a finished game's panel - big scene up
 * top, rules and controls below - so filling one in later is a matter of
 * swapping the scene for a real canvas, not redesigning the page.
 */
export function TemplatePanel({ game, onBack }: { game: GameEntry; onBack: () => void }) {
  return (
    <div>
      <div className="gamehead">
        <h2>{game.title}</h2>
        <span className="chip chip--soon">
          <span className="dot" /> In concept
        </span>
        <span className="chip">{game.genre}</span>
        <span className="chip">{game.players}</span>
        <div className="spacer" />
        <button className="btn btn--ghost btn--sm" onClick={onBack}>
          Back to the camp
        </button>
      </div>

      <div className="stage-wrap stage-wrap--concept">
        <SceneCanvas width={ART_W} height={ART_H} draw={game.art} fluid />
        <div className="stage-wrap__veil">
          <span className="chip chip--gold">Not playable yet</span>
        </div>
      </div>

      <div className="infogrid">
        <div className="panel">
          <div className="panel__title">The idea</div>
          <p style={{ marginTop: 0 }}>{game.tagline}</p>
          <p className="muted">{game.blurb}</p>
        </div>

        <div className="panel">
          <div className="panel__title">What goes in it</div>
          <ul className="planlist">
            {game.plan.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <div className="panel__title">How you will play it</div>
          <div className="keys">
            <div className="keyrow">
              <span>Players</span>
              <kbd>{game.players}</kbd>
            </div>
            <div className="keyrow">
              <span>Same keyboard</span>
              <kbd>2 players</kbd>
            </div>
            <div className="keyrow">
              <span>Everyone else</span>
              <kbd>Room code</kbd>
            </div>
          </div>
          <p className="muted" style={{ marginBottom: 0, marginTop: 12 }}>
            Every Animal Instinct game shares one control rig, so this one already has its inputs
            decided: {CONTROL_HINTS[0].rows.map(([, key]) => key).join(', ')} for player one,
            the arrow cluster for player two, and the same host-and-join room codes as
            Knockout!.
          </p>
        </div>
      </div>
    </div>
  )
}
