export const ARRIVAL_EMBEDDED = true

export const arrivalEmbeddedNavigate = (fallback = '') => {
  if (!fallback) return
  try {
    window.dispatchEvent(new CustomEvent('arrival:navigate', { detail: { target: fallback } }))
  } catch {}
}
