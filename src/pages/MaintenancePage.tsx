import { Navigate } from 'react-router-dom'
import { CalendarClock, ShieldAlert } from 'lucide-react'
import { useMaintenance } from '@/contexts/useMaintenance'
import { formatMaintenanceDate } from '@/services/maintenance'

export default function MaintenancePage() {
  const { state, ready, locked } = useMaintenance()

  if (!ready) {
    return <div className="flex min-h-[calc(100vh-2.5rem)] items-center justify-center text-sm text-muted-foreground">正在检查系统维护状态...</div>
  }

  if (ready && !locked) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex min-h-[calc(100vh-2.5rem)] items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl rounded-lg border bg-white p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-red-50 p-3 text-red-600">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-muted-foreground">站点维护中</div>
            <h1 className="mt-1 text-2xl font-semibold">{state.notice_title}</h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{state.notice_text}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm md:grid-cols-2">
          <InfoRow label="预计开始时间" value={formatMaintenanceDate(state.planned_start_at)} />
          <InfoRow label="预计结束时间" value={formatMaintenanceDate(state.planned_end_at)} />
          <InfoRow label="封禁开始时间" value={formatMaintenanceDate(state.lock_at)} />
          <InfoRow label="公告开始时间" value={formatMaintenanceDate(state.announce_at)} />
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1.5">
            <CalendarClock className="h-4 w-4" />
            {locked ? '系统正在维护' : '系统即将维护'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1.5">
            当前时间：{formatMaintenanceDate(state.server_now)}
          </span>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  )
}
