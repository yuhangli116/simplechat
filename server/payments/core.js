import crypto from 'node:crypto';

const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const REDACTED_PAYMENT_FIELDS = [
  'notify_id',
  'notify_type',
  'out_trade_no',
  'trade_no',
  'trade_status',
  'total_amount',
  'app_id',
  'seller_id',
  'status',
];

const pad = (value) => String(value).padStart(2, '0');

export const moneyToFen = (value) => {
  const normalized = String(value ?? '').trim();
  if (!MONEY_PATTERN.test(normalized)) {
    throw new TypeError('金额必须是最多两位小数的正数');
  }

  const [yuan, fraction = ''] = normalized.split('.');
  const fen = Number(yuan) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(fen) || fen <= 0) {
    throw new RangeError('金额必须大于 0 且处于安全范围内');
  }
  return fen;
};

export const fenToMoney = (fen) => {
  if (!Number.isSafeInteger(fen) || fen <= 0) {
    throw new RangeError('分必须是正整数');
  }
  return `${Math.floor(fen / 100)}.${pad(fen % 100)}`;
};

export const formatAlipayTimestamp = (date = new Date()) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('无效时间');
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).map(({ type, value }) => [type, value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
};

export const parseAlipayTimestamp = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value.replace(' ', 'T')}+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const redactPaymentPayload = (payload = {}) => Object.fromEntries(
  REDACTED_PAYMENT_FIELDS
    .filter((key) => payload[key] !== undefined && payload[key] !== null && payload[key] !== '')
    .map((key) => [key, String(payload[key])])
);

export const hashPaymentPayload = (payload = {}) => {
  const canonical = Object.keys(payload)
    .sort()
    .map((key) => `${key}=${String(payload[key] ?? '')}`)
    .join('&');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
};

const compactUuid = () => crypto.randomUUID().replaceAll('-', '');

export const createOutTradeNo = (now = new Date()) => {
  const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  return `SC${date}${compactUuid().slice(0, 24).toUpperCase()}`;
};
