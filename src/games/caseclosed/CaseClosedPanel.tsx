import { useCallback, useEffect, useRef, useState } from 'react'
import { charById } from '../smash/engine/characters'
import { portraitFor } from '../smash/portraits'
import { NetClient, defaultServerUrl } from '../../net/client'
import { normalizeCode, SERVER_SLOT, type CaseClosedPayload, type PeerInfo, type Slot } from '../../net/protocol'
import {
  hallBetween,
  isRoom,
  reachableNodes,
  ROOMS,
  ROOM_GRID,
  ROOM_NAMES,
  SECRET_PASSAGES,
  SUSPECTS,
  WEAPONS,
  type NodeId,
  type RoomId,
  type Suspect,
  type Weapon,
} from './engine/board'
import { CaseClosedEngine, type CCPlayer, type LogEntry } from './engine/engine'

/**
 * Case Closed: basically Clue, camp edition.
 *
 * Turn order and positions are host-authoritative, same as every other
 * Polyland game - but a card shown to disprove a suggestion is sent straight
 * to the suggester over a private relay message (see NetClient.send's `to`),
 * and the deck and solution never touch a browser at all until the case is
 * closed: the relay server itself deals the hands and grades every
 * accusation, since the host is also a player. `net.sendRaw` is the escape
 * hatch used for those two messages instead of the usual `net.send`.
 */

const net = new NetClient()
type Screen = 'lobby' | 'play'
type Role = 'host' | 'guest'
type NoteMark = '' | 'yes' | 'no'

const ALL_CARDS: string[] = [...SUSPECTS, ...WEAPONS, ...ROOMS]

function cardLabel(card: string): string {
  if ((ROOMS as readonly string[]).includes(card)) return ROOM_NAMES[card as RoomId]
  if ((SUSPECTS as readonly string[]).includes(card)) return charById(card).name
  return card
}

