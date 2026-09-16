import { useEffect, useRef } from 'react'

// Only an open panel owns focus. Closed off-canvas panels are inert in JSX.
export function useDialogFocus(open, panelRef, onClose, initialFocusRef) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement
    const panel = panelRef.current
    if (!panel) return
    const focusable = () => Array.from(panel.querySelectorAll('button, a[href], input, select, textarea, [tabindex]'))
      .filter(element => !element.disabled && element.tabIndex >= 0 && !element.closest('[inert]') && element.getClientRects().length > 0)
    const frame = requestAnimationFrame(() => {
      (initialFocusRef?.current || focusable()[0] || panel).focus({ preventScroll: true })
    })
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current?.()
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (!first) { event.preventDefault(); panel.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({ preventScroll: true })
    }
  }, [open, panelRef, initialFocusRef])
}
