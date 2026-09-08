/**
 * What you are carrying.
 *
 * Always on screen and deliberately small: three numbers, no chrome, nothing
 * to fold away. A currency you cannot see is one you forget you have.
 */
import { CURRENCIES, balanceOf, formatAmount } from './wallet'
import { usePurse } from './purse'

export function WalletHUD() {
  const purse = usePurse()

  return (
    <div style={panel}>
      {CURRENCIES.map((c) => (
        <div key={c.id} style={row} title={c.label}>
          <span aria-hidden>{c.glyph}</span>
          <span style={{ color: c.colour }}>{formatAmount(balanceOf(purse, c.id))}</span>
        </div>
      ))}
    </div>
  )
}

const panel: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  padding: '6px 10px',
  borderRadius: 8,
  background: 'rgba(20, 22, 26, 0.72)',
  color: '#f2ece2',
  font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
  userSelect: 'none',
}

const row: React.CSSProperties = { display: 'flex', gap: 4, alignItems: 'center' }
