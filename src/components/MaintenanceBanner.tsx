import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { useMaintenance } from '@/contexts/useMaintenance'
import { formatMaintenanceDate } from '@/services/maintenance'
import { cn } from '@/lib/utils'

export function MaintenanceBanner() {
  const { state, bannerVisible } = useMaintenance()
  if (!bannerVisible) return null

  const locked = state.phase === 'locked'
  const Icon = locked ? ShieldAlert : AlertTriangle
  const message = locked
    ? `系统正在维护升级，当前暂不对外开放，预计 ${formatMaintenanceDate(state.planned_end_at)} 恢复。`
    : state.notice_text

  return (
    <div
      className={cn(
        'fixed inset-x-0 top-0 z-[2000] flex h-10 items-center overflow-hidden border-b px-3 text-sm shadow-sm',
        locked
          ? 'border-red-300 bg-red-600 text-white'
          : 'border-amber-300 bg-amber-400 text-amber-950',
      )}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 overflow-hidden">
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold',
            locked ? 'bg-white/15 text-white' : 'bg-amber-100/80 text-amber-950',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {locked ? '维护中' : '预计升级'}
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          {locked ? (
            <div className="truncate font-medium">{message}</div>
          ) : (
            <div className="maintenance-marquee-track">
              <span className="maintenance-marquee-item">{message}</span>
              <span className="maintenance-marquee-item" aria-hidden="true">{message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
