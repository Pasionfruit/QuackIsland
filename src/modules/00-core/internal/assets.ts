/**
 * Where assets come from.
 *
 * Always route asset paths through here rather than hardcoding them. Assets
 * will move to a CDN later, and a hardcoded path inside a frozen module could
 * not be changed when they do. One indirection now, no unfreeze then.
 */

const BASE = (import.meta.env?.VITE_ASSET_BASE ?? '/assets/').replace(/([^/])$/, '$1/')

export function assetUrl(id: string): string {
  return `${BASE}${id.replace(/^\/+/, '')}`
}
