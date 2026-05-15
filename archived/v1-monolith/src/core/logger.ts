import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.resolve(__dirname, '../../logs/app');

function ensureLogsDir() {
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
}

function createRunId() {
  const now = new Date();
  const iso = now.toISOString().replace(/[:.]/g, '-');
  return `run-${iso}-${process.pid}`;
}

function serialize(value: unknown) {
  if (value instanceof Error) {
    return JSON.stringify({ name: value.name, message: value.message, stack: value.stack }, null, 2);
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export class GoldLogger {
  readonly runId = createRunId();
  readonly filePath: string;

  constructor() {
    ensureLogsDir();
    this.filePath = path.join(logsDir, `${this.runId}.log`);
    this.info('logger_started', { runId: this.runId, pid: process.pid });
  }

  info(message: string, details?: unknown) {
    this.write('INFO', message, details);
  }

  error(message: string, details?: unknown) {
    this.write('ERROR', message, details);
  }

  private write(level: 'INFO' | 'ERROR', message: string, details?: unknown) {
    const lines = [
      `[${new Date().toISOString()}] ${level} ${message}`,
      details === undefined ? undefined : serialize(details),
      '',
    ].filter((item) => item !== undefined);

    appendFileSync(this.filePath, `${lines.join('\n')}\n`, 'utf8');
  }
}
