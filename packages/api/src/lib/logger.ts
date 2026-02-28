
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    level: LogLevel;
    msg: string;
    requestId: string;
    timestamp: string;
    [key: string]: unknown;
}

export interface Logger {
    debug: (msg: string, ctx?: Record<string, unknown>) => void;
    info: (msg: string, ctx?: Record<string, unknown>) => void;
    warn: (msg: string, ctx?: Record<string, unknown>) => void;
    error: (msg: string, ctx?: Record<string, unknown>) => void;
}

export function createLogger(requestId: string): Logger {
    const log = (level: LogLevel, msg: string, ctx: Record<string, unknown> = {}) => {
        const entry: LogEntry = {
            level,
            msg,
            requestId,
            timestamp: new Date().toISOString(),
            ...ctx,
        };
         
        console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
    };

    return {
        debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
        info: (msg: string, ctx?: Record<string, unknown>) => log('info', msg, ctx),
        warn: (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, ctx),
        error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
    };
}
