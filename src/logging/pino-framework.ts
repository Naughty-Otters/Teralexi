import type {
  Logger as PinoLogger,
  LoggerOptions,
  LevelWithSilent,
  DestinationStream,
} from 'pino'
import pino from 'pino'

export type LogContext = Record<string, unknown> | Error | unknown
type AnyFn = (...args: any[]) => any
type InstrumentTarget = Record<PropertyKey, unknown>
type InstrumentOptions = {
  scopePrefix?: string
  includePrototype?: boolean
  skip?: (methodName: string) => boolean
}

export interface AppLogger {
  trace(message: string, context?: LogContext): void
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
  fatal(message: string, context?: LogContext): void
  child(bindings: Record<string, unknown>): AppLogger
  raw: PinoLogger
}

type RuntimeKind = 'main' | 'renderer'

const WRAPPED_FN = Symbol('teralexi.logging.wrapped-fn')
const INSTRUMENTED_TARGET = Symbol('teralexi.logging.instrumented-target')
const REDACTED_KEYS = [
  'authorization',
  'token',
  'secret',
  'password',
  'cookie',
  'apikey',
  'apiKey',
  'accessToken',
  'refreshToken',
]

function normalizeContext(context?: LogContext): Record<string, unknown> | undefined {
  if (context == null) return undefined
  if (context instanceof Error) return { err: context }
  if (typeof context === 'object') return context as Record<string, unknown>
  return { value: context }
}

function shouldRedactKey(key: string): boolean {
  const lowered = key.toLowerCase()
  return REDACTED_KEYS.some((candidate) => lowered.includes(candidate.toLowerCase()))
}

function serializeForLogging(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (value == null) return value
  if (typeof value === 'string') {
    return value.length > 300 ? `${value.slice(0, 300)}…` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) {
    if (depth >= 3) return `[Array(${value.length})]`
    return value.slice(0, 20).map((item) => serializeForLogging(item, depth + 1, seen))
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return `[Buffer(${value.length})]`
  }
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>
    if (seen.has(objectValue)) return '[Circular]'
    seen.add(objectValue)
    if (depth >= 3) return '[Object]'
    const entries = Object.entries(objectValue).slice(0, 25)
    return Object.fromEntries(
      entries.map(([key, nested]) => [
        key,
        shouldRedactKey(key)
          ? '[Redacted]'
          : serializeForLogging(nested, depth + 1, seen),
      ]),
    )
  }
  return String(value)
}

type DuplicateEmitFn = (
  logger: PinoLogger,
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
  message: string,
  context?: LogContext,
) => void

function emit(
  logger: PinoLogger,
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
  message: string,
  context?: LogContext,
  duplicateEmit?: DuplicateEmitFn,
): void {
  const payload = normalizeContext(context)
  if (payload) {
    logger[level](payload, message)
    duplicateEmit?.(logger, level, message, context)
    return
  }
  logger[level](message)
  duplicateEmit?.(logger, level, message, context)
}

function wrapLogger(
  logger: PinoLogger,
  duplicateEmit?: DuplicateEmitFn,
): AppLogger {
  return {
    trace: (message, context) =>
      emit(logger, 'trace', message, context, duplicateEmit),
    debug: (message, context) =>
      emit(logger, 'debug', message, context, duplicateEmit),
    info: (message, context) =>
      emit(logger, 'info', message, context, duplicateEmit),
    warn: (message, context) =>
      emit(logger, 'warn', message, context, duplicateEmit),
    error: (message, context) =>
      emit(logger, 'error', message, context, duplicateEmit),
    fatal: (message, context) =>
      emit(logger, 'fatal', message, context, duplicateEmit),
    child: (bindings) => wrapLogger(logger.child(bindings), duplicateEmit),
    raw: logger,
  }
}

function wrapMethod(
  logger: AppLogger,
  methodName: string,
  fn: AnyFn,
): AnyFn {
  if ((fn as AnyFn & { [WRAPPED_FN]?: boolean })[WRAPPED_FN]) return fn

  const wrapped = function (this: unknown, ...args: unknown[]) {
    const start = Date.now()
    logger.debug('Method input', {
      method: methodName,
      args: serializeForLogging(args),
    })

    try {
      const result = fn.apply(this, args)

      if (result && typeof (result as Promise<unknown>).then === 'function') {
        return (result as Promise<unknown>)
          .then((resolved) => {
            logger.debug('Method output', {
              method: methodName,
              returnValue: serializeForLogging(resolved),
              durationMs: Date.now() - start,
            })
            return resolved
          })
          .catch((err) => {
            logger.error('Method failed', {
              method: methodName,
              args: serializeForLogging(args),
              durationMs: Date.now() - start,
              err,
            })
            throw err
          })
      }

      logger.debug('Method output', {
        method: methodName,
        returnValue: serializeForLogging(result),
        durationMs: Date.now() - start,
      })
      return result
    } catch (err) {
      logger.error('Method failed', {
        method: methodName,
        args: serializeForLogging(args),
        durationMs: Date.now() - start,
        err,
      })
      throw err
    }
  } as AnyFn & { [WRAPPED_FN]?: boolean }

  wrapped[WRAPPED_FN] = true
  return wrapped
}

