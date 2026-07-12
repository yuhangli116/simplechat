export type SecurityControlResult = {
  blocked: boolean;
  userStatus: string;
  userReason?: string;
  userLimits?: Record<string, unknown>;
  ipStatus: string;
  ipReason?: string;
  ipLimits?: Record<string, unknown>;
  unavailable?: boolean;
};

export function checkSecurityControls(params: {
  supabase?: unknown;
  userId?: string | null;
  ip?: string | null;
  traceId?: string;
  kind?: string;
}): Promise<SecurityControlResult>;

export function clearSecurityControlCache(): void;

export function sendSecurityBlocked(res: unknown, security: SecurityControlResult): unknown;
