// Lightweight stderr logger with levels and timestamps.
// Stays sync + dependency-free. Replace with pino/winston later if needed.

type Args = unknown[];

function ts(): string {
  return new Date().toISOString();
}

function fmt(arg: unknown): string {
  if (arg instanceof Error) return arg.stack || arg.message;
  if (typeof arg === 'object' && arg !== null) {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

function emit(level: string, args: Args): void {
  const line = `[${ts()}] [${level}] ${args.map(fmt).join(' ')}\n`;
  process.stderr.write(line);
}

export const log = {
  info: (...args: Args) => emit('INFO', args),
  warn: (...args: Args) => emit('WARN', args),
  error: (...args: Args) => emit('ERROR', args),
  debug: (...args: Args) => {
    if (process.env.DEBUG) emit('DEBUG', args);
  },
};
