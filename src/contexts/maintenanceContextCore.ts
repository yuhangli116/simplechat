import { createContext } from 'react'
import type { SiteMaintenanceState } from '@/services/maintenance'

export type MaintenanceContextValue = {
  state: SiteMaintenanceState
  ready: boolean
  loading: boolean
  locked: boolean
  bannerVisible: boolean
  refresh: () => Promise<SiteMaintenanceState>
}

export const MaintenanceContext = createContext<MaintenanceContextValue | null>(null)

