var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/shared/agent/plan-mode-status.ts
function isPlanModeStatus(value) {
  return typeof value === "string" && PLAN_MODE_STATUSES.has(value);
}
function normalizePlanModeStatus(value) {
  if (isPlanModeStatus(value)) return value;
  return "tool_execute";
}
var DEFAULT_PLAN_MODE_VIEW, PLAN_MODE_STATUSES;
var init_plan_mode_status = __esm({
  "src/shared/agent/plan-mode-status.ts"() {
    DEFAULT_PLAN_MODE_VIEW = {
      status: "tool_execute",
      planSlug: null
    };
    PLAN_MODE_STATUSES = /* @__PURE__ */ new Set([
      "tool_execute",
      "planning",
      "plan_tool_execute"
    ]);
  }
});

// src/shared/agent/plan-mode.ts
function parsePlanSlug(raw) {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
function migrateLegacyStatus(raw) {
  if (isPlanModeStatus2(raw.status)) return raw.status;
  const planMode = Boolean(raw.planMode ?? raw.active);
  const planExecutionActive = Boolean(raw.planExecutionActive);
  if (planMode) return "planning";
  if (planExecutionActive) return "plan_tool_execute";
  return "tool_execute";
}
function isPlanModeStatus2(value) {
  return value === "tool_execute" || value === "planning" || value === "plan_tool_execute";
}
function parseAgentPlanModeState(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_AGENT_PLAN_MODE_STATE };
  const o = raw;
  return {
    status: normalizePlanModeStatus(migrateLegacyStatus(o)),
    planSlug: parsePlanSlug(o.planSlug)
  };
}
function serializeAgentPlanModeState(state) {
  return JSON.stringify({
    status: state.status,
    planSlug: state.planSlug
  });
}
var DEFAULT_AGENT_PLAN_MODE_STATE;
var init_plan_mode = __esm({
  "src/shared/agent/plan-mode.ts"() {
    init_plan_mode_status();
    DEFAULT_AGENT_PLAN_MODE_STATE = {
      status: "tool_execute",
      planSlug: null
    };
  }
});

// src/shared/agent/plan-mode-phase.ts
function toPlanModeView(state) {
  return {
    status: state.status,
    planSlug: state.planSlug
  };
}
var init_plan_mode_phase = __esm({
  "src/shared/agent/plan-mode-phase.ts"() {
    init_plan_mode_status();
    init_plan_mode_status();
  }
});

// config/system-prop.ts
function getSystemPropPath() {
  return getopenfdeSystemPropPath();
}
function parseSystemProp(content) {
  const entries = /* @__PURE__ */ new Map();
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    if (!key) continue;
    entries.set(key, value);
  }
  return entries;
}
function readAllProps() {
  const filePath = getSystemPropPath();
  if (!(0, import_fs.existsSync)(filePath)) {
    return new Map(Object.entries(DEFAULT_SYSTEM_PROPERTIES));
  }
  const content = (0, import_fs.readFileSync)(filePath, "utf-8");
  const parsed = parseSystemProp(content);
  for (const [key, defaultValue] of Object.entries(DEFAULT_SYSTEM_PROPERTIES)) {
    if (!parsed.has(key)) parsed.set(key, defaultValue);
  }
  return parsed;
}
function getSystemPropValue(key, defaultValue = "") {
  const merged = readAllProps();
  return merged.get(key) ?? defaultValue;
}
function getSystemPropValues(keys) {
  const merged = readAllProps();
  if (!keys || keys.length === 0) {
    return Object.fromEntries(merged.entries());
  }
  const picked = {};
  for (const key of keys) {
    if (merged.has(key)) picked[key] = merged.get(key) || "";
  }
  return picked;
}
var import_fs, CONFIG_PROPERTIES_FILENAME, DEFAULT_SYSTEM_PROPERTIES;
var init_system_prop = __esm({
  "config/system-prop.ts"() {
    import_fs = require("fs");
    init_openfde_home();
    CONFIG_PROPERTIES_FILENAME = "config.properties";
    DEFAULT_SYSTEM_PROPERTIES = {
      "app.build.hotPublishUrl": "",
      "app.build.hotPublishConfigName": "update-config",
      "app.dev.removeElectronJunk": "true",
      "app.dev.chineseLog": "false",
      "app.dev.port": "9080",
      "app.google.clientId": "",
      "app.google.clientSecret": "",
      "app.github.clientId": "",
      "app.github.clientSecret": "",
      "app.paths.dllFolder": "",
      "app.paths.hotUpdateFolder": "update",
      "app.window.useStartupChart": "true",
      "app.window.useSystemTitle": "false",
      "settings.whatsapp.botName": "OpenFDE WhatsApp Bot",
      "settings.whatsapp.targetPhone": "",
      "settings.telegram.botToken": "",
      "settings.telegram.botName": "OpenFDE Telegram Bot",
      "settings.discord.botToken": "",
      "settings.discord.botName": "OpenFDE Discord Bot",
      "settings.wechat.corpId": "",
      "settings.wechat.corpSecret": "",
      "settings.wechat.agentId": "",
      "settings.wechat.botName": "OpenFDE WeChat Bot",
      "settings.slack.botToken": "",
      "settings.slack.appToken": "",
      "settings.slack.botName": "OpenFDE Slack Bot",
      "memory.recording.block": "true",
      "memory.recording.vector": "false",
      "memory.recording.session": "true",
      "memory.recording.persona": "true",
      "memory.retention.blocksPerAgent": "5",
      "memory.retention.sessionsPerAgent": "5",
      "memory.retention.sessionsForAgentPersona": "5",
      "editor.settings.formatOnSave": "false",
      "editor.settings.tabSize": "2",
      "editor.settings.insertSpaces": "true",
      "editor.settings.eslintEnabled": "true",
      "editor.settings.eslintDebounceMs": "500",
      "app.support.uploadUrl": "",
      "app.support.maxMegabytes": "100",
      "app.ui.locale": "en"
    };
  }
});

// config/openfde-home.ts
function resolveopenfdeHomePath() {
  return (0, import_path.join)((0, import_os.homedir)(), openfde_HOME_DIRNAME);
}
function migrateLegacyHomeIfNeeded(newHome) {
  const legacyHome = (0, import_path.resolve)((0, import_path.join)((0, import_os.homedir)(), LEGACY_OTTERS_HOME_DIRNAME));
  const resolvedNew = (0, import_path.resolve)(newHome);
  if (legacyHome !== resolvedNew && !(0, import_fs2.existsSync)(resolvedNew) && (0, import_fs2.existsSync)(legacyHome)) {
    (0, import_fs2.renameSync)(legacyHome, resolvedNew);
  }
  const legacyDb = (0, import_path.join)(resolvedNew, openfde_DB_DIRNAME, LEGACY_OTTERS_DB_FILENAME);
  const newDb = (0, import_path.join)(resolvedNew, openfde_DB_DIRNAME, openfde_DB_FILENAME);
  if ((0, import_fs2.existsSync)(legacyDb) && !(0, import_fs2.existsSync)(newDb)) {
    (0, import_fs2.renameSync)(legacyDb, newDb);
  }
}
function getopenfdeHome() {
  if (!openfdeHomePath) {
    openfdeHomePath = resolveopenfdeHomePath();
  }
  if (!initialized) {
    initializeopenfdeHome(getElectronApp());
  }
  return openfdeHomePath;
}
function getopenfdeConfigDir() {
  const dir = (0, import_path.join)(getopenfdeHome(), "config");
  ensureDir(dir);
  return dir;
}
function getopenfdeConfigPropertiesPath() {
  return (0, import_path.join)(getopenfdeConfigDir(), CONFIG_PROPERTIES_FILENAME);
}
function getopenfdeSystemPropPath() {
  return getopenfdeConfigPropertiesPath();
}
function getopenfdeDbDir() {
  const dir = (0, import_path.join)(getopenfdeHome(), openfde_DB_DIRNAME);
  ensureDir(dir);
  return dir;
}
function getopenfdeDbPath() {
  const path2 = (0, import_path.join)(getopenfdeDbDir(), openfde_DB_FILENAME);
  ensureParentDirForFile(path2);
  return path2;
}
function getopenfdeWorkspacePath() {
  const dir = (0, import_path.join)(getopenfdeHome(), "workspace");
  ensureDir(dir);
  return dir;
}
function getopenfdeSandboxDir() {
  const dir = (0, import_path.join)(getopenfdeWorkspacePath(), "sandbox");
  ensureDir(dir);
  return dir;
}
function getopenfdeSkillsDir() {
  const dir = (0, import_path.join)(getopenfdeHome(), "skills");
  ensureDir(dir);
  return dir;
}
function getopenfdeToolSetDir() {
  const dir = (0, import_path.join)(getopenfdeHome(), "toolSet");
  ensureDir(dir);
  return dir;
}
function getopenfdeLogsDir() {
  const dir = (0, import_path.join)(getopenfdeHome(), "logs");
  ensureDir(dir);
  return dir;
}
function getElectronApp() {
  try {
    const require2 = (0, import_module.createRequire)(import_meta.url);
    const electronModule = require2("electron");
    return electronModule.app ?? electronModule.default?.app ?? null;
  } catch {
    return null;
  }
}
function redirectLegacyChannelDataPath(targetPath) {
  const home = (0, import_path.resolve)(resolveopenfdeHomePath());
  const resolved = (0, import_path.resolve)(targetPath);
  const channelsRoot = (0, import_path.join)(home, "channels");
  for (const name of openfde_CHANNEL_DATA_DIRS) {
    const legacyRoot = (0, import_path.join)(home, name);
    if (resolved === legacyRoot || resolved.startsWith(`${legacyRoot}${import_path.sep}`)) {
      const relative2 = resolved.slice(legacyRoot.length).replace(/^[/\\]+/, "");
      return relative2 ? (0, import_path.join)(channelsRoot, name, relative2) : (0, import_path.join)(channelsRoot, name);
    }
  }
  return targetPath;
}
function ensureDir(path2) {
  (0, import_fs2.mkdirSync)(redirectLegacyChannelDataPath(path2), { recursive: true });
}
function ensureParentDirForFile(filePath) {
  ensureDir((0, import_path.dirname)((0, import_path.resolve)(filePath)));
}
function initializeopenfdeHome(app2) {
  const home = (0, import_path.resolve)(resolveopenfdeHomePath());
  if (initialized) {
    return openfdeHomePath ?? home;
  }
  migrateLegacyHomeIfNeeded(home);
  openfdeHomePath = home;
  initialized = true;
  ensureDir(home);
  for (const dir of openfde_APP_DIRS) {
    ensureDir((0, import_path.join)(home, dir));
  }
  ensureDir((0, import_path.join)(home, "workspace", "sandbox"));
  for (const name of openfde_CHANNEL_DATA_DIRS) {
    ensureDir((0, import_path.join)(home, "channels", name));
  }
  return home;
}
var import_module, import_fs2, import_os, import_path, import_meta, openfde_HOME_DIRNAME, openfde_DB_FILENAME, LEGACY_OTTERS_HOME_DIRNAME, LEGACY_OTTERS_DB_FILENAME, openfde_APP_DIRS, openfde_CHANNEL_DATA_DIRS, openfde_DB_DIRNAME, initialized, openfdeHomePath;
var init_openfde_home = __esm({
  "config/openfde-home.ts"() {
    import_module = require("module");
    import_fs2 = require("fs");
    import_os = require("os");
    import_path = require("path");
    init_system_prop();
    import_meta = {};
    openfde_HOME_DIRNAME = ".openfde";
    openfde_DB_FILENAME = "openfde.db";
    LEGACY_OTTERS_HOME_DIRNAME = ".otters";
    LEGACY_OTTERS_DB_FILENAME = "otters.db";
    openfde_APP_DIRS = [
      "config",
      "db",
      "logs",
      "memory",
      "workspace",
      "channels",
      "accounts",
      "skills",
      "toolSet",
      "workflows"
    ];
    openfde_CHANNEL_DATA_DIRS = [
      "whatsapp-auth",
      "telegram-data",
      "discord-data",
      "wechat-data",
      "slack-data"
    ];
    openfde_DB_DIRNAME = "db";
    initialized = false;
    openfdeHomePath = null;
  }
});

// src/logging/pretty-stream.ts
function usePrettyLogs() {
  return process.env.NODE_ENV === "development";
}
function createPrettyLogStream(destination, options) {
  return (0, import_pino_pretty.default)({
    colorize: options?.colorize ?? false,
    translateTime: "SYS:standard",
    ignore: "pid,hostname,runtime,processType",
    destination,
    mkdir: true,
    append: true,
    sync: false
  });
}
var import_pino, import_pino_pretty;
var init_pretty_stream = __esm({
  "src/logging/pretty-stream.ts"() {
    import_pino = __toESM(require("pino"));
    import_pino_pretty = __toESM(require("pino-pretty"));
  }
});

// src/logging/agent-run-context.ts
function normalizeContext(context) {
  if (context == null) return void 0;
  if (context instanceof Error) return { err: context };
  if (typeof context === "object") return context;
  return { value: context };
}
function duplicateAgentRunLog(logger, level, message, context) {
  const store = agentRunLogStorage.getStore();
  if (!store) return;
  const payload = normalizeContext(context);
  const bindings = typeof logger.bindings === "function" ? logger.bindings() : {};
  if (payload) {
    store.runLogger[level]({ ...bindings, ...payload }, message);
    return;
  }
  if (Object.keys(bindings).length > 0) {
    store.runLogger[level](bindings, message);
    return;
  }
  store.runLogger[level](message);
}
var import_node_async_hooks, import_pino2, agentRunLogStorage;
var init_agent_run_context = __esm({
  "src/logging/agent-run-context.ts"() {
    import_node_async_hooks = require("node:async_hooks");
    init_openfde_home();
    import_pino2 = __toESM(require("pino"));
    init_pretty_stream();
    agentRunLogStorage = new import_node_async_hooks.AsyncLocalStorage();
  }
});

// src/logging/pino-framework.ts
function normalizeContext2(context) {
  if (context == null) return void 0;
  if (context instanceof Error) return { err: context };
  if (typeof context === "object") return context;
  return { value: context };
}
function shouldRedactKey(key) {
  const lowered = key.toLowerCase();
  return REDACTED_KEYS.some((candidate) => lowered.includes(candidate.toLowerCase()));
}
function serializeForLogging(value, depth = 0, seen = /* @__PURE__ */ new WeakSet()) {
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length > 300 ? `${value.slice(0, 300)}\u2026` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (depth >= 3) return `[Array(${value.length})]`;
    return value.slice(0, 20).map((item) => serializeForLogging(item, depth + 1, seen));
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return `[Buffer(${value.length})]`;
  }
  if (typeof value === "object") {
    const objectValue = value;
    if (seen.has(objectValue)) return "[Circular]";
    seen.add(objectValue);
    if (depth >= 3) return "[Object]";
    const entries = Object.entries(objectValue).slice(0, 25);
    return Object.fromEntries(
      entries.map(([key, nested]) => [
        key,
        shouldRedactKey(key) ? "[Redacted]" : serializeForLogging(nested, depth + 1, seen)
      ])
    );
  }
  return String(value);
}
function emit(logger, level, message, context, duplicateEmit) {
  const payload = normalizeContext2(context);
  if (payload) {
    logger[level](payload, message);
    duplicateEmit?.(logger, level, message, context);
    return;
  }
  logger[level](message);
  duplicateEmit?.(logger, level, message, context);
}
function wrapLogger(logger, duplicateEmit) {
  return {
    trace: (message, context) => emit(logger, "trace", message, context, duplicateEmit),
    debug: (message, context) => emit(logger, "debug", message, context, duplicateEmit),
    info: (message, context) => emit(logger, "info", message, context, duplicateEmit),
    warn: (message, context) => emit(logger, "warn", message, context, duplicateEmit),
    error: (message, context) => emit(logger, "error", message, context, duplicateEmit),
    fatal: (message, context) => emit(logger, "fatal", message, context, duplicateEmit),
    child: (bindings) => wrapLogger(logger.child(bindings), duplicateEmit),
    raw: logger
  };
}
function wrapMethod(logger, methodName, fn) {
  if (fn[WRAPPED_FN]) return fn;
  const wrapped = function(...args) {
    const start = Date.now();
    logger.debug("Method input", {
      method: methodName,
      args: serializeForLogging(args)
    });
    try {
      const result = fn.apply(this, args);
      if (result && typeof result.then === "function") {
        return result.then((resolved) => {
          logger.debug("Method output", {
            method: methodName,
            returnValue: serializeForLogging(resolved),
            durationMs: Date.now() - start
          });
          return resolved;
        }).catch((err) => {
          logger.error("Method failed", {
            method: methodName,
            args: serializeForLogging(args),
            durationMs: Date.now() - start,
            err
          });
          throw err;
        });
      }
      logger.debug("Method output", {
        method: methodName,
        returnValue: serializeForLogging(result),
        durationMs: Date.now() - start
      });
      return result;
    } catch (err) {
      logger.error("Method failed", {
        method: methodName,
        args: serializeForLogging(args),
        durationMs: Date.now() - start,
        err
      });
      throw err;
    }
  };
  wrapped[WRAPPED_FN] = true;
  return wrapped;
}
function listMethodOwners(target, includePrototype) {
  const owners = [target];
  if (!includePrototype) return owners;
  let proto = Object.getPrototypeOf(target);
  while (proto && proto !== Object.prototype) {
    owners.push(proto);
    proto = Object.getPrototypeOf(proto);
  }
  return owners;
}
function instrumentTarget(target, logger, options) {
  if (target[INSTRUMENTED_TARGET]) {
    return target;
  }
  const includePrototype = options?.includePrototype ?? false;
  const owners = listMethodOwners(target, includePrototype);
  for (const owner of owners) {
    for (const key of Reflect.ownKeys(owner)) {
      if (key === "constructor") continue;
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      if (!descriptor || typeof descriptor.value !== "function") continue;
      const methodName = String(key);
      if (options?.skip?.(methodName)) continue;
      const scopedLogger = logger.child({
        method: options?.scopePrefix ? `${options.scopePrefix}.${methodName}` : methodName
      });
      const wrapped = wrapMethod(scopedLogger, methodName, descriptor.value);
      if (owner === target) {
        Object.defineProperty(target, key, {
          ...descriptor,
          value: wrapped
        });
        continue;
      }
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: wrapped.bind(target)
      });
    }
  }
  Object.defineProperty(target, INSTRUMENTED_TARGET, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true
  });
  return target;
}
function instrumentObjectMethods(target, logger, options) {
  return instrumentTarget(target, logger, {
    ...options,
    includePrototype: false
  });
}
function instrumentInstanceMethods(instance, logger, options) {
  return instrumentTarget(instance, logger, {
    ...options,
    includePrototype: true
  });
}
function traceFunction(logger, name, fn) {
  return wrapMethod(logger.child({ method: name }), name, fn);
}
function createLoggingFramework(options) {
  const loggerOptions = {
    level: options.level,
    base: {
      runtime: options.runtime,
      ...options.base
    },
    timestamp: import_pino3.default.stdTimeFunctions.isoTime,
    serializers: {
      err: import_pino3.default.stdSerializers.err
    },
    browser: options.browser
  };
  const logger = options.streams && options.streams.length > 0 ? (0, import_pino3.default)(
    loggerOptions,
    import_pino3.default.multistream(
      options.streams.map((spec) => ({
        stream: spec.stream,
        level: spec.level ?? options.level
      }))
    )
  ) : (0, import_pino3.default)(loggerOptions);
  const wrapped = wrapLogger(logger, options.duplicateEmit);
  return {
    log: wrapped,
    createLogger: (scope) => wrapped.child({ scope }),
    instrumentObjectMethods,
    instrumentInstanceMethods,
    traceFunction
  };
}
var import_pino3, WRAPPED_FN, INSTRUMENTED_TARGET, REDACTED_KEYS;
var init_pino_framework = __esm({
  "src/logging/pino-framework.ts"() {
    import_pino3 = __toESM(require("pino"));
    WRAPPED_FN = /* @__PURE__ */ Symbol("openfde.logging.wrapped-fn");
    INSTRUMENTED_TARGET = /* @__PURE__ */ Symbol("openfde.logging.instrumented-target");
    REDACTED_KEYS = [
      "authorization",
      "token",
      "secret",
      "password",
      "cookie",
      "apikey",
      "apiKey",
      "accessToken",
      "refreshToken"
    ];
  }
});

// src/logging/main-process-streams.ts
function buildMainProcessLogStreams() {
  if (mainLogStreams) return mainLogStreams;
  const logsDir = getopenfdeLogsDir();
  (0, import_node_fs.mkdirSync)(logsDir, { recursive: true });
  const mainLogPath = (0, import_node_path.join)(logsDir, "main.log");
  const fileStream = import_pino4.default.destination({
    dest: mainLogPath,
    append: true,
    mkdir: true,
    sync: false
  });
  const consoleOut = usePrettyLogs() ? createPrettyLogStream(process.stdout, { colorize: true }) : process.stdout;
  const consoleErr = usePrettyLogs() ? createPrettyLogStream(process.stderr, { colorize: true }) : process.stderr;
  mainLogStreams = [
    { stream: consoleOut, level: "trace" },
    { stream: consoleErr, level: "warn" },
    { stream: fileStream, level: "trace" }
  ];
  return mainLogStreams;
}
var import_node_fs, import_node_path, import_pino4, mainLogStreams;
var init_main_process_streams = __esm({
  "src/logging/main-process-streams.ts"() {
    import_node_fs = require("node:fs");
    import_node_path = require("node:path");
    init_openfde_home();
    import_pino4 = __toESM(require("pino"));
    init_pretty_stream();
    mainLogStreams = null;
  }
});

// src/logging/main-logger.ts
var framework, log, createLogger, instrumentObjectMethods2, instrumentInstanceMethods2, traceFunction2;
var init_main_logger = __esm({
  "src/logging/main-logger.ts"() {
    init_agent_run_context();
    init_pino_framework();
    init_main_process_streams();
    framework = createLoggingFramework({
      runtime: "main",
      level: process.env.NODE_ENV === "development" ? "debug" : "info",
      base: {
        processType: "main"
      },
      streams: buildMainProcessLogStreams(),
      duplicateEmit: duplicateAgentRunLog
    });
    ({
      log,
      createLogger,
      instrumentObjectMethods: instrumentObjectMethods2,
      instrumentInstanceMethods: instrumentInstanceMethods2,
      traceFunction: traceFunction2
    } = framework);
  }
});

// src/main/logger.ts
var init_logger = __esm({
  "src/main/logger.ts"() {
    init_main_logger();
  }
});

// src/main/services/sqlite/open-app-database.ts
function openAppSqliteDatabase(filePath) {
  ensureParentDirForFile(filePath);
  const db = new import_better_sqlite3.default(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
var import_better_sqlite3;
var init_open_app_database = __esm({
  "src/main/services/sqlite/open-app-database.ts"() {
    import_better_sqlite3 = __toESM(require("better-sqlite3"));
    init_openfde_home();
  }
});

// src/main/cache/app-cache.ts
var log2, AppCache, appCache;
var init_app_cache = __esm({
  "src/main/cache/app-cache.ts"() {
    init_logger();
    log2 = createLogger("agent.cache");
    AppCache = class {
      constructor() {
        this.agentsMap = /* @__PURE__ */ new Map();
        this.credentialsEntry = null;
        this.mcpToolsMap = /* @__PURE__ */ new Map();
        this.personaMap = /* @__PURE__ */ new Map();
      }
      // ── agents ──────────────────────────────────────────────────────────────
      getAgents(userId) {
        return this.agentsMap.get(userId)?.agents ?? null;
      }
      setAgents(userId, agents) {
        this.agentsMap.set(userId, { agents });
        log2.debug("Cache set: agents", { userId, count: agents.length });
      }
      invalidateAgents(userId) {
        if (this.agentsMap.delete(userId)) {
          log2.debug("Cache invalidated: agents", { userId });
        }
      }
      invalidateAllAgents() {
        this.agentsMap.clear();
        log2.debug("Cache invalidated: all agents");
      }
      // ── credentials ─────────────────────────────────────────────────────────
      getCredentials() {
        return this.credentialsEntry?.credentials ?? null;
      }
      setCredentials(credentials) {
        this.credentialsEntry = { credentials };
        log2.debug("Cache set: credentials");
      }
      invalidateCredentials() {
        if (this.credentialsEntry) {
          this.credentialsEntry = null;
          log2.debug("Cache invalidated: credentials");
        }
      }
      // ── MCP tools ───────────────────────────────────────────────────────────
      getMcpTools(userId, agentId) {
        return this.mcpToolsMap.get(`${userId}:${agentId}`)?.tools ?? null;
      }
      setMcpTools(userId, agentId, tools) {
        this.mcpToolsMap.set(`${userId}:${agentId}`, { tools });
        log2.debug("Cache set: mcpTools", { userId, agentId, count: tools.length });
      }
      invalidateMcpTools(userId, agentId) {
        if (agentId) {
          const key = `${userId}:${agentId}`;
          if (this.mcpToolsMap.delete(key)) {
            log2.debug("Cache invalidated: mcpTools", { userId, agentId });
          }
        } else {
          for (const key of this.mcpToolsMap.keys()) {
            if (key.startsWith(`${userId}:`)) this.mcpToolsMap.delete(key);
          }
          log2.debug("Cache invalidated: all mcpTools", { userId });
        }
      }
      invalidateAllMcpTools() {
        this.mcpToolsMap.clear();
        log2.debug("Cache invalidated: all mcpTools (global)");
      }
      // ── persona ─────────────────────────────────────────────────────────────
      getPersona(userId, memoryAgentId) {
        return this.personaMap.get(`${userId}:${memoryAgentId ?? ""}`)?.block ?? null;
      }
      setPersona(userId, memoryAgentId, block) {
        this.personaMap.set(`${userId}:${memoryAgentId ?? ""}`, { block });
        log2.debug("Cache set: persona", { userId, memoryAgentId });
      }
      invalidatePersona(userId, memoryAgentId) {
        const key = `${userId}:${memoryAgentId ?? ""}`;
        if (this.personaMap.delete(key)) {
          log2.debug("Cache invalidated: persona", { userId, memoryAgentId });
        }
      }
      invalidateAllPersona(userId) {
        if (userId) {
          for (const key of this.personaMap.keys()) {
            if (key.startsWith(`${userId}:`)) this.personaMap.delete(key);
          }
        } else {
          this.personaMap.clear();
        }
        log2.debug("Cache invalidated: all persona", { userId });
      }
      // ── diagnostics ─────────────────────────────────────────────────────────
      stats() {
        return {
          agents: this.agentsMap.size,
          credentials: this.credentialsEntry ? 1 : 0,
          mcpTools: this.mcpToolsMap.size,
          persona: this.personaMap.size
        };
      }
    };
    appCache = new AppCache();
  }
});

// src/shared/agent/llm-provider-registry.ts
function llmProviderSettingsLabel(id) {
  if (id === "ollama") return "Ollama (local)";
  if (id === "llamacpp") return "llama.cpp (local)";
  return LLM_PROVIDER_LABELS[id];
}
function normalizeProviderBaseUrl(url, fallback) {
  const value = url.trim();
  if (!value) return fallback;
  return value.replace(/\/$/, "");
}
function resolveOpenAiCompatibleCredentials(provider, values) {
  const meta = OPENAI_COMPATIBLE_LLM_PROVIDERS[provider];
  return {
    apiKey: (values[meta.apiKeyConfigKey] ?? "").trim(),
    baseURL: normalizeProviderBaseUrl(
      values[meta.baseUrlConfigKey] ?? "",
      meta.defaultBaseUrl
    )
  };
}
function openAiCompatibleProviderConfigKeys() {
  return OPENAI_COMPATIBLE_PROVIDER_IDS.flatMap((id) => {
    const meta = OPENAI_COMPATIBLE_LLM_PROVIDERS[id];
    return [meta.apiKeyConfigKey, meta.baseUrlConfigKey];
  });
}
var LLM_PROVIDER_IDS, OPENAI_COMPATIBLE_LLM_PROVIDERS, OPENAI_COMPATIBLE_PROVIDER_IDS, LLM_PROVIDER_LABELS, LLM_PROVIDER_SETTINGS_OPTIONS, AGENT_PROVIDER_SQL_CHECK;
var init_llm_provider_registry = __esm({
  "src/shared/agent/llm-provider-registry.ts"() {
    LLM_PROVIDER_IDS = [
      "ollama",
      "llamacpp",
      "openai",
      "anthropic",
      "gemini",
      "deepseek",
      "zhipu",
      "moonshot",
      "qwen",
      "bytedance",
      "huggingface",
      "nvidia-nim"
    ];
    OPENAI_COMPATIBLE_LLM_PROVIDERS = {
      moonshot: {
        id: "moonshot",
        label: "Moonshot",
        apiKeyConfigKey: "settings.moonshot.apiKey",
        baseUrlConfigKey: "settings.moonshot.baseUrl",
        defaultBaseUrl: "https://api.moonshot.cn/v1",
        defaultModels: [
          "kimi-k2-turbo-preview",
          "moonshot-v1-8k",
          "moonshot-v1-32k",
          "moonshot-v1-128k"
        ],
        hint: "Moonshot (Kimi) OpenAI-compatible API. Models include kimi-k2 and moonshot-v1 variants."
      },
      qwen: {
        id: "qwen",
        label: "Qwen",
        apiKeyConfigKey: "settings.qwen.apiKey",
        baseUrlConfigKey: "settings.qwen.baseUrl",
        defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        defaultModels: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen-long", "qwen3-max"],
        hint: "Alibaba Qwen via DashScope compatible-mode. Use your DashScope API key."
      },
      bytedance: {
        id: "bytedance",
        label: "ByteDance",
        apiKeyConfigKey: "settings.bytedance.apiKey",
        baseUrlConfigKey: "settings.bytedance.baseUrl",
        defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        defaultModels: [],
        hint: "Volcengine Ark (Doubao). Use your endpoint model id from the Ark console as the agent model name."
      },
      huggingface: {
        id: "huggingface",
        label: "Hugging Face",
        apiKeyConfigKey: "settings.huggingface.apiKey",
        baseUrlConfigKey: "settings.huggingface.baseUrl",
        defaultBaseUrl: "https://router.huggingface.co/v1",
        defaultModels: [],
        hint: "Hugging Face Inference router (OpenAI-compatible). Use provider/model ids from Hugging Face."
      },
      "nvidia-nim": {
        id: "nvidia-nim",
        label: "NVIDIA NIM",
        apiKeyConfigKey: "settings.nvidiaNim.apiKey",
        baseUrlConfigKey: "settings.nvidiaNim.baseUrl",
        defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
        defaultModels: [],
        hint: "NVIDIA NIM OpenAI-compatible API. Model list loads from /models when configured."
      }
    };
    OPENAI_COMPATIBLE_PROVIDER_IDS = Object.keys(
      OPENAI_COMPATIBLE_LLM_PROVIDERS
    );
    LLM_PROVIDER_LABELS = {
      ollama: "Ollama",
      llamacpp: "llama.cpp",
      openai: "OpenAI",
      anthropic: "Anthropic",
      gemini: "Gemini",
      deepseek: "DeepSeek",
      zhipu: "Zhipu GLM",
      moonshot: "Moonshot",
      qwen: "Qwen",
      bytedance: "ByteDance",
      huggingface: "Hugging Face",
      "nvidia-nim": "NVIDIA NIM"
    };
    LLM_PROVIDER_SETTINGS_OPTIONS = LLM_PROVIDER_IDS.map((id) => ({
      id,
      label: llmProviderSettingsLabel(id)
    }));
    AGENT_PROVIDER_SQL_CHECK = `(${LLM_PROVIDER_IDS.map((id) => `'${id}'`).join(", ")})`;
  }
});

// src/shared/agent/stage-llm-settings.ts
function isProviderType(value) {
  return LLM_PROVIDER_IDS.includes(value);
}
function parseAgentLlmChoice(provider, model) {
  const p = (provider ?? "").trim();
  const m = (model ?? "").trim();
  if (!p || !m || !isProviderType(p)) return null;
  return { provider: p, model: m };
}
function parseStageLlmOverrides(raw) {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out = {};
    for (const stage of AGENT_LLM_STAGES) {
      const entry = parsed[stage];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const o = entry;
      const choice = parseAgentLlmChoice(
        typeof o.provider === "string" ? o.provider : void 0,
        typeof o.model === "string" ? o.model : void 0
      );
      if (choice) out[stage] = choice;
    }
    return out;
  } catch {
    return {};
  }
}
function serializeStageLlmOverrides(stages) {
  const trimmed = {};
  for (const stage of AGENT_LLM_STAGES) {
    const choice = stages?.[stage];
    if (choice?.provider && choice.model.trim()) {
      trimmed[stage] = {
        provider: choice.provider,
        model: choice.model.trim()
      };
    }
  }
  return JSON.stringify(trimmed);
}
function parseAgentStageLlmSettings(args) {
  const defaultChoice = parseAgentLlmChoice(args.provider, args.model) ?? {
    provider: "ollama",
    model: ""
  };
  const mode = args.routingMode === "per_stage" ? "per_stage" : "unified";
  const stages = parseStageLlmOverrides(args.stageLlmJson ?? void 0);
  return {
    mode,
    default: defaultChoice,
    ...Object.keys(stages).length > 0 ? { stages } : {}
  };
}
function resolveStageLlmChoice(settings, stage) {
  if (settings.mode === "per_stage") {
    const override = settings.stages?.[stage];
    if (override?.provider && override.model.trim()) {
      return override;
    }
  }
  return settings.default;
}
var AGENT_LLM_STAGES;
var init_stage_llm_settings = __esm({
  "src/shared/agent/stage-llm-settings.ts"() {
    init_llm_provider_registry();
    AGENT_LLM_STAGES = [
      "explore",
      "toolLoop",
      "toolLoopRecovery",
      "verifier"
    ];
  }
});

// src/main/services/conversation-store/json-helpers.ts
function parseJsonObject(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}
function parseJsonStringArray(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === "string");
  } catch {
    return [];
  }
}
function parseJsonStringArrayOrNull(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null) return null;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item) => typeof item === "string");
  } catch {
    return null;
  }
}
function parseJsonToolApprovalOverrides(raw) {
  try {
    const parsed = JSON.parse(raw ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}
function normalizeToolApprovalOverrides(overrides) {
  const out = {};
  if (!overrides) return out;
  const keys = Object.keys(overrides).sort((a, b) => a.localeCompare(b));
  for (const k of keys) {
    const v = overrides[k];
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}
var init_json_helpers = __esm({
  "src/main/services/conversation-store/json-helpers.ts"() {
  }
});

// src/main/services/conversation-store/agent-configurations-repository.ts
function mapRow(row) {
  return {
    agentId: row.agent_id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    model: row.model,
    provider: row.provider,
    color: row.color,
    enabled: row.enabled !== 0,
    systemPrompt: row.system_prompt,
    skillsPrompt: row.skills_prompt,
    availableSet: parseJsonStringArray(row.available_set_json),
    availableSetTouched: row.available_set_touched !== 0,
    toolNeedsApprovalOverrides: parseJsonToolApprovalOverrides(
      row.tool_needs_approval_overrides_json
    ),
    availableMcpServers: parseJsonStringArrayOrNull(
      row.available_mcp_servers_json
    ),
    toolLoopMaxIterations: row.tool_loop_max_iterations,
    todoMaxRetries: row.todo_max_retries,
    allowAsSubAgent: row.allow_as_sub_agent !== 0,
    allowSubAgents: row.allow_sub_agents !== 0,
    subAgentIds: parseJsonStringArrayOrNull(row.sub_agent_ids_json),
    llmRoutingMode: row.llm_routing_mode === "per_stage" ? "per_stage" : "unified",
    stageLlm: parseStageLlmOverrides(row.stage_llm_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
var SELECT_COLUMNS, AgentConfigurationsRepository;
var init_agent_configurations_repository = __esm({
  "src/main/services/conversation-store/agent-configurations-repository.ts"() {
    init_stage_llm_settings();
    init_json_helpers();
    SELECT_COLUMNS = `
  agent_id,
  user_id,
  name,
  description,
  model,
  provider,
  color,
  enabled,
  system_prompt,
  skills_prompt,
  available_set_json,
  available_set_touched,
  tool_needs_approval_overrides_json,
  available_mcp_servers_json,
  tool_loop_max_iterations,
  todo_max_retries,
  allow_as_sub_agent,
  allow_sub_agents,
  sub_agent_ids_json,
  llm_routing_mode,
  stage_llm_json,
  created_at,
  updated_at
`;
    AgentConfigurationsRepository = class {
      constructor(db) {
        this.db = db;
      }
      list(userId) {
        const rows = this.db.prepare(
          `SELECT ${SELECT_COLUMNS}
         FROM agent_configurations
         WHERE user_id = ?
         ORDER BY updated_at DESC`
        ).all(userId);
        return rows.map(mapRow);
      }
      upsert(config) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        this.db.prepare(
          `INSERT INTO agent_configurations (
          agent_id,
          user_id,
          name,
          description,
          model,
          provider,
          color,
          enabled,
          system_prompt,
          skills_prompt,
          available_set_json,
          available_set_touched,
          tool_needs_approval_overrides_json,
          available_mcp_servers_json,
          tool_loop_max_iterations,
          todo_max_retries,
          allow_as_sub_agent,
          allow_sub_agents,
          sub_agent_ids_json,
          llm_routing_mode,
          stage_llm_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(agent_id, user_id)
        DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          model = excluded.model,
          provider = excluded.provider,
          color = excluded.color,
          enabled = excluded.enabled,
          system_prompt = excluded.system_prompt,
          skills_prompt = excluded.skills_prompt,
          available_set_json = excluded.available_set_json,
          available_set_touched = excluded.available_set_touched,
          tool_needs_approval_overrides_json = excluded.tool_needs_approval_overrides_json,
          available_mcp_servers_json = excluded.available_mcp_servers_json,
          tool_loop_max_iterations = excluded.tool_loop_max_iterations,
          todo_max_retries = excluded.todo_max_retries,
          allow_as_sub_agent = excluded.allow_as_sub_agent,
          allow_sub_agents = excluded.allow_sub_agents,
          sub_agent_ids_json = excluded.sub_agent_ids_json,
          llm_routing_mode = excluded.llm_routing_mode,
          stage_llm_json = excluded.stage_llm_json,
          updated_at = excluded.updated_at`
        ).run(
          config.agentId,
          config.userId,
          config.name,
          config.description,
          config.model,
          config.provider,
          config.color,
          config.enabled ? 1 : 0,
          config.systemPrompt,
          config.skillsPrompt,
          JSON.stringify([...new Set(config.availableSet ?? [])]),
          config.availableSetTouched ? 1 : 0,
          JSON.stringify(
            normalizeToolApprovalOverrides(config.toolNeedsApprovalOverrides)
          ),
          config.availableMcpServers != null ? JSON.stringify([...new Set(config.availableMcpServers)]) : "null",
          config.toolLoopMaxIterations,
          config.todoMaxRetries,
          config.allowAsSubAgent ? 1 : 0,
          config.allowSubAgents ? 1 : 0,
          config.subAgentIds != null ? JSON.stringify([...new Set(config.subAgentIds)]) : "null",
          config.llmRoutingMode === "per_stage" ? "per_stage" : "unified",
          serializeStageLlmOverrides(config.stageLlm),
          now,
          now
        );
      }
      delete(agentId, userId) {
        this.db.prepare(
          "DELETE FROM agent_configurations WHERE agent_id = ? AND user_id = ?"
        ).run(agentId, userId);
      }
    };
  }
});

// src/main/services/conversation-store/conversations-repository.ts
var ConversationsRepository;
var init_conversations_repository = __esm({
  "src/main/services/conversation-store/conversations-repository.ts"() {
    ConversationsRepository = class {
      constructor(db) {
        this.db = db;
      }
      list(agentId) {
        const rows = this.db.prepare(
          "SELECT id, agent_id, title, created_at, updated_at FROM conversations WHERE agent_id = ? ORDER BY updated_at DESC"
        ).all(agentId);
        return rows.map((r) => ({
          id: r.id,
          agentId: r.agent_id,
          title: r.title,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }));
      }
      get(conversationId) {
        const row = this.db.prepare(
          "SELECT id, agent_id, title, created_at, updated_at FROM conversations WHERE id = ?"
        ).get(conversationId);
        if (!row) return null;
        return {
          id: row.id,
          agentId: row.agent_id,
          title: row.title,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      }
      create(conv) {
        this.db.prepare(
          `INSERT INTO conversations (id, agent_id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
        ).run(conv.id, conv.agentId, conv.title, conv.createdAt, conv.updatedAt);
        return conv;
      }
      updateTitle(conversationId, title) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        this.db.prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?").run(title, now, conversationId);
      }
      updateAgentId(conversationId, agentId) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        this.db.prepare(
          "UPDATE conversations SET agent_id = ?, updated_at = ? WHERE id = ?"
        ).run(agentId, now, conversationId);
      }
      touch(conversationId) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        this.db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(now, conversationId);
      }
      delete(conversationId) {
        this.db.prepare("DELETE FROM conversations WHERE id = ?").run(conversationId);
      }
    };
  }
});

// src/shared/mcp/reference-mcp-servers.ts
function isReferenceMcpServer(server) {
  return REFERENCE_MCP_SERVER_IDS.has(server.id);
}
var REFERENCE_MCP_SERVER_DEFINITIONS, REFERENCE_MCP_SERVER_IDS;
var init_reference_mcp_servers = __esm({
  "src/shared/mcp/reference-mcp-servers.ts"() {
    REFERENCE_MCP_SERVER_DEFINITIONS = [
      {
        id: "ref-mcp-everything",
        name: "Everything",
        transportType: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-everything"],
        enabled: false
      },
      {
        id: "ref-mcp-fetch",
        name: "Fetch",
        transportType: "stdio",
        command: "uvx",
        args: ["mcp-server-fetch"],
        enabled: false
      },
      {
        id: "ref-mcp-filesystem",
        name: "Filesystem",
        transportType: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem"],
        enabled: false
      },
      {
        id: "ref-mcp-memory",
        name: "Memory",
        transportType: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-memory"],
        enabled: false
      },
      {
        id: "ref-mcp-time",
        name: "Time",
        transportType: "stdio",
        command: "uvx",
        args: ["mcp-server-time"],
        enabled: false
      },
      {
        id: "ref-mcp-sequential-thinking",
        name: "Sequential Thinking",
        transportType: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
        enabled: false
      }
    ];
    REFERENCE_MCP_SERVER_IDS = new Set(
      REFERENCE_MCP_SERVER_DEFINITIONS.map((definition) => definition.id)
    );
  }
});

// src/main/services/conversation-store/mcp-servers-repository.ts
function mapRow2(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    transportType: row.transport_type,
    url: row.url,
    command: row.command,
    args: parseJsonStringArray(row.args_json),
    env: parseJsonObject(row.env_json),
    headers: parseJsonObject(row.headers_json),
    enabled: row.enabled !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
var McpServersRepository;
var init_mcp_servers_repository = __esm({
  "src/main/services/conversation-store/mcp-servers-repository.ts"() {
    init_reference_mcp_servers();
    init_json_helpers();
    McpServersRepository = class {
      constructor(db) {
        this.db = db;
      }
      ensureReferenceServers(userId, _workspacePath) {
        const insert = this.db.prepare(
          `INSERT OR IGNORE INTO mcp_servers (
        id,
        user_id,
        name,
        transport_type,
        url,
        command,
        args_json,
        env_json,
        headers_json,
        enabled,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        const baseTime = Date.now();
        for (const [index, definition] of REFERENCE_MCP_SERVER_DEFINITIONS.entries()) {
          const timestamp = new Date(baseTime - index * 1e3).toISOString();
          insert.run(
            definition.id,
            userId,
            definition.name,
            definition.transportType,
            "",
            definition.command,
            JSON.stringify(definition.args),
            JSON.stringify(definition.env ?? {}),
            JSON.stringify(definition.headers ?? {}),
            definition.enabled === true ? 1 : 0,
            timestamp,
            timestamp
          );
        }
      }
      list(userId) {
        const rows = this.db.prepare(
          `SELECT id, user_id, name, transport_type, url, command, args_json, env_json, headers_json, enabled, created_at, updated_at
         FROM mcp_servers
         WHERE user_id = ?
         ORDER BY updated_at DESC`
        ).all(userId);
        return rows.map(mapRow2);
      }
      get(userId, serverId) {
        const row = this.db.prepare(
          `SELECT id, user_id, name, transport_type, url, command, args_json, env_json, headers_json, enabled, created_at, updated_at
         FROM mcp_servers
         WHERE user_id = ? AND id = ?`
        ).get(userId, serverId);
        if (!row) return null;
        return mapRow2(row);
      }
      create(server) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        this.db.prepare(
          `INSERT INTO mcp_servers (
          id,
          user_id,
          name,
          transport_type,
          url,
          command,
          args_json,
          env_json,
          headers_json,
          enabled,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          server.id,
          server.userId,
          server.name,
          server.transportType,
          server.url,
          server.command,
          JSON.stringify(server.args ?? []),
          JSON.stringify(server.env ?? {}),
          JSON.stringify(server.headers ?? {}),
          server.enabled ? 1 : 0,
          now,
          now
        );
        return {
          ...server,
          createdAt: now,
          updatedAt: now
        };
      }
      setEnabled(userId, serverId, enabled) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        this.db.prepare(
          "UPDATE mcp_servers SET enabled = ?, updated_at = ? WHERE user_id = ? AND id = ?"
        ).run(enabled ? 1 : 0, now, userId, serverId);
      }
      delete(userId, serverId) {
        if (isReferenceMcpServer({ id: serverId })) {
          throw new Error("Cannot delete a built-in MCP server.");
        }
        this.db.prepare("DELETE FROM mcp_servers WHERE user_id = ? AND id = ?").run(userId, serverId);
      }
    };
  }
});

// src/shared/text/truncate-head-tail.ts
function truncateHeadTail(text, keepChars = HEAD_TAIL_KEEP_CHARS, omission = HEAD_TAIL_OMISSION) {
  if (!text) return text;
  const maxPlain = keepChars * 2;
  if (text.length <= maxPlain) return text;
  return `${text.slice(0, keepChars)}${omission}${text.slice(-keepChars)}`;
}
var HEAD_TAIL_KEEP_CHARS, HEAD_TAIL_OMISSION;
var init_truncate_head_tail = __esm({
  "src/shared/text/truncate-head-tail.ts"() {
    HEAD_TAIL_KEEP_CHARS = 2e5;
    HEAD_TAIL_OMISSION = "\n....\n";
  }
});

// src/shared/markdown/prepare-markdown-source.ts
function isProseFenceLang(lang) {
  const normalized = lang.trim().toLowerCase();
  if (PROSE_FENCE_LANGS.has(normalized)) return true;
  if (normalized.startsWith("#")) return true;
  return false;
}
function stripLeadingProseFence(source) {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith("```")) return source;
  const lines = trimmed.split("\n");
  const firstLine = lines[0] ?? "";
  const openMatch = firstLine.match(/^(`{3,})(?:[ \t]*(\w+)[ \t]*)?(.*)$/);
  if (!openMatch) return source;
  const lang = openMatch[2] ?? "";
  const restOfLine = openMatch[3] ?? "";
  if (!isProseFenceLang(lang)) {
    return source;
  }
  if (lang === "" && restOfLine.trim() && !restOfLine.trimStart().startsWith("#")) {
    return source;
  }
  if (restOfLine.trim()) {
    return [restOfLine.trimStart(), ...lines.slice(1)].join("\n").trimEnd();
  }
  return lines.slice(1).join("\n").trim();
}
function stripTrailingProseFence(source) {
  const trimmed = source.trimEnd();
  const match = trimmed.match(/(\r?\n)?(`{3,})[ \t]*$/);
  if (!match) return source;
  return trimmed.slice(0, trimmed.length - match[0].length).trimEnd();
}
function stripInteriorProseFencesFromTruncated(source) {
  if (!source.includes(HEAD_TAIL_OMISSION.trim())) return source;
  return source.replace(STANDALONE_FENCE_LINE_RE, (line, _ticks, lang = "") => {
    return isProseFenceLang(lang) ? "" : line;
  }).replace(/\n{3,}/g, "\n\n").trim();
}
function unwrapOuterMarkdownFence(source) {
  const trimmed = source.trim();
  if (!trimmed.startsWith("```")) return source;
  const symmetric = trimmed.match(OUTER_MARKDOWN_FENCE_RE);
  if (symmetric) {
    const lang = symmetric[2] ?? "";
    if (isProseFenceLang(lang)) {
      return (symmetric[3] ?? source).trim();
    }
    return source;
  }
  let body = stripLeadingProseFence(trimmed);
  body = stripTrailingProseFence(body);
  return body.trim();
}
function prepareMarkdownSource(source) {
  const normalized = source.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  let body = unwrapOuterMarkdownFence(normalized);
  body = stripInteriorProseFencesFromTruncated(body);
  return body;
}
function prepareAndTruncateMarkdownSource(source, keepChars) {
  const prepared = prepareMarkdownSource(source);
  if (!prepared) return "";
  const truncated = truncateHeadTail(prepared, keepChars);
  return prepareMarkdownSource(truncated);
}
var OUTER_MARKDOWN_FENCE_RE, STANDALONE_FENCE_LINE_RE, PROSE_FENCE_LANGS;
var init_prepare_markdown_source = __esm({
  "src/shared/markdown/prepare-markdown-source.ts"() {
    init_truncate_head_tail();
    OUTER_MARKDOWN_FENCE_RE = /^(`{3,})(?:[ \t]*(\w+)[ \t]*)?\r?\n([\s\S]*?)\r?\n?\1[ \t]*$/;
    STANDALONE_FENCE_LINE_RE = /^(`{3,})(?:[ \t]*(\w+)[ \t]*)?$/gm;
    PROSE_FENCE_LANGS = /* @__PURE__ */ new Set([
      "",
      "markdown",
      "md",
      "text",
      "txt",
      "plaintext"
    ]);
  }
});

// src/shared/persistence/limit-persisted-content.ts
function limitTextForStorage(text, keepChars = HEAD_TAIL_KEEP_CHARS) {
  return prepareAndTruncateMarkdownSource(text, keepChars);
}
function limitStructuredShape(parsed, keepChars = HEAD_TAIL_KEEP_CHARS) {
  const outer = { ...parsed.assistantContent?.outer ?? {} };
  delete outer.streamingText;
  if (typeof outer.finalResult === "string") {
    outer.finalResult = limitTextForStorage(outer.finalResult, keepChars);
  }
  if (typeof outer.report === "string") {
    outer.report = limitTextForStorage(outer.report, keepChars);
  }
  const pipeline = outer.pipelineConversation;
  if (Array.isArray(pipeline)) {
    outer.pipelineConversation = pipeline.map((turn) => {
      if (!turn || typeof turn !== "object") return turn;
      const row = { ...turn };
      if (typeof row.content === "string") {
        row.content = limitTextForStorage(row.content, keepChars);
      }
      return row;
    });
  }
  const captures = outer.stepCaptures;
  if (Array.isArray(captures)) {
    outer.stepCaptures = captures.map((capture) => {
      if (!capture || typeof capture !== "object") return capture;
      const row = { ...capture };
      if (typeof row.content === "string") {
        row.content = limitTextForStorage(row.content, keepChars);
      }
      return row;
    });
  }
  const subSteps = (parsed.assistantContent?.subSteps ?? []).map((step) => {
    const row = { ...step };
    if (typeof row.content === "string") {
      row.content = limitTextForStorage(row.content, keepChars);
    }
    return row;
  });
  return {
    ...parsed,
    assistantContent: {
      ...parsed.assistantContent,
      outer,
      subSteps
    }
  };
}
function isStructuredPersistShape(value) {
  if (!value || typeof value !== "object") return false;
  const root = value;
  return root.version === 2 && typeof root.assistantContent === "object";
}
function shrinkStructuredByReducingFields(parsed) {
  let keep = HEAD_TAIL_KEEP_CHARS;
  while (keep >= 1e3) {
    const limited = limitStructuredShape(parsed, keep);
    const json = JSON.stringify(limited);
    if (json.length <= PERSISTED_MESSAGE_CONTENT_MAX_CHARS) return json;
    keep = Math.floor(keep / 2);
  }
  const outer = parsed.assistantContent?.outer ?? {};
  const minimal = {
    version: 2,
    assistantContent: {
      outer: {
        finalResult: typeof outer.finalResult === "string" ? limitTextForStorage(outer.finalResult, 1e3) : "",
        report: "",
        pipelineConversation: []
      },
      subSteps: []
    }
  };
  return JSON.stringify(minimal);
}
function shrinkStructuredToFit(json, parsed) {
  if (json.length <= PERSISTED_MESSAGE_CONTENT_MAX_CHARS) return json;
  const outer = parsed.assistantContent?.outer;
  const pipeline = outer?.pipelineConversation;
  if (Array.isArray(pipeline) && pipeline.length > 0) {
    let turns = [...pipeline];
    while (turns.length > 0) {
      turns.pop();
      const working = limitStructuredShape({
        ...parsed,
        assistantContent: {
          ...parsed.assistantContent,
          outer: {
            ...parsed.assistantContent?.outer,
            pipelineConversation: [...turns]
          }
        }
      });
      const next = JSON.stringify(working);
      if (next.length <= PERSISTED_MESSAGE_CONTENT_MAX_CHARS) return next;
    }
  }
  return shrinkStructuredByReducingFields(parsed);
}
function limitMessageContentForPersistence(content, role) {
  const trimmed = content.trim();
  if (!trimmed) return content;
  if (role === "user") {
    return limitTextForStorage(trimmed);
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!isStructuredPersistShape(parsed)) {
      return limitTextForStorage(trimmed);
    }
    const limited = limitStructuredShape(parsed);
    const json = JSON.stringify(limited);
    return shrinkStructuredToFit(json, limited);
  } catch {
    return limitTextForStorage(trimmed);
  }
}
var PERSISTED_MESSAGE_CONTENT_MAX_CHARS;
var init_limit_persisted_content = __esm({
  "src/shared/persistence/limit-persisted-content.ts"() {
    init_truncate_head_tail();
    init_prepare_markdown_source();
    PERSISTED_MESSAGE_CONTENT_MAX_CHARS = 12e5;
  }
});

// src/main/services/conversation-store/messages-repository.ts
function rowToMessage(r) {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    agentId: r.agent_id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
    threadTag: r.thread_tag || "general"
  };
}
var MessagesRepository;
var init_messages_repository = __esm({
  "src/main/services/conversation-store/messages-repository.ts"() {
    init_limit_persisted_content();
    MessagesRepository = class {
      constructor(db, conversations) {
        this.db = db;
        this.conversations = conversations;
      }
      count(conversationId) {
        const row = this.db.prepare(
          "SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?"
        ).get(conversationId);
        return row.count;
      }
      /**
       * Returns the latest `limit` messages (chronological order) plus whether older
       * rows exist. Pass `before` (ISO created_at) to page into older history.
       */
      listPage(conversationId, opts = {}) {
        const { before, limit = 40 } = opts;
        const rows = before ? this.db.prepare(
          `SELECT id, conversation_id, agent_id, role, content, created_at, thread_tag
             FROM messages
             WHERE conversation_id = ? AND created_at < ?
             ORDER BY created_at DESC
             LIMIT ?`
        ).all(conversationId, before, limit) : this.db.prepare(
          `SELECT id, conversation_id, agent_id, role, content, created_at, thread_tag
             FROM messages
             WHERE conversation_id = ?
             ORDER BY created_at DESC
             LIMIT ?`
        ).all(conversationId, limit);
        const messages = rows.reverse().map(rowToMessage);
        if (messages.length === 0) {
          return { messages, hasOlder: false };
        }
        const oldest = messages[0]?.createdAt;
        const olderRow = this.db.prepare(
          `SELECT 1 as ok FROM messages
         WHERE conversation_id = ? AND created_at < ?
         LIMIT 1`
        ).get(conversationId, oldest);
        return { messages, hasOlder: Boolean(olderRow?.ok) };
      }
      list(conversationId) {
        const rows = this.db.prepare(
          "SELECT id, conversation_id, agent_id, role, content, created_at, thread_tag FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
        ).all(conversationId);
        return rows.map(rowToMessage);
      }
      /**
       * Returns messages for a given thread tag, ordered ascending by created_at.
       * Pass `before` to limit to messages older than that ISO timestamp (for history injection).
       */
      listByThread(conversationId, threadTag, opts = {}) {
        const { before, limit = 20 } = opts;
        const rows = before ? this.db.prepare(
          `SELECT id, conversation_id, agent_id, role, content, created_at, thread_tag
             FROM messages
             WHERE conversation_id = ? AND thread_tag = ? AND created_at < ?
             ORDER BY created_at DESC
             LIMIT ?`
        ).all(conversationId, threadTag, before, limit) : this.db.prepare(
          `SELECT id, conversation_id, agent_id, role, content, created_at, thread_tag
             FROM messages
             WHERE conversation_id = ? AND thread_tag = ?
             ORDER BY created_at DESC
             LIMIT ?`
        ).all(conversationId, threadTag, limit);
        return rows.reverse().map(rowToMessage);
      }
      /** Returns the distinct thread tags present in a conversation and how many messages each has. */
      getThreadTagCounts(conversationId) {
        const rows = this.db.prepare(
          `SELECT thread_tag, COUNT(*) as count FROM messages
         WHERE conversation_id = ?
         GROUP BY thread_tag
         ORDER BY count DESC`
        ).all(conversationId);
        return rows.map((r) => ({ threadTag: r.thread_tag, count: r.count }));
      }
      save(msg) {
        const content = limitMessageContentForPersistence(msg.content, msg.role);
        this.db.prepare(
          `INSERT INTO messages (id, conversation_id, agent_id, role, content, created_at, has_error, thread_tag)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(id) DO UPDATE SET
           conversation_id = excluded.conversation_id,
           agent_id = excluded.agent_id,
           role = excluded.role,
           content = excluded.content,
           created_at = excluded.created_at,
           has_error = 0,
           thread_tag = excluded.thread_tag`
        ).run(
          msg.id,
          msg.conversationId,
          msg.agentId,
          msg.role,
          content,
          msg.createdAt,
          msg.threadTag ?? "general"
        );
        this.conversations.touch(msg.conversationId);
      }
      update(id, content) {
        const row = this.db.prepare("SELECT role FROM messages WHERE id = ?").get(id);
        const role = row?.role ?? "assistant";
        const limited = limitMessageContentForPersistence(content, role);
        this.db.prepare("UPDATE messages SET content = ?, has_error = 0 WHERE id = ?").run(limited, id);
      }
      deleteByIds(ids) {
        if (ids.length === 0) return;
        const stmt = this.db.prepare("DELETE FROM messages WHERE id = ?");
        const tx = this.db.transaction((messageIds) => {
          for (const id of messageIds) stmt.run(id);
        });
        tx(ids);
      }
      deleteAllForConversation(conversationId) {
        this.db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(conversationId);
        this.conversations.touch(conversationId);
      }
      /**
       * Full-text search across message content via the messages_fts virtual table.
       * Scoped to a conversation when supplied; otherwise searches all messages.
       */
      search(query, opts = {}) {
        const { conversationId, agentId, limit = 20 } = opts;
        const conditions = ["messages_fts MATCH ?"];
        const params = [query];
        if (conversationId) {
          conditions.push("m.conversation_id = ?");
          params.push(conversationId);
        }
        if (agentId) {
          conditions.push("m.agent_id = ?");
          params.push(agentId);
        }
        params.push(limit);
        const sql = `
      SELECT m.id, m.conversation_id, m.agent_id, m.role, m.content,
             m.created_at, m.has_error, f.rank
      FROM messages_fts f
      JOIN messages m ON m.rowid = f.rowid
      WHERE ${conditions.join(" AND ")}
      ORDER BY f.rank
      LIMIT ?`;
        const rows = this.db.prepare(sql).all(...params);
        return rows.map((r) => ({
          id: r.id,
          conversationId: r.conversation_id,
          agentId: r.agent_id,
          role: r.role,
          content: r.content,
          createdAt: r.created_at,
          rank: r.rank
        }));
      }
    };
  }
});

// src/main/services/conversation-store/migrations.ts
function runMigrations(db) {
  createBaseSchema(db);
  migrateMessagesConversationId(db);
  migrateAgentConfigurationsColumns(db);
  migrateAgentSummaryPromptColumn(db);
  migrateDropLegacyAgentPromptColumns(db);
  migrateAgentProviderDeepSeek(db);
  migrateAgentProviderLlamaCpp(db);
  migrateSchedulersSchema(db);
  migrateConversationSandboxRuns(db);
  migrateTokenUsage(db);
  migrateSkillCompilations(db);
  migrateToolResultsAndFts(db);
  migrateThreadTags(db);
  migrateConversationSettings(db);
  migrateCodingModePlanToExplore(db);
  migrateConversationPlanModeState(db);
  migrateParentMessageId(db);
  migrateEnableSubAgentDelegationDefault(db);
  migrateEnableAllowAsSubAgentDefault(db);
  migrateAgentProviderExtendedLlm(db);
  migrateAgentProviderZhipu(db);
  migrateAgentStageLlmColumns(db);
  migrateWorkflowsSchema(db);
  migrateSchedulersRunWorkflow(db);
}
function migrateAgentStageLlmColumns(db) {
  if (!tableHasColumn(db, "agent_configurations", "llm_routing_mode")) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN llm_routing_mode TEXT NOT NULL DEFAULT 'unified';`
    );
  }
  if (!tableHasColumn(db, "agent_configurations", "stage_llm_json")) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN stage_llm_json TEXT NOT NULL DEFAULT '{}';`
    );
  }
}
function migrateSkillCompilations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_compilations (
      skill_id            TEXT NOT NULL,
      source              TEXT NOT NULL CHECK (source IN ('bundled', 'user')),
      source_fingerprint  TEXT NOT NULL DEFAULT '',
      status              TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
      compiled_json       TEXT NOT NULL DEFAULT '',
      error_message       TEXT,
      compiled_at         TEXT,
      updated_at          TEXT NOT NULL,
      PRIMARY KEY (skill_id, source)
    );
    CREATE INDEX IF NOT EXISTS idx_skill_compilations_skill_id
      ON skill_compilations (skill_id, updated_at);
  `);
}
function createBaseSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT PRIMARY KEY,
      agent_id    TEXT NOT NULL,
      title       TEXT NOT NULL DEFAULT 'New Conversation',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_agent_id
      ON conversations (agent_id, updated_at);

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT    PRIMARY KEY,
      conversation_id TEXT    NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      agent_id        TEXT    NOT NULL,
      role            TEXT    NOT NULL CHECK (role IN ('user', 'assistant')),
      content         TEXT    NOT NULL,
      created_at      TEXT    NOT NULL,
      has_error       INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
      ON messages (conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS user_properties (
      user_id         TEXT NOT NULL,
      property_key    TEXT NOT NULL,
      property_value  TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      PRIMARY KEY (user_id, property_key)
    );
    CREATE INDEX IF NOT EXISTS idx_user_properties_user_id
      ON user_properties (user_id, updated_at);

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      name            TEXT NOT NULL,
      transport_type  TEXT NOT NULL CHECK (transport_type IN ('http', 'sse', 'stdio')),
      url             TEXT NOT NULL DEFAULT '',
      command         TEXT NOT NULL DEFAULT '',
      args_json       TEXT NOT NULL DEFAULT '[]',
      env_json        TEXT NOT NULL DEFAULT '{}',
      headers_json    TEXT NOT NULL DEFAULT '{}',
      enabled         INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_servers_user_id
      ON mcp_servers (user_id, updated_at);

    CREATE TABLE IF NOT EXISTS agent_configurations (
      agent_id         TEXT NOT NULL,
      user_id          TEXT NOT NULL,
      name             TEXT NOT NULL,
      description      TEXT NOT NULL DEFAULT '',
      model            TEXT NOT NULL DEFAULT '',
      provider         TEXT NOT NULL CHECK (provider IN ${AGENT_PROVIDER_CHECK}),
      color            TEXT NOT NULL CHECK (color IN ('primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral')),
      enabled          INTEGER NOT NULL DEFAULT 1,
      system_prompt    TEXT NOT NULL DEFAULT '',
      skills_prompt    TEXT NOT NULL DEFAULT '',
      available_set_json TEXT NOT NULL DEFAULT '[]',
      available_set_touched INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      PRIMARY KEY (agent_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_configurations_user_id
      ON agent_configurations (user_id, updated_at);

    CREATE TABLE IF NOT EXISTS schedulers (
      id               TEXT PRIMARY KEY,
      user_id          TEXT NOT NULL,
      name             TEXT NOT NULL,
      enabled          INTEGER NOT NULL DEFAULT 1,
      schedule_type    TEXT NOT NULL CHECK (schedule_type IN ('interval', 'cron')),
      interval_ms      INTEGER,
      cron_expression  TEXT,
      timezone         TEXT,
      action_type      TEXT NOT NULL CHECK (action_type IN ('send-channel-message', 'run-agent')),
      channel_id       TEXT NOT NULL DEFAULT '',
      target           TEXT NOT NULL DEFAULT '',
      message          TEXT NOT NULL DEFAULT '',
      agent_id         TEXT NOT NULL DEFAULT '',
      conversation_id  TEXT NOT NULL DEFAULT '',
      prompt           TEXT NOT NULL DEFAULT '',
      last_run_at      TEXT,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_schedulers_user_id
      ON schedulers (user_id, updated_at);
  `);
}
function tableHasColumn(db, table, column) {
  const cols = db.pragma(`table_info(${table})`);
  if (!Array.isArray(cols)) return false;
  return cols.some((c) => c.name === column);
}
function migrateMessagesConversationId(db) {
  if (!tableHasColumn(db, "messages", "conversation_id")) {
    db.exec(
      `ALTER TABLE messages ADD COLUMN conversation_id TEXT NOT NULL DEFAULT '';`
    );
  }
}
function migrateAgentConfigurationsColumns(db) {
  if (!tableHasColumn(db, "agent_configurations", "available_set_json")) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN available_set_json TEXT NOT NULL DEFAULT '[]';`
    );
  }
  if (!tableHasColumn(db, "agent_configurations", "available_set_touched")) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN available_set_touched INTEGER NOT NULL DEFAULT 0;`
    );
  }
  if (!tableHasColumn(db, "agent_configurations", "available_mcp_servers_json")) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN available_mcp_servers_json TEXT NOT NULL DEFAULT 'null';`
    );
  }
  if (!tableHasColumn(
    db,
    "agent_configurations",
    "tool_needs_approval_overrides_json"
  )) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN tool_needs_approval_overrides_json TEXT NOT NULL DEFAULT '{}';`
    );
  }
  if (!tableHasColumn(db, "agent_configurations", "tool_loop_max_iterations")) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN tool_loop_max_iterations INTEGER NOT NULL DEFAULT 40;`
    );
  }
  if (!tableHasColumn(db, "agent_configurations", "todo_max_retries")) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN todo_max_retries INTEGER NOT NULL DEFAULT 3;`
    );
  }
  if (!tableHasColumn(db, "agent_configurations", "allow_as_sub_agent")) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN allow_as_sub_agent INTEGER NOT NULL DEFAULT 1;`
    );
  }
  if (!tableHasColumn(db, "agent_configurations", "allow_sub_agents")) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN allow_sub_agents INTEGER NOT NULL DEFAULT 1;`
    );
  }
  if (!tableHasColumn(db, "agent_configurations", "sub_agent_ids_json")) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN sub_agent_ids_json TEXT NOT NULL DEFAULT 'null';`
    );
  }
  db.exec(`
    UPDATE agent_configurations
    SET available_set_touched = 1
    WHERE available_set_touched = 0
      AND available_set_json IS NOT NULL
      AND available_set_json != '[]';
  `);
}
function rebuildAgentConfigurationsProviderCheck(db, legacySuffix) {
  const table = "agent_configurations";
  const legacy = `${table}_${legacySuffix}`;
  db.exec(`
    BEGIN;
    ALTER TABLE ${table} RENAME TO ${legacy};
    ${agentConfigurationsTableDdl(table)}
    INSERT INTO ${table} (
      agent_id,
      user_id,
      name,
      description,
      model,
      provider,
      color,
      enabled,
      system_prompt,
      skills_prompt,
      available_set_json,
      available_set_touched,
      tool_needs_approval_overrides_json,
      available_mcp_servers_json,
      tool_loop_max_iterations,
      todo_max_retries,
      allow_as_sub_agent,
      allow_sub_agents,
      sub_agent_ids_json,
      created_at,
      updated_at
    )
    SELECT
      agent_id,
      user_id,
      name,
      description,
      model,
      provider,
      color,
      enabled,
      system_prompt,
      skills_prompt,
      available_set_json,
      available_set_touched,
      tool_needs_approval_overrides_json,
      available_mcp_servers_json,
      tool_loop_max_iterations,
      COALESCE(todo_max_retries, 3),
      COALESCE(allow_as_sub_agent, 1),
      COALESCE(allow_sub_agents, 1),
      COALESCE(sub_agent_ids_json, 'null'),
      created_at,
      updated_at
    FROM ${legacy};
    DROP TABLE ${legacy};
    CREATE INDEX IF NOT EXISTS idx_agent_configurations_user_id
      ON ${table} (user_id, updated_at);
    COMMIT;
  `);
}
function agentConfigurationsProviderCheckSql(db) {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agent_configurations'"
  ).get();
  return row?.sql;
}
function migrateAgentProviderDeepSeek(db) {
  const sql = agentConfigurationsProviderCheckSql(db);
  if (!sql || sql.includes("'deepseek'")) return;
  rebuildAgentConfigurationsProviderCheck(db, "provider_legacy_deepseek");
}
function migrateAgentProviderExtendedLlm(db) {
  const sql = agentConfigurationsProviderCheckSql(db);
  if (!sql || sql.includes("'moonshot'")) return;
  rebuildAgentConfigurationsProviderCheck(db, "provider_legacy_extended_llm");
}
function migrateAgentProviderLlamaCpp(db) {
  const sql = agentConfigurationsProviderCheckSql(db);
  if (!sql || sql.includes("'llamacpp'")) return;
  rebuildAgentConfigurationsProviderCheck(db, "provider_legacy_llamacpp");
}
function migrateAgentProviderZhipu(db) {
  const sql = agentConfigurationsProviderCheckSql(db);
  if (!sql || sql.includes("'zhipu'")) return;
  rebuildAgentConfigurationsProviderCheck(db, "provider_legacy_zhipu");
}
function legacyAgentConfigurationsTableDdl(tableName = "agent_configurations") {
  return `CREATE TABLE ${tableName} (
      agent_id         TEXT NOT NULL,
      user_id          TEXT NOT NULL,
      name             TEXT NOT NULL,
      description      TEXT NOT NULL DEFAULT '',
      model            TEXT NOT NULL DEFAULT '',
      provider         TEXT NOT NULL CHECK (provider IN ${AGENT_PROVIDER_CHECK}),
      color            TEXT NOT NULL CHECK (color IN ('primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral')),
      enabled          INTEGER NOT NULL DEFAULT 1,
      system_prompt    TEXT NOT NULL DEFAULT '',
      planning_prompt  TEXT NOT NULL DEFAULT '',
      skills_prompt    TEXT NOT NULL DEFAULT '',
      summary_prompt   TEXT NOT NULL DEFAULT '',
      report_prompt    TEXT NOT NULL DEFAULT '',
      available_set_json TEXT NOT NULL DEFAULT '[]',
      available_set_touched INTEGER NOT NULL DEFAULT 0,
      tool_needs_approval_overrides_json TEXT NOT NULL DEFAULT '{}',
      available_mcp_servers_json TEXT NOT NULL DEFAULT 'null',
      tool_loop_max_iterations INTEGER NOT NULL DEFAULT 40,
      todo_max_retries INTEGER NOT NULL DEFAULT 3,
      allow_as_sub_agent INTEGER NOT NULL DEFAULT 1,
      allow_sub_agents INTEGER NOT NULL DEFAULT 1,
      sub_agent_ids_json TEXT NOT NULL DEFAULT 'null',
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      PRIMARY KEY (agent_id, user_id)
    );`;
}
function agentConfigurationsTableDdl(tableName = "agent_configurations") {
  return `CREATE TABLE ${tableName} (
      agent_id         TEXT NOT NULL,
      user_id          TEXT NOT NULL,
      name             TEXT NOT NULL,
      description      TEXT NOT NULL DEFAULT '',
      model            TEXT NOT NULL DEFAULT '',
      provider         TEXT NOT NULL CHECK (provider IN ${AGENT_PROVIDER_CHECK}),
      color            TEXT NOT NULL CHECK (color IN ('primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral')),
      enabled          INTEGER NOT NULL DEFAULT 1,
      system_prompt    TEXT NOT NULL DEFAULT '',
      skills_prompt    TEXT NOT NULL DEFAULT '',
      available_set_json TEXT NOT NULL DEFAULT '[]',
      available_set_touched INTEGER NOT NULL DEFAULT 0,
      tool_needs_approval_overrides_json TEXT NOT NULL DEFAULT '{}',
      available_mcp_servers_json TEXT NOT NULL DEFAULT 'null',
      tool_loop_max_iterations INTEGER NOT NULL DEFAULT 40,
      todo_max_retries INTEGER NOT NULL DEFAULT 3,
      allow_as_sub_agent INTEGER NOT NULL DEFAULT 1,
      allow_sub_agents INTEGER NOT NULL DEFAULT 1,
      sub_agent_ids_json TEXT NOT NULL DEFAULT 'null',
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      PRIMARY KEY (agent_id, user_id)
    );`;
}
function migrateAgentSummaryPromptColumn(db) {
  const table = "agent_configurations";
  if (!tableHasColumn(db, table, "analysis_prompt")) {
    if (!tableHasColumn(db, table, "summary_prompt")) {
      db.exec(
        `ALTER TABLE ${table} ADD COLUMN summary_prompt TEXT NOT NULL DEFAULT '';`
      );
    }
    return;
  }
  const legacy = "agent_configurations_legacy";
  const hasSummary = tableHasColumn(db, table, "summary_prompt");
  const summaryExpr = hasSummary ? `COALESCE(NULLIF(TRIM(summary_prompt), ''), NULLIF(TRIM(analysis_prompt), ''), '')` : `COALESCE(NULLIF(TRIM(analysis_prompt), ''), '')`;
  const pick = (column, fallback) => tableHasColumn(db, table, column) ? column : fallback;
  db.exec(`
    BEGIN;
    ALTER TABLE ${table} RENAME TO ${legacy};
    ${legacyAgentConfigurationsTableDdl(table)}
    INSERT INTO ${table} (
      agent_id,
      user_id,
      name,
      description,
      model,
      provider,
      color,
      enabled,
      system_prompt,
      planning_prompt,
      skills_prompt,
      summary_prompt,
      report_prompt,
      available_set_json,
      available_set_touched,
      tool_needs_approval_overrides_json,
      available_mcp_servers_json,
      tool_loop_max_iterations,
      created_at,
      updated_at
    )
    SELECT
      agent_id,
      user_id,
      name,
      description,
      model,
      provider,
      color,
      enabled,
      system_prompt,
      planning_prompt,
      skills_prompt,
      ${summaryExpr},
      ${pick("report_prompt", "''")},
      ${pick("available_set_json", "'[]'")},
      COALESCE(${pick("available_set_touched", "0")}, 0),
      COALESCE(${pick("tool_needs_approval_overrides_json", "'{}'")}, '{}'),
      COALESCE(${pick("available_mcp_servers_json", "'null'")}, 'null'),
      COALESCE(${pick("tool_loop_max_iterations", "40")}, 40),
      created_at,
      updated_at
    FROM ${legacy};
    DROP TABLE ${legacy};
    CREATE INDEX IF NOT EXISTS idx_agent_configurations_user_id
      ON ${table} (user_id, updated_at);
    COMMIT;
  `);
}
function migrateTokenUsage(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS llm_token_usage (
      id                    TEXT PRIMARY KEY,
      user_id               TEXT NOT NULL DEFAULT 'default',
      recorded_at           TEXT NOT NULL,
      conversation_id       TEXT,
      agent_id              TEXT,
      assistant_message_id  TEXT,
      step_id               TEXT,
      source                TEXT NOT NULL,
      provider              TEXT,
      model                 TEXT,
      input_tokens          INTEGER NOT NULL DEFAULT 0,
      output_tokens         INTEGER NOT NULL DEFAULT 0,
      total_tokens          INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_llm_token_usage_recorded_at
      ON llm_token_usage (recorded_at);
    CREATE INDEX IF NOT EXISTS idx_llm_token_usage_user_recorded_at
      ON llm_token_usage (user_id, recorded_at);
  `);
}
function migrateConversationSandboxRuns(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_sandbox_runs (
      sandbox_root        TEXT    PRIMARY KEY,
      conversation_id     TEXT    NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      results_file_url    TEXT    NOT NULL DEFAULT '',
      output_results_dir  TEXT    NOT NULL DEFAULT '',
      created_at          TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conversation_sandbox_runs_conversation_id
      ON conversation_sandbox_runs (conversation_id);
  `);
}
function virtualTableExists(db, name) {
  return db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(name) != null;
}
function migrateToolResultsAndFts(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_results (
      id              TEXT    PRIMARY KEY,
      conversation_id TEXT    NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      agent_id        TEXT    NOT NULL DEFAULT '',
      step_id         TEXT    NOT NULL DEFAULT '',
      tool_name       TEXT    NOT NULL,
      input_summary   TEXT    NOT NULL DEFAULT '',
      output_text     TEXT    NOT NULL DEFAULT '',
      output_summary  TEXT    NOT NULL DEFAULT '',
      output_chars    INTEGER NOT NULL DEFAULT 0,
      is_error        INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tool_results_conversation_id
      ON tool_results (conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tool_results_tool_name
      ON tool_results (conversation_id, tool_name, created_at);
  `);
  const messagesFtsNew = !virtualTableExists(db, "messages_fts");
  if (messagesFtsNew) {
    db.exec(`
      CREATE VIRTUAL TABLE messages_fts USING fts5(
        content,
        content='messages',
        content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 1'
      );
    `);
    db.exec(`INSERT INTO messages_fts(messages_fts) VALUES('rebuild');`);
  }
  db.exec(`
    DROP TRIGGER IF EXISTS messages_fts_ai;
    DROP TRIGGER IF EXISTS messages_fts_ad;
    DROP TRIGGER IF EXISTS messages_fts_au;

    CREATE TRIGGER messages_fts_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
    END;

    CREATE TRIGGER messages_fts_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content)
        VALUES ('delete', old.rowid, old.content);
    END;

    CREATE TRIGGER messages_fts_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content)
        VALUES ('delete', old.rowid, old.content);
      INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
    END;
  `);
  if (!virtualTableExists(db, "tool_results_fts")) {
    db.exec(`
      CREATE VIRTUAL TABLE tool_results_fts USING fts5(
        tool_name,
        input_summary,
        output_text,
        content='tool_results',
        content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 1'
      );
    `);
    db.exec(`INSERT INTO tool_results_fts(tool_results_fts) VALUES('rebuild');`);
  }
  db.exec(`
    DROP TRIGGER IF EXISTS tool_results_fts_ai;
    DROP TRIGGER IF EXISTS tool_results_fts_ad;
    DROP TRIGGER IF EXISTS tool_results_fts_au;

    CREATE TRIGGER tool_results_fts_ai AFTER INSERT ON tool_results BEGIN
      INSERT INTO tool_results_fts(rowid, tool_name, input_summary, output_text)
        VALUES (new.rowid, new.tool_name, new.input_summary, new.output_text);
    END;

    CREATE TRIGGER tool_results_fts_ad AFTER DELETE ON tool_results BEGIN
      INSERT INTO tool_results_fts(tool_results_fts, rowid, tool_name, input_summary, output_text)
        VALUES ('delete', old.rowid, old.tool_name, old.input_summary, old.output_text);
    END;

    CREATE TRIGGER tool_results_fts_au AFTER UPDATE ON tool_results BEGIN
      INSERT INTO tool_results_fts(tool_results_fts, rowid, tool_name, input_summary, output_text)
        VALUES ('delete', old.rowid, old.tool_name, old.input_summary, old.output_text);
      INSERT INTO tool_results_fts(rowid, tool_name, input_summary, output_text)
        VALUES (new.rowid, new.tool_name, new.input_summary, new.output_text);
    END;
  `);
}
function migrateThreadTags(db) {
  if (!tableHasColumn(db, "messages", "thread_tag")) {
    db.exec(`ALTER TABLE messages ADD COLUMN thread_tag TEXT NOT NULL DEFAULT 'general';`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_thread_tag
               ON messages (conversation_id, thread_tag, created_at);`);
  }
  if (!tableHasColumn(db, "tool_results", "thread_tag")) {
    db.exec(`ALTER TABLE tool_results ADD COLUMN thread_tag TEXT NOT NULL DEFAULT 'general';`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tool_results_thread_tag
               ON tool_results (conversation_id, thread_tag, created_at);`);
  }
}
function migrateSchedulersSchema(db) {
  const schedulersTable = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'schedulers'"
  ).get();
  const tableSql = schedulersTable?.sql ?? "";
  const needsActionTypeConstraintUpgrade = tableSql.includes("action_type IN ('send-channel-message')") && !tableSql.includes("run-agent");
  if (needsActionTypeConstraintUpgrade) {
    db.exec(`
      BEGIN;
      ALTER TABLE schedulers RENAME TO schedulers_legacy;
      CREATE TABLE schedulers (
        id               TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL,
        name             TEXT NOT NULL,
        enabled          INTEGER NOT NULL DEFAULT 1,
        schedule_type    TEXT NOT NULL CHECK (schedule_type IN ('interval', 'cron')),
        interval_ms      INTEGER,
        cron_expression  TEXT,
        timezone         TEXT,
        action_type      TEXT NOT NULL CHECK (action_type IN ('send-channel-message', 'run-agent')),
        channel_id       TEXT NOT NULL DEFAULT '',
        target           TEXT NOT NULL DEFAULT '',
        message          TEXT NOT NULL DEFAULT '',
        agent_id         TEXT NOT NULL DEFAULT '',
        conversation_id  TEXT NOT NULL DEFAULT '',
        prompt           TEXT NOT NULL DEFAULT '',
        last_run_at      TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
      INSERT INTO schedulers (
        id,
        user_id,
        name,
        enabled,
        schedule_type,
        interval_ms,
        cron_expression,
        timezone,
        action_type,
        channel_id,
        target,
        message,
        last_run_at,
        created_at,
        updated_at
      )
      SELECT
        id,
        user_id,
        name,
        enabled,
        schedule_type,
        interval_ms,
        cron_expression,
        timezone,
        action_type,
        channel_id,
        target,
        message,
        last_run_at,
        created_at,
        updated_at
      FROM schedulers_legacy;
      DROP TABLE schedulers_legacy;
      CREATE INDEX IF NOT EXISTS idx_schedulers_user_id
        ON schedulers (user_id, updated_at);
      COMMIT;
    `);
  }
  if (!tableHasColumn(db, "schedulers", "agent_id")) {
    db.exec(`ALTER TABLE schedulers ADD COLUMN agent_id TEXT NOT NULL DEFAULT '';`);
  }
  if (!tableHasColumn(db, "schedulers", "conversation_id")) {
    db.exec(
      `ALTER TABLE schedulers ADD COLUMN conversation_id TEXT NOT NULL DEFAULT '';`
    );
  }
  if (!tableHasColumn(db, "schedulers", "prompt")) {
    db.exec(`ALTER TABLE schedulers ADD COLUMN prompt TEXT NOT NULL DEFAULT '';`);
  }
}
function migrateConversationSettings(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_settings (
      conversation_id  TEXT PRIMARY KEY
        REFERENCES conversations(id) ON DELETE CASCADE,
      workspace_path   TEXT,
      updated_at       TEXT NOT NULL
    );
  `);
  if (!tableHasColumn(db, "conversation_settings", "session_approved_tools_json")) {
    db.exec(
      `ALTER TABLE conversation_settings ADD COLUMN session_approved_tools_json TEXT;`
    );
  }
  if (!tableHasColumn(db, "conversation_settings", "coding_mode_json")) {
    db.exec(
      `ALTER TABLE conversation_settings ADD COLUMN coding_mode_json TEXT NOT NULL DEFAULT '"normal"';`
    );
  }
}
function migrateConversationPlanModeState(db) {
  if (!tableHasColumn(db, "conversation_settings", "plan_mode_json")) {
    db.exec(
      `ALTER TABLE conversation_settings ADD COLUMN plan_mode_json TEXT NOT NULL DEFAULT '{"planMode":false,"planSlug":null,"pendingPlanActivation":false,"pendingPlanExecution":false}';`
    );
  }
}
function migrateCodingModePlanToExplore(db) {
  if (!tableHasColumn(db, "conversation_settings", "coding_mode_json")) return;
  db.prepare(
    `UPDATE conversation_settings SET coding_mode_json = ? WHERE coding_mode_json = ?`
  ).run(JSON.stringify("explore"), JSON.stringify("plan"));
}
function migrateEnableSubAgentDelegationDefault(db) {
  if (!tableHasColumn(db, "agent_configurations", "allow_sub_agents")) return;
  db.prepare(
    `UPDATE agent_configurations SET allow_sub_agents = 1 WHERE allow_sub_agents = 0`
  ).run();
}
function migrateEnableAllowAsSubAgentDefault(db) {
  if (!tableHasColumn(db, "agent_configurations", "allow_as_sub_agent")) return;
  db.prepare(
    `UPDATE agent_configurations SET allow_as_sub_agent = 1 WHERE allow_as_sub_agent = 0`
  ).run();
}
function migrateParentMessageId(db) {
  if (!tableHasColumn(db, "messages", "parent_message_id")) {
    db.exec(`ALTER TABLE messages ADD COLUMN parent_message_id TEXT;`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_parent_message_id
               ON messages (parent_message_id);`);
  }
}
function migrateWorkflowsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT NOT NULL,
      name                TEXT NOT NULL,
      description         TEXT NOT NULL DEFAULT '',
      status              TEXT NOT NULL CHECK (status IN ('draft', 'confirmed', 'testing', 'deployed')),
      current_version_id  TEXT,
      created_at          TEXT NOT NULL,
      updated_at          TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workflows_user_id
      ON workflows (user_id, updated_at);

    CREATE TABLE IF NOT EXISTS workflow_versions (
      id                      TEXT PRIMARY KEY,
      workflow_id             TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      version_number          INTEGER NOT NULL,
      definition_json         TEXT NOT NULL,
      mermaid                 TEXT NOT NULL DEFAULT '',
      summary_markdown        TEXT NOT NULL DEFAULT '',
      compiler_metadata_json  TEXT NOT NULL DEFAULT '{}',
      created_at              TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow_id
      ON workflow_versions (workflow_id, version_number DESC);

    CREATE TABLE IF NOT EXISTS workflow_deployments (
      id           TEXT PRIMARY KEY,
      workflow_id  TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      version_id   TEXT NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
      user_id      TEXT NOT NULL,
      target       TEXT NOT NULL CHECK (target IN ('local', 'agent-server')),
      enabled      INTEGER NOT NULL DEFAULT 1,
      config_json  TEXT NOT NULL DEFAULT '{}',
      last_run_at  TEXT,
      last_error   TEXT,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_deployments_workflow_id
      ON workflow_deployments (workflow_id, updated_at);

    CREATE TABLE IF NOT EXISTS workflow_triggers (
      id            TEXT PRIMARY KEY,
      workflow_id   TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      deployment_id TEXT,
      trigger_type  TEXT NOT NULL,
      config_json   TEXT NOT NULL DEFAULT '{}',
      enabled       INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_triggers_workflow_id
      ON workflow_triggers (workflow_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_triggers_type
      ON workflow_triggers (trigger_type, enabled);
  `);
}
function migrateSchedulersRunWorkflow(db) {
  if (!tableHasColumn(db, "schedulers", "workflow_id")) {
    db.exec(`ALTER TABLE schedulers ADD COLUMN workflow_id TEXT NOT NULL DEFAULT '';`);
  }
  const schedulersTable = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'schedulers'"
  ).get();
  const tableSql = schedulersTable?.sql ?? "";
  if (tableSql.includes("'run-agent'") && !tableSql.includes("run-workflow")) {
    db.exec(`
      BEGIN;
      ALTER TABLE schedulers RENAME TO schedulers_legacy;
      CREATE TABLE schedulers (
        id               TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL,
        name             TEXT NOT NULL,
        enabled          INTEGER NOT NULL DEFAULT 1,
        schedule_type    TEXT NOT NULL CHECK (schedule_type IN ('interval', 'cron')),
        interval_ms      INTEGER,
        cron_expression  TEXT,
        timezone         TEXT,
        action_type      TEXT NOT NULL CHECK (action_type IN ('send-channel-message', 'run-agent', 'run-workflow')),
        channel_id       TEXT NOT NULL DEFAULT '',
        target           TEXT NOT NULL DEFAULT '',
        message          TEXT NOT NULL DEFAULT '',
        agent_id         TEXT NOT NULL DEFAULT '',
        conversation_id  TEXT NOT NULL DEFAULT '',
        prompt           TEXT NOT NULL DEFAULT '',
        workflow_id      TEXT NOT NULL DEFAULT '',
        last_run_at      TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
      INSERT INTO schedulers (
        id, user_id, name, enabled, schedule_type, interval_ms, cron_expression,
        timezone, action_type, channel_id, target, message, agent_id,
        conversation_id, prompt, workflow_id, last_run_at, created_at, updated_at
      )
      SELECT
        id, user_id, name, enabled, schedule_type, interval_ms, cron_expression,
        timezone, action_type, channel_id, target, message, agent_id,
        conversation_id, prompt, '', last_run_at, created_at, updated_at
      FROM schedulers_legacy;
      DROP TABLE schedulers_legacy;
      CREATE INDEX IF NOT EXISTS idx_schedulers_user_id
        ON schedulers (user_id, updated_at);
      COMMIT;
    `);
  }
}
function migrateDropLegacyAgentPromptColumns(db) {
  const table = "agent_configurations";
  if (!tableHasColumn(db, table, "planning_prompt")) return;
  const legacy = "agent_configurations_react_legacy";
  const pick = (column, fallback) => tableHasColumn(db, table, column) ? column : fallback;
  db.exec(`
    BEGIN;
    ALTER TABLE ${table} RENAME TO ${legacy};
    ${agentConfigurationsTableDdl(table)}
    INSERT INTO ${table} (
      agent_id,
      user_id,
      name,
      description,
      model,
      provider,
      color,
      enabled,
      system_prompt,
      skills_prompt,
      available_set_json,
      available_set_touched,
      tool_needs_approval_overrides_json,
      available_mcp_servers_json,
      tool_loop_max_iterations,
      todo_max_retries,
      allow_as_sub_agent,
      allow_sub_agents,
      sub_agent_ids_json,
      created_at,
      updated_at
    )
    SELECT
      agent_id,
      user_id,
      name,
      description,
      model,
      provider,
      color,
      enabled,
      system_prompt,
      COALESCE(
        NULLIF(TRIM(${pick("skills_prompt", "''")}), ''),
        NULLIF(TRIM(${pick("planning_prompt", "''")}), ''),
        NULLIF(TRIM(${pick("summary_prompt", "''")}), ''),
        ''
      ),
      ${pick("available_set_json", "'[]'")},
      COALESCE(${pick("available_set_touched", "0")}, 0),
      COALESCE(${pick("tool_needs_approval_overrides_json", "'{}'")}, '{}'),
      COALESCE(${pick("available_mcp_servers_json", "'null'")}, 'null'),
      COALESCE(${pick("tool_loop_max_iterations", "40")}, 40),
      COALESCE(${pick("todo_max_retries", "3")}, 3),
      COALESCE(${pick("allow_as_sub_agent", "1")}, 1),
      COALESCE(${pick("allow_sub_agents", "1")}, 1),
      COALESCE(${pick("sub_agent_ids_json", "'null'")}, 'null'),
      created_at,
      updated_at
    FROM ${legacy};
    DROP TABLE ${legacy};
    CREATE INDEX IF NOT EXISTS idx_agent_configurations_user_id
      ON ${table} (user_id, updated_at);
    COMMIT;
  `);
}
var AGENT_PROVIDER_CHECK;
var init_migrations = __esm({
  "src/main/services/conversation-store/migrations.ts"() {
    init_llm_provider_registry();
    AGENT_PROVIDER_CHECK = AGENT_PROVIDER_SQL_CHECK;
  }
});

// src/main/services/conversation-store/sandbox-runs-repository.ts
var SandboxRunsRepository;
var init_sandbox_runs_repository = __esm({
  "src/main/services/conversation-store/sandbox-runs-repository.ts"() {
    SandboxRunsRepository = class {
      constructor(db) {
        this.db = db;
      }
      /** Insert or update a sandbox run (same `sandbox_root` = same run, URL updates). */
      upsert(payload) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        this.db.prepare(
          `INSERT INTO conversation_sandbox_runs (
          sandbox_root, conversation_id, results_file_url, output_results_dir, created_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(sandbox_root) DO UPDATE SET
          results_file_url = excluded.results_file_url,
          output_results_dir = excluded.output_results_dir`
        ).run(
          payload.sandboxRoot,
          payload.conversationId,
          payload.resultsFileUrl,
          payload.outputResultsDir,
          now
        );
      }
      listRootsForConversation(conversationId) {
        const rows = this.db.prepare(
          "SELECT sandbox_root FROM conversation_sandbox_runs WHERE conversation_id = ?"
        ).all(conversationId);
        return rows.map((r) => r.sandbox_root);
      }
      listForConversation(conversationId) {
        const rows = this.db.prepare(
          `SELECT sandbox_root, conversation_id, results_file_url, output_results_dir, created_at
         FROM conversation_sandbox_runs
         WHERE conversation_id = ?
         ORDER BY created_at ASC`
        ).all(conversationId);
        return rows.map((r) => ({
          sandboxRoot: r.sandbox_root,
          conversationId: r.conversation_id,
          resultsFileUrl: r.results_file_url,
          outputResultsDir: r.output_results_dir,
          createdAt: r.created_at
        }));
      }
    };
  }
});

// src/main/services/conversation-store/schedulers-repository.ts
function mapRow3(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    enabled: row.enabled !== 0,
    scheduleType: row.schedule_type,
    intervalMs: row.interval_ms,
    cronExpression: row.cron_expression,
    timezone: row.timezone,
    actionType: row.action_type,
    channelId: row.channel_id,
    target: row.target,
    message: row.message,
    agentId: row.agent_id,
    conversationId: row.conversation_id,
    prompt: row.prompt,
    workflowId: row.workflow_id ?? "",
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
var SchedulersRepository;
var init_schedulers_repository = __esm({
  "src/main/services/conversation-store/schedulers-repository.ts"() {
    SchedulersRepository = class {
      constructor(db) {
        this.db = db;
      }
      list(userId) {
        const rows = this.db.prepare(
          `SELECT
          id,
          user_id,
          name,
          enabled,
          schedule_type,
          interval_ms,
          cron_expression,
          timezone,
          action_type,
          channel_id,
          target,
          message,
          agent_id,
          conversation_id,
          prompt,
          workflow_id,
          last_run_at,
          created_at,
          updated_at
         FROM schedulers
         WHERE user_id = ?
         ORDER BY updated_at DESC`
        ).all(userId);
        return rows.map(mapRow3);
      }
      upsert(scheduler) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        this.db.prepare(
          `INSERT INTO schedulers (
          id,
          user_id,
          name,
          enabled,
          schedule_type,
          interval_ms,
          cron_expression,
          timezone,
          action_type,
          channel_id,
          target,
          message,
          agent_id,
          conversation_id,
          prompt,
          workflow_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id)
        DO UPDATE SET
          user_id = excluded.user_id,
          name = excluded.name,
          enabled = excluded.enabled,
          schedule_type = excluded.schedule_type,
          interval_ms = excluded.interval_ms,
          cron_expression = excluded.cron_expression,
          timezone = excluded.timezone,
          action_type = excluded.action_type,
          channel_id = excluded.channel_id,
          target = excluded.target,
          message = excluded.message,
            agent_id = excluded.agent_id,
            conversation_id = excluded.conversation_id,
            prompt = excluded.prompt,
            workflow_id = excluded.workflow_id,
          updated_at = excluded.updated_at`
        ).run(
          scheduler.id,
          scheduler.userId,
          scheduler.name,
          scheduler.enabled ? 1 : 0,
          scheduler.scheduleType,
          scheduler.intervalMs,
          scheduler.cronExpression,
          scheduler.timezone,
          scheduler.actionType,
          scheduler.channelId,
          scheduler.target,
          scheduler.message,
          scheduler.agentId,
          scheduler.conversationId,
          scheduler.prompt,
          scheduler.workflowId ?? "",
          now,
          now
        );
      }
      delete(userId, schedulerId) {
        this.db.prepare("DELETE FROM schedulers WHERE user_id = ? AND id = ?").run(userId, schedulerId);
      }
      setLastRunAt(schedulerId, ranAtIso) {
        this.db.prepare(
          "UPDATE schedulers SET last_run_at = ?, updated_at = ? WHERE id = ?"
        ).run(ranAtIso, ranAtIso, schedulerId);
      }
      setConversationId(schedulerId, conversationId) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        this.db.prepare(
          "UPDATE schedulers SET conversation_id = ?, updated_at = ? WHERE id = ?"
        ).run(conversationId, now, schedulerId);
      }
    };
  }
});

// src/main/services/conversation-store/token-usage-helpers.ts
function tokenUsageSeriesKey(provider, model) {
  const p = (provider ?? "").trim() || "unknown";
  const m = (model ?? "").trim() || "unknown";
  return `${p}::${m}`;
}
function tokenUsageSeriesLabel(provider, model) {
  const p = (provider ?? "").trim();
  const m = (model ?? "").trim();
  if (p && m) return `${p} / ${m}`;
  if (m) return m;
  if (p) return p;
  return "Unknown model";
}
function buildTokenUsageChartPoints(rawRows, bucketMinutes) {
  if (rawRows.length === 0) return [];
  const bucketSeconds = Math.max(1, bucketMinutes) * 60;
  if (rawRows.length <= 120) {
    return rawRows.map((row) => ({
      recordedAt: row.recorded_at,
      inputTokens: Number(row.input_tokens) || 0,
      outputTokens: Number(row.output_tokens) || 0,
      totalTokens: Number(row.total_tokens) || (Number(row.input_tokens) || 0) + (Number(row.output_tokens) || 0)
    }));
  }
  const buckets = /* @__PURE__ */ new Map();
  for (const row of rawRows) {
    const epoch = Math.floor(new Date(row.recorded_at).getTime() / 1e3);
    if (!Number.isFinite(epoch)) continue;
    const bucketEpoch = Math.floor(epoch / bucketSeconds) * bucketSeconds;
    const recordedAt = new Date(bucketEpoch * 1e3).toISOString();
    const inputTokens = Number(row.input_tokens) || 0;
    const outputTokens = Number(row.output_tokens) || 0;
    const totalTokens = Number(row.total_tokens) || inputTokens + outputTokens;
    const existing = buckets.get(recordedAt);
    if (existing) {
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.totalTokens += totalTokens;
    } else {
      buckets.set(recordedAt, { inputTokens, outputTokens, totalTokens });
    }
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([recordedAt, counts]) => ({
    recordedAt,
    ...counts
  }));
}
var init_token_usage_helpers = __esm({
  "src/main/services/conversation-store/token-usage-helpers.ts"() {
  }
});

// src/main/services/conversation-store/token-usage-repository.ts
var TokenUsageRepository;
var init_token_usage_repository = __esm({
  "src/main/services/conversation-store/token-usage-repository.ts"() {
    init_token_usage_helpers();
    TokenUsageRepository = class {
      constructor(db) {
        this.db = db;
      }
      insert(record) {
        this.db.prepare(
          `INSERT INTO llm_token_usage (
          id, user_id, recorded_at, conversation_id, agent_id,
          assistant_message_id, step_id, source, provider, model,
          input_tokens, output_tokens, total_tokens
        ) VALUES (
          @id, @userId, @recordedAt, @conversationId, @agentId,
          @assistantMessageId, @stepId, @source, @provider, @model,
          @inputTokens, @outputTokens, @totalTokens
        )`
        ).run(record);
      }
      listChartSeries(args) {
        const until = args.until ?? (/* @__PURE__ */ new Date()).toISOString();
        const since = args.since ?? new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString();
        const bucketMinutes = Math.max(1, Math.floor(args.bucketMinutes ?? 15));
        const rawRows = this.db.prepare(
          `SELECT
          recorded_at,
          provider,
          model,
          input_tokens,
          output_tokens,
          total_tokens
        FROM llm_token_usage
        WHERE user_id = @userId
          AND recorded_at >= @since
          AND recorded_at <= @until
        ORDER BY recorded_at ASC
        LIMIT 5000`
        ).all({
          userId: args.userId,
          since,
          until
        });
        if (rawRows.length === 0) return [];
        const rowsBySeries = /* @__PURE__ */ new Map();
        for (const row of rawRows) {
          const seriesKey = tokenUsageSeriesKey(row.provider, row.model);
          const bucket = rowsBySeries.get(seriesKey);
          if (bucket) {
            bucket.rows.push(row);
          } else {
            rowsBySeries.set(seriesKey, {
              provider: row.provider,
              model: row.model,
              rows: [row]
            });
          }
        }
        return [...rowsBySeries.entries()].map(([seriesKey, group]) => ({
          seriesKey,
          provider: group.provider,
          model: group.model,
          label: tokenUsageSeriesLabel(group.provider, group.model),
          points: buildTokenUsageChartPoints(group.rows, bucketMinutes)
        })).filter((series) => series.points.length > 0).sort((a, b) => a.label.localeCompare(b.label));
      }
    };
  }
});

// src/main/services/conversation-store/user-properties-repository.ts
var UserPropertiesRepository;
var init_user_properties_repository = __esm({
  "src/main/services/conversation-store/user-properties-repository.ts"() {
    UserPropertiesRepository = class {
      constructor(db, defaultWorkspacePath) {
        this.db = db;
        this.defaultWorkspacePath = defaultWorkspacePath;
      }
      ensureDefaults(userId) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        this.db.prepare(
          `INSERT OR IGNORE INTO user_properties (user_id, property_key, property_value, updated_at)
         VALUES (?, ?, ?, ?)`
        ).run(userId, "user.workspace", this.defaultWorkspacePath, now);
      }
      getWorkspacePath(userId) {
        const workspaceProp = this.get(userId, "user.workspace");
        const workspacePath = workspaceProp?.propertyValue?.trim();
        return workspacePath || this.defaultWorkspacePath;
      }
      list(userId) {
        this.ensureDefaults(userId);
        const rows = this.db.prepare(
          "SELECT user_id, property_key, property_value, updated_at FROM user_properties WHERE user_id = ? ORDER BY property_key ASC"
        ).all(userId);
        return rows.map((r) => ({
          userId: r.user_id,
          propertyKey: r.property_key,
          propertyValue: r.property_value,
          updatedAt: r.updated_at
        }));
      }
      getAllAsMap(userId) {
        this.ensureDefaults(userId);
        const rows = this.db.prepare(
          "SELECT property_key, property_value FROM user_properties WHERE user_id = ? ORDER BY property_key ASC"
        ).all(userId);
        const mapping = {};
        for (const row of rows) {
          mapping[row.property_key] = row.property_value;
        }
        return mapping;
      }
      get(userId, propertyKey) {
        this.ensureDefaults(userId);
        const row = this.db.prepare(
          "SELECT user_id, property_key, property_value, updated_at FROM user_properties WHERE user_id = ? AND property_key = ?"
        ).get(userId, propertyKey);
        if (!row) return null;
        return {
          userId: row.user_id,
          propertyKey: row.property_key,
          propertyValue: row.property_value,
          updatedAt: row.updated_at
        };
      }
      set(userId, propertyKey, propertyValue) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        this.db.prepare(
          `INSERT INTO user_properties (user_id, property_key, property_value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, property_key)
         DO UPDATE SET property_value = excluded.property_value, updated_at = excluded.updated_at`
        ).run(userId, propertyKey, propertyValue, now);
      }
      delete(userId, propertyKey) {
        this.db.prepare(
          "DELETE FROM user_properties WHERE user_id = ? AND property_key = ?"
        ).run(userId, propertyKey);
      }
      clear(userId) {
        this.db.prepare("DELETE FROM user_properties WHERE user_id = ?").run(userId);
      }
    };
  }
});

// src/main/services/conversation-store/skill-compilations-repository.ts
function mapRow4(row) {
  let compiled = null;
  if (row.compiled_json.trim()) {
    try {
      compiled = JSON.parse(row.compiled_json);
    } catch {
      compiled = null;
    }
  }
  return {
    skillId: row.skill_id,
    source: row.source,
    sourceFingerprint: row.source_fingerprint,
    status: row.status,
    compiled,
    errorMessage: row.error_message,
    compiledAt: row.compiled_at,
    updatedAt: row.updated_at
  };
}
var SkillCompilationsRepository;
var init_skill_compilations_repository = __esm({
  "src/main/services/conversation-store/skill-compilations-repository.ts"() {
    SkillCompilationsRepository = class {
      constructor(db) {
        this.db = db;
      }
      get(skillId, source) {
        const row = this.db.prepare(
          `SELECT skill_id, source, source_fingerprint, status, compiled_json,
                error_message, compiled_at, updated_at
         FROM skill_compilations
         WHERE skill_id = ? AND source = ?`
        ).get(skillId, source);
        return row ? mapRow4(row) : null;
      }
      /** Prefer user compilation, then bundled. */
      getEffective(skillId) {
        return this.get(skillId, "user") ?? this.get(skillId, "bundled");
      }
      upsert(args) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const compiledJson = args.compiled ? JSON.stringify(args.compiled) : "";
        this.db.prepare(
          `INSERT INTO skill_compilations (
          skill_id, source, source_fingerprint, status, compiled_json,
          error_message, compiled_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(skill_id, source) DO UPDATE SET
          source_fingerprint = excluded.source_fingerprint,
          status = excluded.status,
          compiled_json = excluded.compiled_json,
          error_message = excluded.error_message,
          compiled_at = excluded.compiled_at,
          updated_at = excluded.updated_at`
        ).run(
          args.skillId,
          args.source,
          args.sourceFingerprint,
          args.status,
          compiledJson,
          args.errorMessage,
          args.compiledAt,
          now
        );
        return this.get(args.skillId, args.source);
      }
      delete(skillId, source) {
        this.db.prepare(
          `DELETE FROM skill_compilations WHERE skill_id = ? AND source = ?`
        ).run(skillId, source);
      }
      deleteAllForSkill(skillId) {
        this.delete(skillId, "user");
        this.delete(skillId, "bundled");
      }
    };
  }
});

// src/main/services/conversation-store/tool-results-repository.ts
function rowToRecord(r) {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    agentId: r.agent_id,
    stepId: r.step_id,
    toolName: r.tool_name,
    inputSummary: r.input_summary,
    outputText: r.output_text,
    outputSummary: r.output_summary,
    outputChars: r.output_chars,
    isError: r.is_error !== 0,
    createdAt: r.created_at,
    threadTag: r.thread_tag || "general"
  };
}
var ToolResultsRepository;
var init_tool_results_repository = __esm({
  "src/main/services/conversation-store/tool-results-repository.ts"() {
    ToolResultsRepository = class {
      constructor(db) {
        this.db = db;
      }
      save(result) {
        this.db.prepare(
          `INSERT INTO tool_results
           (id, conversation_id, agent_id, step_id, tool_name,
            input_summary, output_text, output_summary, output_chars,
            is_error, created_at, thread_tag)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`
        ).run(
          result.id,
          result.conversationId,
          result.agentId,
          result.stepId,
          result.toolName,
          result.inputSummary,
          result.outputText,
          result.outputSummary,
          result.outputChars,
          result.isError ? 1 : 0,
          result.createdAt,
          result.threadTag ?? "general"
        );
      }
      list(conversationId, opts = {}) {
        const { limit = 200, toolName, threadTag } = opts;
        let sql = `SELECT id, conversation_id, agent_id, step_id, tool_name,
              input_summary, output_text, output_summary, output_chars, is_error, created_at, thread_tag
       FROM tool_results
       WHERE conversation_id = ?`;
        const params = [conversationId];
        if (toolName) {
          sql += " AND tool_name = ?";
          params.push(toolName);
        }
        if (threadTag) {
          sql += " AND thread_tag = ?";
          params.push(threadTag);
        }
        sql += " ORDER BY created_at ASC LIMIT ?";
        params.push(limit);
        return this.db.prepare(sql).all(...params).map(rowToRecord);
      }
      /**
       * Return all results older than the last `keepRecentN` for this conversation.
       * If `currentThreadTag` is supplied, results for other threads get an
       * additional offset so they are pruned earlier than same-thread results.
       */
      getOlderThan(conversationId, keepRecentN, opts = {}) {
        const { currentThreadTag, crossThreadKeepN } = opts;
        if (currentThreadTag && crossThreadKeepN !== void 0) {
          const sameThread = this.db.prepare(
            `SELECT id, conversation_id, agent_id, step_id, tool_name,
                  input_summary, output_text, output_summary, output_chars, is_error, created_at, thread_tag
           FROM tool_results
           WHERE conversation_id = ? AND thread_tag = ?
           ORDER BY created_at DESC
           LIMIT -1 OFFSET ?`
          ).all(conversationId, currentThreadTag, keepRecentN);
          const crossThread = this.db.prepare(
            `SELECT id, conversation_id, agent_id, step_id, tool_name,
                  input_summary, output_text, output_summary, output_chars, is_error, created_at, thread_tag
           FROM tool_results
           WHERE conversation_id = ? AND thread_tag != ?
           ORDER BY created_at DESC
           LIMIT -1 OFFSET ?`
          ).all(conversationId, currentThreadTag, crossThreadKeepN);
          return [...sameThread, ...crossThread].map(rowToRecord);
        }
        const rows = this.db.prepare(
          `SELECT id, conversation_id, agent_id, step_id, tool_name,
                input_summary, output_text, output_summary, output_chars, is_error, created_at, thread_tag
         FROM tool_results
         WHERE conversation_id = ?
         ORDER BY created_at DESC
         LIMIT -1 OFFSET ?`
        ).all(conversationId, keepRecentN);
        return rows.map(rowToRecord);
      }
      /**
       * Full-text search across tool_name, input_summary, and output_text.
       * Scoped to a single conversation when conversationId is supplied.
       */
      search(query, opts = {}) {
        const { conversationId, limit = 20 } = opts;
        const sql = conversationId ? `SELECT t.id, t.conversation_id, t.agent_id, t.step_id, t.tool_name,
                t.input_summary, t.output_text, t.output_summary, t.output_chars,
                t.is_error, t.created_at, t.thread_tag,
                f.rank
         FROM tool_results_fts f
         JOIN tool_results t ON t.rowid = f.rowid
         WHERE tool_results_fts MATCH ?
           AND t.conversation_id = ?
         ORDER BY f.rank
         LIMIT ?` : `SELECT t.id, t.conversation_id, t.agent_id, t.step_id, t.tool_name,
                t.input_summary, t.output_text, t.output_summary, t.output_chars,
                t.is_error, t.created_at, t.thread_tag,
                f.rank
         FROM tool_results_fts f
         JOIN tool_results t ON t.rowid = f.rowid
         WHERE tool_results_fts MATCH ?
         ORDER BY f.rank
         LIMIT ?`;
        const params = conversationId ? [query, conversationId, limit] : [query, limit];
        const rows = this.db.prepare(sql).all(...params);
        return rows.map((r) => ({ ...rowToRecord(r), rank: r.rank }));
      }
      deleteAllForConversation(conversationId) {
        this.db.prepare("DELETE FROM tool_results WHERE conversation_id = ?").run(conversationId);
      }
    };
  }
});

// src/shared/agent/coding-mode.ts
function parseCodingMode(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === LEGACY_CODING_MODE_PLAN) return "explore";
  if (CODING_MODES.includes(v)) return v;
  return DEFAULT_CODING_MODE;
}
var CODING_MODES, DEFAULT_CODING_MODE, LEGACY_CODING_MODE_PLAN;
var init_coding_mode = __esm({
  "src/shared/agent/coding-mode.ts"() {
    CODING_MODES = [
      "normal",
      "explore",
      "yolo",
      "auto"
    ];
    DEFAULT_CODING_MODE = "normal";
    LEGACY_CODING_MODE_PLAN = "plan";
  }
});

// src/main/services/conversation-store/conversation-settings-repository.ts
function parseSessionApprovedToolsJson(raw) {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((v) => String(v).trim()).filter(Boolean))];
  } catch {
    return [];
  }
}
function parseCodingModeJson(raw) {
  if (!raw?.trim()) return DEFAULT_CODING_MODE;
  try {
    const parsed = JSON.parse(raw);
    return parseCodingMode(
      typeof parsed === "string" ? parsed : String(parsed ?? "")
    );
  } catch {
    return parseCodingMode(raw);
  }
}
function parsePlanModeStateJson(raw) {
  if (!raw?.trim()) return { ...DEFAULT_AGENT_PLAN_MODE_STATE };
  try {
    return parseAgentPlanModeState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AGENT_PLAN_MODE_STATE };
  }
}
function rowToSettings(row) {
  return {
    conversationId: row.conversation_id,
    workspacePath: row.workspace_path,
    sessionApprovedTools: parseSessionApprovedToolsJson(
      row.session_approved_tools_json
    ),
    codingMode: parseCodingModeJson(row.coding_mode_json),
    planModeState: parsePlanModeStateJson(row.plan_mode_json),
    updatedAt: row.updated_at
  };
}
var SELECT_COLS, ConversationSettingsRepository;
var init_conversation_settings_repository = __esm({
  "src/main/services/conversation-store/conversation-settings-repository.ts"() {
    init_coding_mode();
    init_plan_mode();
    SELECT_COLS = `conversation_id, workspace_path, session_approved_tools_json, coding_mode_json, plan_mode_json, updated_at`;
    ConversationSettingsRepository = class {
      constructor(db) {
        this.db = db;
      }
      get(conversationId) {
        const row = this.db.prepare(
          `SELECT ${SELECT_COLS}
         FROM conversation_settings
         WHERE conversation_id = ?`
        ).get(conversationId);
        if (!row) return null;
        return rowToSettings(row);
      }
      upsertRow(args) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        this.db.prepare(
          `INSERT INTO conversation_settings (conversation_id, workspace_path, session_approved_tools_json, coding_mode_json, plan_mode_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(conversation_id) DO UPDATE SET
           workspace_path = excluded.workspace_path,
           session_approved_tools_json = excluded.session_approved_tools_json,
           coding_mode_json = excluded.coding_mode_json,
           plan_mode_json = excluded.plan_mode_json,
           updated_at = excluded.updated_at`
        ).run(
          args.conversationId,
          args.workspacePath,
          JSON.stringify(args.sessionApprovedTools),
          JSON.stringify(args.codingMode),
          serializeAgentPlanModeState(args.planModeState),
          now
        );
        return {
          conversationId: args.conversationId,
          workspacePath: args.workspacePath,
          sessionApprovedTools: args.sessionApprovedTools,
          codingMode: args.codingMode,
          planModeState: args.planModeState,
          updatedAt: now
        };
      }
      mergeExisting(conversationId) {
        const existing = this.get(conversationId);
        return {
          conversationId,
          workspacePath: existing?.workspacePath ?? null,
          sessionApprovedTools: existing?.sessionApprovedTools ?? [],
          codingMode: existing?.codingMode ?? DEFAULT_CODING_MODE,
          planModeState: existing?.planModeState ?? { ...DEFAULT_AGENT_PLAN_MODE_STATE }
        };
      }
      setWorkspacePath(conversationId, workspacePath) {
        const base = this.mergeExisting(conversationId);
        return this.upsertRow({ ...base, workspacePath });
      }
      setCodingMode(conversationId, codingMode) {
        const base = this.mergeExisting(conversationId);
        return this.upsertRow({
          ...base,
          codingMode: parseCodingMode(codingMode)
        });
      }
      getCodingMode(conversationId) {
        return this.get(conversationId)?.codingMode ?? DEFAULT_CODING_MODE;
      }
      getPlanModeState(conversationId) {
        return this.get(conversationId)?.planModeState ?? { ...DEFAULT_AGENT_PLAN_MODE_STATE };
      }
      setPlanModeState(conversationId, planModeState) {
        const base = this.mergeExisting(conversationId);
        return this.upsertRow({
          ...base,
          planModeState: parseAgentPlanModeState(planModeState)
        });
      }
      getSessionApprovedTools(conversationId) {
        return this.get(conversationId)?.sessionApprovedTools ?? [];
      }
      addSessionApprovedTool(conversationId, toolName) {
        const normalized = toolName.trim();
        if (!normalized) return this.getSessionApprovedTools(conversationId);
        const base = this.mergeExisting(conversationId);
        const merged = [.../* @__PURE__ */ new Set([...base.sessionApprovedTools, normalized])];
        this.upsertRow({ ...base, sessionApprovedTools: merged });
        return merged;
      }
      copySessionApprovedTools(sourceConversationId, targetConversationId) {
        const source = this.get(sourceConversationId);
        if (!source?.sessionApprovedTools.length) return;
        const target = this.get(targetConversationId);
        this.upsertRow({
          conversationId: targetConversationId,
          workspacePath: target?.workspacePath ?? source.workspacePath,
          sessionApprovedTools: source.sessionApprovedTools,
          codingMode: target?.codingMode ?? source.codingMode,
          planModeState: target?.planModeState ?? source.planModeState
        });
      }
      clear(conversationId) {
        this.setWorkspacePath(conversationId, null);
      }
    };
  }
});

// src/main/services/conversation-store/workflows-repository.ts
function mapWorkflow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    status: row.status,
    currentVersionId: row.current_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function mapVersion(row) {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    versionNumber: row.version_number,
    definitionJson: row.definition_json,
    mermaid: row.mermaid,
    summaryMarkdown: row.summary_markdown,
    compilerMetadataJson: row.compiler_metadata_json,
    createdAt: row.created_at
  };
}
function mapDeployment(row) {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    versionId: row.version_id,
    userId: row.user_id,
    target: row.target,
    enabled: row.enabled !== 0,
    configJson: row.config_json,
    lastRunAt: row.last_run_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function mapTrigger(row) {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    deploymentId: row.deployment_id,
    triggerType: row.trigger_type,
    configJson: row.config_json,
    enabled: row.enabled !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
var WorkflowsRepository;
var init_workflows_repository = __esm({
  "src/main/services/conversation-store/workflows-repository.ts"() {
    WorkflowsRepository = class {
      constructor(db) {
        this.db = db;
      }
      list(userId) {
        const rows = this.db.prepare(
          `SELECT id, user_id, name, description, status, current_version_id, created_at, updated_at
         FROM workflows WHERE user_id = ? ORDER BY updated_at DESC`
        ).all(userId);
        return rows.map(mapWorkflow);
      }
      get(workflowId) {
        const row = this.db.prepare(
          `SELECT id, user_id, name, description, status, current_version_id, created_at, updated_at
         FROM workflows WHERE id = ?`
        ).get(workflowId);
        return row ? mapWorkflow(row) : null;
      }
      upsert(workflow) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const createdAt = workflow.createdAt ?? now;
        this.db.prepare(
          `INSERT INTO workflows (
          id, user_id, name, description, status, current_version_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          user_id = excluded.user_id,
          name = excluded.name,
          description = excluded.description,
          status = excluded.status,
          current_version_id = excluded.current_version_id,
          updated_at = excluded.updated_at`
        ).run(
          workflow.id,
          workflow.userId,
          workflow.name,
          workflow.description,
          workflow.status,
          workflow.currentVersionId,
          createdAt,
          now
        );
        return { ...workflow, createdAt, updatedAt: now };
      }
      delete(userId, workflowId) {
        this.db.prepare("DELETE FROM workflows WHERE user_id = ? AND id = ?").run(userId, workflowId);
      }
      insertVersion(version) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        this.db.prepare(
          `INSERT INTO workflow_versions (
          id, workflow_id, version_number, definition_json, mermaid,
          summary_markdown, compiler_metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          version.id,
          version.workflowId,
          version.versionNumber,
          version.definitionJson,
          version.mermaid,
          version.summaryMarkdown,
          version.compilerMetadataJson,
          now
        );
        return { ...version, createdAt: now };
      }
      getVersion(versionId) {
        const row = this.db.prepare(
          `SELECT id, workflow_id, version_number, definition_json, mermaid,
                summary_markdown, compiler_metadata_json, created_at
         FROM workflow_versions WHERE id = ?`
        ).get(versionId);
        return row ? mapVersion(row) : null;
      }
      listVersions(workflowId) {
        const rows = this.db.prepare(
          `SELECT id, workflow_id, version_number, definition_json, mermaid,
                summary_markdown, compiler_metadata_json, created_at
         FROM workflow_versions WHERE workflow_id = ? ORDER BY version_number DESC`
        ).all(workflowId);
        return rows.map(mapVersion);
      }
      nextVersionNumber(workflowId) {
        const row = this.db.prepare(
          "SELECT COALESCE(MAX(version_number), 0) AS max_version FROM workflow_versions WHERE workflow_id = ?"
        ).get(workflowId);
        return (row?.max_version ?? 0) + 1;
      }
      upsertDeployment(deployment) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        this.db.prepare(
          `INSERT INTO workflow_deployments (
          id, workflow_id, version_id, user_id, target, enabled, config_json,
          last_run_at, last_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          workflow_id = excluded.workflow_id,
          version_id = excluded.version_id,
          user_id = excluded.user_id,
          target = excluded.target,
          enabled = excluded.enabled,
          config_json = excluded.config_json,
          last_run_at = excluded.last_run_at,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at`
        ).run(
          deployment.id,
          deployment.workflowId,
          deployment.versionId,
          deployment.userId,
          deployment.target,
          deployment.enabled ? 1 : 0,
          deployment.configJson,
          deployment.lastRunAt ?? null,
          deployment.lastError ?? null,
          now,
          now
        );
        return {
          ...deployment,
          lastRunAt: deployment.lastRunAt ?? null,
          lastError: deployment.lastError ?? null,
          createdAt: now,
          updatedAt: now
        };
      }
      getDeployment(deploymentId) {
        const row = this.db.prepare(
          `SELECT id, workflow_id, version_id, user_id, target, enabled, config_json,
                last_run_at, last_error, created_at, updated_at
         FROM workflow_deployments WHERE id = ?`
        ).get(deploymentId);
        return row ? mapDeployment(row) : null;
      }
      listDeployments(workflowId) {
        const rows = this.db.prepare(
          `SELECT id, workflow_id, version_id, user_id, target, enabled, config_json,
                last_run_at, last_error, created_at, updated_at
         FROM workflow_deployments WHERE workflow_id = ? ORDER BY updated_at DESC`
        ).all(workflowId);
        return rows.map(mapDeployment);
      }
      listEnabledLocalDeployments(userId) {
        const rows = this.db.prepare(
          `SELECT id, workflow_id, version_id, user_id, target, enabled, config_json,
                last_run_at, last_error, created_at, updated_at
         FROM workflow_deployments
         WHERE user_id = ? AND target = 'local' AND enabled = 1
         ORDER BY updated_at DESC`
        ).all(userId);
        return rows.map(mapDeployment);
      }
      setDeploymentLastRun(deploymentId, ranAtIso, error) {
        this.db.prepare(
          `UPDATE workflow_deployments SET last_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?`
        ).run(ranAtIso, error, ranAtIso, deploymentId);
      }
      deleteDeployment(deploymentId) {
        this.db.prepare("DELETE FROM workflow_deployments WHERE id = ?").run(deploymentId);
      }
      replaceTriggers(workflowId, deploymentId, triggers) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        this.db.prepare(
          "DELETE FROM workflow_triggers WHERE workflow_id = ? AND (deployment_id IS ? OR deployment_id = ?)"
        ).run(workflowId, deploymentId, deploymentId);
        const insert = this.db.prepare(
          `INSERT INTO workflow_triggers (
        id, workflow_id, deployment_id, trigger_type, config_json, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        const saved = [];
        for (const trigger of triggers) {
          insert.run(
            trigger.id,
            workflowId,
            deploymentId,
            trigger.triggerType,
            trigger.configJson,
            trigger.enabled ? 1 : 0,
            now,
            now
          );
          saved.push({
            ...trigger,
            workflowId,
            deploymentId,
            createdAt: now,
            updatedAt: now
          });
        }
        return saved;
      }
      listTriggers(workflowId) {
        const rows = this.db.prepare(
          `SELECT id, workflow_id, deployment_id, trigger_type, config_json, enabled, created_at, updated_at
         FROM workflow_triggers WHERE workflow_id = ? ORDER BY created_at ASC`
        ).all(workflowId);
        return rows.map(mapTrigger);
      }
      listEnabledChannelMessageTriggers() {
        const rows = this.db.prepare(
          `SELECT id, workflow_id, deployment_id, trigger_type, config_json, enabled, created_at, updated_at
         FROM workflow_triggers
         WHERE enabled = 1 AND trigger_type = 'channel_message'`
        ).all();
        return rows.map(mapTrigger);
      }
    };
  }
});

// src/main/services/conversation-store/store.ts
var import_fs3, import_path2, ConversationStore;
var init_store = __esm({
  "src/main/services/conversation-store/store.ts"() {
    import_fs3 = require("fs");
    import_path2 = require("path");
    init_openfde_home();
    init_open_app_database();
    init_app_cache();
    init_agent_configurations_repository();
    init_conversations_repository();
    init_mcp_servers_repository();
    init_messages_repository();
    init_migrations();
    init_sandbox_runs_repository();
    init_schedulers_repository();
    init_token_usage_repository();
    init_user_properties_repository();
    init_skill_compilations_repository();
    init_tool_results_repository();
    init_conversation_settings_repository();
    init_workflows_repository();
    ConversationStore = class {
      constructor() {
        const dbPath = getopenfdeDbPath();
        const defaultWorkspacePath = getopenfdeWorkspacePath();
        this.db = openAppSqliteDatabase(dbPath);
        runMigrations(this.db);
        this.conversations = new ConversationsRepository(this.db);
        this.messages = new MessagesRepository(this.db, this.conversations);
        this.sandboxRuns = new SandboxRunsRepository(this.db);
        this.agentConfigurations = new AgentConfigurationsRepository(this.db);
        this.schedulers = new SchedulersRepository(this.db);
        this.mcpServers = new McpServersRepository(this.db);
        this.userProperties = new UserPropertiesRepository(
          this.db,
          defaultWorkspacePath
        );
        this.tokenUsage = new TokenUsageRepository(this.db);
        this.skillCompilations = new SkillCompilationsRepository(this.db);
        this.toolResults = new ToolResultsRepository(this.db);
        this.conversationSettings = new ConversationSettingsRepository(this.db);
        this.workflows = new WorkflowsRepository(this.db);
        this.userProperties.ensureDefaults("default");
        this.mcpServers.ensureReferenceServers(
          "default",
          this.userProperties.getWorkspacePath("default")
        );
      }
      // ── Conversation settings ─────────────────────────────────────────────────
      getConversationSettings(conversationId) {
        return this.conversationSettings.get(conversationId);
      }
      setConversationWorkspacePath(conversationId, workspacePath) {
        return this.conversationSettings.setWorkspacePath(
          conversationId,
          workspacePath
        );
      }
      clearConversationWorkspace(conversationId) {
        this.conversationSettings.clear(conversationId);
      }
      getSessionApprovedTools(conversationId) {
        return this.conversationSettings.getSessionApprovedTools(conversationId);
      }
      addSessionApprovedTool(conversationId, toolName) {
        return this.conversationSettings.addSessionApprovedTool(
          conversationId,
          toolName
        );
      }
      getConversationCodingMode(conversationId) {
        return this.conversationSettings.getCodingMode(conversationId);
      }
      setConversationCodingMode(conversationId, codingMode) {
        return this.conversationSettings.setCodingMode(conversationId, codingMode);
      }
      getConversationPlanModeState(conversationId) {
        return this.conversationSettings.getPlanModeState(conversationId);
      }
      setConversationPlanModeState(conversationId, planModeState) {
        return this.conversationSettings.setPlanModeState(
          conversationId,
          planModeState
        );
      }
      applyCompactionToConversation(args) {
        const tx = this.db.transaction(() => {
          this.messages.deleteByIds(args.deleteMessageIds);
          const anchorMs = args.anchorCreatedAt ? new Date(args.anchorCreatedAt).getTime() : Date.now();
          const noteCreatedAt = new Date(anchorMs - 1).toISOString();
          this.messages.save({
            id: randomShortUuid(),
            conversationId: args.conversationId,
            agentId: args.agentId,
            role: "user",
            content: args.compactionNote,
            createdAt: noteCreatedAt,
            threadTag: args.threadTag ?? "general"
          });
          this.conversations.touch(args.conversationId);
        });
        tx();
      }
      // ── Skill compilations ───────────────────────────────────────────────────
      getSkillCompilation(skillId, source) {
        return this.skillCompilations.get(skillId, source);
      }
      getEffectiveSkillCompilation(skillId) {
        return this.skillCompilations.getEffective(skillId);
      }
      upsertSkillCompilation(args) {
        const result = this.skillCompilations.upsert(args);
        appCache.invalidateAllAgents();
        return result;
      }
      // ── Conversations ────────────────────────────────────────────────────────
      listConversations(agentId) {
        return this.conversations.list(agentId);
      }
      getConversation(conversationId) {
        return this.conversations.get(conversationId);
      }
      createConversation(conv) {
        return this.conversations.create(conv);
      }
      updateConversationTitle(conversationId, title) {
        this.conversations.updateTitle(conversationId, title);
      }
      updateConversationAgent(conversationId, agentId) {
        this.conversations.updateAgentId(conversationId, agentId);
      }
      touchConversation(conversationId) {
        this.conversations.touch(conversationId);
      }
      deleteConversation(conversationId) {
        this.conversations.delete(conversationId);
      }
      /** Remove chat messages and tool results; keep conversation row and settings (workspace, agent). */
      clearConversationHistory(conversationId) {
        this.messages.deleteAllForConversation(conversationId);
        this.toolResults.deleteAllForConversation(conversationId);
      }
      // ── Sandbox runs ─────────────────────────────────────────────────────────
      upsertConversationSandboxRun(payload) {
        this.sandboxRuns.upsert(payload);
      }
      listSandboxRootsForConversation(conversationId) {
        return this.sandboxRuns.listRootsForConversation(conversationId);
      }
      listSandboxRunsForConversation(conversationId) {
        return this.sandboxRuns.listForConversation(conversationId);
      }
      // ── Messages ─────────────────────────────────────────────────────────────
      getMessages(conversationId) {
        return this.messages.list(conversationId);
      }
      getMessagesPage(conversationId, opts = {}) {
        return this.messages.listPage(conversationId, opts);
      }
      saveMessage(msg) {
        this.messages.save(msg);
      }
      updateMessage(id, content) {
        this.messages.update(id, content);
      }
      searchMessages(query, opts = {}) {
        return this.messages.search(query, opts);
      }
      // ── Tool results ──────────────────────────────────────────────────────────
      saveToolResult(result) {
        this.toolResults.save(result);
      }
      listToolResults(conversationId, opts = {}) {
        return this.toolResults.list(conversationId, opts);
      }
      searchToolResults(query, opts = {}) {
        return this.toolResults.search(query, opts);
      }
      getOlderToolResults(conversationId, keepRecentN, opts = {}) {
        return this.toolResults.getOlderThan(conversationId, keepRecentN, opts);
      }
      listMessagesByThread(conversationId, threadTag, opts = {}) {
        return this.messages.listByThread(conversationId, threadTag, opts);
      }
      getMessageThreadTagCounts(conversationId) {
        return this.messages.getThreadTagCounts(conversationId);
      }
      // ── Agent configurations ─────────────────────────────────────────────────
      listAgentConfigurations(userId) {
        return this.agentConfigurations.list(userId);
      }
      upsertAgentConfiguration(config) {
        this.agentConfigurations.upsert(config);
        appCache.invalidateAgents(config.userId);
      }
      deleteAgentConfiguration(agentId, userId) {
        this.agentConfigurations.delete(agentId, userId);
        appCache.invalidateAgents(userId);
      }
      deleteSkillCompilations(skillId) {
        this.skillCompilations.deleteAllForSkill(skillId);
      }
      // ── Schedulers ───────────────────────────────────────────────────────────
      listSchedulers(userId) {
        return this.schedulers.list(userId);
      }
      upsertScheduler(scheduler) {
        this.schedulers.upsert(scheduler);
      }
      deleteScheduler(userId, schedulerId) {
        this.schedulers.delete(userId, schedulerId);
      }
      setSchedulerLastRunAt(schedulerId, ranAtIso) {
        this.schedulers.setLastRunAt(schedulerId, ranAtIso);
      }
      setSchedulerConversationId(schedulerId, conversationId) {
        this.schedulers.setConversationId(schedulerId, conversationId);
      }
      // ── Workflows ────────────────────────────────────────────────────────────
      listWorkflows(userId) {
        return this.workflows.list(userId);
      }
      getWorkflow(workflowId) {
        return this.workflows.get(workflowId);
      }
      upsertWorkflow(workflow) {
        return this.workflows.upsert(workflow);
      }
      deleteWorkflow(userId, workflowId) {
        this.workflows.delete(userId, workflowId);
      }
      insertWorkflowVersion(version) {
        return this.workflows.insertVersion(version);
      }
      getWorkflowVersion(versionId) {
        return this.workflows.getVersion(versionId);
      }
      listWorkflowVersions(workflowId) {
        return this.workflows.listVersions(workflowId);
      }
      nextWorkflowVersionNumber(workflowId) {
        return this.workflows.nextVersionNumber(workflowId);
      }
      upsertWorkflowDeployment(deployment) {
        return this.workflows.upsertDeployment(deployment);
      }
      getWorkflowDeployment(deploymentId) {
        return this.workflows.getDeployment(deploymentId);
      }
      listWorkflowDeployments(workflowId) {
        return this.workflows.listDeployments(workflowId);
      }
      listEnabledLocalWorkflowDeployments(userId) {
        return this.workflows.listEnabledLocalDeployments(userId);
      }
      setWorkflowDeploymentLastRun(deploymentId, ranAtIso, error) {
        this.workflows.setDeploymentLastRun(deploymentId, ranAtIso, error);
      }
      deleteWorkflowDeployment(deploymentId) {
        this.workflows.deleteDeployment(deploymentId);
      }
      replaceWorkflowTriggers(workflowId, deploymentId, triggers) {
        return this.workflows.replaceTriggers(workflowId, deploymentId, triggers);
      }
      listWorkflowTriggers(workflowId) {
        return this.workflows.listTriggers(workflowId);
      }
      listEnabledChannelMessageWorkflowTriggers() {
        return this.workflows.listEnabledChannelMessageTriggers();
      }
      // ── MCP servers ──────────────────────────────────────────────────────────
      listMcpServers(userId) {
        this.mcpServers.ensureReferenceServers(
          userId,
          this.userProperties.getWorkspacePath(userId)
        );
        return this.mcpServers.list(userId);
      }
      getMcpServer(userId, serverId) {
        return this.mcpServers.get(userId, serverId);
      }
      createMcpServer(server) {
        const result = this.mcpServers.create(server);
        appCache.invalidateAllMcpTools();
        return result;
      }
      setMcpServerEnabled(userId, serverId, enabled) {
        this.mcpServers.setEnabled(userId, serverId, enabled);
        appCache.invalidateAllMcpTools();
      }
      deleteMcpServer(userId, serverId) {
        this.mcpServers.delete(userId, serverId);
        appCache.invalidateAllMcpTools();
      }
      // ── User properties ──────────────────────────────────────────────────────
      listUserProperties(userId) {
        return this.userProperties.list(userId);
      }
      getUserPropertiesMap(userId) {
        return this.userProperties.getAllAsMap(userId);
      }
      getUserProperty(userId, propertyKey) {
        return this.userProperties.get(userId, propertyKey);
      }
      setUserProperty(userId, propertyKey, propertyValue) {
        this.userProperties.set(userId, propertyKey, propertyValue);
      }
      deleteUserProperty(userId, propertyKey) {
        this.userProperties.delete(userId, propertyKey);
      }
      clearUserProperties(userId) {
        this.userProperties.clear(userId);
      }
      // ── User workspace file write ────────────────────────────────────────────
      saveDataToFile(userId, relativePath, data) {
        const cleanRelativePath = relativePath.trim();
        if (!cleanRelativePath) {
          throw new Error("relativePath is required");
        }
        const workspacePath = this.userProperties.getWorkspacePath(userId);
        const workspaceRoot = (0, import_path2.resolve)(workspacePath);
        const targetPath = (0, import_path2.resolve)(workspaceRoot, cleanRelativePath);
        const workspacePrefix = workspaceRoot.endsWith(import_path2.sep) ? workspaceRoot : `${workspaceRoot}${import_path2.sep}`;
        if (targetPath !== workspaceRoot && !targetPath.startsWith(workspacePrefix)) {
          throw new Error("Target file path is outside user.workspace");
        }
        const content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        (0, import_fs3.mkdirSync)((0, import_path2.dirname)(targetPath), { recursive: true });
        (0, import_fs3.writeFileSync)(targetPath, content, "utf-8");
        return targetPath;
      }
      // ── Token usage ──────────────────────────────────────────────────────────
      insertTokenUsage(record) {
        this.tokenUsage.insert(record);
      }
      listTokenUsageChartSeries(args) {
        return this.tokenUsage.listChartSeries(args);
      }
      // ── Lifecycle ────────────────────────────────────────────────────────────
      close() {
        this.db.close();
      }
    };
  }
});

// src/main/services/conversation-store/types.ts
var init_types = __esm({
  "src/main/services/conversation-store/types.ts"() {
  }
});

// src/main/services/conversation-store/index.ts
function getConversationStore() {
  if (!_store) {
    _store = instrumentInstanceMethods2(new ConversationStore(), log3);
  }
  return _store;
}
var log3, _store;
var init_conversation_store = __esm({
  "src/main/services/conversation-store/index.ts"() {
    init_logger();
    init_store();
    init_types();
    init_store();
    log3 = createLogger("services.conversation-store");
    _store = null;
  }
});

// src/main/services/web-content-send.ts
var webContentSend;
var init_web_content_send = __esm({
  "src/main/services/web-content-send.ts"() {
    webContentSend = new Proxy(
      {},
      {
        get(target, channel) {
          return (webContents, args) => {
            webContents.send(channel, args);
          };
        }
      }
    );
  }
});

// src/main/services/plan-mode-state-notify.ts
function notifyPlanModeStateChanged(conversationId, view) {
  const id = conversationId.trim();
  if (!id) return;
  for (const window of import_electron.BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    webContentSend.PlanModeStateChanged(window.webContents, {
      conversationId: id,
      view
    });
  }
}
var import_electron;
var init_plan_mode_state_notify = __esm({
  "src/main/services/plan-mode-state-notify.ts"() {
    import_electron = require("electron");
    init_web_content_send();
  }
});

// src/main/agent/coding/plan-mode-session-reminders.ts
function markEnterPlanReminder(conversationId) {
  const id = conversationId.trim();
  if (!id) return;
  enterReminderByConversation.add(id);
}
function hasEnterPlanReminder(conversationId) {
  return enterReminderByConversation.has(conversationId.trim());
}
function consumeEnterPlanReminder(conversationId) {
  const id = conversationId.trim();
  if (!enterReminderByConversation.has(id)) return false;
  enterReminderByConversation.delete(id);
  return true;
}
function markExecutePlanReminder(conversationId) {
  const id = conversationId.trim();
  if (!id) return;
  executeReminderByConversation.add(id);
}
function hasExecutePlanReminder(conversationId) {
  return executeReminderByConversation.has(conversationId.trim());
}
function consumeExecutePlanReminder(conversationId) {
  const id = conversationId.trim();
  if (!executeReminderByConversation.has(id)) return false;
  executeReminderByConversation.delete(id);
  return true;
}
function clearPlanReminders(conversationId) {
  const id = conversationId.trim();
  enterReminderByConversation.delete(id);
  executeReminderByConversation.delete(id);
}
function clearPlanExecutionCompleted(conversationId) {
  const id = conversationId.trim();
  if (!id) return;
  executionCompletedByConversation.delete(id);
}
var enterReminderByConversation, executeReminderByConversation, executionCompletedByConversation;
var init_plan_mode_session_reminders = __esm({
  "src/main/agent/coding/plan-mode-session-reminders.ts"() {
    enterReminderByConversation = /* @__PURE__ */ new Set();
    executeReminderByConversation = /* @__PURE__ */ new Set();
    executionCompletedByConversation = /* @__PURE__ */ new Set();
  }
});

// src/main/agent/coding/plan-mode-state-machine.ts
function defaultMeta(trigger) {
  return { trigger };
}
function planModeFor(conversationId) {
  return PlanModeStateMachine.forConversation(conversationId);
}
var log4, PlanModeStateMachine;
var init_plan_mode_state_machine = __esm({
  "src/main/agent/coding/plan-mode-state-machine.ts"() {
    init_plan_mode();
    init_plan_mode_phase();
    init_logger();
    init_conversation_store();
    init_plan_mode_state_notify();
    init_plan_mode_session_reminders();
    log4 = createLogger("agent.plan-mode.state");
    PlanModeStateMachine = class _PlanModeStateMachine {
      constructor(conversationId, initial) {
        this.conversationId = conversationId;
        this.state = { ...initial };
      }
      static forConversation(conversationId) {
        const id = conversationId.trim();
        if (!id) {
          return new _PlanModeStateMachine("", { ...DEFAULT_AGENT_PLAN_MODE_STATE });
        }
        try {
          const stored = getConversationStore().getConversationPlanModeState(id);
          return new _PlanModeStateMachine(id, stored);
        } catch {
          return new _PlanModeStateMachine(id, { ...DEFAULT_AGENT_PLAN_MODE_STATE });
        }
      }
      get status() {
        return this.state.status;
      }
      get planSlug() {
        return this.state.planSlug;
      }
      isIdle() {
        return this.state.status === "tool_execute";
      }
      isPlanning() {
        return this.state.status === "planning";
      }
      isExecuting() {
        return this.state.status === "plan_tool_execute";
      }
      /** @deprecated Use {@link status}. */
      get phase() {
        return this.state.status;
      }
      /** Read-only copy of persisted storage. */
      snapshot() {
        return { ...this.state };
      }
      toView() {
        return toPlanModeView(this.state);
      }
      /** Enter read-only explore mode (`/explore`, `enter_plan_mode`). */
      activatePlanning(meta = defaultMeta("activatePlanning")) {
        clearPlanExecutionCompleted(this.conversationId);
        markEnterPlanReminder(this.conversationId);
        return this.commit(
          {
            ...this.state,
            status: "planning"
          },
          meta
        );
      }
      /** Leave planning without starting execution (abandon / cancel planning). */
      deactivatePlanning(meta = defaultMeta("deactivatePlanning")) {
        clearPlanReminders(this.conversationId);
        return this.commit(
          {
            ...this.state,
            status: "tool_execute"
          },
          meta
        );
      }
      /** Start executing an approved plan (`exit_plan_mode` after approval). */
      activateExecution(meta = defaultMeta("activateExecution")) {
        clearPlanReminders(this.conversationId);
        markExecutePlanReminder(this.conversationId);
        return this.commit(
          {
            ...this.state,
            status: "plan_tool_execute"
          },
          meta
        );
      }
      /** Finish approved-plan execution (all todos done). */
      deactivateExecution(meta = defaultMeta("deactivateExecution")) {
        clearPlanReminders(this.conversationId);
        return this.commit(
          {
            ...this.state,
            status: "tool_execute"
          },
          meta
        );
      }
      /** Full reset to idle (`/explore clear` or legacy `/plan clear`). */
      resetToIdle(meta = defaultMeta("resetToIdle")) {
        clearPlanReminders(this.conversationId);
        clearPlanExecutionCompleted(this.conversationId);
        return this.commit(
          { ...DEFAULT_AGENT_PLAN_MODE_STATE },
          meta
        );
      }
      applyTransition(action, meta) {
        const resolved = meta ?? {
          trigger: `transition:${action}`,
          reason: action
        };
        switch (action) {
          case "activatePlanning":
            return this.activatePlanning(resolved);
          case "deactivatePlanning":
            return this.deactivatePlanning(resolved);
          case "activateExecution":
            return this.activateExecution(resolved);
          case "deactivateExecution":
            return this.deactivateExecution(resolved);
          case "resetToIdle":
            return this.resetToIdle(resolved);
          default: {
            const _exhaustive = action;
            return _exhaustive;
          }
        }
      }
      assignPlanSlug(slug, meta) {
        const trimmed = slug.trim();
        if (!trimmed) return this.toView();
        return this.commit(
          { ...this.state, planSlug: trimmed },
          meta ?? { trigger: "storage:assignPlanSlug", reason: trimmed }
        );
      }
      /** One-shot enter/reenter reminder for the next tool-loop step. */
      consumeEnterReminder(meta = defaultMeta("injection:consumeEnterReminder")) {
        const consumed = consumeEnterPlanReminder(this.conversationId);
        if (consumed) {
          log4.debug("Consumed enter plan reminder", {
            conversationId: this.conversationId,
            trigger: meta.trigger
          });
        }
        return consumed;
      }
      /** One-shot post-approval execute reminder for the next tool-loop step. */
      consumeExecuteReminder(meta = defaultMeta("injection:consumeExecuteReminder")) {
        const consumed = consumeExecutePlanReminder(this.conversationId);
        if (consumed) {
          log4.debug("Consumed execute plan reminder", {
            conversationId: this.conversationId,
            trigger: meta.trigger
          });
        }
        return consumed;
      }
      hasPendingEnterReminder() {
        return hasEnterPlanReminder(this.conversationId);
      }
      hasPendingExecuteReminder() {
        return hasExecutePlanReminder(this.conversationId);
      }
      commit(next, meta) {
        const fromStatus = this.state.status;
        const from = { ...this.state };
        this.state = { ...next };
        const view = this.persist();
        this.logUpdate(from, fromStatus, view.status, meta);
        if (this.conversationId && fromStatus !== view.status) {
          notifyPlanModeStateChanged(this.conversationId, view);
        }
        return view;
      }
      persist() {
        if (!this.conversationId) return { ...DEFAULT_PLAN_MODE_VIEW };
        getConversationStore().setConversationPlanModeState(
          this.conversationId,
          this.state
        );
        return this.toView();
      }
      logUpdate(from, fromStatus, toStatus, meta) {
        if (!this.conversationId) return;
        const statusChanged = fromStatus !== toStatus;
        const payload = {
          conversationId: this.conversationId,
          trigger: meta.trigger,
          reason: meta.reason,
          fromStatus,
          toStatus,
          from: {
            status: from.status,
            planSlug: from.planSlug
          },
          to: {
            status: this.state.status,
            planSlug: this.state.planSlug
          }
        };
        if (statusChanged) {
          log4.info("Explore mode status transition", payload);
        } else {
          log4.info("Explore mode state updated", payload);
        }
      }
    };
  }
});

// src/shared/agent/todos.ts
function isTrackedTodoStatus(value) {
  return typeof value === "string" && TRACKED_TODO_STATUSES.includes(value);
}
function todosNamespaceFromScope(outputScope) {
  const normalized = (outputScope ?? "").replace(/\\/g, "/");
  const matches = [...normalized.matchAll(/subRuns\/([^/]+)/g)];
  if (matches.length === 0) return "main";
  const id = matches[matches.length - 1][1].replace(/[^A-Za-z0-9_-]/g, "");
  return id ? `sub-${id}` : "main";
}
function todosFileName(namespace) {
  return namespace === "main" ? "todos.json" : `todos.${namespace}.json`;
}
function emptyTodoList(now = (/* @__PURE__ */ new Date()).toISOString()) {
  return { version: 1, updatedAt: now, todos: [] };
}
function todoId(index) {
  return `t${index + 1}`;
}
function trimOptionalString(value) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
function isTrackedTodoFallbackPlan(value) {
  return typeof value === "string" && TRACKED_TODO_FALLBACK_PLANS.includes(value);
}
function normalizeTodos(input) {
  const todos = [];
  for (const raw of input) {
    const content = typeof raw.content === "string" ? raw.content.trim() : "";
    if (!content) continue;
    const status = isTrackedTodoStatus(raw.status) ? raw.status : "pending";
    const success_criteria = trimOptionalString(raw.success_criteria);
    const verify_command = trimOptionalString(raw.verify_command);
    const fallback_plan = isTrackedTodoFallbackPlan(raw.fallback_plan) ? raw.fallback_plan : void 0;
    todos.push({
      id: todoId(todos.length),
      content,
      status,
      ...success_criteria ? { success_criteria } : {},
      ...verify_command ? { verify_command } : {},
      ...fallback_plan ? { fallback_plan } : {}
    });
  }
  return todos;
}
function replaceTodos(incoming, now = (/* @__PURE__ */ new Date()).toISOString()) {
  return { version: 1, updatedAt: now, todos: normalizeTodos(incoming) };
}
function parseTodoList(value) {
  if (!value || typeof value !== "object") return emptyTodoList();
  const obj = value;
  const todos = Array.isArray(obj.todos) ? normalizeTodos(obj.todos) : [];
  const updatedAt = typeof obj.updatedAt === "string" ? obj.updatedAt : (/* @__PURE__ */ new Date()).toISOString();
  return { version: 1, updatedAt, todos };
}
function summarizeTodos(list) {
  const s = {
    total: list.todos.length,
    pending: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
    allDone: false
  };
  for (const t of list.todos) {
    if (t.status === "pending") s.pending++;
    else if (t.status === "in_progress") s.inProgress++;
    else if (t.status === "completed") s.completed++;
    else if (t.status === "cancelled") s.cancelled++;
  }
  const actionable = s.total - s.cancelled;
  s.allDone = actionable > 0 && s.completed === actionable;
  return s;
}
function formatTodoChecklistLine(todo) {
  let line = `- ${STATUS_MARK[todo.status]} ${todo.content}`;
  if (todo.success_criteria) {
    line += ` (verify: ${todo.success_criteria})`;
  }
  if (todo.verify_command) {
    line += ` [cmd: ${todo.verify_command}]`;
  }
  return line;
}
function renderTodoChecklist(list) {
  if (list.todos.length === 0) return "_No tasks._";
  return list.todos.map(formatTodoChecklistLine).join("\n");
}
var TRACKED_TODO_STATUSES, TRACKED_TODO_FALLBACK_PLANS, STATUS_MARK;
var init_todos = __esm({
  "src/shared/agent/todos.ts"() {
    TRACKED_TODO_STATUSES = [
      "pending",
      "in_progress",
      "completed",
      "cancelled"
    ];
    TRACKED_TODO_FALLBACK_PLANS = [
      "retry",
      "skip",
      "manual_intervention"
    ];
    STATUS_MARK = {
      pending: "[ ]",
      in_progress: "[~]",
      completed: "[x]",
      cancelled: "[-]"
    };
  }
});

// src/main/skills/constants.ts
var SKILLS_RESERVED_DIR_NAMES, SKILL_FILES, SKILL_DEFAULT_PROPERTIES, SKILL_LOADER_LOG, SKILL_MODULE;
var init_constants = __esm({
  "src/main/skills/constants.ts"() {
    SKILLS_RESERVED_DIR_NAMES = [
      "common",
      "__pycache__",
      "node_modules"
    ];
    SKILL_FILES = {
      SKILL_MD: "skill.md",
      PROPERTIES_MD: "properties.md",
      SUMMARY_MD: "summary.md",
      /** @deprecated Legacy filename; use {@link SUMMARY_MD}. */
      LEGACY_SUMMARY_MD: "analysis.md",
      REPORT_MD: "report.md",
      ACTIONS_DIR: "actions",
      TOOL_SET_DIR: "toolSet"
    };
    SKILL_DEFAULT_PROPERTIES = {
      MODEL: "gemma4",
      PROVIDER: "ollama",
      COLOR: "primary",
      ENABLED: true
    };
    SKILL_LOADER_LOG = {
      SKIPPED_INVALID: "Skipped skill folder: missing or invalid properties",
      SKIPPED_FAILED: "Skipped skill folder: failed to load",
      LOADED: "Loaded skills from directory"
    };
    SKILL_MODULE = {
      CACHE_DIR: ".electron-vite/skill-module-cache",
      DEFAULT_TOOL_SET_TAG: "toolSet"
    };
  }
});

// src/main/skills/llm-constants.ts
function buildDefaultPropertiesYaml(displayName, skillId) {
  const name = displayName || skillId;
  return [
    `name: ${name}`,
    "description:",
    `model: ${SKILL_DEFAULT_PROPERTIES.MODEL}`,
    `provider: ${SKILL_DEFAULT_PROPERTIES.PROVIDER}`,
    `color: ${SKILL_DEFAULT_PROPERTIES.COLOR}`,
    `enabled: ${SKILL_DEFAULT_PROPERTIES.ENABLED}`
  ].join("\n");
}
var SKILL_MARKDOWN_LLM, SKILL_MARKDOWN_SECTIONS;
var init_llm_constants = __esm({
  "src/main/skills/llm-constants.ts"() {
    init_constants();
    SKILL_MARKDOWN_LLM = {
      EXAMPLES_SECTION: "## Examples",
      EXAMPLE_USER_PREFIX: "User:",
      EXAMPLE_ASSISTANT_PREFIX: "Assistant:"
    };
    SKILL_MARKDOWN_SECTIONS = {
      INSTRUCTIONS: "Instructions",
      SUMMARY: "Summary",
      ANALYSIS: "Analysis",
      REPORT: "Report",
      TOOLS: "Tools",
      EXAMPLES: "Examples",
      CONSTRAINTS: "Constraints",
      GUARD_RAILS: "GuardRails"
    };
  }
});

// src/main/skills/skill-path.ts
function getHostToolOs() {
  switch (process.platform) {
    case "darwin":
      return "mac";
    case "win32":
      return "win";
    default:
      return "linux";
  }
}
function isReservedSkillDirName(name) {
  return RESERVED_SKILL_DIR_NAMES.has(name) || name.startsWith(".");
}
function isLoadableSkillFolder(skillsDir, entry) {
  if (isReservedSkillDirName(entry)) return false;
  const skillFolder = (0, import_path3.join)(skillsDir, entry);
  try {
    if (!(0, import_fs4.statSync)(skillFolder).isDirectory()) return false;
  } catch {
    return false;
  }
  return (0, import_fs4.existsSync)((0, import_path3.join)(skillFolder, SKILL_FILES.SKILL_MD));
}
function resolveBundledSkillsDirectory() {
  if (import_electron2.app?.isPackaged) {
    return (0, import_path3.join)(import_electron2.app.getAppPath(), "skills");
  }
  return (0, import_path3.join)(process.cwd(), "skills");
}
function resolveUserSkillsDirectory() {
  return getopenfdeSkillsDir();
}
function resolveSkillsSources() {
  return {
    bundled: resolveBundledSkillsDirectory(),
    user: resolveUserSkillsDirectory()
  };
}
function resolveSkillsSourceRoots() {
  const { bundled, user } = resolveSkillsSources();
  return [bundled, user];
}
function resolveBundledToolSetDirectory() {
  if (import_electron2.app?.isPackaged) {
    return (0, import_path3.join)(import_electron2.app.getAppPath(), SKILL_FILES.TOOL_SET_DIR);
  }
  return (0, import_path3.join)(process.cwd(), SKILL_FILES.TOOL_SET_DIR);
}
function resolveUserToolSetDirectory() {
  return getopenfdeToolSetDir();
}
function resolveToolSetSourceRoots() {
  return [resolveBundledToolSetDirectory(), resolveUserToolSetDirectory()];
}
function extractYamlFrontmatterBlock(markdown2) {
  const match = markdown2.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match?.[1]?.trim()) return null;
  return match[1].trim();
}
function stripYamlFrontmatter(markdown2) {
  return markdown2.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}
function parsePropertiesKeyValues(raw) {
  const out = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([\w-]+):\s*(.+)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim();
  }
  return out;
}
function serializePropertiesKeyValues(kv) {
  const ordered = [
    ...PROPERTY_KEY_ORDER.filter((key) => key in kv),
    ...Object.keys(kv).filter(
      (key) => !PROPERTY_KEY_ORDER.includes(key)
    )
  ];
  return `${ordered.map((key) => `${key}: ${kv[key]}`).join("\n")}
`;
}
function mergePropertiesRaw(baseRaw, overrideRaw) {
  return serializePropertiesKeyValues({
    ...parsePropertiesKeyValues(baseRaw),
    ...parsePropertiesKeyValues(overrideRaw)
  });
}
function resolvePropertiesRaw(skillId, skillFolder, skillRaw) {
  const propertiesFile = (0, import_path3.join)(skillFolder, SKILL_FILES.PROPERTIES_MD);
  const propertiesFromFile = (0, import_fs4.existsSync)(propertiesFile) ? (0, import_fs4.readFileSync)(propertiesFile, "utf-8") : "";
  const frontmatter = extractYamlFrontmatterBlock(skillRaw) ?? "";
  if (frontmatter.trim() || propertiesFromFile.trim()) {
    return mergePropertiesRaw(frontmatter, propertiesFromFile);
  }
  const displayName = skillId.split(/[-_]+/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  return buildDefaultPropertiesYaml(displayName, skillId);
}
var import_fs4, import_path3, import_electron2, RESERVED_SKILL_DIR_NAMES, PROPERTY_KEY_ORDER;
var init_skill_path = __esm({
  "src/main/skills/skill-path.ts"() {
    import_fs4 = require("fs");
    import_path3 = require("path");
    init_openfde_home();
    import_electron2 = require("electron");
    init_constants();
    init_llm_constants();
    RESERVED_SKILL_DIR_NAMES = new Set(SKILLS_RESERVED_DIR_NAMES);
    PROPERTY_KEY_ORDER = [
      "name",
      "description",
      "model",
      "provider",
      "color",
      "enabled",
      "visibility",
      "allowed_tools",
      "max_iterations",
      "refs_dir",
      "scripts_dir",
      "form_dir"
    ];
  }
});

// src/shared/skills/workflow-panel-skills.ts
var WORKFLOW_RUNTIME_SKILL_ID, WORKFLOW_RUNTIME_AGENT_ID;
var init_workflow_panel_skills = __esm({
  "src/shared/skills/workflow-panel-skills.ts"() {
    WORKFLOW_RUNTIME_SKILL_ID = "workflow-runtime";
    WORKFLOW_RUNTIME_AGENT_ID = `skill:${WORKFLOW_RUNTIME_SKILL_ID}`;
  }
});

// src/main/skills/skill-visibility.ts
function parseSkillVisibility(raw) {
  if (raw?.trim().toLowerCase() === "workflow") return "workflow";
  return "chat";
}
var init_skill_visibility = __esm({
  "src/main/skills/skill-visibility.ts"() {
    init_workflow_panel_skills();
  }
});

// src/main/skills/skill-markdown.ts
function parseFrontmatter(raw) {
  const result = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (val === "true") result[key] = true;
    else if (val === "false") result[key] = false;
    else result[key] = val.trim();
  }
  return result;
}
function extractSection(content, heading) {
  const pattern = new RegExp(`^##\\s+${heading}\\s*$`, "im");
  const match = pattern.exec(content);
  if (!match) return "";
  const afterHeading = content.slice(match.index + match[0].length);
  const nextHeading = afterHeading.search(/^##\s/m);
  const body = nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading);
  return body.trim();
}
function extractBullets(text) {
  return text.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("- ") || l.startsWith("* ")).map((l) => l.slice(2).trim()).filter(Boolean);
}
function extractExamples(text) {
  const examples = [];
  const parts = text.split(/^###\s+User\s*$/im);
  for (const part of parts.slice(1)) {
    const halves = part.split(/^###\s+Assistant\s*$/im);
    if (halves.length < 2) continue;
    examples.push({
      user: halves[0].trim(),
      assistant: halves[1].trim()
    });
  }
  return examples;
}
function normalizeToolName(value) {
  return value.split(":", 1)[0].trim().replace(/^`|`$/g, "");
}
function parseCommaSeparatedToolList(raw) {
  if (!raw?.trim()) return [];
  return raw.split(",").map((entry) => normalizeToolName(entry.trim())).filter(Boolean);
}
function extractTools(text) {
  const bullets = extractBullets(text);
  if (bullets.length > 0) {
    return bullets.map(normalizeToolName).filter(Boolean);
  }
  return parseCommaSeparatedToolList(text);
}
function extractInstructions(skillRaw) {
  const fromSection = extractSection(
    skillRaw,
    SKILL_MARKDOWN_SECTIONS.INSTRUCTIONS
  ).trim();
  if (fromSection) return fromSection;
  return skillRaw.trim();
}
function buildSystemPrompt(sections) {
  const parts = [];
  if (sections.instructions) {
    parts.push(sections.instructions);
  }
  if (sections.examples.length > 0) {
    const block = sections.examples.map(
      (e) => `${SKILL_MARKDOWN_LLM.EXAMPLE_USER_PREFIX} ${e.user}
${SKILL_MARKDOWN_LLM.EXAMPLE_ASSISTANT_PREFIX} ${e.assistant}`
    ).join("\n\n");
    parts.push(`
${SKILL_MARKDOWN_LLM.EXAMPLES_SECTION}
${block}`);
  }
  return parts.join("\n").trim();
}
function parseSkillMarkdown(id, folder, propertiesRaw, skillRaw, summaryRaw, reportRaw, resolvedTools = []) {
  const fm = parseFrontmatter(propertiesRaw);
  if (!fm.name || !fm.model || !fm.provider) return null;
  const allowedTools = parseCommaSeparatedToolList(
    fm.allowed_tools
  );
  const rawMaxIterations = Number(
    fm.max_iterations
  );
  const maxIterations = Number.isFinite(rawMaxIterations) ? rawMaxIterations : void 0;
  const properties = {
    name: fm.name,
    description: fm.description ?? "",
    model: fm.model,
    provider: fm.provider,
    color: fm.color ?? "primary",
    enabled: fm.enabled !== false,
    visibility: parseSkillVisibility(fm.visibility),
    ...allowedTools.length > 0 ? { allowedTools } : {},
    ...maxIterations != null ? { maxIterations } : {}
  };
  const summaryText = summaryRaw ?? extractSection(skillRaw, SKILL_MARKDOWN_SECTIONS.SUMMARY) ?? extractSection(skillRaw, SKILL_MARKDOWN_SECTIONS.ANALYSIS);
  const reportText = reportRaw ?? extractSection(skillRaw, SKILL_MARKDOWN_SECTIONS.REPORT);
  const explicitTools = extractTools(
    extractSection(skillRaw, SKILL_MARKDOWN_SECTIONS.TOOLS)
  );
  const declaredToolNames = explicitTools.length > 0 ? explicitTools : resolvedTools.map((tool) => tool.name);
  const sections = {
    fullMarkdown: skillRaw.trim(),
    instructions: extractInstructions(skillRaw),
    summary: summaryText.trim(),
    report: reportText.trim(),
    examples: extractExamples(
      extractSection(skillRaw, SKILL_MARKDOWN_SECTIONS.EXAMPLES)
    ),
    tools: declaredToolNames
  };
  return {
    id,
    folder,
    properties,
    sections,
    systemPrompt: buildSystemPrompt(sections),
    /** Full toolSet catalog (+ skill actions) for agent AvailableSet and runtime. */
    tools: resolvedTools,
    actionToolNames: []
  };
}
var init_skill_markdown = __esm({
  "src/main/skills/skill-markdown.ts"() {
    init_skill_visibility();
    init_llm_constants();
  }
});

// src/main/skills/skill-module-cache.ts
function skillModuleCacheDir() {
  return (0, import_path4.join)(process.cwd(), SKILL_MODULE.CACHE_DIR);
}
function skillModuleFingerprintPath(outJs) {
  return `${outJs}${SKILL_MODULE_FINGERPRINT_SUFFIX}`;
}
function entryCacheKey(filepath) {
  const st = (0, import_fs5.statSync)(filepath);
  return (0, import_crypto.createHash)("sha256").update(filepath).update(String(st.mtimeMs)).digest("hex").slice(0, 40);
}
function fingerprintFromMetafile(metafile) {
  const inputs = {};
  for (const inputPath of Object.keys(metafile.inputs)) {
    if (!(0, import_fs5.existsSync)(inputPath)) continue;
    inputs[inputPath] = (0, import_fs5.statSync)(inputPath).mtimeMs;
  }
  return { inputs };
}
function isSkillModuleBundleStale(fingerprint) {
  for (const [inputPath, recordedMtime] of Object.entries(fingerprint.inputs)) {
    if (!(0, import_fs5.existsSync)(inputPath)) return true;
    if ((0, import_fs5.statSync)(inputPath).mtimeMs !== recordedMtime) return true;
  }
  return false;
}
function readSkillModuleBundleFingerprint(outJs) {
  const fingerprintPath = skillModuleFingerprintPath(outJs);
  if (!(0, import_fs5.existsSync)(fingerprintPath)) return null;
  try {
    return JSON.parse(
      (0, import_fs5.readFileSync)(fingerprintPath, "utf8")
    );
  } catch {
    return null;
  }
}
function writeSkillModuleBundleFingerprint(outJs, fingerprint) {
  (0, import_fs5.writeFileSync)(
    skillModuleFingerprintPath(outJs),
    JSON.stringify(fingerprint),
    "utf8"
  );
}
function shouldRebuildSkillModuleBundle(outJs) {
  if (!(0, import_fs5.existsSync)(outJs)) return true;
  const fingerprint = readSkillModuleBundleFingerprint(outJs);
  if (!fingerprint) return true;
  return isSkillModuleBundleStale(fingerprint);
}
function esbuildPathAliases() {
  const root = process.cwd();
  return {
    "@main": (0, import_path4.resolve)(root, "src/main"),
    "@config": (0, import_path4.resolve)(root, "config"),
    "@shared": (0, import_path4.resolve)(root, "src/shared"),
    "@toolSet": (0, import_path4.resolve)(root, "toolSet"),
    "@logging": (0, import_path4.resolve)(root, "src/logging"),
    "@openfde-ai": (0, import_path4.resolve)(root, "src/openfde-ai")
  };
}
var import_crypto, import_fs5, import_path4, SKILL_MODULE_FINGERPRINT_SUFFIX;
var init_skill_module_cache = __esm({
  "src/main/skills/skill-module-cache.ts"() {
    import_crypto = require("crypto");
    import_fs5 = require("fs");
    import_path4 = require("path");
    init_constants();
    SKILL_MODULE_FINGERPRINT_SUFFIX = ".fingerprint.json";
  }
});

// src/main/skills/skill-module-loader.ts
async function requireModule(filepath) {
  if (filepath.endsWith(".ts")) {
    try {
      const esbuild = require("esbuild");
      const cacheDir = skillModuleCacheDir();
      (0, import_fs6.mkdirSync)(cacheDir, { recursive: true });
      const cacheKey = entryCacheKey(filepath);
      const outJs = (0, import_path5.join)(cacheDir, `${cacheKey}.js`);
      if (shouldRebuildSkillModuleBundle(outJs)) {
        const result = await esbuild.build({
          entryPoints: [filepath],
          outfile: outJs,
          bundle: true,
          format: "cjs",
          platform: "node",
          packages: "external",
          sourcemap: true,
          sourcesContent: true,
          metafile: true,
          alias: esbuildPathAliases()
        });
        if (result.metafile) {
          writeSkillModuleBundleFingerprint(
            outJs,
            fingerprintFromMetafile(result.metafile)
          );
        }
      }
      return require(outJs);
    } catch {
      return void 0;
    }
  }
  try {
    return require(filepath);
  } catch {
    return void 0;
  }
}
function isSkillTool(value) {
  return typeof value === "object" && value !== null && typeof value.name === "string" && typeof value.description === "string" && typeof value.execute === "function";
}
function collectToolsFromModule(loaded) {
  if (Array.isArray(loaded.tools)) {
    return loaded.tools.filter(isSkillTool);
  }
  const def = loaded.default;
  if (def && typeof def === "object" && Array.isArray(def.tools)) {
    return def.tools.filter(isSkillTool);
  }
  return Object.values(loaded).filter(isSkillTool);
}
function filterByDeclared(tools, declaredNames) {
  if (declaredNames.length === 0) return tools;
  const nameSet = new Set(declaredNames);
  return tools.filter((t) => nameSet.has(t.name));
}
async function loadSkillActionsFromDirectory(actionsDir) {
  if (!(0, import_fs6.existsSync)(actionsDir)) return [];
  const indexCandidates = [
    actionsDir,
    (0, import_path5.join)(actionsDir, "index"),
    (0, import_path5.join)(actionsDir, "index.ts"),
    (0, import_path5.join)(actionsDir, "index.js"),
    (0, import_path5.join)(actionsDir, "index.mjs"),
    (0, import_path5.join)(actionsDir, "index.cjs")
  ];
  for (const candidate of indexCandidates) {
    const loaded = await requireModule(candidate);
    if (!loaded) continue;
    const tools = collectToolsFromModule(loaded);
    if (tools.length > 0) return tools;
  }
  const allTools = [];
  let entries;
  try {
    entries = (0, import_fs6.readdirSync)(actionsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    const entryPath = (0, import_path5.join)(actionsDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      allTools.push(...await loadSkillActionsFromDirectory(entryPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (ACTION_INDEX_RE.test(entry.name)) continue;
    if (!ACTION_MODULE_EXT_RE.test(entry.name)) continue;
    const fileCandidates = [
      entryPath,
      entryPath.replace(ACTION_MODULE_EXT_RE, "")
    ];
    for (const modulePath of fileCandidates) {
      const loaded = await requireModule(modulePath);
      if (!loaded) continue;
      allTools.push(...collectToolsFromModule(loaded));
      break;
    }
  }
  return allTools;
}
async function loadSkillActions(skillFolder, declaredToolNames) {
  const actionsDir = (0, import_path5.join)(skillFolder, SKILL_FILES.ACTIONS_DIR);
  const allTools = await loadSkillActionsFromDirectory(actionsDir);
  return filterByDeclared(allTools, declaredToolNames);
}
async function loadToolSetToolsFromDirectory(toolSetDir) {
  if (!(0, import_fs6.existsSync)(toolSetDir)) return [];
  const withDefaultTags = (tools, defaultTag) => {
    return tools.map((tool) => {
      const cleanedTags = (tool.tags ?? []).filter(
        (tag) => typeof tag === "string" && tag.trim() !== ""
      );
      if (cleanedTags.length > 0) {
        return { ...tool, tags: Array.from(new Set(cleanedTags)) };
      }
      return { ...tool, tags: [defaultTag] };
    });
  };
  const moduleFiles = (0, import_fs6.readdirSync)(toolSetDir).filter((name) => {
    if (name.startsWith("index.")) return false;
    const ext = (0, import_path5.extname)(name);
    return ext === ".ts" || ext === ".js" || ext === ".mjs" || ext === ".cjs";
  }).map((name) => ({
    name,
    filePath: (0, import_path5.join)(toolSetDir, name),
    moduleTag: (0, import_path5.basename)(name, (0, import_path5.extname)(name))
  }));
  if (moduleFiles.length > 0) {
    const toolMap = /* @__PURE__ */ new Map();
    for (const moduleFile of moduleFiles) {
      if (moduleFile.filePath.endsWith(".test.ts")) continue;
      const loaded = await requireModule(moduleFile.filePath);
      if (!loaded) continue;
      const tools = withDefaultTags(
        collectToolsFromModule(loaded),
        moduleFile.moduleTag
      );
      for (const tool of tools) {
        if (!toolMap.has(tool.name)) toolMap.set(tool.name, tool);
      }
    }
    if (toolMap.size > 0) {
      return Array.from(toolMap.values());
    }
  }
  const candidates = [
    (0, import_path5.join)(toolSetDir, "index.ts"),
    (0, import_path5.join)(toolSetDir, "index.js"),
    (0, import_path5.join)(toolSetDir, "index.mjs"),
    (0, import_path5.join)(toolSetDir, "index")
  ];
  for (const candidate of candidates) {
    const loaded = await requireModule(candidate);
    if (!loaded) continue;
    const tools = withDefaultTags(
      collectToolsFromModule(loaded),
      SKILL_MODULE.DEFAULT_TOOL_SET_TAG
    );
    if (tools.length > 0) return tools;
  }
  return [];
}
async function loadToolSetTools() {
  const merged = /* @__PURE__ */ new Map();
  for (const toolSetDir of resolveToolSetSourceRoots()) {
    const tools = await loadToolSetToolsFromDirectory(toolSetDir);
    for (const tool of tools) {
      merged.set(tool.name, tool);
    }
  }
  return Array.from(merged.values());
}
var import_fs6, import_path5, ACTION_MODULE_EXT_RE, ACTION_INDEX_RE;
var init_skill_module_loader = __esm({
  "src/main/skills/skill-module-loader.ts"() {
    import_fs6 = require("fs");
    import_path5 = require("path");
    init_constants();
    init_skill_path();
    init_skill_module_cache();
    init_skill_module_cache();
    ACTION_MODULE_EXT_RE = /\.(ts|js|mjs|cjs)$/;
    ACTION_INDEX_RE = /^index\.(ts|js|mjs|cjs)$/;
  }
});

// src/shared/agent/mandatory-tools.ts
function isMandatoryTool(toolName) {
  return MANDATORY_TOOL_NAMES.has(toolName);
}
function withMandatoryToolsInCatalog(catalogTools, names) {
  const catalogNames = new Set(catalogTools.map((tool) => tool.name));
  const merged = new Set(names);
  for (const name of MANDATORY_TOOL_NAMES) {
    if (catalogNames.has(name)) merged.add(name);
  }
  return [...merged];
}
var MANDATORY_TOOL_NAMES;
var init_mandatory_tools = __esm({
  "src/shared/agent/mandatory-tools.ts"() {
    MANDATORY_TOOL_NAMES = /* @__PURE__ */ new Set([
      "read_todos",
      "update_todos",
      "enter_plan_mode",
      "exit_plan_mode",
      "invoke_agent",
      "invoke_agents",
      "wait_for_sub_agent_runs",
      "promote_artifact"
    ]);
  }
});

// toolSet/planning/constants.ts
var PLANNING_TAG, ENTER_PLAN_MODE_TOOL_NAME, EXIT_PLAN_MODE_TOOL_NAME, PLAN_MODE_TOOL_NAMES, PLAN_MODE_FILE_IO_TOOLS, PLAN_MODE_RESEARCH_TOOLS, PLAN_MODE_GIT_READ_TOOLS, PLAN_MODE_ALWAYS_IN_CATALOG_TOOL_NAMES;
var init_constants2 = __esm({
  "toolSet/planning/constants.ts"() {
    PLANNING_TAG = ["planning"];
    ENTER_PLAN_MODE_TOOL_NAME = "enter_plan_mode";
    EXIT_PLAN_MODE_TOOL_NAME = "exit_plan_mode";
    PLAN_MODE_TOOL_NAMES = /* @__PURE__ */ new Set([
      ENTER_PLAN_MODE_TOOL_NAME,
      EXIT_PLAN_MODE_TOOL_NAME
    ]);
    PLAN_MODE_FILE_IO_TOOLS = /* @__PURE__ */ new Set([
      "read_file",
      "grep_files",
      "glob_files",
      "list_files",
      "search_files",
      "file_status",
      "storage_check",
      "lsp",
      "read_spreadsheet"
    ]);
    PLAN_MODE_RESEARCH_TOOLS = /* @__PURE__ */ new Set([
      "web_search",
      "web_scrape",
      "deep_research"
    ]);
    PLAN_MODE_GIT_READ_TOOLS = /* @__PURE__ */ new Set([
      "git_status",
      "git_diff",
      "git_log"
    ]);
    PLAN_MODE_ALWAYS_IN_CATALOG_TOOL_NAMES = /* @__PURE__ */ new Set([
      ...PLAN_MODE_FILE_IO_TOOLS,
      ...PLAN_MODE_RESEARCH_TOOLS,
      ...PLAN_MODE_GIT_READ_TOOLS,
      "read_todos",
      "update_todos"
    ]);
  }
});

// toolSet/file-system/permission-keys.ts
var init_permission_keys = __esm({
  "toolSet/file-system/permission-keys.ts"() {
  }
});

// toolSet/planning/plan-file-guard.ts
var init_plan_file_guard = __esm({
  "toolSet/planning/plan-file-guard.ts"() {
    init_plan_mode_storage_impl();
    init_permission_keys();
    init_constants2();
  }
});

// src/main/agent/coding/plan-mode-jinja.ts
function resolvePath(ctx, path2) {
  const parts = path2.trim().split(".");
  let cur = ctx;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return void 0;
    cur = cur[part];
  }
  return cur;
}
function interpolate(text, ctx) {
  return text.replace(/\{\{-?\s*([^}]+?)\s*-?\}\}/g, (_, rawPath) => {
    const value = resolvePath(ctx, rawPath.trim());
    return value == null ? "" : String(value);
  });
}
function evalCondition(expr, ctx) {
  const trimmed = expr.trim();
  const neMatch = trimmed.match(/^([\w.]+)\s*!=\s*['"]([^'"]*)['"]$/);
  if (neMatch) {
    return String(resolvePath(ctx, neMatch[1])) !== neMatch[2];
  }
  const value = trimmed.includes(".") || !(trimmed in ctx) ? resolvePath(ctx, trimmed) : ctx[trimmed];
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}
function stripTrailingNewlineIfTagHadDash(tag) {
  return tag.trimEnd().endsWith("-");
}
function findForBlock(template, bodyStart) {
  let depth = 1;
  let pos = bodyStart;
  let elseBody = null;
  let elseStart = -1;
  while (pos < template.length) {
    const tagStart = template.indexOf("{%", pos);
    if (tagStart === -1) break;
    const tagEnd = template.indexOf("%}", tagStart);
    if (tagEnd === -1) break;
    const tag = template.slice(tagStart + 2, tagEnd).trim().replace(/\s*-$/, "");
    if (tag === "endfor") {
      depth -= 1;
      if (depth === 0) {
        const bodyEnd = elseStart >= 0 ? elseStart : tagStart;
        return {
          body: template.slice(bodyStart, bodyEnd),
          elseBody,
          after: tagEnd + 2
        };
      }
    } else if (tag.startsWith("for ")) {
      depth += 1;
    }
    pos = tagEnd + 2;
  }
  throw new Error("Unclosed {% for %} block");
}
function findIfBlock(template, bodyStart) {
  let depth = 1;
  let pos = bodyStart;
  let elseAt = -1;
  while (pos < template.length) {
    const tagStart = template.indexOf("{%", pos);
    if (tagStart === -1) break;
    const tagEnd = template.indexOf("%}", tagStart);
    if (tagEnd === -1) break;
    const rawTag = template.slice(tagStart + 2, tagEnd);
    const tag = rawTag.trim().replace(/\s*-$/, "");
    if (tag === "endif") {
      depth -= 1;
      if (depth === 0) {
        if (elseAt >= 0) {
          const elseTagEnd = template.indexOf("%}", elseAt);
          return {
            body: template.slice(bodyStart, elseAt),
            elseBody: template.slice(elseTagEnd + 2, tagStart),
            after: tagEnd + 2
          };
        }
        return {
          body: template.slice(bodyStart, tagStart),
          elseBody: null,
          after: tagEnd + 2
        };
      }
    } else if (tag === "else" && depth === 1 && elseAt < 0) {
      elseAt = tagStart;
    } else if (tag.startsWith("if ")) {
      depth += 1;
    }
    pos = tagEnd + 2;
  }
  throw new Error("Unclosed {% if %} block");
}
function renderBlock(template, ctx) {
  let out = "";
  let i = 0;
  while (i < template.length) {
    const tagStart = template.indexOf("{%", i);
    if (tagStart === -1) {
      out += interpolate(template.slice(i), ctx);
      break;
    }
    out += interpolate(template.slice(i, tagStart), ctx);
    const tagEnd = template.indexOf("%}", tagStart);
    if (tagEnd === -1) {
      throw new Error("Unclosed Jinja tag");
    }
    const rawTag = template.slice(tagStart + 2, tagEnd);
    const tag = rawTag.trim().replace(/\s*-$/, "");
    const trimAfter = stripTrailingNewlineIfTagHadDash(rawTag);
    const bodyStart = tagEnd + 2;
    if (tag.startsWith("for ")) {
      const match = tag.match(/^for\s+(\w+)\s+in\s+(\S+)$/);
      if (!match) throw new Error(`Invalid for tag: ${tag}`);
      const [, itemName, listPath] = match;
      const block = findForBlock(template, bodyStart);
      const list = resolvePath(ctx, listPath);
      if (Array.isArray(list)) {
        for (let idx = 0; idx < list.length; idx++) {
          const itemCtx = {
            ...ctx,
            [itemName]: list[idx],
            loop: { index: idx + 1 }
          };
          out += renderBlock(block.body, itemCtx);
        }
      }
      i = block.after;
      if (trimAfter && template[i] === "\n") i += 1;
      continue;
    }
    if (tag.startsWith("if ")) {
      const condition = tag.slice(3).trim();
      const block = findIfBlock(template, bodyStart);
      const branch = evalCondition(condition, ctx) ? block.body : block.elseBody ?? "";
      out += renderBlock(branch, ctx);
      i = block.after;
      if (trimAfter && template[i] === "\n") i += 1;
      continue;
    }
    if (tag === "endif" || tag === "endfor" || tag === "else") {
      break;
    }
    throw new Error(`Unsupported Jinja tag: ${tag}`);
  }
  return out;
}
function renderJinja2(template, context) {
  return renderBlock(template, context);
}
var init_plan_mode_jinja = __esm({
  "src/main/agent/coding/plan-mode-jinja.ts"() {
  }
});

// src/main/agent/coding/plan-mode-template.ts
function todosToPlanSteps(todos) {
  return todos.map((todo) => {
    const step = {
      content: todo.content.trim(),
      status: todo.status
    };
    if (todo.success_criteria?.trim()) {
      step.success_criteria = todo.success_criteria.trim();
    }
    if (todo.verify_command?.trim()) {
      step.verify_command = todo.verify_command.trim();
    }
    return step;
  }).filter((step) => step.content.length > 0);
}
function renderPlanModeMarkdown(ctx) {
  return renderJinja2(PLAN_MODE_TEMPLATE, ctx);
}
function planContextFromTodoList(list) {
  return { steps: todosToPlanSteps(list.todos) };
}
function renderPlanMarkdownFromTodoList(list) {
  return renderPlanModeMarkdown(planContextFromTodoList(list));
}
var PLAN_MODE_TEMPLATE;
var init_plan_mode_template = __esm({
  "src/main/agent/coding/plan-mode-template.ts"() {
    init_plan_mode_jinja();
    PLAN_MODE_TEMPLATE = `
## Steps
{% if steps -%}
{% for step in steps -%}
{{ loop.index }}. {{ step.content }}{% if step.status != 'pending' %} \u2014 _{{ step.status }}_{% endif %}
{% if step.success_criteria -%}
   - Verify: {{ step.success_criteria }}
{% endif -%}
{% if step.verify_command -%}
   - Command: \`{{ step.verify_command }}\`
{% endif %}

{% endfor -%}
{% else -%}
1. <!-- Actionable step -->
2. 
{% endif -%}
`;
  }
});

// toolSet/planning/plan-sync.ts
function syncPlanFileFromTodoContents(conversationId, todos) {
  const items = todos.map((todo) => ({
    content: typeof todo.content === "string" ? todo.content.trim() : "",
    status: todo.status ?? "pending"
  })).filter((todo) => todo.content.length > 0);
  if (items.length === 0) {
    return { ok: false, error: "No todo steps to sync to the plan file." };
  }
  const storageOptions = planModeStorageOptionsFromEnv(conversationId);
  const storage = resolvePlanModeStorage(conversationId, storageOptions);
  if (!storage) {
    return { ok: false, error: "No plan storage for this conversation." };
  }
  const list = replaceTodos(items);
  writePlanModeTodoList(conversationId, list, storageOptions);
  return { ok: true, planFilePath: storage.planFile.displayPath };
}
var init_plan_sync = __esm({
  "toolSet/planning/plan-sync.ts"() {
    init_todos();
    init_plan_mode_storage_impl();
    init_plan_mode_template();
  }
});

// toolSet/planning/plan-utils.ts
function seedTodosFromPlan(planPath) {
  const conversationId = getConversationIdFromEnv();
  if (!conversationId) return { seeded: 0 };
  return seedTodosFromPlanMarkdown(
    conversationId,
    planPath,
    planModeStorageOptionsFromEnv(conversationId)
  );
}
var init_plan_utils = __esm({
  "toolSet/planning/plan-utils.ts"() {
    init_plan_mode_storage_impl();
    init_sandbox_paths();
  }
});

// src/shared/agent/explore-manifest.ts
var EXPLORE_MANIFEST_VERSION;
var init_explore_manifest = __esm({
  "src/shared/agent/explore-manifest.ts"() {
    EXPLORE_MANIFEST_VERSION = 1;
  }
});

// src/main/agent/expr/thread-tagger.ts
var init_thread_tagger = __esm({
  "src/main/agent/expr/thread-tagger.ts"() {
  }
});

// src/main/agent/expr/context-overflow-guard.ts
var log5, READ_FILE_PRUNE_PREVIEW_CHARS;
var init_context_overflow_guard = __esm({
  "src/main/agent/expr/context-overflow-guard.ts"() {
    init_logger();
    init_thread_tagger();
    log5 = createLogger("agent.expr.context-overflow-guard");
    READ_FILE_PRUNE_PREVIEW_CHARS = 500;
  }
});

// src/main/agent/run/run-scope.ts
function getCurrentAgentRunScope() {
  return agentRunScopeStorage.getStore();
}
var import_node_async_hooks2, agentRunScopeStorage;
var init_run_scope = __esm({
  "src/main/agent/run/run-scope.ts"() {
    import_node_async_hooks2 = require("node:async_hooks");
    agentRunScopeStorage = new import_node_async_hooks2.AsyncLocalStorage();
  }
});

// src/main/agent/run/flow-scoped-ids.ts
function randomShortId(length = SHORT_RUN_ID_LENGTH) {
  return (0, import_node_crypto.randomBytes)(Math.ceil(length / 2)).toString("hex").slice(0, length);
}
function parseScopedId(scoped) {
  const i = scoped.indexOf(SCOPED_ID_SEP);
  if (i < 0) return { local: scoped };
  return {
    flowId: scoped.slice(0, i),
    local: scoped.slice(i + SCOPED_ID_SEP.length)
  };
}
function toolLoopSandboxScopeFromStepKey(stepKeyOrScope) {
  const trimmed = stepKeyOrScope.trim();
  if (!trimmed) return trimmed;
  return parseScopedId(trimmed).local || trimmed;
}
function toolLoopFilesystemScopeFromStepKey(stepKeyOrScope) {
  const local = toolLoopSandboxScopeFromStepKey(stepKeyOrScope);
  if (!local) return local;
  return local.split(":").filter(Boolean).join("/");
}
var import_node_crypto, SCOPED_ID_SEP, SHORT_RUN_ID_LENGTH;
var init_flow_scoped_ids = __esm({
  "src/main/agent/run/flow-scoped-ids.ts"() {
    import_node_crypto = require("node:crypto");
    init_run_scope();
    SCOPED_ID_SEP = "::";
    SHORT_RUN_ID_LENGTH = 8;
  }
});

// src/main/agent/sandbox/tool-loop-output.ts
function getSandboxOutputScopeFromEnv() {
  const g = globalThis;
  const fromGlobal = g[SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY];
  if (typeof fromGlobal === "string" && fromGlobal.trim()) {
    return fromGlobal.trim();
  }
  return process.env[OTTER_AGENT_SANDBOX_OUTPUT_SCOPE_ENV]?.trim() || void 0;
}
function toolLoopOutputRelBase(scopeOrStepKey) {
  const pathScope = toolLoopFilesystemScopeFromStepKey(scopeOrStepKey);
  if (!pathScope) {
    return (0, import_path6.join)("output", TOOL_LOOP_OUTPUT_SEGMENT);
  }
  const segments = pathScope.split(/[/\\]+/).filter(Boolean);
  const instanceSegments = segments[0] === TOOL_LOOP_OUTPUT_SEGMENT ? segments.slice(1) : segments;
  return (0, import_path6.join)("output", TOOL_LOOP_OUTPUT_SEGMENT, ...instanceSegments);
}
function getOutputResultsRelPrefix(scope) {
  const active = scope?.trim() || getSandboxOutputScopeFromEnv();
  if (active) {
    return (0, import_path6.join)(toolLoopOutputRelBase(active), "results");
  }
  return (0, import_path6.join)("output", "results");
}
function getOutputScriptsRelPrefix(scope) {
  const active = scope?.trim() || getSandboxOutputScopeFromEnv();
  if (active) {
    return (0, import_path6.join)(toolLoopOutputRelBase(active), "scripts");
  }
  return (0, import_path6.join)("output", "scripts");
}
function remapLegacyPlanRelativePath(userPath) {
  const stripped = userPath.trim().replace(/^[/\\]+/, "");
  const seg = stripped.split(/[/\\]+/).filter(Boolean);
  if (seg.length >= 2 && seg[0] === "output" && seg[1] === "plans") {
    return (0, import_path6.join)("plans", ...seg.slice(2));
  }
  return stripped;
}
function remapLegacySharedOutputPath(userPath) {
  const stripped = remapLegacyPlanRelativePath(userPath);
  const seg = stripped.split(/[/\\]+/).filter(Boolean);
  if (seg.length >= 2 && seg[0] === "output" && seg[1] === "results") {
    return (0, import_path6.join)(getOutputResultsRelPrefix(), ...seg.slice(2));
  }
  if (seg.length >= 2 && seg[0] === "output" && seg[1] === "scripts") {
    return (0, import_path6.join)(getOutputScriptsRelPrefix(), ...seg.slice(2));
  }
  return stripped;
}
var import_path6, OTTER_AGENT_SANDBOX_OUTPUT_SCOPE_ENV, SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY, TOOL_LOOP_OUTPUT_SEGMENT;
var init_tool_loop_output = __esm({
  "src/main/agent/sandbox/tool-loop-output.ts"() {
    import_path6 = require("path");
    init_flow_scoped_ids();
    OTTER_AGENT_SANDBOX_OUTPUT_SCOPE_ENV = "OTTER_AGENT_SANDBOX_OUTPUT_SCOPE";
    SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY = "__OTTER_AGENT_SANDBOX_OUTPUT_SCOPE__";
    TOOL_LOOP_OUTPUT_SEGMENT = "toolLoop";
  }
});

// src/main/agent/sandbox/run-context.ts
function setAgentRunSandboxRootImpl(root) {
  const scope = getCurrentAgentRunScope();
  if (!scope) return;
  scope.sandboxRoot = root?.trim() || void 0;
}
function getAgentRunSandboxRootImpl() {
  const fromScope = getCurrentAgentRunScope()?.sandboxRoot?.trim();
  if (fromScope) return fromScope;
  const g = globalThis;
  const fromGlobal = g[SANDBOX_ROOT_GLOBAL_KEY];
  if (typeof fromGlobal === "string" && fromGlobal.trim()) {
    return fromGlobal.trim();
  }
  return process.env[OTTER_AGENT_SANDBOX_ROOT_ENV]?.trim() || void 0;
}
function setAgentRunSandboxOutputScopeImpl(scope) {
  const trimmed = scope?.trim() || void 0;
  const runScope = getCurrentAgentRunScope();
  if (!runScope) return;
  runScope.sandboxOutputScope = trimmed;
}
function getAgentRunSandboxOutputScopeImpl() {
  const fromScope = getCurrentAgentRunScope()?.sandboxOutputScope?.trim();
  if (fromScope) return fromScope;
  const g = globalThis;
  const fromGlobal = g[SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY];
  if (typeof fromGlobal === "string" && fromGlobal.trim()) {
    return fromGlobal.trim();
  }
  return process.env[OTTER_AGENT_SANDBOX_OUTPUT_SCOPE_ENV]?.trim() || void 0;
}
function setAgentRunWorkspacePathImpl(workspacePath) {
  const scope = getCurrentAgentRunScope();
  if (!scope) return;
  scope.workspacePath = workspacePath?.trim() || void 0;
}
function getAgentRunWorkspacePathImpl() {
  const fromScope = getCurrentAgentRunScope()?.workspacePath?.trim();
  if (fromScope) return fromScope;
  const g = globalThis;
  const fromGlobal = g[WORKSPACE_PATH_GLOBAL_KEY];
  if (typeof fromGlobal === "string" && fromGlobal.trim()) {
    return fromGlobal.trim();
  }
  return process.env[OTTER_AGENT_WORKSPACE_PATH_ENV]?.trim() || void 0;
}
var OTTER_AGENT_SANDBOX_ROOT_ENV, SANDBOX_ROOT_GLOBAL_KEY, OTTER_AGENT_WORKSPACE_PATH_ENV, WORKSPACE_PATH_GLOBAL_KEY, OTTER_AGENT_CONVERSATION_ID_ENV, CONVERSATION_ID_GLOBAL_KEY, log6, setAgentRunSandboxRoot, getAgentRunSandboxRoot, setAgentRunSandboxOutputScope, getAgentRunSandboxOutputScope, clearAgentRunSandboxOutputScope, setAgentRunWorkspacePath, getAgentRunWorkspacePath, clearAgentRunWorkspacePath;
var init_run_context = __esm({
  "src/main/agent/sandbox/run-context.ts"() {
    init_logger();
    init_tool_loop_output();
    init_run_scope();
    OTTER_AGENT_SANDBOX_ROOT_ENV = "OTTER_AGENT_SANDBOX_ROOT";
    SANDBOX_ROOT_GLOBAL_KEY = "__OTTER_AGENT_SANDBOX_ROOT__";
    OTTER_AGENT_WORKSPACE_PATH_ENV = "OTTER_AGENT_WORKSPACE_PATH";
    WORKSPACE_PATH_GLOBAL_KEY = "__OTTER_AGENT_WORKSPACE_PATH__";
    OTTER_AGENT_CONVERSATION_ID_ENV = "OTTER_AGENT_CONVERSATION_ID";
    CONVERSATION_ID_GLOBAL_KEY = "__OTTER_AGENT_CONVERSATION_ID__";
    log6 = createLogger("sandbox.run-context");
    setAgentRunSandboxRoot = traceFunction2(
      log6,
      "setAgentRunSandboxRoot",
      setAgentRunSandboxRootImpl
    );
    getAgentRunSandboxRoot = traceFunction2(
      log6,
      "getAgentRunSandboxRoot",
      getAgentRunSandboxRootImpl
    );
    setAgentRunSandboxOutputScope = traceFunction2(
      log6,
      "setAgentRunSandboxOutputScope",
      setAgentRunSandboxOutputScopeImpl
    );
    getAgentRunSandboxOutputScope = traceFunction2(
      log6,
      "getAgentRunSandboxOutputScope",
      getAgentRunSandboxOutputScopeImpl
    );
    clearAgentRunSandboxOutputScope = traceFunction2(
      log6,
      "clearAgentRunSandboxOutputScope",
      () => setAgentRunSandboxOutputScopeImpl(void 0)
    );
    setAgentRunWorkspacePath = traceFunction2(
      log6,
      "setAgentRunWorkspacePath",
      setAgentRunWorkspacePathImpl
    );
    getAgentRunWorkspacePath = traceFunction2(
      log6,
      "getAgentRunWorkspacePath",
      getAgentRunWorkspacePathImpl
    );
    clearAgentRunWorkspacePath = traceFunction2(
      log6,
      "clearAgentRunWorkspacePath",
      () => setAgentRunWorkspacePathImpl(void 0)
    );
  }
});

// src/main/agent/sandbox/paths.ts
function getSandboxRootFromEnv() {
  const g = globalThis;
  const fromGlobal = g[SANDBOX_ROOT_GLOBAL_KEY];
  if (typeof fromGlobal === "string" && fromGlobal.trim()) {
    return fromGlobal.trim();
  }
  return process.env[OTTER_AGENT_SANDBOX_ROOT_ENV]?.trim() || void 0;
}
function resolvePathForContainment(filePath) {
  const abs = import_path7.default.resolve(filePath);
  let current = abs;
  const tail = [];
  for (; ; ) {
    try {
      const real = (0, import_fs7.realpathSync)(current);
      return tail.length > 0 ? import_path7.default.join(real, ...tail) : real;
    } catch {
      const parent = import_path7.default.dirname(current);
      if (parent === current) return abs;
      tail.unshift(import_path7.default.basename(current));
      current = parent;
    }
  }
}
function isPathInsideSandbox(sandboxRoot, absPath) {
  const root = resolvePathForContainment(sandboxRoot);
  const target = resolvePathForContainment(absPath);
  const rel = import_path7.default.relative(root, target);
  return rel === "" || !rel.startsWith("..") && !import_path7.default.isAbsolute(rel);
}
function isPathInsideWorkspace(workspacePath, absPath) {
  return isPathInsideSandbox(workspacePath, absPath);
}
function isSandboxArtifactRelativePath(userPath) {
  const remapped = remapLegacySharedOutputPath(userPath.trim());
  const seg = remapped.replace(/^[/\\]+/, "").split(/[/\\]+/).filter(Boolean);
  if (seg.length === 0) return false;
  const head = seg[0];
  return head === "output" || head === "plans" || head === "refs" || head === "skills" || head === "scripts";
}
function isPseudoAbsoluteProjectPath(userPath) {
  const trimmed = userPath.trim();
  if (!import_path7.default.isAbsolute(trimmed)) return false;
  const normalized = trimmed.replace(/\\/g, "/");
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return false;
  if (/^\/(?:Users|home|tmp|var|private|opt|Volumes|Applications|etc|usr|System)(?:\/|$)/i.test(
    normalized
  )) {
    return false;
  }
  return true;
}
function normalizeWorkspaceRelativePath(workspacePath, userPath) {
  const trimmed = userPath.trim();
  if (!trimmed) return trimmed;
  if (import_path7.default.isAbsolute(trimmed) && !isPseudoAbsoluteProjectPath(trimmed)) {
    return trimmed;
  }
  const relativePart = isPseudoAbsoluteProjectPath(trimmed) ? trimmed.replace(/^[/\\]+/, "") : trimmed.replace(/^[/\\]+/, "");
  const wsBase = import_path7.default.basename(import_path7.default.resolve(workspacePath));
  const segments = relativePart.split(/[/\\]+/).filter(Boolean);
  if (segments.length >= 1 && wsBase && segments[0] === wsBase) {
    const rest = segments.slice(1).join("/");
    return rest || ".";
  }
  return relativePart;
}
function resolveRelativeInsideRoot(root, userPath) {
  const base = import_path7.default.resolve(root);
  const trimmed = userPath.trim();
  if (!trimmed) {
    throw new Error("Empty path");
  }
  if (trimmed === "." || trimmed === "./") {
    return base;
  }
  const stripped = trimmed.replace(/^[/\\]+/, "");
  const segments = stripped.split(/[/\\]+/).filter(Boolean);
  if (segments.length === 0) {
    return base;
  }
  const resolved = import_path7.default.normalize(import_path7.default.resolve(base, ...segments));
  const rel = import_path7.default.relative(base, resolved);
  if (rel.startsWith("..") || import_path7.default.isAbsolute(rel)) {
    throw new Error(`Path escapes root: ${userPath}`);
  }
  return resolved;
}
function resolveSandboxRelativePath(sandboxRoot, userPath) {
  return resolveRelativeInsideRoot(sandboxRoot, userPath);
}
function resolvePathMustBeInside(sandboxRoot, userPath) {
  const trimmed = userPath.trim();
  if (!trimmed) {
    throw new Error("Empty path");
  }
  if (import_path7.default.isAbsolute(trimmed)) {
    const abs = import_path7.default.normalize(import_path7.default.resolve(trimmed));
    if (!isPathInsideSandbox(sandboxRoot, abs)) {
      throw new Error(
        `Path must be inside the sandbox: ${userPath}`
      );
    }
    return abs;
  }
  if (isSandboxArtifactRelativePath(trimmed)) {
    return resolveSandboxRelativePath(
      sandboxRoot,
      remapLegacySharedOutputPath(trimmed)
    );
  }
  return resolveSandboxRelativePath(sandboxRoot, trimmed);
}
function getConversationIdFromEnv() {
  const g = globalThis;
  const fromGlobal = g[CONVERSATION_ID_GLOBAL_KEY];
  if (typeof fromGlobal === "string" && fromGlobal.trim()) {
    return fromGlobal.trim();
  }
  return process.env[OTTER_AGENT_CONVERSATION_ID_ENV]?.trim() || void 0;
}
function resolvePathInContext(sandboxRoot, workspacePath, userPath) {
  const trimmed = userPath.trim();
  if (!trimmed) {
    throw new Error("Empty path");
  }
  const ws = workspacePath?.trim() || null;
  if (import_path7.default.isAbsolute(trimmed)) {
    const abs = import_path7.default.normalize(import_path7.default.resolve(trimmed));
    if (ws && isPathInsideWorkspace(ws, abs)) return abs;
    if (isPathInsideSandbox(sandboxRoot, abs)) return abs;
    if (ws && isPseudoAbsoluteProjectPath(trimmed)) {
      return resolveRelativeInsideRoot(
        ws,
        normalizeWorkspaceRelativePath(ws, trimmed)
      );
    }
    throw new Error(formatPathInContextError(userPath, sandboxRoot, ws));
  }
  if (isSandboxArtifactRelativePath(trimmed)) {
    return resolvePathMustBeInside(
      sandboxRoot,
      remapLegacySharedOutputPath(trimmed)
    );
  }
  if (ws) {
    return resolveRelativeInsideRoot(
      ws,
      normalizeWorkspaceRelativePath(ws, trimmed)
    );
  }
  return resolvePathMustBeInside(sandboxRoot, trimmed);
}
function resolveScopedPathInContext(sandboxRoot, workspacePath, userPath) {
  return resolvePathInContext(sandboxRoot, workspacePath, userPath);
}
function formatPathInContextError(userPath, sandboxRoot, workspacePath) {
  if (!workspacePath?.trim()) {
    if (import_path7.default.isAbsolute(userPath.trim())) {
      return `Path must be inside the sandbox or user workspace: ${userPath}. No workspace folder is bound for this conversation \u2014 the user must pick the project folder (folder icon in the composer) while the agent is idle, then retry with a workspace-relative path (e.g. src/foo.py) or the same absolute path.`;
    }
    return `Path must be inside the sandbox or user workspace: ${userPath}. No workspace folder is set; pick a project folder in the composer or use sandbox paths like output/.`;
  }
  return `Path must be inside the sandbox or user workspace: ${userPath}. Workspace root: ${workspacePath.trim()}. Use a path under that folder (relative or absolute).`;
}
var import_fs7, import_path7;
var init_paths = __esm({
  "src/main/agent/sandbox/paths.ts"() {
    import_fs7 = require("fs");
    import_path7 = __toESM(require("path"));
    init_run_context();
    init_tool_loop_output();
  }
});

// src/main/agent/expr/tool-input-normalize.ts
function normalizeToolPathForKey(userPath, ctx) {
  const trimmed = userPath.trim();
  if (!trimmed) return "";
  const sandboxRoot = ctx.sandboxRoot?.trim();
  if (!sandboxRoot) return trimmed.replace(/\\/g, "/");
  try {
    return resolveScopedPathInContext(
      sandboxRoot,
      ctx.workspacePath,
      trimmed
    );
  } catch {
    return trimmed.replace(/\\/g, "/");
  }
}
function normalizeToolInputForDedupeKey(toolName, input, ctx) {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }
  const raw = input;
  switch (toolName) {
    case "read_file": {
      const path2 = typeof raw.path === "string" ? raw.path : "";
      return {
        path: normalizeToolPathForKey(path2, ctx),
        offset: typeof raw.offset === "number" ? raw.offset : READ_FILE_DEFAULT_OFFSET,
        limit: typeof raw.limit === "number" ? raw.limit : READ_FILE_DEFAULT_LIMIT,
        encoding: typeof raw.encoding === "string" ? raw.encoding : READ_FILE_DEFAULT_ENCODING
      };
    }
    case "grep_files": {
      const path2 = typeof raw.path === "string" ? raw.path : ".";
      return {
        pattern: raw.pattern,
        path: normalizeToolPathForKey(path2, ctx),
        include: raw.include ?? void 0
      };
    }
    case "glob_files": {
      const path2 = typeof raw.path === "string" ? raw.path : ".";
      return {
        pattern: raw.pattern,
        path: normalizeToolPathForKey(path2, ctx)
      };
    }
    default:
      return input;
  }
}
var READ_FILE_DEFAULT_OFFSET, READ_FILE_DEFAULT_LIMIT, READ_FILE_DEFAULT_ENCODING;
var init_tool_input_normalize = __esm({
  "src/main/agent/expr/tool-input-normalize.ts"() {
    init_paths();
    READ_FILE_DEFAULT_OFFSET = 1;
    READ_FILE_DEFAULT_LIMIT = 2e3;
    READ_FILE_DEFAULT_ENCODING = "utf8";
  }
});

// src/shared/agent/agentic-run-labels.ts
var init_agentic_run_labels = __esm({
  "src/shared/agent/agentic-run-labels.ts"() {
  }
});

// src/main/agent/constants/step-ids.ts
var TOOL_LOOP_STEP_ID;
var init_step_ids = __esm({
  "src/main/agent/constants/step-ids.ts"() {
    init_agentic_run_labels();
    init_agentic_run_labels();
    TOOL_LOOP_STEP_ID = "toolLoop";
  }
});

// src/shared/agent/workspace.ts
var init_workspace = __esm({
  "src/shared/agent/workspace.ts"() {
  }
});

// src/main/agent/workspace/conversation-workspace.ts
function loadConversationWorkspace(conversationId) {
  const id = conversationId.trim();
  if (!id) return null;
  if (cache.has(id)) return cache.get(id) ?? null;
  const row = getConversationStore().getConversationSettings(id);
  const path2 = row?.workspacePath?.trim() || null;
  cache.set(id, path2);
  return path2;
}
function getWorkspacePath(conversationId) {
  const id = conversationId.trim();
  if (!id) return null;
  if (!cache.has(id)) return loadConversationWorkspace(id);
  return cache.get(id) ?? null;
}
var cache;
var init_conversation_workspace = __esm({
  "src/main/agent/workspace/conversation-workspace.ts"() {
    init_workspace();
    init_conversation_store();
    cache = /* @__PURE__ */ new Map();
  }
});

// src/main/agent/coding/explore-manifest.ts
function parsePathFromInputSummary(summary) {
  const m = summary.match(/(?:^|,\s*)path=([^,]+)/);
  const raw = m?.[1]?.trim();
  return raw || void 0;
}
function parsePatternFromInputSummary(summary) {
  const m = summary.match(/(?:^|,\s*)pattern=([^,]+)/);
  return m?.[1]?.trim() || void 0;
}
function parseQueryFromInputSummary(summary) {
  const m = summary.match(/(?:^|,\s*)query=([^,]+)/);
  return m?.[1]?.trim() || void 0;
}
function htmlToTextSnippet(html, maxChars = READ_FILE_PRUNE_PREVIEW_CHARS) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxChars);
}
function toolOutputSucceeded(output) {
  if (!output) return true;
  if (output.success === false) return false;
  if (typeof output.error === "string" && output.error) return false;
  return true;
}
function resultUrlsFromSearchResults(results, max = 5) {
  if (!Array.isArray(results)) return void 0;
  const urls = [];
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const url = item.url;
    if (typeof url === "string" && url.trim()) urls.push(url.trim());
    if (urls.length >= max) break;
  }
  return urls.length > 0 ? urls : void 0;
}
function snippetFromSearchResults(results) {
  if (!Array.isArray(results) || results.length === 0) return void 0;
  const first = results[0];
  if (!first || typeof first !== "object") return void 0;
  const row = first;
  if (typeof row.snippet === "string" && row.snippet.trim()) {
    return row.snippet.trim().slice(0, READ_FILE_PRUNE_PREVIEW_CHARS);
  }
  if (typeof row.title === "string" && row.title.trim()) {
    return row.title.trim().slice(0, READ_FILE_PRUNE_PREVIEW_CHARS);
  }
  return void 0;
}
function parseToolOutputJson(outputText) {
  const trimmed = outputText.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
  }
  return null;
}
function parseModifiedAtMs(value) {
  if (typeof value !== "string") return void 0;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? void 0 : ms;
}
function resolveExploreSessionStartAt(results) {
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i]?.toolName === ENTER_PLAN_MODE_TOOL_NAME) {
      return results[i]?.createdAt;
    }
  }
  const toolLoop = results.filter((r) => r.stepId === TOOL_LOOP_STEP_ID);
  return toolLoop[0]?.createdAt;
}
function filterExplorePhaseToolResults(results) {
  const sessionStart = resolveExploreSessionStartAt(results);
  return results.filter((r) => {
    if (r.stepId !== TOOL_LOOP_STEP_ID) return false;
    if (sessionStart && r.createdAt < sessionStart) return false;
    if (!MANIFEST_TOOLS.has(r.toolName)) return false;
    if (r.isError) return false;
    return true;
  });
}
function pathContextForConversation(conversationId, sandboxRoot) {
  return {
    sandboxRoot: sandboxRoot?.trim() || void 0,
    workspacePath: getWorkspacePath(conversationId) ?? void 0
  };
}
function readFileCacheKey(path2, offset, limit) {
  return `${path2}\0${offset ?? 1}\0${limit ?? ""}`;
}
function buildExploreManifestFromToolResults(args) {
  const pathCtx = args.pathContext ?? { workspacePath: null };
  const exploreResults = filterExplorePhaseToolResults(args.results);
  const fileByKey = /* @__PURE__ */ new Map();
  const searches = [];
  const resourceByKey = /* @__PURE__ */ new Map();
  for (const record of exploreResults) {
    const output = parseToolOutputJson(record.outputText);
    if (!toolOutputSucceeded(output)) continue;
    const inputPath = parsePathFromInputSummary(record.inputSummary);
    if (record.toolName === "read_file") {
      if (output && typeof output.error === "string" && output.error) continue;
      const rawPath = typeof output?.path === "string" && output.path || inputPath || "";
      if (!rawPath.trim()) continue;
      const normalizedInput = normalizeToolInputForDedupeKey(
        "read_file",
        {
          path: rawPath,
          offset: output?.offset,
          limit: output?.limit
        },
        pathCtx
      );
      const canonicalPath = normalizedInput.path || normalizeToolPathForKey(rawPath, pathCtx);
      const key = readFileCacheKey(
        canonicalPath,
        normalizedInput.offset,
        normalizedInput.limit
      );
      if (output?.isDirectory === true) {
        if (fileByKey.has(key)) continue;
        const entryCount = Array.isArray(output.entries) ? output.entries.length : void 0;
        fileByKey.set(key, {
          path: canonicalPath,
          isDirectory: true,
          ...entryCount != null ? { entryCount } : {}
        });
        continue;
      }
      const content = typeof output?.content === "string" ? output.content : void 0;
      if (!content) continue;
      if (fileByKey.has(key)) continue;
      fileByKey.set(key, {
        path: canonicalPath,
        snippet: content.slice(0, READ_FILE_PRUNE_PREVIEW_CHARS),
        offset: normalizedInput.offset,
        limit: normalizedInput.limit,
        mtimeMs: parseModifiedAtMs(output.modifiedAt)
      });
      continue;
    }
    if (record.toolName === "grep_files" || record.toolName === "glob_files") {
      const pattern = parsePatternFromInputSummary(record.inputSummary) || (typeof output?.pattern === "string" ? output.pattern : void 0);
      if (!pattern) continue;
      const rootRaw = inputPath || ".";
      const root = normalizeToolPathForKey(rootRaw, pathCtx);
      let hitCount;
      if (Array.isArray(output?.matches)) {
        hitCount = output.matches.length;
      } else if (Array.isArray(output?.files)) {
        hitCount = output.files.length;
      } else if (typeof output?.count === "number") {
        hitCount = output.count;
      }
      searches.push({
        tool: record.toolName,
        pattern,
        root,
        ...hitCount != null ? { hitCount } : {}
      });
      continue;
    }
    if (record.toolName === "web_search") {
      const query = typeof output?.query === "string" && output.query || parseQueryFromInputSummary(record.inputSummary);
      if (!query?.trim()) continue;
      const key = `web_search\0${query.trim()}`;
      if (resourceByKey.has(key)) continue;
      resourceByKey.set(key, {
        kind: "web_search",
        query: query.trim(),
        resultCount: typeof output?.resultCount === "number" ? output.resultCount : Array.isArray(output?.results) ? output.results.length : void 0,
        topUrls: resultUrlsFromSearchResults(output?.results),
        snippet: snippetFromSearchResults(output?.results)
      });
      continue;
    }
    if (record.toolName === "web_scrape") {
      const pages = Array.isArray(output?.pages) ? output.pages : [];
      for (const page of pages) {
        if (!page || typeof page !== "object") continue;
        const row = page;
        const url = typeof row.url === "string" ? row.url.trim() : "";
        if (!url) continue;
        const key = `web_scrape\0${url}`;
        if (resourceByKey.has(key)) continue;
        const html = typeof row.html === "string" ? row.html : "";
        resourceByKey.set(key, {
          kind: "web_scrape",
          url,
          title: typeof row.title === "string" ? row.title.trim() : void 0,
          snippet: html ? htmlToTextSnippet(html) : void 0
        });
      }
      continue;
    }
    if (record.toolName === "deep_research") {
      if (output?.listOnly === true) continue;
      const query = typeof output?.query === "string" && output.query || parseQueryFromInputSummary(record.inputSummary);
      if (!query?.trim()) continue;
      const category = typeof output?.category === "string" ? output.category : "";
      const key = `deep_research\0${query.trim()}\0${category}`;
      if (resourceByKey.has(key)) continue;
      resourceByKey.set(key, {
        kind: "deep_research",
        query: query.trim(),
        scopeLabel: typeof output?.scopeLabel === "string" ? output.scopeLabel.trim() : void 0,
        resultCount: typeof output?.resultCount === "number" ? output.resultCount : Array.isArray(output?.results) ? output.results.length : void 0,
        topUrls: resultUrlsFromSearchResults(output?.results),
        snippet: snippetFromSearchResults(output?.results)
      });
    }
  }
  const resources = [...resourceByKey.values()].slice(
    0,
    MAX_MANIFEST_RESOURCE_ENTRIES
  );
  return {
    version: EXPLORE_MANIFEST_VERSION,
    updatedAt: args.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    conversationId: args.conversationId.trim(),
    planSlug: args.planSlug.trim(),
    files: [...fileByKey.values()].slice(0, MAX_MANIFEST_FILE_ENTRIES),
    ...searches.length > 0 ? { searches: searches.slice(0, MAX_MANIFEST_SEARCH_ENTRIES) } : {},
    ...resources.length > 0 ? { resources } : {}
  };
}
function writeExploreManifest(conversationId, manifest, options) {
  const storage = resolvePlanModeStorage(conversationId, options);
  if (!storage) return false;
  ensurePlanModePlansDir(storage.plansDirAbs);
  (0, import_node_fs2.writeFileSync)(
    storage.manifestFile.absolutePath,
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
  return true;
}
function clearExploreManifest(conversationId, options) {
  const storage = resolvePlanModeStorage(conversationId, options);
  if (!storage) return;
  const file = storage.manifestFile.absolutePath;
  if ((0, import_node_fs2.existsSync)(file)) {
    (0, import_node_fs2.unlinkSync)(file);
  }
}
function buildAndPersistExploreManifest(conversationId, planSlug, options) {
  const id = conversationId.trim();
  if (!id || !planSlug.trim()) return null;
  const storage = resolvePlanModeStorage(id, options);
  const pathCtx = pathContextForConversation(id, storage?.sandboxRoot);
  const results = getConversationStore().listToolResults(id, { limit: 500 });
  const manifest = buildExploreManifestFromToolResults({
    conversationId: id,
    planSlug: planSlug.trim(),
    results,
    pathContext: pathCtx
  });
  if (!writeExploreManifest(id, manifest, options)) return null;
  return manifest;
}
var import_node_fs2, MAX_MANIFEST_FILE_ENTRIES, MAX_MANIFEST_SEARCH_ENTRIES, MAX_MANIFEST_RESOURCE_ENTRIES, MANIFEST_TOOLS;
var init_explore_manifest2 = __esm({
  "src/main/agent/coding/explore-manifest.ts"() {
    import_node_fs2 = require("node:fs");
    init_explore_manifest();
    init_conversation_store();
    init_context_overflow_guard();
    init_tool_input_normalize();
    init_step_ids();
    init_planning();
    init_plan_mode_storage_impl();
    init_conversation_workspace();
    MAX_MANIFEST_FILE_ENTRIES = 40;
    MAX_MANIFEST_SEARCH_ENTRIES = 20;
    MAX_MANIFEST_RESOURCE_ENTRIES = 20;
    MANIFEST_TOOLS = /* @__PURE__ */ new Set([
      "read_file",
      "grep_files",
      "glob_files",
      "web_search",
      "web_scrape",
      "deep_research"
    ]);
  }
});

// src/main/agent/run/sub-agent-run-policy.ts
var init_sub_agent_run_policy = __esm({
  "src/main/agent/run/sub-agent-run-policy.ts"() {
  }
});

// src/main/agent/expr/thinking-utils.ts
var init_thinking_utils = __esm({
  "src/main/agent/expr/thinking-utils.ts"() {
    init_plan_mode_state();
    init_sub_agent_run_policy();
    init_step_ids();
  }
});

// src/main/agent/coding/plan-mode-execution-bridge.ts
function hasPersistedPlanTodos(conversationId, options) {
  const id = conversationId?.trim();
  if (!id) return false;
  const list = readPlanModeTodoList(
    id,
    options ?? planModeStorageOptionsFromEnv(id)
  );
  return list.todos.length > 0;
}
var init_plan_mode_execution_bridge = __esm({
  "src/main/agent/coding/plan-mode-execution-bridge.ts"() {
    init_thinking_utils();
    init_plan_mode_session_reminders();
    init_plan_mode_state();
    init_plan_mode_storage_impl();
    init_todos();
  }
});

// src/main/agent/coding/plan-mode-enter-guard.ts
function enterPlanModeBlockedReason(conversationId, options) {
  const id = conversationId?.trim();
  if (!id) return null;
  const storageOptions = options ?? planModeStorageOptionsFromEnv(id);
  if (isPlanModeActive(id)) {
    return "Exploring is already active. Use update_todos to revise the task list, then exit_plan_mode when the plan is ready for approval.";
  }
  if (isPlanExecutionActive(id)) {
    return "Approved plan execution is in progress. Do not call enter_plan_mode \u2014 finish the current task, then reply with a brief summary. Use update_todos to revise the task list if needed.";
  }
  if (hasPersistedPlanTodos(id, storageOptions)) {
    return "A plan already exists in plans/todos.json. Do not call enter_plan_mode again \u2014 use update_todos to revise tasks, or clear explore mode to start over.";
  }
  return null;
}
var init_plan_mode_enter_guard = __esm({
  "src/main/agent/coding/plan-mode-enter-guard.ts"() {
    init_plan_mode_state();
    init_plan_mode_execution_bridge();
  }
});

// toolSet/planning/enter-plan-mode.ts
var import_zod, enterPlanMode;
var init_enter_plan_mode = __esm({
  "toolSet/planning/enter-plan-mode.ts"() {
    import_zod = require("zod");
    init_explore_manifest2();
    init_plan_mode_enter_guard();
    init_plan_mode_state();
    init_sandbox_paths();
    init_constants2();
    enterPlanMode = {
      name: ENTER_PLAN_MODE_TOOL_NAME,
      tags: [...PLANNING_TAG],
      description: "Enter explore mode: read-only exploration until you write a plan and exit for user approval. Creates plans/<slug>.md and plans/todos.json in the conversation sandbox.",
      inputSchema: import_zod.z.object({
        title: import_zod.z.string().optional().describe("Short title for the plan (used in plan filename slug).")
      }),
      needsApproval: true,
      async execute(input) {
        const conversationId = getConversationIdFromEnv();
        if (!conversationId) {
          return { error: "enter_plan_mode requires an active conversation." };
        }
        const storageOptions = planModeStorageOptionsFromEnv(conversationId);
        const blocked = enterPlanModeBlockedReason(conversationId, storageOptions);
        if (blocked) {
          return { error: blocked };
        }
        const parsed = import_zod.z.object({ title: import_zod.z.string().optional() }).safeParse(input);
        const title = parsed.success ? parsed.data.title : void 0;
        planModeFor(conversationId).activatePlanning({
          trigger: "tool:enter_plan_mode"
        });
        clearExploreManifest(conversationId, storageOptions);
        const storage = bootstrapPlanModeStorage(
          conversationId,
          title,
          storageOptions
        );
        if (!storage) {
          return {
            error: "No sandbox available for this conversation; cannot create plan storage."
          };
        }
        return {
          ok: true,
          status: "planning",
          planSlug: storage.planFile.slug,
          planFilePath: storage.planFile.displayPath,
          todosFilePath: storage.todosFile.displayPath,
          message: "Explore mode active. Research read-only, call update_todos (writes plans/todos.json and syncs the plan file), then exit_plan_mode for approval."
        };
      }
    };
  }
});

// toolSet/planning/exit-plan-mode.ts
function planTodoWarnings(todos) {
  const warnings = [];
  for (const [index, todo] of todos.entries()) {
    if (!todo.success_criteria?.trim()) {
      warnings.push(
        `Step ${index + 1} ("${todo.content}") has no success_criteria \u2014 execution will use a generic verifier only.`
      );
    }
  }
  return warnings;
}
var import_node_fs3, import_zod2, exitPlanMode;
var init_exit_plan_mode = __esm({
  "toolSet/planning/exit-plan-mode.ts"() {
    import_node_fs3 = require("node:fs");
    import_zod2 = require("zod");
    init_plan_mode_storage_impl();
    init_plan_mode_state();
    init_todos();
    init_sandbox_paths();
    init_constants2();
    init_plan_utils();
    init_explore_manifest2();
    init_plan_sync();
    exitPlanMode = {
      name: EXIT_PLAN_MODE_TOOL_NAME,
      tags: [...PLANNING_TAG],
      description: "Exit explore mode and request user approval to execute the plan. Requires actionable plan steps or tasks in plans/todos.json.",
      inputSchema: import_zod2.z.object({
        summary: import_zod2.z.string().optional().describe("One-paragraph summary of the plan for the approval prompt.")
      }),
      needsApproval: true,
      async execute(input) {
        const conversationId = getConversationIdFromEnv();
        if (!conversationId) {
          return { error: "exit_plan_mode requires an active conversation." };
        }
        const parsed = import_zod2.z.object({ summary: import_zod2.z.string().optional() }).safeParse(input);
        const summary = parsed.success ? parsed.data.summary?.trim() : void 0;
        const storageOptions = planModeStorageOptionsFromEnv(conversationId);
        const storage = resolvePlanModeStorage(conversationId, storageOptions);
        const existingList = readPlanModeTodoList(conversationId, storageOptions);
        const planExists = storage != null && (0, import_node_fs3.existsSync)(storage.planFile.absolutePath);
        let planContent = "";
        if (planExists && storage) {
          try {
            planContent = (0, import_node_fs3.readFileSync)(storage.planFile.absolutePath, "utf8");
          } catch {
            planContent = "";
          }
        }
        let hasActionableSteps = planContent ? planMarkdownHasActionableSteps(planContent) : false;
        if (!hasActionableSteps && existingList.todos.length > 0) {
          syncPlanFileFromTodoContents(conversationId, existingList.todos);
          if (storage) {
            try {
              planContent = (0, import_node_fs3.readFileSync)(storage.planFile.absolutePath, "utf8");
              hasActionableSteps = planMarkdownHasActionableSteps(planContent);
            } catch {
              hasActionableSteps = false;
            }
          }
        }
        const seed = planExists && storage && hasActionableSteps && existingList.todos.length === 0 ? seedTodosFromPlan(storage.planFile.absolutePath) : { seeded: 0 };
        const finalList = readPlanModeTodoList(conversationId, storageOptions) ?? emptyTodoList();
        const todoCount = finalList.todos.length;
        if (!hasActionableSteps && seed.seeded === 0 && todoCount === 0) {
          return {
            error: "Cannot exit explore mode: call update_todos with plan steps and/or write the plan file under plans/ before exiting."
          };
        }
        planModeFor(conversationId).activateExecution({
          trigger: "tool:exit_plan_mode",
          reason: summary || "Plan ready for execution."
        });
        if (storage?.planFile.slug) {
          buildAndPersistExploreManifest(
            conversationId,
            storage.planFile.slug,
            storageOptions
          );
        }
        const warnings = planTodoWarnings(finalList.todos);
        return {
          ok: true,
          status: "plan_tool_execute",
          planSlug: storage?.planFile.slug,
          planFilePath: storage?.planFile.displayPath,
          todosFilePath: storage?.todosFile.displayPath,
          planMarkdown: planContent || void 0,
          todosSeeded: seed.seeded,
          todos: finalList.todos,
          summary: summarizeTodos(finalList),
          checklist: renderTodoChecklist(finalList),
          ...warnings.length > 0 ? { warnings } : {},
          planSummary: summary || "Plan ready for execution.",
          approvalSummary: summary || "Plan ready for execution.",
          message: "Plan approved. The agent will execute tasks one-by-one from the approved plan."
        };
      }
    };
  }
});

// toolSet/planning/index.ts
var init_planning = __esm({
  "toolSet/planning/index.ts"() {
    init_constants2();
    init_plan_file_guard();
    init_plan_sync();
    init_plan_utils();
    init_enter_plan_mode();
    init_exit_plan_mode();
    init_enter_plan_mode();
    init_exit_plan_mode();
  }
});

// toolSet/sub-agents/constants.ts
var SUB_AGENT_TAG, INVOKE_AGENT_TOOL_NAME, INVOKE_AGENTS_TOOL_NAME, WAIT_FOR_SUB_AGENT_RUNS_TOOL_NAME, SUB_AGENT_TOOL_NAMES, UNIVERSAL_SUB_AGENT_TOOL_NAMES;
var init_constants3 = __esm({
  "toolSet/sub-agents/constants.ts"() {
    SUB_AGENT_TAG = ["sub-agents"];
    INVOKE_AGENT_TOOL_NAME = "invoke_agent";
    INVOKE_AGENTS_TOOL_NAME = "invoke_agents";
    WAIT_FOR_SUB_AGENT_RUNS_TOOL_NAME = "wait_for_sub_agent_runs";
    SUB_AGENT_TOOL_NAMES = /* @__PURE__ */ new Set([
      INVOKE_AGENT_TOOL_NAME,
      INVOKE_AGENTS_TOOL_NAME,
      WAIT_FOR_SUB_AGENT_RUNS_TOOL_NAME
    ]);
    UNIVERSAL_SUB_AGENT_TOOL_NAMES = SUB_AGENT_TOOL_NAMES;
  }
});

// toolSet/sub-agents/delegation-context.ts
function delegationStack() {
  const g = globalThis;
  let stack = g[SUB_AGENT_DELEGATION_STACK_KEY];
  if (!stack) {
    stack = [];
    g[SUB_AGENT_DELEGATION_STACK_KEY] = stack;
  }
  return stack;
}
function getSubAgentDelegation() {
  const stack = delegationStack();
  return stack[stack.length - 1];
}
function requireSubAgentDelegation() {
  const ctx = getSubAgentDelegation();
  if (!ctx) {
    throw new Error("Sub-agent tools require an active agent run context");
  }
  return ctx;
}
function assertRootSubAgentDelegation() {
  const ctx = requireSubAgentDelegation();
  const depth = ctx.parentRun?.meta?.depth;
  if (typeof depth === "number" && depth > 0) {
    throw new Error("Sub-agent delegation is only available on the root agent run");
  }
  return ctx;
}
function isSubAgentIdAllowed(requestedId, resolvedId, allowList) {
  if (!allowList?.length) return true;
  const allowed = new Set(allowList);
  return allowed.has(requestedId) || allowed.has(resolvedId);
}
function buildSubAgentChildParams(delegation, input) {
  const agentId = input.agentId.trim();
  const task = input.task.trim() || delegation.getLatestUserMessageContent?.().trim() || "Complete the delegated task.";
  return {
    agentId,
    parentOpts: delegation.opts ?? {},
    task,
    allowedToolNames: input.allowedToolNames
  };
}
async function resolveSubAgentTargetIdFromDelegation(delegation, agentId) {
  const requestedId = agentId.trim();
  if (!requestedId) {
    throw new Error("Sub-agent invocation requires agentId");
  }
  if (delegation.resolveSubAgentTargetId) {
    return delegation.resolveSubAgentTargetId(requestedId);
  }
  return requestedId;
}
var SUB_AGENT_DELEGATION_STACK_KEY;
var init_delegation_context = __esm({
  "toolSet/sub-agents/delegation-context.ts"() {
    SUB_AGENT_DELEGATION_STACK_KEY = "__openfdeSubAgentDelegationStack";
  }
});

// src/main/agent/config/constants.ts
var AGENT_DEFAULTS, AGENT_ERRORS, ENGINE_LOG;
var init_constants4 = __esm({
  "src/main/agent/config/constants.ts"() {
    AGENT_DEFAULTS = {
      USER_ID: "default",
      RESPONSE_LANGUAGE: "English"
    };
    AGENT_ERRORS = {
      NOT_FOUND: "Agent not found: {agentId}"
    };
    ENGINE_LOG = {
      PERSIST_USER_OK: "Persisted incoming user message on main process",
      PERSIST_USER_FAIL: "Failed to persist incoming user message",
      PERSIST_SANDBOX_FAIL: "Failed to persist sandbox run",
      STOP_REQUESTED: "Stop requested for in-flight agent execution",
      ABORTED: "Agent execution aborted",
      EXECUTION_ABORTED: "Agent execution aborted because agent was not found",
      PREPARED_CONTEXT: "Prepared execution context",
      COMPLETED: "Agent execution completed",
      FAILED: "Agent execution failed",
      PERSIST_ASSISTANT_OK: "Persisted assistant message after execution",
      PERSIST_ASSISTANT_FAIL: "Failed to persist assistant message after execution",
      MEMORY_RECORD_ENQUEUED: "Enqueued agent memory abstraction",
      MEMORY_RECORD_OK: "Recorded agent memory exchange",
      MEMORY_RECORD_FAIL: "Failed to record agent memory exchange",
      SANDBOX_READY: "Sandbox ready for agent execution",
      SANDBOX_RESULT: "Sandbox result written for agent execution"
    };
  }
});

// src/main/agent/constants/agent-prompts.ts
function buildResponseLanguageInstruction(language) {
  return RESPONSE_LANGUAGE_LLM.TEMPLATE.replace(/\{language\}/g, language);
}
var RESPONSE_LANGUAGE_LLM, TOOL_PROMPT_LLM;
var init_agent_prompts = __esm({
  "src/main/agent/constants/agent-prompts.ts"() {
    RESPONSE_LANGUAGE_LLM = {
      TEMPLATE: "Respond in {language}. Keep all user-facing output in {language} unless the user explicitly asks for another language or a translation."
    };
    TOOL_PROMPT_LLM = {
      OS_LINE: "Operating system: {os}. Use OS-appropriate commands and paths.",
      APPROVAL_LINE: "Approval required: {required}."
    };
  }
});

// src/main/agent/llm-constants.ts
var init_llm_constants2 = __esm({
  "src/main/agent/llm-constants.ts"() {
    init_agent_prompts();
  }
});

// src/main/agent/config/config.ts
function buildToolPromptDescriptionImpl(toolMeta) {
  const promptNotes = [toolMeta.description];
  if (toolMeta.os) {
    promptNotes.push(
      TOOL_PROMPT_LLM.OS_LINE.replace("{os}", toolMeta.os)
    );
  }
  const approvalRequired = toolMeta.needsApproval ?? false;
  promptNotes.push(
    TOOL_PROMPT_LLM.APPROVAL_LINE.replace(
      "{required}",
      approvalRequired ? "true" : "false"
    )
  );
  return promptNotes.join("\n");
}
function withResponseLanguageInstructionImpl(prompt, responseLanguage = DEFAULT_RESPONSE_LANGUAGE) {
  const normalizedPrompt = (prompt ?? "").trim();
  const normalizedLanguage = responseLanguage.trim() || DEFAULT_RESPONSE_LANGUAGE;
  const languageInstruction = buildResponseLanguageInstruction(
    normalizedLanguage
  );
  if (!normalizedPrompt) return languageInstruction;
  if (normalizedPrompt.includes(languageInstruction)) return normalizedPrompt;
  return `${normalizedPrompt}

${languageInstruction}`;
}
function normalizeBaseURLImpl(url, fallback) {
  const value = url.trim();
  if (!value) return fallback;
  return value.replace(/\/$/, "");
}
function todoStatusIconImpl(status) {
  switch (status) {
    case "pending":
      return "\u23F3";
    case "in-progress":
      return "\u{1F504}";
    case "completed":
      return "\u2705";
    case "failed":
      return "\u274C";
    default:
      return "\u2022";
  }
}
var log7, DEFAULT_RESPONSE_LANGUAGE, DEFAULT_USER_ID, ANTHROPIC_MODELS, SYSTEM_PROP_KEYS, buildToolPromptDescription, withResponseLanguageInstruction, normalizeBaseURL, todoStatusIcon;
var init_config = __esm({
  "src/main/agent/config/config.ts"() {
    init_logger();
    init_constants4();
    init_llm_constants2();
    log7 = createLogger("agent.config");
    DEFAULT_RESPONSE_LANGUAGE = AGENT_DEFAULTS.RESPONSE_LANGUAGE;
    DEFAULT_USER_ID = AGENT_DEFAULTS.USER_ID;
    ANTHROPIC_MODELS = [
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-3-5-sonnet-latest",
      "claude-3-5-haiku-latest",
      "claude-haiku-4-5-latest"
    ];
    SYSTEM_PROP_KEYS = {
      ollamaBaseURL: "settings.ollama.baseUrl",
      llamacppBaseURL: "settings.llamacpp.baseUrl",
      llamacppApiKey: "settings.llamacpp.apiKey",
      anthropicApiKey: "settings.anthropic.apiKey",
      anthropicBaseURL: "settings.anthropic.baseUrl",
      openaiApiKey: "settings.openai.apiKey",
      openaiBaseURL: "settings.openai.baseUrl",
      geminiApiKey: "settings.gemini.apiKey",
      geminiBaseURL: "settings.gemini.baseUrl",
      deepseekApiKey: "settings.deepseek.apiKey",
      deepseekApiUrl: "settings.deepseek.baseUrl",
      zhipuApiKey: "settings.zhipu.apiKey",
      zhipuBaseURL: "settings.zhipu.baseUrl"
    };
    buildToolPromptDescription = traceFunction2(
      log7,
      "buildToolPromptDescription",
      buildToolPromptDescriptionImpl
    );
    withResponseLanguageInstruction = traceFunction2(
      log7,
      "withResponseLanguageInstruction",
      withResponseLanguageInstructionImpl
    );
    normalizeBaseURL = traceFunction2(
      log7,
      "normalizeBaseURL",
      normalizeBaseURLImpl
    );
    todoStatusIcon = traceFunction2(
      log7,
      "todoStatusIcon",
      todoStatusIconImpl
    );
  }
});

// src/shared/constants.ts
var RUN_SCRIPT_TOOLS;
var init_constants5 = __esm({
  "src/shared/constants.ts"() {
    RUN_SCRIPT_TOOLS = {
      LEGACY: "run_script",
      CONTENT: "run_script",
      FILE: "run_script_file"
    };
  }
});

// src/shared/agent/tool-selection.ts
function isSplitRunScriptTool(toolName) {
  switch (toolName) {
    case RUN_SCRIPT_TOOLS.CONTENT:
    case RUN_SCRIPT_TOOLS.FILE:
      return true;
    default:
      return false;
  }
}
function hasToolEnabledWithLegacySupport(selectedNames, toolName) {
  return selectedNames.has(toolName) || selectedNames.has(RUN_SCRIPT_LEGACY_TOOL) && isSplitRunScriptTool(toolName);
}
function expandRunScriptApprovalOverrides(overrides) {
  const next = { ...overrides };
  const legacy = overrides[RUN_SCRIPT_LEGACY_TOOL];
  if (typeof legacy === "boolean") {
    next.run_script ??= legacy;
    next.run_script_file ??= legacy;
  }
  return next;
}
function filterToolsByAvailableSet(tools, options) {
  if (!options.availableSetTouched) {
    return tools.map((tool) => tool.name);
  }
  return tools.filter(
    (tool) => isMandatoryTool(tool.name) || hasToolEnabledWithLegacySupport(options.selectedNames, tool.name)
  ).map((tool) => tool.name);
}
function reconcileAvailableSetWithCatalog(catalogTools, options) {
  if (!options.availableSetTouched) {
    return catalogTools.map((tool) => tool.name);
  }
  const catalogNames = new Set(catalogTools.map((tool) => tool.name));
  const saved = (options.savedAvailableSet ?? []).filter(
    (name) => catalogNames.has(name)
  );
  return withMandatoryToolsInCatalog(
    catalogTools,
    filterToolsByAvailableSet(catalogTools, {
      availableSetTouched: true,
      selectedNames: new Set(saved)
    })
  );
}
function defaultEnabledNamesWithSkillActions(catalogTools, validAllowed, skillActionToolNames) {
  const catalogNames = new Set(catalogTools.map((tool) => tool.name));
  const selected = new Set(validAllowed);
  for (const name of skillActionToolNames ?? []) {
    const trimmed = name.trim();
    if (trimmed && catalogNames.has(trimmed)) {
      selected.add(trimmed);
    }
  }
  for (const name of catalogTools.map((tool) => tool.name)) {
    if (isMandatoryTool(name)) selected.add(name);
  }
  return selected;
}
function resolveSkillAvailableSet(catalogTools, options) {
  if (options.availableSetTouched) {
    return {
      availableSet: withMandatoryToolsInCatalog(
        catalogTools,
        reconcileAvailableSetWithCatalog(catalogTools, {
          availableSetTouched: true,
          savedAvailableSet: options.savedAvailableSet
        })
      ),
      availableSetTouched: true
    };
  }
  const skillAllowed = (options.skillAllowedTools ?? []).map((name) => name.trim().replace(/^`|`$/g, "")).filter(Boolean);
  if (skillAllowed.length > 0) {
    const catalogNames = new Set(catalogTools.map((tool) => tool.name));
    const validAllowed = skillAllowed.filter((name) => catalogNames.has(name));
    const fullCatalog = catalogTools.map((tool) => tool.name);
    const saved = options.savedAvailableSet ?? [];
    const savedIsFullCatalog = saved.length > 0 && saved.length === fullCatalog.length && fullCatalog.every((name) => saved.includes(name));
    if (savedIsFullCatalog) {
      return {
        availableSet: fullCatalog,
        availableSetTouched: false
      };
    }
    return {
      availableSet: filterToolsByAvailableSet(catalogTools, {
        availableSetTouched: true,
        selectedNames: defaultEnabledNamesWithSkillActions(
          catalogTools,
          validAllowed,
          options.skillActionToolNames
        )
      }),
      availableSetTouched: true
    };
  }
  return {
    availableSet: reconcileAvailableSetWithCatalog(catalogTools, {
      availableSetTouched: false,
      savedAvailableSet: options.savedAvailableSet
    }),
    availableSetTouched: false
  };
}
var RUN_SCRIPT_LEGACY_TOOL;
var init_tool_selection = __esm({
  "src/shared/agent/tool-selection.ts"() {
    init_constants5();
    init_mandatory_tools();
    RUN_SCRIPT_LEGACY_TOOL = RUN_SCRIPT_TOOLS.LEGACY;
  }
});

// src/shared/agent/skill-workspace-tool-defaults.ts
function defaultToolsetTagsForSkill(skillId) {
  if (skillId === "github") {
    return [...DEFAULT_SKILL_TOOLSET_TAGS, "github"];
  }
  return DEFAULT_SKILL_TOOLSET_TAGS;
}
function toolNamesMatchingTags(catalogTools, tags) {
  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));
  return catalogTools.filter(
    (tool) => (tool.tags ?? []).some((tag) => tagSet.has(tag.toLowerCase()))
  ).map((tool) => tool.name);
}
function expandSkillAllowedToolsForCatalog(skillId, globalTools, allowedTools) {
  const allowed = (allowedTools ?? []).map((name) => name.trim().replace(/^`|`$/g, "")).filter(Boolean);
  if (allowed.length === 0) return void 0;
  const defaults = toolNamesMatchingTags(
    globalTools,
    defaultToolsetTagsForSkill(skillId)
  );
  return [.../* @__PURE__ */ new Set([...allowed, ...defaults])];
}
function expandSkillWorkspaceAvailableSet(skillId, catalogTools, availableSet) {
  const workspaceNames = toolNamesMatchingTags(
    catalogTools,
    defaultToolsetTagsForSkill(skillId)
  );
  return [.../* @__PURE__ */ new Set([...availableSet, ...workspaceNames])];
}
function resolveSkillWorkspaceApprovalOverrides(skillId, catalogTools, enabledToolNames) {
  const enabled = new Set(enabledToolNames);
  const tags = new Set(defaultToolsetTagsForSkill(skillId));
  const overrides = {};
  for (const tool of catalogTools) {
    if (!enabled.has(tool.name)) continue;
    if (!(tool.tags ?? []).some((tag) => tags.has(tag))) continue;
    overrides[tool.name] = false;
  }
  return overrides;
}
function mergeSkillWorkspaceApprovalOverrides(skillId, catalogTools, enabledToolNames, savedOverrides) {
  const saved = savedOverrides ?? {};
  const defaults = resolveSkillWorkspaceApprovalOverrides(
    skillId,
    catalogTools,
    enabledToolNames
  );
  return { ...defaults, ...saved };
}
var DEFAULT_SKILL_TOOLSET_TAGS;
var init_skill_workspace_tool_defaults = __esm({
  "src/shared/agent/skill-workspace-tool-defaults.ts"() {
    DEFAULT_SKILL_TOOLSET_TAGS = [
      "file-system",
      "git",
      "workspace"
    ];
  }
});

// src/shared/agent/skill-sub-agent-tool-defaults.ts
function toolNamesMatchingTags2(catalogTools, tags) {
  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));
  return catalogTools.filter(
    (tool) => (tool.tags ?? []).some((tag) => tagSet.has(tag.toLowerCase()))
  ).map((tool) => tool.name);
}
function expandSkillSubAgentAvailableSet(catalogTools, availableSet) {
  const subAgentNames = toolNamesMatchingTags2(catalogTools, SUB_AGENT_TOOL_TAGS);
  return [.../* @__PURE__ */ new Set([...availableSet, ...subAgentNames])];
}
function resolveSkillSubAgentApprovalOverrides(catalogTools, enabledToolNames) {
  const enabled = new Set(enabledToolNames);
  const tags = new Set(SUB_AGENT_TOOL_TAGS.map((tag) => tag.toLowerCase()));
  const overrides = {};
  for (const tool of catalogTools) {
    if (!enabled.has(tool.name)) continue;
    if (!(tool.tags ?? []).some((tag) => tags.has(tag.toLowerCase()))) continue;
    overrides[tool.name] = false;
  }
  return overrides;
}
function mergeSkillSubAgentApprovalOverrides(catalogTools, enabledToolNames, savedOverrides) {
  const saved = savedOverrides ?? {};
  const defaults = resolveSkillSubAgentApprovalOverrides(
    catalogTools,
    enabledToolNames
  );
  return { ...defaults, ...saved };
}
var SUB_AGENT_TOOL_TAGS;
var init_skill_sub_agent_tool_defaults = __esm({
  "src/shared/agent/skill-sub-agent-tool-defaults.ts"() {
    SUB_AGENT_TOOL_TAGS = ["sub-agents"];
  }
});

// src/shared/agent/tool-loop.ts
function clampToolLoopMaxIterations(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_TOOL_LOOP_MAX_ITERATIONS;
  }
  return Math.max(
    MIN_TOOL_LOOP_MAX_ITERATIONS,
    Math.min(MAX_TOOL_LOOP_MAX_ITERATIONS, Math.floor(value))
  );
}
function resolveToolLoopMaxIterations(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampToolLoopMaxIterations(value);
  }
  return DEFAULT_TOOL_LOOP_MAX_ITERATIONS;
}
var DEFAULT_TOOL_LOOP_MAX_ITERATIONS, MIN_TOOL_LOOP_MAX_ITERATIONS, MAX_TOOL_LOOP_MAX_ITERATIONS, DEFAULT_TODO_MAX_RETRIES;
var init_tool_loop = __esm({
  "src/shared/agent/tool-loop.ts"() {
    DEFAULT_TOOL_LOOP_MAX_ITERATIONS = 25;
    MIN_TOOL_LOOP_MAX_ITERATIONS = 1;
    MAX_TOOL_LOOP_MAX_ITERATIONS = 100;
    DEFAULT_TODO_MAX_RETRIES = 3;
  }
});

// src/shared/agent/execution-steps.ts
function normalizeExecutionSteps(agent) {
  const existing = agent.executionSteps;
  const tools = agent.availableSkillTools ?? existing?.toolLoop?.tools ?? [];
  const maxIterations = resolveToolLoopMaxIterations(
    agent.toolLoopMaxIterations ?? existing?.toolLoop?.maxIterations
  );
  const thinking = (existing?.thinking ?? "").trim();
  const skills = (agent.skillsPrompt ?? "").trim() || (existing?.skills ?? "").trim();
  const validation = (existing?.validation ?? []).filter((r) => r.trim().length > 0);
  const hasContent = thinking.length > 0 || skills.length > 0 || validation.length > 0 || tools.length > 0;
  if (!hasContent) return void 0;
  return {
    thinking: thinking || void 0,
    skills: skills || void 0,
    validation: validation.length > 0 ? validation : void 0,
    toolLoop: tools.length > 0 ? {
      tools,
      maxIterations
    } : agent.toolLoopMaxIterations != null ? {
      tools: [],
      maxIterations
    } : void 0
  };
}
var init_execution_steps = __esm({
  "src/shared/agent/execution-steps.ts"() {
    init_tool_loop();
  }
});

// src/shared/agent/sub-agent-settings.ts
function resolveAllowAsSubAgent(value) {
  return value !== false;
}
function resolveAllowSubAgents(value) {
  return value !== false;
}
function stepsHaveContent(steps) {
  return Boolean(
    steps.planning?.trim() || steps.skills?.trim() || steps.summary?.trim() || steps.report?.trim() || (steps.toolLoop?.tools?.length ?? 0) > 0 || steps.toolLoop?.allowSubAgents || steps.toolLoop?.maxIterations != null
  );
}
function applySubAgentSettingsToExecutionSteps(agent) {
  const steps = { ...agent.executionSteps ?? {} };
  const prevToolLoop = steps.toolLoop ?? {};
  const tools = prevToolLoop.tools ?? agent.availableSkillTools ?? [];
  const maxIterations = resolveToolLoopMaxIterations(
    agent.toolLoopMaxIterations ?? prevToolLoop.maxIterations
  );
  if (agent.allowSubAgents === false) {
    const { allowSubAgents: _a, subAgentIds: _s, ...rest } = prevToolLoop;
    if (Object.keys(rest).length > 0 || tools.length > 0) {
      steps.toolLoop = { ...rest, tools, maxIterations };
    } else {
      delete steps.toolLoop;
    }
    agent.executionSteps = stepsHaveContent(steps) ? steps : void 0;
    return;
  }
  steps.toolLoop = {
    ...prevToolLoop,
    tools,
    maxIterations,
    allowSubAgents: true,
    ...agent.subAgentIds && agent.subAgentIds.length > 0 ? { subAgentIds: [...new Set(agent.subAgentIds)] } : {}
  };
  agent.executionSteps = stepsHaveContent(steps) ? steps : void 0;
}
var DEFAULT_ALLOW_AS_SUB_AGENT, DEFAULT_ALLOW_SUB_AGENTS;
var init_sub_agent_settings = __esm({
  "src/shared/agent/sub-agent-settings.ts"() {
    init_tool_loop();
    DEFAULT_ALLOW_AS_SUB_AGENT = true;
    DEFAULT_ALLOW_SUB_AGENTS = true;
  }
});

// src/shared/agent/coding-agent-pipeline.ts
function applyCodingDirectToolLoopPolicy(_agent) {
}
var init_coding_agent_pipeline = __esm({
  "src/shared/agent/coding-agent-pipeline.ts"() {
  }
});

// src/shared/agent/skill-prompts.ts
function resolveSkillStepPrompt(saved, fromSkill, fromExecutionSteps) {
  const savedTrim = (saved ?? "").trim();
  if (savedTrim.length > 0) return savedTrim;
  const skillTrim = (fromSkill ?? "").trim();
  if (skillTrim.length > 0) return skillTrim;
  return (fromExecutionSteps ?? "").trim();
}
function resolveCompiledSkillPrompts(skill, _compiled, saved) {
  const fromDisk = resolveSkillAgentPrompts(skill, void 0);
  return {
    skillsPrompt: resolveSkillStepPrompt(saved?.skillsPrompt, fromDisk.skillsPrompt),
    systemPrompt: (skill.systemPrompt ?? "").trim()
  };
}
function resolveSkillAgentPrompts(skill, saved) {
  const steps = skill.executionSteps;
  const skillsPrompt = resolveSkillStepPrompt(
    saved?.skillsPrompt,
    skill.skillsPrompt,
    steps?.skills
  );
  return {
    skillsPrompt,
    systemPrompt: (skill.systemPrompt ?? "").trim()
  };
}
function resolveSkillAgentConfiguration(skill, saved, compiled) {
  return compiled ? resolveCompiledSkillPrompts(skill, compiled, saved) : resolveSkillAgentPrompts(skill, saved);
}
var init_skill_prompts = __esm({
  "src/shared/agent/skill-prompts.ts"() {
  }
});

// src/main/agent/config/catalog.ts
function buildStageLlmSettings(provider, model, saved) {
  return parseAgentStageLlmSettings({
    provider,
    model,
    routingMode: saved?.llmRoutingMode,
    stageLlmJson: saved ? serializeStageLlmOverrides(saved.stageLlm) : void 0
  });
}
function mergeSkillAgentWithStoredConfig(skillAgent, saved) {
  const availableSkillTools = skillAgent.executionSteps?.toolLoop?.tools ?? [];
  let { availableSet, availableSetTouched } = resolveSkillAvailableSet(
    availableSkillTools,
    {
      skillAllowedTools: skillAgent.allowedTools,
      skillActionToolNames: skillAgent.actionToolNames,
      savedAvailableSet: saved?.availableSet,
      availableSetTouched: !!saved?.availableSetTouched
    }
  );
  if (skillAgent.skillId && !saved?.availableSetTouched) {
    availableSet = expandSkillWorkspaceAvailableSet(
      skillAgent.skillId,
      availableSkillTools,
      availableSet
    );
  }
  if (!saved?.availableSetTouched) {
    availableSet = expandSkillSubAgentAvailableSet(
      availableSkillTools,
      availableSet
    );
  }
  const resolved = resolveSkillAgentConfiguration(
    skillAgent,
    saved,
    skillAgent.compiledArtifact
  );
  const merged = {
    id: skillAgent.id,
    name: saved?.name ?? skillAgent.name,
    description: saved?.description ?? skillAgent.description,
    model: saved?.model ?? skillAgent.model,
    systemPrompt: resolved.systemPrompt,
    responseLanguage: void 0,
    provider: saved?.provider ?? skillAgent.provider,
    isSkill: true,
    skillId: skillAgent.skillId,
    availableSkillTools,
    availableSet,
    availableSetTouched,
    toolNeedsApprovalOverrides: expandRunScriptApprovalOverrides(
      mergeSkillSubAgentApprovalOverrides(
        availableSkillTools,
        availableSet,
        mergeSkillWorkspaceApprovalOverrides(
          skillAgent.skillId,
          availableSkillTools,
          availableSet,
          saved?.toolNeedsApprovalOverrides
        )
      )
    ),
    availableMcpServers: saved?.availableMcpServers ?? void 0,
    skillsPrompt: resolved.skillsPrompt,
    toolLoopMaxIterations: saved?.toolLoopMaxIterations ?? skillAgent.executionSteps?.toolLoop?.maxIterations,
    todoMaxRetries: saved?.todoMaxRetries ?? DEFAULT_TODO_MAX_RETRIES,
    executionSteps: skillAgent.executionSteps,
    allowAsSubAgent: resolveAllowAsSubAgent(saved?.allowAsSubAgent),
    allowSubAgents: resolveAllowSubAgents(saved?.allowSubAgents),
    subAgentIds: saved?.subAgentIds ?? null,
    compiledArtifact: skillAgent.compiledArtifact,
    compilationStatus: skillAgent.compilationStatus,
    stageLlmSettings: buildStageLlmSettings(
      saved?.provider ?? skillAgent.provider,
      saved?.model ?? skillAgent.model,
      saved
    )
  };
  merged.executionSteps = normalizeExecutionSteps(merged);
  if (skillAgent.compiledArtifact?.thinking.instructions.trim()) {
    merged.executionSteps = {
      ...merged.executionSteps,
      thinking: skillAgent.compiledArtifact.thinking.instructions.trim()
    };
  }
  applyCodingDirectToolLoopPolicy(merged);
  applySubAgentSettingsToExecutionSteps(merged);
  return merged;
}
function storedConfigToCustomAgent(config) {
  const custom = {
    id: config.agentId,
    name: config.name,
    description: config.description,
    model: config.model,
    systemPrompt: config.systemPrompt,
    provider: config.provider,
    isSkill: false,
    availableSkillTools: [],
    availableSet: [...config.availableSet ?? []],
    availableSetTouched: !!config.availableSetTouched,
    toolNeedsApprovalOverrides: config.toolNeedsApprovalOverrides ?? {},
    availableMcpServers: config.availableMcpServers ?? void 0,
    skillsPrompt: config.skillsPrompt,
    toolLoopMaxIterations: config.toolLoopMaxIterations,
    todoMaxRetries: config.todoMaxRetries,
    allowAsSubAgent: resolveAllowAsSubAgent(config.allowAsSubAgent),
    allowSubAgents: resolveAllowSubAgents(config.allowSubAgents),
    subAgentIds: config.subAgentIds ?? null,
    stageLlmSettings: buildStageLlmSettings(
      config.provider,
      config.model,
      config
    )
  };
  custom.executionSteps = normalizeExecutionSteps(custom);
  applySubAgentSettingsToExecutionSteps(custom);
  return custom;
}
async function loadEngineAgentsFromDisk(userId) {
  const skills = await loadSkills();
  const skillAgents = skills.map(skillToAgent);
  const storedConfigs = getConversationStore().listAgentConfigurations(userId);
  const configByAgentId = new Map(storedConfigs.map((c) => [c.agentId, c]));
  const skillAgentIds = new Set(skillAgents.map((s) => s.id));
  const store = getConversationStore();
  const mergedSkillAgents = skillAgents.map((skillAgent) => {
    const saved = configByAgentId.get(skillAgent.id);
    const merged = mergeSkillAgentWithStoredConfig(skillAgent, saved);
    if (!saved) {
      store.upsertAgentConfiguration({
        agentId: merged.id,
        userId,
        name: merged.name,
        description: merged.description,
        model: merged.model,
        provider: merged.provider,
        color: skillAgent.color,
        enabled: skillAgent.enabled,
        systemPrompt: merged.systemPrompt,
        skillsPrompt: "",
        availableSet: [...merged.availableSet ?? []],
        availableSetTouched: merged.availableSetTouched,
        toolNeedsApprovalOverrides: merged.toolNeedsApprovalOverrides,
        availableMcpServers: merged.availableMcpServers ?? null,
        toolLoopMaxIterations: merged.toolLoopMaxIterations ?? DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
        todoMaxRetries: merged.todoMaxRetries ?? DEFAULT_TODO_MAX_RETRIES,
        allowAsSubAgent: merged.allowAsSubAgent ?? DEFAULT_ALLOW_AS_SUB_AGENT,
        allowSubAgents: merged.allowSubAgents ?? DEFAULT_ALLOW_SUB_AGENTS,
        subAgentIds: merged.subAgentIds ?? null
      });
    }
    return merged;
  });
  const customAgents = storedConfigs.filter((c) => !skillAgentIds.has(c.agentId)).map(storedConfigToCustomAgent);
  return [...customAgents, ...mergedSkillAgents];
}
async function loadEngineAgents(userId) {
  const cached = appCache.getAgents(userId);
  if (cached) return cached;
  const agents = await loadEngineAgentsFromDisk(userId);
  appCache.setAgents(userId, agents);
  return agents;
}
var init_catalog = __esm({
  "src/main/agent/config/catalog.ts"() {
    init_conversation_store();
    init_app_cache();
    init_tool_selection();
    init_skill_workspace_tool_defaults();
    init_skill_sub_agent_tool_defaults();
    init_execution_steps();
    init_sub_agent_settings();
    init_tool_loop();
    init_coding_agent_pipeline();
    init_skill_prompts();
    init_skills();
    init_stage_llm_settings();
  }
});

// src/main/agent/config/context.ts
var ConfigContext;
var init_context = __esm({
  "src/main/agent/config/context.ts"() {
    init_constants4();
    init_config();
    init_catalog();
    init_catalog();
    ConfigContext = class {
      constructor(getResponseLanguage = () => void 0) {
        this.getResponseLanguage = getResponseLanguage;
      }
      static {
        this.DEFAULTS = AGENT_DEFAULTS;
      }
      static {
        this.ERRORS = AGENT_ERRORS;
      }
      static {
        this.ENGINE_LOG = ENGINE_LOG;
      }
      static {
        this.DEFAULT_USER_ID = DEFAULT_USER_ID;
      }
      static {
        this.DEFAULT_RESPONSE_LANGUAGE = DEFAULT_RESPONSE_LANGUAGE;
      }
      static {
        this.ANTHROPIC_MODELS = ANTHROPIC_MODELS;
      }
      static {
        this.SYSTEM_PROP_KEYS = SYSTEM_PROP_KEYS;
      }
      static {
        this.loadEngineAgents = loadEngineAgents;
      }
      withResponseLanguageInstruction(prompt, responseLanguage) {
        const lang = responseLanguage?.trim() || this.getResponseLanguage()?.trim() || DEFAULT_RESPONSE_LANGUAGE;
        return withResponseLanguageInstruction(prompt, lang);
      }
      buildToolPromptDescription(toolMeta) {
        return buildToolPromptDescription(toolMeta);
      }
      todoStatusIcon(status) {
        return todoStatusIcon(status);
      }
      normalizeBaseURL(url, fallback) {
        return normalizeBaseURL(url, fallback);
      }
    };
  }
});

// src/openfde-ai/mcp.ts
var import_mcp, import_mcp_stdio;
var init_mcp = __esm({
  "src/openfde-ai/mcp.ts"() {
    import_mcp = require("@ai-sdk/mcp");
    import_mcp_stdio = require("@ai-sdk/mcp/mcp-stdio");
  }
});

// src/shared/mcp/filesystem-mcp-paths.ts
function isReferenceFilesystemMcpServer(server) {
  return server.id === REFERENCE_MCP_FILESYSTEM_ID;
}
function resolveFilesystemMcpAllowedPaths(input) {
  const paths = [];
  const seen = /* @__PURE__ */ new Set();
  const sandbox = input.sandboxRoot?.trim();
  if (sandbox) {
    seen.add(sandbox);
    paths.push(sandbox);
  }
  const workspace = input.workspacePath?.trim();
  if (workspace && !seen.has(workspace)) {
    paths.push(workspace);
  }
  return paths;
}
function buildFilesystemMcpArgs(allowedPaths) {
  return [...FILESYSTEM_MCP_BASE_ARGS, ...allowedPaths];
}
var REFERENCE_MCP_FILESYSTEM_ID, FILESYSTEM_MCP_BASE_ARGS;
var init_filesystem_mcp_paths = __esm({
  "src/shared/mcp/filesystem-mcp-paths.ts"() {
    REFERENCE_MCP_FILESYSTEM_ID = "ref-mcp-filesystem";
    FILESYSTEM_MCP_BASE_ARGS = [
      "-y",
      "@modelcontextprotocol/server-filesystem"
    ];
  }
});

// src/main/services/mcp-server-runtime.ts
function resolveFilesystemSandboxRoot(conversationId) {
  const trimmed = conversationId?.trim();
  if (trimmed) {
    return resolvePlanSandboxRoot(trimmed) ?? stableSandboxRootForConversation(trimmed);
  }
  return stableSandboxRootForConversation(FILESYSTEM_PREVIEW_CONVERSATION_ID);
}
function ensureAccessibleDirectories(paths) {
  for (const dir of paths) {
    (0, import_node_fs4.mkdirSync)(dir, { recursive: true });
  }
}
function resolveRuntimeMcpServer(server, context) {
  if (!isReferenceFilesystemMcpServer(server)) {
    return server;
  }
  const conversationId = context?.conversationId?.trim();
  const sandboxRoot = resolveFilesystemSandboxRoot(conversationId);
  const workspacePath = conversationId ? getWorkspacePath(conversationId) : null;
  const allowedPaths = resolveFilesystemMcpAllowedPaths({
    sandboxRoot,
    workspacePath
  });
  if (allowedPaths.length === 0) {
    throw new Error(
      `Filesystem MCP server "${server.name}" requires at least one allowed directory.`
    );
  }
  ensureAccessibleDirectories(allowedPaths);
  return {
    ...server,
    args: buildFilesystemMcpArgs(allowedPaths)
  };
}
var import_node_fs4, FILESYSTEM_PREVIEW_CONVERSATION_ID;
var init_mcp_server_runtime = __esm({
  "src/main/services/mcp-server-runtime.ts"() {
    import_node_fs4 = require("node:fs");
    init_plan_mode_storage_impl();
    init_conversation_workspace();
    init_filesystem_mcp_paths();
    FILESYSTEM_PREVIEW_CONVERSATION_ID = "__mcp-filesystem-preview__";
  }
});

// src/main/services/mcp-server-manager.ts
function getMcpServerManager() {
  if (!_manager) {
    _manager = instrumentInstanceMethods2(new McpServerManager(), log8);
  }
  return _manager;
}
var log8, McpServerManager, _manager;
var init_mcp_server_manager = __esm({
  "src/main/services/mcp-server-manager.ts"() {
    init_mcp();
    init_logger();
    init_mcp_server_runtime();
    log8 = createLogger("services.mcp-server-manager");
    McpServerManager = class {
      constructor() {
        this.clients = /* @__PURE__ */ new Map();
      }
      fingerprint(server) {
        return JSON.stringify({
          transportType: server.transportType,
          url: server.url,
          command: server.command,
          args: server.args,
          env: server.env,
          headers: server.headers
        });
      }
      async createClient(server) {
        if (server.transportType === "stdio") {
          if (!server.command.trim()) {
            throw new Error(`MCP server ${server.name} is missing command`);
          }
          return (0, import_mcp.createMCPClient)({
            transport: new import_mcp_stdio.Experimental_StdioMCPTransport({
              command: server.command,
              args: server.args,
              env: Object.keys(server.env).length > 0 ? server.env : void 0
            })
          });
        }
        if (!server.url.trim()) {
          throw new Error(`MCP server ${server.name} is missing URL`);
        }
        return (0, import_mcp.createMCPClient)({
          transport: {
            type: server.transportType,
            url: server.url,
            headers: Object.keys(server.headers).length > 0 ? server.headers : void 0
          }
        });
      }
      async getClient(server, context) {
        const runtimeServer = resolveRuntimeMcpServer(server, context);
        const nextFingerprint = this.fingerprint(runtimeServer);
        const cached = this.clients.get(server.id);
        if (cached && cached.fingerprint === nextFingerprint) {
          return cached.client;
        }
        if (cached) {
          await cached.client.close().catch(() => void 0);
          this.clients.delete(server.id);
        }
        const client = await this.createClient(runtimeServer);
        this.clients.set(server.id, {
          fingerprint: nextFingerprint,
          client
        });
        return client;
      }
      async listTools(server, context) {
        const client = await this.getClient(server, context);
        const result = await client.listTools();
        return (result.tools ?? []).map((tool) => ({
          name: tool.name,
          description: tool.description?.trim() || tool.name,
          inputSchema: tool.inputSchema
        }));
      }
      async callTool(server, toolName, input, context) {
        const client = await this.getClient(server, context);
        const tools = await client.tools();
        const targetTool = tools[toolName];
        if (!targetTool) {
          throw new Error(`MCP tool not found: ${toolName}`);
        }
        return targetTool.execute(input, {
          messages: [],
          toolCallId: `${server.id}:${toolName}:${Date.now()}`
        });
      }
      async closeClient(serverId) {
        const cached = this.clients.get(serverId);
        if (!cached) return;
        this.clients.delete(serverId);
        await cached.client.close().catch(() => void 0);
      }
      async closeAll() {
        const entries = [...this.clients.entries()];
        this.clients.clear();
        await Promise.all(
          entries.map(([, cached]) => cached.client.close().catch(() => void 0))
        );
      }
    };
    _manager = null;
  }
});

// src/main/agent/utils/structured-content.ts
var init_structured_content = __esm({
  "src/main/agent/utils/structured-content.ts"() {
  }
});

// src/main/agent/expr/thread-context-builder.ts
var log9;
var init_thread_context_builder = __esm({
  "src/main/agent/expr/thread-context-builder.ts"() {
    init_logger();
    init_conversation_store();
    init_thread_tagger();
    log9 = createLogger("agent.expr.thread-context-builder");
  }
});

// src/shared/agent/llamacpp-url.ts
function normalizeLlamaCppBaseURL(url, fallback = LLAMACPP_DEFAULT_BASE_URL) {
  const value = url.trim();
  const base = (value || fallback).replace(/\/$/, "");
  if (base.endsWith("/v1")) return base;
  return `${base}/v1`;
}
var LLAMACPP_DEFAULT_BASE_URL;
var init_llamacpp_url = __esm({
  "src/shared/agent/llamacpp-url.ts"() {
    LLAMACPP_DEFAULT_BASE_URL = "http://127.0.0.1:8080/v1";
  }
});

// src/main/agent/utils/agent-run-context.ts
function loadOpenAiCompatibleCredentials(propValues) {
  const out = {};
  for (const providerId of OPENAI_COMPATIBLE_PROVIDER_IDS) {
    out[providerId] = resolveOpenAiCompatibleCredentials(providerId, propValues);
  }
  return out;
}
function loadAgentRunCredentialsFromDisk() {
  const config = new ConfigContext();
  const propValues = getSystemPropValues([
    ...Object.values(ConfigContext.SYSTEM_PROP_KEYS),
    ...openAiCompatibleProviderConfigKeys()
  ]);
  return {
    ollamaBaseURL: config.normalizeBaseURL(
      propValues[ConfigContext.SYSTEM_PROP_KEYS.ollamaBaseURL] ?? "",
      "http://localhost:11434"
    ),
    llamacppBaseURL: normalizeLlamaCppBaseURL(
      propValues[ConfigContext.SYSTEM_PROP_KEYS.llamacppBaseURL] ?? ""
    ),
    llamacppApiKey: propValues[ConfigContext.SYSTEM_PROP_KEYS.llamacppApiKey] ?? "",
    anthropicApiKey: propValues[ConfigContext.SYSTEM_PROP_KEYS.anthropicApiKey] ?? "",
    anthropicBaseURL: config.normalizeBaseURL(
      propValues[ConfigContext.SYSTEM_PROP_KEYS.anthropicBaseURL] ?? "",
      "https://api.anthropic.com/v1"
    ),
    openaiApiKey: propValues[ConfigContext.SYSTEM_PROP_KEYS.openaiApiKey] ?? "",
    openaiBaseURL: config.normalizeBaseURL(
      propValues[ConfigContext.SYSTEM_PROP_KEYS.openaiBaseURL] ?? "",
      "https://api.openai.com/v1"
    ),
    geminiApiKey: propValues[ConfigContext.SYSTEM_PROP_KEYS.geminiApiKey] ?? "",
    geminiBaseURL: config.normalizeBaseURL(
      propValues[ConfigContext.SYSTEM_PROP_KEYS.geminiBaseURL] ?? "",
      "https://generativelanguage.googleapis.com/v1beta"
    ),
    deepseekApiKey: propValues[ConfigContext.SYSTEM_PROP_KEYS.deepseekApiKey] ?? "",
    deepseekApiUrl: config.normalizeBaseURL(
      propValues[ConfigContext.SYSTEM_PROP_KEYS.deepseekApiUrl] ?? "",
      "https://api.deepseek.com/v1"
    ),
    zhipuApiKey: propValues[ConfigContext.SYSTEM_PROP_KEYS.zhipuApiKey] ?? "",
    zhipuBaseURL: config.normalizeBaseURL(
      propValues[ConfigContext.SYSTEM_PROP_KEYS.zhipuBaseURL] ?? "",
      "https://open.bigmodel.cn/api/paas/v4"
    ),
    openAiCompatible: loadOpenAiCompatibleCredentials(propValues)
  };
}
function loadAgentRunCredentials() {
  const cached = appCache.getCredentials();
  if (cached) return cached;
  const credentials = loadAgentRunCredentialsFromDisk();
  appCache.setCredentials(credentials);
  return credentials;
}
async function loadMcpToolsForAgentFromServers(userId, agent) {
  const allMcpServers = getConversationStore().listMcpServers(userId);
  const enabledServers = allMcpServers.filter((s) => s.enabled);
  const mcpTools = [];
  for (const server of enabledServers) {
    if (agent.availableMcpServers != null && !agent.availableMcpServers.includes(server.id)) {
      continue;
    }
    try {
      const tools = await getMcpServerManager().listTools(server);
      for (const tool of tools) {
        mcpTools.push({
          name: tool.name,
          description: tool.description ?? "",
          inputSchema: tool.inputSchema,
          source: "mcp",
          serverId: server.id,
          toolName: tool.name
        });
      }
    } catch {
    }
  }
  return mcpTools;
}
async function loadMcpToolsForAgent(userId, agent) {
  const cached = appCache.getMcpTools(userId, agent.id);
  if (cached) return cached;
  const tools = await loadMcpToolsForAgentFromServers(userId, agent);
  appCache.setMcpTools(userId, agent.id, tools);
  return tools;
}
function resolveEnabledSkillToolNames(agent) {
  if (agent.availableSetTouched && agent.availableSet != null) {
    return agent.availableSet;
  }
  return void 0;
}
var init_agent_run_context2 = __esm({
  "src/main/agent/utils/agent-run-context.ts"() {
    init_system_prop();
    init_conversation_store();
    init_mcp_server_manager();
    init_context();
    init_structured_content();
    init_thread_context_builder();
    init_app_cache();
    init_llamacpp_url();
    init_llm_provider_registry();
  }
});

// src/shared/agent/sub-agent-context.ts
function mergeContextEnvelopeMessages(envelope) {
  const pipeline = envelope.pipelineMessages ?? [];
  const thread = envelope.messages ?? [];
  const task = envelope.delegationTask.trim();
  const seen = /* @__PURE__ */ new Set();
  const merged = [];
  const workspaceBlock = formatSubAgentWorkspaceContext(envelope.workspacePath);
  if (workspaceBlock) {
    merged.push({ role: "user", content: workspaceBlock });
    seen.add(`user:${workspaceBlock}`);
  }
  for (const msg of [...pipeline, ...thread]) {
    const key = `${msg.role}:${msg.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(msg);
  }
  if (task) {
    merged.push({ role: "user", content: task });
  } else {
    merged.push({
      role: "user",
      content: "Complete the delegated task."
    });
  }
  return merged;
}
function formatSubAgentWorkspaceContext(workspacePath) {
  const ws = workspacePath?.trim();
  if (!ws) return null;
  return [
    "=== USER WORKSPACE (parent conversation) ===",
    `Project root: ${ws}`,
    "Use workspace-relative paths (e.g. src/search.ts) with list_files, read_file, grep_files, and edit_file.",
    'Do not pass an empty path \u2014 use "." for the workspace root or a concrete relative path.',
    "=== END USER WORKSPACE ==="
  ].join("\n");
}
function trimContextMessages(messages, maxMessages = 120) {
  if (messages.length <= maxMessages) return messages;
  const taskMsg = messages.at(-1);
  const head = messages.slice(0, -1);
  const trimmedHead = head.slice(-(maxMessages - 1));
  return taskMsg ? [...trimmedHead, taskMsg] : trimmedHead;
}
var init_sub_agent_context = __esm({
  "src/shared/agent/sub-agent-context.ts"() {
  }
});

// src/shared/agent/workspace-required-skills.ts
function resolveAgentSkillId(agent) {
  const fromField = agent.skillId?.trim();
  if (fromField) return fromField;
  const id = agent.id?.trim();
  if (id?.startsWith("skill:")) return id.slice("skill:".length);
  return null;
}
var init_workspace_required_skills = __esm({
  "src/shared/agent/workspace-required-skills.ts"() {
  }
});

// src/shared/agent/agent-switch-command.ts
function normalizeAgentSwitchTarget(raw) {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().startsWith("skill:")) {
    return trimmed.slice("skill:".length);
  }
  return trimmed;
}
function resolveAgentIdForAgentSwitch(agents, target) {
  const normalized = normalizeAgentSwitchTarget(target).toLowerCase();
  if (!normalized) return null;
  const enabled = agents.filter((agent) => agent.enabled !== false);
  const exactId = enabled.find(
    (agent) => agent.id.trim().toLowerCase() === normalized
  );
  if (exactId) return exactId.id;
  const prefixedId = enabled.find(
    (agent) => agent.id.trim().toLowerCase() === `skill:${normalized}`
  );
  if (prefixedId) return prefixedId.id;
  const bySkillId = enabled.find((agent) => {
    const skillId = resolveAgentSkillId(agent);
    return skillId?.toLowerCase() === normalized;
  });
  if (bySkillId) return bySkillId.id;
  const byName = enabled.find(
    (agent) => agent.name.trim().toLowerCase() === normalized
  );
  if (byName) return byName.id;
  return null;
}
var init_agent_switch_command = __esm({
  "src/shared/agent/agent-switch-command.ts"() {
    init_workspace_required_skills();
  }
});

// src/shared/agent/llm-debug.ts
function parseLlmDebugMode(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}
var LLM_DEBUG_MODE_PROPERTY_KEY;
var init_llm_debug = __esm({
  "src/shared/agent/llm-debug.ts"() {
    LLM_DEBUG_MODE_PROPERTY_KEY = "llm_debug_mode";
  }
});

// src/main/agent/llm/llm-debug-context.ts
var init_llm_debug_context = __esm({
  "src/main/agent/llm/llm-debug-context.ts"() {
  }
});

// src/main/agent/llm/llm-debug-writer.ts
function isLlmDebugEnabled(userId) {
  const id = userId?.trim();
  if (!id) return false;
  const cached = enabledCache.get(id);
  if (cached !== void 0) return cached;
  try {
    const row = getConversationStore().getUserProperty(
      id,
      LLM_DEBUG_MODE_PROPERTY_KEY
    );
    const enabled = parseLlmDebugMode(row?.propertyValue);
    enabledCache.set(id, enabled);
    return enabled;
  } catch {
    return false;
  }
}
function createLlmDebugRunId() {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${randomShortId(4)}`;
}
function slugifyAgentIdForDebug(agentId) {
  const slug = agentId.replace(/^skill:/, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 24);
  return slug || "agent";
}
function createSubAgentLlmDebugRunId(parentRunId, childAgentId, userId) {
  const trimmedParent = parentRunId?.trim();
  if (trimmedParent) {
    return `${trimmedParent}__sub__${slugifyAgentIdForDebug(childAgentId)}__${randomShortId(4)}`;
  }
  if (!isLlmDebugEnabled(userId)) return void 0;
  return `sub__${slugifyAgentIdForDebug(childAgentId)}__${createLlmDebugRunId()}`;
}
var log10, enabledCache;
var init_llm_debug_writer = __esm({
  "src/main/agent/llm/llm-debug-writer.ts"() {
    init_openfde_home();
    init_logger();
    init_conversation_store();
    init_llm_debug();
    init_flow_scoped_ids();
    init_llm_debug_context();
    log10 = createLogger("agent.llm.debug");
    enabledCache = /* @__PURE__ */ new Map();
  }
});

// src/shared/i18n/locale-settings.ts
function isSupportedAppLocale(value) {
  return LOCALE_BY_ID.has(value);
}
function normalizeAppLocale(value, fallback = DEFAULT_APP_LOCALE) {
  const trimmed = value?.trim();
  if (trimmed && isSupportedAppLocale(trimmed)) return trimmed;
  return fallback;
}
function localeToResponseLanguage(locale) {
  return LOCALE_BY_ID.get(locale)?.responseLanguage ?? "English";
}
function resolveAgentResponseLanguage(agentOverride, appLocale) {
  const trimmed = agentOverride?.trim();
  if (trimmed) return trimmed;
  return localeToResponseLanguage(normalizeAppLocale(appLocale));
}
var APP_LOCALE_PROP_KEY, DEFAULT_APP_LOCALE, SUPPORTED_LOCALES, LOCALE_BY_ID;
var init_locale_settings = __esm({
  "src/shared/i18n/locale-settings.ts"() {
    APP_LOCALE_PROP_KEY = "app.ui.locale";
    DEFAULT_APP_LOCALE = "en";
    SUPPORTED_LOCALES = [
      { id: "en", label: "English", responseLanguage: "English" },
      { id: "zh-cn", label: "\u7B80\u4F53\u4E2D\u6587", responseLanguage: "Simplified Chinese" }
    ];
    LOCALE_BY_ID = new Map(
      SUPPORTED_LOCALES.map((entry) => [entry.id, entry])
    );
  }
});

// src/main/i18n/resolve-response-language.ts
function resolveResponseLanguageForAgent(agentOverride) {
  const appLocale = getSystemPropValue(
    APP_LOCALE_PROP_KEY,
    DEFAULT_APP_LOCALE
  );
  return resolveAgentResponseLanguage(agentOverride, appLocale);
}
var init_resolve_response_language = __esm({
  "src/main/i18n/resolve-response-language.ts"() {
    init_system_prop();
    init_locale_settings();
  }
});

// src/openfde-ai/types.ts
var init_types2 = __esm({
  "src/openfde-ai/types.ts"() {
  }
});

// src/openfde-ai/core.ts
var import_ai;
var init_core = __esm({
  "src/openfde-ai/core.ts"() {
    import_ai = require("ai");
  }
});

// src/openfde-ai/providers.ts
var import_anthropic, import_openai, import_google, import_deepseek, import_zhipu_ai_provider, import_ollama_ai_provider_v2, import_moonshotai, import_huggingface, import_alibaba, import_openai_compatible;
var init_providers = __esm({
  "src/openfde-ai/providers.ts"() {
    import_anthropic = require("@ai-sdk/anthropic");
    import_openai = require("@ai-sdk/openai");
    import_google = require("@ai-sdk/google");
    import_deepseek = require("@ai-sdk/deepseek");
    import_zhipu_ai_provider = require("zhipu-ai-provider");
    import_ollama_ai_provider_v2 = require("ollama-ai-provider-v2");
    import_moonshotai = require("@ai-sdk/moonshotai");
    import_huggingface = require("@ai-sdk/huggingface");
    import_alibaba = require("@ai-sdk/alibaba");
    import_openai_compatible = require("@ai-sdk/openai-compatible");
  }
});

// src/openfde-ai/index.ts
var init_openfde_ai = __esm({
  "src/openfde-ai/index.ts"() {
    init_types2();
    init_core();
    init_providers();
  }
});

// src/main/agent/providers/adapters.ts
function openAiCompatibleAdapter(provider, providerName) {
  return instrumentInstanceMethods2(
    new OpenAiCompatibleProviderAdapter(provider, providerName),
    log11.child({ provider })
  );
}
function createModelForProvider(provider, modelId, creds) {
  const adapter = PROVIDER_ADAPTERS[provider];
  if (!adapter) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return adapter.createModel(modelId, creds);
}
var log11, ProviderAdapter, OllamaAdapter, LlamaCppAdapter, OpenAIAdapter, AnthropicAdapter, GeminiAdapter, DeepSeekAdapter, ZhipuAdapter, MoonshotAdapter, QwenAdapter, HuggingFaceAdapter, OpenAiCompatibleProviderAdapter, PROVIDER_ADAPTERS;
var init_adapters = __esm({
  "src/main/agent/providers/adapters.ts"() {
    init_openfde_ai();
    init_logger();
    log11 = createLogger("agent.providers.adapters");
    ProviderAdapter = class {
    };
    OllamaAdapter = class extends ProviderAdapter {
      createModel(modelId, creds) {
        return (0, import_ollama_ai_provider_v2.createOllama)({ baseURL: `${creds.ollamaBaseURL}/api` })(modelId);
      }
    };
    LlamaCppAdapter = class extends ProviderAdapter {
      createModel(modelId, creds) {
        const apiKey = creds.llamacppApiKey?.trim() || "not-needed";
        return (0, import_openai_compatible.createOpenAICompatible)({
          name: "llamacpp",
          apiKey,
          baseURL: creds.llamacppBaseURL
        })(modelId);
      }
    };
    OpenAIAdapter = class extends ProviderAdapter {
      createModel(modelId, creds) {
        return (0, import_openai.createOpenAI)({
          apiKey: creds.openaiApiKey,
          baseURL: creds.openaiBaseURL
        })(modelId);
      }
    };
    AnthropicAdapter = class extends ProviderAdapter {
      createModel(modelId, creds) {
        return (0, import_anthropic.createAnthropic)({
          apiKey: creds.anthropicApiKey,
          baseURL: creds.anthropicBaseURL
        })(modelId);
      }
    };
    GeminiAdapter = class extends ProviderAdapter {
      createModel(modelId, creds) {
        return (0, import_google.createGoogleGenerativeAI)({
          apiKey: creds.geminiApiKey,
          baseURL: creds.geminiBaseURL
        })(modelId);
      }
    };
    DeepSeekAdapter = class extends ProviderAdapter {
      createModel(modelId, creds) {
        return (0, import_deepseek.createDeepSeek)({ apiKey: creds.deepseekApiKey, baseURL: creds.deepseekApiUrl })(modelId);
      }
    };
    ZhipuAdapter = class extends ProviderAdapter {
      createModel(modelId, creds) {
        return (0, import_zhipu_ai_provider.createZhipu)({
          apiKey: creds.zhipuApiKey,
          baseURL: creds.zhipuBaseURL
        })(modelId);
      }
    };
    MoonshotAdapter = class extends ProviderAdapter {
      createModel(modelId, creds) {
        const { apiKey, baseURL } = creds.openAiCompatible.moonshot;
        return (0, import_moonshotai.createMoonshotAI)({ apiKey, baseURL })(modelId);
      }
    };
    QwenAdapter = class extends ProviderAdapter {
      createModel(modelId, creds) {
        const { apiKey, baseURL } = creds.openAiCompatible.qwen;
        return (0, import_alibaba.createAlibaba)({ apiKey, baseURL })(modelId);
      }
    };
    HuggingFaceAdapter = class extends ProviderAdapter {
      createModel(modelId, creds) {
        const { apiKey, baseURL } = creds.openAiCompatible.huggingface;
        return (0, import_huggingface.createHuggingFace)({ apiKey, baseURL })(modelId);
      }
    };
    OpenAiCompatibleProviderAdapter = class extends ProviderAdapter {
      constructor(provider, providerName) {
        super();
        this.provider = provider;
        this.providerName = providerName;
      }
      createModel(modelId, creds) {
        const { apiKey, baseURL } = creds.openAiCompatible[this.provider];
        return (0, import_openai_compatible.createOpenAICompatible)({
          name: this.providerName,
          apiKey: apiKey || "not-needed",
          baseURL
        })(modelId);
      }
    };
    PROVIDER_ADAPTERS = {
      ollama: instrumentInstanceMethods2(new OllamaAdapter(), log11.child({ provider: "ollama" })),
      llamacpp: instrumentInstanceMethods2(
        new LlamaCppAdapter(),
        log11.child({ provider: "llamacpp" })
      ),
      openai: instrumentInstanceMethods2(new OpenAIAdapter(), log11.child({ provider: "openai" })),
      anthropic: instrumentInstanceMethods2(
        new AnthropicAdapter(),
        log11.child({ provider: "anthropic" })
      ),
      gemini: instrumentInstanceMethods2(new GeminiAdapter(), log11.child({ provider: "gemini" })),
      deepseek: instrumentInstanceMethods2(
        new DeepSeekAdapter(),
        log11.child({ provider: "deepseek" })
      ),
      zhipu: instrumentInstanceMethods2(new ZhipuAdapter(), log11.child({ provider: "zhipu" })),
      moonshot: instrumentInstanceMethods2(new MoonshotAdapter(), log11.child({ provider: "moonshot" })),
      qwen: instrumentInstanceMethods2(new QwenAdapter(), log11.child({ provider: "qwen" })),
      bytedance: openAiCompatibleAdapter("bytedance", "bytedance"),
      huggingface: instrumentInstanceMethods2(
        new HuggingFaceAdapter(),
        log11.child({ provider: "huggingface" })
      ),
      "nvidia-nim": openAiCompatibleAdapter("nvidia-nim", "nvidia-nim")
    };
  }
});

// src/main/agent/providers/stage-model-registry.ts
var stage_model_registry_exports = {};
__export(stage_model_registry_exports, {
  StageModelRegistry: () => StageModelRegistry
});
var StageModelRegistry;
var init_stage_model_registry = __esm({
  "src/main/agent/providers/stage-model-registry.ts"() {
    init_stage_llm_settings();
    init_adapters();
    StageModelRegistry = class _StageModelRegistry {
      constructor(settings, creds) {
        this.settings = settings;
        this.creds = creds;
        this.cache = /* @__PURE__ */ new Map();
      }
      static fromOpts(opts) {
        const settings = opts.stageLlm ?? parseAgentStageLlmSettings({
          provider: opts.provider,
          model: opts.model,
          routingMode: "unified"
        });
        return new _StageModelRegistry(settings, opts);
      }
      getChoice(stage) {
        if (stage === "default") return this.settings.default;
        return resolveStageLlmChoice(this.settings, stage);
      }
      getModel(stage) {
        if (!this.cache.has(stage)) {
          const choice = this.getChoice(stage);
          this.cache.set(
            stage,
            createModelForProvider(choice.provider, choice.model, this.creds)
          );
        }
        return this.cache.get(stage);
      }
    };
  }
});

// src/main/agent/run/resolve-child-agent.ts
var resolve_child_agent_exports = {};
__export(resolve_child_agent_exports, {
  buildChildAgentResponseOpts: () => buildChildAgentResponseOpts,
  buildContextEnvelope: () => buildContextEnvelope,
  formatSubFlowStepTitle: () => formatSubFlowStepTitle,
  mergeSubFlowOutputText: () => mergeSubFlowOutputText,
  resolveCatalogAgentId: () => resolveCatalogAgentId,
  resolveChildAgentLlmConfig: () => resolveChildAgentLlmConfig,
  resolveEngineAgent: () => resolveEngineAgent,
  subAgentReportPreview: () => subAgentReportPreview
});
function buildContextEnvelope(parentContext, args) {
  const conversationId = args.conversationId?.trim() || parentContext.opts.conversationId;
  const workspacePath = conversationId ? getWorkspacePath(conversationId) ?? void 0 : void 0;
  return {
    rootRunId: args.rootRunId,
    parentRunId: args.parentRunId,
    conversationId,
    assistantMessageId: args.assistantMessageId?.trim() || parentContext.opts.assistantMessageId,
    messages: [...parentContext.currentMessages],
    pipelineMessages: parentContext.buildPipelineContextMessages({
      thinking: true,
      planning: true,
      execution: true,
      orderedExecution: true,
      summary: true
    }),
    workspacePath: workspacePath ?? void 0,
    delegationTask: args.task.trim()
  };
}
function resolveSeedMessages(params) {
  if (params.contextEnvelope) {
    return trimContextMessages(mergeContextEnvelopeMessages(params.contextEnvelope));
  }
  if (params.contextMessages !== void 0) {
    return trimContextMessages([
      ...params.contextMessages,
      {
        role: "user",
        content: params.task.trim() || "Complete the delegated task."
      }
    ]);
  }
  if (params.parentContext && params.parentRunId && params.rootRunId) {
    const envelope = buildContextEnvelope(params.parentContext, {
      parentRunId: params.parentRunId,
      rootRunId: params.rootRunId,
      task: params.task,
      conversationId: params.parentOpts.conversationId,
      assistantMessageId: params.parentOpts.assistantMessageId
    });
    return trimContextMessages(mergeContextEnvelopeMessages(envelope));
  }
  const thread = params.parentCurrentMessages ?? [];
  return trimContextMessages([
    ...thread,
    {
      role: "user",
      content: params.task.trim() || "Complete the delegated task."
    }
  ]);
}
function resolveCatalogAgentId(agents, agentId) {
  const trimmed = agentId.trim();
  if (!trimmed) return null;
  const exact = agents.find((a) => a.id === trimmed);
  if (exact) return exact.id;
  return resolveAgentIdForAgentSwitch(agents, trimmed);
}
function resolveChildAgentLlmConfig(agent) {
  const provider = agent.provider;
  const model = agent.model;
  const stageLlm = agent.stageLlmSettings ?? parseAgentStageLlmSettings({
    provider,
    model,
    routingMode: "unified"
  });
  return { provider, model, stageLlm };
}
async function resolveEngineAgent(userId, agentId) {
  const agents = await ConfigContext.loadEngineAgents(userId);
  const resolvedId = resolveCatalogAgentId(agents, agentId);
  const agent = resolvedId ? agents.find((a) => a.id === resolvedId) : void 0;
  if (!agent) {
    throw new Error(`Sub-agent not found: ${agentId}`);
  }
  if (agent.allowAsSubAgent === false) {
    throw new Error(`Agent "${agentId}" is not allowed as a sub-agent`);
  }
  return agent;
}
async function buildChildAgentResponseOpts(params) {
  const { agentId, parentOpts, task } = params;
  const seedHistory = resolveSeedMessages(params);
  const agent = await resolveEngineAgent(parentOpts.userId, agentId);
  const { provider, model: childModel, stageLlm } = resolveChildAgentLlmConfig(agent);
  const credentials = loadAgentRunCredentials();
  const mcpTools = await loadMcpToolsForAgent(parentOpts.userId, agent);
  let enabledSkillTools = resolveEnabledSkillToolNames(agent);
  if (params.allowedToolNames && params.allowedToolNames !== "all") {
    const allowed = new Set(params.allowedToolNames);
    enabledSkillTools = enabledSkillTools.filter((name) => allowed.has(name));
  }
  const messages = seedHistory;
  const llmDebugRunId = createSubAgentLlmDebugRunId(
    parentOpts.llmDebugRunId,
    agent.id,
    parentOpts.userId
  );
  const opts = {
    provider,
    model: childModel,
    stageLlm,
    systemPrompt: agent.systemPrompt,
    responseLanguage: resolveResponseLanguageForAgent(
      agent.responseLanguage ?? parentOpts.responseLanguage
    ),
    abortSignal: parentOpts.abortSignal,
    llmDebugRunId,
    messages,
    executionSteps: agent.executionSteps,
    toolLoopMaxIterations: agent.executionSteps?.toolLoop?.maxIterations ?? agent.toolLoopMaxIterations,
    todoMaxRetries: agent.todoMaxRetries,
    skillId: agent.skillId,
    compiledArtifact: agent.compiledArtifact,
    agentId: agent.id,
    availableSet: enabledSkillTools,
    availableSetTouched: !!agent.availableSetTouched,
    toolNeedsApprovalOverrides: agent.toolNeedsApprovalOverrides ?? {},
    mcpTools,
    userId: parentOpts.userId,
    conversationId: parentOpts.conversationId,
    assistantMessageId: parentOpts.assistantMessageId,
    ...credentials,
    onChunk: params.onChunk,
    onUIMessageChunk: params.onUIMessageChunk,
    onStepProgress: params.onStepProgress,
    onSubAgentRunEvent: params.onSubAgentRunEvent ?? parentOpts.onSubAgentRunEvent
  };
  const { StageModelRegistry: StageModelRegistry2 } = await Promise.resolve().then(() => (init_stage_model_registry(), stage_model_registry_exports));
  const stageModels = StageModelRegistry2.fromOpts(opts);
  const model = stageModels.getModel("default");
  return { opts, model, agent };
}
function mergeSubFlowOutputText(stepOutputs, merge = "report") {
  if (merge === "summary" && stepOutputs.summary?.summary?.trim()) {
    return stepOutputs.summary.summary.trim();
  }
  if (merge === "report" && stepOutputs.report?.trim()) {
    return stepOutputs.report.trim();
  }
  const parts = [];
  if (stepOutputs.report?.trim()) parts.push(stepOutputs.report.trim());
  if (stepOutputs.summary?.summary?.trim()) {
    parts.push(stepOutputs.summary.summary.trim());
  }
  if (stepOutputs.toolLoop?.trim()) parts.push(stepOutputs.toolLoop.trim());
  return parts.join("\n\n") || "Sub-agent completed with no report output.";
}
function formatSubFlowStepTitle(agent) {
  return `Sub-agent: ${agent.name.trim() || agent.id}`;
}
function subAgentReportPreview(stepOutputs, maxLen = 240) {
  const text = mergeSubFlowOutputText(stepOutputs, "report");
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}\u2026`;
}
var init_resolve_child_agent = __esm({
  "src/main/agent/run/resolve-child-agent.ts"() {
    init_context();
    init_agent_run_context2();
    init_conversation_workspace();
    init_sub_agent_context();
    init_agent_switch_command();
    init_stage_llm_settings();
    init_llm_debug_writer();
    init_resolve_response_language();
  }
});

// toolSet/sub-agents/invoke-agent.ts
var import_zod3, invokeAgent;
var init_invoke_agent = __esm({
  "toolSet/sub-agents/invoke-agent.ts"() {
    import_zod3 = require("zod");
    init_delegation_context();
    init_constants3();
    invokeAgent = {
      name: INVOKE_AGENT_TOOL_NAME,
      tags: [...SUB_AGENT_TAG],
      description: "Delegate a sub-task to another configured agent. Returns the sub-agent report or summary. Set wait=false to run in parallel and receive a runId; use wait_for_sub_agent_runs to collect results.",
      inputSchema: import_zod3.z.object({
        agentId: import_zod3.z.string().min(1).describe("Catalog agent id to run"),
        task: import_zod3.z.string().min(1).describe("Task for the sub-agent"),
        wait: import_zod3.z.boolean().optional().describe("When false, start in background and return runId immediately")
      }),
      needsApproval: false,
      async execute(input) {
        const parsed = import_zod3.z.object({
          agentId: import_zod3.z.string(),
          task: import_zod3.z.string(),
          wait: import_zod3.z.boolean().optional()
        }).safeParse(input);
        if (!parsed.success) {
          return { error: "Invalid invoke_agent input.", detail: parsed.error.flatten() };
        }
        const delegation = assertRootSubAgentDelegation();
        if (!delegation.allowSubAgents) {
          throw new Error("invoke_agent is not enabled for this agent");
        }
        const { agentId, task, wait = true } = parsed.data;
        const requestedId = agentId.trim();
        if (!requestedId) {
          throw new Error("invoke_agent requires agentId");
        }
        const resolvedId = await resolveSubAgentTargetIdFromDelegation(
          delegation,
          requestedId
        );
        if (!isSubAgentIdAllowed(requestedId, resolvedId, delegation.subAgentIds)) {
          throw new Error(`Agent "${requestedId}" is not enabled for invoke_agent`);
        }
        const parentRun = delegation.parentRun;
        if (!parentRun) {
          throw new Error("invoke_agent requires an active AgentRun");
        }
        const childParams = buildSubAgentChildParams(delegation, {
          agentId: resolvedId,
          task
        });
        if (!wait && parentRun.spawnChildRun) {
          const spawned = await parentRun.spawnChildRun(childParams, {
            waitMode: "background"
          });
          return {
            runId: spawned.runId,
            agentId: spawned.agentId,
            agentName: spawned.agentName,
            background: true
          };
        }
        const result = await parentRun.executeChildAndMerge(childParams);
        if (result.hitlPaused) {
          throw new Error("Sub-agent paused for human approval");
        }
        const { mergeSubFlowOutputText: mergeSubFlowOutputText2 } = await Promise.resolve().then(() => (init_resolve_child_agent(), resolve_child_agent_exports));
        return mergeSubFlowOutputText2(result.stepOutputs, "report");
      }
    };
  }
});

// toolSet/sub-agents/invoke-agents.ts
var import_zod4, invokeAgentsSchema, invokeAgents;
var init_invoke_agents = __esm({
  "toolSet/sub-agents/invoke-agents.ts"() {
    import_zod4 = require("zod");
    init_delegation_context();
    init_constants3();
    invokeAgentsSchema = import_zod4.z.object({
      runs: import_zod4.z.array(
        import_zod4.z.object({
          agentId: import_zod4.z.string().min(1),
          task: import_zod4.z.string().min(1)
        })
      ).min(1),
      wait: import_zod4.z.boolean().optional().describe("When false, return runIds immediately without blocking")
    });
    invokeAgents = {
      name: INVOKE_AGENTS_TOOL_NAME,
      tags: [...SUB_AGENT_TAG],
      description: "Delegate multiple sub-tasks to configured agents in parallel. Use wait=false to start all runs and collect results later with wait_for_sub_agent_runs.",
      inputSchema: invokeAgentsSchema,
      needsApproval: false,
      async execute(input) {
        const parsed = invokeAgentsSchema.safeParse(input);
        if (!parsed.success) {
          return { error: "Invalid invoke_agents input.", detail: parsed.error.flatten() };
        }
        const delegation = assertRootSubAgentDelegation();
        if (!delegation.allowSubAgents) {
          throw new Error("invoke_agents is not enabled for this agent");
        }
        const parentRun = delegation.parentRun;
        if (!parentRun?.spawnChildRun) {
          throw new Error("invoke_agents requires an active AgentRun");
        }
        const { runs, wait = true } = parsed.data;
        const spawned = [];
        for (const run of runs) {
          const requestedId = run.agentId.trim();
          if (!requestedId) continue;
          const resolvedId = await resolveSubAgentTargetIdFromDelegation(
            delegation,
            requestedId
          );
          if (!isSubAgentIdAllowed(requestedId, resolvedId, delegation.subAgentIds)) {
            throw new Error(`Agent "${requestedId}" is not enabled for invoke_agents`);
          }
          const entry = await parentRun.spawnChildRun(
            buildSubAgentChildParams(delegation, {
              agentId: resolvedId,
              task: run.task.trim()
            }),
            { waitMode: wait ? "blocking" : "background" }
          );
          spawned.push(entry);
        }
        if (!wait) {
          return { runIds: spawned.map((s) => s.runId), runs: spawned };
        }
        if (!parentRun.waitForChildRuns) {
          throw new Error("invoke_agents wait mode requires waitForChildRuns");
        }
        const results = await parentRun.waitForChildRuns(spawned.map((s) => s.runId));
        const { mergeSubFlowOutputText: mergeSubFlowOutputText2 } = await Promise.resolve().then(() => (init_resolve_child_agent(), resolve_child_agent_exports));
        return {
          results: results.map((result, i) => ({
            runId: spawned[i]?.runId,
            agentId: spawned[i]?.agentId,
            report: mergeSubFlowOutputText2(result.stepOutputs, "report"),
            hitlPaused: result.hitlPaused
          }))
        };
      }
    };
  }
});

// toolSet/sub-agents/wait-for-sub-agent-runs.ts
var import_zod5, waitForSubAgentRunsTool;
var init_wait_for_sub_agent_runs = __esm({
  "toolSet/sub-agents/wait-for-sub-agent-runs.ts"() {
    import_zod5 = require("zod");
    init_delegation_context();
    init_constants3();
    waitForSubAgentRunsTool = {
      name: WAIT_FOR_SUB_AGENT_RUNS_TOOL_NAME,
      tags: [...SUB_AGENT_TAG],
      description: "Wait for one or more background sub-agent runs to finish and return their reports.",
      inputSchema: import_zod5.z.object({
        runIds: import_zod5.z.array(import_zod5.z.string().min(1)).min(1)
      }),
      needsApproval: false,
      async execute(input) {
        const parsed = import_zod5.z.object({ runIds: import_zod5.z.array(import_zod5.z.string()) }).safeParse(input);
        if (!parsed.success) {
          return {
            error: "Invalid wait_for_sub_agent_runs input.",
            detail: parsed.error.flatten()
          };
        }
        const delegation = assertRootSubAgentDelegation();
        const parentRun = delegation.parentRun;
        if (!parentRun?.waitForChildRuns) {
          throw new Error("wait_for_sub_agent_runs requires an active AgentRun");
        }
        const runIds = parsed.data.runIds.map((id) => id.trim()).filter(Boolean);
        const results = await parentRun.waitForChildRuns(runIds);
        const { mergeSubFlowOutputText: mergeSubFlowOutputText2 } = await Promise.resolve().then(() => (init_resolve_child_agent(), resolve_child_agent_exports));
        return {
          results: results.map((result, i) => ({
            runId: runIds[i],
            report: mergeSubFlowOutputText2(result.stepOutputs, "report"),
            hitlPaused: result.hitlPaused
          }))
        };
      }
    };
  }
});

// toolSet/sub-agents/index.ts
var init_sub_agents = __esm({
  "toolSet/sub-agents/index.ts"() {
    init_constants3();
    init_delegation_context();
    init_invoke_agent();
    init_invoke_agents();
    init_wait_for_sub_agent_runs();
    init_invoke_agent();
    init_invoke_agents();
    init_wait_for_sub_agent_runs();
  }
});

// src/main/skills/resolve-skill-tools.ts
function skillActionTag(skillId) {
  return `skill:${skillId}`;
}
function tagToolsForSkill(tools, skillId) {
  const tag = skillActionTag(skillId);
  return tools.map((tool) => {
    const cleaned = (tool.tags ?? []).filter(
      (t) => typeof t === "string" && t.trim() !== ""
    );
    return {
      ...tool,
      tags: Array.from(/* @__PURE__ */ new Set([...cleaned, tag]))
    };
  });
}
function resolveSkillToolCatalog(globalTools, skillActionTools, allowedTools) {
  const actionNames = new Set(skillActionTools.map((tool) => tool.name));
  const allowed = (allowedTools ?? []).map((name) => name.trim().replace(/^`|`$/g, "")).filter(Boolean);
  const globalFiltered = allowed.length > 0 ? globalTools.filter(
    (tool) => !actionNames.has(tool.name) && (allowed.includes(tool.name) || UNIVERSAL_GLOBAL_TOOL_NAMES.has(tool.name))
  ) : globalTools.filter((tool) => !actionNames.has(tool.name));
  return [...globalFiltered, ...skillActionTools];
}
var UNIVERSAL_GLOBAL_TOOL_NAMES;
var init_resolve_skill_tools = __esm({
  "src/main/skills/resolve-skill-tools.ts"() {
    init_mandatory_tools();
    init_planning();
    init_sub_agents();
    UNIVERSAL_GLOBAL_TOOL_NAMES = /* @__PURE__ */ new Set([
      ...MANDATORY_TOOL_NAMES,
      ...PLAN_MODE_TOOL_NAMES,
      ...PLAN_MODE_ALWAYS_IN_CATALOG_TOOL_NAMES,
      ...UNIVERSAL_SUB_AGENT_TOOL_NAMES
    ]);
  }
});

// src/main/skills/skills-directory-loader.ts
function attachSkillCompilationFromStore(skill, store) {
  const row = store.getEffectiveSkillCompilation(skill.id);
  skill.compiledArtifact = row?.compiled ?? void 0;
  skill.compilationStatus = row?.status ?? "missing";
  const status = row?.status ?? "missing";
  if (status === "ready" && row?.compiled) {
    log12.debug(
      {
        skillId: skill.id,
        source: row.source,
        compiledAt: row.compiledAt
      },
      "skill load: using compiled artifact from DB"
    );
  } else if (status === "failed") {
    log12.warn(
      {
        skillId: skill.id,
        source: row?.source,
        errorMessage: row?.errorMessage
      },
      "skill load: compile failed \u2014 disk markdown fallback at runtime"
    );
  } else {
    log12.debug(
      { skillId: skill.id, status },
      "skill load: no compiled artifact \u2014 disk markdown fallback at runtime"
    );
  }
}
async function loadSkillsFromDirectory(skillsDir, options) {
  if (!(0, import_fs8.existsSync)(skillsDir)) {
    (0, import_fs8.mkdirSync)(skillsDir, { recursive: true });
    return [];
  }
  const skills = [];
  let entries;
  try {
    entries = (0, import_fs8.readdirSync)(skillsDir);
  } catch {
    return [];
  }
  const globalTools = options?.globalTools ?? await loadToolSetTools();
  for (const entry of entries) {
    if (!isLoadableSkillFolder(skillsDir, entry)) continue;
    const skillFolder = (0, import_path8.join)(skillsDir, entry);
    const skillFile = (0, import_path8.join)(skillFolder, SKILL_FILES.SKILL_MD);
    try {
      let skillRaw = (0, import_fs8.readFileSync)(skillFile, "utf-8");
      const propertiesRaw = resolvePropertiesRaw(entry, skillFolder, skillRaw);
      if (extractYamlFrontmatterBlock(skillRaw)) {
        skillRaw = stripYamlFrontmatter(skillRaw);
      }
      const preliminary = parseSkillMarkdown(
        entry,
        skillFolder,
        propertiesRaw,
        skillRaw
      );
      if (!preliminary) continue;
      const skillActionTools = tagToolsForSkill(
        await loadSkillActions(skillFolder, []),
        entry
      );
      const allowedForCatalog = expandSkillAllowedToolsForCatalog(
        entry,
        globalTools,
        preliminary.properties.allowedTools
      );
      const resolvedTools = resolveSkillToolCatalog(
        globalTools,
        skillActionTools,
        allowedForCatalog
      );
      const skill = parseSkillMarkdown(
        entry,
        skillFolder,
        propertiesRaw,
        skillRaw,
        void 0,
        void 0,
        resolvedTools
      );
      if (skill) {
        skill.actionToolNames = skillActionTools.map((tool) => tool.name);
        skills.push(skill);
        continue;
      }
      log12.warn(SKILL_LOADER_LOG.SKIPPED_INVALID, {
        skillId: entry,
        folder: skillFolder
      });
    } catch (err) {
      log12.warn(SKILL_LOADER_LOG.SKIPPED_FAILED, {
        skillId: entry,
        folder: skillFolder,
        err
      });
    }
  }
  log12.info(SKILL_LOADER_LOG.LOADED, {
    skillsDir,
    count: skills.length,
    skillIds: skills.map((s) => s.id)
  });
  return skills;
}
async function loadSkills() {
  const globalTools = await loadToolSetTools();
  const byId = /* @__PURE__ */ new Map();
  for (const skillsDir of resolveSkillsSourceRoots()) {
    const skills = await loadSkillsFromDirectory(skillsDir, { globalTools });
    for (const skill of skills) {
      byId.set(skill.id, skill);
    }
  }
  const merged = Array.from(byId.values());
  const store = getConversationStore();
  for (const skill of merged) {
    attachSkillCompilationFromStore(skill, store);
  }
  log12.info(SKILL_LOADER_LOG.LOADED, {
    sources: resolveSkillsSourceRoots(),
    count: merged.length,
    skillIds: merged.map((s) => s.id)
  });
  return merged;
}
var import_fs8, import_path8, log12;
var init_skills_directory_loader = __esm({
  "src/main/skills/skills-directory-loader.ts"() {
    import_fs8 = require("fs");
    import_path8 = require("path");
    init_logger();
    init_constants();
    init_skill_path();
    init_skill_markdown();
    init_skill_module_loader();
    init_resolve_skill_tools();
    init_skill_workspace_tool_defaults();
    init_conversation_store();
    log12 = createLogger("skills.loader");
  }
});

// src/main/skills/skill-zod-schema.ts
function isPlainJsonSchema(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if ("_def" in value) return false;
  return "type" in value || "properties" in value || "$schema" in value || "anyOf" in value || "oneOf" in value;
}
function serializeToolInputSchema(schema) {
  if (!schema) return void 0;
  if (isPlainJsonSchema(schema)) return schema;
  const anySchema = schema;
  if (typeof anySchema.toJSON === "function") return anySchema.toJSON();
  if (typeof anySchema.toJSONSchema === "function")
    return anySchema.toJSONSchema();
  if (typeof import_zod6.z.toJSONSchema === "function")
    return import_zod6.z.toJSONSchema(schema);
  return convertZodSchemaToJsonSchema(schema);
}
function convertZodSchemaToJsonSchema(schema) {
  const def = schema._def;
  if (!def || typeof def.typeName !== "string") return void 0;
  switch (def.typeName) {
    case "ZodObject": {
      const shape = typeof def.shape === "function" ? def.shape() : def.shape ?? {};
      const properties = {};
      const required = [];
      for (const key of Object.keys(shape)) {
        const propertySchema = shape[key];
        properties[key] = convertZodSchemaToJsonSchema(propertySchema) ?? {
          type: "object"
        };
        if (!propertySchema.isOptional?.() && !propertySchema.isNullable?.()) {
          required.push(key);
        }
      }
      return {
        type: "object",
        properties,
        additionalProperties: false,
        ...required.length ? { required } : void 0
      };
    }
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodArray":
      return {
        type: "array",
        items: convertZodSchemaToJsonSchema(def.type) ?? {}
      };
    case "ZodUnion":
      return {
        anyOf: Array.isArray(def.options) ? def.options.map(
          (option) => convertZodSchemaToJsonSchema(option) ?? {}
        ) : []
      };
    case "ZodLiteral":
      return { const: def.value, type: typeof def.value };
    case "ZodEnum":
      return { type: "string", enum: def.values };
    case "ZodNativeEnum":
      return {
        type: typeof def.values[Object.keys(def.values)[0]],
        enum: Object.values(def.values)
      };
    case "ZodOptional":
    case "ZodDefault":
      return convertZodSchemaToJsonSchema(def.innerType ?? def.type);
    case "ZodNullable": {
      const inner = convertZodSchemaToJsonSchema(def.innerType ?? def.type);
      if (!inner || typeof inner !== "object") return { type: "null" };
      return { anyOf: [inner, { type: "null" }] };
    }
    case "ZodAny":
    case "ZodUnknown":
      return {};
    case "ZodRecord":
      return {
        type: "object",
        additionalProperties: convertZodSchemaToJsonSchema(def.valueType) ?? {}
      };
    default:
      return {};
  }
}
var import_zod6;
var init_skill_zod_schema = __esm({
  "src/main/skills/skill-zod-schema.ts"() {
    import_zod6 = require("zod");
  }
});

// src/main/skills/tool-ipc-meta.ts
function serializeNeedsApproval(needsApproval) {
  if (typeof needsApproval === "function") return true;
  return needsApproval ?? false;
}
var init_tool_ipc_meta = __esm({
  "src/main/skills/tool-ipc-meta.ts"() {
  }
});

// src/main/skills/skill-serializer.ts
function useCompiled(skill) {
  if (skill.compilationStatus === "ready" && skill.compiledArtifact) {
    return skill.compiledArtifact;
  }
  return void 0;
}
function skillToAgent2(skill) {
  const compiled = useCompiled(skill);
  const hasTools = skill.tools.length > 0;
  const hostToolOs = getHostToolOs();
  const skillsText = skill.sections.fullMarkdown.trim() || skill.sections.instructions.trim();
  const thinkingText = compiled?.thinking.instructions.trim();
  const validationRules = compiled?.validation.rules ?? [];
  const needsExecutionSteps = hasTools || Boolean(thinkingText) || skillsText.trim().length > 0 || validationRules.length > 0;
  return {
    id: `skill:${skill.id}`,
    name: skill.properties.name,
    description: skill.properties.description,
    model: skill.properties.model,
    systemPrompt: skill.systemPrompt,
    color: skill.properties.color,
    enabled: skill.properties.enabled,
    provider: skill.properties.provider,
    isSkill: true,
    skillId: skill.id,
    compiledArtifact: compiled,
    compilationStatus: skill.compilationStatus ?? (compiled ? "ready" : "missing"),
    ...skill.properties.allowedTools?.length ? { allowedTools: [...skill.properties.allowedTools] } : {},
    ...skill.actionToolNames.length > 0 ? { actionToolNames: [...skill.actionToolNames] } : {},
    skillsPrompt: skillsText,
    executionSteps: needsExecutionSteps ? {
      ...thinkingText ? { thinking: thinkingText } : {},
      toolLoop: hasTools ? {
        tools: skill.tools.map((tool) => ({
          name: tool.name,
          tags: tool.tags,
          description: tool.description,
          inputSchema: serializeToolInputSchema(tool.inputSchema),
          os: tool.os ?? hostToolOs,
          needsApproval: serializeNeedsApproval(tool.needsApproval)
        })),
        maxIterations: skill.properties.maxIterations ?? DEFAULT_TOOL_LOOP_MAX_ITERATIONS
      } : void 0,
      skills: skillsText,
      ...validationRules.length > 0 ? { validation: validationRules } : {}
    } : void 0
  };
}
var init_skill_serializer = __esm({
  "src/main/skills/skill-serializer.ts"() {
    init_tool_loop();
    init_skill_path();
    init_skill_zod_schema();
    init_tool_ipc_meta();
    init_tool_ipc_meta();
  }
});

// src/main/agent/expr/tool-failure.ts
var init_tool_failure = __esm({
  "src/main/agent/expr/tool-failure.ts"() {
  }
});

// src/main/agent/expr/tool-log-utils.ts
var init_tool_log_utils = __esm({
  "src/main/agent/expr/tool-log-utils.ts"() {
  }
});

// src/main/skills/actions/index.ts
var legacyToolLog;
var init_actions = __esm({
  "src/main/skills/actions/index.ts"() {
    init_logger();
    init_tool_failure();
    init_tool_log_utils();
    legacyToolLog = createLogger("agent.tool-call");
  }
});

// src/main/skills/skills.ts
var log13, getSkillsDir, parseSkillMarkdown2, skillToAgent;
var init_skills = __esm({
  "src/main/skills/skills.ts"() {
    init_logger();
    init_skill_path();
    init_skill_markdown();
    init_skill_module_loader();
    init_skills_directory_loader();
    init_skill_serializer();
    init_actions();
    init_skill_visibility();
    log13 = createLogger("skills.skills");
    getSkillsDir = traceFunction2(
      log13,
      "getSkillsDir",
      resolveUserSkillsDirectory
    );
    parseSkillMarkdown2 = traceFunction2(
      log13,
      "parseSkillMarkdown",
      parseSkillMarkdown
    );
    skillToAgent = traceFunction2(log13, "skillToAgent", skillToAgent2);
  }
});

// src/main/agent/resources/reference-resource.ts
var init_reference_resource = __esm({
  "src/main/agent/resources/reference-resource.ts"() {
    init_reference_ops();
  }
});

// src/main/agent/resources/reference-ops.ts
var init_reference_ops = __esm({
  "src/main/agent/resources/reference-ops.ts"() {
    init_reference_resource();
  }
});

// src/main/agent/resources/context.ts
var init_context2 = __esm({
  "src/main/agent/resources/context.ts"() {
    init_reference_ops();
    init_reference_resource();
  }
});

// src/main/agent/types.ts
var init_types3 = __esm({
  "src/main/agent/types.ts"() {
    init_reference_resource();
  }
});

// src/main/agent/sandbox/instructions.ts
var init_instructions = __esm({
  "src/main/agent/sandbox/instructions.ts"() {
  }
});

// src/main/agent/sandbox/sandbox-impl.ts
var log14;
var init_sandbox_impl = __esm({
  "src/main/agent/sandbox/sandbox-impl.ts"() {
    init_openfde_home();
    init_skills();
    init_skill_path();
    init_logger();
    init_context2();
    init_reference_ops();
    init_types3();
    init_instructions();
    init_flow_scoped_ids();
    init_tool_loop_output();
    log14 = createLogger("sandbox");
  }
});

// src/main/agent/sandbox/registry.ts
function peekSandboxRootForConversation(conversationId) {
  const cid = conversationId?.trim();
  if (!cid) return void 0;
  return registry.get(cid)?.layout.root;
}
var registry;
var init_registry = __esm({
  "src/main/agent/sandbox/registry.ts"() {
    init_openfde_home();
    init_sandbox_impl();
    registry = /* @__PURE__ */ new Map();
  }
});

// src/main/agent/sandbox/sub-agent-registry.ts
function isSubAgentSandboxRoot(path2) {
  const normalized = path2.replace(/\\/g, "/");
  return normalized.includes("/sandbox/sub-agents/");
}
var init_sub_agent_registry = __esm({
  "src/main/agent/sandbox/sub-agent-registry.ts"() {
    init_openfde_home();
    init_sandbox_impl();
  }
});

// src/main/agent/sandbox/ready-payload.ts
var init_ready_payload = __esm({
  "src/main/agent/sandbox/ready-payload.ts"() {
  }
});

// src/main/agent/sandbox/planning-materialize.ts
var init_planning_materialize = __esm({
  "src/main/agent/sandbox/planning-materialize.ts"() {
  }
});

// src/main/agent/sandbox/final-result.ts
var import_markdown_it, markdown;
var init_final_result = __esm({
  "src/main/agent/sandbox/final-result.ts"() {
    import_markdown_it = __toESM(require("markdown-it"));
    init_structured_content();
    markdown = new import_markdown_it.default({
      html: false,
      breaks: true,
      linkify: true
    });
  }
});

// src/main/agent/sandbox/output-view.ts
function removeViewForWindow(win) {
  const view = sandboxResultsViews.get(win.id);
  if (!view) return;
  try {
    if (!win.isDestroyed()) {
      win.contentView.removeChildView(view);
    }
  } catch {
  }
  try {
    if (!view.webContents.isDestroyed()) {
      view.webContents.close();
    }
  } catch {
  }
  sandboxResultsViews.delete(win.id);
}
function ensureClosedCleanup(win) {
  const id = win.id;
  if (closedHandlersRegistered.has(id)) return;
  closedHandlersRegistered.add(id);
  win.once("closed", () => {
    closedHandlersRegistered.delete(id);
    const view = sandboxResultsViews.get(id);
    if (!view) return;
    sandboxResultsViews.delete(id);
    try {
      if (!view.webContents.isDestroyed()) {
        view.webContents.close();
      }
    } catch {
    }
  });
}
function syncSandboxOutputViewImpl(event, args) {
  const win = import_electron3.BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  const screenBounds = args.screenBounds;
  const contentBounds = win.getContentBounds();
  const rel = {
    x: Math.round(screenBounds.x - contentBounds.x),
    y: Math.round(screenBounds.y - contentBounds.y),
    width: Math.max(0, Math.round(screenBounds.width)),
    height: Math.max(0, Math.round(screenBounds.height))
  };
  if (!args.fileUrl) {
    removeViewForWindow(win);
    return;
  }
  let view = sandboxResultsViews.get(win.id);
  if (!view) {
    view = new import_electron3.WebContentsView({
      webPreferences: {
        // Directory/file `file://` previews need full local access; Chromium
        // sandbox + webSecurity block typical file listings.
        sandbox: false,
        webSecurity: false,
        contextIsolation: true
      }
    });
    view.setBackgroundColor("#ffffff");
    sandboxResultsViews.set(win.id, view);
    win.contentView.addChildView(view);
    ensureClosedCleanup(win);
    if (!view.webContents.isDestroyed()) {
      view.webContents.on("did-fail-load", (_event, errorCode, errorDesc, url) => {
        log15.error("Sandbox output view failed to load", {
          errorCode,
          errorDesc,
          url
        });
      });
      view.webContents.on("did-finish-load", () => {
        if (!win.isDestroyed()) {
          win.contentView.addChildView(view);
        }
      });
    }
  }
  view.setBounds(rel);
  const current = view.webContents.isDestroyed() ? "" : view.webContents.getURL();
  if (current !== args.fileUrl && !view.webContents.isDestroyed()) {
    void view.webContents.loadURL(args.fileUrl);
  }
}
var import_electron3, sandboxResultsViews, closedHandlersRegistered, log15, syncSandboxOutputView;
var init_output_view = __esm({
  "src/main/agent/sandbox/output-view.ts"() {
    import_electron3 = require("electron");
    init_logger();
    sandboxResultsViews = /* @__PURE__ */ new Map();
    closedHandlersRegistered = /* @__PURE__ */ new Set();
    log15 = createLogger("sandbox.output-view");
    syncSandboxOutputView = traceFunction2(
      log15,
      "syncSandboxOutputView",
      syncSandboxOutputViewImpl
    );
  }
});

// src/main/agent/sandbox/cleanup.ts
function realpathSafe(p) {
  const r = (0, import_path9.resolve)(p.trim());
  try {
    return (0, import_fs9.realpathSync)(r);
  } catch {
    return r;
  }
}
function isRemovableopenfdeSandboxPathImpl(candidatePath) {
  const openfdeSandboxReal = realpathSafe(getopenfdeSandboxDir());
  const tmpReal = realpathSafe(import_os2.default.tmpdir());
  let parentReal;
  let name;
  try {
    const absReal = (0, import_fs9.realpathSync)((0, import_path9.resolve)(candidatePath.trim()));
    parentReal = (0, import_path9.dirname)(absReal);
    name = (0, import_path9.basename)(absReal);
  } catch {
    const abs = (0, import_path9.resolve)(candidatePath.trim());
    name = (0, import_path9.basename)(abs);
    parentReal = realpathSafe((0, import_path9.dirname)(abs));
  }
  if (parentReal === openfdeSandboxReal) return true;
  try {
    const absReal = (0, import_fs9.realpathSync)((0, import_path9.resolve)(candidatePath.trim()));
    const rel = (0, import_path9.relative)(openfdeSandboxReal, absReal);
    if (rel && !rel.startsWith("..") && !rel.startsWith(`..${import_path9.sep}`) && (rel.startsWith("sub-agents") || rel.includes("/sub-agents/"))) {
      return true;
    }
  } catch {
    if (isSubAgentSandboxRoot(candidatePath)) return true;
  }
  if (!name.startsWith("openfde-sandbox-")) return false;
  return parentReal === tmpReal;
}
async function removeSandboxDirectoriesImpl(paths) {
  for (const p of paths) {
    const abs = (0, import_path9.resolve)(p.trim());
    if (!isRemovableopenfdeSandboxPath(abs)) {
      log16.warn("Skipped sandbox removal outside allowed sandbox roots", {
        path: p,
        openfdeSandbox: getopenfdeSandboxDir(),
        tmpdir: import_os2.default.tmpdir()
      });
      continue;
    }
    try {
      await (0, import_promises.rm)(abs, { recursive: true, force: true });
      log16.info("Removed sandbox directory", { path: abs });
    } catch (err) {
      log16.error("Failed to remove sandbox directory", {
        path: abs,
        err
      });
    }
  }
}
var import_fs9, import_promises, import_os2, import_path9, log16, isRemovableopenfdeSandboxPath, removeSandboxDirectories;
var init_cleanup = __esm({
  "src/main/agent/sandbox/cleanup.ts"() {
    import_fs9 = require("fs");
    import_promises = require("fs/promises");
    import_os2 = __toESM(require("os"));
    import_path9 = require("path");
    init_openfde_home();
    init_sub_agent_registry();
    init_logger();
    log16 = createLogger("sandbox.cleanup");
    isRemovableopenfdeSandboxPath = traceFunction2(
      log16,
      "isRemovableopenfdeSandboxPath",
      isRemovableopenfdeSandboxPathImpl
    );
    removeSandboxDirectories = traceFunction2(
      log16,
      "removeSandboxDirectories",
      removeSandboxDirectoriesImpl
    );
  }
});

// src/main/agent/sandbox/context.ts
var init_context3 = __esm({
  "src/main/agent/sandbox/context.ts"() {
    init_registry();
    init_sub_agent_registry();
    init_run_context();
    init_paths();
    init_planning_materialize();
    init_ready_payload();
    init_final_result();
    init_conversation_workspace();
    init_run_context();
  }
});

// src/main/agent/sandbox/sandbox-globals-lock.ts
var log17, lockTail;
var init_sandbox_globals_lock = __esm({
  "src/main/agent/sandbox/sandbox-globals-lock.ts"() {
    init_logger();
    init_tool_loop_output();
    init_paths();
    init_run_context();
    log17 = createLogger("sandbox.globals-lock");
    lockTail = Promise.resolve();
  }
});

// src/main/agent/sandbox/index.ts
var init_sandbox = __esm({
  "src/main/agent/sandbox/index.ts"() {
    init_registry();
    init_sub_agent_registry();
    init_run_context();
    init_paths();
    init_ready_payload();
    init_planning_materialize();
    init_final_result();
    init_output_view();
    init_cleanup();
    init_instructions();
    init_context3();
    init_sandbox_globals_lock();
  }
});

// toolSet/sandbox-paths.ts
var init_sandbox_paths = __esm({
  "toolSet/sandbox-paths.ts"() {
    init_sandbox();
  }
});

// src/main/agent/coding/plan-mode-storage-impl.ts
function stableSandboxRootForConversation(conversationId) {
  const dirName = (0, import_node_crypto2.createHash)("sha256").update(conversationId.trim(), "utf8").digest("hex");
  return (0, import_node_path2.join)(getopenfdeSandboxDir(), dirName);
}
function resolvePlanSandboxRoot(conversationId, options) {
  const fromOpt = options?.sandboxRoot?.trim();
  if (fromOpt) return fromOpt;
  const fromRun = getAgentRunSandboxRoot() || getSandboxRootFromEnv();
  if (fromRun) return fromRun;
  const id = conversationId?.trim();
  if (!id) return null;
  return peekSandboxRootForConversation(id) ?? stableSandboxRootForConversation(id);
}
function planModeStorageOptionsFromEnv(conversationId) {
  const sandboxRoot = resolvePlanSandboxRoot(conversationId ?? void 0);
  return sandboxRoot ? { sandboxRoot } : {};
}
function slugifyPlanTitle(raw) {
  const base = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return base || "implementation-plan";
}
function assignPlanSlug(conversationId, hint, _options) {
  const state = planModeFor(conversationId).snapshot();
  const existing = state.planSlug?.trim();
  if (existing) return existing;
  const hinted = hint?.trim() ? slugifyPlanTitle(hint) : null;
  const slug = hinted ?? "implementation-plan";
  planModeFor(conversationId).assignPlanSlug(slug);
  return slug;
}
function pruneStalePlanMarkdownFiles(plansDirAbs, canonicalPlanAbs) {
  if (!(0, import_node_fs5.existsSync)(plansDirAbs)) return;
  const canonical = (0, import_node_path2.resolve)(canonicalPlanAbs);
  let entries;
  try {
    entries = (0, import_node_fs5.readdirSync)(plansDirAbs);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const abs = (0, import_node_path2.resolve)((0, import_node_path2.join)(plansDirAbs, name));
    if (abs === canonical) continue;
    try {
      (0, import_node_fs5.unlinkSync)(abs);
    } catch {
    }
  }
}
function resolvePlanModeStorage(conversationId, options) {
  const id = conversationId?.trim();
  if (!id) return null;
  const sandboxRoot = resolvePlanSandboxRoot(id, options);
  if (!sandboxRoot) return null;
  const state = planModeFor(id).snapshot();
  const planSlug = (options?.slug ?? state.planSlug)?.trim();
  if (!planSlug) return null;
  const plansDirAbs = (0, import_node_path2.join)(sandboxRoot, PLAN_MODE_PLANS_DIR);
  const planAbs = (0, import_node_path2.join)(plansDirAbs, `${planSlug}.md`);
  const todosAbs = (0, import_node_path2.join)(plansDirAbs, "todos.json");
  const manifestAbs = (0, import_node_path2.join)(plansDirAbs, "manifest.json");
  return {
    sandboxRoot,
    plansDirAbs,
    planFile: {
      absolutePath: planAbs,
      displayPath: `${PLAN_MODE_PLANS_DIR}/${planSlug}.md`,
      slug: planSlug
    },
    todosFile: {
      absolutePath: todosAbs,
      displayPath: `${PLAN_MODE_PLANS_DIR}/todos.json`
    },
    manifestFile: {
      absolutePath: manifestAbs,
      displayPath: `${PLAN_MODE_PLANS_DIR}/manifest.json`
    }
  };
}
function ensurePlanModePlansDir(plansDirAbs) {
  if (!(0, import_node_fs5.existsSync)(plansDirAbs)) {
    (0, import_node_fs5.mkdirSync)(plansDirAbs, { recursive: true });
  }
}
function planMarkdownHasActionableSteps(content) {
  return parsePlanStepsFromMarkdown(content).length > 0;
}
function parsePlanStepsFromMarkdown(content) {
  const lines = content.split("\n");
  const steps = [];
  let inSteps = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s+steps/i.test(trimmed)) {
      inSteps = true;
      continue;
    }
    if (inSteps && /^##\s+/.test(trimmed)) break;
    if (!inSteps) continue;
    const m = trimmed.match(/^\d+\.\s+(.+)/);
    if (m?.[1]) {
      const step = m[1].replace(/<!--.*?-->/g, "").trim();
      if (step && !step.startsWith("<!--")) steps.push(step);
    }
  }
  return steps;
}
function legacyPlansDirAbs(sandboxRoot) {
  return (0, import_node_path2.join)(sandboxRoot, "output", "plans");
}
function migrateLegacyPlanArtifacts(storage) {
  const legacyDir = legacyPlansDirAbs(storage.sandboxRoot);
  if (!(0, import_node_fs5.existsSync)(legacyDir)) return;
  ensurePlanModePlansDir(storage.plansDirAbs);
  const slug = storage.planFile.slug;
  const legacyPlan = (0, import_node_path2.join)(legacyDir, `${slug}.md`);
  const legacyTodos = (0, import_node_path2.join)(legacyDir, "todos.json");
  if (!(0, import_node_fs5.existsSync)(storage.planFile.absolutePath) && (0, import_node_fs5.existsSync)(legacyPlan)) {
    try {
      (0, import_node_fs5.renameSync)(legacyPlan, storage.planFile.absolutePath);
    } catch {
      (0, import_node_fs5.copyFileSync)(legacyPlan, storage.planFile.absolutePath);
    }
  }
  if (!(0, import_node_fs5.existsSync)(storage.todosFile.absolutePath) && (0, import_node_fs5.existsSync)(legacyTodos)) {
    try {
      (0, import_node_fs5.renameSync)(legacyTodos, storage.todosFile.absolutePath);
    } catch {
      (0, import_node_fs5.copyFileSync)(legacyTodos, storage.todosFile.absolutePath);
    }
  }
}
function readLegacySandboxTodoList(sandboxRoot) {
  const legacy = (0, import_node_path2.join)(sandboxRoot, "todos.json");
  if (!(0, import_node_fs5.existsSync)(legacy)) return null;
  try {
    return parseTodoList(JSON.parse((0, import_node_fs5.readFileSync)(legacy, "utf8")));
  } catch {
    return null;
  }
}
function readPlanModeTodoList(conversationId, options) {
  const storage = resolvePlanModeStorage(conversationId, options);
  if (!storage) return emptyTodoList();
  migrateLegacyPlanArtifacts(storage);
  const file = storage.todosFile.absolutePath;
  if ((0, import_node_fs5.existsSync)(file)) {
    try {
      return parseTodoList(JSON.parse((0, import_node_fs5.readFileSync)(file, "utf8")));
    } catch {
      return emptyTodoList();
    }
  }
  const legacy = readLegacySandboxTodoList(storage.sandboxRoot);
  if (legacy && legacy.todos.length > 0) {
    writePlanModeTodoList(conversationId, legacy, options);
    return legacy;
  }
  return emptyTodoList();
}
function syncPlanMarkdownFromTodoList(storage, list) {
  ensurePlanModePlansDir(storage.plansDirAbs);
  pruneStalePlanMarkdownFiles(storage.plansDirAbs, storage.planFile.absolutePath);
  const markdown2 = renderPlanMarkdownFromTodoList(list);
  (0, import_node_fs5.writeFileSync)(storage.planFile.absolutePath, markdown2, "utf8");
}
function writePlanModeTodoList(conversationId, list, options) {
  const storage = resolvePlanModeStorage(conversationId, options);
  if (!storage) return;
  migrateLegacyPlanArtifacts(storage);
  ensurePlanModePlansDir(storage.plansDirAbs);
  (0, import_node_fs5.writeFileSync)(
    storage.todosFile.absolutePath,
    JSON.stringify(list, null, 2),
    "utf8"
  );
  syncPlanMarkdownFromTodoList(storage, list);
}
function bootstrapPlanModeStorage(conversationId, title, options) {
  const slug = assignPlanSlug(conversationId, title, {
    updateFromHint: Boolean(title?.trim())
  });
  const storage = resolvePlanModeStorage(conversationId, {
    ...options,
    slug
  });
  if (!storage) return null;
  migrateLegacyPlanArtifacts(storage);
  ensurePlanModePlansDir(storage.plansDirAbs);
  pruneStalePlanMarkdownFiles(storage.plansDirAbs, storage.planFile.absolutePath);
  if (!(0, import_node_fs5.existsSync)(storage.planFile.absolutePath)) {
    const markdown2 = renderPlanModeMarkdown(planContextFromTodoList(emptyTodoList()));
    (0, import_node_fs5.writeFileSync)(storage.planFile.absolutePath, markdown2, "utf8");
  }
  return storage;
}
function seedTodosFromPlanMarkdown(conversationId, planPath, options) {
  let content = "";
  try {
    content = (0, import_node_fs5.readFileSync)(planPath, "utf8");
  } catch {
    return { seeded: 0 };
  }
  const steps = parsePlanStepsFromMarkdown(content);
  if (steps.length === 0) return { seeded: 0 };
  const list = replaceTodos(steps.map((content2) => ({ content: content2, status: "pending" })));
  writePlanModeTodoList(conversationId, list, options);
  return { seeded: steps.length };
}
var import_node_fs5, import_node_path2, import_node_crypto2, PLAN_MODE_PLANS_DIR;
var init_plan_mode_storage_impl = __esm({
  "src/main/agent/coding/plan-mode-storage-impl.ts"() {
    import_node_fs5 = require("node:fs");
    import_node_path2 = require("node:path");
    import_node_crypto2 = require("node:crypto");
    init_todos();
    init_openfde_home();
    init_sandbox_paths();
    init_registry();
    init_run_context();
    init_plan_mode_template();
    init_plan_mode_state_machine();
    PLAN_MODE_PLANS_DIR = "plans";
  }
});

// src/main/agent/coding/plan-mode-state.ts
function isPlanModeActive(conversationId) {
  const id = conversationId?.trim();
  if (!id) return false;
  return planModeFor(id).isPlanning();
}
function isPlanExecutionActive(conversationId) {
  const id = conversationId?.trim();
  if (!id) return false;
  return planModeFor(id).isExecuting();
}
var init_plan_mode_state = __esm({
  "src/main/agent/coding/plan-mode-state.ts"() {
    init_plan_mode();
    init_plan_mode_phase();
    init_plan_mode_state_machine();
    init_plan_mode_storage_impl();
    init_plan_mode_state_machine();
    init_plan_mode_phase();
    init_plan_mode_template();
    init_plan_mode_storage_impl();
  }
});

// toolSet/todos.ts
var todos_exports = {};
__export(todos_exports, {
  readTodos: () => readTodos,
  todoTools: () => todoTools,
  updateTodos: () => updateTodos
});
module.exports = __toCommonJS(todos_exports);
var import_zod7 = require("zod");

// src/main/agent/coding/plan-mode-todo-update-guard.ts
init_plan_mode_state();
function explorePhaseTodoUpdateBlockedReason(conversationId, todos) {
  const id = conversationId?.trim();
  if (!id || !isPlanModeActive(id)) return null;
  const hasCompleted = todos.some((todo) => todo.status === "completed");
  if (!hasCompleted) return null;
  return "Exploring: keep todos pending or in_progress while drafting the plan. Mark tasks completed only after exit_plan_mode is approved and execution begins. Call exit_plan_mode when the plan is ready for approval.";
}

// toolSet/todos.ts
init_plan_mode_storage_impl();
init_sandbox_paths();

// src/main/agent/todos/todo-store.ts
var import_node_fs6 = require("node:fs");
var import_node_path3 = require("node:path");
init_logger();
init_todos();
var log18 = createLogger("agent.todos.store");
function todosPath(sandboxRoot, namespace = "main") {
  return (0, import_node_path3.join)(sandboxRoot, todosFileName(namespace));
}
function readTodoList(sandboxRoot, namespace = "main") {
  const file = todosPath(sandboxRoot, namespace);
  if (!(0, import_node_fs6.existsSync)(file)) return emptyTodoList();
  try {
    return parseTodoList(JSON.parse((0, import_node_fs6.readFileSync)(file, "utf8")));
  } catch (err) {
    log18.warn("Failed to read todos file; treating as empty", { file, err });
    return emptyTodoList();
  }
}
function writeTodoList(sandboxRoot, list, namespace = "main") {
  const file = todosPath(sandboxRoot, namespace);
  try {
    (0, import_node_fs6.mkdirSync)((0, import_node_path3.dirname)(file), { recursive: true });
    (0, import_node_fs6.writeFileSync)(file, JSON.stringify(list, null, 2), "utf8");
  } catch (err) {
    log18.warn("Failed to write todos file", { file, err });
  }
}

// toolSet/todos.ts
init_todos();
var TODO_TAG = ["task-tracking"];
var trackedTodoInputSchema = import_zod7.z.object({
  content: import_zod7.z.string().min(1).describe("Short, actionable task description."),
  status: import_zod7.z.enum(TRACKED_TODO_STATUSES).optional().default("pending").describe("pending | in_progress | completed | cancelled"),
  success_criteria: import_zod7.z.string().optional().describe(
    "Observable pass/fail condition for this step (shown to the execution verifier)."
  ),
  verify_command: import_zod7.z.string().optional().describe(
    "Optional shell command run in the workspace after execution (non-zero exit = fail)."
  ),
  fallback_plan: import_zod7.z.enum(TRACKED_TODO_FALLBACK_PLANS).optional().describe("retry | skip | manual_intervention when verification fails.")
});
function persistTodoList(list) {
  const conversationId = getConversationIdFromEnv();
  if (conversationId) {
    writePlanModeTodoList(
      conversationId,
      list,
      planModeStorageOptionsFromEnv(conversationId)
    );
    return;
  }
  const sandboxRoot = getSandboxRootFromEnv();
  if (!sandboxRoot) return;
  const namespace = todosNamespaceFromScope(getSandboxOutputScopeFromEnv());
  writeTodoList(sandboxRoot, list, namespace);
}
function loadTodoList() {
  const conversationId = getConversationIdFromEnv();
  if (conversationId) {
    return readPlanModeTodoList(
      conversationId,
      planModeStorageOptionsFromEnv(conversationId)
    );
  }
  const sandboxRoot = getSandboxRootFromEnv();
  if (!sandboxRoot) return null;
  const namespace = todosNamespaceFromScope(getSandboxOutputScopeFromEnv());
  return readTodoList(sandboxRoot, namespace);
}
var updateTodos = {
  name: "update_todos",
  tags: [...TODO_TAG],
  description: "Maintain the task list for a multi-step job. Send the COMPLETE current list each time (full replace): mark exactly one task in_progress while you work it, mark it completed the moment it is done, and append new tasks you discover. Persists to plans/todos.json alongside the plan file. Statuses: pending | in_progress | completed | cancelled. While exploring (before exit_plan_mode), use only pending or in_progress \u2014 not completed. Include success_criteria for every step and verify_command when an objective check exists (e.g. npm test, test -f path/to/file).",
  inputSchema: import_zod7.z.object({
    todos: import_zod7.z.array(trackedTodoInputSchema).min(1).describe("The complete, ordered task list (replaces the previous list).")
  }),
  needsApproval: false,
  async execute(input) {
    const conversationId = getConversationIdFromEnv();
    const sandboxRoot = getSandboxRootFromEnv();
    if (!conversationId && !sandboxRoot) {
      return {
        error: "No active sandbox; task tracking is only available during an agent run."
      };
    }
    const parsed = import_zod7.z.object({
      todos: import_zod7.z.array(trackedTodoInputSchema)
    }).safeParse(input);
    if (!parsed.success) {
      return { error: "Invalid todos input.", detail: parsed.error.flatten() };
    }
    const exploreBlocked = explorePhaseTodoUpdateBlockedReason(
      conversationId,
      parsed.data.todos
    );
    if (exploreBlocked) {
      return { error: exploreBlocked };
    }
    const list = replaceTodos(parsed.data.todos);
    persistTodoList(list);
    const summary = summarizeTodos(list);
    return {
      ok: true,
      todos: list.todos,
      summary,
      checklist: renderTodoChecklist(list)
    };
  }
};
var readTodos = {
  name: "read_todos",
  tags: [...TODO_TAG],
  description: "Read the current task list from plans/todos.json (alongside the plan file). Use it to re-orient on a long task.",
  inputSchema: import_zod7.z.object({}),
  needsApproval: false,
  async execute() {
    const conversationId = getConversationIdFromEnv();
    const sandboxRoot = getSandboxRootFromEnv();
    if (!conversationId && !sandboxRoot) {
      return { error: "No active sandbox." };
    }
    const list = loadTodoList();
    if (!list) return { error: "No active sandbox." };
    return {
      ok: true,
      todos: list.todos,
      summary: summarizeTodos(list),
      checklist: renderTodoChecklist(list)
    };
  }
};
var todoTools = [updateTodos, readTodos];
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  readTodos,
  todoTools,
  updateTodos
});
//# sourceMappingURL=fab696a6faa1eb90888da22fa15a5a990938d989.js.map
