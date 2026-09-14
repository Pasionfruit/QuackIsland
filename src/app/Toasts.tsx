/**
 * The little notes that say what just happened to the party.
 *
 * Somebody leaving and the host calling the party off are both things that
 * happen *to* you rather than things you did, and both are otherwise silent:
 * a name disappears from the scoreboard you were not looking at, or you are
 * suddenly back on your own island with no idea why. A line on the screen for
 * a few seconds is the whole fix.
 *
 * It raises its own notes rather than being told to. Everything it needs is
 * already in the modules' state - who is in the lobby, and how many times a
 * party has been called off - so there is no notification channel to thread
 * through five files and nothing new for anybody else to remember to call.
 *
 * Dismissible, and self-dismissing: a note you have read is in the way, and a
 * note you never read should not be in the way for ever.
 */
import { useEffect, useRef, useState } from 'react'
import { useNet, usePeers } from '../modules/09-net'
import { useParty } from '../modules/10-party'

/** How long a note stays up on its own, in milliseconds. */
const LINGER = 9000

interface Note {
  id: number
  text: string
}

let nextId = 1

export function Toasts() {
  const net = useNet()
  const peers = usePeers()
  const party = useParty()

  const [notes, setNotes] = useState<Note[]>([])

  /** Who was in the lobby last time we looked, by id, so we can spot a gap. */
  const before = useRef(new Map<string, string>())
  /** The disband count already reported. */
  const reported = useRef(party.disbanded)

  const dismiss = (id: number) => setNotes((was) => was.filter((n) => n.id !== id))

  const say = (text: string) => {
    const note = { id: nextId++, text }
    setNotes((was) => [...was, note])
    setTimeout(() => dismiss(note.id), LINGER)
  }

  useEffect(() => {
    const now = new Map(peers.map((p) => [p.id, p.name]))

    // Leaving a lobby empties the roster in one go. Announcing that eight
    // people left, because *you* left, is noise - so the roster is only worth
    // comparing while you are actually in a lobby to compare it in.
    if (net.status !== 'joined') {
      before.current = now
      return
    }

    for (const [id, name] of before.current) {
      if (!now.has(id)) say(`${name} left the party`)
    }
    before.current = now
    // `net.status` is in here so that arriving and leaving reset the roster
    // rather than being read as everybody vanishing at once.
  }, [peers, net.status])

  useEffect(() => {
    if (party.disbanded === reported.current) return
    reported.current = party.disbanded
    say('the host ended the party - back to your island')
  }, [party.disbanded])

  if (notes.length === 0) return null

  return (
    <div style={stack}>
      {notes.map((note) => (
        <div key={note.id} style={toast}>
          <span style={{ flex: 1 }}>{note.text}</span>
          <button
            type="button"
            onClick={() => dismiss(note.id)}
            title="Dismiss"
            style={close}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

const stack: React.CSSProperties = {
  position: 'fixed',
  right: 10,
  bottom: 10,
  zIndex: 50,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 6,
  // The world is still being played behind this; only the notes take a click.
  pointerEvents: 'none',
}

const toast: React.CSSProperties = {
  pointerEvents: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  maxWidth: 300,
  padding: '7px 8px 7px 11px',
  borderRadius: 8,
  background: 'rgba(20, 22, 26, 0.94)',
  border: '1px solid rgba(255,255,255,0.14)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  color: '#f2ece2',
  font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
  userSelect: 'none',
}

const close: React.CSSProperties = {
  background: 'none',
  border: 'none',
  borderRadius: 4,
  color: '#f2ece2',
  opacity: 0.5,
  font: 'inherit',
  fontSize: 14,
  lineHeight: 1,
  padding: '2px 4px',
  cursor: 'pointer',
}
