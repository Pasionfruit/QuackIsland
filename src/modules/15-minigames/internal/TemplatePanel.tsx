/**
 * What a minigame looks like before anybody has built it.
 *
 * One component, not forty-one files. Every unbuilt game gets this, filled in
 * from its catalogue entry, which is what makes "template panels for all of
 * them" a thing that already exists rather than a thing to generate. A game
 * stops using it the moment it registers a build - see `registry.ts` - and
 * nothing here has to be deleted when that happens.
 *
 * It says what it knows and admits what it does not. The two things it does
 * not know yet are the two passes still to come: the rules, and the controls
 * for the games whose controls were never written down.
 */
import { BUILD_STEPS, minigameById, nextStep } from './catalogue'
import { KIND_COLOUR, RESERVED_LOOK, STEP_LOOK, bar, body, button, screen } from './look'
import type { MinigameRun } from './registry'
import { backOut } from './state'

/** What each stage means, said once, on every game's page. */
const STEP_MEANS: Record<(typeof BUILD_STEPS)[number], string> = {
  environment: 'The state this game keeps, and the place it happens in.',
  controls: 'The inputs wired into that state, and what each one does to it.',
  assets: 'Models, sprites and sound. Last, and never first.',
}

const KIND_LABEL = {
  'free-for-all': 'free-for-all · everybody at once',
  'one-vs-all': 'one vs all · one player, everybody else watching',
} as const

export function TemplatePanel({ run }: { run: MinigameRun }) {
  const game = minigameById(run.id)
  const up = nextStep(game)
  const named = !game.reserved
  const says = game.reserved ? RESERVED_LOOK.label : up ? `next: ${STEP_LOOK[up].label}` : 'playable'
  const saysColour = game.reserved ? RESERVED_LOOK.colour : up ? STEP_LOOK[up].colour : '#7fd1b9'

  return (
    <div style={screen}>
      <div style={bar}>
        <button type="button" onClick={backOut} style={button}>
          back
        </button>
        <span style={{ opacity: 0.4 }}>{game.number}</span>
        <span style={{ letterSpacing: 1, color: '#b39ddb' }}>{game.title.toUpperCase()}</span>
        <span style={{ color: KIND_COLOUR[game.kind], opacity: 0.8 }}>
          {KIND_LABEL[game.kind]}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ color: saysColour }}>{says}</span>
      </div>

      <div style={body}>
        <div style={sheet}>
          <div style={{ fontSize: 18, marginBottom: 4 }}>{game.title}</div>
          <div style={{ opacity: 0.55, marginBottom: 16 }}>
            {named ? game.pitch : 'A number waiting for a game. Name it and it starts here.'}
          </div>

          <Section title="Controls">
            {game.controls.length === 0 ? (
              <div style={{ opacity: 0.4 }}>
                Not written down yet - this is what the controls pass is for.
              </div>
            ) : (
              <div style={controls}>
                {game.controls.map((control) => (
                  <div key={control.input} style={controlRow}>
                    <span style={key}>{control.input}</span>
                    <span style={{ opacity: 0.7 }}>{control.does}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="How it plays">
            <div style={{ opacity: 0.4 }}>
              The rules go here, in the description pass. Two to eight players,
              fast, and over quickly - the same as all of them.
            </div>
          </Section>

          {/* The three stages, in order, with the one to do next marked. This
              is the working checklist for whoever picks this game up. */}
          <Section title="Stages">
            <div style={controls}>
              {BUILD_STEPS.map((step) => {
                const done = game.done[step]
                const now = step === up
                return (
                  <div key={step} style={controlRow} data-step={step}>
                    <span
                      style={{
                        ...key,
                        minWidth: 132,
                        borderColor: done || now ? STEP_LOOK[step].colour : 'rgba(255,255,255,0.16)',
                        color: done || now ? STEP_LOOK[step].colour : '#f2ece2',
                        opacity: done || now ? 1 : 0.5,
                      }}
                    >
                      {done ? '✓ ' : now ? '→ ' : '   '}
                      {STEP_LOOK[step].label}
                    </span>
                    <span style={{ opacity: done ? 0.45 : 0.7 }}>{STEP_MEANS[step]}</span>
                  </div>
                )
              })}
            </div>
          </Section>

          <Section title="State">
            {/* The seam, stated plainly: this game has no state because it has
                no build, and the wrapper around it is the same for all of them. */}
            <div style={{ opacity: 0.4 }}>
              {run.game === null
                ? 'None yet. The environment stage is what gives this game a state of its own; until then there is nothing to hold.'
                : 'Held by the game itself.'}
            </div>
          </Section>

          <div style={note}>
            This is a template. Nothing here is playable - the screen draws this
            for any game that has not registered a build, and stops the moment
            one does.
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={heading}>{title}</div>
      {children}
    </div>
  )
}

/**
 * The reading column.
 *
 * Capped and centred rather than run to the edges: this is prose and a table,
 * and a line of text a whole monitor wide is a line nobody reads twice. The
 * page behind it is still the whole window.
 */
const sheet: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: '100%',
  maxWidth: 720,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
}

const heading: React.CSSProperties = {
  letterSpacing: 1,
  fontSize: 10,
  opacity: 0.45,
  marginBottom: 5,
}

const controls: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const controlRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}

const key: React.CSSProperties = {
  flex: '0 0 auto',
  minWidth: 132,
  padding: '2px 8px',
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.16)',
  background: 'rgba(255,255,255,0.05)',
}

const note: React.CSSProperties = {
  marginTop: 'auto',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px dashed rgba(255,255,255,0.16)',
  opacity: 0.5,
}