export function CaseClosedPanel() {
  const [screen, setScreen] = useState<Screen>('lobby')
  const [role, setRole] = useState<Role>('host')
  const [status, setStatus] = useState('idle')
  const [detail, setDetail] = useState('')
  const [code, setCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [name, setName] = useState('Investigator')
  const [peers, setPeers] = useState<PeerInfo[]>([])
  const [slot, setSlot] = useState(0)
  const [, setTick] = useState(0)

  const engineRef = useRef<CaseClosedEngine | null>(null)
  const roleRef = useRef<Role>('host')
  roleRef.current = role
  const slotRef = useRef(0)
  slotRef.current = slot
  const peersRef = useRef<PeerInfo[]>([])
  peersRef.current = peers

  const [myHand, setMyHand] = useState<string[] | null>(null)
  const [revealed, setRevealed] = useState<{ from: Slot; card: string } | null>(null)
  const [notes, setNotes] = useState<Record<string, NoteMark>>({})
  const [suggestPick, setSuggestPick] = useState<{ suspect: Suspect; weapon: Weapon } | null>(null)
  const [accuseOpen, setAccuseOpen] = useState(false)
  const [accusePick, setAccusePick] = useState<{ suspect: Suspect; weapon: Weapon; room: RoomId }>({
    suspect: SUSPECTS[0],
    weapon: WEAPONS[0],
    room: ROOMS[0],
  })

  const bump = () => setTick((t) => t + 1)

  const broadcastSnap = useCallback(() => {
    const eng = engineRef.current
    if (eng) net.send({ k: 'snap', s: eng.snapshot() } satisfies CaseClosedPayload)
  }, [])

  /** Applies a guest's (or the host's own) action to the authoritative engine - host-only. */
  const applyAction = useCallback(
    (from: Slot, msg: CaseClosedPayload) => {
      const eng = engineRef.current
      if (!eng) return
      switch (msg.k) {
        case 'roll':
          eng.roll()
          break
        case 'move':
          eng.move(from, msg.to as NodeId)
          break
        case 'secretPassage':
          eng.useSecretPassage(from, msg.to as NodeId)
          break
        case 'suggest':
          eng.suggest(from, msg.suspect as Suspect, msg.weapon as Weapon)
          break
        case 'checkResult':
          eng.reportCheck(from, msg.canDisprove)
          break
        case 'endTurn':
          eng.endTurn(from)
          break
        case 'accuseOutcome':
          if (msg.correct) eng.win(from, { suspect: msg.suspect as Suspect, weapon: msg.weapon as Weapon, room: msg.room as RoomId })
          else eng.eliminate(from, { suspect: msg.suspect as Suspect, weapon: msg.weapon as Weapon, room: msg.room as RoomId })
          break
        default:
          return
      }
      bump()
      broadcastSnap()
    },
    [broadcastSnap],
  )

  /** Sends an action: applied directly if we're the host, otherwise handed to the host. */
  const act = useCallback(
    (msg: CaseClosedPayload) => {
      if (roleRef.current === 'host') applyAction(slotRef.current, msg)
      else net.send(msg)
    },
    [applyAction],
  )

  useEffect(() => {
    net.on({
      onStatus: (s, d) => {
        setStatus(s)
        setDetail(d ?? '')
        if (s === 'closed' || s === 'error') {
          setCode('')
          setPeers([])
        }
      },
      onRoom: (c, sl) => {
        setCode(c)
        setSlot(sl)
        setRole(sl === 0 ? 'host' : 'guest')
      },
      onPeers: (players) => {
        setPeers(players)
        const eng = engineRef.current
        if (eng && roleRef.current === 'host' && eng.phase === 'lobby') {
          for (const p of players) eng.addPlayer(p.slot, p.name)
          bump()
        }
      },
      onPayload: (payload, from) => {
        const msg = payload as CaseClosedPayload
        if (!msg) return

        if (from === SERVER_SLOT) {
          if (msg.k === 'hand') setMyHand(msg.cards)
          else if (msg.k === 'accuseResult') {
            const p = accusePick
            net.send({ k: 'accuseOutcome', suspect: p.suspect, weapon: p.weapon, room: p.room, correct: msg.correct } satisfies CaseClosedPayload)
            if (roleRef.current === 'host') applyAction(slotRef.current, { k: 'accuseOutcome', suspect: p.suspect, weapon: p.weapon, room: p.room, correct: msg.correct })
            setAccuseOpen(false)
          } else if (msg.k === 'solved') {
            engineRef.current?.reveal(msg.solution as { suspect: Suspect; weapon: Weapon; room: RoomId })
            bump()
          }
          return
        }

        if (msg.k === 'start') {
          const eng = new CaseClosedEngine()
          for (const p of peersRef.current) eng.addPlayer(p.slot, p.name)
          eng.start(msg.suspectOf as Record<number, Suspect>)
          engineRef.current = eng
          setScreen('play')
          bump()
          return
        }
        if (msg.k === 'showCard') {
          setRevealed({ from, card: msg.card })
          return
        }
        if (roleRef.current !== 'host') {
          if (msg.k === 'snap') {
            engineRef.current?.applySnapshot(msg.s)
            bump()
          }
          return
        }
        applyAction(from, msg)
      },
    })
    return () => net.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Whenever it becomes my turn to say whether I can disprove a suggestion,
  // resolve it the moment I know the answer - only *which* card is a choice.
  useEffect(() => {
    const eng = engineRef.current
    if (!eng || !myHand) return
    const pend = eng.pending
    if (!pend || pend.resolved) return
    if (eng.awaitingCheckFrom() !== slot) return
    const matches = myHand.filter((c) => c === pend.suspect || c === pend.weapon || c === pend.room)
    if (matches.length === 0) act({ k: 'checkResult', canDisprove: false })
    // A real match waits for the player to pick which card to show - see CheckPrompt below.
  })

  const beginMatch = () => {
    if (role !== 'host') return
    const eng = new CaseClosedEngine()
    for (const p of peers) eng.addPlayer(p.slot, p.name)
    if (eng.players.length < 3) return
    const suspectOf: Record<number, Suspect> = {}
    eng.players.forEach((p, i) => {
      suspectOf[p.slot] = SUSPECTS[i % SUSPECTS.length]
    })
    net.sendRaw({
      t: 'deal',
      suspects: [...SUSPECTS],
      weapons: [...WEAPONS],
      rooms: [...ROOMS],
      slots: eng.players.map((p) => p.slot),
    })
    eng.start(suspectOf)
    engineRef.current = eng
    setScreen('play')
    net.send({ k: 'start', suspectOf } satisfies CaseClosedPayload)
  }

  const sendAccusation = () => {
    net.sendRaw({ t: 'accuse', suspect: accusePick.suspect, weapon: accusePick.weapon, room: accusePick.room })
  }

  const askReveal = () => net.sendRaw({ t: 'reveal' })

  const toggleNote = (card: string) => {
    setNotes((cur) => {
      const order: NoteMark[] = ['', 'yes', 'no']
      const next = order[(order.indexOf(cur[card] ?? '') + 1) % order.length]
      return { ...cur, [card]: next }
    })
  }

  // ------------------------------------------------------------------ lobby

  if (screen === 'lobby') {
    return (
      <div>
        <div className="gamehead">
          <h2>Case Closed</h2>
          <span className="chip chip--live">
            <span className="dot" /> Playable
          </span>
          <span className="chip">3-6 investigators</span>
        </div>

        <div className="infogrid">
          <div className="panel">
            <div className="panel__title">The case</div>
            <p className="muted" style={{ marginTop: 0 }}>
              Someone at camp did something, with something, somewhere - and one of you knows how
              to prove it. Everyone gets a hand of clue cards; whatever is left over is the
              answer, sealed away until someone accuses correctly. This one needs real people -
              there is no solo mode, deduction needs other minds in the room.
            </p>
            <p className="muted" style={{ fontSize: 12 }}>
              Suspects are dealt to seats in join order once the host starts. Bring 3 to 6
              players.
            </p>
            <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
              <label className="fighter__title">Your name</label>
              <input className="input" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
              <div className="chiprow">
                <button className="btn" onClick={() => net.host(defaultServerUrl(), name, 'caseclosed', 6)}>
                  Host a table
                </button>
              </div>
              <label className="fighter__title">Join a table</label>
              <div className="chiprow">
                <input
                  className="input"
                  value={joinCode}
                  placeholder="CODE"
                  maxLength={4}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  style={{ width: 90 }}
                />
                <button className="btn btn--ghost btn--sm" onClick={() => net.join(defaultServerUrl(), normalizeCode(joinCode), name)}>
                  Join
                </button>
              </div>
              {status !== 'idle' && (
                <span className="muted" style={{ fontSize: 12 }}>
                  {status}
                  {detail ? ` - ${detail}` : ''}
                </span>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel__title">The table</div>
            {code ? (
              <>
                <p style={{ marginTop: 0 }}>
                  Room code <strong style={{ fontSize: 20 }}>{code}</strong>
                </p>
                <div style={{ display: 'grid', gap: 6 }}>
                  {peers.map((p) => (
                    <div key={p.slot} className="keyrow">
                      <span>{p.name}</span>
                      <span className="muted">{p.slot === 0 ? 'host' : `seat ${p.slot + 1}`}</span>
                    </div>
                  ))}
                </div>
                {role === 'host' ? (
                  <button className="btn" style={{ marginTop: 12 }} disabled={peers.length < 3} onClick={beginMatch}>
                    {peers.length < 3 ? `Need ${3 - peers.length} more` : `Start the investigation (${peers.length})`}
                  </button>
                ) : (
                  <p className="muted" style={{ marginTop: 12 }}>
                    Waiting for the host to start.
                  </p>
                )}
              </>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>
                Host a table to get a four-letter code, or join one somebody read out to you.
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------------- play

  const eng = engineRef.current
  if (!eng) return null
  const me = eng.players.find((p) => p.slot === slot)
  const isMyTurn = eng.current?.slot === slot
  const pend = eng.pending
  const awaitingMe = eng.awaitingCheckFrom() === slot

  const occupied = new Set(eng.players.filter((p) => p.slot !== me?.slot).map((p) => p.position))
  const reachable =
    isMyTurn && eng.lastRoll && !pend ? new Set(reachableNodes(me!.position, eng.lastRoll[0] + eng.lastRoll[1], occupied)) : new Set<NodeId>()

  const doMove = (to: NodeId) => {
    if (!reachable.has(to)) return
    act({ k: 'move', to })
  }

  const passage = me && isRoom(me.position) ? SECRET_PASSAGES[me.position as RoomId] : undefined

  return (
    <div>
      <div className="gamehead">
        <h2>Case Closed</h2>
        <span className="chip">{eng.phase === 'over' ? 'Case closed' : isMyTurn ? 'Your turn' : `${eng.current?.name}'s turn`}</span>
        <div className="spacer" />
        <button className="btn btn--ghost btn--sm" onClick={() => setScreen('lobby')}>
          Leave the table
        </button>
      </div>

      <div className="infogrid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div>
          <div className="panel">
            <div className="panel__title">The camp</div>
            <BoardView eng={eng} reachable={reachable} onMove={doMove} />
            {isMyTurn && eng.phase === 'playing' && !pend && (
              <div className="chiprow" style={{ marginTop: 12 }}>
                {!eng.hasRolled && (
                  <button className="btn btn--sm" onClick={() => act({ k: 'roll' })}>
                    Roll the dice
                  </button>
                )}
                {eng.lastRoll && <span className="chip">Rolled {eng.lastRoll[0] + eng.lastRoll[1]}</span>}
                {passage && (
                  <button className="btn btn--ghost btn--sm" onClick={() => act({ k: 'secretPassage', to: passage })}>
                    Take the secret passage to {ROOM_NAMES[passage]}
                  </button>
                )}
                <button className="btn btn--ghost btn--sm" onClick={() => act({ k: 'endTurn' })}>
                  End turn
                </button>
              </div>
            )}
          </div>

          {isMyTurn && me && isRoom(me.position) && !eng.hasSuggested && !pend && (
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panel__title">Make a suggestion - {ROOM_NAMES[me.position as RoomId]}</div>
              <div className="chiprow">
                <select
                  className="input"
                  value={suggestPick?.suspect ?? SUSPECTS[0]}
                  onChange={(e) => setSuggestPick((cur) => ({ suspect: e.target.value as Suspect, weapon: cur?.weapon ?? WEAPONS[0] }))}
                >
                  {SUSPECTS.map((s) => (
                    <option key={s} value={s}>
                      {charById(s).name}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  value={suggestPick?.weapon ?? WEAPONS[0]}
                  onChange={(e) => setSuggestPick((cur) => ({ suspect: cur?.suspect ?? SUSPECTS[0], weapon: e.target.value as Weapon }))}
                >
                  {WEAPONS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn--sm"
                  onClick={() => act({ k: 'suggest', suspect: suggestPick?.suspect ?? SUSPECTS[0], weapon: suggestPick?.weapon ?? WEAPONS[0] })}
                >
                  Suggest
                </button>
              </div>
            </div>
          )}

          {pend && !pend.resolved && (
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panel__title">Suggestion in progress</div>
              <p style={{ marginTop: 0 }}>
                {eng.players.find((p) => p.slot === pend.suggester)?.name} suggests {charById(pend.suspect).name} with the{' '}
                {pend.weapon} in the {ROOM_NAMES[pend.room]}.
              </p>
              <p className="muted">
                Waiting on {eng.players.find((p) => p.slot === pend.order[pend.pointer])?.name ?? '...'} to check their hand.
              </p>
              {awaitingMe && myHand && (
                <CheckPrompt
                  pend={pend}
                  myHand={myHand}
                  onDisprove={(card) => {
                    net.send({ k: 'showCard', card } satisfies CaseClosedPayload, [pend.suggester])
                    act({ k: 'checkResult', canDisprove: true })
                  }}
                />
              )}
            </div>
          )}

          <div className="panel" style={{ marginTop: 12 }}>
            <div className="panel__title">Case log</div>
            <div style={{ display: 'grid', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
              {eng.log.length === 0 && (
                <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                  Nothing yet.
                </p>
              )}
              {[...eng.log].reverse().map((entry, i) => (
                <LogLine key={i} entry={entry} players={eng.players} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div className="panel">
            <div className="panel__title">Investigators</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {eng.players.map((p) => (
                <div className="keyrow" key={p.slot}>
                  <span style={{ opacity: p.eliminated ? 0.5 : 1 }}>
                    {p.name} - {charById(p.suspect).name}
                    {p.eliminated ? ' (out)' : ''}
                    {p.slot === eng.current?.slot && eng.phase === 'playing' ? ' •' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel__title">Your hand</div>
            <div style={{ display: 'grid', gap: 4 }}>
              {(myHand ?? []).map((c) => (
                <div key={c} className="chip" style={{ justifyContent: 'flex-start' }}>
                  {cardLabel(c)}
                </div>
              ))}
              {!myHand && <p className="muted">Waiting on the deal…</p>}
            </div>
          </div>

          <div className="panel">
            <div className="panel__title">Notes</div>
            <p className="muted" style={{ fontSize: 11, marginTop: 0 }}>
              Click a card to mark it seen, ruled out, then blank again. Only you see this.
            </p>
            <div style={{ display: 'grid', gap: 3, maxHeight: 260, overflowY: 'auto' }}>
              {ALL_CARDS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="keyrow"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color:
                      notes[c] === 'yes' ? 'var(--leaf-deep)' : notes[c] === 'no' ? 'var(--clay)' : 'var(--dim)',
                  }}
                  onClick={() => toggleNote(c)}
                >
                  <span>{cardLabel(c)}</span>
                  <span>{notes[c] === 'yes' ? 'SEEN' : notes[c] === 'no' ? 'OUT' : ''}</span>
                </button>
              ))}
            </div>
          </div>

          {eng.phase === 'playing' && !me?.eliminated && (
            <div className="panel">
              <div className="panel__title">Accuse</div>
              <p className="muted" style={{ fontSize: 11, marginTop: 0 }}>
                Any time, not just on your turn. Wrong, and you're out for good - though you keep
                disproving others.
              </p>
              {!accuseOpen ? (
                <button className="btn btn--hot btn--sm" onClick={() => setAccuseOpen(true)}>
                  Make an accusation
                </button>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  <select className="input" value={accusePick.suspect} onChange={(e) => setAccusePick((c) => ({ ...c, suspect: e.target.value as Suspect }))}>
                    {SUSPECTS.map((s) => (
                      <option key={s} value={s}>
                        {charById(s).name}
                      </option>
                    ))}
                  </select>
                  <select className="input" value={accusePick.weapon} onChange={(e) => setAccusePick((c) => ({ ...c, weapon: e.target.value as Weapon }))}>
                    {WEAPONS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                  <select className="input" value={accusePick.room} onChange={(e) => setAccusePick((c) => ({ ...c, room: e.target.value as RoomId }))}>
                    {ROOMS.map((r) => (
                      <option key={r} value={r}>
                        {ROOM_NAMES[r]}
                      </option>
                    ))}
                  </select>
                  <div className="chiprow">
                    <button className="btn btn--hot btn--sm" onClick={sendAccusation}>
                      Accuse
                    </button>
                    <button className="btn btn--ghost btn--sm" onClick={() => setAccuseOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {eng.phase === 'playing' && eng.players.every((p) => p.eliminated) && (
            <button className="btn btn--ghost btn--sm" onClick={askReveal}>
              Nobody left - reveal the answer
            </button>
          )}

          {revealed && (
            <div className="notice">
              {eng.players.find((p) => p.slot === revealed.from)?.name} showed you: <strong>{cardLabel(revealed.card)}</strong>
            </div>
          )}

          {eng.phase === 'over' && eng.solution && (
            <div className="panel">
              <div className="panel__title">Case closed</div>
              <p>
                {eng.winner !== null ? `${eng.players.find((p) => p.slot === eng.winner)?.name} solved it!` : 'Nobody solved it.'}
              </p>
              <p>
                It was <strong>{charById(eng.solution.suspect).name}</strong>, with the{' '}
                <strong>{eng.solution.weapon}</strong>, in the <strong>{ROOM_NAMES[eng.solution.room]}</strong>.
              </p>
              {role === 'host' && (
                <button className="btn" onClick={() => setScreen('lobby')}>
                  Back to the table
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LogLine({ entry, players }: { entry: LogEntry; players: CCPlayer[] }) {
  const name = (slot: number) => players.find((p) => p.slot === slot)?.name ?? `Seat ${slot + 1}`
  if (entry.kind === 'accuse') {
    return (
      <div className="muted" style={{ fontSize: 12 }}>
        {name(entry.by)} accused {charById(entry.suspect).name} with the {entry.weapon} in the {ROOM_NAMES[entry.room]} -{' '}
        {entry.correct ? 'correct!' : 'wrong'}
      </div>
    )
  }
  return (
    <div className="muted" style={{ fontSize: 12 }}>
      {name(entry.by)} suggested {charById(entry.suspect).name} with the {entry.weapon} in the {ROOM_NAMES[entry.room]} -{' '}
      {entry.disprovedBy !== null ? `disproved by ${name(entry.disprovedBy)}` : 'nobody could disprove it'}
    </div>
  )
}

function CheckPrompt({
  pend,
  myHand,
  onDisprove,
}: {
  pend: NonNullable<CaseClosedEngine['pending']>
  myHand: string[]
  onDisprove: (card: string) => void
}) {
  const matches = myHand.filter((c) => c === pend.suspect || c === pend.weapon || c === pend.room)
  if (matches.length === 0) return null
  return (
    <div className="chiprow">
      <span className="muted" style={{ fontSize: 12 }}>
        You can disprove this - show:
      </span>
      {matches.map((c) => (
        <button key={c} className="btn btn--sm" onClick={() => onDisprove(c)}>
          {cardLabel(c)}
        </button>
      ))}
    </div>
  )
}

/** A 5x5 grid: rooms sit at the even row/column intersections, a hallway space at every other intersection between two adjacent rooms, and the remaining corners of that grid are just empty spacers. */
function BoardView({ eng, reachable, onMove }: { eng: CaseClosedEngine; reachable: Set<NodeId>; onMove: (to: NodeId) => void }) {
  const cellStyle = (highlighted: boolean, isRoomCell: boolean): React.CSSProperties => ({
    border: `1px solid ${highlighted ? 'var(--leaf-deep)' : 'var(--line)'}`,
    borderRadius: 8,
    padding: 6,
    background: highlighted ? '#eaf3df' : isRoomCell ? 'var(--panel-2)' : 'transparent',
    borderStyle: isRoomCell ? 'solid' : 'dashed',
    cursor: highlighted ? 'pointer' : 'default',
    minHeight: isRoomCell ? 64 : 34,
    display: 'flex',
    flexDirection: isRoomCell ? 'column' : 'row',
    alignItems: isRoomCell ? 'stretch' : 'center',
    justifyContent: isRoomCell ? 'space-between' : 'center',
    gap: 4,
  })

  const tokensAt = (node: NodeId) => eng.players.filter((p) => p.position === node && !p.eliminated)

  const cells: JSX.Element[] = []
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const roomRow = r % 2 === 0
      const roomCol = c % 2 === 0
      if (roomRow && roomCol) {
        const roomId = ROOM_GRID[r / 2][c / 2]
        const highlighted = reachable.has(roomId)
        cells.push(
          <div key={`${r}-${c}`} style={cellStyle(highlighted, true)} onClick={() => onMove(roomId)}>
            <span className="fighter__title" style={{ marginBottom: 0 }}>
              {ROOM_NAMES[roomId]}
            </span>
            <Tokens players={tokensAt(roomId)} />
          </div>,
        )
      } else if (roomRow && !roomCol) {
        // A horizontal hallway between the room to the left and the room to the right.
        const a = ROOM_GRID[r / 2][(c - 1) / 2]
        const b = ROOM_GRID[r / 2][(c + 1) / 2]
        const hall = hallBetween(a, b)
        const highlighted = reachable.has(hall)
        cells.push(
          <div key={`${r}-${c}`} style={cellStyle(highlighted, false)} onClick={() => onMove(hall)}>
            <Tokens players={tokensAt(hall)} small />
          </div>,
        )
      } else if (!roomRow && roomCol) {
        // A vertical hallway between the room above and the room below.
        const a = ROOM_GRID[(r - 1) / 2][c / 2]
        const b = ROOM_GRID[(r + 1) / 2][c / 2]
        const hall = hallBetween(a, b)
        const highlighted = reachable.has(hall)
        cells.push(
          <div key={`${r}-${c}`} style={cellStyle(highlighted, false)} onClick={() => onMove(hall)}>
            <Tokens players={tokensAt(hall)} small />
          </div>,
        )
      } else {
        cells.push(<div key={`${r}-${c}`} />)
      }
    }
  }

  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>{cells}</div>
}

function Tokens({ players, small }: { players: CCPlayer[]; small?: boolean }) {
  if (players.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {players.map((p) => {
        const portrait = portraitFor(p.suspect)
        const def = charById(p.suspect)
        const size = small ? 18 : 22
        return portrait ? (
          <img
            key={p.slot}
            src={portrait}
            alt={def.name}
            width={size}
            height={size}
            style={{ width: size, height: size, objectFit: 'cover', borderRadius: '50%', border: `1.5px solid ${def.theme.dark}` }}
          />
        ) : (
          <span key={p.slot} className="dot" style={{ width: size, height: size, borderRadius: '50%', background: def.theme.primary }} />
        )
      })}
    </div>
  )
}
