import { useEffect, useRef, useState } from 'react'
import { useMaintenance } from '@/contexts/useMaintenance'
import { getMaintenanceBannerMessage } from '@/services/maintenance'

const INTERACTIVE_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
].join(',')

const shouldBlockTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false
  if (['/login', '/register', '/forgot-password', '/reset-password'].includes(window.location.pathname)) return false
  if (target.closest('a[href]')) return false
  if (target.closest('[data-maintenance-allow="true"]')) return false
  return Boolean(target.closest(INTERACTIVE_SELECTOR))
}

export function MaintenanceInteractionBlocker() {
  const { state, locked } = useMaintenance()
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!locked) {
      setVisible(false)
      return undefined
    }

    const showNotice = () => {
      setVisible(true)
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
      }
      timerRef.current = window.setTimeout(() => setVisible(false), 3200)
    }

    const block = (event: Event) => {
      if (!shouldBlockTarget(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      showNotice()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const isEditable = target instanceof Element && Boolean(target.closest('input,textarea,select,[contenteditable="true"]'))
      if (isEditable) return

      const shortcut = event.metaKey || event.ctrlKey || event.altKey
      const blockedKey = event.key === 'Enter' || event.key === 'Escape' || shortcut
      if (!blockedKey) return
      event.preventDefault()
      event.stopPropagation()
      showNotice()
    }

    window.addEventListener('click', block, true)
    window.addEventListener('submit', block, true)
    window.addEventListener('beforeinput', block, true)
    window.addEventListener('paste', block, true)
    window.addEventListener('drop', block, true)
    window.addEventListener('keydown', onKeyDown, true)

    return () => {
      window.removeEventListener('click', block, true)
      window.removeEventListener('submit', block, true)
      window.removeEventListener('beforeinput', block, true)
      window.removeEventListener('paste', block, true)
      window.removeEventListener('drop', block, true)
      window.removeEventListener('keydown', onKeyDown, true)
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [locked])

  if (!locked || !visible) return null

  return (
    <div
      className="fixed right-4 top-14 z-[2100] max-w-md rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg"
      role="status"
      aria-live="polite"
      data-maintenance-allow="true"
    >
      <div className="font-medium">维护保护期已开启</div>
      <div className="mt-1 leading-6">{getMaintenanceBannerMessage(state)}</div>
    </div>
  )
}
