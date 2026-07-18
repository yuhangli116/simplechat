import { AlertTriangle } from 'lucide-react'
import { useMaintenance } from '@/contexts/useMaintenance'
import { getMaintenanceBannerMessage } from '@/services/maintenance'

export function MaintenanceBanner() {
  const { state, bannerVisible } = useMaintenance()
  if (!bannerVisible) return null

  const locked = state.phase === 'locked'
  const message = getMaintenanceBannerMessage(state)
  const toneClass = locked
    ? 'border-amber-200 bg-amber-100 text-amber-900'
    : 'border-emerald-200 bg-emerald-100 text-emerald-900'
  const badgeClass = locked
    ? 'bg-amber-200/70 text-amber-950'
    : 'bg-emerald-200/70 text-emerald-950'
  const label = locked ? '封禁保护期' : '升级预告'

  return (
    <div
      className={`fixed inset-x-0 top-0 z-[2000] flex h-10 items-center overflow-hidden border-b px-3 text-sm shadow-sm ${toneClass}`}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 overflow-hidden">
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${badgeClass}`}>
          <AlertTriangle className="h-3.5 w-3.5" />
          {label}
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="maintenance-marquee-track">
            <span className="maintenance-marquee-item">{message}</span>
            <span className="maintenance-marquee-item" aria-hidden="true">{message}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
