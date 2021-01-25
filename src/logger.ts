let _logger = null;

const logger = {
  trace(...args) {
    console.log(...args);
    _logger?.trace?.(...args);
  },
  debug(...args) {
    console.log(...args);
    _logger?.debug?.(...args);
  },
  info(...args) {
    console.log(...args);
    _logger?.info?.(...args);
  },
  warn(...args) {
    console.log(...args);
    _logger?.warn?.(...args);
  },
  error(...args) {
    console.error(...args);
    _logger?.error?.(...args);
  },
};

export function loggerInit(params: any = {}) {
  const { logger } = params;
  _logger = logger;
}

export default logger;
