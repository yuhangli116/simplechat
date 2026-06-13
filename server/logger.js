/**
 * SimpleChat 服务端日志系统
 *
 * 功能：
 *   - 结构化日志输出（控制台 + 文件持久化）
 *   - 启动时续写 log/simplechat.log
 *   - simplechat.log 达到 1GB 后轮转为 simplechat.log.YYYYMMDD_HHmmss
 *   - log 目录总大小最大 5GB，超出后删除最老的轮转日志
 *   - 支持批量接收前端日志并持久化
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── 常量配置 ───

const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024; // 1GB
const MAX_DIR_SIZE = 5 * 1024 * 1024 * 1024;   // 5GB
const LOG_DIR_NAME = 'log';
const ACTIVE_LOG_FILE = 'simplechat.log';
const ROTATED_LOG_PREFIX = 'simplechat.log.';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.resolve(PROJECT_ROOT, LOG_DIR_NAME);
const ACTIVE_LOG_PATH = path.join(LOG_DIR, ACTIVE_LOG_FILE);

// ─── 日志级别 ───

const LOG_LEVELS = { debug: 0, info: 1, success: 1, warn: 2, error: 3 };
const LEVEL_LABELS = { debug: 'DEBUG', info: 'INFO', success: 'SUCCESS', warn: 'WARN', error: 'ERROR' };

// ─── 工具函数 ───

function formatTimestamp(date = new Date()) {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

function formatDateTimestamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}_${h}${min}`;
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function getLogFiles() {
  ensureLogDir();
  try {
    return fs.readdirSync(LOG_DIR)
      .filter((name) => name === ACTIVE_LOG_FILE || name.startsWith(ROTATED_LOG_PREFIX));
  } catch {
    return [];
  }
}

function getUniqueRotatedPath(date = new Date()) {
  const baseName = `${ACTIVE_LOG_FILE}.${formatDateTimestamp(date)}`;
  let candidate = path.join(LOG_DIR, baseName);
  let index = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(LOG_DIR, `${baseName}_${index}`);
    index += 1;
  }

  return candidate;
}

// ─── 日志文件管理 ───

let currentLogStream = null;
let currentLogSize = 0;

function closeCurrentLogStream() {
  if (!currentLogStream) return;

  try {
    currentLogStream.end();
  } catch {
    // ignore
  }
  currentLogStream = null;
}

function openActiveLogStream() {
  ensureLogDir();

  if (!currentLogStream) {
    currentLogSize = getFileSize(ACTIVE_LOG_PATH);
    currentLogStream = fs.createWriteStream(ACTIVE_LOG_PATH, { flags: 'a' });
  }

  return currentLogStream;
}

function rotateActiveLog() {
  closeCurrentLogStream();
  ensureLogDir();

  if (fs.existsSync(ACTIVE_LOG_PATH) && getFileSize(ACTIVE_LOG_PATH) > 0) {
    fs.renameSync(ACTIVE_LOG_PATH, getUniqueRotatedPath());
  }

  currentLogSize = 0;
  currentLogStream = fs.createWriteStream(ACTIVE_LOG_PATH, { flags: 'a' });
  cleanupOldLogs();
}

function ensureCapacityFor(bytesToWrite) {
  ensureLogDir();

  if (currentLogSize === 0) {
    currentLogSize = getFileSize(ACTIVE_LOG_PATH);
  }

  if (currentLogSize >= MAX_FILE_SIZE || currentLogSize + bytesToWrite > MAX_FILE_SIZE) {
    rotateActiveLog();
  }
}

function cleanupOldLogs() {
  const files = getLogFiles();
  if (files.length === 0) return;

  let totalSize = 0;
  const fileStats = [];

  for (const name of files) {
    const filePath = path.join(LOG_DIR, name);
    try {
      const stats = fs.statSync(filePath);
      fileStats.push({ name, path: filePath, size: stats.size, mtime: stats.mtimeMs });
      totalSize += stats.size;
    } catch {
      // 文件可能已被删除
    }
  }

  fileStats.sort((a, b) => a.mtime - b.mtime);

  while (totalSize > MAX_DIR_SIZE && fileStats.length > 0) {
    const oldestRotatedIndex = fileStats.findIndex((file) => file.name !== ACTIVE_LOG_FILE);
    if (oldestRotatedIndex === -1) break;

    const [oldest] = fileStats.splice(oldestRotatedIndex, 1);
    try {
      fs.unlinkSync(oldest.path);
      totalSize -= oldest.size;
    } catch {
      break;
    }
  }
}

// ─── 核心日志写入 ───

function writeToFile(formattedLine) {
  try {
    const line = formattedLine + '\n';
    const bytesToWrite = Buffer.byteLength(line, 'utf8');

    ensureCapacityFor(bytesToWrite);
    const stream = openActiveLogStream();
    stream.write(line);
    currentLogSize += bytesToWrite;

    if (currentLogSize >= MAX_FILE_SIZE) {
      rotateActiveLog();
    }
  } catch (err) {
    // 日志写入失败不应影响业务逻辑
    console.error('[Logger] Failed to write log file:', err.message);
  }
}

function formatLogLine(level, module, message, data, error) {
  const ts = formatTimestamp();
  const label = LEVEL_LABELS[level] || 'INFO';
  let line = `${ts} [${label}] [${module}] ${message}`;

  if (data && typeof data === 'object' && Object.keys(data).length > 0) {
    try {
      line += ` ${JSON.stringify(data)}`;
    } catch {
      line += ' [data serialization failed]';
    }
  }

  if (error) {
    const errMsg = error instanceof Error
      ? `${error.message}\n${error.stack || ''}`
      : String(error);
    line += `\n${ts} [${label}] [${module}] ErrorDetail: ${errMsg}`;
  }

  return line;
}

// ─── Logger 工厂 ───

function createServerLogger(module) {
  const log = (level, message, data, error) => {
    if ((LOG_LEVELS[level] ?? 0) < (LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? 0)) {
      return;
    }

    const formattedLine = formatLogLine(level, module, message, data, error);

    // 1. 控制台输出
    if (level === 'error') {
      console.error(formattedLine);
    } else if (level === 'warn') {
      console.warn(formattedLine);
    } else {
      console.log(formattedLine);
    }

    // 2. 文件持久化
    writeToFile(formattedLine);
  };

  return {
    debug: (message, data) => log('debug', message, data),
    info: (message, data) => log('info', message, data),
    success: (message, data) => log('success', message, data),
    warn: (message, data) => log('warn', message, data),
    error: (message, data, error) => log('error', message, data, error),
  };
}

// ─── 批量日志写入（接收前端日志） ───

function persistBatchLogs(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;

  for (const entry of entries) {
    const { timestamp, level, module, message, data, error } = entry;
    const label = LEVEL_LABELS[level] || 'INFO';
    let line = `${timestamp || formatTimestamp()} [${label}] [${module}] ${message}`;

    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      try {
        line += ` ${JSON.stringify(data)}`;
      } catch {
        line += ' [data serialization failed]';
      }
    }

    if (error) {
      line += `\n${timestamp || formatTimestamp()} [${label}] [${module}] ErrorDetail: ${error}`;
    }

    writeToFile(line);
  }
}

// ─── 定时清理 ───

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 每 10 分钟检查一次
let cleanupTimer = null;

function startCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    try {
      cleanupOldLogs();
    } catch {
      // 清理失败不影响业务
    }
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.(); // 不阻止进程退出
}

function stopCleanupTimer() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  closeCurrentLogStream();
}

// ─── 初始化 ───

function initLogger() {
  ensureLogDir();
  currentLogSize = getFileSize(ACTIVE_LOG_PATH);
  if (currentLogSize >= MAX_FILE_SIZE) {
    rotateActiveLog();
  }
  cleanupOldLogs();
  openActiveLogStream();
  startCleanupTimer();
}

// ─── 导出 ───

export {
  createServerLogger,
  persistBatchLogs,
  initLogger,
  stopCleanupTimer,
  LOG_DIR,
  formatTimestamp,
};

export default createServerLogger;
