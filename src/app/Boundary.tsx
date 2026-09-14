/**
 * Somewhere for an error to stop.
 *
 * Without one of these, a single component throwing during render unmounts the
 * **whole** React tree: the world, every panel, the lot. What you get is a
 * white page with nothing on it and nothing to read, and the only way to find
 * out what happened is the browser console - which is exactly the position
 * this project was in when the game stopped loading and there was nothing
 * anywhere to say why.
 *
 * So the app is wrapped in two of these rather than one. The canvas is one
 * boundary and the interface is another, which means a crash in the world
 * leaves the panels working, and a crash in a panel leaves the world running.
 * Neither can blank the page any more, and whichever one fell over says so on
 * the screen.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** What fell over, in words: "the world", "the interface". */
  what: string
  children: ReactNode
}

interface State {
  error: Error | null
}

export class Boundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console still gets the whole thing, stack and component trace, which
    // is more than fits on the screen and is what you actually debug from.
    console.error(`[app] ${this.props.what} threw`, error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div style={panel} role="alert">
        <div style={{ color: '#ff9c8a', letterSpacing: 0.6, marginBottom: 6 }}>
          {this.props.what.toUpperCase()} STOPPED
        </div>
        <div style={{ marginBottom: 8 }}>{error.message || String(error)}</div>
        {error.stack ? (
          <pre style={stack}>{error.stack.split('\n').slice(0, 8).join('\n')}</pre>
        ) : null}
        <div style={{ opacity: 0.5, marginTop: 8 }}>
          The rest of the page is still running. The console has the whole
          stack; reload once you have fixed it.
        </div>
      </div>
    )
  }
}

const panel: React.CSSProperties = {
  position: 'fixed',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 100,
  maxWidth: 'min(90vw, 680px)',
  maxHeight: '70vh',
  overflow: 'auto',
  padding: '14px 16px',
  borderRadius: 10,
  background: 'rgba(24, 16, 16, 0.96)',
  border: '1px solid rgba(255, 140, 120, 0.4)',
  color: '#f2ece2',
  font: '12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace',
}

const stack: React.CSSProperties = {
  margin: 0,
  padding: '8px 10px',
  borderRadius: 6,
  background: 'rgba(0,0,0,0.4)',
  color: '#c9c3b8',
  fontSize: 11,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  overflowX: 'auto',
}
