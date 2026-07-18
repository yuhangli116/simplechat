import { Outlet } from 'react-router-dom'
import { useMaintenance } from '@/contexts/useMaintenance'

export function MaintenanceGate() {
  const maintenance = useMaintenance()

  if (!maintenance.ready) {
    return null
  }

  return <Outlet />
}
