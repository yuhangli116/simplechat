import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_MAINTENANCE_STATE,
  fetchMaintenanceState,
  getMaintenanceNextRefreshDelayMs,
  isMaintenanceBannerVisible,
  type SiteMaintenanceState,
} from '@/services/maintenance'
import { useAuthStore } from '@/store/useAuthStore'
import { MaintenanceContext } from '@/contexts/maintenanceContextCore'

export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SiteMaintenanceState>(DEFAULT_MAINTENANCE_STATE)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const forcedSignOutRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const nextState = await fetchMaintenanceState()
      setState(nextState)
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

  useEffect(() => {
    if (!ready) return
    if (state.phase !== 'locked') {
      forcedSignOutRef.current = false
      return
    }
    if (forcedSignOutRef.current) return

    const currentUser = useAuthStore.getState().user
    if (!currentUser) return

    forcedSignOutRef.current = true
    void useAuthStore.getState().signOut()
  }, [ready, state.phase])

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
