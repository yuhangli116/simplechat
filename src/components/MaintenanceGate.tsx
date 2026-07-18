import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useMaintenance } from '@/contexts/useMaintenance'

export function MaintenanceGate() {
  const maintenance = useMaintenance()
  const location = useLocation()

  if (!maintenance.ready) {
    return <div className="p-6 text-sm text-muted-foreground">正在检查系统维护状态...</div>
  }

  if (maintenance.locked && location.pathname !== '/maintenance') {
    return <Navigate to="/maintenance" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
