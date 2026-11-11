import type { SiteAdapter } from '../types'

export const medium: SiteAdapter = {
  name: 'Medium',

  match: (url) => url.hostname === 'medium.com' || url.hostname.endsWith('.medium.com'),

  cleanTitle: (title) => {
    // Medium titles arrive as "Post title | by Author | Medium". Readability
    // may already have dropped the trailing "| Medium", so strip both
    // suffixes independently.
    let out = title.trim()
    out = out.replace(/\s*\|\s*Medium\s*$/i, '')
    out = out.replace(/\s*\|\s*by\s+[^|]+$/i, '')
    return out.trim() || title
  },
}
