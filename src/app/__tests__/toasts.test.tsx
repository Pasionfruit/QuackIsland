// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { disbandParty } from '../../modules/10-party'
import { Toasts } from '../Toasts'

/**
 * Being sent home is something that happens *to* you, and without a note on
 * the screen it happens for no reason you can see.
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

function mount(): HTMLDivElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const created = createRoot(host)
  root = created
  act(() => created.render(<Toasts />))
  return host
}

describe('the notes', () => {
  it('stay out of the way when nothing has happened', () => {
    expect(mount().innerHTML).toBe('')
  })

  it('say so when the party is called off', () => {
    // Out of a lobby you are your own host, so this is the real call.
    const host = mount()
    act(() => disbandParty())
    expect(host.textContent).toContain('the host ended the party')
  })

  it('can be dismissed', () => {
    const host = mount()
    act(() => disbandParty())
    const close = host.querySelector('button')
    expect(close).not.toBeNull()
    act(() => close?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(host.innerHTML).toBe('')
  })

  it('tells you about each one, not just the first', () => {
    const host = mount()
    act(() => disbandParty())
    act(() => disbandParty())
    // Two parties were called off, and a flag that went true twice would be
    // one thing that happened.
    expect(host.querySelectorAll('button')).toHaveLength(2)
  })
})
