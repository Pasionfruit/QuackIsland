// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Boundary } from '../Boundary'

/**
 * The thing that stops a blank page.
 *
 * A component throwing during render unmounts the whole tree unless something
 * catches it, and a white page with nothing on it is the worst possible way to
 * be told that something is wrong.
 */
let root: ReturnType<typeof createRoot> | null = null

afterEach(() => {
  if (root) {
    const current = root
    act(() => current.unmount())
  }
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function mount(node: React.ReactNode): HTMLDivElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const created = createRoot(host)
  root = created
  act(() => created.render(node))
  return host
}

function Boom(): React.ReactElement {
  throw new Error('the duck exploded')
}

describe('an error boundary', () => {
  it('is out of the way when nothing is wrong', () => {
    const html = mount(<Boundary what="the world">alive and well</Boundary>).innerHTML
    expect(html).toContain('alive and well')
    expect(html).not.toContain('STOPPED')
  })

  it('says what fell over, and what it said', () => {
    // React logs the caught error itself; the test is not interested.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const html = mount(
      <Boundary what="the world">
        <Boom />
      </Boundary>,
    ).innerHTML
    expect(html).toContain('THE WORLD STOPPED')
    expect(html).toContain('the duck exploded')
  })

  it('leaves everything outside it running', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // The whole point: a crash in one half must not blank the other. This is
    // what the two boundaries in App.tsx buy.
    const html = mount(
      <>
        <Boundary what="the world">
          <Boom />
        </Boundary>
        <Boundary what="the interface">the panels are still here</Boundary>
      </>,
    ).innerHTML
    expect(html).toContain('THE WORLD STOPPED')
    expect(html).toContain('the panels are still here')
  })
})
