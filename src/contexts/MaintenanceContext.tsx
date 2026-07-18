import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_MAINTENANCE_STATE,
  fetchMaintenanceState,
  getMaintenanceNextRefreshDelayMs,
  isMaintenanceBannerVisible,
  type SiteMaintenanceState,
} from '@/services/maintenance'
import { MaintenanceContext } from '@/contexts/maintenanceContextCore'
import { setMaintenanceRuntimeState } from '@/services/maintenanceRuntime'

export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SiteMaintenanceState>(DEFAULT_MAINTENANCE_STATE)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const nextState = await fetchMaintenanceState()
      setState(nextState)
      setMaintenanceRuntimeState(nextState)
      return nextState
    } finally {
      setReady(true)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!ready) return undefined
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }

    timerRef.current = window.setTimeout(() => {
      void refresh()
    }, getMaintenanceNextRefreshDelayMs(state))

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [ready, refresh, state])

  const value = useMemo(() => ({
    state,
    ready,
    loading,
    locked: state.phase === 'locked',
    bannerVisible: isMaintenanceBannerVisible(state),
    refresh,
  }), [state, ready, loading, refresh])

  return <MaintenanceContext.Provider value={value}>{children}</MaintenanceContext.Provider>
}
