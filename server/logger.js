/**
 * SimpleChat 服务端日志系统
 *
 * 功能：
 *   - 结构化日志输出（控制台 + 文件持久化）
 *   - 日志文件自动轮转（单文件最大 1GB）
 *   - 日志目录自动清理（总大小上限 5GB，超出删除最老文件）
 *   - 日志文件命名：simplechat.log.YYYYMMDD_HHmmss
 *   - 支持批量接收前端日志并持久化
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── 常量配置 ───

const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024; // 1GB
const MAX_DIR_SIZE = 5 * 1024 * 1024 * 1024;   // 5GB
const LOG_DIR_NAME = 'log';
const LOG_FILE_PREFIX = 'simplechat.log.';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.resolve(PROJECT_ROOT, LOG_DIR_NAME);

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
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}_${h}${min}${s}`;
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

// ─── 日志文件管理 ───

let currentLogFile = null;
let currentLogStream = null;

function getLogFiles() {
  ensureLogDir();
  try {
    return fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith(LOG_FILE_PREFIX))
      .sort();
  } catch {
    return [];
  }
}

function getCurrentLogFile() {
  const files = getLogFiles();
  if (files.length === 0) return null;
  return files[files.length - 1];
}

function getCurrentLogStream() {
  const logFile = getCurrentLogFile();

  if (logFile && currentLogFile === logFile && currentLogStream) {
    // 检查当前文件大小
    try {
      const stats = fs.statSync(path.join(LOG_DIR, logFile));
      if (stats.size < MAX_FILE_SIZE) {
        return currentLogStream;
      }
    } catch {
      // 文件可能被删除，重新创建
    }
  }

  // 关闭旧流
  if (currentLogStream) {
    try { currentLogStream.end(); } catch { /* ignore */ }
    currentLogStream = null;
  }

  // 创建新日志文件
  ensureLogDir();
  const newFileName = `${LOG_FILE_PREFIX}${formatDateTimestamp()}`;
  const newFilePath = path.join(LOG_DIR, newFileName);
  currentLogFile = newFileName;
  currentLogStream = fs.createWriteStream(newFilePath, { flags: 'a' });

  return currentLogStream;
}

function cleanupOldLogs() {
  const files = getLogFiles();
  if (files.length === 0) return;

  let totalSize = 0;
  const fileStats = [];

  for (const f of files) {
    try {
      const stats = fs.statSync(path.join(LOG_DIR, f));
      fileStats.push({ name: f, size: stats.size, mtime: stats.mtimeMs });
      totalSize += stats.size;
    } catch {
      // 文件可能已被删除
    }
  }

  // 按修改时间排序（最老的在前）
  fileStats.sort((a, b) => a.mtime - b.mtime);

  // 删除最老的日志直到总大小低于阈值
  while (totalSize > MAX_DIR_SIZE && fileStats.length > 1) {
    const oldest = fileStats.shift();
    if (!oldest) break;

    try {
      fs.unlinkSync(path.join(LOG_DIR, oldest.name));
      totalSize -= oldest.size;
    } catch {
      // 删除失败，跳过
      break;
    }
  }
}

// ─── 核心日志写入 ───

function writeToFile(formattedLine) {
  try {
    const stream = getCurrentLogStream();
    if (stream) {
      stream.write(formattedLine + '\n');
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
}

// ─── 初始化 ───

function initLogger() {
  ensureLogDir();
  cleanupOldLogs();
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
