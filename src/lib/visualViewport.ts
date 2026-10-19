/**
 * In an installed iPhone web app the keyboard covers the page instead of shrinking it, so anything
 * pinned to the bottom (the logging sheet) ends up behind it. This keeps three CSS variables in step
 * with the part of the screen that's actually visible:
 *   --keyboard-inset  how much of the bottom the keyboard covers
 *   --visual-top      where the visible area starts
 *   --visual-height   how tall it is
 */
export function keyboardInset(innerHeight: number, viewport: { height: number; offsetTop: number }): number {
  return Math.max(0, Math.round(innerHeight - viewport.height - viewport.offsetTop))
}

/** Below this the "keyboard" is just browser chrome moving, not a keyboard. */
const KEYBOARD_MIN = 120

export function trackVisualViewport() {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  const update = () => {
    root.style.setProperty('--keyboard-inset', `${keyboardInset(window.innerHeight, vv)}px`)
    root.style.setProperty('--visual-top', `${Math.round(vv.offsetTop)}px`)
    root.style.setProperty('--visual-height', `${Math.round(vv.height)}px`)
  }
  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
  update()

  // Once the keyboard has opened, bring the focused field into the part of the screen still showing.
  document.addEventListener('focusin', (e) => {
    const el = e.target
    if (!(el instanceof HTMLElement) || !el.matches('input, textarea, select')) return
    setTimeout(() => {
      if (document.activeElement === el && keyboardInset(window.innerHeight, vv) > KEYBOARD_MIN)
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 350)
  })
}
