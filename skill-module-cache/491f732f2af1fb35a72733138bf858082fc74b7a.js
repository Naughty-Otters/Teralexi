var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// toolSet/run-script-preflight.ts
var run_script_preflight_exports = {};
__export(run_script_preflight_exports, {
  runScriptPreflight: () => runScriptPreflight
});
module.exports = __toCommonJS(run_script_preflight_exports);
var import_child_process = require("child_process");
var import_util = require("util");
var import_path = __toESM(require("path"));
var execFileAsync = (0, import_util.promisify)(import_child_process.execFile);
var PREFLIGHT_TIMEOUT_MS = 15e3;
async function runSyntaxCheck(scriptType, scriptPath) {
  try {
    if (scriptType === "bash") {
      if (process.platform === "win32") {
        return null;
      }
      await execFileAsync("bash", ["-n", scriptPath], {
        timeout: PREFLIGHT_TIMEOUT_MS,
        windowsHide: true
      });
      return null;
    }
    if (scriptType === "python") {
      try {
        await execFileAsync("python3", ["-m", "py_compile", scriptPath], {
          timeout: PREFLIGHT_TIMEOUT_MS,
          windowsHide: true
        });
        return null;
      } catch {
        await execFileAsync("python", ["-m", "py_compile", scriptPath], {
          timeout: PREFLIGHT_TIMEOUT_MS,
          windowsHide: true
        });
        return null;
      }
    }
    try {
      await execFileAsync("node", ["--check", scriptPath], {
        timeout: PREFLIGHT_TIMEOUT_MS,
        windowsHide: true
      });
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        code: "syntax",
        message: `Node syntax check failed: ${msg}`
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      code: "syntax",
      message: `Syntax check failed: ${msg}`
    };
  }
}
async function runScriptPreflight(options) {
  const issues = [];
  try {
    await import("fs/promises").then((fs) => fs.access(options.scriptPath));
  } catch {
    issues.push({
      code: "script_missing",
      message: `Script file not readable: ${options.scriptPath}`
    });
    return { ok: false, phase: "preflight", issues };
  }
  const syntaxIssue = await runSyntaxCheck(options.scriptType, options.scriptPath);
  if (syntaxIssue) issues.push(syntaxIssue);
  const resultRel = options.resultFileRelativePath?.trim();
  if (resultRel && options.resolveResultFileAbs) {
    const abs = options.resolveResultFileAbs(resultRel);
    if (!abs) {
      issues.push({
        code: "result_path",
        message: `resultFileRelativePath is not a valid sandbox path: ${resultRel}`
      });
    } else {
      const parent = import_path.default.dirname(abs);
      try {
        await import("fs/promises").then(
          (fs) => fs.mkdir(parent, { recursive: true })
        );
      } catch (err) {
        issues.push({
          code: "result_path",
          message: `Cannot create parent dir for result file: ${err instanceof Error ? err.message : String(err)}`
        });
      }
    }
  }
  if (issues.length > 0) {
    return { ok: false, phase: "preflight", issues };
  }
  return { ok: true };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runScriptPreflight
});
//# sourceMappingURL=491f732f2af1fb35a72733138bf858082fc74b7a.js.map
