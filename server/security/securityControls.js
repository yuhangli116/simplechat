import { createServerLogger } from '../logger.js';

const log = createServerLogger('SecurityControls');

const CACHE_TTL_MS = Number(process.env.SECURITY_CONTROL_CACHE_TTL_MS || 30 * 1000);
const BLOCKED_CACHE_TTL_MS = Number(process.env.SECURITY_CONTROL_BLOCKED_CACHE_TTL_MS || 5 * 1000);
const securityCache = new Map();

const cacheKey = ({ userId, ip }) => `${userId || 'anonymous'}:${ip || 'unknown'}`;

const normalizeSecurityResult = (data) => {
  const result = data?.data && typeof data.data === 'object' ? data.data : data;
  return {
    blocked: Boolean(result?.blocked),
    userStatus: String(result?.user_status || 'normal'),
    userReason: result?.user_reason || '',
    userLimits: result?.user_limits && typeof result.user_limits === 'object' ? result.user_limits : {},
    ipStatus: String(result?.ip_status || 'normal'),
    ipReason: result?.ip_reason || '',
    ipLimits: result?.ip_limits && typeof result.ip_limits === 'object' ? result.ip_limits : {},
  };
};

export const checkSecurityControls = async ({ supabase, userId, ip, traceId, kind }) => {
  if (!supabase) return { blocked: false, userStatus: 'normal', ipStatus: 'normal' };

  const key = cacheKey({ userId, ip });
  const cached = securityCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const startedAt = Date.now();
  const { data, error } = await supabase.rpc('admin_security_check', {
    p_user_id: userId || null,
    p_ip_address: ip || null,
  });

  if (error) {
    log.warn('Security control check failed; continuing with local rate guards', {
      userId,
      ip,
      traceId,
      kind,
      error: error.message,
      durationMs: Date.now() - startedAt,
    });
    return { blocked: false, userStatus: 'unknown', ipStatus: 'unknown', unavailable: true };
  }

  const value = normalizeSecurityResult(data);
  const ttl = value.blocked ? BLOCKED_CACHE_TTL_MS : CACHE_TTL_MS;
  securityCache.set(key, { value, expiresAt: Date.now() + ttl });

  log.info('Security control check completed', {
    userId,
    ip,
    traceId,
    kind,
    blocked: value.blocked,
    userStatus: value.userStatus,
    ipStatus: value.ipStatus,
    durationMs: Date.now() - startedAt,
  });

  return value;
};

export const clearSecurityControlCache = () => {
  securityCache.clear();
};

export const sendSecurityBlocked = (res, security) => {
  const message = security.userStatus === 'blacklisted'
    ? security.userReason || '当前账号已被系统安全策略封禁，请联系管理员。'
    : security.ipReason || '当前网络已被系统安全策略封禁，请联系管理员。';

  const payload = {
    error: message,
    code: 'SECURITY_BLOCKED',
    userStatus: security.userStatus,
    ipStatus: security.ipStatus,
  };

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(403).json(payload);
  }

  res.statusCode = 403;
  res.setHeader?.('Content-Type', 'application/json; charset=utf-8');
  res.end?.(JSON.stringify(payload));
  return undefined;
};
