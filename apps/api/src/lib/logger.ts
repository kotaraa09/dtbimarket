/**
 * Structured logging.
 *
 * REQ-N2 / PDPA: never an email, a name, a phone number or an address in any
 * log line, ever. People are referenced by ID. This is an obligation, not a
 * preference, so the log helpers take only the fields listed below rather than
 * an open object that would eventually be handed a whole user record.
 */
import { isProduction } from './config.ts';

export interface LogFields {
  requestId?: string;
  route?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  userId?: string;
  storeId?: string;
  eventType?: string;
  code?: string;
  message?: string;
}

type Level = 'info' | 'warn' | 'error';

function write(level: Level, fields: LogFields): void {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    ...fields,
  });
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const log = {
  info: (fields: LogFields) => write('info', fields),
  warn: (fields: LogFields) => write('warn', fields),
  error: (fields: LogFields) => write('error', fields),
  /** Unexpected errors: the request ID goes to the client, the detail stays here. */
  exception: (requestId: string, err: unknown) => {
    write('error', {
      requestId,
      message: err instanceof Error ? err.message : String(err),
    });
    if (!isProduction && err instanceof Error && err.stack) {
      process.stderr.write(err.stack + '\n');
    }
  },
};
