// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { PerfHUD } from '../../modules/00-core'
import { MusicPlayer } from '../../modules/05-music'
import { DebugPanel } from '../DebugPanel'
import { PartyPanel } from '../PartyPanel'
import { Scoreboard } from '../Scoreboard'

/**
 * Does the interface actually mount.
 *
 * The gate typechecks, builds, and runs a great deal of pure logic, and none
 * of that notices a component that throws the moment React renders it. That is
 * a blank page, and it is exactly what shipped: everything was green.
 *
 * These are the panels that live outside the canvas, so they mount without
 * WebGL. What is inside the canvas still cannot be tested this way, and is
 * still a thing to check by looking.
 */
let root: ReturnType<typeof createRoot> | null = null

afterEach(() => {
  if (root) {
    const current = root
    act(() => current.unmount())
  }
  root = null
  document.body.innerHTML = ''
})

function mount(node: React.ReactNode): string {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const created = createRoot(host)
  root = created
  act(() => created.render(node))
  return host.innerHTML
}

describe('the panels mount', () => {
  it('renders the perf HUD', () => {
    expect(mount(<PerfHUD />)).toContain('PERF')
  })

  it('renders the party dashboard', () => {
    expect(mount(<PartyPanel />)).toContain('PARTY')
  })

  it('renders the music player', () => {
    expect(mount(<MusicPlayer />)).toContain('MUSIC')
  })

  it('renders the debug panel', () => {
    expect(mount(<DebugPanel />)).toContain('TIME OF DAY')
  })

  it('renders the scoreboard, which starts hidden', () => {
    expect(mount(<Scoreboard />)).toBe('')
  })

  it('renders all of them at once, which is what the page does', () => {
    const html = mount(
      <>
        <PerfHUD />
        <PartyPanel />
        <MusicPlayer />
        <DebugPanel />
        <Scoreboard />
      </>,
    )
    expect(html).toContain('PERF')
    expect(html).toContain('PARTY')
    expect(html).toContain('MUSIC')
    expect(html).toContain('TIME OF DAY')
  })
})
