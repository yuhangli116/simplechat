import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServerLogger } from './logger.js';

const log = createServerLogger('Maintenance');

const NORMAL_CACHE_TTL_MS = Number(process.env.MAINTENANCE_STATE_CACHE_TTL_MS || 5 * 1000);
const LOCKED_CACHE_TTL_MS = Number(process.env.MAINTENANCE_LOCKED_CACHE_TTL_MS || 2 * 1000);
const SHARED_MAINTENANCE_STATE_PATH = path.resolve(process.cwd(), '..', '.codex', 'site-maintenance-state.json');

let cachedState = null;
let cachedUntil = 0;

const normalizeMaintenanceState = (data) => {
  const state = data?.data && typeof data.data === 'object' ? data.data : data;
  return {
    enabled: Boolean(state?.enabled),
    phase: state?.phase === 'locked' || state?.phase === 'announced' ? state.phase : 'normal',
    plannedStartAt: state?.planned_start_at || null,
    plannedEndAt: state?.planned_end_at || null,
    announceAt: state?.announce_at || null,
    lockAt: state?.lock_at || null,
    noticeTitle: state?.notice_title || '系统维护升级通知',
    noticeText: state?.notice_text || '系统正在维护升级，当前暂不对外开放，请稍后再试。',
    serverNow: state?.server_now || new Date().toISOString(),
  };
};

const readSharedMaintenanceState = () => {
  try {
    if (!existsSync(SHARED_MAINTENANCE_STATE_PATH)) return null;
    const raw = readFileSync(SHARED_MAINTENANCE_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeMaintenanceState(parsed);
  } catch (error) {
    log.warn('Failed to read shared maintenance state', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const writeSharedMaintenanceState = (state) => {
  try {
    const dir = path.dirname(SHARED_MAINTENANCE_STATE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(SHARED_MAINTENANCE_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  } catch (error) {
    log.warn('Failed to write shared maintenance state', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const checkSiteMaintenance = async ({ supabase, kind, path }) => {
  const sharedState = readSharedMaintenanceState();
  if (sharedState) {
    cachedState = sharedState;
    cachedUntil = Date.now() + (sharedState.phase === 'locked' ? LOCKED_CACHE_TTL_MS : NORMAL_CACHE_TTL_MS);
    return { locked: sharedState.phase === 'locked', state: sharedState };
  }

  if (!supabase) {
    return { locked: false, state: normalizeMaintenanceState(null), unavailable: true };
  }

  if (cachedState && cachedUntil > Date.now()) {
    return { locked: cachedState.phase === 'locked', state: cachedState };
  }

  const startedAt = Date.now();
  const { data, error } = await supabase.rpc('get_site_maintenance_state');
  if (error) {
    log.warn('Maintenance state check failed; using cached state if available', {
      kind,
      path,
      error: error.message,
      durationMs: Date.now() - startedAt,
    });
    if (cachedState) {
      return { locked: cachedState.phase === 'locked', state: cachedState, unavailable: true };
    }
    return { locked: false, state: normalizeMaintenanceState(null), unavailable: true };
  }

  const state = normalizeMaintenanceState(data);
  cachedState = state;
  cachedUntil = Date.now() + (state.phase === 'locked' ? LOCKED_CACHE_TTL_MS : NORMAL_CACHE_TTL_MS);

  return { locked: state.phase === 'locked', state };
};

export const sendMaintenanceLocked = (res, state) => {
  const payload = {
    error: state.noticeText || '系统正在维护升级，当前暂不对外开放，请稍后再试。',
    code: 'MAINTENANCE_LOCKED',
    phase: 'locked',
    planned_start_at: state.plannedStartAt,
    planned_end_at: state.plannedEndAt,
    server_now: state.serverNow,
  };

  const plannedEndMs = Date.parse(state.plannedEndAt || '');
  if (Number.isFinite(plannedEndMs)) {
    const retryAfterSeconds = Math.max(30, Math.ceil((plannedEndMs - Date.now()) / 1000));
    res.setHeader?.('Retry-After', String(retryAfterSeconds));
  }

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(503).json(payload);
  }

  res.statusCode = 503;
  res.setHeader?.('Content-Type', 'application/json; charset=utf-8');
  res.end?.(JSON.stringify(payload));
  return undefined;
};