function listMethodOwners(
  target: InstrumentTarget,
  includePrototype: boolean,
): InstrumentTarget[] {
  const owners: InstrumentTarget[] = [target]
  if (!includePrototype) return owners

  let proto = Object.getPrototypeOf(target)
  while (proto && proto !== Object.prototype) {
    owners.push(proto)
    proto = Object.getPrototypeOf(proto)
  }
  return owners
}

function instrumentTarget(
  target: InstrumentTarget,
  logger: AppLogger,
  options?: InstrumentOptions,
): InstrumentTarget {
  if (
    (target as InstrumentTarget & { [INSTRUMENTED_TARGET]?: boolean })[
      INSTRUMENTED_TARGET
    ]
  ) {
    return target
  }

  const includePrototype = options?.includePrototype ?? false
  const owners = listMethodOwners(target, includePrototype)

  for (const owner of owners) {
    for (const key of Reflect.ownKeys(owner)) {
      if (key === 'constructor') continue
      const descriptor = Object.getOwnPropertyDescriptor(owner, key)
      if (!descriptor || typeof descriptor.value !== 'function') continue
      const methodName = String(key)
      if (options?.skip?.(methodName)) continue
      const scopedLogger = logger.child({
        method: options?.scopePrefix
          ? `${options.scopePrefix}.${methodName}`
          : methodName,
      })
      const wrapped = wrapMethod(scopedLogger, methodName, descriptor.value as AnyFn)

      if (owner === target) {
        Object.defineProperty(target, key, {
          ...descriptor,
          value: wrapped,
        })
        continue
      }

      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: wrapped.bind(target),
      })
    }
  }

  Object.defineProperty(target, INSTRUMENTED_TARGET, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  })

  return target
}

export function instrumentObjectMethods<T extends Record<PropertyKey, unknown>>(
  target: T,
  logger: AppLogger,
  options?: Omit<InstrumentOptions, 'includePrototype'>,
): T {
  return instrumentTarget(target, logger, {
    ...options,
    includePrototype: false,
  }) as T
}

export function instrumentInstanceMethods<T extends object>(
  instance: T,
  logger: AppLogger,
  options?: Omit<InstrumentOptions, 'includePrototype'>,
): T {
  return instrumentTarget(instance as InstrumentTarget, logger, {
    ...options,
    includePrototype: true,
  }) as T
}

export function traceFunction<T extends AnyFn>(
  logger: AppLogger,
  name: string,
  fn: T,
): T {
  return wrapMethod(logger.child({ method: name }), name, fn) as T
}

export type LogStreamSpec = {
  stream: DestinationStream
  level?: LevelWithSilent
}

export function createLoggingFramework(options: {
  runtime: RuntimeKind
  level: LevelWithSilent
  base?: Record<string, unknown>
  browser?: LoggerOptions['browser']
  streams?: LogStreamSpec[]
  duplicateEmit?: DuplicateEmitFn
}): {
  log: AppLogger
  createLogger: (scope: string) => AppLogger
  instrumentObjectMethods: typeof instrumentObjectMethods
  instrumentInstanceMethods: typeof instrumentInstanceMethods
  traceFunction: typeof traceFunction
} {
  const loggerOptions: LoggerOptions = {
    level: options.level,
    base: {
      runtime: options.runtime,
      ...options.base,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: pino.stdSerializers.err,
    },
    browser: options.browser,
  }

  const logger =
    options.streams && options.streams.length > 0
      ? pino(
          loggerOptions,
          pino.multistream(
            options.streams.map((spec) => ({
              stream: spec.stream,
              level: spec.level ?? options.level,
            })),
          ),
        )
      : pino(loggerOptions)

  const wrapped = wrapLogger(logger, options.duplicateEmit)

  return {
    log: wrapped,
    createLogger: (scope: string) => wrapped.child({ scope }),
    instrumentObjectMethods,
    instrumentInstanceMethods,
    traceFunction,
  }
}
