/**
 * Structured Logger for RAI
 *
 * 일관된 로그 포맷과 메타데이터 지원
 * - JSON 구조화 로깅 (프로덕션)
 * - 컬러 콘솔 로깅 (개발)
 * - 요청 컨텍스트 추적
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  requestId?: string;
  userId?: string;
  jobId?: string;
  candidateId?: string;
  action?: string;
  duration?: number;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const isDevelopment = process.env.NODE_ENV === 'development';
const minLevel = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) || 'info'];

/**
 * 로그 엔트리 포맷팅
 */
function formatLog(entry: LogEntry): string {
  if (isDevelopment) {
    // 개발 환경: 읽기 쉬운 포맷
    const levelColors: Record<LogLevel, string> = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m',  // green
      warn: '\x1b[33m',  // yellow
      error: '\x1b[31m', // red
    };
    const reset = '\x1b[0m';
    const color = levelColors[entry.level];

    let output = `${color}[${entry.level.toUpperCase()}]${reset} ${entry.message}`;

    if (entry.context && Object.keys(entry.context).length > 0) {
      output += ` ${JSON.stringify(entry.context)}`;
    }

    if (entry.error) {
      output += `\n  Error: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n  Stack: ${entry.error.stack}`;
      }
    }

    return output;
  } else {
    // 프로덕션: JSON 포맷 (로그 수집 서비스용)
    return JSON.stringify(entry);
  }
}

/**
 * 로그 레벨 체크
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= minLevel;
}

/**
 * 로그 출력
 */
function log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  };

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: isDevelopment ? error.stack : undefined,
    };
  }

  const formatted = formatLog(entry);

  switch (level) {
    case 'debug':
    case 'info':
      console.log(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
  }
}

/**
 * Logger 클래스 (컨텍스트 유지)
 */
export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  /**
   * 새로운 컨텍스트로 자식 로거 생성
   */
  child(additionalContext: LogContext): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }

  debug(message: string, context?: LogContext): void {
    log('debug', message, { ...this.context, ...context });
  }

  info(message: string, context?: LogContext): void {
    log('info', message, { ...this.context, ...context });
  }

  warn(message: string, context?: LogContext): void {
    log('warn', message, { ...this.context, ...context });
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const err = error instanceof Error ? error : undefined;
    log('error', message, { ...this.context, ...context }, err);
  }

  /**
   * 작업 시간 측정 래퍼
   */
  async timed<T>(
    action: string,
    fn: () => Promise<T>,
    context?: LogContext
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.info(`${action} completed`, { ...context, action, duration });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`${action} failed`, error, { ...context, action, duration });
      throw error;
    }
  }
}

// 기본 로거 인스턴스
export const logger = new Logger();

/**
 * 요청별 로거 생성 (API 라우트용)
 */
export function createRequestLogger(requestId?: string, userId?: string): Logger {
  return new Logger({
    requestId: requestId || crypto.randomUUID().slice(0, 8),
    userId,
  });
}

/**
 * API 에러 응답용 로거 헬퍼
 */
export function logApiError(
  endpoint: string,
  error: unknown,
  context?: LogContext
): void {
  logger.error(`API error: ${endpoint}`, error, context);
}

// 하위 호환성을 위한 함수 내보내기
export const logDebug = (message: string, context?: LogContext) => logger.debug(message, context);
export const logInfo = (message: string, context?: LogContext) => logger.info(message, context);
export const logWarn = (message: string, context?: LogContext) => logger.warn(message, context);
export const logError = (message: string, error?: Error | unknown, context?: LogContext) =>
  logger.error(message, error, context);
