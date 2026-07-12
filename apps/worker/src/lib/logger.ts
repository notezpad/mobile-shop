/**
 * Lightweight structured logger for Cloudflare Workers.
 * No external dependencies — uses console + JSON serialization.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

interface LogContext {
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

export class Logger {
  constructor(
    private readonly level: LogLevel,
    private readonly defaultContext: LogContext = {},
  ) {}

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  private emit(level: LogLevel, message: string, ctx: LogContext = {}): void {
    if (!this.shouldLog(level)) return;

    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.defaultContext,
      ...ctx,
    };

    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(JSON.stringify(entry));
  }

  debug(message: string, ctx?: LogContext): void {
    this.emit('debug', message, ctx);
  }

  info(message: string, ctx?: LogContext): void {
    this.emit('info', message, ctx);
  }

  warn(message: string, ctx?: LogContext): void {
    this.emit('warn', message, ctx);
  }

  error(message: string, ctx?: LogContext): void {
    this.emit('error', message, ctx);
  }
}

/** Factory: create a logger from env LOG_LEVEL. */
export function createLogger(level: LogLevel = 'info'): Logger {
  return new Logger(level);
}
