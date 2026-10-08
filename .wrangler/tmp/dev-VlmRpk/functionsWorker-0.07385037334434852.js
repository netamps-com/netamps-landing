var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
if (!("__unenv__" in performance)) {
  const proto = Performance.prototype;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key !== "constructor" && !(key in performance)) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc) {
        Object.defineProperty(performance, key, desc);
      }
    }
  }
}
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir4, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env3) {
    return 1;
  }
  hasColors(count4, env3) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd3) {
    this.#cwd = cwd3;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  _channel,
  _debugEnd,
  _debugProcess,
  _disconnect,
  _events,
  _eventsCount,
  _exiting,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _handleQueue,
  _kill,
  _linkedBinding,
  _maxListeners,
  _pendingMessage,
  _preload_modules,
  _rawDebug,
  _send,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  assert: assert2,
  availableMemory,
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  disconnect,
  dlopen,
  domain,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  hrtime: hrtime3,
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  mainModule,
  memoryUsage,
  moduleLoadList,
  nextTick,
  off,
  on,
  once,
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// .wrangler/tmp/pages-GDQKuO/functionsWorker-0.07385037334434852.mjs
import { Writable as Writable2 } from "node:stream";
import { EventEmitter as EventEmitter2 } from "node:events";
import libDefault from "events";
import libDefault2 from "util";
import libDefault3 from "util/types";
import libDefault4 from "crypto";
import libDefault5 from "dns";
import libDefault6 from "net";
import libDefault7 from "tls";
import libDefault8 from "path";
import libDefault9 from "stream";
import libDefault10 from "string_decoder";
var __create = Object.create;
var __defProp2 = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __require2 = /* @__PURE__ */ ((x) => typeof __require !== "undefined" ? __require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: /* @__PURE__ */ __name((a, b) => (typeof __require !== "undefined" ? __require : a)[b], "get")
}) : x)(function(x) {
  if (typeof __require !== "undefined") return __require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = /* @__PURE__ */ __name((fn, res, err) => /* @__PURE__ */ __name(function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
}, "__init"), "__esm");
var __commonJS = /* @__PURE__ */ __name((cb, mod) => /* @__PURE__ */ __name(function __require22() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
}, "__require2"), "__commonJS");
var __export = /* @__PURE__ */ __name((target, all) => {
  for (var name in all)
    __defProp2(target, name, { get: all[name], enumerable: true });
}, "__export");
var __copyProps = /* @__PURE__ */ __name((to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp2(to, key, { get: /* @__PURE__ */ __name(() => from[key], "get"), enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
}, "__copyProps");
var __toESM = /* @__PURE__ */ __name((mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp2(target, "default", { value: mod, enumerable: true }) : target,
  mod
)), "__toESM");
// @__NO_SIDE_EFFECTS__
function createNotImplementedError2(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError2, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented2(name) {
  const fn = /* @__PURE__ */ __name2(() => {
    throw /* @__PURE__ */ createNotImplementedError2(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented2, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedAsync(name) {
  const fn = /* @__PURE__ */ notImplemented2(name);
  fn.__promisify__ = () => /* @__PURE__ */ notImplemented2(name + ".__promisify__");
  fn.native = fn;
  return fn;
}
__name(notImplementedAsync, "notImplementedAsync");
// @__NO_SIDE_EFFECTS__
function notImplementedClass2(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass2, "notImplementedClass");
var init_utils = __esm({
  "../node_modules/unenv/dist/runtime/_internal/utils.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name2(createNotImplementedError2, "createNotImplementedError");
    __name2(notImplemented2, "notImplemented");
    __name2(notImplementedAsync, "notImplementedAsync");
    __name2(notImplementedClass2, "notImplementedClass");
  }
});
var _timeOrigin2;
var _performanceNow2;
var nodeTiming2;
var PerformanceEntry2;
var PerformanceMark3;
var PerformanceMeasure2;
var PerformanceResourceTiming2;
var PerformanceObserverEntryList2;
var Performance2;
var PerformanceObserver2;
var performance2;
var init_performance = __esm({
  "../node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_utils();
    _timeOrigin2 = globalThis.performance?.timeOrigin ?? Date.now();
    _performanceNow2 = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin2;
    nodeTiming2 = {
      name: "node",
      entryType: "node",
      startTime: 0,
      duration: 0,
      nodeStart: 0,
      v8Start: 0,
      bootstrapComplete: 0,
      environment: 0,
      loopStart: 0,
      loopExit: 0,
      idleTime: 0,
      uvMetricsInfo: {
        loopCount: 0,
        events: 0,
        eventsWaiting: 0
      },
      detail: void 0,
      toJSON() {
        return this;
      }
    };
    PerformanceEntry2 = class {
      static {
        __name(this, "PerformanceEntry");
      }
      static {
        __name2(this, "PerformanceEntry");
      }
      __unenv__ = true;
      detail;
      entryType = "event";
      name;
      startTime;
      constructor(name, options) {
        this.name = name;
        this.startTime = options?.startTime || _performanceNow2();
        this.detail = options?.detail;
      }
      get duration() {
        return _performanceNow2() - this.startTime;
      }
      toJSON() {
        return {
          name: this.name,
          entryType: this.entryType,
          startTime: this.startTime,
          duration: this.duration,
          detail: this.detail
        };
      }
    };
    PerformanceMark3 = class PerformanceMark2 extends PerformanceEntry2 {
      static {
        __name(this, "PerformanceMark2");
      }
      static {
        __name2(this, "PerformanceMark");
      }
      entryType = "mark";
      constructor() {
        super(...arguments);
      }
      get duration() {
        return 0;
      }
    };
    PerformanceMeasure2 = class extends PerformanceEntry2 {
      static {
        __name(this, "PerformanceMeasure");
      }
      static {
        __name2(this, "PerformanceMeasure");
      }
      entryType = "measure";
    };
    PerformanceResourceTiming2 = class extends PerformanceEntry2 {
      static {
        __name(this, "PerformanceResourceTiming");
      }
      static {
        __name2(this, "PerformanceResourceTiming");
      }
      entryType = "resource";
      serverTiming = [];
      connectEnd = 0;
      connectStart = 0;
      decodedBodySize = 0;
      domainLookupEnd = 0;
      domainLookupStart = 0;
      encodedBodySize = 0;
      fetchStart = 0;
      initiatorType = "";
      name = "";
      nextHopProtocol = "";
      redirectEnd = 0;
      redirectStart = 0;
      requestStart = 0;
      responseEnd = 0;
      responseStart = 0;
      secureConnectionStart = 0;
      startTime = 0;
      transferSize = 0;
      workerStart = 0;
      responseStatus = 0;
    };
    PerformanceObserverEntryList2 = class {
      static {
        __name(this, "PerformanceObserverEntryList");
      }
      static {
        __name2(this, "PerformanceObserverEntryList");
      }
      __unenv__ = true;
      getEntries() {
        return [];
      }
      getEntriesByName(_name, _type) {
        return [];
      }
      getEntriesByType(type) {
        return [];
      }
    };
    Performance2 = class {
      static {
        __name(this, "Performance");
      }
      static {
        __name2(this, "Performance");
      }
      __unenv__ = true;
      timeOrigin = _timeOrigin2;
      eventCounts = /* @__PURE__ */ new Map();
      _entries = [];
      _resourceTimingBufferSize = 0;
      navigation = void 0;
      timing = void 0;
      timerify(_fn, _options) {
        throw /* @__PURE__ */ createNotImplementedError2("Performance.timerify");
      }
      get nodeTiming() {
        return nodeTiming2;
      }
      eventLoopUtilization() {
        return {};
      }
      markResourceTiming() {
        return new PerformanceResourceTiming2("");
      }
      onresourcetimingbufferfull = null;
      now() {
        if (this.timeOrigin === _timeOrigin2) {
          return _performanceNow2();
        }
        return Date.now() - this.timeOrigin;
      }
      clearMarks(markName) {
        this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
      }
      clearMeasures(measureName) {
        this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
      }
      clearResourceTimings() {
        this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
      }
      getEntries() {
        return this._entries;
      }
      getEntriesByName(name, type) {
        return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
      }
      getEntriesByType(type) {
        return this._entries.filter((e) => e.entryType === type);
      }
      mark(name, options) {
        const entry = new PerformanceMark3(name, options);
        this._entries.push(entry);
        return entry;
      }
      measure(measureName, startOrMeasureOptions, endMark) {
        let start;
        let end;
        if (typeof startOrMeasureOptions === "string") {
          start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
          end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
        } else {
          start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
          end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
        }
        const entry = new PerformanceMeasure2(measureName, {
          startTime: start,
          detail: {
            start,
            end
          }
        });
        this._entries.push(entry);
        return entry;
      }
      setResourceTimingBufferSize(maxSize) {
        this._resourceTimingBufferSize = maxSize;
      }
      addEventListener(type, listener, options) {
        throw /* @__PURE__ */ createNotImplementedError2("Performance.addEventListener");
      }
      removeEventListener(type, listener, options) {
        throw /* @__PURE__ */ createNotImplementedError2("Performance.removeEventListener");
      }
      dispatchEvent(event) {
        throw /* @__PURE__ */ createNotImplementedError2("Performance.dispatchEvent");
      }
      toJSON() {
        return this;
      }
    };
    PerformanceObserver2 = class {
      static {
        __name(this, "PerformanceObserver");
      }
      static {
        __name2(this, "PerformanceObserver");
      }
      __unenv__ = true;
      static supportedEntryTypes = [];
      _callback = null;
      constructor(callback) {
        this._callback = callback;
      }
      takeRecords() {
        return [];
      }
      disconnect() {
        throw /* @__PURE__ */ createNotImplementedError2("PerformanceObserver.disconnect");
      }
      observe(options) {
        throw /* @__PURE__ */ createNotImplementedError2("PerformanceObserver.observe");
      }
      bind(fn) {
        return fn;
      }
      runInAsyncScope(fn, thisArg, ...args) {
        return fn.call(thisArg, ...args);
      }
      asyncId() {
        return 0;
      }
      triggerAsyncId() {
        return 0;
      }
      emitDestroy() {
        return this;
      }
    };
    performance2 = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance2();
  }
});
var init_perf_hooks = __esm({
  "../node_modules/unenv/dist/runtime/node/perf_hooks.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_performance();
  }
});
var init_performance2 = __esm({
  "../node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs"() {
    init_perf_hooks();
    if (!("__unenv__" in performance2)) {
      const proto = Performance2.prototype;
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (key !== "constructor" && !(key in performance2)) {
          const desc = Object.getOwnPropertyDescriptor(proto, key);
          if (desc) {
            Object.defineProperty(performance2, key, desc);
          }
        }
      }
    }
    globalThis.performance = performance2;
    globalThis.Performance = Performance2;
    globalThis.PerformanceEntry = PerformanceEntry2;
    globalThis.PerformanceMark = PerformanceMark3;
    globalThis.PerformanceMeasure = PerformanceMeasure2;
    globalThis.PerformanceObserver = PerformanceObserver2;
    globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList2;
    globalThis.PerformanceResourceTiming = PerformanceResourceTiming2;
  }
});
var noop_default2;
var init_noop = __esm({
  "../node_modules/unenv/dist/runtime/mock/noop.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    noop_default2 = Object.assign(() => {
    }, { __unenv__: true });
  }
});
var _console2;
var _ignoreErrors2;
var _stderr2;
var _stdout2;
var log3;
var info3;
var trace3;
var debug3;
var table3;
var error3;
var warn3;
var createTask3;
var clear3;
var count3;
var countReset3;
var dir3;
var dirxml3;
var group3;
var groupEnd3;
var groupCollapsed3;
var profile3;
var profileEnd3;
var time3;
var timeEnd3;
var timeLog3;
var timeStamp3;
var Console2;
var _times2;
var _stdoutErrorHandler2;
var _stderrErrorHandler2;
var init_console = __esm({
  "../node_modules/unenv/dist/runtime/node/console.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_noop();
    init_utils();
    _console2 = globalThis.console;
    _ignoreErrors2 = true;
    _stderr2 = new Writable2();
    _stdout2 = new Writable2();
    log3 = _console2?.log ?? noop_default2;
    info3 = _console2?.info ?? log3;
    trace3 = _console2?.trace ?? info3;
    debug3 = _console2?.debug ?? log3;
    table3 = _console2?.table ?? log3;
    error3 = _console2?.error ?? log3;
    warn3 = _console2?.warn ?? error3;
    createTask3 = _console2?.createTask ?? /* @__PURE__ */ notImplemented2("console.createTask");
    clear3 = _console2?.clear ?? noop_default2;
    count3 = _console2?.count ?? noop_default2;
    countReset3 = _console2?.countReset ?? noop_default2;
    dir3 = _console2?.dir ?? noop_default2;
    dirxml3 = _console2?.dirxml ?? noop_default2;
    group3 = _console2?.group ?? noop_default2;
    groupEnd3 = _console2?.groupEnd ?? noop_default2;
    groupCollapsed3 = _console2?.groupCollapsed ?? noop_default2;
    profile3 = _console2?.profile ?? noop_default2;
    profileEnd3 = _console2?.profileEnd ?? noop_default2;
    time3 = _console2?.time ?? noop_default2;
    timeEnd3 = _console2?.timeEnd ?? noop_default2;
    timeLog3 = _console2?.timeLog ?? noop_default2;
    timeStamp3 = _console2?.timeStamp ?? noop_default2;
    Console2 = _console2?.Console ?? /* @__PURE__ */ notImplementedClass2("console.Console");
    _times2 = /* @__PURE__ */ new Map();
    _stdoutErrorHandler2 = noop_default2;
    _stderrErrorHandler2 = noop_default2;
  }
});
var workerdConsole2;
var assert3;
var clear22;
var context2;
var count22;
var countReset22;
var createTask22;
var debug22;
var dir22;
var dirxml22;
var error22;
var group22;
var groupCollapsed22;
var groupEnd22;
var info22;
var log22;
var profile22;
var profileEnd22;
var table22;
var time22;
var timeEnd22;
var timeLog22;
var timeStamp22;
var trace22;
var warn22;
var console_default2;
var init_console2 = __esm({
  "../node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_console();
    workerdConsole2 = globalThis["console"];
    ({
      assert: assert3,
      clear: clear22,
      context: (
        // @ts-expect-error undocumented public API
        context2
      ),
      count: count22,
      countReset: countReset22,
      createTask: (
        // @ts-expect-error undocumented public API
        createTask22
      ),
      debug: debug22,
      dir: dir22,
      dirxml: dirxml22,
      error: error22,
      group: group22,
      groupCollapsed: groupCollapsed22,
      groupEnd: groupEnd22,
      info: info22,
      log: log22,
      profile: profile22,
      profileEnd: profileEnd22,
      table: table22,
      time: time22,
      timeEnd: timeEnd22,
      timeLog: timeLog22,
      timeStamp: timeStamp22,
      trace: trace22,
      warn: warn22
    } = workerdConsole2);
    Object.assign(workerdConsole2, {
      Console: Console2,
      _ignoreErrors: _ignoreErrors2,
      _stderr: _stderr2,
      _stderrErrorHandler: _stderrErrorHandler2,
      _stdout: _stdout2,
      _stdoutErrorHandler: _stdoutErrorHandler2,
      _times: _times2
    });
    console_default2 = workerdConsole2;
  }
});
var init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console = __esm({
  "../node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console"() {
    init_console2();
    globalThis.console = console_default2;
  }
});
var hrtime4;
var init_hrtime = __esm({
  "../node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    hrtime4 = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name2(/* @__PURE__ */ __name(function hrtime22(startTime) {
      const now = Date.now();
      const seconds = Math.trunc(now / 1e3);
      const nanos = now % 1e3 * 1e6;
      if (startTime) {
        let diffSeconds = seconds - startTime[0];
        let diffNanos = nanos - startTime[0];
        if (diffNanos < 0) {
          diffSeconds = diffSeconds - 1;
          diffNanos = 1e9 + diffNanos;
        }
        return [diffSeconds, diffNanos];
      }
      return [seconds, nanos];
    }, "hrtime2"), "hrtime"), { bigint: /* @__PURE__ */ __name2(/* @__PURE__ */ __name(function bigint2() {
      return BigInt(Date.now() * 1e6);
    }, "bigint"), "bigint") });
  }
});
var ReadStream2;
var init_read_stream = __esm({
  "../node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    ReadStream2 = class {
      static {
        __name(this, "ReadStream");
      }
      static {
        __name2(this, "ReadStream");
      }
      fd;
      isRaw = false;
      isTTY = false;
      constructor(fd) {
        this.fd = fd;
      }
      setRawMode(mode) {
        this.isRaw = mode;
        return this;
      }
    };
  }
});
var WriteStream2;
var init_write_stream = __esm({
  "../node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    WriteStream2 = class {
      static {
        __name(this, "WriteStream");
      }
      static {
        __name2(this, "WriteStream");
      }
      fd;
      columns = 80;
      rows = 24;
      isTTY = false;
      constructor(fd) {
        this.fd = fd;
      }
      clearLine(dir32, callback) {
        callback && callback();
        return false;
      }
      clearScreenDown(callback) {
        callback && callback();
        return false;
      }
      cursorTo(x, y, callback) {
        callback && typeof callback === "function" && callback();
        return false;
      }
      moveCursor(dx, dy, callback) {
        callback && callback();
        return false;
      }
      getColorDepth(env22) {
        return 1;
      }
      hasColors(count32, env22) {
        return false;
      }
      getWindowSize() {
        return [this.columns, this.rows];
      }
      write(str, encoding, cb) {
        if (str instanceof Uint8Array) {
          str = new TextDecoder().decode(str);
        }
        try {
          console.log(str);
        } catch {
        }
        cb && typeof cb === "function" && cb();
        return false;
      }
    };
  }
});
var init_tty = __esm({
  "../node_modules/unenv/dist/runtime/node/tty.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_read_stream();
    init_write_stream();
  }
});
var NODE_VERSION2;
var init_node_version = __esm({
  "../node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    NODE_VERSION2 = "22.14.0";
  }
});
var Process2;
var init_process = __esm({
  "../node_modules/unenv/dist/runtime/node/internal/process/process.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_tty();
    init_utils();
    init_node_version();
    Process2 = class _Process extends EventEmitter2 {
      static {
        __name(this, "_Process");
      }
      static {
        __name2(this, "Process");
      }
      env;
      hrtime;
      nextTick;
      constructor(impl) {
        super();
        this.env = impl.env;
        this.hrtime = impl.hrtime;
        this.nextTick = impl.nextTick;
        for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter2.prototype)]) {
          const value = this[prop];
          if (typeof value === "function") {
            this[prop] = value.bind(this);
          }
        }
      }
      // --- event emitter ---
      emitWarning(warning, type, code) {
        console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
      }
      emit(...args) {
        return super.emit(...args);
      }
      listeners(eventName) {
        return super.listeners(eventName);
      }
      // --- stdio (lazy initializers) ---
      #stdin;
      #stdout;
      #stderr;
      get stdin() {
        return this.#stdin ??= new ReadStream2(0);
      }
      get stdout() {
        return this.#stdout ??= new WriteStream2(1);
      }
      get stderr() {
        return this.#stderr ??= new WriteStream2(2);
      }
      // --- cwd ---
      #cwd = "/";
      chdir(cwd22) {
        this.#cwd = cwd22;
      }
      cwd() {
        return this.#cwd;
      }
      // --- dummy props and getters ---
      arch = "";
      platform = "";
      argv = [];
      argv0 = "";
      execArgv = [];
      execPath = "";
      title = "";
      pid = 200;
      ppid = 100;
      get version() {
        return `v${NODE_VERSION2}`;
      }
      get versions() {
        return { node: NODE_VERSION2 };
      }
      get allowedNodeEnvironmentFlags() {
        return /* @__PURE__ */ new Set();
      }
      get sourceMapsEnabled() {
        return false;
      }
      get debugPort() {
        return 0;
      }
      get throwDeprecation() {
        return false;
      }
      get traceDeprecation() {
        return false;
      }
      get features() {
        return {};
      }
      get release() {
        return {};
      }
      get connected() {
        return false;
      }
      get config() {
        return {};
      }
      get moduleLoadList() {
        return [];
      }
      constrainedMemory() {
        return 0;
      }
      availableMemory() {
        return 0;
      }
      uptime() {
        return 0;
      }
      resourceUsage() {
        return {};
      }
      // --- noop methods ---
      ref() {
      }
      unref() {
      }
      // --- unimplemented methods ---
      umask() {
        throw /* @__PURE__ */ createNotImplementedError2("process.umask");
      }
      getBuiltinModule() {
        return void 0;
      }
      getActiveResourcesInfo() {
        throw /* @__PURE__ */ createNotImplementedError2("process.getActiveResourcesInfo");
      }
      exit() {
        throw /* @__PURE__ */ createNotImplementedError2("process.exit");
      }
      reallyExit() {
        throw /* @__PURE__ */ createNotImplementedError2("process.reallyExit");
      }
      kill() {
        throw /* @__PURE__ */ createNotImplementedError2("process.kill");
      }
      abort() {
        throw /* @__PURE__ */ createNotImplementedError2("process.abort");
      }
      dlopen() {
        throw /* @__PURE__ */ createNotImplementedError2("process.dlopen");
      }
      setSourceMapsEnabled() {
        throw /* @__PURE__ */ createNotImplementedError2("process.setSourceMapsEnabled");
      }
      loadEnvFile() {
        throw /* @__PURE__ */ createNotImplementedError2("process.loadEnvFile");
      }
      disconnect() {
        throw /* @__PURE__ */ createNotImplementedError2("process.disconnect");
      }
      cpuUsage() {
        throw /* @__PURE__ */ createNotImplementedError2("process.cpuUsage");
      }
      setUncaughtExceptionCaptureCallback() {
        throw /* @__PURE__ */ createNotImplementedError2("process.setUncaughtExceptionCaptureCallback");
      }
      hasUncaughtExceptionCaptureCallback() {
        throw /* @__PURE__ */ createNotImplementedError2("process.hasUncaughtExceptionCaptureCallback");
      }
      initgroups() {
        throw /* @__PURE__ */ createNotImplementedError2("process.initgroups");
      }
      openStdin() {
        throw /* @__PURE__ */ createNotImplementedError2("process.openStdin");
      }
      assert() {
        throw /* @__PURE__ */ createNotImplementedError2("process.assert");
      }
      binding() {
        throw /* @__PURE__ */ createNotImplementedError2("process.binding");
      }
      // --- attached interfaces ---
      permission = { has: /* @__PURE__ */ notImplemented2("process.permission.has") };
      report = {
        directory: "",
        filename: "",
        signal: "SIGUSR2",
        compact: false,
        reportOnFatalError: false,
        reportOnSignal: false,
        reportOnUncaughtException: false,
        getReport: /* @__PURE__ */ notImplemented2("process.report.getReport"),
        writeReport: /* @__PURE__ */ notImplemented2("process.report.writeReport")
      };
      finalization = {
        register: /* @__PURE__ */ notImplemented2("process.finalization.register"),
        unregister: /* @__PURE__ */ notImplemented2("process.finalization.unregister"),
        registerBeforeExit: /* @__PURE__ */ notImplemented2("process.finalization.registerBeforeExit")
      };
      memoryUsage = Object.assign(() => ({
        arrayBuffers: 0,
        rss: 0,
        external: 0,
        heapTotal: 0,
        heapUsed: 0
      }), { rss: /* @__PURE__ */ __name2(() => 0, "rss") });
      // --- undefined props ---
      mainModule = void 0;
      domain = void 0;
      // optional
      send = void 0;
      exitCode = void 0;
      channel = void 0;
      getegid = void 0;
      geteuid = void 0;
      getgid = void 0;
      getgroups = void 0;
      getuid = void 0;
      setegid = void 0;
      seteuid = void 0;
      setgid = void 0;
      setgroups = void 0;
      setuid = void 0;
      // internals
      _events = void 0;
      _eventsCount = void 0;
      _exiting = void 0;
      _maxListeners = void 0;
      _debugEnd = void 0;
      _debugProcess = void 0;
      _fatalException = void 0;
      _getActiveHandles = void 0;
      _getActiveRequests = void 0;
      _kill = void 0;
      _preload_modules = void 0;
      _rawDebug = void 0;
      _startProfilerIdleNotifier = void 0;
      _stopProfilerIdleNotifier = void 0;
      _tickCallback = void 0;
      _disconnect = void 0;
      _handleQueue = void 0;
      _pendingMessage = void 0;
      _channel = void 0;
      _send = void 0;
      _linkedBinding = void 0;
    };
  }
});
var globalProcess2;
var getBuiltinModule2;
var workerdProcess2;
var unenvProcess2;
var exit2;
var features2;
var platform2;
var _channel2;
var _debugEnd2;
var _debugProcess2;
var _disconnect2;
var _events2;
var _eventsCount2;
var _exiting2;
var _fatalException2;
var _getActiveHandles2;
var _getActiveRequests2;
var _handleQueue2;
var _kill2;
var _linkedBinding2;
var _maxListeners2;
var _pendingMessage2;
var _preload_modules2;
var _rawDebug2;
var _send2;
var _startProfilerIdleNotifier2;
var _stopProfilerIdleNotifier2;
var _tickCallback2;
var abort2;
var addListener2;
var allowedNodeEnvironmentFlags2;
var arch2;
var argv2;
var argv02;
var assert22;
var availableMemory2;
var binding2;
var channel2;
var chdir2;
var config2;
var connected2;
var constrainedMemory2;
var cpuUsage2;
var cwd2;
var debugPort2;
var disconnect2;
var dlopen2;
var domain2;
var emit2;
var emitWarning2;
var env2;
var eventNames2;
var execArgv2;
var execPath2;
var exitCode2;
var finalization2;
var getActiveResourcesInfo2;
var getegid2;
var geteuid2;
var getgid2;
var getgroups2;
var getMaxListeners2;
var getuid2;
var hasUncaughtExceptionCaptureCallback2;
var hrtime32;
var initgroups2;
var kill2;
var listenerCount2;
var listeners2;
var loadEnvFile2;
var mainModule2;
var memoryUsage2;
var moduleLoadList2;
var nextTick2;
var off2;
var on2;
var once2;
var openStdin2;
var permission2;
var pid2;
var ppid2;
var prependListener2;
var prependOnceListener2;
var rawListeners2;
var reallyExit2;
var ref2;
var release2;
var removeAllListeners2;
var removeListener2;
var report2;
var resourceUsage2;
var send2;
var setegid2;
var seteuid2;
var setgid2;
var setgroups2;
var setMaxListeners2;
var setSourceMapsEnabled2;
var setuid2;
var setUncaughtExceptionCaptureCallback2;
var sourceMapsEnabled2;
var stderr2;
var stdin2;
var stdout2;
var throwDeprecation2;
var title2;
var traceDeprecation2;
var umask2;
var unref2;
var uptime2;
var version2;
var versions2;
var _process2;
var process_default2;
var init_process2 = __esm({
  "../node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_hrtime();
    init_process();
    globalProcess2 = globalThis["process"];
    getBuiltinModule2 = globalProcess2.getBuiltinModule;
    workerdProcess2 = getBuiltinModule2("node:process");
    unenvProcess2 = new Process2({
      env: globalProcess2.env,
      hrtime: hrtime4,
      // `nextTick` is available from workerd process v1
      nextTick: workerdProcess2.nextTick
    });
    ({ exit: exit2, features: features2, platform: platform2 } = workerdProcess2);
    ({
      _channel: _channel2,
      _debugEnd: _debugEnd2,
      _debugProcess: _debugProcess2,
      _disconnect: _disconnect2,
      _events: _events2,
      _eventsCount: _eventsCount2,
      _exiting: _exiting2,
      _fatalException: _fatalException2,
      _getActiveHandles: _getActiveHandles2,
      _getActiveRequests: _getActiveRequests2,
      _handleQueue: _handleQueue2,
      _kill: _kill2,
      _linkedBinding: _linkedBinding2,
      _maxListeners: _maxListeners2,
      _pendingMessage: _pendingMessage2,
      _preload_modules: _preload_modules2,
      _rawDebug: _rawDebug2,
      _send: _send2,
      _startProfilerIdleNotifier: _startProfilerIdleNotifier2,
      _stopProfilerIdleNotifier: _stopProfilerIdleNotifier2,
      _tickCallback: _tickCallback2,
      abort: abort2,
      addListener: addListener2,
      allowedNodeEnvironmentFlags: allowedNodeEnvironmentFlags2,
      arch: arch2,
      argv: argv2,
      argv0: argv02,
      assert: assert22,
      availableMemory: availableMemory2,
      binding: binding2,
      channel: channel2,
      chdir: chdir2,
      config: config2,
      connected: connected2,
      constrainedMemory: constrainedMemory2,
      cpuUsage: cpuUsage2,
      cwd: cwd2,
      debugPort: debugPort2,
      disconnect: disconnect2,
      dlopen: dlopen2,
      domain: domain2,
      emit: emit2,
      emitWarning: emitWarning2,
      env: env2,
      eventNames: eventNames2,
      execArgv: execArgv2,
      execPath: execPath2,
      exitCode: exitCode2,
      finalization: finalization2,
      getActiveResourcesInfo: getActiveResourcesInfo2,
      getegid: getegid2,
      geteuid: geteuid2,
      getgid: getgid2,
      getgroups: getgroups2,
      getMaxListeners: getMaxListeners2,
      getuid: getuid2,
      hasUncaughtExceptionCaptureCallback: hasUncaughtExceptionCaptureCallback2,
      hrtime: hrtime32,
      initgroups: initgroups2,
      kill: kill2,
      listenerCount: listenerCount2,
      listeners: listeners2,
      loadEnvFile: loadEnvFile2,
      mainModule: mainModule2,
      memoryUsage: memoryUsage2,
      moduleLoadList: moduleLoadList2,
      nextTick: nextTick2,
      off: off2,
      on: on2,
      once: once2,
      openStdin: openStdin2,
      permission: permission2,
      pid: pid2,
      ppid: ppid2,
      prependListener: prependListener2,
      prependOnceListener: prependOnceListener2,
      rawListeners: rawListeners2,
      reallyExit: reallyExit2,
      ref: ref2,
      release: release2,
      removeAllListeners: removeAllListeners2,
      removeListener: removeListener2,
      report: report2,
      resourceUsage: resourceUsage2,
      send: send2,
      setegid: setegid2,
      seteuid: seteuid2,
      setgid: setgid2,
      setgroups: setgroups2,
      setMaxListeners: setMaxListeners2,
      setSourceMapsEnabled: setSourceMapsEnabled2,
      setuid: setuid2,
      setUncaughtExceptionCaptureCallback: setUncaughtExceptionCaptureCallback2,
      sourceMapsEnabled: sourceMapsEnabled2,
      stderr: stderr2,
      stdin: stdin2,
      stdout: stdout2,
      throwDeprecation: throwDeprecation2,
      title: title2,
      traceDeprecation: traceDeprecation2,
      umask: umask2,
      unref: unref2,
      uptime: uptime2,
      version: version2,
      versions: versions2
    } = unenvProcess2);
    _process2 = {
      abort: abort2,
      addListener: addListener2,
      allowedNodeEnvironmentFlags: allowedNodeEnvironmentFlags2,
      hasUncaughtExceptionCaptureCallback: hasUncaughtExceptionCaptureCallback2,
      setUncaughtExceptionCaptureCallback: setUncaughtExceptionCaptureCallback2,
      loadEnvFile: loadEnvFile2,
      sourceMapsEnabled: sourceMapsEnabled2,
      arch: arch2,
      argv: argv2,
      argv0: argv02,
      chdir: chdir2,
      config: config2,
      connected: connected2,
      constrainedMemory: constrainedMemory2,
      availableMemory: availableMemory2,
      cpuUsage: cpuUsage2,
      cwd: cwd2,
      debugPort: debugPort2,
      dlopen: dlopen2,
      disconnect: disconnect2,
      emit: emit2,
      emitWarning: emitWarning2,
      env: env2,
      eventNames: eventNames2,
      execArgv: execArgv2,
      execPath: execPath2,
      exit: exit2,
      finalization: finalization2,
      features: features2,
      getBuiltinModule: getBuiltinModule2,
      getActiveResourcesInfo: getActiveResourcesInfo2,
      getMaxListeners: getMaxListeners2,
      hrtime: hrtime32,
      kill: kill2,
      listeners: listeners2,
      listenerCount: listenerCount2,
      memoryUsage: memoryUsage2,
      nextTick: nextTick2,
      on: on2,
      off: off2,
      once: once2,
      pid: pid2,
      platform: platform2,
      ppid: ppid2,
      prependListener: prependListener2,
      prependOnceListener: prependOnceListener2,
      rawListeners: rawListeners2,
      release: release2,
      removeAllListeners: removeAllListeners2,
      removeListener: removeListener2,
      report: report2,
      resourceUsage: resourceUsage2,
      setMaxListeners: setMaxListeners2,
      setSourceMapsEnabled: setSourceMapsEnabled2,
      stderr: stderr2,
      stdin: stdin2,
      stdout: stdout2,
      title: title2,
      throwDeprecation: throwDeprecation2,
      traceDeprecation: traceDeprecation2,
      umask: umask2,
      uptime: uptime2,
      version: version2,
      versions: versions2,
      // @ts-expect-error old API
      domain: domain2,
      initgroups: initgroups2,
      moduleLoadList: moduleLoadList2,
      reallyExit: reallyExit2,
      openStdin: openStdin2,
      assert: assert22,
      binding: binding2,
      send: send2,
      exitCode: exitCode2,
      channel: channel2,
      getegid: getegid2,
      geteuid: geteuid2,
      getgid: getgid2,
      getgroups: getgroups2,
      getuid: getuid2,
      setegid: setegid2,
      seteuid: seteuid2,
      setgid: setgid2,
      setgroups: setgroups2,
      setuid: setuid2,
      permission: permission2,
      mainModule: mainModule2,
      _events: _events2,
      _eventsCount: _eventsCount2,
      _exiting: _exiting2,
      _maxListeners: _maxListeners2,
      _debugEnd: _debugEnd2,
      _debugProcess: _debugProcess2,
      _fatalException: _fatalException2,
      _getActiveHandles: _getActiveHandles2,
      _getActiveRequests: _getActiveRequests2,
      _kill: _kill2,
      _preload_modules: _preload_modules2,
      _rawDebug: _rawDebug2,
      _startProfilerIdleNotifier: _startProfilerIdleNotifier2,
      _stopProfilerIdleNotifier: _stopProfilerIdleNotifier2,
      _tickCallback: _tickCallback2,
      _disconnect: _disconnect2,
      _handleQueue: _handleQueue2,
      _pendingMessage: _pendingMessage2,
      _channel: _channel2,
      _send: _send2,
      _linkedBinding: _linkedBinding2
    };
    process_default2 = _process2;
  }
});
var init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process = __esm({
  "../node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process"() {
    init_process2();
    globalThis.process = process_default2;
  }
});
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json, "json");
function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
__name(escapeHtml, "escapeHtml");
async function onRequestPost({ request, env: env22 }) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, message: "Invalid request body" }, 400);
    }
    const { email, requestId, products, intent } = body;
    if (!email || typeof email !== "string" || email.length > 254 || !EMAIL_RE.test(email) || !requestId) {
      return json({ success: false, message: "Email and requestId required" }, 400);
    }
    let totalValue = 0;
    if (products && Array.isArray(products)) {
      products.forEach((p) => {
        totalValue += (Number(p.price) || 0) * (Number(p.quantity) || 1);
      });
    }
    const formattedTotal = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR"
    }).format(totalValue);
    const safeRequestId = escapeHtml(requestId);
    const safeIntent = intent === "sell" ? "SELL" : "BUY";
    const htmlContent = `
      <h3>Netamps Request Notification</h3>
      <p>Hello,</p>
      <p>Your ${safeIntent} request <strong>${safeRequestId}</strong> has been updated.</p>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 600px;">
        <thead>
          <tr style="background-color: #f8fafc;">
            <th>Product</th>
            <th>Qty</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          ${products?.map((p) => `
            <tr>
              <td>${escapeHtml(p.category)} - ${escapeHtml(p.details)}</td>
              <td align="center">${escapeHtml(p.quantity)}</td>
              <td align="right">${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(p.price) || 0)}</td>
            </tr>
          `).join("") || '<tr><td colspan="3">No products listed.</td></tr>'}
        </tbody>
      </table>
      <p style="font-size: 16px; margin-top: 15px;">
        <strong>Total Value: ${formattedTotal}</strong>
      </p>
      <p style="font-size: 12px; color: #64748b;">
        <em>* All prices and total values mentioned are exclusive of applicable GST rates.</em>
      </p>
    `;
    const apiKey = env22.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[email] RESEND_API_KEY is not configured");
      return json({ success: false, message: "Email service is not configured. Please contact support." }, 503);
    }
    const rsRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: "Netamps Portal <no-reply@netamps.in>",
        to: email,
        subject: `Update on Request ${safeRequestId}`,
        html: htmlContent
      })
    });
    if (!rsRes.ok) {
      console.error("[email] Resend send failed:", rsRes.status, await rsRes.text().catch(() => ""));
      return json({ success: false, message: "Failed to deliver notification email. Please try again shortly." }, 502);
    }
    return json({ success: true, message: "Push email sent successfully", emailDeliveryStatus: "Sent" });
  } catch (err) {
    console.error("[email] Push error:", err);
    return json({ success: false, message: "Failed to send notification email. Please try again shortly." }, 500);
  }
}
__name(onRequestPost, "onRequestPost");
var EMAIL_RE;
var init_push = __esm({
  "api/email/push.js"() {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name2(json, "json");
    __name2(escapeHtml, "escapeHtml");
    EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
    __name2(onRequestPost, "onRequestPost");
  }
});
async function verifySession(env22, request) {
  const cookie = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(cookie.split(";").map((c) => c.trim().split("=")));
  const sessionToken = cookies["session_token"];
  if (!sessionToken || !env22.DB) {
    return null;
  }
  try {
    const row = await env22.DB.prepare(`
      SELECT s.email, u.role, s.expires_at 
      FROM sessions s 
      LEFT JOIN users u ON s.email = u.email 
      WHERE s.token = ?
    `).bind(sessionToken).first();
    if (!row) return null;
    const expiresAt = new Date(row.expires_at).getTime();
    if (Date.now() > expiresAt) {
      await env22.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(sessionToken).run();
      return null;
    }
    return { email: row.email, role: row.role || "user" };
  } catch (err) {
    console.error("Session verification error", err);
    return null;
  }
}
__name(verifySession, "verifySession");
var init_auth = __esm({
  "api/intake/auth.js"() {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name2(verifySession, "verifySession");
  }
});
function validateMagicBytes(headerArray) {
  if (headerArray.length < 4) return false;
  const hex = Array.from(headerArray).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.startsWith("504b0304")) return true;
  return false;
}
__name(validateMagicBytes, "validateMagicBytes");
async function onRequestPost2({ request, env: env22 }) {
  try {
    const user = await verifySession(env22, request);
    if (!user) {
      return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401 });
    }
    if (env22.DB) {
      try {
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const { results } = await env22.DB.prepare(
          "SELECT count(*) as c FROM audit_logs WHERE ip_address = ? AND event_type = 'UPLOAD' AND timestamp > datetime('now', '-1 minute')"
        ).bind(ip).all();
        if (results.length > 0 && results[0].c > 5) {
          return new Response(JSON.stringify({ success: false, message: "429 Too Many Requests" }), { status: 429 });
        }
      } catch (e) {
      }
    }
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) return new Response(JSON.stringify({ success: false, message: "No file payload" }), { status: 400 });
    if (file.size > MAX_PAYLOAD_SIZE) return new Response(JSON.stringify({ success: false, message: "Exceeds 10MB limit" }), { status: 413 });
    const allowedMimes = ["text/csv", "application/json", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
    const allowedExtensions = ["csv", "json", "xlsx"];
    const extension = (file.name.split(".").pop() || "").toLowerCase();
    if (!allowedMimes.includes(file.type) || !allowedExtensions.includes(extension)) {
      return new Response(JSON.stringify({ success: false, message: "415 Unsupported Media Type" }), { status: 415 });
    }
    const buffer = await file.arrayBuffer();
    const fileHashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const fileHashHex = Array.from(new Uint8Array(fileHashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const textDecoder = new TextDecoder("utf-8", { fatal: true });
    let fileText = "";
    if (extension !== "xlsx") {
      try {
        fileText = textDecoder.decode(buffer);
        if (fileText.charCodeAt(0) === 65279) {
          fileText = fileText.slice(1);
        }
      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: "415 Invalid UTF-8 Encoding" }), { status: 415 });
      }
      if (fileText.includes("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")) {
        return new Response(JSON.stringify({ success: false, message: "403 Forbidden: EICAR" }), { status: 403 });
      }
    } else {
      const headerSlice = new Uint8Array(buffer.slice(0, 4));
      if (!validateMagicBytes(headerSlice)) {
        return new Response(JSON.stringify({ success: false, message: "415 Payload Architecture Violation" }), { status: 415 });
      }
    }
    let columns = [];
    let rows = [];
    let warnings = [];
    if (extension === "json") {
      try {
        const json8 = JSON.parse(fileText);
        const data = Array.isArray(json8) ? json8 : [json8];
        if (data.length > 0) columns = Object.keys(data[0]);
        rows = data.slice(0, 1e4);
        if (data.length > 1e4) warnings.push("Row cap of 10k reached");
      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: "Invalid JSON" }), { status: 400 });
      }
    } else if (extension === "csv") {
      const lines = fileText.split("\n").filter((l) => l.trim().length > 0);
      if (lines.length > 0) {
        columns = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        const maxRows = Math.min(lines.length - 1, 1e4);
        for (let i = 1; i <= maxRows; i++) {
          const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
          let obj = {};
          columns.forEach((h, idx) => {
            obj[h] = values[idx];
          });
          rows.push(obj);
        }
        if (lines.length - 1 > 1e4) warnings.push("Row cap of 10k reached");
      }
    } else if (extension === "xlsx") {
      warnings.push("XLSX uploaded securely. Must be parsed by frontend SheetJS.");
    }
    try {
      await env22.DB.prepare(
        "INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
      ).bind(
        crypto.randomUUID(),
        (/* @__PURE__ */ new Date()).toISOString(),
        "UPLOAD",
        "Intake Import",
        JSON.stringify({ filename: file.name, size: file.size, extension, verdict: "CLEAN", sha256: fileHashHex }),
        user.email,
        request.headers.get("cf-connecting-ip") || "unknown"
      ).run();
    } catch (e) {
    }
    return new Response(JSON.stringify({
      success: true,
      columns,
      rows,
      sha256: fileHashHex,
      warnings
    }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500 });
  }
}
__name(onRequestPost2, "onRequestPost2");
var MAX_PAYLOAD_SIZE;
var init_import = __esm({
  "api/intake/import.js"() {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_auth();
    MAX_PAYLOAD_SIZE = 10 * 1024 * 1024;
    __name2(validateMagicBytes, "validateMagicBytes");
    __name2(onRequestPost2, "onRequestPost");
  }
});
async function onRequestGet({ request, env: env22 }) {
  try {
    const user = await verifySession(env22, request);
    if (!user) {
      return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
    const ownerEmail = user.email;
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const isAdmin = user.role === "admin" || ownerEmail === "admin@netamps.com";
    let query;
    let params;
    if (id) {
      if (isAdmin) {
        query = "SELECT * FROM intake_sessions WHERE id = ?";
        params = [id];
      } else {
        query = "SELECT * FROM intake_sessions WHERE id = ? AND owner_email = ?";
        params = [id, ownerEmail];
      }
      if (env22.CACHE_KV) {
        const cachedStr = await env22.CACHE_KV.get(`session:${id}`);
        if (cachedStr) {
          const cachedSession = JSON.parse(cachedStr);
          if (isAdmin || cachedSession.owner_email === ownerEmail) {
            return new Response(JSON.stringify({ success: true, session: cachedSession }), { headers: { "Content-Type": "application/json" } });
          }
        }
      }
      const { results } = await env22.DB.prepare(query).bind(...params).all();
      if (results.length === 0) {
        return new Response(JSON.stringify({ success: false, message: "Not found or forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
      const sessionRow = results[0];
      const assetsQuery = await env22.DB.prepare("SELECT data FROM intake_assets WHERE session_id = ? ORDER BY row_no ASC").bind(id).all();
      const rows = assetsQuery.results.map((r) => {
        try {
          return JSON.parse(r.data);
        } catch {
          return {};
        }
      });
      const payload = {
        mapping: sessionRow.mapping ? JSON.parse(sessionRow.mapping) : {},
        rows
      };
      const fullSession = { ...sessionRow, data: payload };
      if (env22.CACHE_KV) {
        await env22.CACHE_KV.put(`session:${id}`, JSON.stringify(fullSession), { expirationTtl: 3600 });
      }
      return new Response(JSON.stringify({ success: true, session: fullSession }), { headers: { "Content-Type": "application/json" } });
    } else {
      if (isAdmin) {
        query = "SELECT id, owner_email, status, created_at FROM intake_sessions ORDER BY created_at DESC";
        params = [];
      } else {
        query = "SELECT id, owner_email, status, created_at FROM intake_sessions WHERE owner_email = ? ORDER BY created_at DESC";
        params = [ownerEmail];
      }
      const { results } = await env22.DB.prepare(query).bind(...params).all();
      return new Response(JSON.stringify({ success: true, sessions: results }), { headers: { "Content-Type": "application/json" } });
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
__name(onRequestGet, "onRequestGet");
async function onRequestPost3({ request, env: env22 }) {
  try {
    const user = await verifySession(env22, request);
    if (!user) {
      return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
    const ownerEmail = user.email;
    const isAdmin = user.role === "admin";
    const body = await request.json();
    const { id, data, status } = body;
    if (!id || !data) {
      return new Response(JSON.stringify({ success: false, message: "Missing required fields" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    await env22.DB.prepare(`
      CREATE TABLE IF NOT EXISTS intake_sessions (
          id TEXT PRIMARY KEY,
          owner_email TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'DRAFT',
          mapping TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env22.DB.prepare(`
      CREATE TABLE IF NOT EXISTS intake_assets (
          session_id TEXT NOT NULL,
          row_no INTEGER NOT NULL,
          data TEXT NOT NULL,
          PRIMARY KEY (session_id, row_no)
      )
    `).run();
    const mappingStr = data.mapping ? JSON.stringify(data.mapping) : "{}";
    try {
      const existing = await env22.DB.prepare("SELECT owner_email FROM intake_sessions WHERE id = ?1").bind(id).first();
      if (existing && existing.owner_email !== ownerEmail && !isAdmin) {
        return new Response(JSON.stringify({ success: false, message: "Not found or forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
    } catch {
    }
    await env22.DB.prepare(
      "INSERT INTO intake_sessions (id, owner_email, status, mapping) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET mapping=excluded.mapping, status=excluded.status, updated_at=CURRENT_TIMESTAMP"
    ).bind(id, ownerEmail, status || "DRAFT", mappingStr).run();
    if (env22.CACHE_KV) {
      await env22.CACHE_KV.delete(`session:${id}`);
    }
    if (data.rows && Array.isArray(data.rows)) {
      let queued = false;
      if (data.rows.length > 500 && env22.INTAKE_QUEUE && typeof env22.INTAKE_QUEUE.send === "function") {
        try {
          const CHUNK = 50;
          for (let base = 0; base < data.rows.length; base += CHUNK) {
            await env22.INTAKE_QUEUE.send({ sessionId: id, ownerEmail, rows: data.rows.slice(base, base + CHUNK), base });
          }
          queued = true;
        } catch {
          queued = false;
        }
      }
      if (!queued) {
        const stmt = env22.DB.prepare("INSERT INTO intake_assets (session_id, row_no, data) VALUES (?, ?, ?) ON CONFLICT(session_id, row_no) DO UPDATE SET data=excluded.data");
        const batch = data.rows.map((row, idx) => stmt.bind(id, idx, JSON.stringify(row)));
        if (batch.length > 0) {
          for (let i = 0; i < batch.length; i += 100) {
            await env22.DB.batch(batch.slice(i, i + 100));
          }
        }
      }
    }
    try {
      await env22.DB.prepare(
        "INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
      ).bind(
        crypto.randomUUID(),
        (/* @__PURE__ */ new Date()).toISOString(),
        status === "EXPORTED" ? "EXPORT" : "INSPECT",
        "Intake Session",
        JSON.stringify({ session: id, row_count: Array.isArray(data.rows) ? data.rows.length : 0 }),
        ownerEmail,
        request.headers.get("cf-connecting-ip") || "unknown"
      ).run();
    } catch (e) {
    }
    return new Response(JSON.stringify({ success: true, id }), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
__name(onRequestPost3, "onRequestPost3");
var init_sessions = __esm({
  "api/intake/sessions.js"() {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_auth();
    __name2(onRequestGet, "onRequestGet");
    __name2(onRequestPost3, "onRequestPost");
  }
});
function json2(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json2, "json2");
function newOtp() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(1e5 + buf[0] % 9e5);
}
__name(newOtp, "newOtp");
function storeKind(env22) {
  if (env22.OTP_KV && typeof env22.OTP_KV.get === "function" && typeof env22.OTP_KV.put === "function") return "kv";
  if (env22.DB && typeof env22.DB.prepare === "function") return "d1";
  return null;
}
__name(storeKind, "storeKind");
function storeMisconfigured(env22) {
  return Boolean(
    env22.OTP_KV && typeof env22.OTP_KV.get !== "function" || env22.DB && typeof env22.DB.prepare !== "function"
  );
}
__name(storeMisconfigured, "storeMisconfigured");
async function ensureD1(env22) {
  await env22.DB.prepare(
    `CREATE TABLE IF NOT EXISTS otps (
       email TEXT PRIMARY KEY,
       code TEXT NOT NULL,
       attempts INTEGER NOT NULL DEFAULT 0,
       expires_at INTEGER NOT NULL,
       created_at INTEGER NOT NULL
     )`
  ).run();
  const cols = await env22.DB.prepare(`PRAGMA table_info(otps)`).all();
  const names = new Set((cols.results || []).map((c) => c.name));
  if (!names.has("code")) {
    await env22.DB.prepare(`ALTER TABLE otps ADD COLUMN code TEXT NOT NULL DEFAULT ''`).run();
  }
  if (!names.has("attempts")) {
    await env22.DB.prepare(`ALTER TABLE otps ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0`).run();
  }
  if (!names.has("expires_at")) {
    await env22.DB.prepare(`ALTER TABLE otps ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0`).run();
  }
  if (!names.has("created_at")) {
    await env22.DB.prepare(`ALTER TABLE otps ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0`).run();
  }
}
__name(ensureD1, "ensureD1");
async function readOtp(env22, email, kind) {
  if (kind === "kv") {
    return await env22.OTP_KV.get(otpKey(email), "json");
  }
  await ensureD1(env22);
  const row = await env22.DB.prepare(
    "SELECT code, attempts, expires_at AS expiresAt, created_at AS createdAt FROM otps WHERE email = ?1"
  ).bind(email.toLowerCase()).first();
  return row || null;
}
__name(readOtp, "readOtp");
async function writeOtp(env22, email, record, ttlSeconds, kind) {
  if (kind === "kv") {
    await env22.OTP_KV.put(otpKey(email), JSON.stringify(record), { expirationTtl: ttlSeconds });
    return;
  }
  await ensureD1(env22);
  await env22.DB.prepare(
    `INSERT OR REPLACE INTO otps (email, code, attempts, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`
  ).bind(email.toLowerCase(), record.code, record.attempts, record.expiresAt, record.createdAt).run();
}
__name(writeOtp, "writeOtp");
async function deleteOtp(env22, email, kind) {
  if (kind === "kv") {
    await env22.OTP_KV.delete(otpKey(email));
    return;
  }
  await env22.DB.prepare("DELETE FROM otps WHERE email = ?1").bind(email.toLowerCase()).run();
}
__name(deleteOtp, "deleteOtp");
async function readSendCounter(env22, email) {
  if (env22.OTP_KV && typeof env22.OTP_KV.get === "function") {
    return await env22.OTP_KV.get(sendKey(email), "json") || null;
  }
  return null;
}
__name(readSendCounter, "readSendCounter");
async function writeSendCounter(env22, email, counter) {
  if (env22.OTP_KV && typeof env22.OTP_KV.put === "function") {
    await env22.OTP_KV.put(sendKey(email), JSON.stringify(counter), { expirationTtl: 3600 });
  }
}
__name(writeSendCounter, "writeSendCounter");
async function sendOtpEmail(env22, to, otp) {
  const apiKey = env22.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[otp] RESEND_API_KEY is not configured");
    return { ok: false, misconfigured: true };
  }
  const html = `<h3>Your Netamps Verification Code</h3><p>Your OTP is: <strong style="font-size:24px">${otp}</strong>.</p><p>It will expire in 5 minutes. Never share this code with anyone.</p>`;
  let res;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: "Netamps Portal <no-reply@netamps.in>",
        to,
        subject: "Your Netamps Verification Code",
        html
      })
    });
  } catch (err) {
    console.error("[otp] Resend fetch threw:", String(err && err.message || err));
    return { ok: false, thrown: String(err && err.message || err) };
  }
  if (!res.ok) {
    console.error("[otp] Resend API failed:", res.status, await res.text().catch(() => ""));
    return { ok: false, status: res.status };
  }
  return { ok: true };
}
__name(sendOtpEmail, "sendOtpEmail");
async function onRequestPost4({ request, env: env22 }) {
  let stage = "parse";
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json2({ success: false, message: "Invalid request body" }, 400);
    }
    stage = "validate";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email || email.length > 254 || !EMAIL_RE2.test(email)) {
      return json2({ success: false, message: "A valid email address is required" }, 400);
    }
    stage = "store-check";
    const kind = storeKind(env22);
    if (!kind) {
      if (storeMisconfigured(env22)) {
        console.error("[otp] OTP store binding has the wrong type. OTP_KV must be a KV namespace, DB must be a D1 database.");
        return json2({ success: false, message: "Verification store misconfigured. Please contact support.", stage: "store-check" }, 503);
      }
      console.error("[otp] No OTP store bound. Bind OTP_KV (KV) or DB (D1) in Pages \u2192 Settings \u2192 Functions.");
      return json2({ success: false, message: "Verification service temporarily unavailable. Please try again shortly.", stage: "store-check" }, 503);
    }
    const nowSec = Math.floor(Date.now() / 1e3);
    stage = "rate-check";
    if (kind === "kv") {
      const counter = await readSendCounter(env22, email);
      if (counter && counter.count >= MAX_SENDS_PER_HOUR) {
        return json2({ success: false, message: "Too many codes requested. Please try again later." }, 429);
      }
    }
    stage = "otp-read";
    const existing = await readOtp(env22, email, kind);
    if (existing && nowSec - existing.createdAt < RESEND_COOLDOWN_SECONDS) {
      const wait = RESEND_COOLDOWN_SECONDS - (nowSec - existing.createdAt);
      return json2({ success: false, message: `Please wait ${wait}s before requesting a new code.` }, 429);
    }
    stage = "otp-write";
    const otp = newOtp();
    const record = { code: otp, attempts: 0, createdAt: nowSec, expiresAt: nowSec + OTP_TTL_SECONDS };
    await writeOtp(env22, email, record, OTP_TTL_SECONDS, kind);
    stage = "email-send";
    const sent = await sendOtpEmail(env22, email, otp);
    if (!sent.ok) {
      await deleteOtp(env22, email, kind);
      if (sent.misconfigured) {
        return json2({ success: false, message: "Email service is not configured. Please contact support.", stage: "email-send" }, 503);
      }
      return json2({ success: false, message: "Failed to deliver the OTP email. Please try again shortly.", stage: "email-send", detail: sent.thrown || sent.status || "unknown" }, 502);
    }
    stage = "counter-write";
    if (kind === "kv") {
      const counter = await readSendCounter(env22, email) || { count: 0 };
      await writeSendCounter(env22, email, { count: counter.count + 1 });
    }
    return json2({ success: true, message: "OTP sent successfully. It expires in 5 minutes.", expiresIn: OTP_TTL_SECONDS });
  } catch (err) {
    console.error(`[otp] Generate error at stage=${stage}:`, err);
    return json2({ success: false, message: "Failed to generate OTP. Please try again shortly.", stage }, 500);
  }
}
__name(onRequestPost4, "onRequestPost4");
var OTP_TTL_SECONDS;
var RESEND_COOLDOWN_SECONDS;
var MAX_SENDS_PER_HOUR;
var EMAIL_RE2;
var otpKey;
var sendKey;
var init_generate = __esm({
  "api/otp/generate.js"() {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    OTP_TTL_SECONDS = 300;
    RESEND_COOLDOWN_SECONDS = 30;
    MAX_SENDS_PER_HOUR = 5;
    EMAIL_RE2 = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
    __name2(json2, "json");
    __name2(newOtp, "newOtp");
    otpKey = /* @__PURE__ */ __name2((email) => `otp:${email.toLowerCase()}`, "otpKey");
    sendKey = /* @__PURE__ */ __name2((email) => `otp_send:${email.toLowerCase()}`, "sendKey");
    __name2(storeKind, "storeKind");
    __name2(storeMisconfigured, "storeMisconfigured");
    __name2(ensureD1, "ensureD1");
    __name2(readOtp, "readOtp");
    __name2(writeOtp, "writeOtp");
    __name2(deleteOtp, "deleteOtp");
    __name2(readSendCounter, "readSendCounter");
    __name2(writeSendCounter, "writeSendCounter");
    __name2(sendOtpEmail, "sendOtpEmail");
    __name2(onRequestPost4, "onRequestPost");
  }
});
function json3(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json3, "json3");
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(safeEqual, "safeEqual");
function storeKind2(env22) {
  if (env22.OTP_KV && typeof env22.OTP_KV.get === "function" && typeof env22.OTP_KV.put === "function") return "kv";
  if (env22.DB && typeof env22.DB.prepare === "function") return "d1";
  return null;
}
__name(storeKind2, "storeKind2");
async function ensureD1Schema(env22) {
  await env22.DB.prepare(
    `CREATE TABLE IF NOT EXISTS otps (
       email TEXT PRIMARY KEY,
       code TEXT NOT NULL,
       attempts INTEGER NOT NULL DEFAULT 0,
       expires_at INTEGER NOT NULL,
       created_at INTEGER NOT NULL
     )`
  ).run();
  const cols = await env22.DB.prepare(`PRAGMA table_info(otps)`).all();
  const names = new Set((cols.results || []).map((c) => c.name));
  if (!names.has("code")) {
    await env22.DB.prepare(`ALTER TABLE otps ADD COLUMN code TEXT NOT NULL DEFAULT ''`).run();
  }
  if (!names.has("attempts")) {
    await env22.DB.prepare(`ALTER TABLE otps ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0`).run();
  }
  if (!names.has("expires_at")) {
    await env22.DB.prepare(`ALTER TABLE otps ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0`).run();
  }
  if (!names.has("created_at")) {
    await env22.DB.prepare(`ALTER TABLE otps ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0`).run();
  }
}
__name(ensureD1Schema, "ensureD1Schema");
async function readOtp2(env22, email, kind) {
  if (kind === "kv") {
    return await env22.OTP_KV.get(otpKey2(email), "json");
  }
  await ensureD1Schema(env22);
  const row = await env22.DB.prepare(
    "SELECT code, attempts, expires_at AS expiresAt, created_at AS createdAt FROM otps WHERE email = ?1"
  ).bind(email.toLowerCase()).first();
  return row || null;
}
__name(readOtp2, "readOtp2");
async function writeOtp2(env22, email, record, kind) {
  if (kind === "kv") {
    const ttl = Math.max(1, record.expiresAt - Math.floor(Date.now() / 1e3));
    await env22.OTP_KV.put(otpKey2(email), JSON.stringify(record), { expirationTtl: ttl });
    return;
  }
  await env22.DB.prepare(
    `INSERT INTO otps (email, code, attempts, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(email) DO UPDATE SET code = excluded.code, attempts = excluded.attempts,
       expires_at = excluded.expires_at, created_at = excluded.created_at`
  ).bind(email.toLowerCase(), record.code, record.attempts, record.expiresAt, record.createdAt).run();
}
__name(writeOtp2, "writeOtp2");
async function deleteOtp2(env22, email, kind) {
  if (kind === "kv") {
    await env22.OTP_KV.delete(otpKey2(email));
    return;
  }
  await env22.DB.prepare("DELETE FROM otps WHERE email = ?1").bind(email.toLowerCase()).run();
}
__name(deleteOtp2, "deleteOtp2");
async function onRequestPost5({ request, env: env22 }) {
  let stage = "parse";
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json3({ success: false, message: "Invalid request body" }, 400);
    }
    stage = "validate";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!email || email.length > 254 || !EMAIL_RE3.test(email) || !CODE_RE.test(code)) {
      return json3({ success: false, message: "A valid email address and 6-digit code are required" }, 400);
    }
    stage = "store-check";
    const kind = storeKind2(env22);
    if (!kind) {
      console.error("[otp] No OTP store bound. Bind OTP_KV (KV) or DB (D1) in Pages \u2192 Settings \u2192 Functions.");
      return json3({ success: false, message: "Verification service temporarily unavailable. Please try again shortly.", stage: "store-check" }, 503);
    }
    stage = "otp-read";
    const record = await readOtp2(env22, email, kind);
    if (!record) {
      return json3({ success: false, message: "Invalid or expired OTP. Please request a new code." }, 400);
    }
    const nowSec = Math.floor(Date.now() / 1e3);
    if (nowSec > record.expiresAt) {
      stage = "otp-expire";
      await deleteOtp2(env22, email, kind);
      return json3({ success: false, message: "This OTP has expired. Please request a new code." }, 400);
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      stage = "otp-locked";
      await deleteOtp2(env22, email, kind);
      return json3({ success: false, message: "Too many incorrect attempts. Please request a new code." }, 429);
    }
    stage = "otp-compare";
    if (!safeEqual(record.code, code)) {
      record.attempts += 1;
      if (record.attempts >= MAX_ATTEMPTS) {
        await deleteOtp2(env22, email, kind);
        return json3({ success: false, message: "Too many incorrect attempts. Please request a new code." }, 429);
      }
      await writeOtp2(env22, email, record, kind);
      return json3({ success: false, message: "Invalid OTP Code." }, 400);
    }
    stage = "otp-consume";
    await deleteOtp2(env22, email, kind);
    const sessionId = crypto.randomUUID() + crypto.randomUUID();
    let role = "user";
    if (kind === "d1" || env22.DB) {
      await env22.DB.prepare(`
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          role TEXT NOT NULL,
          expires_at DATETIME NOT NULL
        )
      `).run();
      const userRow = await env22.DB.prepare("SELECT role FROM users WHERE email = ?").bind(email.toLowerCase()).first();
      if (userRow) role = userRow.role;
      const expiresAt = new Date(Date.now() + 3600 * 1e3).toISOString();
      await env22.DB.prepare("INSERT INTO sessions (token, email, role, expires_at) VALUES (?, ?, ?, ?)").bind(sessionId, email.toLowerCase(), role, expiresAt).run();
    }
    const cookie = `session_token=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`;
    return new Response(JSON.stringify({ success: true, message: "OTP verified successfully" }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookie
      }
    });
  } catch (err) {
    console.error(`[otp] Verify error at stage=${stage}:`, err);
    return json3({ success: false, message: "Failed to verify OTP. Please try again shortly.", stage }, 500);
  }
}
__name(onRequestPost5, "onRequestPost5");
var MAX_ATTEMPTS;
var EMAIL_RE3;
var CODE_RE;
var otpKey2;
var init_verify = __esm({
  "api/otp/verify.js"() {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    MAX_ATTEMPTS = 5;
    EMAIL_RE3 = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
    CODE_RE = /^[0-9]{6}$/;
    __name2(json3, "json");
    __name2(safeEqual, "safeEqual");
    otpKey2 = /* @__PURE__ */ __name2((email) => `otp:${email.toLowerCase()}`, "otpKey");
    __name2(storeKind2, "storeKind");
    __name2(ensureD1Schema, "ensureD1Schema");
    __name2(readOtp2, "readOtp");
    __name2(writeOtp2, "writeOtp");
    __name2(deleteOtp2, "deleteOtp");
    __name2(onRequestPost5, "onRequestPost");
  }
});
function json4(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json4, "json4");
async function onRequestPost6({ request, env: env22 }) {
  try {
    const caller = await verifySession(env22, request);
    if (!caller) {
      return json4({ success: false, message: "Unauthorized" }, 401);
    }
    if (caller.role !== "admin") {
      return json4({ success: false, message: "Forbidden: admin role required" }, 403);
    }
    if (!env22.DB || typeof env22.DB.prepare !== "function") {
      return json4({ success: false, message: "User store unavailable. Please try again shortly." }, 503);
    }
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const passwordHash = typeof body?.passwordHash === "string" ? body.passwordHash : "";
    const role = typeof body?.role === "string" && ALLOWED_ROLES.has(body.role) ? body.role : "staff";
    if (!email || email.length > 254 || !EMAIL_RE4.test(email)) {
      return json4({ success: false, message: "A valid email address is required" }, 400);
    }
    if (!passwordHash || passwordHash.length > 512) {
      return json4({ success: false, message: "A password hash is required" }, 400);
    }
    const existing = await env22.DB.prepare("SELECT email FROM users WHERE email = ?1").bind(email).first();
    if (existing) {
      return json4({ success: false, message: "An account with this email already exists" }, 409);
    }
    await env22.DB.prepare("INSERT INTO users (email, hash, role) VALUES (?1, ?2, ?3)").bind(email, passwordHash, role).run();
    try {
      await env22.DB.prepare(
        "INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
      ).bind(
        crypto.randomUUID(),
        (/* @__PURE__ */ new Date()).toISOString(),
        "USER_CREATE",
        "User Management",
        JSON.stringify({ created: email, role }),
        caller.email,
        request.headers.get("cf-connecting-ip") || "unknown"
      ).run();
    } catch {
    }
    return json4({ success: true });
  } catch (err) {
    console.error("[users] Create error:", err);
    return json4({ success: false, message: "Failed to create account. Please try again shortly." }, 500);
  }
}
__name(onRequestPost6, "onRequestPost6");
var EMAIL_RE4;
var ALLOWED_ROLES;
var init_create = __esm({
  "api/users/create.js"() {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_auth();
    EMAIL_RE4 = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
    ALLOWED_ROLES = /* @__PURE__ */ new Set(["admin", "staff", "user"]);
    __name2(json4, "json");
    __name2(onRequestPost6, "onRequestPost");
  }
});
function json5(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json5, "json5");
async function onRequestPost7({ request, env: env22 }) {
  try {
    const caller = await verifySession(env22, request);
    if (!caller) {
      return json5({ success: false, message: "Unauthorized" }, 401);
    }
    if (!env22.DB || typeof env22.DB.prepare !== "function") {
      return json5({ success: false, message: "User store unavailable. Please try again shortly." }, 503);
    }
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const passwordHash = typeof body?.passwordHash === "string" ? body.passwordHash : "";
    const currentPasswordHash = typeof body?.currentPasswordHash === "string" ? body.currentPasswordHash : "";
    if (!email || email.length > 254 || !EMAIL_RE5.test(email)) {
      return json5({ success: false, message: "A valid email address is required" }, 400);
    }
    if (!passwordHash || passwordHash.length > 512) {
      return json5({ success: false, message: "A new password hash is required" }, 400);
    }
    const isAdmin = caller.role === "admin";
    const isSelf = email === caller.email;
    if (!isSelf && !isAdmin) {
      return json5({ success: false, message: "Forbidden: you can only change your own password" }, 403);
    }
    if (!isAdmin) {
      const row = await env22.DB.prepare("SELECT hash FROM users WHERE email = ?1").bind(email).first();
      if (!row || row.hash !== currentPasswordHash) {
        return json5({ success: false, message: "Your current password is incorrect. Verification failed." }, 403);
      }
    } else {
      const row = await env22.DB.prepare("SELECT email FROM users WHERE email = ?1").bind(email).first();
      if (!row) {
        return json5({ success: false, message: "Account not found" }, 404);
      }
    }
    await env22.DB.prepare("UPDATE users SET hash = ?1 WHERE email = ?2").bind(passwordHash, email).run();
    try {
      await env22.DB.prepare(
        "INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
      ).bind(
        crypto.randomUUID(),
        (/* @__PURE__ */ new Date()).toISOString(),
        isAdmin && !isSelf ? "ADMIN_PASSWORD_RESET" : "PASSWORD_CHANGE",
        "User Management",
        JSON.stringify({ target: email }),
        caller.email,
        request.headers.get("cf-connecting-ip") || "unknown"
      ).run();
    } catch {
    }
    return json5({ success: true });
  } catch (err) {
    console.error("[users] Modify-password error:", err);
    return json5({ success: false, message: "Failed to update password. Please try again shortly." }, 500);
  }
}
__name(onRequestPost7, "onRequestPost7");
var EMAIL_RE5;
var init_modify_password = __esm({
  "api/users/modify-password.js"() {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_auth();
    EMAIL_RE5 = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
    __name2(json5, "json");
    __name2(onRequestPost7, "onRequestPost");
  }
});
function candidateBuckets(env22) {
  const out = [];
  if (env22.PRODUCTION_BUCKET && typeof env22.PRODUCTION_BUCKET.get === "function") out.push(env22.PRODUCTION_BUCKET);
  if (env22.QUARANTINE_BUCKET && typeof env22.QUARANTINE_BUCKET.get === "function") out.push(env22.QUARANTINE_BUCKET);
  if (env22.EVIDENCE_BUCKET && typeof env22.EVIDENCE_BUCKET.get === "function") out.push(env22.EVIDENCE_BUCKET);
  return out;
}
__name(candidateBuckets, "candidateBuckets");
function normalizeKey(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  const clean = [];
  for (const seg of segments) {
    if (!seg || seg === "." || seg === "..") return null;
    clean.push(seg);
  }
  const key = clean.join("/");
  if (!key || key.length > 1024) return null;
  return key;
}
__name(normalizeKey, "normalizeKey");
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, startStr, endStr] = m;
  if (startStr === "" && endStr === "") return null;
  let start, end;
  if (startStr === "") {
    const suffix = parseInt(endStr, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = parseInt(startStr, 10);
    end = endStr === "" ? size - 1 : parseInt(endStr, 10);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size) return "unsatisfiable";
  end = Math.min(end, size - 1);
  if (end < start) return null;
  return { offset: start, length: end - start + 1, start, end };
}
__name(parseRange, "parseRange");
function baseHeaders(object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  return headers;
}
__name(baseHeaders, "baseHeaders");
async function verifyHmac(key, exp, sig, secret) {
  if (!secret) return true;
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const data = enc.encode(`${key}:${exp}`);
  const sigBytes = new Uint8Array(sig.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
  return await crypto.subtle.verify("HMAC", cryptoKey, sigBytes, data);
}
__name(verifyHmac, "verifyHmac");
async function serveObject(object, bucket, key, request, headOnly) {
  const size = object.size;
  const range = parseRange(request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: {
        "Content-Range": `bytes */${size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": NO_STORE
      }
    });
  }
  if (range) {
    const sliced = await bucket.get(key, { range: { offset: range.offset, length: range.length } });
    const headers2 = baseHeaders(object);
    headers2.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    headers2.set("Content-Length", String(range.length));
    headers2.set("Cache-Control", IMMUTABLE_CACHE);
    const body = sliced ? sliced.body : object.body;
    return new Response(headOnly ? null : body, { status: 206, headers: headers2 });
  }
  const headers = baseHeaders(object);
  headers.set("Content-Length", String(size));
  headers.set("Cache-Control", IMMUTABLE_CACHE);
  return new Response(headOnly ? null : object.body, { status: 200, headers });
}
__name(serveObject, "serveObject");
async function handle({ request, env: env22, params, headOnly }) {
  const key = normalizeKey(params.path);
  if (!key) {
    return new Response(JSON.stringify({ success: false, error: "BAD_KEY" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": NO_STORE }
    });
  }
  const user = await verifySession(env22, request);
  if (!user) {
    return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": NO_STORE } });
  }
  const ownerEmail = user.email;
  const isAdmin = user.role === "admin" || ownerEmail === "admin@netamps.com";
  const url = new URL(request.url);
  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  if (exp !== null || sig !== null) {
    if (!exp || !/^\d+$/.test(exp) || !sig || !/^[0-9a-fA-F]+$/.test(sig) || sig.length % 2 !== 0) {
      return new Response("403 Forbidden: Invalid Signature", { status: 403, headers: { "Cache-Control": NO_STORE } });
    }
    if (Date.now() > parseInt(exp, 10)) {
      return new Response("403 Forbidden: Link Expired", { status: 403, headers: { "Cache-Control": NO_STORE } });
    }
    const isValid = await verifyHmac(key, exp, sig, env22.CDN_SECRET);
    if (!isValid) {
      return new Response("403 Forbidden: Invalid Signature", { status: 403, headers: { "Cache-Control": NO_STORE } });
    }
  }
  const ifNoneMatch = request.headers.get("if-none-match");
  for (const bucket of candidateBuckets(env22)) {
    let object = null;
    try {
      object = await bucket.get(key);
    } catch {
      continue;
    }
    if (object === null) continue;
    const uploaderEmail = object.customMetadata?.["x-owner-email"];
    const ownerKnown = uploaderEmail && uploaderEmail !== "anonymous";
    if (!isAdmin && ownerKnown && uploaderEmail !== ownerEmail) {
      return new Response("Forbidden", { status: 403, headers: { "Cache-Control": NO_STORE } });
    }
    if (ifNoneMatch && object.httpEtag && ifNoneMatch.includes(object.httpEtag)) {
      return new Response(null, {
        status: 304,
        headers: { ETag: object.httpEtag, "Accept-Ranges": "bytes", "Cache-Control": IMMUTABLE_CACHE }
      });
    }
    return serveObject(object, bucket, key, request, headOnly);
  }
  return new Response(JSON.stringify({ success: false, error: "NOT_FOUND" }), {
    status: 404,
    headers: { "Content-Type": "application/json", "Cache-Control": NO_STORE }
  });
}
__name(handle, "handle");
async function onRequestGet2(context22) {
  try {
    return await handle({ ...context22, headOnly: false });
  } catch {
    return new Response(JSON.stringify({ success: false, error: "INTERNAL_ERROR" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Cache-Control": NO_STORE }
    });
  }
}
__name(onRequestGet2, "onRequestGet2");
async function onRequestHead(context22) {
  try {
    return await handle({ ...context22, headOnly: true });
  } catch {
    return new Response(null, { status: 500, headers: { "Cache-Control": NO_STORE } });
  }
}
__name(onRequestHead, "onRequestHead");
var IMMUTABLE_CACHE;
var NO_STORE;
var init_path = __esm({
  "api/cdn/[[path]].js"() {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_auth();
    IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
    NO_STORE = "no-store";
    __name2(candidateBuckets, "candidateBuckets");
    __name2(normalizeKey, "normalizeKey");
    __name2(parseRange, "parseRange");
    __name2(baseHeaders, "baseHeaders");
    __name2(verifyHmac, "verifyHmac");
    __name2(serveObject, "serveObject");
    __name2(handle, "handle");
    __name2(onRequestGet2, "onRequestGet");
    __name2(onRequestHead, "onRequestHead");
  }
});
function json6(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json6, "json6");
async function ensureTable(env22) {
  await env22.DB.prepare(
    `CREATE TABLE IF NOT EXISTS audit_logs (
       id TEXT PRIMARY KEY,
       timestamp TEXT,
       event_type TEXT,
       page TEXT,
       details TEXT,
       username TEXT,
       ip_address TEXT
     )`
  ).run();
}
__name(ensureTable, "ensureTable");
async function onRequestPost8({ request, env: env22 }) {
  try {
    let log32;
    try {
      log32 = await request.json();
    } catch {
      return json6({ success: false, message: "Invalid request body" }, 400);
    }
    if (!log32 || typeof log32 !== "object" || !log32.id || !log32.timestamp || !log32.eventType) {
      return json6({ success: false, message: "id, timestamp and eventType are required" }, 400);
    }
    if (env22.DB) {
      await ensureTable(env22);
      await env22.DB.prepare(
        "INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
      ).bind(
        String(log32.id).slice(0, 64),
        String(log32.timestamp).slice(0, 64),
        String(log32.eventType).slice(0, 64),
        String(log32.page || "").slice(0, 200),
        String(log32.details || "").slice(0, 4e3),
        String(log32.user || "").slice(0, 254),
        String(log32.ipAddress || "").slice(0, 64)
      ).run();
    } else {
      console.warn("[logs] No DB binding; audit event accepted to local fallback only.");
    }
    if (env22.LOGS_BUCKET && typeof env22.LOGS_BUCKET.put === "function") {
      try {
        await env22.LOGS_BUCKET.put(`logs/${String(log32.id).slice(0, 64)}.json`, JSON.stringify(log32));
      } catch (err) {
        console.error("[logs] R2 archive failed (non-fatal):", err);
      }
    }
    return json6({ success: true });
  } catch (err) {
    console.error("[logs] POST error:", err);
    return json6({ success: false, message: "Failed to store audit log." }, 500);
  }
}
__name(onRequestPost8, "onRequestPost8");
async function onRequestGet3({ env: env22 }) {
  try {
    if (!env22.DB || typeof env22.DB.prepare !== "function") {
      return json6({ success: true, logs: [], store: "none" });
    }
    await ensureTable(env22);
    const { results } = await env22.DB.prepare(
      "SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 5000"
    ).all();
    const formattedLogs = (results || []).map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      eventType: row.event_type,
      page: row.page,
      details: row.details,
      user: row.username,
      ipAddress: row.ip_address
    }));
    return json6({ success: true, logs: formattedLogs, store: "d1" });
  } catch (err) {
    console.error("[logs] GET error:", err);
    return json6({ success: false, message: "Failed to read audit logs." }, 500);
  }
}
__name(onRequestGet3, "onRequestGet3");
async function onRequestDelete({ env: env22 }) {
  try {
    if (!env22.DB || typeof env22.DB.prepare !== "function") {
      return json6({ success: false, message: "DB not connected" }, 500);
    }
    await ensureTable(env22);
    await env22.DB.prepare("DELETE FROM audit_logs").run();
    return json6({ success: true, message: "Logs cleared successfully" });
  } catch (err) {
    console.error("[logs] DELETE error:", err);
    return json6({ success: false, message: "Failed to clear audit logs." }, 500);
  }
}
__name(onRequestDelete, "onRequestDelete");
var init_logs = __esm({
  "api/logs.js"() {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name2(json6, "json");
    __name2(ensureTable, "ensureTable");
    __name2(onRequestPost8, "onRequestPost");
    __name2(onRequestGet3, "onRequestGet");
    __name2(onRequestDelete, "onRequestDelete");
  }
});
var require_events = __commonJS({
  "node-built-in-modules:events"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    module.exports = libDefault;
  }
});
var require_postgres_array = __commonJS({
  "../node_modules/postgres-array/index.js"(exports) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    exports.parse = function(source, transform) {
      return new ArrayParser(source, transform).parse();
    };
    var ArrayParser = class _ArrayParser {
      static {
        __name(this, "_ArrayParser");
      }
      static {
        __name2(this, "ArrayParser");
      }
      constructor(source, transform) {
        this.source = source;
        this.transform = transform || identity;
        this.position = 0;
        this.entries = [];
        this.recorded = [];
        this.dimension = 0;
      }
      isEof() {
        return this.position >= this.source.length;
      }
      nextCharacter() {
        var character = this.source[this.position++];
        if (character === "\\") {
          return {
            value: this.source[this.position++],
            escaped: true
          };
        }
        return {
          value: character,
          escaped: false
        };
      }
      record(character) {
        this.recorded.push(character);
      }
      newEntry(includeEmpty) {
        var entry;
        if (this.recorded.length > 0 || includeEmpty) {
          entry = this.recorded.join("");
          if (entry === "NULL" && !includeEmpty) {
            entry = null;
          }
          if (entry !== null) entry = this.transform(entry);
          this.entries.push(entry);
          this.recorded = [];
        }
      }
      consumeDimensions() {
        if (this.source[0] === "[") {
          while (!this.isEof()) {
            var char = this.nextCharacter();
            if (char.value === "=") break;
          }
        }
      }
      parse(nested) {
        var character, parser, quote;
        this.consumeDimensions();
        while (!this.isEof()) {
          character = this.nextCharacter();
          if (character.value === "{" && !quote) {
            this.dimension++;
            if (this.dimension > 1) {
              parser = new _ArrayParser(this.source.substr(this.position - 1), this.transform);
              this.entries.push(parser.parse(true));
              this.position += parser.position - 2;
            }
          } else if (character.value === "}" && !quote) {
            this.dimension--;
            if (!this.dimension) {
              this.newEntry();
              if (nested) return this.entries;
            }
          } else if (character.value === '"' && !character.escaped) {
            if (quote) this.newEntry(true);
            quote = !quote;
          } else if (character.value === "," && !quote) {
            this.newEntry();
          } else {
            this.record(character.value);
          }
        }
        if (this.dimension !== 0) {
          throw new Error("array dimension not balanced");
        }
        return this.entries;
      }
    };
    function identity(value) {
      return value;
    }
    __name(identity, "identity");
    __name2(identity, "identity");
  }
});
var require_arrayParser = __commonJS({
  "../node_modules/pg-types/lib/arrayParser.js"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var array = require_postgres_array();
    module.exports = {
      create: /* @__PURE__ */ __name2(function(source, transform) {
        return {
          parse: /* @__PURE__ */ __name2(function() {
            return array.parse(source, transform);
          }, "parse")
        };
      }, "create")
    };
  }
});
var require_postgres_date = __commonJS({
  "../node_modules/postgres-date/index.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var DATE_TIME = /(\d{1,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?.*?( BC)?$/;
    var DATE = /^(\d{1,})-(\d{2})-(\d{2})( BC)?$/;
    var TIME_ZONE = /([Z+-])(\d{2})?:?(\d{2})?:?(\d{2})?/;
    var INFINITY = /^-?infinity$/;
    module.exports = /* @__PURE__ */ __name2(/* @__PURE__ */ __name(function parseDate(isoDate) {
      if (INFINITY.test(isoDate)) {
        return Number(isoDate.replace("i", "I"));
      }
      var matches = DATE_TIME.exec(isoDate);
      if (!matches) {
        return getDate(isoDate) || null;
      }
      var isBC = !!matches[8];
      var year = parseInt(matches[1], 10);
      if (isBC) {
        year = bcYearToNegativeYear(year);
      }
      var month = parseInt(matches[2], 10) - 1;
      var day = matches[3];
      var hour = parseInt(matches[4], 10);
      var minute = parseInt(matches[5], 10);
      var second = parseInt(matches[6], 10);
      var ms = matches[7];
      ms = ms ? 1e3 * parseFloat(ms) : 0;
      var date;
      var offset = timeZoneOffset(isoDate);
      if (offset != null) {
        date = new Date(Date.UTC(year, month, day, hour, minute, second, ms));
        if (is0To99(year)) {
          date.setUTCFullYear(year);
        }
        if (offset !== 0) {
          date.setTime(date.getTime() - offset);
        }
      } else {
        date = new Date(year, month, day, hour, minute, second, ms);
        if (is0To99(year)) {
          date.setFullYear(year);
        }
      }
      return date;
    }, "parseDate"), "parseDate");
    function getDate(isoDate) {
      var matches = DATE.exec(isoDate);
      if (!matches) {
        return;
      }
      var year = parseInt(matches[1], 10);
      var isBC = !!matches[4];
      if (isBC) {
        year = bcYearToNegativeYear(year);
      }
      var month = parseInt(matches[2], 10) - 1;
      var day = matches[3];
      var date = new Date(year, month, day);
      if (is0To99(year)) {
        date.setFullYear(year);
      }
      return date;
    }
    __name(getDate, "getDate");
    __name2(getDate, "getDate");
    function timeZoneOffset(isoDate) {
      if (isoDate.endsWith("+00")) {
        return 0;
      }
      var zone = TIME_ZONE.exec(isoDate.split(" ")[1]);
      if (!zone) return;
      var type = zone[1];
      if (type === "Z") {
        return 0;
      }
      var sign = type === "-" ? -1 : 1;
      var offset = parseInt(zone[2], 10) * 3600 + parseInt(zone[3] || 0, 10) * 60 + parseInt(zone[4] || 0, 10);
      return offset * sign * 1e3;
    }
    __name(timeZoneOffset, "timeZoneOffset");
    __name2(timeZoneOffset, "timeZoneOffset");
    function bcYearToNegativeYear(year) {
      return -(year - 1);
    }
    __name(bcYearToNegativeYear, "bcYearToNegativeYear");
    __name2(bcYearToNegativeYear, "bcYearToNegativeYear");
    function is0To99(num) {
      return num >= 0 && num < 100;
    }
    __name(is0To99, "is0To99");
    __name2(is0To99, "is0To99");
  }
});
var require_mutable = __commonJS({
  "../node_modules/xtend/mutable.js"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    module.exports = extend;
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    function extend(target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];
        for (var key in source) {
          if (hasOwnProperty.call(source, key)) {
            target[key] = source[key];
          }
        }
      }
      return target;
    }
    __name(extend, "extend");
    __name2(extend, "extend");
  }
});
var require_postgres_interval = __commonJS({
  "../node_modules/postgres-interval/index.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var extend = require_mutable();
    module.exports = PostgresInterval;
    function PostgresInterval(raw) {
      if (!(this instanceof PostgresInterval)) {
        return new PostgresInterval(raw);
      }
      extend(this, parse2(raw));
    }
    __name(PostgresInterval, "PostgresInterval");
    __name2(PostgresInterval, "PostgresInterval");
    var properties = ["seconds", "minutes", "hours", "days", "months", "years"];
    PostgresInterval.prototype.toPostgres = function() {
      var filtered = properties.filter(this.hasOwnProperty, this);
      if (this.milliseconds && filtered.indexOf("seconds") < 0) {
        filtered.push("seconds");
      }
      if (filtered.length === 0) return "0";
      return filtered.map(function(property) {
        var value = this[property] || 0;
        if (property === "seconds" && this.milliseconds) {
          value = (value + this.milliseconds / 1e3).toFixed(6).replace(/\.?0+$/, "");
        }
        return value + " " + property;
      }, this).join(" ");
    };
    var propertiesISOEquivalent = {
      years: "Y",
      months: "M",
      days: "D",
      hours: "H",
      minutes: "M",
      seconds: "S"
    };
    var dateProperties = ["years", "months", "days"];
    var timeProperties = ["hours", "minutes", "seconds"];
    PostgresInterval.prototype.toISOString = PostgresInterval.prototype.toISO = function() {
      var datePart = dateProperties.map(buildProperty, this).join("");
      var timePart = timeProperties.map(buildProperty, this).join("");
      return "P" + datePart + "T" + timePart;
      function buildProperty(property) {
        var value = this[property] || 0;
        if (property === "seconds" && this.milliseconds) {
          value = (value + this.milliseconds / 1e3).toFixed(6).replace(/0+$/, "");
        }
        return value + propertiesISOEquivalent[property];
      }
      __name(buildProperty, "buildProperty");
      __name2(buildProperty, "buildProperty");
    };
    var NUMBER = "([+-]?\\d+)";
    var YEAR = NUMBER + "\\s+years?";
    var MONTH = NUMBER + "\\s+mons?";
    var DAY = NUMBER + "\\s+days?";
    var TIME = "([+-])?([\\d]*):(\\d\\d):(\\d\\d)\\.?(\\d{1,6})?";
    var INTERVAL = new RegExp([YEAR, MONTH, DAY, TIME].map(function(regexString) {
      return "(" + regexString + ")?";
    }).join("\\s*"));
    var positions = {
      years: 2,
      months: 4,
      days: 6,
      hours: 9,
      minutes: 10,
      seconds: 11,
      milliseconds: 12
    };
    var negatives = ["hours", "minutes", "seconds", "milliseconds"];
    function parseMilliseconds(fraction) {
      var microseconds = fraction + "000000".slice(fraction.length);
      return parseInt(microseconds, 10) / 1e3;
    }
    __name(parseMilliseconds, "parseMilliseconds");
    __name2(parseMilliseconds, "parseMilliseconds");
    function parse2(interval) {
      if (!interval) return {};
      var matches = INTERVAL.exec(interval);
      var isNegative = matches[8] === "-";
      return Object.keys(positions).reduce(function(parsed, property) {
        var position = positions[property];
        var value = matches[position];
        if (!value) return parsed;
        value = property === "milliseconds" ? parseMilliseconds(value) : parseInt(value, 10);
        if (!value) return parsed;
        if (isNegative && ~negatives.indexOf(property)) {
          value *= -1;
        }
        parsed[property] = value;
        return parsed;
      }, {});
    }
    __name(parse2, "parse2");
    __name2(parse2, "parse");
  }
});
var require_postgres_bytea = __commonJS({
  "../node_modules/postgres-bytea/index.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var bufferFrom = Buffer.from || Buffer;
    module.exports = /* @__PURE__ */ __name2(/* @__PURE__ */ __name(function parseBytea(input) {
      if (/^\\x/.test(input)) {
        return bufferFrom(input.substr(2), "hex");
      }
      var output = "";
      var i = 0;
      while (i < input.length) {
        if (input[i] !== "\\") {
          output += input[i];
          ++i;
        } else {
          if (/[0-7]{3}/.test(input.substr(i + 1, 3))) {
            output += String.fromCharCode(parseInt(input.substr(i + 1, 3), 8));
            i += 4;
          } else {
            var backslashes = 1;
            while (i + backslashes < input.length && input[i + backslashes] === "\\") {
              backslashes++;
            }
            for (var k = 0; k < Math.floor(backslashes / 2); ++k) {
              output += "\\";
            }
            i += Math.floor(backslashes / 2) * 2;
          }
        }
      }
      return bufferFrom(output, "binary");
    }, "parseBytea"), "parseBytea");
  }
});
var require_textParsers = __commonJS({
  "../node_modules/pg-types/lib/textParsers.js"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var array = require_postgres_array();
    var arrayParser = require_arrayParser();
    var parseDate = require_postgres_date();
    var parseInterval = require_postgres_interval();
    var parseByteA = require_postgres_bytea();
    function allowNull(fn) {
      return /* @__PURE__ */ __name2(/* @__PURE__ */ __name(function nullAllowed(value) {
        if (value === null) return value;
        return fn(value);
      }, "nullAllowed"), "nullAllowed");
    }
    __name(allowNull, "allowNull");
    __name2(allowNull, "allowNull");
    function parseBool(value) {
      if (value === null) return value;
      return value === "TRUE" || value === "t" || value === "true" || value === "y" || value === "yes" || value === "on" || value === "1";
    }
    __name(parseBool, "parseBool");
    __name2(parseBool, "parseBool");
    function parseBoolArray(value) {
      if (!value) return null;
      return array.parse(value, parseBool);
    }
    __name(parseBoolArray, "parseBoolArray");
    __name2(parseBoolArray, "parseBoolArray");
    function parseBaseTenInt(string) {
      return parseInt(string, 10);
    }
    __name(parseBaseTenInt, "parseBaseTenInt");
    __name2(parseBaseTenInt, "parseBaseTenInt");
    function parseIntegerArray(value) {
      if (!value) return null;
      return array.parse(value, allowNull(parseBaseTenInt));
    }
    __name(parseIntegerArray, "parseIntegerArray");
    __name2(parseIntegerArray, "parseIntegerArray");
    function parseBigIntegerArray(value) {
      if (!value) return null;
      return array.parse(value, allowNull(function(entry) {
        return parseBigInteger(entry).trim();
      }));
    }
    __name(parseBigIntegerArray, "parseBigIntegerArray");
    __name2(parseBigIntegerArray, "parseBigIntegerArray");
    var parsePointArray = /* @__PURE__ */ __name2(function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parsePoint(entry);
        }
        return entry;
      });
      return p.parse();
    }, "parsePointArray");
    var parseFloatArray = /* @__PURE__ */ __name2(function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parseFloat(entry);
        }
        return entry;
      });
      return p.parse();
    }, "parseFloatArray");
    var parseStringArray = /* @__PURE__ */ __name2(function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value);
      return p.parse();
    }, "parseStringArray");
    var parseDateArray = /* @__PURE__ */ __name2(function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parseDate(entry);
        }
        return entry;
      });
      return p.parse();
    }, "parseDateArray");
    var parseIntervalArray = /* @__PURE__ */ __name2(function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parseInterval(entry);
        }
        return entry;
      });
      return p.parse();
    }, "parseIntervalArray");
    var parseByteAArray = /* @__PURE__ */ __name2(function(value) {
      if (!value) {
        return null;
      }
      return array.parse(value, allowNull(parseByteA));
    }, "parseByteAArray");
    var parseInteger = /* @__PURE__ */ __name2(function(value) {
      return parseInt(value, 10);
    }, "parseInteger");
    var parseBigInteger = /* @__PURE__ */ __name2(function(value) {
      var valStr = String(value);
      if (/^\d+$/.test(valStr)) {
        return valStr;
      }
      return value;
    }, "parseBigInteger");
    var parseJsonArray = /* @__PURE__ */ __name2(function(value) {
      if (!value) {
        return null;
      }
      return array.parse(value, allowNull(JSON.parse));
    }, "parseJsonArray");
    var parsePoint = /* @__PURE__ */ __name2(function(value) {
      if (value[0] !== "(") {
        return null;
      }
      value = value.substring(1, value.length - 1).split(",");
      return {
        x: parseFloat(value[0]),
        y: parseFloat(value[1])
      };
    }, "parsePoint");
    var parseCircle = /* @__PURE__ */ __name2(function(value) {
      if (value[0] !== "<" && value[1] !== "(") {
        return null;
      }
      var point = "(";
      var radius = "";
      var pointParsed = false;
      for (var i = 2; i < value.length - 1; i++) {
        if (!pointParsed) {
          point += value[i];
        }
        if (value[i] === ")") {
          pointParsed = true;
          continue;
        } else if (!pointParsed) {
          continue;
        }
        if (value[i] === ",") {
          continue;
        }
        radius += value[i];
      }
      var result = parsePoint(point);
      result.radius = parseFloat(radius);
      return result;
    }, "parseCircle");
    var init = /* @__PURE__ */ __name2(function(register) {
      register(20, parseBigInteger);
      register(21, parseInteger);
      register(23, parseInteger);
      register(26, parseInteger);
      register(700, parseFloat);
      register(701, parseFloat);
      register(16, parseBool);
      register(1082, parseDate);
      register(1114, parseDate);
      register(1184, parseDate);
      register(600, parsePoint);
      register(651, parseStringArray);
      register(718, parseCircle);
      register(1e3, parseBoolArray);
      register(1001, parseByteAArray);
      register(1005, parseIntegerArray);
      register(1007, parseIntegerArray);
      register(1028, parseIntegerArray);
      register(1016, parseBigIntegerArray);
      register(1017, parsePointArray);
      register(1021, parseFloatArray);
      register(1022, parseFloatArray);
      register(1231, parseFloatArray);
      register(1014, parseStringArray);
      register(1015, parseStringArray);
      register(1008, parseStringArray);
      register(1009, parseStringArray);
      register(1040, parseStringArray);
      register(1041, parseStringArray);
      register(1115, parseDateArray);
      register(1182, parseDateArray);
      register(1185, parseDateArray);
      register(1186, parseInterval);
      register(1187, parseIntervalArray);
      register(17, parseByteA);
      register(114, JSON.parse.bind(JSON));
      register(3802, JSON.parse.bind(JSON));
      register(199, parseJsonArray);
      register(3807, parseJsonArray);
      register(3907, parseStringArray);
      register(2951, parseStringArray);
      register(791, parseStringArray);
      register(1183, parseStringArray);
      register(1270, parseStringArray);
    }, "init");
    module.exports = {
      init
    };
  }
});
var require_pg_int8 = __commonJS({
  "../node_modules/pg-int8/index.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var BASE = 1e6;
    function readInt8(buffer) {
      var high = buffer.readInt32BE(0);
      var low = buffer.readUInt32BE(4);
      var sign = "";
      if (high < 0) {
        high = ~high + (low === 0);
        low = ~low + 1 >>> 0;
        sign = "-";
      }
      var result = "";
      var carry;
      var t;
      var digits;
      var pad;
      var l;
      var i;
      {
        carry = high % BASE;
        high = high / BASE >>> 0;
        t = 4294967296 * carry + low;
        low = t / BASE >>> 0;
        digits = "" + (t - BASE * low);
        if (low === 0 && high === 0) {
          return sign + digits + result;
        }
        pad = "";
        l = 6 - digits.length;
        for (i = 0; i < l; i++) {
          pad += "0";
        }
        result = pad + digits + result;
      }
      {
        carry = high % BASE;
        high = high / BASE >>> 0;
        t = 4294967296 * carry + low;
        low = t / BASE >>> 0;
        digits = "" + (t - BASE * low);
        if (low === 0 && high === 0) {
          return sign + digits + result;
        }
        pad = "";
        l = 6 - digits.length;
        for (i = 0; i < l; i++) {
          pad += "0";
        }
        result = pad + digits + result;
      }
      {
        carry = high % BASE;
        high = high / BASE >>> 0;
        t = 4294967296 * carry + low;
        low = t / BASE >>> 0;
        digits = "" + (t - BASE * low);
        if (low === 0 && high === 0) {
          return sign + digits + result;
        }
        pad = "";
        l = 6 - digits.length;
        for (i = 0; i < l; i++) {
          pad += "0";
        }
        result = pad + digits + result;
      }
      {
        carry = high % BASE;
        t = 4294967296 * carry + low;
        digits = "" + t % BASE;
        return sign + digits + result;
      }
    }
    __name(readInt8, "readInt8");
    __name2(readInt8, "readInt8");
    module.exports = readInt8;
  }
});
var require_binaryParsers = __commonJS({
  "../node_modules/pg-types/lib/binaryParsers.js"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var parseInt64 = require_pg_int8();
    var parseBits = /* @__PURE__ */ __name2(function(data, bits, offset, invert, callback) {
      offset = offset || 0;
      invert = invert || false;
      callback = callback || function(lastValue, newValue, bits2) {
        return lastValue * Math.pow(2, bits2) + newValue;
      };
      var offsetBytes = offset >> 3;
      var inv = /* @__PURE__ */ __name2(function(value) {
        if (invert) {
          return ~value & 255;
        }
        return value;
      }, "inv");
      var mask = 255;
      var firstBits = 8 - offset % 8;
      if (bits < firstBits) {
        mask = 255 << 8 - bits & 255;
        firstBits = bits;
      }
      if (offset) {
        mask = mask >> offset % 8;
      }
      var result = 0;
      if (offset % 8 + bits >= 8) {
        result = callback(0, inv(data[offsetBytes]) & mask, firstBits);
      }
      var bytes = bits + offset >> 3;
      for (var i = offsetBytes + 1; i < bytes; i++) {
        result = callback(result, inv(data[i]), 8);
      }
      var lastBits = (bits + offset) % 8;
      if (lastBits > 0) {
        result = callback(result, inv(data[bytes]) >> 8 - lastBits, lastBits);
      }
      return result;
    }, "parseBits");
    var parseFloatFromBits = /* @__PURE__ */ __name2(function(data, precisionBits, exponentBits) {
      var bias = Math.pow(2, exponentBits - 1) - 1;
      var sign = parseBits(data, 1);
      var exponent = parseBits(data, exponentBits, 1);
      if (exponent === 0) {
        return 0;
      }
      var precisionBitsCounter = 1;
      var parsePrecisionBits = /* @__PURE__ */ __name2(function(lastValue, newValue, bits) {
        if (lastValue === 0) {
          lastValue = 1;
        }
        for (var i = 1; i <= bits; i++) {
          precisionBitsCounter /= 2;
          if ((newValue & 1 << bits - i) > 0) {
            lastValue += precisionBitsCounter;
          }
        }
        return lastValue;
      }, "parsePrecisionBits");
      var mantissa = parseBits(data, precisionBits, exponentBits + 1, false, parsePrecisionBits);
      if (exponent == Math.pow(2, exponentBits + 1) - 1) {
        if (mantissa === 0) {
          return sign === 0 ? Infinity : -Infinity;
        }
        return NaN;
      }
      return (sign === 0 ? 1 : -1) * Math.pow(2, exponent - bias) * mantissa;
    }, "parseFloatFromBits");
    var parseInt16 = /* @__PURE__ */ __name2(function(value) {
      if (parseBits(value, 1) == 1) {
        return -1 * (parseBits(value, 15, 1, true) + 1);
      }
      return parseBits(value, 15, 1);
    }, "parseInt16");
    var parseInt32 = /* @__PURE__ */ __name2(function(value) {
      if (parseBits(value, 1) == 1) {
        return -1 * (parseBits(value, 31, 1, true) + 1);
      }
      return parseBits(value, 31, 1);
    }, "parseInt32");
    var parseFloat32 = /* @__PURE__ */ __name2(function(value) {
      return parseFloatFromBits(value, 23, 8);
    }, "parseFloat32");
    var parseFloat64 = /* @__PURE__ */ __name2(function(value) {
      return parseFloatFromBits(value, 52, 11);
    }, "parseFloat64");
    var parseNumeric = /* @__PURE__ */ __name2(function(value) {
      var sign = parseBits(value, 16, 32);
      if (sign == 49152) {
        return NaN;
      }
      var weight = Math.pow(1e4, parseBits(value, 16, 16));
      var result = 0;
      var digits = [];
      var ndigits = parseBits(value, 16);
      for (var i = 0; i < ndigits; i++) {
        result += parseBits(value, 16, 64 + 16 * i) * weight;
        weight /= 1e4;
      }
      var scale = Math.pow(10, parseBits(value, 16, 48));
      return (sign === 0 ? 1 : -1) * Math.round(result * scale) / scale;
    }, "parseNumeric");
    var parseDate = /* @__PURE__ */ __name2(function(isUTC, value) {
      var sign = parseBits(value, 1);
      var rawValue = parseBits(value, 63, 1);
      var result = new Date((sign === 0 ? 1 : -1) * rawValue / 1e3 + 9466848e5);
      if (!isUTC) {
        result.setTime(result.getTime() + result.getTimezoneOffset() * 6e4);
      }
      result.usec = rawValue % 1e3;
      result.getMicroSeconds = function() {
        return this.usec;
      };
      result.setMicroSeconds = function(value2) {
        this.usec = value2;
      };
      result.getUTCMicroSeconds = function() {
        return this.usec;
      };
      return result;
    }, "parseDate");
    var parseArray = /* @__PURE__ */ __name2(function(value) {
      var dim = parseBits(value, 32);
      var flags2 = parseBits(value, 32, 32);
      var elementType = parseBits(value, 32, 64);
      var offset = 96;
      var dims = [];
      for (var i = 0; i < dim; i++) {
        dims[i] = parseBits(value, 32, offset);
        offset += 32;
        offset += 32;
      }
      var parseElement = /* @__PURE__ */ __name2(function(elementType2) {
        var length = parseBits(value, 32, offset);
        offset += 32;
        if (length == 4294967295) {
          return null;
        }
        var result;
        if (elementType2 == 23 || elementType2 == 20) {
          result = parseBits(value, length * 8, offset);
          offset += length * 8;
          return result;
        } else if (elementType2 == 25) {
          result = value.toString(this.encoding, offset >> 3, (offset += length << 3) >> 3);
          return result;
        } else {
          console.log("ERROR: ElementType not implemented: " + elementType2);
        }
      }, "parseElement");
      var parse2 = /* @__PURE__ */ __name2(function(dimension, elementType2) {
        var array = [];
        var i2;
        if (dimension.length > 1) {
          var count32 = dimension.shift();
          for (i2 = 0; i2 < count32; i2++) {
            array[i2] = parse2(dimension, elementType2);
          }
          dimension.unshift(count32);
        } else {
          for (i2 = 0; i2 < dimension[0]; i2++) {
            array[i2] = parseElement(elementType2);
          }
        }
        return array;
      }, "parse");
      return parse2(dims, elementType);
    }, "parseArray");
    var parseText = /* @__PURE__ */ __name2(function(value) {
      return value.toString("utf8");
    }, "parseText");
    var parseBool = /* @__PURE__ */ __name2(function(value) {
      if (value === null) return null;
      return parseBits(value, 8) > 0;
    }, "parseBool");
    var init = /* @__PURE__ */ __name2(function(register) {
      register(20, parseInt64);
      register(21, parseInt16);
      register(23, parseInt32);
      register(26, parseInt32);
      register(1700, parseNumeric);
      register(700, parseFloat32);
      register(701, parseFloat64);
      register(16, parseBool);
      register(1114, parseDate.bind(null, false));
      register(1184, parseDate.bind(null, true));
      register(1e3, parseArray);
      register(1007, parseArray);
      register(1016, parseArray);
      register(1008, parseArray);
      register(1009, parseArray);
      register(25, parseText);
    }, "init");
    module.exports = {
      init
    };
  }
});
var require_builtins = __commonJS({
  "../node_modules/pg-types/lib/builtins.js"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    module.exports = {
      BOOL: 16,
      BYTEA: 17,
      CHAR: 18,
      INT8: 20,
      INT2: 21,
      INT4: 23,
      REGPROC: 24,
      TEXT: 25,
      OID: 26,
      TID: 27,
      XID: 28,
      CID: 29,
      JSON: 114,
      XML: 142,
      PG_NODE_TREE: 194,
      SMGR: 210,
      PATH: 602,
      POLYGON: 604,
      CIDR: 650,
      FLOAT4: 700,
      FLOAT8: 701,
      ABSTIME: 702,
      RELTIME: 703,
      TINTERVAL: 704,
      CIRCLE: 718,
      MACADDR8: 774,
      MONEY: 790,
      MACADDR: 829,
      INET: 869,
      ACLITEM: 1033,
      BPCHAR: 1042,
      VARCHAR: 1043,
      DATE: 1082,
      TIME: 1083,
      TIMESTAMP: 1114,
      TIMESTAMPTZ: 1184,
      INTERVAL: 1186,
      TIMETZ: 1266,
      BIT: 1560,
      VARBIT: 1562,
      NUMERIC: 1700,
      REFCURSOR: 1790,
      REGPROCEDURE: 2202,
      REGOPER: 2203,
      REGOPERATOR: 2204,
      REGCLASS: 2205,
      REGTYPE: 2206,
      UUID: 2950,
      TXID_SNAPSHOT: 2970,
      PG_LSN: 3220,
      PG_NDISTINCT: 3361,
      PG_DEPENDENCIES: 3402,
      TSVECTOR: 3614,
      TSQUERY: 3615,
      GTSVECTOR: 3642,
      REGCONFIG: 3734,
      REGDICTIONARY: 3769,
      JSONB: 3802,
      REGNAMESPACE: 4089,
      REGROLE: 4096
    };
  }
});
var require_pg_types = __commonJS({
  "../node_modules/pg-types/index.js"(exports) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var textParsers = require_textParsers();
    var binaryParsers = require_binaryParsers();
    var arrayParser = require_arrayParser();
    var builtinTypes = require_builtins();
    exports.getTypeParser = getTypeParser;
    exports.setTypeParser = setTypeParser;
    exports.arrayParser = arrayParser;
    exports.builtins = builtinTypes;
    var typeParsers = {
      text: {},
      binary: {}
    };
    function noParse(val) {
      return String(val);
    }
    __name(noParse, "noParse");
    __name2(noParse, "noParse");
    function getTypeParser(oid, format) {
      format = format || "text";
      if (!typeParsers[format]) {
        return noParse;
      }
      return typeParsers[format][oid] || noParse;
    }
    __name(getTypeParser, "getTypeParser");
    __name2(getTypeParser, "getTypeParser");
    function setTypeParser(oid, format, parseFn) {
      if (typeof format == "function") {
        parseFn = format;
        format = "text";
      }
      typeParsers[format][oid] = parseFn;
    }
    __name(setTypeParser, "setTypeParser");
    __name2(setTypeParser, "setTypeParser");
    textParsers.init(function(oid, converter) {
      typeParsers.text[oid] = converter;
    });
    binaryParsers.init(function(oid, converter) {
      typeParsers.binary[oid] = converter;
    });
  }
});
var require_defaults = __commonJS({
  "../node_modules/pg/lib/defaults.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var user;
    try {
      user = process.platform === "win32" ? process.env.USERNAME : process.env.USER;
    } catch {
    }
    module.exports = {
      // database host. defaults to localhost
      host: "localhost",
      // database user's name
      user,
      // name of database to connect
      database: void 0,
      // database user's password
      password: null,
      // a Postgres connection string to be used instead of setting individual connection items
      // NOTE:  Setting this value will cause it to override any other value (such as database or user) defined
      // in the defaults object.
      connectionString: void 0,
      // database port
      port: 5432,
      // number of rows to return at a time from a prepared statement's
      // portal. 0 will return all rows at once
      rows: 0,
      // binary result mode
      binary: false,
      // Connection pool options - see https://github.com/brianc/node-pg-pool
      // number of connections to use in connection pool
      // 0 will disable connection pooling
      max: 10,
      // max milliseconds a client can go unused before it is removed
      // from the pool and destroyed
      idleTimeoutMillis: 3e4,
      client_encoding: "",
      ssl: false,
      // SSL negotiation style: 'postgres' (traditional SSLRequest) or 'direct'
      sslnegotiation: void 0,
      application_name: void 0,
      fallback_application_name: void 0,
      options: void 0,
      parseInputDatesAsUTC: false,
      // max milliseconds any query using this connection will execute for before timing out in error.
      // false=unlimited
      statement_timeout: false,
      // Abort any statement that waits longer than the specified duration in milliseconds while attempting to acquire a lock.
      // false=unlimited
      lock_timeout: false,
      // Terminate any session with an open transaction that has been idle for longer than the specified duration in milliseconds
      // false=unlimited
      idle_in_transaction_session_timeout: false,
      // max milliseconds to wait for query to complete (client side)
      query_timeout: false,
      connect_timeout: 0,
      keepalives: 1,
      keepalives_idle: 0
    };
    var pgTypes = require_pg_types();
    var parseBigInteger = pgTypes.getTypeParser(20, "text");
    var parseBigIntegerArray = pgTypes.getTypeParser(1016, "text");
    module.exports.__defineSetter__("parseInt8", function(val) {
      pgTypes.setTypeParser(20, "text", val ? pgTypes.getTypeParser(23, "text") : parseBigInteger);
      pgTypes.setTypeParser(1016, "text", val ? pgTypes.getTypeParser(1007, "text") : parseBigIntegerArray);
    });
  }
});
var require_util = __commonJS({
  "node-built-in-modules:util"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    module.exports = libDefault2;
  }
});
var require_types = __commonJS({
  "node-built-in-modules:util/types"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    module.exports = libDefault3;
  }
});
var require_utils = __commonJS({
  "../node_modules/pg/lib/utils.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var defaults2 = require_defaults();
    var nodeUtils = require_util();
    var { isDate } = require_types();
    var invalidDateDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Sending an invalid date to Postgres is deprecated and will throw an error in the next major version of pg. Ensure any Date object passed as a query parameter is valid.",
      "PG_INVALID_DATE"
    );
    function escapeElement(elementRepresentation) {
      const escaped = elementRepresentation.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return '"' + escaped + '"';
    }
    __name(escapeElement, "escapeElement");
    __name2(escapeElement, "escapeElement");
    function arrayString(val) {
      let result = "{";
      for (let i = 0; i < val.length; i++) {
        if (i > 0) {
          result += ",";
        }
        let item = val[i];
        if (item == null) {
          result += "NULL";
        } else if (Array.isArray(item)) {
          result += arrayString(item);
        } else if (ArrayBuffer.isView(item)) {
          if (!(item instanceof Buffer)) {
            item = Buffer.from(item.buffer, item.byteOffset, item.byteLength);
          }
          result += "\\\\x" + item.toString("hex");
        } else {
          result += escapeElement(prepareValue(item));
        }
      }
      result += "}";
      return result;
    }
    __name(arrayString, "arrayString");
    __name2(arrayString, "arrayString");
    var prepareValue = /* @__PURE__ */ __name2(function(val, seen) {
      if (val == null) {
        return null;
      }
      if (typeof val === "object") {
        if (val instanceof Buffer) {
          return val;
        }
        if (ArrayBuffer.isView(val)) {
          return Buffer.from(val.buffer, val.byteOffset, val.byteLength);
        }
        if (isDate(val)) {
          if (isNaN(val.getTime())) {
            invalidDateDeprecationNotice();
          }
          if (defaults2.parseInputDatesAsUTC) {
            return dateToStringUTC(val);
          } else {
            return dateToString(val);
          }
        }
        if (Array.isArray(val)) {
          return arrayString(val);
        }
        return prepareObject(val, seen);
      }
      return val.toString();
    }, "prepareValue");
    function prepareObject(val, seen) {
      if (val && typeof val.toPostgres === "function") {
        seen = seen || [];
        if (seen.indexOf(val) !== -1) {
          throw new Error('circular reference detected while preparing "' + val + '" for query');
        }
        seen.push(val);
        return prepareValue(val.toPostgres(prepareValue), seen);
      }
      return JSON.stringify(val);
    }
    __name(prepareObject, "prepareObject");
    __name2(prepareObject, "prepareObject");
    function dateToString(date) {
      let offset = -date.getTimezoneOffset();
      let year = date.getFullYear();
      const isBCYear = year < 1;
      if (isBCYear) year = Math.abs(year) + 1;
      let ret = String(year).padStart(4, "0") + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0") + "T" + String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0") + ":" + String(date.getSeconds()).padStart(2, "0") + "." + String(date.getMilliseconds()).padStart(3, "0");
      if (offset < 0) {
        ret += "-";
        offset *= -1;
      } else {
        ret += "+";
      }
      ret += String(Math.floor(offset / 60)).padStart(2, "0") + ":" + String(offset % 60).padStart(2, "0");
      if (isBCYear) ret += " BC";
      return ret;
    }
    __name(dateToString, "dateToString");
    __name2(dateToString, "dateToString");
    function dateToStringUTC(date) {
      let year = date.getUTCFullYear();
      const isBCYear = year < 1;
      if (isBCYear) year = Math.abs(year) + 1;
      let ret = String(year).padStart(4, "0") + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0") + "T" + String(date.getUTCHours()).padStart(2, "0") + ":" + String(date.getUTCMinutes()).padStart(2, "0") + ":" + String(date.getUTCSeconds()).padStart(2, "0") + "." + String(date.getUTCMilliseconds()).padStart(3, "0");
      ret += "+00:00";
      if (isBCYear) ret += " BC";
      return ret;
    }
    __name(dateToStringUTC, "dateToStringUTC");
    __name2(dateToStringUTC, "dateToStringUTC");
    function normalizeQueryConfig(config22, values, callback) {
      config22 = typeof config22 === "string" ? { text: config22 } : cloneQueryConfig(config22);
      if (values) {
        if (typeof values === "function") {
          config22.callback = values;
        } else {
          config22.values = values;
        }
      }
      if (callback) {
        config22.callback = callback;
      }
      return config22;
    }
    __name(normalizeQueryConfig, "normalizeQueryConfig");
    __name2(normalizeQueryConfig, "normalizeQueryConfig");
    function cloneQueryConfig(config22) {
      if (config22 == null) {
        return config22;
      }
      return Object.defineProperties(Object.create(Object.getPrototypeOf(config22)), Object.getOwnPropertyDescriptors(config22));
    }
    __name(cloneQueryConfig, "cloneQueryConfig");
    __name2(cloneQueryConfig, "cloneQueryConfig");
    var escapeIdentifier2 = /* @__PURE__ */ __name2(function(str) {
      return '"' + str.replace(/"/g, '""') + '"';
    }, "escapeIdentifier");
    var escapeLiteral2 = /* @__PURE__ */ __name2(function(str) {
      let hasBackslash = false;
      let escaped = "'";
      if (str == null) {
        return "''";
      }
      if (typeof str !== "string") {
        return "''";
      }
      for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (c === "'") {
          escaped += c + c;
        } else if (c === "\\") {
          escaped += c + c;
          hasBackslash = true;
        } else {
          escaped += c;
        }
      }
      escaped += "'";
      if (hasBackslash === true) {
        escaped = " E" + escaped;
      }
      return escaped;
    }, "escapeLiteral");
    module.exports = {
      prepareValue: /* @__PURE__ */ __name2(/* @__PURE__ */ __name(function prepareValueWrapper(value) {
        return prepareValue(value);
      }, "prepareValueWrapper"), "prepareValueWrapper"),
      normalizeQueryConfig,
      escapeIdentifier: escapeIdentifier2,
      escapeLiteral: escapeLiteral2
    };
  }
});
var require_crypto = __commonJS({
  "node-built-in-modules:crypto"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    module.exports = libDefault4;
  }
});
var require_utils2 = __commonJS({
  "../node_modules/pg/lib/crypto/utils.js"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var nodeCrypto = require_crypto();
    module.exports = {
      postgresMd5PasswordHash,
      randomBytes,
      deriveKey,
      sha256,
      hashByName,
      hmacSha256,
      md5
    };
    var webCrypto = nodeCrypto.webcrypto || globalThis.crypto;
    var subtleCrypto = webCrypto.subtle;
    var textEncoder = new TextEncoder();
    function randomBytes(length) {
      return webCrypto.getRandomValues(Buffer.alloc(length));
    }
    __name(randomBytes, "randomBytes");
    __name2(randomBytes, "randomBytes");
    async function md5(string) {
      try {
        return nodeCrypto.createHash("md5").update(string, "utf-8").digest("hex");
      } catch (e) {
        const data = typeof string === "string" ? textEncoder.encode(string) : string;
        const hash = await subtleCrypto.digest("MD5", data);
        return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
    }
    __name(md5, "md5");
    __name2(md5, "md5");
    async function postgresMd5PasswordHash(user, password, salt) {
      const inner = await md5(password + user);
      const outer = await md5(Buffer.concat([Buffer.from(inner), salt]));
      return "md5" + outer;
    }
    __name(postgresMd5PasswordHash, "postgresMd5PasswordHash");
    __name2(postgresMd5PasswordHash, "postgresMd5PasswordHash");
    async function sha256(text) {
      return await subtleCrypto.digest("SHA-256", text);
    }
    __name(sha256, "sha256");
    __name2(sha256, "sha256");
    async function hashByName(hashName, text) {
      return await subtleCrypto.digest(hashName, text);
    }
    __name(hashByName, "hashByName");
    __name2(hashByName, "hashByName");
    async function hmacSha256(keyBuffer, msg) {
      const key = await subtleCrypto.importKey("raw", keyBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      return await subtleCrypto.sign("HMAC", key, textEncoder.encode(msg));
    }
    __name(hmacSha256, "hmacSha256");
    __name2(hmacSha256, "hmacSha256");
    async function deriveKey(password, salt, iterations) {
      const key = await subtleCrypto.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
      const params = { name: "PBKDF2", hash: "SHA-256", salt, iterations };
      return await subtleCrypto.deriveBits(params, key, 32 * 8, ["deriveBits"]);
    }
    __name(deriveKey, "deriveKey");
    __name2(deriveKey, "deriveKey");
  }
});
var require_cert_signatures = __commonJS({
  "../node_modules/pg/lib/crypto/cert-signatures.js"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    function x509Error(msg, cert) {
      return new Error("SASL channel binding: " + msg + " when parsing public certificate " + cert.toString("base64"));
    }
    __name(x509Error, "x509Error");
    __name2(x509Error, "x509Error");
    function readASN1Length(data, index) {
      let length = data[index++];
      if (length < 128) return { length, index };
      const lengthBytes = length & 127;
      if (lengthBytes > 4) throw x509Error("bad length", data);
      length = 0;
      for (let i = 0; i < lengthBytes; i++) {
        length = length << 8 | data[index++];
      }
      return { length, index };
    }
    __name(readASN1Length, "readASN1Length");
    __name2(readASN1Length, "readASN1Length");
    function readASN1OID(data, index) {
      if (data[index++] !== 6) throw x509Error("non-OID data", data);
      const { length: OIDLength, index: indexAfterOIDLength } = readASN1Length(data, index);
      index = indexAfterOIDLength;
      const lastIndex = index + OIDLength;
      const byte1 = data[index++];
      let oid = (byte1 / 40 >> 0) + "." + byte1 % 40;
      while (index < lastIndex) {
        let value = 0;
        while (index < lastIndex) {
          const nextByte = data[index++];
          value = value << 7 | nextByte & 127;
          if (nextByte < 128) break;
        }
        oid += "." + value;
      }
      return { oid, index };
    }
    __name(readASN1OID, "readASN1OID");
    __name2(readASN1OID, "readASN1OID");
    function expectASN1Seq(data, index) {
      if (data[index++] !== 48) throw x509Error("non-sequence data", data);
      return readASN1Length(data, index);
    }
    __name(expectASN1Seq, "expectASN1Seq");
    __name2(expectASN1Seq, "expectASN1Seq");
    function signatureAlgorithmHashFromCertificate(data, index) {
      if (index === void 0) index = 0;
      index = expectASN1Seq(data, index).index;
      const { length: certInfoLength, index: indexAfterCertInfoLength } = expectASN1Seq(data, index);
      index = indexAfterCertInfoLength + certInfoLength;
      index = expectASN1Seq(data, index).index;
      const { oid, index: indexAfterOID } = readASN1OID(data, index);
      switch (oid) {
        // RSA
        case "1.2.840.113549.1.1.4":
          return "MD5";
        case "1.2.840.113549.1.1.5":
          return "SHA-1";
        case "1.2.840.113549.1.1.11":
          return "SHA-256";
        case "1.2.840.113549.1.1.12":
          return "SHA-384";
        case "1.2.840.113549.1.1.13":
          return "SHA-512";
        case "1.2.840.113549.1.1.14":
          return "SHA-224";
        case "1.2.840.113549.1.1.15":
          return "SHA512-224";
        case "1.2.840.113549.1.1.16":
          return "SHA512-256";
        // ECDSA
        case "1.2.840.10045.4.1":
          return "SHA-1";
        case "1.2.840.10045.4.3.1":
          return "SHA-224";
        case "1.2.840.10045.4.3.2":
          return "SHA-256";
        case "1.2.840.10045.4.3.3":
          return "SHA-384";
        case "1.2.840.10045.4.3.4":
          return "SHA-512";
        // RSASSA-PSS: hash is indicated separately
        case "1.2.840.113549.1.1.10": {
          index = indexAfterOID;
          index = expectASN1Seq(data, index).index;
          if (data[index++] !== 160) throw x509Error("non-tag data", data);
          index = readASN1Length(data, index).index;
          index = expectASN1Seq(data, index).index;
          const { oid: hashOID } = readASN1OID(data, index);
          switch (hashOID) {
            // standalone hash OIDs
            case "1.2.840.113549.2.5":
              return "MD5";
            case "1.3.14.3.2.26":
              return "SHA-1";
            case "2.16.840.1.101.3.4.2.1":
              return "SHA-256";
            case "2.16.840.1.101.3.4.2.2":
              return "SHA-384";
            case "2.16.840.1.101.3.4.2.3":
              return "SHA-512";
          }
          throw x509Error("unknown hash OID " + hashOID, data);
        }
        // Ed25519 -- see https://github.com/openssl/openssl/issues/15477
        case "1.3.101.110":
        case "1.3.101.112":
          return "SHA-512";
        // Ed448 -- still not in pg 17.2 (if supported, digest would be SHAKE256 x 64 bytes)
        case "1.3.101.111":
        case "1.3.101.113":
          throw x509Error("Ed448 certificate channel binding is not currently supported by Postgres");
      }
      throw x509Error("unknown OID " + oid, data);
    }
    __name(signatureAlgorithmHashFromCertificate, "signatureAlgorithmHashFromCertificate");
    __name2(signatureAlgorithmHashFromCertificate, "signatureAlgorithmHashFromCertificate");
    module.exports = { signatureAlgorithmHashFromCertificate };
  }
});
var require_sasl = __commonJS({
  "../node_modules/pg/lib/crypto/sasl.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var crypto2 = require_utils2();
    var { signatureAlgorithmHashFromCertificate } = require_cert_signatures();
    function saslprep(password) {
      const nonAsciiSpace = /[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g;
      const mappedToNothing = /[\u00AD\u034F\u1806\u180B\u180C\u180D\u200C\u200D\u2060\uFE00-\uFE0F\uFEFF]/g;
      return password.replace(nonAsciiSpace, " ").replace(mappedToNothing, "").normalize("NFKC");
    }
    __name(saslprep, "saslprep");
    __name2(saslprep, "saslprep");
    var DEFAULT_MAX_SCRAM_ITERATIONS = 1e5;
    function startSession(mechanisms, stream, scramMaxIterations = DEFAULT_MAX_SCRAM_ITERATIONS) {
      const candidates = ["SCRAM-SHA-256"];
      if (stream) candidates.unshift("SCRAM-SHA-256-PLUS");
      const mechanism = candidates.find((candidate) => mechanisms.includes(candidate));
      if (!mechanism) {
        throw new Error("SASL: Only mechanism(s) " + candidates.join(" and ") + " are supported");
      }
      if (mechanism === "SCRAM-SHA-256-PLUS" && typeof stream.getPeerCertificate !== "function") {
        throw new Error("SASL: Mechanism SCRAM-SHA-256-PLUS requires a certificate");
      }
      const clientNonce = crypto2.randomBytes(18).toString("base64");
      const gs2Header = mechanism === "SCRAM-SHA-256-PLUS" ? "p=tls-server-end-point" : stream ? "y" : "n";
      return {
        mechanism,
        clientNonce,
        response: gs2Header + ",,n=*,r=" + clientNonce,
        message: "SASLInitialResponse",
        scramMaxIterations
      };
    }
    __name(startSession, "startSession");
    __name2(startSession, "startSession");
    async function continueSession(session, password, serverData, stream) {
      if (session.message !== "SASLInitialResponse") {
        throw new Error("SASL: Last message was not SASLInitialResponse");
      }
      if (typeof password !== "string") {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string");
      }
      if (password === "") {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string");
      }
      if (typeof serverData !== "string") {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: serverData must be a string");
      }
      const sv = parseServerFirstMessage(serverData);
      if (!sv.nonce.startsWith(session.clientNonce)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce");
      } else if (sv.nonce.length === session.clientNonce.length) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce is too short");
      }
      const scramMaxIterations = typeof session.scramMaxIterations === "number" ? session.scramMaxIterations : DEFAULT_MAX_SCRAM_ITERATIONS;
      if (scramMaxIterations !== 0 && sv.iteration > scramMaxIterations) {
        throw new Error(
          "SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration count " + sv.iteration + " exceeds scramMaxIterations of " + scramMaxIterations
        );
      }
      const clientFirstMessageBare = "n=*,r=" + session.clientNonce;
      const serverFirstMessage = "r=" + sv.nonce + ",s=" + sv.salt + ",i=" + sv.iteration;
      let channelBinding = stream ? "eSws" : "biws";
      if (session.mechanism === "SCRAM-SHA-256-PLUS") {
        const peerCert = stream.getPeerCertificate().raw;
        let hashName = signatureAlgorithmHashFromCertificate(peerCert);
        if (hashName === "MD5" || hashName === "SHA-1") hashName = "SHA-256";
        const certHash = await crypto2.hashByName(hashName, peerCert);
        const bindingData = Buffer.concat([Buffer.from("p=tls-server-end-point,,"), Buffer.from(certHash)]);
        channelBinding = bindingData.toString("base64");
      }
      const clientFinalMessageWithoutProof = "c=" + channelBinding + ",r=" + sv.nonce;
      const authMessage = clientFirstMessageBare + "," + serverFirstMessage + "," + clientFinalMessageWithoutProof;
      const saltBytes = Buffer.from(sv.salt, "base64");
      const saltedPassword = await crypto2.deriveKey(saslprep(password), saltBytes, sv.iteration);
      const clientKey = await crypto2.hmacSha256(saltedPassword, "Client Key");
      const storedKey = await crypto2.sha256(clientKey);
      const clientSignature = await crypto2.hmacSha256(storedKey, authMessage);
      const clientProof = xorBuffers(Buffer.from(clientKey), Buffer.from(clientSignature)).toString("base64");
      const serverKey = await crypto2.hmacSha256(saltedPassword, "Server Key");
      const serverSignatureBytes = await crypto2.hmacSha256(serverKey, authMessage);
      session.message = "SASLResponse";
      session.serverSignature = Buffer.from(serverSignatureBytes).toString("base64");
      session.response = clientFinalMessageWithoutProof + ",p=" + clientProof;
    }
    __name(continueSession, "continueSession");
    __name2(continueSession, "continueSession");
    function finalizeSession(session, serverData) {
      if (session.message !== "SASLResponse") {
        throw new Error("SASL: Last message was not SASLResponse");
      }
      if (typeof serverData !== "string") {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: serverData must be a string");
      }
      const { serverSignature } = parseServerFinalMessage(serverData);
      if (serverSignature !== session.serverSignature) {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature does not match");
      }
    }
    __name(finalizeSession, "finalizeSession");
    __name2(finalizeSession, "finalizeSession");
    function isPrintableChars(text) {
      if (typeof text !== "string") {
        throw new TypeError("SASL: text must be a string");
      }
      return text.split("").map((_, i) => text.charCodeAt(i)).every((c) => c >= 33 && c <= 43 || c >= 45 && c <= 126);
    }
    __name(isPrintableChars, "isPrintableChars");
    __name2(isPrintableChars, "isPrintableChars");
    function isBase64(text) {
      return /^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(text);
    }
    __name(isBase64, "isBase64");
    __name2(isBase64, "isBase64");
    function parseAttributePairs(text) {
      if (typeof text !== "string") {
        throw new TypeError("SASL: attribute pairs text must be a string");
      }
      return new Map(
        text.split(",").map((attrValue) => {
          if (!/^.=/.test(attrValue)) {
            throw new Error("SASL: Invalid attribute pair entry");
          }
          const name = attrValue[0];
          const value = attrValue.substring(2);
          return [name, value];
        })
      );
    }
    __name(parseAttributePairs, "parseAttributePairs");
    __name2(parseAttributePairs, "parseAttributePairs");
    function parseServerFirstMessage(data) {
      const attrPairs = parseAttributePairs(data);
      const nonce = attrPairs.get("r");
      if (!nonce) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing");
      } else if (!isPrintableChars(nonce)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce must only contain printable characters");
      }
      const salt = attrPairs.get("s");
      if (!salt) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing");
      } else if (!isBase64(salt)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt must be base64");
      }
      const iterationText = attrPairs.get("i");
      if (!iterationText) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing");
      } else if (!/^[1-9][0-9]*$/.test(iterationText)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: invalid iteration count");
      }
      const iteration = parseInt(iterationText, 10);
      return {
        nonce,
        salt,
        iteration
      };
    }
    __name(parseServerFirstMessage, "parseServerFirstMessage");
    __name2(parseServerFirstMessage, "parseServerFirstMessage");
    function parseServerFinalMessage(serverData) {
      const attrPairs = parseAttributePairs(serverData);
      const error32 = attrPairs.get("e");
      const serverSignature = attrPairs.get("v");
      if (error32) {
        throw new Error(`SASL: SCRAM-SERVER-FINAL-MESSAGE: server returned error: "${error32}"`);
      }
      if (!serverSignature) {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature is missing");
      } else if (!isBase64(serverSignature)) {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature must be base64");
      }
      return {
        serverSignature
      };
    }
    __name(parseServerFinalMessage, "parseServerFinalMessage");
    __name2(parseServerFinalMessage, "parseServerFinalMessage");
    function xorBuffers(a, b) {
      if (!Buffer.isBuffer(a)) {
        throw new TypeError("first argument must be a Buffer");
      }
      if (!Buffer.isBuffer(b)) {
        throw new TypeError("second argument must be a Buffer");
      }
      if (a.length !== b.length) {
        throw new Error("Buffer lengths must match");
      }
      if (a.length === 0) {
        throw new Error("Buffers cannot be empty");
      }
      return Buffer.from(a.map((_, i) => a[i] ^ b[i]));
    }
    __name(xorBuffers, "xorBuffers");
    __name2(xorBuffers, "xorBuffers");
    module.exports = {
      startSession,
      continueSession,
      finalizeSession,
      DEFAULT_MAX_SCRAM_ITERATIONS
    };
  }
});
var require_type_overrides = __commonJS({
  "../node_modules/pg/lib/type-overrides.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var types2 = require_pg_types();
    function TypeOverrides2(userTypes) {
      this._types = userTypes || types2;
      this.text = {};
      this.binary = {};
    }
    __name(TypeOverrides2, "TypeOverrides2");
    __name2(TypeOverrides2, "TypeOverrides");
    TypeOverrides2.prototype.getOverrides = function(format) {
      switch (format) {
        case "text":
          return this.text;
        case "binary":
          return this.binary;
        default:
          return {};
      }
    };
    TypeOverrides2.prototype.setTypeParser = function(oid, format, parseFn) {
      if (typeof format === "function") {
        parseFn = format;
        format = "text";
      }
      this.getOverrides(format)[oid] = parseFn;
    };
    TypeOverrides2.prototype.getTypeParser = function(oid, format) {
      format = format || "text";
      return this.getOverrides(format)[oid] || this._types.getTypeParser(oid, format);
    };
    module.exports = TypeOverrides2;
  }
});
var require_dns = __commonJS({
  "node-built-in-modules:dns"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    module.exports = libDefault5;
  }
});
var access;
var copyFile;
var cp;
var open;
var opendir;
var rename;
var truncate;
var rm;
var rmdir;
var mkdir;
var readdir;
var readlink;
var symlink;
var lstat;
var stat;
var link;
var unlink;
var chmod;
var lchmod;
var lchown;
var chown;
var utimes;
var lutimes;
var realpath;
var mkdtemp;
var writeFile;
var appendFile;
var readFile;
var watch;
var statfs;
var glob;
var init_promises = __esm({
  "../node_modules/unenv/dist/runtime/node/internal/fs/promises.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_utils();
    access = /* @__PURE__ */ notImplemented2("fs.access");
    copyFile = /* @__PURE__ */ notImplemented2("fs.copyFile");
    cp = /* @__PURE__ */ notImplemented2("fs.cp");
    open = /* @__PURE__ */ notImplemented2("fs.open");
    opendir = /* @__PURE__ */ notImplemented2("fs.opendir");
    rename = /* @__PURE__ */ notImplemented2("fs.rename");
    truncate = /* @__PURE__ */ notImplemented2("fs.truncate");
    rm = /* @__PURE__ */ notImplemented2("fs.rm");
    rmdir = /* @__PURE__ */ notImplemented2("fs.rmdir");
    mkdir = /* @__PURE__ */ notImplemented2("fs.mkdir");
    readdir = /* @__PURE__ */ notImplemented2("fs.readdir");
    readlink = /* @__PURE__ */ notImplemented2("fs.readlink");
    symlink = /* @__PURE__ */ notImplemented2("fs.symlink");
    lstat = /* @__PURE__ */ notImplemented2("fs.lstat");
    stat = /* @__PURE__ */ notImplemented2("fs.stat");
    link = /* @__PURE__ */ notImplemented2("fs.link");
    unlink = /* @__PURE__ */ notImplemented2("fs.unlink");
    chmod = /* @__PURE__ */ notImplemented2("fs.chmod");
    lchmod = /* @__PURE__ */ notImplemented2("fs.lchmod");
    lchown = /* @__PURE__ */ notImplemented2("fs.lchown");
    chown = /* @__PURE__ */ notImplemented2("fs.chown");
    utimes = /* @__PURE__ */ notImplemented2("fs.utimes");
    lutimes = /* @__PURE__ */ notImplemented2("fs.lutimes");
    realpath = /* @__PURE__ */ notImplemented2("fs.realpath");
    mkdtemp = /* @__PURE__ */ notImplemented2("fs.mkdtemp");
    writeFile = /* @__PURE__ */ notImplemented2("fs.writeFile");
    appendFile = /* @__PURE__ */ notImplemented2("fs.appendFile");
    readFile = /* @__PURE__ */ notImplemented2("fs.readFile");
    watch = /* @__PURE__ */ notImplemented2("fs.watch");
    statfs = /* @__PURE__ */ notImplemented2("fs.statfs");
    glob = /* @__PURE__ */ notImplemented2("fs.glob");
  }
});
var constants_exports = {};
__export(constants_exports, {
  COPYFILE_EXCL: /* @__PURE__ */ __name(() => COPYFILE_EXCL, "COPYFILE_EXCL"),
  COPYFILE_FICLONE: /* @__PURE__ */ __name(() => COPYFILE_FICLONE, "COPYFILE_FICLONE"),
  COPYFILE_FICLONE_FORCE: /* @__PURE__ */ __name(() => COPYFILE_FICLONE_FORCE, "COPYFILE_FICLONE_FORCE"),
  EXTENSIONLESS_FORMAT_JAVASCRIPT: /* @__PURE__ */ __name(() => EXTENSIONLESS_FORMAT_JAVASCRIPT, "EXTENSIONLESS_FORMAT_JAVASCRIPT"),
  EXTENSIONLESS_FORMAT_WASM: /* @__PURE__ */ __name(() => EXTENSIONLESS_FORMAT_WASM, "EXTENSIONLESS_FORMAT_WASM"),
  F_OK: /* @__PURE__ */ __name(() => F_OK, "F_OK"),
  O_APPEND: /* @__PURE__ */ __name(() => O_APPEND, "O_APPEND"),
  O_CREAT: /* @__PURE__ */ __name(() => O_CREAT, "O_CREAT"),
  O_DIRECT: /* @__PURE__ */ __name(() => O_DIRECT, "O_DIRECT"),
  O_DIRECTORY: /* @__PURE__ */ __name(() => O_DIRECTORY, "O_DIRECTORY"),
  O_DSYNC: /* @__PURE__ */ __name(() => O_DSYNC, "O_DSYNC"),
  O_EXCL: /* @__PURE__ */ __name(() => O_EXCL, "O_EXCL"),
  O_NOATIME: /* @__PURE__ */ __name(() => O_NOATIME, "O_NOATIME"),
  O_NOCTTY: /* @__PURE__ */ __name(() => O_NOCTTY, "O_NOCTTY"),
  O_NOFOLLOW: /* @__PURE__ */ __name(() => O_NOFOLLOW, "O_NOFOLLOW"),
  O_NONBLOCK: /* @__PURE__ */ __name(() => O_NONBLOCK, "O_NONBLOCK"),
  O_RDONLY: /* @__PURE__ */ __name(() => O_RDONLY, "O_RDONLY"),
  O_RDWR: /* @__PURE__ */ __name(() => O_RDWR, "O_RDWR"),
  O_SYNC: /* @__PURE__ */ __name(() => O_SYNC, "O_SYNC"),
  O_TRUNC: /* @__PURE__ */ __name(() => O_TRUNC, "O_TRUNC"),
  O_WRONLY: /* @__PURE__ */ __name(() => O_WRONLY, "O_WRONLY"),
  R_OK: /* @__PURE__ */ __name(() => R_OK, "R_OK"),
  S_IFBLK: /* @__PURE__ */ __name(() => S_IFBLK, "S_IFBLK"),
  S_IFCHR: /* @__PURE__ */ __name(() => S_IFCHR, "S_IFCHR"),
  S_IFDIR: /* @__PURE__ */ __name(() => S_IFDIR, "S_IFDIR"),
  S_IFIFO: /* @__PURE__ */ __name(() => S_IFIFO, "S_IFIFO"),
  S_IFLNK: /* @__PURE__ */ __name(() => S_IFLNK, "S_IFLNK"),
  S_IFMT: /* @__PURE__ */ __name(() => S_IFMT, "S_IFMT"),
  S_IFREG: /* @__PURE__ */ __name(() => S_IFREG, "S_IFREG"),
  S_IFSOCK: /* @__PURE__ */ __name(() => S_IFSOCK, "S_IFSOCK"),
  S_IRGRP: /* @__PURE__ */ __name(() => S_IRGRP, "S_IRGRP"),
  S_IROTH: /* @__PURE__ */ __name(() => S_IROTH, "S_IROTH"),
  S_IRUSR: /* @__PURE__ */ __name(() => S_IRUSR, "S_IRUSR"),
  S_IRWXG: /* @__PURE__ */ __name(() => S_IRWXG, "S_IRWXG"),
  S_IRWXO: /* @__PURE__ */ __name(() => S_IRWXO, "S_IRWXO"),
  S_IRWXU: /* @__PURE__ */ __name(() => S_IRWXU, "S_IRWXU"),
  S_IWGRP: /* @__PURE__ */ __name(() => S_IWGRP, "S_IWGRP"),
  S_IWOTH: /* @__PURE__ */ __name(() => S_IWOTH, "S_IWOTH"),
  S_IWUSR: /* @__PURE__ */ __name(() => S_IWUSR, "S_IWUSR"),
  S_IXGRP: /* @__PURE__ */ __name(() => S_IXGRP, "S_IXGRP"),
  S_IXOTH: /* @__PURE__ */ __name(() => S_IXOTH, "S_IXOTH"),
  S_IXUSR: /* @__PURE__ */ __name(() => S_IXUSR, "S_IXUSR"),
  UV_DIRENT_BLOCK: /* @__PURE__ */ __name(() => UV_DIRENT_BLOCK, "UV_DIRENT_BLOCK"),
  UV_DIRENT_CHAR: /* @__PURE__ */ __name(() => UV_DIRENT_CHAR, "UV_DIRENT_CHAR"),
  UV_DIRENT_DIR: /* @__PURE__ */ __name(() => UV_DIRENT_DIR, "UV_DIRENT_DIR"),
  UV_DIRENT_FIFO: /* @__PURE__ */ __name(() => UV_DIRENT_FIFO, "UV_DIRENT_FIFO"),
  UV_DIRENT_FILE: /* @__PURE__ */ __name(() => UV_DIRENT_FILE, "UV_DIRENT_FILE"),
  UV_DIRENT_LINK: /* @__PURE__ */ __name(() => UV_DIRENT_LINK, "UV_DIRENT_LINK"),
  UV_DIRENT_SOCKET: /* @__PURE__ */ __name(() => UV_DIRENT_SOCKET, "UV_DIRENT_SOCKET"),
  UV_DIRENT_UNKNOWN: /* @__PURE__ */ __name(() => UV_DIRENT_UNKNOWN, "UV_DIRENT_UNKNOWN"),
  UV_FS_COPYFILE_EXCL: /* @__PURE__ */ __name(() => UV_FS_COPYFILE_EXCL, "UV_FS_COPYFILE_EXCL"),
  UV_FS_COPYFILE_FICLONE: /* @__PURE__ */ __name(() => UV_FS_COPYFILE_FICLONE, "UV_FS_COPYFILE_FICLONE"),
  UV_FS_COPYFILE_FICLONE_FORCE: /* @__PURE__ */ __name(() => UV_FS_COPYFILE_FICLONE_FORCE, "UV_FS_COPYFILE_FICLONE_FORCE"),
  UV_FS_O_FILEMAP: /* @__PURE__ */ __name(() => UV_FS_O_FILEMAP, "UV_FS_O_FILEMAP"),
  UV_FS_SYMLINK_DIR: /* @__PURE__ */ __name(() => UV_FS_SYMLINK_DIR, "UV_FS_SYMLINK_DIR"),
  UV_FS_SYMLINK_JUNCTION: /* @__PURE__ */ __name(() => UV_FS_SYMLINK_JUNCTION, "UV_FS_SYMLINK_JUNCTION"),
  W_OK: /* @__PURE__ */ __name(() => W_OK, "W_OK"),
  X_OK: /* @__PURE__ */ __name(() => X_OK, "X_OK")
});
var UV_FS_SYMLINK_DIR;
var UV_FS_SYMLINK_JUNCTION;
var O_RDONLY;
var O_WRONLY;
var O_RDWR;
var UV_DIRENT_UNKNOWN;
var UV_DIRENT_FILE;
var UV_DIRENT_DIR;
var UV_DIRENT_LINK;
var UV_DIRENT_FIFO;
var UV_DIRENT_SOCKET;
var UV_DIRENT_CHAR;
var UV_DIRENT_BLOCK;
var EXTENSIONLESS_FORMAT_JAVASCRIPT;
var EXTENSIONLESS_FORMAT_WASM;
var S_IFMT;
var S_IFREG;
var S_IFDIR;
var S_IFCHR;
var S_IFBLK;
var S_IFIFO;
var S_IFLNK;
var S_IFSOCK;
var O_CREAT;
var O_EXCL;
var UV_FS_O_FILEMAP;
var O_NOCTTY;
var O_TRUNC;
var O_APPEND;
var O_DIRECTORY;
var O_NOATIME;
var O_NOFOLLOW;
var O_SYNC;
var O_DSYNC;
var O_DIRECT;
var O_NONBLOCK;
var S_IRWXU;
var S_IRUSR;
var S_IWUSR;
var S_IXUSR;
var S_IRWXG;
var S_IRGRP;
var S_IWGRP;
var S_IXGRP;
var S_IRWXO;
var S_IROTH;
var S_IWOTH;
var S_IXOTH;
var F_OK;
var R_OK;
var W_OK;
var X_OK;
var UV_FS_COPYFILE_EXCL;
var COPYFILE_EXCL;
var UV_FS_COPYFILE_FICLONE;
var COPYFILE_FICLONE;
var UV_FS_COPYFILE_FICLONE_FORCE;
var COPYFILE_FICLONE_FORCE;
var init_constants = __esm({
  "../node_modules/unenv/dist/runtime/node/internal/fs/constants.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    UV_FS_SYMLINK_DIR = 1;
    UV_FS_SYMLINK_JUNCTION = 2;
    O_RDONLY = 0;
    O_WRONLY = 1;
    O_RDWR = 2;
    UV_DIRENT_UNKNOWN = 0;
    UV_DIRENT_FILE = 1;
    UV_DIRENT_DIR = 2;
    UV_DIRENT_LINK = 3;
    UV_DIRENT_FIFO = 4;
    UV_DIRENT_SOCKET = 5;
    UV_DIRENT_CHAR = 6;
    UV_DIRENT_BLOCK = 7;
    EXTENSIONLESS_FORMAT_JAVASCRIPT = 0;
    EXTENSIONLESS_FORMAT_WASM = 1;
    S_IFMT = 61440;
    S_IFREG = 32768;
    S_IFDIR = 16384;
    S_IFCHR = 8192;
    S_IFBLK = 24576;
    S_IFIFO = 4096;
    S_IFLNK = 40960;
    S_IFSOCK = 49152;
    O_CREAT = 64;
    O_EXCL = 128;
    UV_FS_O_FILEMAP = 0;
    O_NOCTTY = 256;
    O_TRUNC = 512;
    O_APPEND = 1024;
    O_DIRECTORY = 65536;
    O_NOATIME = 262144;
    O_NOFOLLOW = 131072;
    O_SYNC = 1052672;
    O_DSYNC = 4096;
    O_DIRECT = 16384;
    O_NONBLOCK = 2048;
    S_IRWXU = 448;
    S_IRUSR = 256;
    S_IWUSR = 128;
    S_IXUSR = 64;
    S_IRWXG = 56;
    S_IRGRP = 32;
    S_IWGRP = 16;
    S_IXGRP = 8;
    S_IRWXO = 7;
    S_IROTH = 4;
    S_IWOTH = 2;
    S_IXOTH = 1;
    F_OK = 0;
    R_OK = 4;
    W_OK = 2;
    X_OK = 1;
    UV_FS_COPYFILE_EXCL = 1;
    COPYFILE_EXCL = 1;
    UV_FS_COPYFILE_FICLONE = 2;
    COPYFILE_FICLONE = 2;
    UV_FS_COPYFILE_FICLONE_FORCE = 4;
    COPYFILE_FICLONE_FORCE = 4;
  }
});
var promises_default;
var init_promises2 = __esm({
  "../node_modules/unenv/dist/runtime/node/fs/promises.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_promises();
    init_constants();
    init_promises();
    promises_default = {
      constants: constants_exports,
      access,
      appendFile,
      chmod,
      chown,
      copyFile,
      cp,
      glob,
      lchmod,
      lchown,
      link,
      lstat,
      lutimes,
      mkdir,
      mkdtemp,
      open,
      opendir,
      readFile,
      readdir,
      readlink,
      realpath,
      rename,
      rm,
      rmdir,
      stat,
      statfs,
      symlink,
      truncate,
      unlink,
      utimes,
      watch,
      writeFile
    };
  }
});
var Dir;
var Dirent;
var Stats;
var ReadStream22;
var WriteStream22;
var FileReadStream;
var FileWriteStream;
var init_classes = __esm({
  "../node_modules/unenv/dist/runtime/node/internal/fs/classes.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_utils();
    Dir = /* @__PURE__ */ notImplementedClass2("fs.Dir");
    Dirent = /* @__PURE__ */ notImplementedClass2("fs.Dirent");
    Stats = /* @__PURE__ */ notImplementedClass2("fs.Stats");
    ReadStream22 = /* @__PURE__ */ notImplementedClass2("fs.ReadStream");
    WriteStream22 = /* @__PURE__ */ notImplementedClass2("fs.WriteStream");
    FileReadStream = ReadStream22;
    FileWriteStream = WriteStream22;
  }
});
function callbackify(fn) {
  const fnc = /* @__PURE__ */ __name2(function(...args) {
    const cb = args.pop();
    fn().catch((error32) => cb(error32)).then((val) => cb(void 0, val));
  }, "fnc");
  fnc.__promisify__ = fn;
  fnc.native = fnc;
  return fnc;
}
__name(callbackify, "callbackify");
var access2;
var appendFile2;
var chown2;
var chmod2;
var copyFile2;
var cp2;
var lchown2;
var lchmod2;
var link2;
var lstat2;
var lutimes2;
var mkdir2;
var mkdtemp2;
var realpath2;
var open2;
var opendir2;
var readdir2;
var readFile2;
var readlink2;
var rename2;
var rm2;
var rmdir2;
var stat2;
var symlink2;
var truncate2;
var unlink2;
var utimes2;
var writeFile2;
var statfs2;
var close;
var createReadStream;
var createWriteStream;
var exists;
var fchown;
var fchmod;
var fdatasync;
var fstat;
var fsync;
var ftruncate;
var futimes;
var lstatSync;
var read;
var readv;
var realpathSync;
var statSync;
var unwatchFile;
var watch2;
var watchFile;
var write;
var writev;
var _toUnixTimestamp;
var openAsBlob;
var glob2;
var appendFileSync;
var accessSync;
var chownSync;
var chmodSync;
var closeSync;
var copyFileSync;
var cpSync;
var existsSync;
var fchownSync;
var fchmodSync;
var fdatasyncSync;
var fstatSync;
var fsyncSync;
var ftruncateSync;
var futimesSync;
var lchownSync;
var lchmodSync;
var linkSync;
var lutimesSync;
var mkdirSync;
var mkdtempSync;
var openSync;
var opendirSync;
var readdirSync;
var readSync;
var readvSync;
var readFileSync;
var readlinkSync;
var renameSync;
var rmSync;
var rmdirSync;
var symlinkSync;
var truncateSync;
var unlinkSync;
var utimesSync;
var writeFileSync;
var writeSync;
var writevSync;
var statfsSync;
var globSync;
var init_fs = __esm({
  "../node_modules/unenv/dist/runtime/node/internal/fs/fs.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_utils();
    init_promises();
    __name2(callbackify, "callbackify");
    access2 = callbackify(access);
    appendFile2 = callbackify(appendFile);
    chown2 = callbackify(chown);
    chmod2 = callbackify(chmod);
    copyFile2 = callbackify(copyFile);
    cp2 = callbackify(cp);
    lchown2 = callbackify(lchown);
    lchmod2 = callbackify(lchmod);
    link2 = callbackify(link);
    lstat2 = callbackify(lstat);
    lutimes2 = callbackify(lutimes);
    mkdir2 = callbackify(mkdir);
    mkdtemp2 = callbackify(mkdtemp);
    realpath2 = callbackify(realpath);
    open2 = callbackify(open);
    opendir2 = callbackify(opendir);
    readdir2 = callbackify(readdir);
    readFile2 = callbackify(readFile);
    readlink2 = callbackify(readlink);
    rename2 = callbackify(rename);
    rm2 = callbackify(rm);
    rmdir2 = callbackify(rmdir);
    stat2 = callbackify(stat);
    symlink2 = callbackify(symlink);
    truncate2 = callbackify(truncate);
    unlink2 = callbackify(unlink);
    utimes2 = callbackify(utimes);
    writeFile2 = callbackify(writeFile);
    statfs2 = callbackify(statfs);
    close = /* @__PURE__ */ notImplementedAsync("fs.close");
    createReadStream = /* @__PURE__ */ notImplementedAsync("fs.createReadStream");
    createWriteStream = /* @__PURE__ */ notImplementedAsync("fs.createWriteStream");
    exists = /* @__PURE__ */ notImplementedAsync("fs.exists");
    fchown = /* @__PURE__ */ notImplementedAsync("fs.fchown");
    fchmod = /* @__PURE__ */ notImplementedAsync("fs.fchmod");
    fdatasync = /* @__PURE__ */ notImplementedAsync("fs.fdatasync");
    fstat = /* @__PURE__ */ notImplementedAsync("fs.fstat");
    fsync = /* @__PURE__ */ notImplementedAsync("fs.fsync");
    ftruncate = /* @__PURE__ */ notImplementedAsync("fs.ftruncate");
    futimes = /* @__PURE__ */ notImplementedAsync("fs.futimes");
    lstatSync = /* @__PURE__ */ notImplementedAsync("fs.lstatSync");
    read = /* @__PURE__ */ notImplementedAsync("fs.read");
    readv = /* @__PURE__ */ notImplementedAsync("fs.readv");
    realpathSync = /* @__PURE__ */ notImplementedAsync("fs.realpathSync");
    statSync = /* @__PURE__ */ notImplementedAsync("fs.statSync");
    unwatchFile = /* @__PURE__ */ notImplementedAsync("fs.unwatchFile");
    watch2 = /* @__PURE__ */ notImplementedAsync("fs.watch");
    watchFile = /* @__PURE__ */ notImplementedAsync("fs.watchFile");
    write = /* @__PURE__ */ notImplementedAsync("fs.write");
    writev = /* @__PURE__ */ notImplementedAsync("fs.writev");
    _toUnixTimestamp = /* @__PURE__ */ notImplementedAsync("fs._toUnixTimestamp");
    openAsBlob = /* @__PURE__ */ notImplementedAsync("fs.openAsBlob");
    glob2 = /* @__PURE__ */ notImplementedAsync("fs.glob");
    appendFileSync = /* @__PURE__ */ notImplemented2("fs.appendFileSync");
    accessSync = /* @__PURE__ */ notImplemented2("fs.accessSync");
    chownSync = /* @__PURE__ */ notImplemented2("fs.chownSync");
    chmodSync = /* @__PURE__ */ notImplemented2("fs.chmodSync");
    closeSync = /* @__PURE__ */ notImplemented2("fs.closeSync");
    copyFileSync = /* @__PURE__ */ notImplemented2("fs.copyFileSync");
    cpSync = /* @__PURE__ */ notImplemented2("fs.cpSync");
    existsSync = /* @__PURE__ */ __name2(() => false, "existsSync");
    fchownSync = /* @__PURE__ */ notImplemented2("fs.fchownSync");
    fchmodSync = /* @__PURE__ */ notImplemented2("fs.fchmodSync");
    fdatasyncSync = /* @__PURE__ */ notImplemented2("fs.fdatasyncSync");
    fstatSync = /* @__PURE__ */ notImplemented2("fs.fstatSync");
    fsyncSync = /* @__PURE__ */ notImplemented2("fs.fsyncSync");
    ftruncateSync = /* @__PURE__ */ notImplemented2("fs.ftruncateSync");
    futimesSync = /* @__PURE__ */ notImplemented2("fs.futimesSync");
    lchownSync = /* @__PURE__ */ notImplemented2("fs.lchownSync");
    lchmodSync = /* @__PURE__ */ notImplemented2("fs.lchmodSync");
    linkSync = /* @__PURE__ */ notImplemented2("fs.linkSync");
    lutimesSync = /* @__PURE__ */ notImplemented2("fs.lutimesSync");
    mkdirSync = /* @__PURE__ */ notImplemented2("fs.mkdirSync");
    mkdtempSync = /* @__PURE__ */ notImplemented2("fs.mkdtempSync");
    openSync = /* @__PURE__ */ notImplemented2("fs.openSync");
    opendirSync = /* @__PURE__ */ notImplemented2("fs.opendirSync");
    readdirSync = /* @__PURE__ */ notImplemented2("fs.readdirSync");
    readSync = /* @__PURE__ */ notImplemented2("fs.readSync");
    readvSync = /* @__PURE__ */ notImplemented2("fs.readvSync");
    readFileSync = /* @__PURE__ */ notImplemented2("fs.readFileSync");
    readlinkSync = /* @__PURE__ */ notImplemented2("fs.readlinkSync");
    renameSync = /* @__PURE__ */ notImplemented2("fs.renameSync");
    rmSync = /* @__PURE__ */ notImplemented2("fs.rmSync");
    rmdirSync = /* @__PURE__ */ notImplemented2("fs.rmdirSync");
    symlinkSync = /* @__PURE__ */ notImplemented2("fs.symlinkSync");
    truncateSync = /* @__PURE__ */ notImplemented2("fs.truncateSync");
    unlinkSync = /* @__PURE__ */ notImplemented2("fs.unlinkSync");
    utimesSync = /* @__PURE__ */ notImplemented2("fs.utimesSync");
    writeFileSync = /* @__PURE__ */ notImplemented2("fs.writeFileSync");
    writeSync = /* @__PURE__ */ notImplemented2("fs.writeSync");
    writevSync = /* @__PURE__ */ notImplemented2("fs.writevSync");
    statfsSync = /* @__PURE__ */ notImplemented2("fs.statfsSync");
    globSync = /* @__PURE__ */ notImplemented2("fs.globSync");
  }
});
var fs_default;
var init_fs2 = __esm({
  "../node_modules/unenv/dist/runtime/node/fs.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_promises2();
    init_classes();
    init_fs();
    init_constants();
    init_constants();
    init_fs();
    init_classes();
    fs_default = {
      F_OK,
      R_OK,
      W_OK,
      X_OK,
      constants: constants_exports,
      promises: promises_default,
      Dir,
      Dirent,
      FileReadStream,
      FileWriteStream,
      ReadStream: ReadStream22,
      Stats,
      WriteStream: WriteStream22,
      _toUnixTimestamp,
      access: access2,
      accessSync,
      appendFile: appendFile2,
      appendFileSync,
      chmod: chmod2,
      chmodSync,
      chown: chown2,
      chownSync,
      close,
      closeSync,
      copyFile: copyFile2,
      copyFileSync,
      cp: cp2,
      cpSync,
      createReadStream,
      createWriteStream,
      exists,
      existsSync,
      fchmod,
      fchmodSync,
      fchown,
      fchownSync,
      fdatasync,
      fdatasyncSync,
      fstat,
      fstatSync,
      fsync,
      fsyncSync,
      ftruncate,
      ftruncateSync,
      futimes,
      futimesSync,
      glob: glob2,
      lchmod: lchmod2,
      globSync,
      lchmodSync,
      lchown: lchown2,
      lchownSync,
      link: link2,
      linkSync,
      lstat: lstat2,
      lstatSync,
      lutimes: lutimes2,
      lutimesSync,
      mkdir: mkdir2,
      mkdirSync,
      mkdtemp: mkdtemp2,
      mkdtempSync,
      open: open2,
      openAsBlob,
      openSync,
      opendir: opendir2,
      opendirSync,
      read,
      readFile: readFile2,
      readFileSync,
      readSync,
      readdir: readdir2,
      readdirSync,
      readlink: readlink2,
      readlinkSync,
      readv,
      readvSync,
      realpath: realpath2,
      realpathSync,
      rename: rename2,
      renameSync,
      rm: rm2,
      rmSync,
      rmdir: rmdir2,
      rmdirSync,
      stat: stat2,
      statSync,
      statfs: statfs2,
      statfsSync,
      symlink: symlink2,
      symlinkSync,
      truncate: truncate2,
      truncateSync,
      unlink: unlink2,
      unlinkSync,
      unwatchFile,
      utimes: utimes2,
      utimesSync,
      watch: watch2,
      watchFile,
      write,
      writeFile: writeFile2,
      writeFileSync,
      writeSync,
      writev,
      writevSync
    };
  }
});
var require_fs = __commonJS({
  "node-built-in-modules:fs"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_fs2();
    module.exports = fs_default;
  }
});
var require_pg_connection_string = __commonJS({
  "../node_modules/pg-connection-string/index.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    function parse2(str, options = {}) {
      if (str.charAt(0) === "/") {
        const config3 = str.split(" ");
        return { host: config3[0], database: config3[1] };
      }
      const config22 = /* @__PURE__ */ Object.create(null);
      let result;
      let dummyHost = false;
      if (/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(str)) {
        str = encodeURI(str).replace(/%25(\d\d)/g, "%$1");
      }
      try {
        try {
          result = new URL(str, "postgres://base");
        } catch (e) {
          result = new URL(str.replace("@/", "@___DUMMY___/"), "postgres://base");
          dummyHost = true;
        }
      } catch (err) {
        err.input && (err.input = "*****REDACTED*****");
        throw err;
      }
      for (const entry of result.searchParams.entries()) {
        config22[entry[0]] = entry[1];
      }
      config22.user = config22.user || decodeURIComponent(result.username);
      config22.password = config22.password || decodeURIComponent(result.password);
      if (result.protocol == "socket:") {
        config22.host = decodeURI(result.pathname);
        config22.database = result.searchParams.get("db");
        config22.client_encoding = result.searchParams.get("encoding");
        return config22;
      }
      const hostname = (dummyHost ? "" : result.hostname).replace(/^\[(.+)\]$/, "$1");
      if (!config22.host) {
        config22.host = decodeURIComponent(hostname);
      } else if (hostname && /^%2f/i.test(hostname)) {
        result.pathname = hostname + result.pathname;
      }
      if (!config22.port) {
        config22.port = result.port;
      }
      const pathname = result.pathname.slice(1) || null;
      config22.database = pathname ? decodeURI(pathname) : null;
      if (config22.ssl === "true" || config22.ssl === "1") {
        config22.ssl = true;
      }
      if (config22.ssl === "0") {
        config22.ssl = false;
      }
      if (config22.sslcert || config22.sslkey || config22.sslrootcert || config22.sslmode) {
        config22.ssl = {};
      }
      if (config22.sslnegotiation === "direct" && config22.ssl === void 0) {
        config22.ssl = true;
      }
      const fs = config22.sslcert || config22.sslkey || config22.sslrootcert ? require_fs() : null;
      if (config22.sslcert) {
        config22.ssl.cert = fs.readFileSync(config22.sslcert).toString();
      }
      if (config22.sslkey) {
        config22.ssl.key = fs.readFileSync(config22.sslkey).toString();
      }
      if (config22.sslrootcert) {
        config22.ssl.ca = fs.readFileSync(config22.sslrootcert).toString();
      }
      if (options.useLibpqCompat && config22.uselibpqcompat) {
        throw new Error("Both useLibpqCompat and uselibpqcompat are set. Please use only one of them.");
      }
      if (config22.uselibpqcompat === "true" || options.useLibpqCompat) {
        switch (config22.sslmode) {
          case "disable": {
            config22.ssl = false;
            break;
          }
          case "prefer": {
            config22.ssl.rejectUnauthorized = false;
            break;
          }
          case "require": {
            if (config22.sslrootcert) {
              config22.ssl.checkServerIdentity = function() {
              };
            } else {
              config22.ssl.rejectUnauthorized = false;
            }
            break;
          }
          case "verify-ca": {
            if (!config22.ssl.ca) {
              throw new Error(
                "SECURITY WARNING: Using sslmode=verify-ca requires specifying a CA with sslrootcert. If a public CA is used, verify-ca allows connections to a server that somebody else may have registered with the CA, making you vulnerable to Man-in-the-Middle attacks. Either specify a custom CA certificate with sslrootcert parameter or use sslmode=verify-full for proper security."
              );
            }
            config22.ssl.checkServerIdentity = function() {
            };
            break;
          }
          case "verify-full": {
            break;
          }
        }
      } else {
        switch (config22.sslmode) {
          case "disable": {
            config22.ssl = false;
            break;
          }
          case "prefer":
          case "require":
          case "verify-ca":
          case "verify-full": {
            if (config22.sslmode !== "verify-full") {
              deprecatedSslModeWarning(config22.sslmode);
            }
            break;
          }
          case "no-verify": {
            config22.ssl.rejectUnauthorized = false;
            break;
          }
        }
      }
      return config22;
    }
    __name(parse2, "parse2");
    __name2(parse2, "parse");
    function toConnectionOptions(sslConfig) {
      const connectionOptions = Object.entries(sslConfig).reduce((c, [key, value]) => {
        if (value !== void 0 && value !== null) {
          c[key] = value;
        }
        return c;
      }, /* @__PURE__ */ Object.create(null));
      return connectionOptions;
    }
    __name(toConnectionOptions, "toConnectionOptions");
    __name2(toConnectionOptions, "toConnectionOptions");
    function toClientConfig(config22) {
      const poolConfig = Object.entries(config22).reduce((c, [key, value]) => {
        if (key === "ssl") {
          const sslConfig = value;
          if (typeof sslConfig === "boolean") {
            c[key] = sslConfig;
          }
          if (typeof sslConfig === "object") {
            c[key] = toConnectionOptions(sslConfig);
          }
        } else if (value !== void 0 && value !== null) {
          if (key === "port") {
            if (value !== "") {
              const v = parseInt(value, 10);
              if (isNaN(v)) {
                throw new Error(`Invalid ${key}: ${value}`);
              }
              c[key] = v;
            }
          } else {
            c[key] = value;
          }
        }
        return c;
      }, /* @__PURE__ */ Object.create(null));
      return poolConfig;
    }
    __name(toClientConfig, "toClientConfig");
    __name2(toClientConfig, "toClientConfig");
    function parseIntoClientConfig(str) {
      return toClientConfig(parse2(str));
    }
    __name(parseIntoClientConfig, "parseIntoClientConfig");
    __name2(parseIntoClientConfig, "parseIntoClientConfig");
    function deprecatedSslModeWarning(sslmode) {
      if (!deprecatedSslModeWarning.warned && typeof process !== "undefined" && process.emitWarning) {
        deprecatedSslModeWarning.warned = true;
        process.emitWarning(`SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'.
In the next major version (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt standard libpq semantics, which have weaker security guarantees.

To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=${sslmode}'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.`);
      }
    }
    __name(deprecatedSslModeWarning, "deprecatedSslModeWarning");
    __name2(deprecatedSslModeWarning, "deprecatedSslModeWarning");
    module.exports = parse2;
    parse2.parse = parse2;
    parse2.toClientConfig = toClientConfig;
    parse2.parseIntoClientConfig = parseIntoClientConfig;
  }
});
var require_connection_parameters = __commonJS({
  "../node_modules/pg/lib/connection-parameters.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var dns = require_dns();
    var defaults2 = require_defaults();
    var parse2 = require_pg_connection_string().parse;
    var val = /* @__PURE__ */ __name2(function(key, config22, envVar) {
      if (config22[key]) {
        return config22[key];
      }
      if (envVar === void 0) {
        envVar = process.env["PG" + key.toUpperCase()];
      } else if (envVar === false) {
      } else {
        envVar = process.env[envVar];
      }
      return envVar || defaults2[key];
    }, "val");
    var readSSLConfigFromEnvironment = /* @__PURE__ */ __name2(function() {
      switch (process.env.PGSSLMODE) {
        case "disable":
          return false;
        case "prefer":
        case "require":
        case "verify-ca":
        case "verify-full":
          return true;
        case "no-verify":
          return { rejectUnauthorized: false };
      }
      return defaults2.ssl;
    }, "readSSLConfigFromEnvironment");
    var quoteParamValue = /* @__PURE__ */ __name2(function(value) {
      return "'" + ("" + value).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
    }, "quoteParamValue");
    var add = /* @__PURE__ */ __name2(function(params, config22, paramName) {
      const value = config22[paramName];
      if (value !== void 0 && value !== null) {
        params.push(paramName + "=" + quoteParamValue(value));
      }
    }, "add");
    var ConnectionParameters = class {
      static {
        __name(this, "ConnectionParameters");
      }
      static {
        __name2(this, "ConnectionParameters");
      }
      constructor(config22) {
        config22 = typeof config22 === "string" ? parse2(config22) : config22 || {};
        if (config22.connectionString) {
          config22 = Object.assign({}, config22, parse2(config22.connectionString));
        }
        this.user = val("user", config22);
        this.database = val("database", config22);
        if (this.database === void 0) {
          this.database = this.user;
        }
        this.port = parseInt(val("port", config22), 10);
        this.host = val("host", config22);
        Object.defineProperty(this, "password", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: val("password", config22)
        });
        this.binary = val("binary", config22);
        this.options = val("options", config22);
        this.ssl = typeof config22.ssl === "undefined" ? readSSLConfigFromEnvironment() : config22.ssl;
        if (typeof this.ssl === "string") {
          if (this.ssl === "true") {
            this.ssl = true;
          }
        }
        if (this.ssl === "no-verify") {
          this.ssl = { rejectUnauthorized: false };
        }
        if (this.ssl && this.ssl.key) {
          Object.defineProperty(this.ssl, "key", {
            enumerable: false
          });
        }
        this.sslnegotiation = val("sslnegotiation", config22, "PGSSLNEGOTIATION");
        if (this.sslnegotiation !== void 0 && this.sslnegotiation !== "postgres" && this.sslnegotiation !== "direct") {
          throw new Error(
            `Invalid sslnegotiation value: "${this.sslnegotiation}". Valid values are "postgres" and "direct".`
          );
        }
        if (this.sslnegotiation === "direct" && !this.ssl) {
          throw new Error("sslnegotiation=direct requires SSL to be enabled");
        }
        this.client_encoding = val("client_encoding", config22);
        this.replication = val("replication", config22);
        this.isDomainSocket = !(this.host || "").indexOf("/");
        this.application_name = val("application_name", config22, "PGAPPNAME");
        this.fallback_application_name = val("fallback_application_name", config22, false);
        this.statement_timeout = val("statement_timeout", config22, false);
        this.lock_timeout = val("lock_timeout", config22, false);
        this.idle_in_transaction_session_timeout = val("idle_in_transaction_session_timeout", config22, false);
        this.query_timeout = val("query_timeout", config22, false);
        if (config22.connectionTimeoutMillis === void 0) {
          this.connect_timeout = process.env.PGCONNECT_TIMEOUT || 0;
        } else {
          this.connect_timeout = Math.floor(config22.connectionTimeoutMillis / 1e3);
        }
        if (config22.keepAlive === false) {
          this.keepalives = 0;
        } else if (config22.keepAlive === true) {
          this.keepalives = 1;
        }
        if (typeof config22.keepAliveInitialDelayMillis === "number") {
          this.keepalives_idle = Math.floor(config22.keepAliveInitialDelayMillis / 1e3);
        }
      }
      getLibpqConnectionString(cb) {
        const params = [];
        add(params, this, "user");
        add(params, this, "password");
        add(params, this, "port");
        add(params, this, "application_name");
        add(params, this, "fallback_application_name");
        add(params, this, "connect_timeout");
        add(params, this, "options");
        const ssl = typeof this.ssl === "object" ? this.ssl : this.ssl ? { sslmode: this.ssl } : {};
        add(params, ssl, "sslmode");
        add(params, ssl, "sslca");
        add(params, ssl, "sslkey");
        add(params, ssl, "sslcert");
        add(params, ssl, "sslrootcert");
        add(params, this, "sslnegotiation");
        if (this.database) {
          params.push("dbname=" + quoteParamValue(this.database));
        }
        if (this.replication) {
          params.push("replication=" + quoteParamValue(this.replication));
        }
        if (this.host) {
          params.push("host=" + quoteParamValue(this.host));
        }
        if (this.isDomainSocket) {
          return cb(null, params.join(" "));
        }
        if (this.client_encoding) {
          params.push("client_encoding=" + quoteParamValue(this.client_encoding));
        }
        dns.lookup(this.host, function(err, address) {
          if (err) return cb(err, null);
          params.push("hostaddr=" + quoteParamValue(address));
          return cb(null, params.join(" "));
        });
      }
    };
    module.exports = ConnectionParameters;
  }
});
var require_result = __commonJS({
  "../node_modules/pg/lib/result.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var types2 = require_pg_types();
    var matchRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/;
    var Result2 = class {
      static {
        __name(this, "Result2");
      }
      static {
        __name2(this, "Result");
      }
      constructor(rowMode, types3) {
        this.command = null;
        this.rowCount = null;
        this.oid = null;
        this.rows = [];
        this.fields = [];
        this._parsers = void 0;
        this._types = types3;
        this.RowCtor = null;
        this.rowAsArray = rowMode === "array";
        if (this.rowAsArray) {
          this.parseRow = this._parseRowAsArray;
        }
        this._prebuiltEmptyResultObject = null;
      }
      // adds a command complete message
      addCommandComplete(msg) {
        let match2;
        if (msg.text) {
          match2 = matchRegexp.exec(msg.text);
        } else {
          match2 = matchRegexp.exec(msg.command);
        }
        if (match2) {
          this.command = match2[1];
          if (match2[3]) {
            this.oid = parseInt(match2[2], 10);
            this.rowCount = parseInt(match2[3], 10);
          } else if (match2[2]) {
            this.rowCount = parseInt(match2[2], 10);
          }
        }
      }
      _parseRowAsArray(rowData) {
        const row = new Array(rowData.length);
        for (let i = 0, len = rowData.length; i < len; i++) {
          const rawValue = rowData[i];
          if (rawValue !== null) {
            row[i] = this._parsers[i](rawValue);
          } else {
            row[i] = null;
          }
        }
        return row;
      }
      parseRow(rowData) {
        const row = { ...this._prebuiltEmptyResultObject };
        for (let i = 0, len = rowData.length; i < len; i++) {
          const rawValue = rowData[i];
          const field = this.fields[i].name;
          if (rawValue !== null) {
            const v = this.fields[i].format === "binary" ? Buffer.from(rawValue) : rawValue;
            row[field] = this._parsers[i](v);
          } else {
            row[field] = null;
          }
        }
        return row;
      }
      addRow(row) {
        this.rows.push(row);
      }
      addFields(fieldDescriptions) {
        this.fields = fieldDescriptions;
        if (this.fields.length) {
          this._parsers = new Array(fieldDescriptions.length);
        }
        const row = /* @__PURE__ */ Object.create(null);
        for (let i = 0; i < fieldDescriptions.length; i++) {
          const desc = fieldDescriptions[i];
          row[desc.name] = null;
          if (this._types) {
            this._parsers[i] = this._types.getTypeParser(desc.dataTypeID, desc.format || "text");
          } else {
            this._parsers[i] = types2.getTypeParser(desc.dataTypeID, desc.format || "text");
          }
        }
        this._prebuiltEmptyResultObject = { ...row };
      }
    };
    module.exports = Result2;
  }
});
var require_query = __commonJS({
  "../node_modules/pg/lib/query.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var { EventEmitter: EventEmitter22 } = require_events();
    var Result2 = require_result();
    var utils = require_utils();
    var Query2 = class extends EventEmitter22 {
      static {
        __name(this, "Query2");
      }
      static {
        __name2(this, "Query");
      }
      constructor(config22, values, callback) {
        super();
        config22 = utils.normalizeQueryConfig(config22, values, callback);
        this.text = config22.text;
        this.values = config22.values;
        this.rows = config22.rows;
        this.types = config22.types;
        this.name = config22.name;
        this.queryMode = config22.queryMode;
        this.binary = config22.binary;
        this.portal = config22.portal || "";
        this.callback = config22.callback;
        this._rowMode = config22.rowMode;
        if (process.domain && config22.callback) {
          this.callback = process.domain.bind(config22.callback);
        }
        this._result = new Result2(this._rowMode, this.types);
        this._results = this._result;
        this._canceledDueToError = false;
      }
      requiresPreparation() {
        if (this.queryMode === "extended") {
          return true;
        }
        if (this.name) {
          return true;
        }
        if (this.rows) {
          return true;
        }
        if (!this.text) {
          return false;
        }
        if (!this.values) {
          return false;
        }
        return this.values.length > 0;
      }
      _checkForMultirow() {
        if (this._result.command) {
          if (!Array.isArray(this._results)) {
            this._results = [this._result];
          }
          this._result = new Result2(this._rowMode, this._result._types);
          this._results.push(this._result);
        }
      }
      // associates row metadata from the supplied
      // message with this query object
      // metadata used when parsing row results
      handleRowDescription(msg) {
        this._checkForMultirow();
        this._result.addFields(msg.fields);
        this._accumulateRows = this.callback || !this.listeners("row").length;
      }
      handleDataRow(msg) {
        let row;
        if (this._canceledDueToError) {
          return;
        }
        try {
          row = this._result.parseRow(msg.fields);
        } catch (err) {
          this._canceledDueToError = err;
          return;
        }
        this.emit("row", row, this._result);
        if (this._accumulateRows) {
          this._result.addRow(row);
        }
      }
      handleCommandComplete(msg, connection) {
        this._checkForMultirow();
        this._result.addCommandComplete(msg);
        if (this.rows) {
          connection.sync();
        }
      }
      // if a named prepared statement is created with empty query text
      // the backend will send an emptyQuery message but *not* a command complete message
      // since we pipeline sync immediately after execute we don't need to do anything here
      // unless we have rows specified, in which case we did not pipeline the initial sync call
      handleEmptyQuery(connection) {
        if (this.rows) {
          connection.sync();
        }
      }
      handleError(err, connection) {
        if (this._canceledDueToError) {
          err = this._canceledDueToError;
          this._canceledDueToError = false;
        }
        if (this.callback) {
          return this.callback(err);
        }
        this.emit("error", err);
      }
      handleReadyForQuery(con) {
        if (this._canceledDueToError) {
          return this.handleError(this._canceledDueToError, con);
        }
        if (this.callback) {
          try {
            this.callback(null, this._results);
          } catch (err) {
            process.nextTick(() => {
              throw err;
            });
          }
        }
        this.emit("end", this._results);
      }
      submit(connection) {
        if (typeof this.text !== "string" && typeof this.name !== "string") {
          return new Error("A query must have either text or a name. Supplying neither is unsupported.");
        }
        const previous = connection.parsedStatements[this.name] || connection.submittedNamedStatements[this.name];
        if (this.text && previous && this.text !== previous) {
          return new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`);
        }
        if (this.values && !Array.isArray(this.values)) {
          return new Error("Query values must be an array");
        }
        if (this.requiresPreparation()) {
          connection.stream.cork && connection.stream.cork();
          try {
            this.prepare(connection);
          } finally {
            connection.stream.uncork && connection.stream.uncork();
          }
        } else {
          connection.query(this.text);
        }
        return null;
      }
      hasBeenParsed(connection) {
        return this.name && (connection.parsedStatements[this.name] !== void 0 || connection.submittedNamedStatements[this.name] !== void 0);
      }
      handlePortalSuspended(connection) {
        this._getRows(connection, this.rows);
      }
      _getRows(connection, rows) {
        connection.execute({
          portal: this.portal,
          rows
        });
        if (!rows) {
          connection.sync();
        } else {
          connection.flush();
        }
      }
      // http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY
      prepare(connection) {
        if (!this.hasBeenParsed(connection)) {
          connection.parse({
            text: this.text,
            name: this.name,
            types: this.types
          });
          if (this.name) {
            connection.submittedNamedStatements[this.name] = this.text;
          }
        }
        try {
          connection.bind({
            portal: this.portal,
            statement: this.name,
            values: this.values,
            binary: this.binary,
            valueMapper: utils.prepareValue
          });
        } catch (err) {
          connection.close({ type: "S", name: this.name });
          connection.sync();
          this.handleError(err, connection);
          return;
        }
        connection.describe({
          type: "P",
          name: this.portal || ""
        });
        this._getRows(connection, this.rows);
      }
      handleCopyInResponse(connection) {
        connection.sendCopyFail("No source stream defined");
      }
      handleCopyData(msg, connection) {
      }
    };
    module.exports = Query2;
  }
});
var require_messages = __commonJS({
  "../node_modules/pg-protocol/dist/messages.js"(exports) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.NoticeMessage = exports.DataRowMessage = exports.CommandCompleteMessage = exports.ReadyForQueryMessage = exports.NotificationResponseMessage = exports.BackendKeyDataMessage = exports.AuthenticationMD5Password = exports.ParameterStatusMessage = exports.ParameterDescriptionMessage = exports.RowDescriptionMessage = exports.Field = exports.CopyResponse = exports.CopyDataMessage = exports.DatabaseError = exports.copyDone = exports.emptyQuery = exports.replicationStart = exports.portalSuspended = exports.noData = exports.closeComplete = exports.bindComplete = exports.parseComplete = void 0;
    exports.parseComplete = {
      name: "parseComplete",
      length: 5
    };
    exports.bindComplete = {
      name: "bindComplete",
      length: 5
    };
    exports.closeComplete = {
      name: "closeComplete",
      length: 5
    };
    exports.noData = {
      name: "noData",
      length: 5
    };
    exports.portalSuspended = {
      name: "portalSuspended",
      length: 5
    };
    exports.replicationStart = {
      name: "replicationStart",
      length: 4
    };
    exports.emptyQuery = {
      name: "emptyQuery",
      length: 4
    };
    exports.copyDone = {
      name: "copyDone",
      length: 4
    };
    var DatabaseError2 = class extends Error {
      static {
        __name(this, "DatabaseError2");
      }
      static {
        __name2(this, "DatabaseError");
      }
      constructor(message, length, name) {
        super(message);
        this.length = length;
        this.name = name;
      }
    };
    exports.DatabaseError = DatabaseError2;
    var CopyDataMessage = class {
      static {
        __name(this, "CopyDataMessage");
      }
      static {
        __name2(this, "CopyDataMessage");
      }
      constructor(length, chunk) {
        this.length = length;
        this.chunk = chunk;
        this.name = "copyData";
      }
    };
    exports.CopyDataMessage = CopyDataMessage;
    var CopyResponse = class {
      static {
        __name(this, "CopyResponse");
      }
      static {
        __name2(this, "CopyResponse");
      }
      constructor(length, name, binary, columnCount) {
        this.length = length;
        this.name = name;
        this.binary = binary;
        this.columnTypes = new Array(columnCount);
      }
    };
    exports.CopyResponse = CopyResponse;
    var Field = class {
      static {
        __name(this, "Field");
      }
      static {
        __name2(this, "Field");
      }
      constructor(name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, format) {
        this.name = name;
        this.tableID = tableID;
        this.columnID = columnID;
        this.dataTypeID = dataTypeID;
        this.dataTypeSize = dataTypeSize;
        this.dataTypeModifier = dataTypeModifier;
        this.format = format;
      }
    };
    exports.Field = Field;
    var RowDescriptionMessage = class {
      static {
        __name(this, "RowDescriptionMessage");
      }
      static {
        __name2(this, "RowDescriptionMessage");
      }
      constructor(length, fieldCount) {
        this.length = length;
        this.fieldCount = fieldCount;
        this.name = "rowDescription";
        this.fields = new Array(this.fieldCount);
      }
    };
    exports.RowDescriptionMessage = RowDescriptionMessage;
    var ParameterDescriptionMessage = class {
      static {
        __name(this, "ParameterDescriptionMessage");
      }
      static {
        __name2(this, "ParameterDescriptionMessage");
      }
      constructor(length, parameterCount) {
        this.length = length;
        this.parameterCount = parameterCount;
        this.name = "parameterDescription";
        this.dataTypeIDs = new Array(this.parameterCount);
      }
    };
    exports.ParameterDescriptionMessage = ParameterDescriptionMessage;
    var ParameterStatusMessage = class {
      static {
        __name(this, "ParameterStatusMessage");
      }
      static {
        __name2(this, "ParameterStatusMessage");
      }
      constructor(length, parameterName, parameterValue) {
        this.length = length;
        this.parameterName = parameterName;
        this.parameterValue = parameterValue;
        this.name = "parameterStatus";
      }
    };
    exports.ParameterStatusMessage = ParameterStatusMessage;
    var AuthenticationMD5Password = class {
      static {
        __name(this, "AuthenticationMD5Password");
      }
      static {
        __name2(this, "AuthenticationMD5Password");
      }
      constructor(length, salt) {
        this.length = length;
        this.salt = salt;
        this.name = "authenticationMD5Password";
      }
    };
    exports.AuthenticationMD5Password = AuthenticationMD5Password;
    var BackendKeyDataMessage = class {
      static {
        __name(this, "BackendKeyDataMessage");
      }
      static {
        __name2(this, "BackendKeyDataMessage");
      }
      constructor(length, processID, secretKey) {
        this.length = length;
        this.processID = processID;
        this.secretKey = secretKey;
        this.name = "backendKeyData";
      }
    };
    exports.BackendKeyDataMessage = BackendKeyDataMessage;
    var NotificationResponseMessage = class {
      static {
        __name(this, "NotificationResponseMessage");
      }
      static {
        __name2(this, "NotificationResponseMessage");
      }
      constructor(length, processId, channel22, payload) {
        this.length = length;
        this.processId = processId;
        this.channel = channel22;
        this.payload = payload;
        this.name = "notification";
      }
    };
    exports.NotificationResponseMessage = NotificationResponseMessage;
    var ReadyForQueryMessage = class {
      static {
        __name(this, "ReadyForQueryMessage");
      }
      static {
        __name2(this, "ReadyForQueryMessage");
      }
      constructor(length, status) {
        this.length = length;
        this.status = status;
        this.name = "readyForQuery";
      }
    };
    exports.ReadyForQueryMessage = ReadyForQueryMessage;
    var CommandCompleteMessage = class {
      static {
        __name(this, "CommandCompleteMessage");
      }
      static {
        __name2(this, "CommandCompleteMessage");
      }
      constructor(length, text) {
        this.length = length;
        this.text = text;
        this.name = "commandComplete";
      }
    };
    exports.CommandCompleteMessage = CommandCompleteMessage;
    var DataRowMessage = class {
      static {
        __name(this, "DataRowMessage");
      }
      static {
        __name2(this, "DataRowMessage");
      }
      constructor(length, fields) {
        this.length = length;
        this.fields = fields;
        this.name = "dataRow";
        this.fieldCount = fields.length;
      }
    };
    exports.DataRowMessage = DataRowMessage;
    var NoticeMessage = class {
      static {
        __name(this, "NoticeMessage");
      }
      static {
        __name2(this, "NoticeMessage");
      }
      constructor(length, message) {
        this.length = length;
        this.message = message;
        this.name = "notice";
      }
    };
    exports.NoticeMessage = NoticeMessage;
  }
});
var require_buffer_writer = __commonJS({
  "../node_modules/pg-protocol/dist/buffer-writer.js"(exports) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Writer = void 0;
    var Writer = class {
      static {
        __name(this, "Writer");
      }
      static {
        __name2(this, "Writer");
      }
      constructor(size = 256) {
        this.size = size;
        this.offset = 5;
        this.headerPosition = 0;
        this.buffer = Buffer.allocUnsafe(size);
      }
      ensure(size) {
        const remaining = this.buffer.length - this.offset;
        if (remaining < size) {
          const oldBuffer = this.buffer;
          const newSize = oldBuffer.length + (oldBuffer.length >> 1) + size;
          this.buffer = Buffer.allocUnsafe(newSize);
          oldBuffer.copy(this.buffer, 0, 0, this.offset);
        }
      }
      addInt32(num) {
        this.ensure(4);
        this.buffer[this.offset++] = num >>> 24 & 255;
        this.buffer[this.offset++] = num >>> 16 & 255;
        this.buffer[this.offset++] = num >>> 8 & 255;
        this.buffer[this.offset++] = num >>> 0 & 255;
        return this;
      }
      addInt16(num) {
        this.ensure(2);
        this.buffer[this.offset++] = num >>> 8 & 255;
        this.buffer[this.offset++] = num >>> 0 & 255;
        return this;
      }
      addCString(string) {
        if (!string) {
          this.ensure(1);
        } else {
          const len = Buffer.byteLength(string);
          this.ensure(len + 1);
          this.buffer.write(string, this.offset, "utf-8");
          this.offset += len;
        }
        this.buffer[this.offset++] = 0;
        return this;
      }
      addString(string = "") {
        const len = Buffer.byteLength(string);
        this.ensure(len);
        this.buffer.write(string, this.offset);
        this.offset += len;
        return this;
      }
      // Write an Int32 byte-length prefix immediately followed by the string's UTF-8
      // bytes. Postgres' Bind wire format prefixes every parameter with its length,
      // and doing it in one method computes Buffer.byteLength ONCE — the previous
      // `addInt32(Buffer.byteLength(s)).addString(s)` pairing scanned the string
      // three times (byteLength for the prefix, byteLength again inside addString,
      // then the encode), which is costly for large text parameters.
      addInt32PrefixedString(string) {
        const len = Buffer.byteLength(string);
        this.ensure(4 + len);
        const buffer = this.buffer;
        let offset = this.offset;
        buffer[offset++] = len >>> 24 & 255;
        buffer[offset++] = len >>> 16 & 255;
        buffer[offset++] = len >>> 8 & 255;
        buffer[offset++] = len >>> 0 & 255;
        buffer.write(string, offset, "utf-8");
        this.offset = offset + len;
        return this;
      }
      add(otherBuffer) {
        this.ensure(otherBuffer.length);
        otherBuffer.copy(this.buffer, this.offset);
        this.offset += otherBuffer.length;
        return this;
      }
      /**
       * Appends an uninitialized block of {@link size} bytes to the buffer and returns its offset.
       */
      reserveUnsafe(size) {
        const offset = this.offset;
        this.ensure(size);
        this.offset += size;
        return offset;
      }
      join(code) {
        if (code) {
          this.buffer[this.headerPosition] = code;
          const length = this.offset - (this.headerPosition + 1);
          this.buffer.writeInt32BE(length, this.headerPosition + 1);
        }
        return this.buffer.slice(code ? 0 : 5, this.offset);
      }
      flush(code) {
        const result = this.join(code);
        this.offset = 5;
        this.headerPosition = 0;
        this.buffer = Buffer.allocUnsafe(this.size);
        return result;
      }
      clear() {
        this.offset = 5;
        this.headerPosition = 0;
      }
    };
    exports.Writer = Writer;
  }
});
var require_serializer = __commonJS({
  "../node_modules/pg-protocol/dist/serializer.js"(exports) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.serialize = void 0;
    var buffer_writer_1 = require_buffer_writer();
    var writer = new buffer_writer_1.Writer();
    var startup = /* @__PURE__ */ __name2((opts) => {
      writer.addInt16(3).addInt16(0);
      for (const key of Object.keys(opts)) {
        writer.addCString(key).addCString(opts[key]);
      }
      writer.addCString("client_encoding").addCString("UTF8");
      const bodyBuffer = writer.addCString("").flush();
      const length = bodyBuffer.length + 4;
      return new buffer_writer_1.Writer().addInt32(length).add(bodyBuffer).flush();
    }, "startup");
    var requestSsl = /* @__PURE__ */ __name2(() => {
      const response = Buffer.allocUnsafe(8);
      response.writeInt32BE(8, 0);
      response.writeInt32BE(80877103, 4);
      return response;
    }, "requestSsl");
    var password = /* @__PURE__ */ __name2((password2) => {
      return writer.addCString(password2).flush(
        112
        /* code.startup */
      );
    }, "password");
    var sendSASLInitialResponseMessage = /* @__PURE__ */ __name2(function(mechanism, initialResponse) {
      writer.addCString(mechanism).addInt32PrefixedString(initialResponse);
      return writer.flush(
        112
        /* code.startup */
      );
    }, "sendSASLInitialResponseMessage");
    var sendSCRAMClientFinalMessage = /* @__PURE__ */ __name2(function(additionalData) {
      return writer.addString(additionalData).flush(
        112
        /* code.startup */
      );
    }, "sendSCRAMClientFinalMessage");
    var query = /* @__PURE__ */ __name2((text) => {
      return writer.addCString(text).flush(
        81
        /* code.query */
      );
    }, "query");
    var emptyArray = [];
    var parse2 = /* @__PURE__ */ __name2((query2) => {
      const name = query2.name || "";
      if (name.length > 63) {
        console.error("Warning! Postgres only supports 63 characters for query names.");
        console.error("You supplied %s (%s)", name, name.length);
        console.error("This can cause conflicts and silent errors executing queries");
      }
      const types2 = query2.types || emptyArray;
      const len = types2.length;
      const buffer = writer.addCString(name).addCString(query2.text).addInt16(len);
      for (let i = 0; i < len; i++) {
        buffer.addInt32(types2[i]);
      }
      return writer.flush(
        80
        /* code.parse */
      );
    }, "parse");
    var writeValues = /* @__PURE__ */ __name2(function(values, valueMapper, formatsOffset) {
      const len = values.length;
      for (let i = 0; i < len; i++) {
        const mappedVal = valueMapper ? valueMapper(values[i], i) : values[i];
        let formatByte = 0;
        if (mappedVal == null) {
          writer.addInt32(-1);
        } else if (mappedVal instanceof Buffer) {
          formatByte = 1;
          writer.addInt32(mappedVal.length);
          writer.add(mappedVal);
        } else {
          writer.addInt32PrefixedString(mappedVal);
        }
        const buf = writer.buffer;
        buf[formatsOffset++] = 0;
        buf[formatsOffset++] = formatByte;
      }
    }, "writeValues");
    var bind = /* @__PURE__ */ __name2((config22 = {}) => {
      const portal = config22.portal || "";
      const statement = config22.statement || "";
      const binary = config22.binary || false;
      const values = config22.values || emptyArray;
      const len = values.length;
      writer.addCString(portal).addCString(statement);
      writer.addInt16(len);
      const formatsOffset = writer.reserveUnsafe(len * 2);
      writer.addInt16(len);
      try {
        writeValues(values, config22.valueMapper, formatsOffset);
      } catch (err) {
        writer.clear();
        throw err;
      }
      writer.addInt16(1);
      writer.addInt16(
        binary ? 1 : 0
        /* ParamType.STRING */
      );
      return writer.flush(
        66
        /* code.bind */
      );
    }, "bind");
    var emptyExecute = Buffer.from([69, 0, 0, 0, 9, 0, 0, 0, 0, 0]);
    var execute = /* @__PURE__ */ __name2((config22) => {
      if (!config22 || !config22.portal && !config22.rows) {
        return emptyExecute;
      }
      const portal = config22.portal || "";
      const rows = config22.rows || 0;
      const portalLength = Buffer.byteLength(portal);
      const len = 4 + portalLength + 1 + 4;
      const buff = Buffer.allocUnsafe(1 + len);
      buff[0] = 69;
      buff.writeInt32BE(len, 1);
      buff.write(portal, 5, "utf-8");
      buff[portalLength + 5] = 0;
      buff.writeUInt32BE(rows, buff.length - 4);
      return buff;
    }, "execute");
    var cancel = /* @__PURE__ */ __name2((processID, secretKey) => {
      const buffer = Buffer.allocUnsafe(16);
      buffer.writeInt32BE(16, 0);
      buffer.writeInt16BE(1234, 4);
      buffer.writeInt16BE(5678, 6);
      buffer.writeInt32BE(processID, 8);
      buffer.writeInt32BE(secretKey, 12);
      return buffer;
    }, "cancel");
    var cstringMessage = /* @__PURE__ */ __name2((code, string) => {
      const stringLen = Buffer.byteLength(string);
      const len = 4 + stringLen + 1;
      const buffer = Buffer.allocUnsafe(1 + len);
      buffer[0] = code;
      buffer.writeInt32BE(len, 1);
      buffer.write(string, 5, "utf-8");
      buffer[len] = 0;
      return buffer;
    }, "cstringMessage");
    var emptyDescribePortal = writer.addCString("P").flush(
      68
      /* code.describe */
    );
    var emptyDescribeStatement = writer.addCString("S").flush(
      68
      /* code.describe */
    );
    var describe = /* @__PURE__ */ __name2((msg) => {
      return msg.name ? cstringMessage(68, `${msg.type}${msg.name || ""}`) : msg.type === "P" ? emptyDescribePortal : emptyDescribeStatement;
    }, "describe");
    var close2 = /* @__PURE__ */ __name2((msg) => {
      const text = `${msg.type}${msg.name || ""}`;
      return cstringMessage(67, text);
    }, "close");
    var copyData = /* @__PURE__ */ __name2((chunk) => {
      return writer.add(chunk).flush(
        100
        /* code.copyFromChunk */
      );
    }, "copyData");
    var copyFail = /* @__PURE__ */ __name2((message) => {
      return cstringMessage(102, message);
    }, "copyFail");
    var codeOnlyBuffer = /* @__PURE__ */ __name2((code) => Buffer.from([code, 0, 0, 0, 4]), "codeOnlyBuffer");
    var flushBuffer = codeOnlyBuffer(
      72
      /* code.flush */
    );
    var syncBuffer = codeOnlyBuffer(
      83
      /* code.sync */
    );
    var endBuffer = codeOnlyBuffer(
      88
      /* code.end */
    );
    var copyDoneBuffer = codeOnlyBuffer(
      99
      /* code.copyDone */
    );
    var serialize = {
      startup,
      password,
      requestSsl,
      sendSASLInitialResponseMessage,
      sendSCRAMClientFinalMessage,
      query,
      parse: parse2,
      bind,
      execute,
      describe,
      close: close2,
      flush: /* @__PURE__ */ __name2(() => flushBuffer, "flush"),
      sync: /* @__PURE__ */ __name2(() => syncBuffer, "sync"),
      end: /* @__PURE__ */ __name2(() => endBuffer, "end"),
      copyData,
      copyDone: /* @__PURE__ */ __name2(() => copyDoneBuffer, "copyDone"),
      copyFail,
      cancel
    };
    exports.serialize = serialize;
  }
});
var require_buffer_reader = __commonJS({
  "../node_modules/pg-protocol/dist/buffer-reader.js"(exports) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BufferReader = void 0;
    var BufferReader = class {
      static {
        __name(this, "BufferReader");
      }
      static {
        __name2(this, "BufferReader");
      }
      constructor(offset = 0) {
        this.offset = offset;
        this.buffer = Buffer.allocUnsafe(0);
        this.encoding = "utf-8";
      }
      setBuffer(offset, buffer) {
        this.offset = offset;
        this.buffer = buffer;
      }
      int16() {
        const result = this.buffer.readInt16BE(this.offset);
        this.offset += 2;
        return result;
      }
      byte() {
        const result = this.buffer[this.offset];
        this.offset++;
        return result;
      }
      int32() {
        const result = this.buffer.readInt32BE(this.offset);
        this.offset += 4;
        return result;
      }
      uint32() {
        const result = this.buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return result;
      }
      string(length) {
        const result = this.buffer.toString(this.encoding, this.offset, this.offset + length);
        this.offset += length;
        return result;
      }
      cstring() {
        const start = this.offset;
        let end = start;
        while (this.buffer[end++]) {
        }
        this.offset = end;
        return this.buffer.toString(this.encoding, start, end - 1);
      }
      bytes(length) {
        const result = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return result;
      }
    };
    exports.BufferReader = BufferReader;
  }
});
var require_parser = __commonJS({
  "../node_modules/pg-protocol/dist/parser.js"(exports) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Parser = void 0;
    var messages_1 = require_messages();
    var buffer_reader_1 = require_buffer_reader();
    var CODE_LENGTH = 1;
    var LEN_LENGTH = 4;
    var HEADER_LENGTH = CODE_LENGTH + LEN_LENGTH;
    var LATEINIT_LENGTH = -1;
    var emptyBuffer = Buffer.allocUnsafe(0);
    var Parser = class {
      static {
        __name(this, "Parser");
      }
      static {
        __name2(this, "Parser");
      }
      constructor(opts) {
        this.buffer = emptyBuffer;
        this.bufferLength = 0;
        this.bufferOffset = 0;
        this.reader = new buffer_reader_1.BufferReader();
        if ((opts === null || opts === void 0 ? void 0 : opts.mode) === "binary") {
          throw new Error("Binary mode not supported yet");
        }
        this.mode = (opts === null || opts === void 0 ? void 0 : opts.mode) || "text";
      }
      parse(buffer, callback) {
        this.mergeBuffer(buffer);
        const bufferFullLength = this.bufferOffset + this.bufferLength;
        let offset = this.bufferOffset;
        while (offset + HEADER_LENGTH <= bufferFullLength) {
          const code = this.buffer[offset];
          const length = this.buffer.readUInt32BE(offset + CODE_LENGTH);
          const fullMessageLength = CODE_LENGTH + length;
          if (fullMessageLength + offset <= bufferFullLength) {
            const message = this.handlePacket(offset + HEADER_LENGTH, code, length, this.buffer);
            callback(message);
            offset += fullMessageLength;
          } else {
            break;
          }
        }
        if (offset === bufferFullLength) {
          this.buffer = emptyBuffer;
          this.bufferLength = 0;
          this.bufferOffset = 0;
        } else {
          this.bufferLength = bufferFullLength - offset;
          this.bufferOffset = offset;
        }
      }
      mergeBuffer(buffer) {
        if (this.bufferLength > 0) {
          const newLength = this.bufferLength + buffer.byteLength;
          const newFullLength = newLength + this.bufferOffset;
          if (newFullLength > this.buffer.byteLength) {
            let newBuffer;
            if (newLength <= this.buffer.byteLength && this.bufferOffset >= this.bufferLength) {
              newBuffer = this.buffer;
            } else {
              let newBufferLength = this.buffer.byteLength * 2;
              while (newLength >= newBufferLength) {
                newBufferLength *= 2;
              }
              newBuffer = Buffer.allocUnsafe(newBufferLength);
            }
            this.buffer.copy(newBuffer, 0, this.bufferOffset, this.bufferOffset + this.bufferLength);
            this.buffer = newBuffer;
            this.bufferOffset = 0;
          }
          buffer.copy(this.buffer, this.bufferOffset + this.bufferLength);
          this.bufferLength = newLength;
        } else {
          this.buffer = buffer;
          this.bufferOffset = 0;
          this.bufferLength = buffer.byteLength;
        }
      }
      handlePacket(offset, code, length, bytes) {
        const { reader } = this;
        reader.setBuffer(offset, bytes);
        let message;
        switch (code) {
          case 50:
            message = messages_1.bindComplete;
            break;
          case 49:
            message = messages_1.parseComplete;
            break;
          case 51:
            message = messages_1.closeComplete;
            break;
          case 110:
            message = messages_1.noData;
            break;
          case 115:
            message = messages_1.portalSuspended;
            break;
          case 99:
            message = messages_1.copyDone;
            break;
          case 87:
            message = messages_1.replicationStart;
            break;
          case 73:
            message = messages_1.emptyQuery;
            break;
          case 68:
            message = parseDataRowMessage(reader);
            break;
          case 67:
            message = parseCommandCompleteMessage(reader);
            break;
          case 90:
            message = parseReadyForQueryMessage(reader);
            break;
          case 65:
            message = parseNotificationMessage(reader);
            break;
          case 82:
            message = parseAuthenticationResponse(reader, length);
            break;
          case 83:
            message = parseParameterStatusMessage(reader);
            break;
          case 75:
            message = parseBackendKeyData(reader);
            break;
          case 69:
            message = parseErrorMessage(reader, "error");
            break;
          case 78:
            message = parseErrorMessage(reader, "notice");
            break;
          case 84:
            message = parseRowDescriptionMessage(reader);
            break;
          case 116:
            message = parseParameterDescriptionMessage(reader);
            break;
          case 71:
            message = parseCopyInMessage(reader);
            break;
          case 72:
            message = parseCopyOutMessage(reader);
            break;
          case 100:
            message = parseCopyData(reader, length);
            break;
          default:
            return new messages_1.DatabaseError("received invalid response: " + code.toString(16), length, "error");
        }
        reader.setBuffer(0, emptyBuffer);
        message.length = length;
        return message;
      }
    };
    exports.Parser = Parser;
    var parseReadyForQueryMessage = /* @__PURE__ */ __name2((reader) => {
      const status = reader.string(1);
      return new messages_1.ReadyForQueryMessage(LATEINIT_LENGTH, status);
    }, "parseReadyForQueryMessage");
    var parseCommandCompleteMessage = /* @__PURE__ */ __name2((reader) => {
      const text = reader.cstring();
      return new messages_1.CommandCompleteMessage(LATEINIT_LENGTH, text);
    }, "parseCommandCompleteMessage");
    var parseCopyData = /* @__PURE__ */ __name2((reader, length) => {
      const chunk = reader.bytes(length - 4);
      return new messages_1.CopyDataMessage(LATEINIT_LENGTH, chunk);
    }, "parseCopyData");
    var parseCopyInMessage = /* @__PURE__ */ __name2((reader) => parseCopyMessage(reader, "copyInResponse"), "parseCopyInMessage");
    var parseCopyOutMessage = /* @__PURE__ */ __name2((reader) => parseCopyMessage(reader, "copyOutResponse"), "parseCopyOutMessage");
    var parseCopyMessage = /* @__PURE__ */ __name2((reader, messageName) => {
      const isBinary = reader.byte() !== 0;
      const columnCount = reader.int16();
      const message = new messages_1.CopyResponse(LATEINIT_LENGTH, messageName, isBinary, columnCount);
      for (let i = 0; i < columnCount; i++) {
        message.columnTypes[i] = reader.int16();
      }
      return message;
    }, "parseCopyMessage");
    var parseNotificationMessage = /* @__PURE__ */ __name2((reader) => {
      const processId = reader.int32();
      const channel22 = reader.cstring();
      const payload = reader.cstring();
      return new messages_1.NotificationResponseMessage(LATEINIT_LENGTH, processId, channel22, payload);
    }, "parseNotificationMessage");
    var parseRowDescriptionMessage = /* @__PURE__ */ __name2((reader) => {
      const fieldCount = reader.int16();
      const message = new messages_1.RowDescriptionMessage(LATEINIT_LENGTH, fieldCount);
      for (let i = 0; i < fieldCount; i++) {
        message.fields[i] = parseField(reader);
      }
      return message;
    }, "parseRowDescriptionMessage");
    var parseField = /* @__PURE__ */ __name2((reader) => {
      const name = reader.cstring();
      const tableID = reader.uint32();
      const columnID = reader.int16();
      const dataTypeID = reader.uint32();
      const dataTypeSize = reader.int16();
      const dataTypeModifier = reader.int32();
      const mode = reader.int16() === 0 ? "text" : "binary";
      return new messages_1.Field(name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, mode);
    }, "parseField");
    var parseParameterDescriptionMessage = /* @__PURE__ */ __name2((reader) => {
      const parameterCount = reader.int16();
      const message = new messages_1.ParameterDescriptionMessage(LATEINIT_LENGTH, parameterCount);
      for (let i = 0; i < parameterCount; i++) {
        message.dataTypeIDs[i] = reader.uint32();
      }
      return message;
    }, "parseParameterDescriptionMessage");
    var parseDataRowMessage = /* @__PURE__ */ __name2((reader) => {
      const fieldCount = reader.int16();
      const fields = new Array(fieldCount);
      for (let i = 0; i < fieldCount; i++) {
        const len = reader.int32();
        fields[i] = len === -1 ? null : reader.string(len);
      }
      return new messages_1.DataRowMessage(LATEINIT_LENGTH, fields);
    }, "parseDataRowMessage");
    var parseParameterStatusMessage = /* @__PURE__ */ __name2((reader) => {
      const name = reader.cstring();
      const value = reader.cstring();
      return new messages_1.ParameterStatusMessage(LATEINIT_LENGTH, name, value);
    }, "parseParameterStatusMessage");
    var parseBackendKeyData = /* @__PURE__ */ __name2((reader) => {
      const processID = reader.int32();
      const secretKey = reader.int32();
      return new messages_1.BackendKeyDataMessage(LATEINIT_LENGTH, processID, secretKey);
    }, "parseBackendKeyData");
    var parseAuthenticationResponse = /* @__PURE__ */ __name2((reader, length) => {
      const code = reader.int32();
      const message = {
        name: "authenticationOk",
        length
      };
      switch (code) {
        case 0:
          break;
        case 3:
          if (message.length === 8) {
            message.name = "authenticationCleartextPassword";
          }
          break;
        case 5:
          if (message.length === 12) {
            message.name = "authenticationMD5Password";
            const salt = reader.bytes(4);
            return new messages_1.AuthenticationMD5Password(LATEINIT_LENGTH, salt);
          }
          break;
        case 10:
          {
            message.name = "authenticationSASL";
            message.mechanisms = [];
            let mechanism;
            do {
              mechanism = reader.cstring();
              if (mechanism) {
                message.mechanisms.push(mechanism);
              }
            } while (mechanism);
          }
          break;
        case 11:
          message.name = "authenticationSASLContinue";
          message.data = reader.string(length - 8);
          break;
        case 12:
          message.name = "authenticationSASLFinal";
          message.data = reader.string(length - 8);
          break;
        default:
          throw new Error("Unknown authenticationOk message type " + code);
      }
      return message;
    }, "parseAuthenticationResponse");
    var parseErrorMessage = /* @__PURE__ */ __name2((reader, name) => {
      const fields = {};
      let fieldType = reader.string(1);
      while (fieldType !== "\0") {
        fields[fieldType] = reader.cstring();
        fieldType = reader.string(1);
      }
      const messageValue = fields.M;
      const message = name === "notice" ? new messages_1.NoticeMessage(LATEINIT_LENGTH, messageValue) : new messages_1.DatabaseError(messageValue, LATEINIT_LENGTH, name);
      message.severity = fields.S;
      message.code = fields.C;
      message.detail = fields.D;
      message.hint = fields.H;
      message.position = fields.P;
      message.internalPosition = fields.p;
      message.internalQuery = fields.q;
      message.where = fields.W;
      message.schema = fields.s;
      message.table = fields.t;
      message.column = fields.c;
      message.dataType = fields.d;
      message.constraint = fields.n;
      message.file = fields.F;
      message.line = fields.L;
      message.routine = fields.R;
      return message;
    }, "parseErrorMessage");
  }
});
var require_dist = __commonJS({
  "../node_modules/pg-protocol/dist/index.js"(exports) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DatabaseError = exports.serialize = void 0;
    exports.parse = parse2;
    var messages_1 = require_messages();
    Object.defineProperty(exports, "DatabaseError", { enumerable: true, get: /* @__PURE__ */ __name2(function() {
      return messages_1.DatabaseError;
    }, "get") });
    var serializer_1 = require_serializer();
    Object.defineProperty(exports, "serialize", { enumerable: true, get: /* @__PURE__ */ __name2(function() {
      return serializer_1.serialize;
    }, "get") });
    var parser_1 = require_parser();
    function parse2(stream, callback) {
      const parser = new parser_1.Parser();
      stream.on("data", (buffer) => parser.parse(buffer, callback));
      return new Promise((resolve) => stream.on("end", () => resolve()));
    }
    __name(parse2, "parse2");
    __name2(parse2, "parse");
  }
});
var require_net = __commonJS({
  "node-built-in-modules:net"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    module.exports = libDefault6;
  }
});
var require_tls = __commonJS({
  "node-built-in-modules:tls"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    module.exports = libDefault7;
  }
});
var require_dist2 = __commonJS({
  "../node_modules/pg-cloudflare/dist/index.js"(exports) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CloudflareSocket = void 0;
    var events_1 = require_events();
    var CloudflareSocket = class extends events_1.EventEmitter {
      static {
        __name(this, "CloudflareSocket");
      }
      static {
        __name2(this, "CloudflareSocket");
      }
      constructor(ssl) {
        super();
        this.ssl = ssl;
        this.writable = false;
        this.destroyed = false;
        this._upgrading = false;
        this._upgraded = false;
        this._cfSocket = null;
        this._cfWriter = null;
        this._cfReader = null;
      }
      setNoDelay() {
        return this;
      }
      setKeepAlive() {
        return this;
      }
      ref() {
        return this;
      }
      unref() {
        return this;
      }
      async connect(port, host, connectListener) {
        try {
          log32("connecting");
          if (connectListener)
            this.once("connect", connectListener);
          const options = this.ssl ? { secureTransport: "starttls" } : {};
          const mod = await import("cloudflare:sockets");
          const connect = mod.connect;
          this._cfSocket = connect(`${host}:${port}`, options);
          this._cfWriter = this._cfSocket.writable.getWriter();
          this._addClosedHandler();
          this._cfReader = this._cfSocket.readable.getReader();
          if (this.ssl) {
            this._listenOnce().catch((e) => this.emit("error", e));
          } else {
            this._listen().catch((e) => this.emit("error", e));
          }
          await this._cfWriter.ready;
          log32("socket ready");
          this.writable = true;
          this.emit("connect");
          return this;
        } catch (e) {
          this.emit("error", e);
        }
      }
      async _listen() {
        while (true) {
          log32("awaiting receive from CF socket");
          const { done, value } = await this._cfReader.read();
          log32("CF socket received:", done, value);
          if (done) {
            log32("done");
            break;
          }
          this.emit("data", Buffer.from(value));
        }
      }
      async _listenOnce() {
        log32("awaiting first receive from CF socket");
        const { done, value } = await this._cfReader.read();
        log32("First CF socket received:", done, value);
        this.emit("data", Buffer.from(value));
      }
      write(data, encodingOrCallback = "utf8", callback = () => {
      }) {
        const encoding = typeof encodingOrCallback === "function" ? "utf8" : encodingOrCallback;
        if (typeof encodingOrCallback === "function")
          callback = encodingOrCallback;
        if (data.length === 0)
          return callback();
        if (typeof data === "string")
          data = Buffer.from(data, encoding);
        log32("sending data direct:", data);
        this._cfWriter.write(data).then(() => {
          log32("data sent");
          callback();
        }, (err) => {
          log32("send error", err);
          callback(err);
        });
        return true;
      }
      end(data = Buffer.alloc(0), encoding = "utf8", callback = () => {
      }) {
        log32("ending CF socket");
        this.write(data, encoding, (err) => {
          const socket = this._cfSocket;
          const closePromise = socket?.close();
          closePromise?.then(() => {
            if (this._cfSocket === socket) {
              this._cfSocket = null;
              this.emit("close");
            }
          }).catch((e) => this.emit("error", e));
          if (callback)
            callback(err);
        });
        return this;
      }
      destroy(reason) {
        log32("destroying CF socket", reason);
        this.destroyed = true;
        return this.end();
      }
      startTls(options) {
        if (this._upgraded) {
          this.emit("error", "Cannot call `startTls()` more than once on a socket");
          return;
        }
        this._cfWriter.releaseLock();
        this._cfReader.releaseLock();
        this._upgrading = true;
        this._cfSocket = this._cfSocket.startTls(options);
        this._cfWriter = this._cfSocket.writable.getWriter();
        this._cfReader = this._cfSocket.readable.getReader();
        this._addClosedHandler();
        this._listen().catch((e) => this.emit("error", e));
      }
      _addClosedHandler() {
        const socket = this._cfSocket;
        socket.closed.then(() => {
          if (!this._upgrading) {
            log32("CF socket closed");
            if (this._cfSocket === socket) {
              this._cfSocket = null;
              this.emit("close");
            }
          } else {
            this._upgrading = false;
            this._upgraded = true;
          }
        }).catch((e) => this.emit("error", e));
      }
    };
    exports.CloudflareSocket = CloudflareSocket;
    var debug32 = false;
    function dump(data) {
      if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
        const buf = data instanceof Uint8Array ? Buffer.from(data) : Buffer.from(data);
        const hex = buf.toString("hex");
        const str = new TextDecoder().decode(data);
        return `
>>> STR: "${str.replace(/\n/g, "\\n")}"
>>> HEX: ${hex}
`;
      } else {
        return data;
      }
    }
    __name(dump, "dump");
    __name2(dump, "dump");
    function log32(...args) {
      debug32 && console.log(...args.map(dump));
    }
    __name(log32, "log3");
    __name2(log32, "log");
  }
});
var require_stream = __commonJS({
  "../node_modules/pg/lib/stream.js"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var { getStream, getSecureStream } = getStreamFuncs();
    module.exports = {
      /**
       * Get a socket stream compatible with the current runtime environment.
       * @returns {Duplex}
       */
      getStream,
      /**
       * Get a TLS secured socket, compatible with the current environment,
       * using the socket and other settings given in `options`.
       * @returns {Duplex}
       */
      getSecureStream
    };
    function getNodejsStreamFuncs() {
      function getStream2(ssl) {
        const net = require_net();
        return new net.Socket();
      }
      __name(getStream2, "getStream2");
      __name2(getStream2, "getStream");
      function getSecureStream2(options) {
        const tls = require_tls();
        return tls.connect(options);
      }
      __name(getSecureStream2, "getSecureStream2");
      __name2(getSecureStream2, "getSecureStream");
      return {
        getStream: getStream2,
        getSecureStream: getSecureStream2
      };
    }
    __name(getNodejsStreamFuncs, "getNodejsStreamFuncs");
    __name2(getNodejsStreamFuncs, "getNodejsStreamFuncs");
    function getCloudflareStreamFuncs() {
      function getStream2(ssl) {
        const { CloudflareSocket } = require_dist2();
        return new CloudflareSocket(ssl);
      }
      __name(getStream2, "getStream2");
      __name2(getStream2, "getStream");
      function getSecureStream2(options) {
        options.socket.startTls(options);
        return options.socket;
      }
      __name(getSecureStream2, "getSecureStream2");
      __name2(getSecureStream2, "getSecureStream");
      return {
        getStream: getStream2,
        getSecureStream: getSecureStream2
      };
    }
    __name(getCloudflareStreamFuncs, "getCloudflareStreamFuncs");
    __name2(getCloudflareStreamFuncs, "getCloudflareStreamFuncs");
    function isCloudflareRuntime() {
      if (typeof navigator === "object" && navigator !== null && true) {
        return true;
      }
      if (typeof Response === "function") {
        const resp = new Response(null, { cf: { thing: true } });
        if (typeof resp.cf === "object" && resp.cf !== null && resp.cf.thing) {
          return true;
        }
      }
      return false;
    }
    __name(isCloudflareRuntime, "isCloudflareRuntime");
    __name2(isCloudflareRuntime, "isCloudflareRuntime");
    function getStreamFuncs() {
      if (isCloudflareRuntime()) {
        return getCloudflareStreamFuncs();
      }
      return getNodejsStreamFuncs();
    }
    __name(getStreamFuncs, "getStreamFuncs");
    __name2(getStreamFuncs, "getStreamFuncs");
  }
});
var require_connection = __commonJS({
  "../node_modules/pg/lib/connection.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var EventEmitter22 = require_events().EventEmitter;
    var { parse: parse2, serialize } = require_dist();
    var stream = require_stream();
    var { getStream } = stream;
    var flushBuffer = serialize.flush();
    var syncBuffer = serialize.sync();
    var endBuffer = serialize.end();
    var Connection2 = class extends EventEmitter22 {
      static {
        __name(this, "Connection2");
      }
      static {
        __name2(this, "Connection");
      }
      constructor(config22) {
        super();
        config22 = config22 || {};
        this.stream = config22.stream || getStream(config22.ssl);
        if (typeof this.stream === "function") {
          this.stream = this.stream(config22);
        }
        this._keepAlive = config22.keepAlive;
        this._keepAliveInitialDelayMillis = config22.keepAliveInitialDelayMillis;
        this.parsedStatements = {};
        this.submittedNamedStatements = {};
        this.ssl = config22.ssl || false;
        this.sslNegotiation = config22.sslNegotiation || "postgres";
        this._ending = false;
        this._emitMessage = false;
        const self = this;
        this.on("newListener", function(eventName) {
          if (eventName === "message") {
            self._emitMessage = true;
          }
        });
      }
      connect(port, host) {
        const self = this;
        this._connecting = true;
        this.stream.setNoDelay(true);
        this.stream.connect(port, host);
        this.stream.once("connect", function() {
          if (self._keepAlive) {
            self.stream.setKeepAlive(true, self._keepAliveInitialDelayMillis);
          }
          self.emit("connect");
        });
        const reportStreamError = /* @__PURE__ */ __name2(function(error32) {
          if (self._ending && (error32.code === "ECONNRESET" || error32.code === "EPIPE")) {
            return;
          }
          self.emit("error", error32);
        }, "reportStreamError");
        this.stream.on("error", reportStreamError);
        this.stream.on("close", function() {
          self.emit("end");
        });
        if (!this.ssl) {
          return this.attachListeners(this.stream);
        }
        if (this.sslNegotiation === "direct") {
          return this.stream.once("connect", function() {
            self.upgradeToSSL(host, reportStreamError);
          });
        }
        this.stream.once("data", function(buffer) {
          const responseCode = buffer.toString("utf8");
          switch (responseCode) {
            case "S":
              break;
            case "N":
              self.stream.end();
              return self.emit("error", new Error("The server does not support SSL connections"));
            default:
              self.stream.end();
              return self.emit("error", new Error("There was an error establishing an SSL connection"));
          }
          self.upgradeToSSL(host, reportStreamError);
        });
      }
      upgradeToSSL(host, reportStreamError) {
        const self = this;
        const options = {
          socket: self.stream,
          // tls.connect checks the server identity against `servername`, falling
          // back to `host` and then to 'localhost'. `servername` must stay unset
          // for IP addresses (see below), so `host` is needed to keep certificate
          // validation working when connecting to an IP address.
          host
        };
        if (self.ssl !== true) {
          Object.assign(options, self.ssl);
          if ("key" in self.ssl) {
            options.key = self.ssl.key;
          }
        }
        if (self.sslNegotiation === "direct") {
          options.ALPNProtocols = ["postgresql"];
        }
        const net = require_net();
        if (net.isIP && net.isIP(host) === 0) {
          options.servername = host;
        }
        try {
          self.stream = stream.getSecureStream(options);
        } catch (err) {
          return self.emit("error", err);
        }
        self.attachListeners(self.stream);
        self.stream.on("error", reportStreamError);
        self.emit("sslconnect");
      }
      attachListeners(stream2) {
        parse2(stream2, (msg) => {
          const eventName = msg.name === "error" ? "errorMessage" : msg.name;
          if (this._emitMessage) {
            this.emit("message", msg);
          }
          this.emit(eventName, msg);
        });
      }
      requestSsl() {
        this.stream.write(serialize.requestSsl());
      }
      startup(config22) {
        this.stream.write(serialize.startup(config22));
      }
      cancel(processID, secretKey) {
        this._send(serialize.cancel(processID, secretKey));
      }
      password(password) {
        this._send(serialize.password(password));
      }
      sendSASLInitialResponseMessage(mechanism, initialResponse) {
        this._send(serialize.sendSASLInitialResponseMessage(mechanism, initialResponse));
      }
      sendSCRAMClientFinalMessage(additionalData) {
        this._send(serialize.sendSCRAMClientFinalMessage(additionalData));
      }
      _send(buffer) {
        if (!this.stream.writable) {
          return false;
        }
        return this.stream.write(buffer);
      }
      query(text) {
        this._send(serialize.query(text));
      }
      // send parse message
      parse(query) {
        this._send(serialize.parse(query));
      }
      // send bind message
      bind(config22) {
        this._send(serialize.bind(config22));
      }
      // send execute message
      execute(config22) {
        this._send(serialize.execute(config22));
      }
      flush() {
        if (this.stream.writable) {
          this.stream.write(flushBuffer);
        }
      }
      sync() {
        this._send(syncBuffer);
      }
      ref() {
        this.stream.ref();
      }
      unref() {
        this.stream.unref();
      }
      end() {
        this._ending = true;
        if (!this._connecting || !this.stream.writable) {
          this.stream.end();
          return;
        }
        return this.stream.write(endBuffer, () => {
          this.stream.end();
        });
      }
      close(msg) {
        this._send(serialize.close(msg));
      }
      describe(msg) {
        this._send(serialize.describe(msg));
      }
      sendCopyFromChunk(chunk) {
        this._send(serialize.copyData(chunk));
      }
      endCopyFrom() {
        this._send(serialize.copyDone());
      }
      sendCopyFail(msg) {
        this._send(serialize.copyFail(msg));
      }
    };
    module.exports = Connection2;
  }
});
var require_path = __commonJS({
  "node-built-in-modules:path"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    module.exports = libDefault8;
  }
});
var require_stream2 = __commonJS({
  "node-built-in-modules:stream"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    module.exports = libDefault9;
  }
});
var require_string_decoder = __commonJS({
  "node-built-in-modules:string_decoder"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    module.exports = libDefault10;
  }
});
var require_split2 = __commonJS({
  "../node_modules/split2/index.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var { Transform } = require_stream2();
    var { StringDecoder } = require_string_decoder();
    var kLast = /* @__PURE__ */ Symbol("last");
    var kDecoder = /* @__PURE__ */ Symbol("decoder");
    function transform(chunk, enc, cb) {
      let list;
      if (this.overflow) {
        const buf = this[kDecoder].write(chunk);
        list = buf.split(this.matcher);
        if (list.length === 1) return cb();
        list.shift();
        this.overflow = false;
      } else {
        this[kLast] += this[kDecoder].write(chunk);
        list = this[kLast].split(this.matcher);
      }
      this[kLast] = list.pop();
      for (let i = 0; i < list.length; i++) {
        try {
          push(this, this.mapper(list[i]));
        } catch (error32) {
          return cb(error32);
        }
      }
      this.overflow = this[kLast].length > this.maxLength;
      if (this.overflow && !this.skipOverflow) {
        cb(new Error("maximum buffer reached"));
        return;
      }
      cb();
    }
    __name(transform, "transform");
    __name2(transform, "transform");
    function flush(cb) {
      this[kLast] += this[kDecoder].end();
      if (this[kLast]) {
        try {
          push(this, this.mapper(this[kLast]));
        } catch (error32) {
          return cb(error32);
        }
      }
      cb();
    }
    __name(flush, "flush");
    __name2(flush, "flush");
    function push(self, val) {
      if (val !== void 0) {
        self.push(val);
      }
    }
    __name(push, "push");
    __name2(push, "push");
    function noop(incoming) {
      return incoming;
    }
    __name(noop, "noop");
    __name2(noop, "noop");
    function split(matcher, mapper, options) {
      matcher = matcher || /\r?\n/;
      mapper = mapper || noop;
      options = options || {};
      switch (arguments.length) {
        case 1:
          if (typeof matcher === "function") {
            mapper = matcher;
            matcher = /\r?\n/;
          } else if (typeof matcher === "object" && !(matcher instanceof RegExp) && !matcher[Symbol.split]) {
            options = matcher;
            matcher = /\r?\n/;
          }
          break;
        case 2:
          if (typeof matcher === "function") {
            options = mapper;
            mapper = matcher;
            matcher = /\r?\n/;
          } else if (typeof mapper === "object") {
            options = mapper;
            mapper = noop;
          }
      }
      options = Object.assign({}, options);
      options.autoDestroy = true;
      options.transform = transform;
      options.flush = flush;
      options.readableObjectMode = true;
      const stream = new Transform(options);
      stream[kLast] = "";
      stream[kDecoder] = new StringDecoder("utf8");
      stream.matcher = matcher;
      stream.mapper = mapper;
      stream.maxLength = options.maxLength;
      stream.skipOverflow = options.skipOverflow || false;
      stream.overflow = false;
      stream._destroy = function(err, cb) {
        this._writableState.errorEmitted = false;
        cb(err);
      };
      return stream;
    }
    __name(split, "split");
    __name2(split, "split");
    module.exports = split;
  }
});
var require_helper = __commonJS({
  "../node_modules/pgpass/lib/helper.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var path = require_path();
    var Stream = require_stream2().Stream;
    var split = require_split2();
    var util = require_util();
    var defaultPort = 5432;
    var isWin = process.platform === "win32";
    var warnStream = process.stderr;
    var S_IRWXG2 = 56;
    var S_IRWXO2 = 7;
    var S_IFMT2 = 61440;
    var S_IFREG2 = 32768;
    function isRegFile(mode) {
      return (mode & S_IFMT2) == S_IFREG2;
    }
    __name(isRegFile, "isRegFile");
    __name2(isRegFile, "isRegFile");
    var fieldNames = ["host", "port", "database", "user", "password"];
    var nrOfFields = fieldNames.length;
    var passKey = fieldNames[nrOfFields - 1];
    function warn32() {
      var isWritable = warnStream instanceof Stream && true === warnStream.writable;
      if (isWritable) {
        var args = Array.prototype.slice.call(arguments).concat("\n");
        warnStream.write(util.format.apply(util, args));
      }
    }
    __name(warn32, "warn3");
    __name2(warn32, "warn");
    Object.defineProperty(module.exports, "isWin", {
      get: /* @__PURE__ */ __name2(function() {
        return isWin;
      }, "get"),
      set: /* @__PURE__ */ __name2(function(val) {
        isWin = val;
      }, "set")
    });
    module.exports.warnTo = function(stream) {
      var old = warnStream;
      warnStream = stream;
      return old;
    };
    module.exports.getFileName = function(rawEnv) {
      var env22 = rawEnv || process.env;
      var file = env22.PGPASSFILE || (isWin ? path.join(env22.APPDATA || "./", "postgresql", "pgpass.conf") : path.join(env22.HOME || "./", ".pgpass"));
      return file;
    };
    module.exports.usePgPass = function(stats, fname) {
      if (Object.prototype.hasOwnProperty.call(process.env, "PGPASSWORD")) {
        return false;
      }
      if (isWin) {
        return true;
      }
      fname = fname || "<unkn>";
      if (!isRegFile(stats.mode)) {
        warn32('WARNING: password file "%s" is not a plain file', fname);
        return false;
      }
      if (stats.mode & (S_IRWXG2 | S_IRWXO2)) {
        warn32('WARNING: password file "%s" has group or world access; permissions should be u=rw (0600) or less', fname);
        return false;
      }
      return true;
    };
    var matcher = module.exports.match = function(connInfo, entry) {
      return fieldNames.slice(0, -1).reduce(function(prev, field, idx) {
        if (idx == 1) {
          if (Number(connInfo[field] || defaultPort) === Number(entry[field])) {
            return prev && true;
          }
        }
        return prev && (entry[field] === "*" || entry[field] === connInfo[field]);
      }, true);
    };
    module.exports.getPassword = function(connInfo, stream, cb) {
      var pass;
      var lineStream = stream.pipe(split());
      function onLine(line) {
        var entry = parseLine(line);
        if (entry && isValidEntry(entry) && matcher(connInfo, entry)) {
          pass = entry[passKey];
          lineStream.end();
        }
      }
      __name(onLine, "onLine");
      __name2(onLine, "onLine");
      var onEnd = /* @__PURE__ */ __name2(function() {
        stream.destroy();
        cb(pass);
      }, "onEnd");
      var onErr = /* @__PURE__ */ __name2(function(err) {
        stream.destroy();
        warn32("WARNING: error on reading file: %s", err);
        cb(void 0);
      }, "onErr");
      stream.on("error", onErr);
      lineStream.on("data", onLine).on("end", onEnd).on("error", onErr);
    };
    var parseLine = module.exports.parseLine = function(line) {
      if (line.length < 11 || line.match(/^\s+#/)) {
        return null;
      }
      var curChar = "";
      var prevChar = "";
      var fieldIdx = 0;
      var startIdx = 0;
      var endIdx = 0;
      var obj = {};
      var isLastField = false;
      var addToObj = /* @__PURE__ */ __name2(function(idx, i0, i1) {
        var field = line.substring(i0, i1);
        if (!Object.hasOwnProperty.call(process.env, "PGPASS_NO_DEESCAPE")) {
          field = field.replace(/\\([:\\])/g, "$1");
        }
        obj[fieldNames[idx]] = field;
      }, "addToObj");
      for (var i = 0; i < line.length - 1; i += 1) {
        curChar = line.charAt(i + 1);
        prevChar = line.charAt(i);
        isLastField = fieldIdx == nrOfFields - 1;
        if (isLastField) {
          addToObj(fieldIdx, startIdx);
          break;
        }
        if (i >= 0 && curChar == ":" && prevChar !== "\\") {
          addToObj(fieldIdx, startIdx, i + 1);
          startIdx = i + 2;
          fieldIdx += 1;
        }
      }
      obj = Object.keys(obj).length === nrOfFields ? obj : null;
      return obj;
    };
    var isValidEntry = module.exports.isValidEntry = function(entry) {
      var rules = {
        // host
        0: function(x) {
          return x.length > 0;
        },
        // port
        1: function(x) {
          if (x === "*") {
            return true;
          }
          x = Number(x);
          return isFinite(x) && x > 0 && x < 9007199254740992 && Math.floor(x) === x;
        },
        // database
        2: function(x) {
          return x.length > 0;
        },
        // username
        3: function(x) {
          return x.length > 0;
        },
        // password
        4: function(x) {
          return x.length > 0;
        }
      };
      for (var idx = 0; idx < fieldNames.length; idx += 1) {
        var rule = rules[idx];
        var value = entry[fieldNames[idx]] || "";
        var res = rule(value);
        if (!res) {
          return false;
        }
      }
      return true;
    };
  }
});
var require_lib = __commonJS({
  "../node_modules/pgpass/lib/index.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var path = require_path();
    var fs = require_fs();
    var helper = require_helper();
    module.exports = function(connInfo, cb) {
      var file = helper.getFileName();
      fs.stat(file, function(err, stat3) {
        if (err || !helper.usePgPass(stat3, file)) {
          return cb(void 0);
        }
        var st = fs.createReadStream(file);
        helper.getPassword(connInfo, st, cb);
      });
    };
    module.exports.warnTo = helper.warnTo;
  }
});
var require_client = __commonJS({
  "../node_modules/pg/lib/client.js"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var EventEmitter22 = require_events().EventEmitter;
    var utils = require_utils();
    var nodeUtils = require_util();
    var sasl = require_sasl();
    var TypeOverrides2 = require_type_overrides();
    var ConnectionParameters = require_connection_parameters();
    var Query2 = require_query();
    var defaults2 = require_defaults();
    var Connection2 = require_connection();
    var crypto2 = require_utils2();
    var activeQueryDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Client.activeQuery is deprecated and will be removed in pg@9.0"
    );
    var queryQueueDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Client.queryQueue is deprecated and will be removed in pg@9.0."
    );
    var pgPassDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "pgpass support is deprecated and will be removed in pg@9.0. You can provide an async function as the password property to the Client/Pool constructor that returns a password instead. Within this function you can call the pgpass module in your own code."
    );
    var byoPromiseDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Passing a custom Promise implementation to the Client/Pool constructor is deprecated and will be removed in pg@9.0."
    );
    var queryQueueLengthDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead."
    );
    function coerceNumberOrDefault(value, defaultValue) {
      if (typeof value === "number") {
        return Number.isFinite(value) ? value : defaultValue;
      }
      if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value);
        return Number.isFinite(n) ? n : defaultValue;
      }
      return defaultValue;
    }
    __name(coerceNumberOrDefault, "coerceNumberOrDefault");
    __name2(coerceNumberOrDefault, "coerceNumberOrDefault");
    var Client2 = class extends EventEmitter22 {
      static {
        __name(this, "Client2");
      }
      static {
        __name2(this, "Client");
      }
      constructor(config22) {
        super();
        this.connectionParameters = new ConnectionParameters(config22);
        this.user = this.connectionParameters.user;
        this.database = this.connectionParameters.database;
        this.port = this.connectionParameters.port;
        this.host = this.connectionParameters.host;
        Object.defineProperty(this, "password", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: this.connectionParameters.password
        });
        this.replication = this.connectionParameters.replication;
        const c = config22 || {};
        if (c.Promise) {
          byoPromiseDeprecationNotice();
        }
        this._Promise = c.Promise || global.Promise;
        this._types = new TypeOverrides2(c.types);
        this._ending = false;
        this._ended = false;
        this._connecting = false;
        this._connected = false;
        this._connectionError = false;
        this._queryable = true;
        this._activeQuery = null;
        this._txStatus = null;
        this.enableChannelBinding = Boolean(c.enableChannelBinding);
        this.scramMaxIterations = coerceNumberOrDefault(c.scramMaxIterations, sasl.DEFAULT_MAX_SCRAM_ITERATIONS);
        this.connection = c.connection || new Connection2({
          stream: c.stream,
          ssl: this.connectionParameters.ssl,
          sslNegotiation: this.connectionParameters.sslnegotiation,
          keepAlive: c.keepAlive || false,
          keepAliveInitialDelayMillis: c.keepAliveInitialDelayMillis || 0,
          encoding: this.connectionParameters.client_encoding || "utf8"
        });
        this._queryQueue = [];
        this._sentQueryQueue = [];
        this.pipeline = Boolean(c.pipeline);
        this.binary = c.binary || defaults2.binary;
        this.processID = null;
        this.secretKey = null;
        this.ssl = this.connectionParameters.ssl || false;
        this.sslNegotiation = this.connectionParameters.sslnegotiation || "postgres";
        if (this.ssl && this.ssl.key) {
          Object.defineProperty(this.ssl, "key", {
            enumerable: false
          });
        }
        this._connectionTimeoutMillis = c.connectionTimeoutMillis || 0;
      }
      get activeQuery() {
        activeQueryDeprecationNotice();
        return this._activeQuery;
      }
      set activeQuery(val) {
        activeQueryDeprecationNotice();
        this._activeQuery = val;
      }
      _getActiveQuery() {
        return this._activeQuery;
      }
      _errorAllQueries(err) {
        const enqueueError = /* @__PURE__ */ __name2((query) => {
          process.nextTick(() => {
            query.handleError(err, this.connection);
          });
        }, "enqueueError");
        const activeQuery = this._getActiveQuery();
        if (activeQuery) {
          enqueueError(activeQuery);
          this._activeQuery = null;
        }
        this._sentQueryQueue.forEach(enqueueError);
        this._sentQueryQueue.length = 0;
        this._queryQueue.forEach(enqueueError);
        this._queryQueue.length = 0;
      }
      _connect(callback) {
        const self = this;
        const con = this.connection;
        this._connectionCallback = callback;
        if (this._connecting || this._connected) {
          const err = new Error("Client has already been connected. You cannot reuse a client.");
          process.nextTick(() => {
            callback(err);
          });
          return;
        }
        this._connecting = true;
        if (this._connectionTimeoutMillis > 0) {
          this.connectionTimeoutHandle = setTimeout(() => {
            con._ending = true;
            con.stream.destroy(new Error("timeout expired"));
          }, this._connectionTimeoutMillis);
          if (this.connectionTimeoutHandle.unref) {
            this.connectionTimeoutHandle.unref();
          }
        }
        if (this.host && this.host.indexOf("/") === 0) {
          con.connect(this.host + "/.s.PGSQL." + this.port);
        } else {
          con.connect(this.port, this.host);
        }
        con.on("connect", function() {
          if (self.ssl) {
            if (self.sslNegotiation !== "direct") {
              con.requestSsl();
            }
          } else {
            con.startup(self.getStartupConf());
          }
        });
        con.on("sslconnect", function() {
          con.startup(self.getStartupConf());
        });
        this._attachListeners(con);
        con.once("end", () => {
          const error32 = this._ending ? new Error("Connection terminated") : new Error("Connection terminated unexpectedly");
          clearTimeout(this.connectionTimeoutHandle);
          this._errorAllQueries(error32);
          this._ended = true;
          if (!this._ending) {
            if (this._connecting && !this._connectionError) {
              if (this._connectionCallback) {
                this._connectionCallback(error32);
              } else {
                this._handleErrorEvent(error32);
              }
            } else if (!this._connectionError) {
              this._handleErrorEvent(error32);
            }
          }
          process.nextTick(() => {
            this.emit("end");
          });
        });
      }
      connect(callback) {
        if (callback) {
          this._connect(callback);
          return;
        }
        return new this._Promise((resolve, reject) => {
          this._connect((error32) => {
            if (error32) {
              reject(error32);
            } else {
              resolve(this);
            }
          });
        });
      }
      _attachListeners(con) {
        con.on("authenticationCleartextPassword", this._handleAuthCleartextPassword.bind(this));
        con.on("authenticationMD5Password", this._handleAuthMD5Password.bind(this));
        con.on("authenticationSASL", this._handleAuthSASL.bind(this));
        con.on("authenticationSASLContinue", this._handleAuthSASLContinue.bind(this));
        con.on("authenticationSASLFinal", this._handleAuthSASLFinal.bind(this));
        con.on("backendKeyData", this._handleBackendKeyData.bind(this));
        con.on("error", this._handleErrorEvent.bind(this));
        con.on("errorMessage", this._handleErrorMessage.bind(this));
        con.on("readyForQuery", this._handleReadyForQuery.bind(this));
        con.on("notice", this._handleNotice.bind(this));
        con.on("rowDescription", this._handleRowDescription.bind(this));
        con.on("dataRow", this._handleDataRow.bind(this));
        con.on("portalSuspended", this._handlePortalSuspended.bind(this));
        con.on("emptyQuery", this._handleEmptyQuery.bind(this));
        con.on("commandComplete", this._handleCommandComplete.bind(this));
        con.on("parseComplete", this._handleParseComplete.bind(this));
        con.on("copyInResponse", this._handleCopyInResponse.bind(this));
        con.on("copyData", this._handleCopyData.bind(this));
        con.on("notification", this._handleNotification.bind(this));
      }
      _getPassword(cb) {
        const con = this.connection;
        if (typeof this.password === "function") {
          this._Promise.resolve().then(() => this.password(this.connectionParameters)).then((pass) => {
            if (pass !== void 0) {
              if (typeof pass !== "string") {
                con.emit("error", new TypeError("Password must be a string"));
                return;
              }
              this.connectionParameters.password = this.password = pass;
            } else {
              this.connectionParameters.password = this.password = null;
            }
            cb();
          }).catch((err) => {
            con.emit("error", err);
          });
        } else if (this.password !== null) {
          cb();
        } else {
          try {
            const pgPass = require_lib();
            pgPass(this.connectionParameters, (pass) => {
              if (void 0 !== pass) {
                pgPassDeprecationNotice();
                this.connectionParameters.password = this.password = pass;
              }
              cb();
            });
          } catch (e) {
            this.emit("error", e);
          }
        }
      }
      _handleAuthCleartextPassword(msg) {
        this._getPassword(() => {
          this.connection.password(this.password);
        });
      }
      _handleAuthMD5Password(msg) {
        this._getPassword(async () => {
          try {
            const hashedPassword = await crypto2.postgresMd5PasswordHash(this.user, this.password, msg.salt);
            this.connection.password(hashedPassword);
          } catch (e) {
            this.emit("error", e);
          }
        });
      }
      _handleAuthSASL(msg) {
        this._getPassword(() => {
          try {
            this.saslSession = sasl.startSession(
              msg.mechanisms,
              this.enableChannelBinding && this.connection.stream,
              this.scramMaxIterations
            );
            this.connection.sendSASLInitialResponseMessage(this.saslSession.mechanism, this.saslSession.response);
          } catch (err) {
            this.connection.emit("error", err);
          }
        });
      }
      async _handleAuthSASLContinue(msg) {
        try {
          await sasl.continueSession(
            this.saslSession,
            this.password,
            msg.data,
            this.enableChannelBinding && this.connection.stream
          );
          this.connection.sendSCRAMClientFinalMessage(this.saslSession.response);
        } catch (err) {
          this.connection.emit("error", err);
        }
      }
      _handleAuthSASLFinal(msg) {
        try {
          sasl.finalizeSession(this.saslSession, msg.data);
          this.saslSession = null;
        } catch (err) {
          this.connection.emit("error", err);
        }
      }
      _handleBackendKeyData(msg) {
        this.processID = msg.processID;
        this.secretKey = msg.secretKey;
      }
      _handleReadyForQuery(msg) {
        if (this._connecting) {
          this._connecting = false;
          this._connected = true;
          clearTimeout(this.connectionTimeoutHandle);
          if (this._connectionCallback) {
            this._connectionCallback(null, this);
            this._connectionCallback = null;
          }
          this.emit("connect");
        }
        const activeQuery = this._getActiveQuery();
        this._activeQuery = null;
        this._txStatus = msg?.status ?? null;
        this.readyForQuery = true;
        if (activeQuery) {
          activeQuery.handleReadyForQuery(this.connection);
        }
        this._pulseQueryQueue();
      }
      // if we receive an error event or error message
      // during the connection process we handle it here
      _handleErrorWhileConnecting(err) {
        if (this._connectionError) {
          return;
        }
        this._connectionError = true;
        clearTimeout(this.connectionTimeoutHandle);
        if (this._connectionCallback) {
          return this._connectionCallback(err);
        }
        this.emit("error", err);
      }
      // if we're connected and we receive an error event from the connection
      // this means the socket is dead - do a hard abort of all queries and emit
      // the socket error on the client as well
      _handleErrorEvent(err) {
        if (this._connecting) {
          return this._handleErrorWhileConnecting(err);
        }
        this._queryable = false;
        this._errorAllQueries(err);
        this.emit("error", err);
      }
      // handle error messages from the postgres backend
      _handleErrorMessage(msg) {
        if (this._connecting) {
          return this._handleErrorWhileConnecting(msg);
        }
        const activeQuery = this._getActiveQuery();
        if (!activeQuery) {
          this._handleErrorEvent(msg);
          return;
        }
        this._activeQuery = null;
        if (activeQuery.name) {
          delete this.connection.submittedNamedStatements[activeQuery.name];
        }
        activeQuery.handleError(msg, this.connection);
      }
      _handleRowDescription(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error32 = new Error("Received unexpected rowDescription message from backend.");
          this._handleErrorEvent(error32);
          return;
        }
        activeQuery.handleRowDescription(msg);
      }
      _handleDataRow(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error32 = new Error("Received unexpected dataRow message from backend.");
          this._handleErrorEvent(error32);
          return;
        }
        activeQuery.handleDataRow(msg);
      }
      _handlePortalSuspended(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error32 = new Error("Received unexpected portalSuspended message from backend.");
          this._handleErrorEvent(error32);
          return;
        }
        activeQuery.handlePortalSuspended(this.connection);
      }
      _handleEmptyQuery(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error32 = new Error("Received unexpected emptyQuery message from backend.");
          this._handleErrorEvent(error32);
          return;
        }
        activeQuery.handleEmptyQuery(this.connection);
      }
      _handleCommandComplete(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error32 = new Error("Received unexpected commandComplete message from backend.");
          this._handleErrorEvent(error32);
          return;
        }
        activeQuery.handleCommandComplete(msg, this.connection);
      }
      _handleParseComplete() {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error32 = new Error("Received unexpected parseComplete message from backend.");
          this._handleErrorEvent(error32);
          return;
        }
        if (activeQuery.name) {
          this.connection.parsedStatements[activeQuery.name] = activeQuery.text;
          delete this.connection.submittedNamedStatements[activeQuery.name];
        }
      }
      _handleCopyInResponse(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error32 = new Error("Received unexpected copyInResponse message from backend.");
          this._handleErrorEvent(error32);
          return;
        }
        activeQuery.handleCopyInResponse(this.connection);
      }
      _handleCopyData(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error32 = new Error("Received unexpected copyData message from backend.");
          this._handleErrorEvent(error32);
          return;
        }
        activeQuery.handleCopyData(msg, this.connection);
      }
      _handleNotification(msg) {
        this.emit("notification", msg);
      }
      _handleNotice(msg) {
        this.emit("notice", msg);
      }
      getStartupConf() {
        const params = this.connectionParameters;
        const data = {
          user: params.user,
          database: params.database
        };
        const appName = params.application_name || params.fallback_application_name;
        if (appName) {
          data.application_name = appName;
        }
        if (params.replication) {
          data.replication = "" + params.replication;
        }
        if (params.statement_timeout) {
          data.statement_timeout = String(parseInt(params.statement_timeout, 10));
        }
        if (params.lock_timeout) {
          data.lock_timeout = String(parseInt(params.lock_timeout, 10));
        }
        if (params.idle_in_transaction_session_timeout) {
          data.idle_in_transaction_session_timeout = String(parseInt(params.idle_in_transaction_session_timeout, 10));
        }
        if (params.options) {
          data.options = params.options;
        }
        return data;
      }
      cancel(client, query) {
        if (client.activeQuery === query) {
          const con = this.connection;
          if (this.host && this.host.indexOf("/") === 0) {
            con.connect(this.host + "/.s.PGSQL." + this.port);
          } else {
            con.connect(this.port, this.host);
          }
          con.on("connect", function() {
            con.cancel(client.processID, client.secretKey);
          });
        } else if (client._queryQueue.indexOf(query) !== -1) {
          client._queryQueue.splice(client._queryQueue.indexOf(query), 1);
        } else if (client._sentQueryQueue.indexOf(query) !== -1) {
          query.callback = () => {
          };
        }
      }
      setTypeParser(oid, format, parseFn) {
        return this._types.setTypeParser(oid, format, parseFn);
      }
      getTypeParser(oid, format) {
        return this._types.getTypeParser(oid, format);
      }
      // escapeIdentifier and escapeLiteral moved to utility functions & exported
      // on PG
      // re-exported here for backwards compatibility
      escapeIdentifier(str) {
        return utils.escapeIdentifier(str);
      }
      escapeLiteral(str) {
        return utils.escapeLiteral(str);
      }
      _pulseQueryQueue() {
        if (this.pipeline) {
          this._pulsePipelinedQueryQueue();
          return;
        }
        if (this.readyForQuery === true) {
          this._activeQuery = this._queryQueue.shift();
          const activeQuery = this._getActiveQuery();
          if (activeQuery) {
            this.readyForQuery = false;
            this.hasExecuted = true;
            const queryError = activeQuery.submit(this.connection);
            if (queryError) {
              process.nextTick(() => {
                activeQuery.handleError(queryError, this.connection);
                this.readyForQuery = true;
                this._pulseQueryQueue();
              });
            }
          } else if (this.hasExecuted) {
            this._activeQuery = null;
            this.emit("drain");
          }
        }
      }
      _pulsePipelinedQueryQueue() {
        if (!this._connected || !this._queryable) {
          return;
        }
        while (this._queryQueue.length > 0) {
          const query = this._queryQueue.shift();
          this.hasExecuted = true;
          const queryError = query.submit(this.connection);
          if (queryError) {
            process.nextTick(() => {
              query.handleError(queryError, this.connection);
            });
            continue;
          }
          this._sentQueryQueue.push(query);
        }
        if (this.readyForQuery && !this._activeQuery && this._sentQueryQueue.length > 0) {
          this._activeQuery = this._sentQueryQueue.shift();
          this.readyForQuery = false;
        }
        if (!this._activeQuery && this._sentQueryQueue.length === 0 && this._queryQueue.length === 0 && this.hasExecuted) {
          this.emit("drain");
        }
      }
      query(config22, values, callback) {
        let query;
        let result;
        if (config22 == null) {
          throw new TypeError("Client was passed a null or undefined query");
        }
        if (typeof config22.submit === "function") {
          result = query = config22;
          if (!query.callback) {
            if (typeof values === "function") {
              query.callback = values;
            } else if (callback) {
              query.callback = callback;
            }
          }
        } else {
          query = new Query2(config22, values, callback);
          if (!query.callback) {
            result = new this._Promise((resolve, reject) => {
              query.callback = (err, res) => err ? reject(err) : resolve(res);
            }).catch((err) => {
              Error.captureStackTrace(err);
              throw err;
            });
          } else if (typeof query.callback !== "function") {
            throw new TypeError("callback is not a function");
          }
        }
        const readTimeout = config22.query_timeout || this.connectionParameters.query_timeout;
        if (readTimeout) {
          const queryCallback = query.callback || (() => {
          });
          const readTimeoutTimer = setTimeout(() => {
            const error32 = new Error("Query read timeout");
            process.nextTick(() => {
              query.handleError(error32, this.connection);
            });
            queryCallback(error32);
            query.callback = () => {
            };
            const index = this._queryQueue.indexOf(query);
            if (index > -1) {
              this._queryQueue.splice(index, 1);
            } else if (this.pipeline) {
              this.connection.stream.destroy();
              return;
            }
            this._pulseQueryQueue();
          }, readTimeout);
          query.callback = (err, res) => {
            clearTimeout(readTimeoutTimer);
            queryCallback(err, res);
          };
        }
        if (this.binary && !query.binary) {
          query.binary = true;
        }
        if (query._result && !query._result._types) {
          query._result._types = this._types;
        }
        if (this.pipeline) {
          const portalQuery = typeof config22.submit === "function" && !(query instanceof Query2) ? "Custom query classes such as pg-cursor and pg-query-stream are" : query.rows ? "The `rows` option is" : null;
          if (portalQuery) {
            process.nextTick(() => {
              query.handleError(new Error(`${portalQuery} not supported in pipeline mode`), this.connection);
            });
            return result;
          }
        }
        if (!this._queryable) {
          process.nextTick(() => {
            query.handleError(new Error("Client has encountered a connection error and is not queryable"), this.connection);
          });
          return result;
        }
        if (this._ending) {
          process.nextTick(() => {
            query.handleError(new Error("Client was closed and is not queryable"), this.connection);
          });
          return result;
        }
        if (this._queryQueue.length > 0 && !this.pipeline) {
          queryQueueLengthDeprecationNotice();
        }
        this._queryQueue.push(query);
        this._pulseQueryQueue();
        return result;
      }
      ref() {
        this.connection.ref();
      }
      unref() {
        this.connection.unref();
      }
      getTransactionStatus() {
        return this._txStatus;
      }
      end(cb) {
        this._ending = true;
        if (!this.connection._connecting || this._ended) {
          if (cb) {
            cb();
            return;
          } else {
            return this._Promise.resolve();
          }
        }
        if (!this._queryable) {
          this.connection.stream.destroy();
        } else if (this.pipeline && (this._getActiveQuery() || this._sentQueryQueue.length > 0 || this._queryQueue.length > 0)) {
          this.once("drain", () => this.connection.end());
        } else if (this._getActiveQuery()) {
          this.connection.stream.destroy();
        } else {
          this.connection.end();
        }
        if (cb) {
          this.connection.once("end", cb);
        } else {
          return new this._Promise((resolve) => {
            this.connection.once("end", resolve);
          });
        }
      }
      get queryQueue() {
        queryQueueDeprecationNotice();
        return this._queryQueue;
      }
    };
    Client2.Query = Query2;
    module.exports = Client2;
  }
});
var require_pg_pool = __commonJS({
  "../node_modules/pg-pool/index.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var EventEmitter22 = require_events().EventEmitter;
    var NOOP = /* @__PURE__ */ __name2(function() {
    }, "NOOP");
    var removeWhere = /* @__PURE__ */ __name2((list, predicate) => {
      const i = list.findIndex(predicate);
      return i === -1 ? void 0 : list.splice(i, 1)[0];
    }, "removeWhere");
    var IdleItem = class {
      static {
        __name(this, "IdleItem");
      }
      static {
        __name2(this, "IdleItem");
      }
      constructor(client, idleListener, timeoutId) {
        this.client = client;
        this.idleListener = idleListener;
        this.timeoutId = timeoutId;
      }
    };
    var PendingItem = class {
      static {
        __name(this, "PendingItem");
      }
      static {
        __name2(this, "PendingItem");
      }
      constructor(callback) {
        this.callback = callback;
      }
    };
    function throwOnDoubleRelease() {
      throw new Error("Release called on client which has already been released to the pool.");
    }
    __name(throwOnDoubleRelease, "throwOnDoubleRelease");
    __name2(throwOnDoubleRelease, "throwOnDoubleRelease");
    function promisify(Promise2, callback) {
      if (callback) {
        return { callback, result: void 0 };
      }
      let rej;
      let res;
      const cb = /* @__PURE__ */ __name2(function(err, client) {
        err ? rej(err) : res(client);
      }, "cb");
      const result = new Promise2(function(resolve, reject) {
        res = resolve;
        rej = reject;
      }).catch((err) => {
        Error.captureStackTrace(err);
        throw err;
      });
      return { callback: cb, result };
    }
    __name(promisify, "promisify");
    __name2(promisify, "promisify");
    function makeIdleListener(pool, client) {
      return /* @__PURE__ */ __name2(/* @__PURE__ */ __name(function idleListener(err) {
        err.client = client;
        client.removeListener("error", idleListener);
        client.on("error", () => {
          pool.log("additional client error after disconnection due to error", err);
        });
        pool._remove(client);
        pool.emit("error", err, client);
      }, "idleListener"), "idleListener");
    }
    __name(makeIdleListener, "makeIdleListener");
    __name2(makeIdleListener, "makeIdleListener");
    var Pool2 = class extends EventEmitter22 {
      static {
        __name(this, "Pool2");
      }
      static {
        __name2(this, "Pool");
      }
      constructor(options, Client2) {
        super();
        this.options = Object.assign({}, options);
        if (options != null && "password" in options) {
          Object.defineProperty(this.options, "password", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: options.password
          });
        }
        if (options != null && options.ssl && options.ssl.key) {
          Object.defineProperty(this.options.ssl, "key", {
            enumerable: false
          });
        }
        this.options.max = this.options.max || this.options.poolSize || 10;
        this.options.min = this.options.min || 0;
        this.options.maxUses = this.options.maxUses || Infinity;
        this.options.allowExitOnIdle = this.options.allowExitOnIdle || false;
        this.options.maxLifetimeSeconds = this.options.maxLifetimeSeconds || 0;
        this.log = this.options.log || function() {
        };
        this.Client = this.options.Client || Client2 || require_lib2().Client;
        this.Promise = this.options.Promise || global.Promise;
        if (typeof this.options.idleTimeoutMillis === "undefined") {
          this.options.idleTimeoutMillis = 1e4;
        }
        this._clients = [];
        this._idle = [];
        this._expired = /* @__PURE__ */ new WeakSet();
        this._pendingQueue = [];
        this._endCallback = void 0;
        this.ending = false;
        this.ended = false;
      }
      _promiseTry(f) {
        const Promise2 = this.Promise;
        if (typeof Promise2.try === "function") {
          return Promise2.try(f);
        }
        return new Promise2((resolve) => resolve(f()));
      }
      _isFull() {
        return this._clients.length >= this.options.max;
      }
      _isAboveMin() {
        return this._clients.length > this.options.min;
      }
      _pulseQueue() {
        this.log("pulse queue");
        if (this.ended) {
          this.log("pulse queue ended");
          return;
        }
        if (this.ending) {
          this.log("pulse queue on ending");
          if (this._idle.length) {
            this._idle.slice().map((item) => {
              this._remove(item.client);
            });
          }
          if (!this._clients.length) {
            this.ended = true;
            this._endCallback();
          }
          return;
        }
        if (!this._pendingQueue.length) {
          this.log("no queued requests");
          return;
        }
        if (!this._idle.length && this._isFull()) {
          return;
        }
        const pendingItem = this._pendingQueue.shift();
        if (this._idle.length) {
          const idleItem = this._idle.pop();
          clearTimeout(idleItem.timeoutId);
          const client = idleItem.client;
          client.ref && client.ref();
          const idleListener = idleItem.idleListener;
          return this._acquireClient(client, pendingItem, idleListener, false);
        }
        if (!this._isFull()) {
          return this.newClient(pendingItem);
        }
        throw new Error("unexpected condition");
      }
      _remove(client, callback) {
        const removed = removeWhere(this._idle, (item) => item.client === client);
        if (removed !== void 0) {
          clearTimeout(removed.timeoutId);
        }
        this._clients = this._clients.filter((c) => c !== client);
        const context22 = this;
        client.end(() => {
          context22.emit("remove", client);
          if (typeof callback === "function") {
            callback();
          }
        });
      }
      connect(cb) {
        if (this.ending) {
          const err = new Error("Cannot use a pool after calling end on the pool");
          return cb ? cb(err) : this.Promise.reject(err);
        }
        const response = promisify(this.Promise, cb);
        const result = response.result;
        if (this._isFull() || this._idle.length) {
          if (this._idle.length) {
            process.nextTick(() => this._pulseQueue());
          }
          if (!this.options.connectionTimeoutMillis) {
            this._pendingQueue.push(new PendingItem(response.callback));
            return result;
          }
          const queueCallback = /* @__PURE__ */ __name2((err, res, done) => {
            clearTimeout(tid);
            response.callback(err, res, done);
          }, "queueCallback");
          const pendingItem = new PendingItem(queueCallback);
          const tid = setTimeout(() => {
            removeWhere(this._pendingQueue, (i) => i.callback === queueCallback);
            pendingItem.timedOut = true;
            response.callback(new Error("timeout exceeded when trying to connect"));
          }, this.options.connectionTimeoutMillis);
          if (tid.unref) {
            tid.unref();
          }
          this._pendingQueue.push(pendingItem);
          return result;
        }
        this.newClient(new PendingItem(response.callback));
        return result;
      }
      newClient(pendingItem) {
        const client = new this.Client(this.options);
        this._clients.push(client);
        const idleListener = makeIdleListener(this, client);
        this.log("checking client timeout");
        let tid;
        let timeoutHit = false;
        if (this.options.connectionTimeoutMillis) {
          tid = setTimeout(() => {
            if (client.connection) {
              this.log("ending client due to timeout");
              timeoutHit = true;
              client.connection.stream.destroy();
            } else if (!client.isConnected()) {
              this.log("ending client due to timeout");
              timeoutHit = true;
              client.end();
            }
          }, this.options.connectionTimeoutMillis);
        }
        this.log("connecting new client");
        client.connect((err) => {
          if (tid) {
            clearTimeout(tid);
          }
          client.on("error", idleListener);
          if (err) {
            this.log("client failed to connect", err);
            this._clients = this._clients.filter((c) => c !== client);
            if (timeoutHit) {
              err = new Error("Connection terminated due to connection timeout", { cause: err });
            }
            this._pulseQueue();
            if (!pendingItem.timedOut) {
              pendingItem.callback(err, void 0, NOOP);
            }
          } else {
            this.log("new client connected");
            if (this.options.onConnect) {
              this._promiseTry(() => this.options.onConnect(client)).then(
                () => {
                  this._afterConnect(client, pendingItem, idleListener);
                },
                (hookErr) => {
                  this._clients = this._clients.filter((c) => c !== client);
                  client.end(() => {
                    this._pulseQueue();
                    if (!pendingItem.timedOut) {
                      pendingItem.callback(hookErr, void 0, NOOP);
                    }
                  });
                }
              );
              return;
            }
            return this._afterConnect(client, pendingItem, idleListener);
          }
        });
      }
      _afterConnect(client, pendingItem, idleListener) {
        if (this.options.maxLifetimeSeconds !== 0) {
          const maxLifetimeTimeout = setTimeout(() => {
            this.log("ending client due to expired lifetime");
            this._expired.add(client);
            const idleIndex = this._idle.findIndex((idleItem) => idleItem.client === client);
            if (idleIndex !== -1) {
              this._acquireClient(
                client,
                new PendingItem((err, client2, clientRelease) => clientRelease()),
                idleListener,
                false
              );
            }
          }, this.options.maxLifetimeSeconds * 1e3);
          maxLifetimeTimeout.unref();
          client.once("end", () => clearTimeout(maxLifetimeTimeout));
        }
        return this._acquireClient(client, pendingItem, idleListener, true);
      }
      // acquire a client for a pending work item
      _acquireClient(client, pendingItem, idleListener, isNew) {
        if (isNew) {
          this.emit("connect", client);
        }
        this.emit("acquire", client);
        client.release = this._releaseOnce(client, idleListener);
        client.removeListener("error", idleListener);
        if (!pendingItem.timedOut) {
          if (isNew && this.options.verify) {
            this.options.verify(client, (err) => {
              if (err) {
                client.release(err);
                return pendingItem.callback(err, void 0, NOOP);
              }
              pendingItem.callback(void 0, client, client.release);
            });
          } else {
            pendingItem.callback(void 0, client, client.release);
          }
        } else {
          if (isNew && this.options.verify) {
            this.options.verify(client, client.release);
          } else {
            client.release();
          }
        }
      }
      // returns a function that wraps _release and throws if called more than once
      _releaseOnce(client, idleListener) {
        let released = false;
        return (err) => {
          if (released) {
            throwOnDoubleRelease();
          }
          released = true;
          this._release(client, idleListener, err);
        };
      }
      // release a client back to the poll, include an error
      // to remove it from the pool
      _release(client, idleListener, err) {
        client.on("error", idleListener);
        client._poolUseCount = (client._poolUseCount || 0) + 1;
        this.emit("release", err, client);
        if (err || this.ending || !client._queryable || client._ending || client._poolUseCount >= this.options.maxUses) {
          if (client._poolUseCount >= this.options.maxUses) {
            this.log("remove expended client");
          }
          return this._remove(client, this._pulseQueue.bind(this));
        }
        const isExpired = this._expired.has(client);
        if (isExpired) {
          this.log("remove expired client");
          this._expired.delete(client);
          return this._remove(client, this._pulseQueue.bind(this));
        }
        let tid;
        if (this.options.idleTimeoutMillis && this._isAboveMin()) {
          tid = setTimeout(() => {
            if (this._isAboveMin()) {
              this.log("remove idle client");
              this._remove(client, this._pulseQueue.bind(this));
            }
          }, this.options.idleTimeoutMillis);
          if (this.options.allowExitOnIdle) {
            tid.unref();
          }
        }
        if (this.options.allowExitOnIdle) {
          client.unref();
        }
        this._idle.push(new IdleItem(client, idleListener, tid));
        this._pulseQueue();
      }
      query(text, values, cb) {
        if (typeof text === "function") {
          const response2 = promisify(this.Promise, text);
          setImmediate(function() {
            return response2.callback(new Error("Passing a function as the first parameter to pool.query is not supported"));
          });
          return response2.result;
        }
        if (typeof values === "function") {
          cb = values;
          values = void 0;
        }
        const response = promisify(this.Promise, cb);
        cb = response.callback;
        this.connect((err, client) => {
          if (err) {
            return cb(err);
          }
          let clientReleased = false;
          const onError = /* @__PURE__ */ __name2((err2) => {
            if (clientReleased) {
              return;
            }
            clientReleased = true;
            client.release(err2);
            cb(err2);
          }, "onError");
          client.once("error", onError);
          this.log("dispatching query");
          try {
            client.query(text, values, (err2, res) => {
              this.log("query dispatched");
              client.removeListener("error", onError);
              if (clientReleased) {
                return;
              }
              clientReleased = true;
              client.release(err2);
              if (err2) {
                return cb(err2);
              }
              return cb(void 0, res);
            });
          } catch (err2) {
            client.release(err2);
            return cb(err2);
          }
        });
        return response.result;
      }
      end(cb) {
        this.log("ending");
        if (this.ending) {
          const err = new Error("Called end on pool more than once");
          return cb ? cb(err) : this.Promise.reject(err);
        }
        this.ending = true;
        const promised = promisify(this.Promise, cb);
        this._endCallback = promised.callback;
        this._pulseQueue();
        return promised.result;
      }
      get waitingCount() {
        return this._pendingQueue.length;
      }
      get idleCount() {
        return this._idle.length;
      }
      get expiredCount() {
        return this._clients.reduce((acc, client) => acc + (this._expired.has(client) ? 1 : 0), 0);
      }
      get totalCount() {
        return this._clients.length;
      }
    };
    module.exports = Pool2;
  }
});
var require_query2 = __commonJS({
  "../node_modules/pg/lib/native/query.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var EventEmitter22 = require_events().EventEmitter;
    var util = require_util();
    var utils = require_utils();
    var NativeQuery = module.exports = function(config22, values, callback) {
      EventEmitter22.call(this);
      config22 = utils.normalizeQueryConfig(config22, values, callback);
      this.text = config22.text;
      this.values = config22.values;
      this.name = config22.name;
      this.queryMode = config22.queryMode;
      this.callback = config22.callback;
      this.state = "new";
      this._arrayMode = config22.rowMode === "array";
      this._emitRowEvents = false;
      this.on(
        "newListener",
        function(event) {
          if (event === "row") this._emitRowEvents = true;
        }.bind(this)
      );
    };
    util.inherits(NativeQuery, EventEmitter22);
    var errorFieldMap = {
      sqlState: "code",
      statementPosition: "position",
      messagePrimary: "message",
      messageDetail: "detail",
      messageHint: "hint",
      context: "where",
      schemaName: "schema",
      tableName: "table",
      columnName: "column",
      dataTypeName: "dataType",
      constraintName: "constraint",
      sourceFile: "file",
      sourceLine: "line",
      sourceFunction: "routine"
    };
    NativeQuery.prototype.handleError = function(err) {
      const fields = this.native && this.native.pq.resultErrorFields();
      if (fields) {
        for (const key in fields) {
          const normalizedFieldName = errorFieldMap[key] || key;
          err[normalizedFieldName] = fields[key];
        }
      }
      if (this.callback) {
        this.callback(err);
      } else {
        this.emit("error", err);
      }
      this.state = "error";
    };
    NativeQuery.prototype.then = function(onSuccess, onFailure) {
      return this._getPromise().then(onSuccess, onFailure);
    };
    NativeQuery.prototype.catch = function(callback) {
      return this._getPromise().catch(callback);
    };
    NativeQuery.prototype._getPromise = function() {
      if (this._promise) return this._promise;
      this._promise = new Promise(
        function(resolve, reject) {
          this._once("end", resolve);
          this._once("error", reject);
        }.bind(this)
      );
      return this._promise;
    };
    NativeQuery.prototype.submit = function(client) {
      this.state = "running";
      const self = this;
      this.native = client.native;
      client.native.arrayMode = this._arrayMode;
      let after = /* @__PURE__ */ __name2(function(err, rows, results) {
        client.native.arrayMode = false;
        setImmediate(function() {
          self.emit("_done");
        });
        if (err) {
          return self.handleError(err);
        }
        if (self._emitRowEvents) {
          if (results.length > 1) {
            rows.forEach((rowOfRows, i) => {
              rowOfRows.forEach((row) => {
                self.emit("row", row, results[i]);
              });
            });
          } else {
            rows.forEach(function(row) {
              self.emit("row", row, results);
            });
          }
        }
        self.state = "end";
        self.emit("end", results);
        if (self.callback) {
          self.callback(null, results);
        }
      }, "after");
      if (process.domain) {
        after = process.domain.bind(after);
      }
      if (this.name) {
        if (this.name.length > 63) {
          console.error("Warning! Postgres only supports 63 characters for query names.");
          console.error("You supplied %s (%s)", this.name, this.name.length);
          console.error("This can cause conflicts and silent errors executing queries");
        }
        const values = (this.values || []).map(utils.prepareValue);
        if (client.namedQueries[this.name] !== void 0) {
          if (this.text && client.namedQueries[this.name] !== this.text) {
            const err = new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`);
            return after(err);
          }
          return client.native.execute(this.name, values, after);
        }
        return client.native.prepare(this.name, this.text, values.length, function(err) {
          if (err) return after(err);
          client.namedQueries[self.name] = self.text;
          return self.native.execute(self.name, values, after);
        });
      } else if (this.values) {
        if (!Array.isArray(this.values)) {
          const err = new Error("Query values must be an array");
          return after(err);
        }
        const vals = this.values.map(utils.prepareValue);
        client.native.query(this.text, vals, after);
      } else if (this.queryMode === "extended") {
        client.native.query(this.text, [], after);
      } else {
        client.native.query(this.text, after);
      }
    };
  }
});
var require_client2 = __commonJS({
  "../node_modules/pg/lib/native/client.js"(exports, module) {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var nodeUtils = require_util();
    var Native;
    try {
      Native = __require2("pg-native");
    } catch (e) {
      throw e;
    }
    var TypeOverrides2 = require_type_overrides();
    var EventEmitter22 = require_events().EventEmitter;
    var util = require_util();
    var ConnectionParameters = require_connection_parameters();
    var NativeQuery = require_query2();
    var queryQueueLengthDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead."
    );
    var Client2 = module.exports = function(config22) {
      EventEmitter22.call(this);
      config22 = config22 || {};
      this._Promise = config22.Promise || global.Promise;
      this._types = new TypeOverrides2(config22.types);
      this.native = new Native({
        types: this._types
      });
      this._queryQueue = [];
      this._ending = false;
      this._connecting = false;
      this._connected = false;
      this._queryable = true;
      this.pipeline = Boolean(config22.pipeline);
      this._pipelineInFlight = false;
      const cp3 = this.connectionParameters = new ConnectionParameters(config22);
      if (config22.nativeConnectionString) cp3.nativeConnectionString = config22.nativeConnectionString;
      this.user = cp3.user;
      Object.defineProperty(this, "password", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: cp3.password
      });
      this.database = cp3.database;
      this.host = cp3.host;
      this.port = cp3.port;
      this.namedQueries = {};
    };
    Client2.Query = NativeQuery;
    util.inherits(Client2, EventEmitter22);
    Client2.prototype._errorAllQueries = function(err) {
      const enqueueError = /* @__PURE__ */ __name2((query) => {
        process.nextTick(() => {
          query.native = this.native;
          query.handleError(err);
        });
      }, "enqueueError");
      if (this._hasActiveQuery()) {
        enqueueError(this._activeQuery);
        this._activeQuery = null;
      }
      this._queryQueue.forEach(enqueueError);
      this._queryQueue.length = 0;
    };
    Client2.prototype._connect = function(cb) {
      const self = this;
      if (this._connecting) {
        process.nextTick(() => cb(new Error("Client has already been connected. You cannot reuse a client.")));
        return;
      }
      this._connecting = true;
      this.connectionParameters.getLibpqConnectionString(function(err, conString) {
        if (self.connectionParameters.nativeConnectionString) conString = self.connectionParameters.nativeConnectionString;
        if (err) return cb(err);
        self.native.connect(conString, function(err2) {
          if (err2) {
            self.native.end();
            return cb(err2);
          }
          self._connected = true;
          self.native.on("error", function(err3) {
            self._queryable = false;
            self._errorAllQueries(err3);
            self.emit("error", err3);
          });
          self.native.on("notification", function(msg) {
            self.emit("notification", {
              channel: msg.relname,
              payload: msg.extra
            });
          });
          self.emit("connect");
          self._pulseQueryQueue(true);
          cb(null, this);
        });
      });
    };
    Client2.prototype.connect = function(callback) {
      if (callback) {
        this._connect(callback);
        return;
      }
      return new this._Promise((resolve, reject) => {
        this._connect((error32) => {
          if (error32) {
            reject(error32);
          } else {
            resolve(this);
          }
        });
      });
    };
    Client2.prototype.query = function(config22, values, callback) {
      let query;
      let result;
      let readTimeout;
      let readTimeoutTimer;
      let queryCallback;
      if (config22 === null || config22 === void 0) {
        throw new TypeError("Client was passed a null or undefined query");
      } else if (typeof config22.submit === "function") {
        readTimeout = config22.query_timeout || this.connectionParameters.query_timeout;
        result = query = config22;
        if (typeof values === "function") {
          config22.callback = values;
        }
      } else {
        readTimeout = config22.query_timeout || this.connectionParameters.query_timeout;
        query = new NativeQuery(config22, values, callback);
        if (!query.callback) {
          let resolveOut, rejectOut;
          result = new this._Promise((resolve, reject) => {
            resolveOut = resolve;
            rejectOut = reject;
          }).catch((err) => {
            Error.captureStackTrace(err);
            throw err;
          });
          query.callback = (err, res) => err ? rejectOut(err) : resolveOut(res);
        }
      }
      if (readTimeout) {
        queryCallback = query.callback || (() => {
        });
        readTimeoutTimer = setTimeout(() => {
          const error32 = new Error("Query read timeout");
          process.nextTick(() => {
            query.handleError(error32, this.connection);
          });
          queryCallback(error32);
          query.callback = () => {
          };
          const index = this._queryQueue.indexOf(query);
          if (index > -1) {
            this._queryQueue.splice(index, 1);
          }
          this._pulseQueryQueue();
        }, readTimeout);
        query.callback = (err, res) => {
          clearTimeout(readTimeoutTimer);
          queryCallback(err, res);
        };
      }
      if (!this._queryable) {
        query.native = this.native;
        process.nextTick(() => {
          query.handleError(new Error("Client has encountered a connection error and is not queryable"));
        });
        return result;
      }
      if (this._ending) {
        query.native = this.native;
        process.nextTick(() => {
          query.handleError(new Error("Client was closed and is not queryable"));
        });
        return result;
      }
      if (this._queryQueue.length > 0 && !this.pipeline) {
        queryQueueLengthDeprecationNotice();
      }
      this._queryQueue.push(query);
      this._pulseQueryQueue();
      return result;
    };
    Client2.prototype.end = function(cb) {
      const self = this;
      this._ending = true;
      if (this._connecting && !this._connected) {
        this.once("connect", () => {
          this.end(() => {
          });
        });
      }
      let result;
      if (!cb) {
        result = new this._Promise(function(resolve, reject) {
          cb = /* @__PURE__ */ __name2((err) => err ? reject(err) : resolve(), "cb");
        });
      }
      const doEnd = /* @__PURE__ */ __name2(function() {
        self.native.end(function() {
          self._connected = false;
          self._errorAllQueries(new Error("Connection terminated"));
          process.nextTick(() => {
            self.emit("end");
            if (cb) cb();
          });
        });
      }, "doEnd");
      if (this.pipeline && (this._pipelineInFlight || this._queryQueue.length > 0)) {
        this.once("drain", doEnd);
      } else {
        doEnd();
      }
      return result;
    };
    Client2.prototype._hasActiveQuery = function() {
      return this._activeQuery && this._activeQuery.state !== "error" && this._activeQuery.state !== "end";
    };
    Client2.prototype._pulseQueryQueue = function(initialConnection) {
      if (!this._connected) {
        return;
      }
      if (this.pipeline && !initialConnection) {
        return this._pulsePipelinedQueryQueue();
      }
      if (this._hasActiveQuery()) {
        return;
      }
      const query = this._queryQueue.shift();
      if (!query) {
        if (!initialConnection) {
          this.emit("drain");
        }
        return;
      }
      this._activeQuery = query;
      query.submit(this);
      const self = this;
      query.once("_done", function() {
        self._pulseQueryQueue();
      });
    };
    Client2.prototype._pulsePipelinedQueryQueue = function() {
      if (!this._connected || this._pipelineInFlight) {
        return;
      }
      if (this._queryQueue.length === 0) {
        if (this.hasExecuted) {
          this.emit("drain");
        }
        return;
      }
      this._pipelineInFlight = true;
      const self = this;
      const queries = [];
      const nativeQueries = [];
      const utils = require_utils();
      while (this._queryQueue.length > 0) {
        const query = this._queryQueue.shift();
        this.hasExecuted = true;
        nativeQueries.push(query);
        const values = query.values ? query.values.map(utils.prepareValue) : null;
        const pipelineEntry = { text: query.text, name: query.name, arrayMode: query._arrayMode };
        if (values) {
          pipelineEntry.values = values;
        }
        if (query.name && this.namedQueries[query.name]) {
          pipelineEntry._alreadyPrepared = true;
        }
        queries.push(pipelineEntry);
      }
      this.native.pipeline(queries, function(err, results) {
        self._pipelineInFlight = false;
        if (err) {
          self._connected = false;
          self._queryable = false;
          for (let i = 0; i < nativeQueries.length; i++) {
            const q = nativeQueries[i];
            q.native = self.native;
            q.handleError(err);
          }
          self._errorAllQueries(err);
          self.emit("error", err);
          self.emit("end");
          return;
        }
        for (let i = 0; i < nativeQueries.length; i++) {
          const q = nativeQueries[i];
          const r = results[i];
          q.native = self.native;
          if (r.err) {
            q.handleError(r.err);
          } else {
            if (q.name) {
              self.namedQueries[q.name] = q.text;
            }
            q.state = "end";
            q.emit("end", r.result);
            if (q.callback) {
              q.callback(null, r.result);
            }
          }
          setImmediate(function() {
            q.emit("_done");
          });
        }
        self._pulsePipelinedQueryQueue();
      });
    };
    Client2.prototype.cancel = function(query) {
      if (this._activeQuery === query) {
        this.native.cancel(function() {
        });
      } else if (this._queryQueue.indexOf(query) !== -1) {
        this._queryQueue.splice(this._queryQueue.indexOf(query), 1);
      }
    };
    Client2.prototype.ref = function() {
    };
    Client2.prototype.unref = function() {
    };
    Client2.prototype.setTypeParser = function(oid, format, parseFn) {
      return this._types.setTypeParser(oid, format, parseFn);
    };
    Client2.prototype.getTypeParser = function(oid, format) {
      return this._types.getTypeParser(oid, format);
    };
    Client2.prototype.isConnected = function() {
      return this._connected;
    };
    Client2.prototype.getTransactionStatus = function() {
      return this.native.getTransactionStatus();
    };
  }
});
var require_native = __commonJS({
  "../node_modules/pg/lib/native/index.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    module.exports = require_client2();
  }
});
var require_lib2 = __commonJS({
  "../node_modules/pg/lib/index.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var Client2 = require_client();
    var defaults2 = require_defaults();
    var Connection2 = require_connection();
    var Result2 = require_result();
    var utils = require_utils();
    var Pool2 = require_pg_pool();
    var TypeOverrides2 = require_type_overrides();
    var { DatabaseError: DatabaseError2 } = require_dist();
    var { escapeIdentifier: escapeIdentifier2, escapeLiteral: escapeLiteral2 } = require_utils();
    var poolFactory = /* @__PURE__ */ __name2((Client3) => {
      return class BoundPool extends Pool2 {
        static {
          __name(this, "BoundPool");
        }
        static {
          __name2(this, "BoundPool");
        }
        constructor(options) {
          super(options, Client3);
        }
      };
    }, "poolFactory");
    var PG = /* @__PURE__ */ __name2(function(clientConstructor2) {
      this.defaults = defaults2;
      this.Client = clientConstructor2;
      this.Query = this.Client.Query;
      this.Pool = poolFactory(this.Client);
      this._pools = [];
      this.Connection = Connection2;
      this.types = require_pg_types();
      this.DatabaseError = DatabaseError2;
      this.TypeOverrides = TypeOverrides2;
      this.escapeIdentifier = escapeIdentifier2;
      this.escapeLiteral = escapeLiteral2;
      this.Result = Result2;
      this.utils = utils;
    }, "PG");
    var clientConstructor = Client2;
    var forceNative = false;
    try {
      forceNative = !!process.env.NODE_PG_FORCE_NATIVE;
    } catch {
    }
    if (forceNative) {
      clientConstructor = require_native();
    }
    module.exports = new PG(clientConstructor);
    Object.defineProperty(module.exports, "native", {
      configurable: true,
      enumerable: false,
      get() {
        let native = null;
        try {
          native = new PG(require_native());
        } catch (err) {
          if (err.code !== "MODULE_NOT_FOUND") {
            throw err;
          }
        }
        Object.defineProperty(module.exports, "native", {
          value: native
        });
        return native;
      }
    });
  }
});
var esm_exports = {};
__export(esm_exports, {
  Client: /* @__PURE__ */ __name(() => Client, "Client"),
  Connection: /* @__PURE__ */ __name(() => Connection, "Connection"),
  DatabaseError: /* @__PURE__ */ __name(() => DatabaseError, "DatabaseError"),
  Pool: /* @__PURE__ */ __name(() => Pool, "Pool"),
  Query: /* @__PURE__ */ __name(() => Query, "Query"),
  Result: /* @__PURE__ */ __name(() => Result, "Result"),
  TypeOverrides: /* @__PURE__ */ __name(() => TypeOverrides, "TypeOverrides"),
  default: /* @__PURE__ */ __name(() => esm_default, "default"),
  defaults: /* @__PURE__ */ __name(() => defaults, "defaults"),
  escapeIdentifier: /* @__PURE__ */ __name(() => escapeIdentifier, "escapeIdentifier"),
  escapeLiteral: /* @__PURE__ */ __name(() => escapeLiteral, "escapeLiteral"),
  types: /* @__PURE__ */ __name(() => types, "types")
});
var import_lib;
var Client;
var Pool;
var Connection;
var types;
var Query;
var DatabaseError;
var escapeIdentifier;
var escapeLiteral;
var Result;
var TypeOverrides;
var defaults;
var esm_default;
var init_esm = __esm({
  "../node_modules/pg/esm/index.mjs"() {
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    import_lib = __toESM(require_lib2(), 1);
    Client = import_lib.default.Client;
    Pool = import_lib.default.Pool;
    Connection = import_lib.default.Connection;
    types = import_lib.default.types;
    Query = import_lib.default.Query;
    DatabaseError = import_lib.default.DatabaseError;
    escapeIdentifier = import_lib.default.escapeIdentifier;
    escapeLiteral = import_lib.default.escapeLiteral;
    Result = import_lib.default.Result;
    TypeOverrides = import_lib.default.TypeOverrides;
    defaults = import_lib.default.defaults;
    esm_default = import_lib.default;
  }
});
async function onRequestPost9({ request, env: env22 }) {
  try {
    const returnReq = await request.json();
    if (env22.DB) {
      await env22.DB.prepare(`
        CREATE TABLE IF NOT EXISTS returns (
          id TEXT PRIMARY KEY,
          intent TEXT,
          name TEXT,
          company TEXT,
          email TEXT,
          phone TEXT,
          products TEXT,
          attachedFiles TEXT,
          emailDeliveryStatus TEXT,
          date TEXT,
          status TEXT
        )
      `).run();
      await env22.DB.prepare(
        "INSERT INTO returns (id, intent, name, company, email, phone, products, attachedFiles, emailDeliveryStatus, date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        returnReq.id,
        returnReq.intent,
        returnReq.name,
        returnReq.company,
        returnReq.email,
        returnReq.phone,
        JSON.stringify(returnReq.products || []),
        JSON.stringify(returnReq.attachedFiles || []),
        returnReq.emailDeliveryStatus || "",
        returnReq.date,
        returnReq.status
      ).run();
    } else if (env22.DATABASE_URL) {
      const { Client: Client2 } = await Promise.resolve().then(() => (init_esm(), esm_exports));
      const client = new Client2({ connectionString: env22.DATABASE_URL });
      await client.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS returns (
          id VARCHAR(255) PRIMARY KEY,
          intent VARCHAR(50),
          name VARCHAR(255),
          company VARCHAR(255),
          email VARCHAR(255),
          phone VARCHAR(50),
          products TEXT,
          attachedFiles TEXT,
          emailDeliveryStatus VARCHAR(50),
          date VARCHAR(100),
          status VARCHAR(50)
        )
      `);
      await client.query(
        "INSERT INTO returns (id, intent, name, company, email, phone, products, attachedFiles, emailDeliveryStatus, date, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        [
          returnReq.id,
          returnReq.intent,
          returnReq.name,
          returnReq.company,
          returnReq.email,
          returnReq.phone,
          JSON.stringify(returnReq.products || []),
          JSON.stringify(returnReq.attachedFiles || []),
          returnReq.emailDeliveryStatus || "",
          returnReq.date,
          returnReq.status
        ]
      );
      await client.end();
    }
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
__name(onRequestPost9, "onRequestPost9");
async function onRequestGet4({ env: env22 }) {
  try {
    if (env22.DB) {
      await env22.DB.prepare(`
        CREATE TABLE IF NOT EXISTS returns (
          id TEXT PRIMARY KEY,
          intent TEXT,
          name TEXT,
          company TEXT,
          email TEXT,
          phone TEXT,
          products TEXT,
          attachedFiles TEXT,
          emailDeliveryStatus TEXT,
          date TEXT,
          status TEXT
        )
      `).run();
      const { results } = await env22.DB.prepare("SELECT * FROM returns ORDER BY date DESC").all();
      const returns = results.map((row) => ({
        id: row.id,
        intent: row.intent,
        name: row.name,
        company: row.company,
        email: row.email,
        phone: row.phone,
        products: JSON.parse(row.products || "[]"),
        attachedFiles: JSON.parse(row.attachedFiles || "[]"),
        emailDeliveryStatus: row.emailDeliveryStatus || void 0,
        date: row.date,
        status: row.status
      }));
      return new Response(JSON.stringify({ success: true, returns }), { headers: { "Content-Type": "application/json" } });
    } else if (env22.DATABASE_URL) {
      const { Client: Client2 } = await Promise.resolve().then(() => (init_esm(), esm_exports));
      const client = new Client2({ connectionString: env22.DATABASE_URL });
      await client.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS returns (
          id VARCHAR(255) PRIMARY KEY,
          intent VARCHAR(50),
          name VARCHAR(255),
          company VARCHAR(255),
          email VARCHAR(255),
          phone VARCHAR(50),
          products TEXT,
          attachedFiles TEXT,
          emailDeliveryStatus VARCHAR(50),
          date VARCHAR(100),
          status VARCHAR(50)
        )
      `);
      const { rows } = await client.query("SELECT * FROM returns ORDER BY date DESC");
      await client.end();
      const returns = rows.map((row) => ({
        id: row.id,
        intent: row.intent,
        name: row.name,
        company: row.company,
        email: row.email,
        phone: row.phone,
        products: JSON.parse(row.products || "[]"),
        attachedFiles: JSON.parse(row.attachedFiles || "[]"),
        emailDeliveryStatus: row.emaildeliverystatus || row.emailDeliveryStatus || void 0,
        date: row.date,
        status: row.status
      }));
      return new Response(JSON.stringify({ success: true, returns }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: true, returns: [] }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
__name(onRequestGet4, "onRequestGet4");
async function onRequestPut({ request, env: env22 }) {
  try {
    const update = await request.json();
    if (!update.id) throw new Error("ID required");
    if (env22.DB) {
      if (update.action === "status") {
        await env22.DB.prepare("UPDATE returns SET status = ? WHERE id = ?").bind(update.status, update.id).run();
      } else if (update.action === "emailDelivery") {
        await env22.DB.prepare("UPDATE returns SET emailDeliveryStatus = ? WHERE id = ?").bind(update.emailDeliveryStatus, update.id).run();
      } else if (update.action === "price") {
        const { results } = await env22.DB.prepare("SELECT products FROM returns WHERE id = ?").bind(update.id).all();
        if (results.length > 0) {
          const products = JSON.parse(results[0].products || "[]");
          const updatedProducts = products.map((p) => p.id === update.productId ? { ...p, price: update.price } : p);
          await env22.DB.prepare("UPDATE returns SET products = ? WHERE id = ?").bind(JSON.stringify(updatedProducts), update.id).run();
        }
      }
    } else if (env22.DATABASE_URL) {
      const { Client: Client2 } = await Promise.resolve().then(() => (init_esm(), esm_exports));
      const client = new Client2({ connectionString: env22.DATABASE_URL });
      await client.connect();
      if (update.action === "status") {
        await client.query("UPDATE returns SET status = $1 WHERE id = $2", [update.status, update.id]);
      } else if (update.action === "emailDelivery") {
        await client.query("UPDATE returns SET emailDeliveryStatus = $1 WHERE id = $2", [update.emailDeliveryStatus, update.id]);
      } else if (update.action === "price") {
        const { rows } = await client.query("SELECT products FROM returns WHERE id = $1", [update.id]);
        if (rows.length > 0) {
          const products = JSON.parse(rows[0].products || "[]");
          const updatedProducts = products.map((p) => p.id === update.productId ? { ...p, price: update.price } : p);
          await client.query("UPDATE returns SET products = $1 WHERE id = $2", [JSON.stringify(updatedProducts), update.id]);
        }
      }
      await client.end();
    }
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
__name(onRequestPut, "onRequestPut");
async function onRequestDelete2({ request, env: env22 }) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) throw new Error("ID required");
    if (env22.DB) {
      await env22.DB.prepare("DELETE FROM returns WHERE id = ?").bind(id).run();
    } else if (env22.DATABASE_URL) {
      const { Client: Client2 } = await Promise.resolve().then(() => (init_esm(), esm_exports));
      const client = new Client2({ connectionString: env22.DATABASE_URL });
      await client.connect();
      await client.query("DELETE FROM returns WHERE id = $1", [id]);
      await client.end();
    }
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
__name(onRequestDelete2, "onRequestDelete2");
var init_returns = __esm({
  "api/returns.js"() {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name2(onRequestPost9, "onRequestPost");
    __name2(onRequestGet4, "onRequestGet");
    __name2(onRequestPut, "onRequestPut");
    __name2(onRequestDelete2, "onRequestDelete");
  }
});
function json7(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json7, "json7");
function hexOf(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hexOf, "hexOf");
function validateMagicBytes2(headerArray, extension) {
  if (["csv", "json"].includes(extension)) return true;
  if (headerArray.length < 12) return false;
  const hex = hexOf(headerArray);
  if (hex.startsWith("89504e47")) return true;
  if (hex.startsWith("ffd8ff")) return true;
  if (hex.startsWith("52494646") && hex.substring(16, 24) === "57454250") return true;
  if (hex.startsWith("47494638")) return true;
  if (hex.startsWith("49492a00") || hex.startsWith("4d4d002a")) return true;
  if (hex.substring(8, 24) === "6674797068656963" || hex.substring(8, 24) === "6674797068656978") return true;
  const ftyp = hex.substring(8, 16);
  if (ftyp === "66747970") {
    const brand = hex.substring(16, 24);
    const validBrands = ["69736f6d", "6d703431", "6d703432", "71742020", "6d646174"];
    if (validBrands.includes(brand)) return true;
  }
  if (hex.startsWith("1a45dfa3")) return true;
  if (hex.startsWith("52494646") && hex.substring(16, 24) === "41564920") return true;
  if (hex.startsWith("464c5601")) return true;
  return false;
}
__name(validateMagicBytes2, "validateMagicBytes2");
function scanMalware(headBytes, fileName) {
  try {
    const hex = hexOf(headBytes.slice(0, Math.min(headBytes.length, SCAN_WINDOW_BYTES)));
    if (hex.startsWith("4d5a")) return { infected: true, signature: "EXECUTABLE_MZ" };
    if (hex.startsWith("7f454c46")) return { infected: true, signature: "EXECUTABLE_ELF" };
    if (hex.startsWith("feedface") || hex.startsWith("cefaedfe") || hex.startsWith("feedfacf") || hex.startsWith("cffaedfe") || hex.startsWith("cafebabe") || hex.startsWith("cafebabf")) return { infected: true, signature: "EXECUTABLE_MACHO" };
    if (hex.startsWith("2321")) return { infected: true, signature: "SCRIPT_SHEBANG" };
    let ascii = "";
    const view = headBytes.slice(0, Math.min(headBytes.length, SCAN_WINDOW_BYTES));
    for (let i = 0; i < view.length; i++) {
      const c = view[i];
      ascii += c >= 32 && c < 127 ? String.fromCharCode(c) : " ";
    }
    if (ascii.includes(EICAR)) return { infected: true, signature: "EICAR_TEST_FILE" };
    const lower = String(fileName || "").toLowerCase();
    if (/\.(exe|dll|bat|cmd|ps1|sh|com|scr|msi|jar|py|js|vbs)(\.|$)/.test(lower.replace(/\.(png|jpe?g|webp|gif|tiff?|heic|heif|mp4|mov|webm|mkv|avi|flv|csv|json)$/, ""))) {
      return { infected: true, signature: "DOUBLE_EXTENSION_MASQUERADE" };
    }
    return { infected: false, signature: null };
  } catch {
    return { infected: false, signature: null };
  }
}
__name(scanMalware, "scanMalware");
function audit(event, fields) {
  try {
    console.log(JSON.stringify({
      siem: "netamps-audit-v1",
      event,
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      actor_ip: fields.ip || "unknown",
      session_id: fields.sessionId || null,
      file_name: fields.fileName || null,
      file_size: typeof fields.size === "number" ? fields.size : null,
      sha256: fields.sha256 || null,
      scan_signature: fields.signature || null,
      verdict: fields.verdict || null,
      bucket: fields.bucket || null,
      object_key: fields.key || null
    }));
  } catch {
  }
}
__name(audit, "audit");
async function auditToD1(env22, entry) {
  try {
    if (!env22.DB || typeof env22.DB.prepare !== "function") return;
    const id = crypto.randomUUID();
    await env22.DB.prepare(
      `INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    ).bind(
      id,
      (/* @__PURE__ */ new Date()).toISOString(),
      entry.event,
      "Returns Upload",
      JSON.stringify({ session: entry.sessionId, file: entry.fileName, size: entry.size, sha256: entry.sha256, verdict: entry.verdict, signature: entry.signature, key: entry.key }),
      entry.ownerEmail || "anonymous",
      entry.ip || "unknown"
    ).run();
  } catch {
  }
}
__name(auditToD1, "auditToD1");
async function onRequestPost10({ request, env: env22 }) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  let sessionId = null;
  let fileName = null;
  let fileSize = null;
  try {
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE2) {
      return json7({ success: false, error: "SIZE_VIOLATION", message: "Upload blocked: payload exceeds the 300 MB per-request limit. Split the asset photos across multiple requests." }, 413);
    }
    const formData = await request.formData();
    const file = formData.get("file");
    sessionId = formData.get("sessionId") || crypto.randomUUID();
    if (!file || typeof file.arrayBuffer !== "function") {
      return json7({ success: false, error: "BAD_REQUEST", message: "No file payload attached." }, 400);
    }
    fileName = file.name || "unnamed";
    fileSize = file.size || 0;
    if (fileSize > MAX_PAYLOAD_SIZE2) {
      audit("upload.blocked.size", { ip, sessionId, fileName, size: fileSize, verdict: "BLOCKED_SIZE" });
      return json7({ success: false, error: "SIZE_VIOLATION", message: `Upload blocked: "${fileName}" is ${(fileSize / 1048576).toFixed(1)} MB, over the 300 MB limit. Compress the file or split it across requests.` }, 413);
    }
    const ext = String(fileName.split(".").pop() || "").toLowerCase();
    const mime = String(file.type || "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || mime && !ALLOWED_MIME.has(mime)) {
      audit("upload.blocked.type", { ip, sessionId, fileName, size: fileSize, verdict: "BLOCKED_TYPE" });
      return json7({ success: false, error: "TYPE_VIOLATION", message: `Upload blocked: ".${ext || "?"}" files are not accepted. Allowed types: PNG, JPEG, WEBP, GIF, TIFF, HEIC photos and MP4, MOV, WEBM, MKV, AVI, FLV videos.` }, 415);
    }
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (!validateMagicBytes2(bytes.slice(0, 16), ext)) {
      audit("upload.blocked.signature", { ip, sessionId, fileName, size: fileSize, verdict: "BLOCKED_SIGNATURE_SPOOF" });
      return json7({ success: false, error: "SIGNATURE_SPOOF", message: "Upload blocked: file signature does not match a verified photo/video container. Renamed executables are rejected." }, 415);
    }
    const scan = scanMalware(bytes, fileName);
    if (scan.infected) {
      const entry = { ip, sessionId, fileName, size: fileSize, sha256: null, signature: scan.signature, verdict: "BLOCKED_MALWARE" };
      audit("upload.blocked.malware", entry);
      return json7({ success: false, error: "MALWARE_BLOCKED", message: "Upload Blocked: Malicious signature detected. Incident logged to security console." }, 403);
    }
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const sha256 = hexOf(new Uint8Array(digest));
    if (!env22.QUARANTINE_BUCKET || typeof env22.QUARANTINE_BUCKET.put !== "function") {
      return json7({ success: false, error: "STORAGE_UNBOUND", message: "Upload pipeline unavailable: quarantine storage is not attached. Please try again shortly." }, 503);
    }
    let ownerEmail = "anonymous";
    try {
      const sessionUser = await verifySession(env22, request);
      if (sessionUser && sessionUser.email) ownerEmail = sessionUser.email;
    } catch {
    }
    const trackingId = crypto.randomUUID();
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : "bin";
    const objectKey = `session-${sessionId}/${trackingId}.${safeExt}`;
    await env22.QUARANTINE_BUCKET.put(objectKey, buffer, {
      httpMetadata: { contentType: mime || "application/octet-stream" },
      customMetadata: {
        "x-actor-ip": ip,
        "x-session-id": String(sessionId),
        "x-owner-email": ownerEmail,
        "x-payload-sha256": sha256,
        "x-scan-verdict": "CLEAN",
        "x-encryption": "SSE-AES256"
      }
    });
    let finalKey = objectKey;
    let finalBucket = "quarantine";
    if (env22.PRODUCTION_BUCKET && typeof env22.PRODUCTION_BUCKET.put === "function") {
      const prodKey = `evidence/${trackingId}.${safeExt}`;
      await env22.PRODUCTION_BUCKET.put(prodKey, buffer, {
        httpMetadata: { contentType: mime || "application/octet-stream" },
        customMetadata: {
          "x-actor-ip": ip,
          "x-session-id": String(sessionId),
          "x-owner-email": ownerEmail,
          "x-payload-sha256": sha256,
          "x-scan-verdict": "SCANNED_CLEAN",
          "x-encryption": "SSE-AES256",
          "x-quarantine-key": objectKey
        }
      });
      finalKey = prodKey;
      finalBucket = "production";
    }
    const done = { ip, sessionId, fileName, size: fileSize, sha256, verdict: "CLEAN", bucket: finalBucket, key: finalKey, ownerEmail };
    audit("upload.accepted", done);
    await auditToD1(env22, { event: "UPLOAD_ACCEPTED", ...done });
    return json7({
      success: true,
      state: "QUARANTINED_SCANNED_PROMOTED",
      key: finalKey,
      hash: sha256,
      encrypted: "AES-256",
      scan: "CLEAN"
    }, 201);
  } catch (err) {
    console.error("[upload] Internal error:", err);
    return json7({ success: false, error: "INTERNAL_ERROR", message: "Upload pipeline error. Please try again shortly." }, 500);
  }
}
__name(onRequestPost10, "onRequestPost10");
var MAX_PAYLOAD_SIZE2;
var SCAN_WINDOW_BYTES;
var ALLOWED_EXTENSIONS;
var ALLOWED_MIME;
var EICAR;
var init_secure_upload = __esm({
  "api/secure-upload.js"() {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_auth();
    MAX_PAYLOAD_SIZE2 = 300 * 1024 * 1024;
    SCAN_WINDOW_BYTES = 256 * 1024;
    ALLOWED_EXTENSIONS = /* @__PURE__ */ new Set([
      "png",
      "jpg",
      "jpeg",
      "webp",
      "gif",
      "tiff",
      "tif",
      "heic",
      "heif",
      "mp4",
      "mov",
      "webm",
      "mkv",
      "avi",
      "flv",
      "csv",
      "json"
    ]);
    ALLOWED_MIME = /* @__PURE__ */ new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "image/tiff",
      "image/heic",
      "image/heif",
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/x-matroska",
      "video/x-msvideo",
      "video/x-flv",
      "text/csv",
      "application/json"
    ]);
    EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
    __name2(json7, "json");
    __name2(hexOf, "hexOf");
    __name2(validateMagicBytes2, "validateMagicBytes");
    __name2(scanMalware, "scanMalware");
    __name2(audit, "audit");
    __name2(auditToD1, "auditToD1");
    __name2(onRequestPost10, "onRequestPost");
  }
});
async function onRequestPost11({ request, env: env22 }) {
  try {
    const body = await request.json();
    const { action, email, passwordHash, role, currentPasswordHash } = body;
    if (env22.DB) {
      await env22.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          email TEXT PRIMARY KEY,
          hash TEXT,
          role TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      const checkAdmin = await env22.DB.prepare("SELECT email FROM users WHERE email = ?").bind("admin@netamps.com").all();
      if (checkAdmin.results.length === 0) {
        const DEFAULT_HASH = "bfc7e9309e970b4802affde33a9c07151af5897ef4b4d251b119c171d24a4bec";
        await env22.DB.prepare("INSERT INTO users (email, hash, role) VALUES (?, ?, ?), (?, ?, ?)").bind(
          "admin@netamps.com",
          DEFAULT_HASH,
          "admin",
          "staff@netamps.com",
          DEFAULT_HASH,
          "staff"
        ).run();
      }
      if (action === "login") {
        const { results } = await env22.DB.prepare("SELECT hash, role FROM users WHERE email = ?").bind(email).all();
        if (results.length > 0 && results[0].hash === passwordHash) {
          const sessionId = crypto.randomUUID() + crypto.randomUUID();
          await env22.DB.prepare(`
            CREATE TABLE IF NOT EXISTS sessions (
              token TEXT PRIMARY KEY,
              email TEXT NOT NULL,
              role TEXT NOT NULL,
              expires_at DATETIME NOT NULL
            )
          `).run();
          const expiresAt = new Date(Date.now() + 8 * 3600 * 1e3).toISOString();
          await env22.DB.prepare("INSERT INTO sessions (token, email, role, expires_at) VALUES (?, ?, ?, ?)").bind(sessionId, email, results[0].role, expiresAt).run();
          const cookie = `session_token=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`;
          return new Response(JSON.stringify({ success: true, role: results[0].role }), {
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": cookie
            }
          });
        }
        return new Response(JSON.stringify({ success: false, message: "Invalid credentials" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      if (action === "add") {
        await env22.DB.prepare("INSERT INTO users (email, hash, role) VALUES (?, ?, ?)").bind(email, passwordHash, role || "staff").run();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      }
      if (action === "update_password") {
        const { currentPasswordHash: currentPasswordHash2 } = await request.clone().json().catch(() => ({}));
        const { results } = await env22.DB.prepare("SELECT hash FROM users WHERE email = ?").bind(email).all();
        if (results.length === 0 || results[0].hash !== currentPasswordHash2) {
          return new Response(JSON.stringify({ success: false, message: "Your current password is incorrect. Verification failed." }), { status: 403, headers: { "Content-Type": "application/json" } });
        }
        await env22.DB.prepare("UPDATE users SET hash = ? WHERE email = ?").bind(passwordHash, email).run();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      }
    } else if (env22.DATABASE_URL) {
      const { Client: Client2 } = await Promise.resolve().then(() => (init_esm(), esm_exports));
      const client = new Client2({ connectionString: env22.DATABASE_URL });
      await client.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          email VARCHAR(255) PRIMARY KEY,
          hash TEXT,
          role VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const checkAdmin = await client.query("SELECT email FROM users WHERE email = $1", ["admin@netamps.com"]);
      if (checkAdmin.rows.length === 0) {
        const DEFAULT_HASH = "bfc7e9309e970b4802affde33a9c07151af5897ef4b4d251b119c171d24a4bec";
        await client.query(
          "INSERT INTO users (email, hash, role) VALUES ($1, $2, $3), ($4, $5, $6)",
          ["admin@netamps.com", DEFAULT_HASH, "admin", "staff@netamps.com", DEFAULT_HASH, "staff"]
        );
      }
      if (action === "login") {
        const res = await client.query("SELECT hash, role FROM users WHERE email = $1", [email]);
        if (res.rows.length > 0 && res.rows[0].hash === passwordHash) {
          const sessionId = crypto.randomUUID();
          await client.end();
          return new Response(JSON.stringify({ success: true, role: res.rows[0].role, sessionId }), { headers: { "Content-Type": "application/json" } });
        }
        await client.end();
        return new Response(JSON.stringify({ success: false, message: "Invalid credentials" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      if (action === "add") {
        await client.query("INSERT INTO users (email, hash, role) VALUES ($1, $2, $3)", [email, passwordHash, role || "staff"]);
        await client.end();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      }
      if (action === "update_password") {
        await client.query("UPDATE users SET hash = $1 WHERE email = $2", [passwordHash, email]);
        await client.end();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      }
      await client.end();
    }
    return new Response(JSON.stringify({ success: false, message: "DB not connected" }), { status: 500, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
__name(onRequestPost11, "onRequestPost11");
async function onRequestGet5({ env: env22 }) {
  try {
    if (env22.DB) {
      await env22.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          email TEXT PRIMARY KEY,
          hash TEXT,
          role TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      const { results } = await env22.DB.prepare("SELECT email, role, created_at FROM users ORDER BY created_at DESC").all();
      return new Response(JSON.stringify({ success: true, users: results }), { headers: { "Content-Type": "application/json" } });
    } else if (env22.DATABASE_URL) {
      const { Client: Client2 } = await Promise.resolve().then(() => (init_esm(), esm_exports));
      const client = new Client2({ connectionString: env22.DATABASE_URL });
      await client.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          email VARCHAR(255) PRIMARY KEY,
          hash TEXT,
          role VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const res = await client.query("SELECT email, role, created_at FROM users ORDER BY created_at DESC");
      await client.end();
      return new Response(JSON.stringify({ success: true, users: res.rows }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: false, message: "DB not connected" }), { status: 500, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
__name(onRequestGet5, "onRequestGet5");
var init_users = __esm({
  "api/users.js"() {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name2(onRequestPost11, "onRequestPost");
    __name2(onRequestGet5, "onRequestGet");
  }
});
async function onRequest({ env: env22 }) {
  return new Response(
    JSON.stringify({
      commit: env22.CF_PAGES_COMMIT_SHA || null,
      branch: env22.CF_PAGES_BRANCH || null,
      bindings: Object.keys(env22),
      hasDB: Boolean(env22.DB),
      dbHasPrepare: Boolean(env22.DB && typeof env22.DB.prepare === "function"),
      hasOTP_KV: Boolean(env22.OTP_KV),
      hasRESEND_API_KEY: Boolean(env22.RESEND_API_KEY),
      hasQUARANTINE_BUCKET: Boolean(env22.QUARANTINE_BUCKET),
      quarantineHasPut: Boolean(env22.QUARANTINE_BUCKET && typeof env22.QUARANTINE_BUCKET.put === "function"),
      hasPRODUCTION_BUCKET: Boolean(env22.PRODUCTION_BUCKET),
      hasEVIDENCE_BUCKET: Boolean(env22.EVIDENCE_BUCKET)
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
__name(onRequest, "onRequest");
var init_bindings_status = __esm({
  "api/bindings-status.js"() {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name2(onRequest, "onRequest");
  }
});
async function onRequest2(context22) {
  const { request } = context22;
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const services = SERVICES.map((s) => ({ ...s, lastChecked: now }));
  const overallStatus = services.some((s) => s.status === "outage") ? "outage" : services.some((s) => s.status === "degraded") ? "degraded" : services.some((s) => s.status === "maintenance") ? "maintenance" : "operational";
  const avgUptime = services.reduce((sum, s) => sum + s.uptime, 0) / services.length;
  return new Response(
    JSON.stringify({
      timestamp: now,
      overallStatus,
      overallUptime: avgUptime.toFixed(3),
      services
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    }
  );
}
__name(onRequest2, "onRequest2");
var SERVICES;
var init_status = __esm({
  "api/status.js"() {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    SERVICES = [
      {
        id: "core-1",
        name: "API Gateway",
        category: "Core Infrastructure",
        status: "operational",
        uptime: 99.998,
        latency: 45,
        description: "Primary API endpoint for all client requests"
      },
      {
        id: "core-2",
        name: "Database Cluster",
        category: "Core Infrastructure",
        status: "operational",
        uptime: 99.995,
        latency: 12,
        description: "Multi-region PostgreSQL cluster with automatic failover"
      },
      {
        id: "core-3",
        name: "Message Queue",
        category: "Core Infrastructure",
        status: "operational",
        uptime: 99.999,
        latency: 8,
        description: "Redis-based pub/sub for async processing"
      },
      {
        id: "edge-1",
        name: "Cloudflare CDN",
        category: "Edge/CDN",
        status: "operational",
        uptime: 99.999,
        latency: 23,
        description: "Global edge network for static assets and caching"
      },
      {
        id: "edge-2",
        name: "DDoS Protection",
        category: "Edge/CDN",
        status: "operational",
        uptime: 99.999,
        latency: 0,
        description: "Layer 3/4/7 DDoS mitigation"
      },
      {
        id: "edge-3",
        name: "WAF Rules Engine",
        category: "Edge/CDN",
        status: "operational",
        uptime: 99.998,
        latency: 5,
        description: "Web Application Firewall rule evaluation"
      },
      {
        id: "monitor-1",
        name: "Uptime Monitoring",
        category: "Monitoring Services",
        status: "operational",
        uptime: 99.999,
        latency: 12,
        description: "Synthetic checks for all public endpoints"
      },
      {
        id: "monitor-2",
        name: "Log Aggregation",
        category: "Monitoring Services",
        status: "operational",
        uptime: 99.995,
        latency: 28,
        description: "Centralized logging pipeline"
      },
      {
        id: "monitor-3",
        name: "Metrics Pipeline",
        category: "Monitoring Services",
        status: "operational",
        uptime: 99.998,
        latency: 18,
        description: "Prometheus metrics collection and alerting"
      },
      {
        id: "monitor-4",
        name: "Distributed Tracing",
        category: "Monitoring Services",
        status: "operational",
        uptime: 99.997,
        latency: 35,
        description: "OpenTelemetry trace collection and analysis"
      }
    ];
    __name2(onRequest2, "onRequest");
  }
});
function getClientIp(request) {
  return request.headers.get("cf-connecting-ip") || (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}
__name(getClientIp, "getClientIp");
function isRateLimited(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  record.count += 1;
  if (rateLimitMap.size > 5e3) rateLimitMap.clear();
  return record.count > MAX_REQUESTS_PER_WINDOW;
}
__name(isRateLimited, "isRateLimited");
async function onRequest3(context22) {
  const { request, env: env22 } = context22;
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }
  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ success: false, error: "Too many attempts. Try again shortly." }), {
      status: 429,
      headers: { "Content-Type": "application/json" }
    });
  }
  const secret = env22.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("[verify-turnstile] TURNSTILE_SECRET_KEY is not configured");
    return new Response(JSON.stringify({ success: false, error: "Verification service misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!token || token.length > 4096) {
    return new Response(JSON.stringify({ success: false, error: "Missing verification token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  try {
    const formData = new FormData();
    formData.append("secret", secret);
    formData.append("response", token);
    if (ip !== "unknown") formData.append("remoteip", ip);
    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData
    });
    const outcome = await verifyRes.json();
    if (!outcome.success) {
      return new Response(
        JSON.stringify({ success: false, error: "Verification failed", codes: outcome["error-codes"] || [] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (action && outcome.action && outcome.action !== action) {
      return new Response(JSON.stringify({ success: false, error: "Verification failed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    const allowedHostname = env22.TURNSTILE_ALLOWED_HOSTNAME;
    if (allowedHostname && outcome.hostname && outcome.hostname !== allowedHostname) {
      return new Response(JSON.stringify({ success: false, error: "Verification failed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("[verify-turnstile] siteverify request failed:", err);
    return new Response(JSON.stringify({ success: false, error: "Verification service unavailable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(onRequest3, "onRequest3");
var RATE_LIMIT_WINDOW_MS;
var MAX_REQUESTS_PER_WINDOW;
var rateLimitMap;
var init_verify_turnstile = __esm({
  "api/verify-turnstile.js"() {
    "use strict";
    init_functionsRoutes_0_9042998161621167();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    RATE_LIMIT_WINDOW_MS = 60 * 1e3;
    MAX_REQUESTS_PER_WINDOW = 10;
    rateLimitMap = /* @__PURE__ */ new Map();
    __name2(getClientIp, "getClientIp");
    __name2(isRateLimited, "isRateLimited");
    __name2(onRequest3, "onRequest");
  }
});
var routes;
var init_functionsRoutes_0_9042998161621167 = __esm({
  "../.wrangler/tmp/pages-GDQKuO/functionsRoutes-0.9042998161621167.mjs"() {
    "use strict";
    init_push();
    init_import();
    init_sessions();
    init_sessions();
    init_generate();
    init_verify();
    init_create();
    init_modify_password();
    init_path();
    init_path();
    init_logs();
    init_logs();
    init_logs();
    init_returns();
    init_returns();
    init_returns();
    init_returns();
    init_secure_upload();
    init_users();
    init_users();
    init_bindings_status();
    init_status();
    init_verify_turnstile();
    routes = [
      {
        routePath: "/api/email/push",
        mountPath: "/api/email",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost]
      },
      {
        routePath: "/api/intake/import",
        mountPath: "/api/intake",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost2]
      },
      {
        routePath: "/api/intake/sessions",
        mountPath: "/api/intake",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet]
      },
      {
        routePath: "/api/intake/sessions",
        mountPath: "/api/intake",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost3]
      },
      {
        routePath: "/api/otp/generate",
        mountPath: "/api/otp",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost4]
      },
      {
        routePath: "/api/otp/verify",
        mountPath: "/api/otp",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost5]
      },
      {
        routePath: "/api/users/create",
        mountPath: "/api/users",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost6]
      },
      {
        routePath: "/api/users/modify-password",
        mountPath: "/api/users",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost7]
      },
      {
        routePath: "/api/cdn/:path*",
        mountPath: "/api/cdn",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet2]
      },
      {
        routePath: "/api/cdn/:path*",
        mountPath: "/api/cdn",
        method: "HEAD",
        middlewares: [],
        modules: [onRequestHead]
      },
      {
        routePath: "/api/logs",
        mountPath: "/api",
        method: "DELETE",
        middlewares: [],
        modules: [onRequestDelete]
      },
      {
        routePath: "/api/logs",
        mountPath: "/api",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet3]
      },
      {
        routePath: "/api/logs",
        mountPath: "/api",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost8]
      },
      {
        routePath: "/api/returns",
        mountPath: "/api",
        method: "DELETE",
        middlewares: [],
        modules: [onRequestDelete2]
      },
      {
        routePath: "/api/returns",
        mountPath: "/api",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet4]
      },
      {
        routePath: "/api/returns",
        mountPath: "/api",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost9]
      },
      {
        routePath: "/api/returns",
        mountPath: "/api",
        method: "PUT",
        middlewares: [],
        modules: [onRequestPut]
      },
      {
        routePath: "/api/secure-upload",
        mountPath: "/api",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost10]
      },
      {
        routePath: "/api/users",
        mountPath: "/api",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet5]
      },
      {
        routePath: "/api/users",
        mountPath: "/api",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost11]
      },
      {
        routePath: "/api/bindings-status",
        mountPath: "/api",
        method: "",
        middlewares: [],
        modules: [onRequest]
      },
      {
        routePath: "/api/status",
        mountPath: "/api",
        method: "",
        middlewares: [],
        modules: [onRequest2]
      },
      {
        routePath: "/api/verify-turnstile",
        mountPath: "/api",
        method: "",
        middlewares: [],
        modules: [onRequest3]
      }
    ];
  }
});
init_functionsRoutes_0_9042998161621167();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_functionsRoutes_0_9042998161621167();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_functionsRoutes_0_9042998161621167();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_functionsRoutes_0_9042998161621167();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count32 = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count32--;
          if (count32 === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count32++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count32)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open3 = tryConsume("OPEN");
    if (open3) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env22, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context22 = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env: env22,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name2(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context22);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env22["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error32) {
      if (isFailOpen) {
        const response = await env22["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error32;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
init_functionsRoutes_0_9042998161621167();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var drainBody = /* @__PURE__ */ __name2(async (request, env22, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env22);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
init_functionsRoutes_0_9042998161621167();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env22, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env22);
  } catch (e) {
    const error32 = reduceError(e);
    const body = JSON.stringify(error32);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
init_functionsRoutes_0_9042998161621167();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env22, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env22, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env22, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env22, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  static {
    __name(this, "___Facade_ScheduledController__");
  }
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name2(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env22, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env22, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env22, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env22, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env22, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name2((request, env22, ctx) => {
      this.env = env22;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name2((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env3, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env3);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env3, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env3);
  } catch (e) {
    const error4 = reduceError2(e);
    const body = JSON.stringify(error4);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-NX9Kn3/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env3, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env3, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env3, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env3, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-NX9Kn3/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class ___Facade_ScheduledController__2 {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env3, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env3, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env3, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env3, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env3, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env3, ctx) => {
      this.env = env3;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.07385037334434852.js.map
