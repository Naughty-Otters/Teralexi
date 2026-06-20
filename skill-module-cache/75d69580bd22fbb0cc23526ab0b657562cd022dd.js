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

// toolSet/run-script-workspace-guard.ts
var run_script_workspace_guard_exports = {};
__export(run_script_workspace_guard_exports, {
  WORKSPACE_SNAPSHOT_SKIP_DIRS: () => WORKSPACE_SNAPSHOT_SKIP_DIRS,
  WORKSPACE_WRITE_WARNING: () => WORKSPACE_WRITE_WARNING,
  detectWorkspaceWrites: () => detectWorkspaceWrites,
  snapshotWorkspaceGuard: () => snapshotWorkspaceGuard
});
module.exports = __toCommonJS(run_script_workspace_guard_exports);
var import_fs = require("fs");
var import_path = __toESM(require("path"));

// toolSet/run-script-artifacts.ts
function findChangedFiles(before, after) {
  const changed = [];
  for (const [filePath, meta] of after) {
    const prev = before.get(filePath);
    if (!prev || prev.mtimeMs !== meta.mtimeMs || prev.size !== meta.size) {
      changed.push(filePath);
    }
  }
  return changed;
}
var MAX_PRIMARY_PREVIEW_BYTES = 48 * 1024;

// toolSet/run-script-workspace-guard.ts
var WORKSPACE_SNAPSHOT_SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".openfde",
  "storage"
]);
async function snapshotWorkspaceGuard(workspaceRoot, maxDepth = 6) {
  const map = /* @__PURE__ */ new Map();
  const normalizedRoot = import_path.default.normalize(workspaceRoot);
  async function walk(current, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await import_fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const full = import_path.default.join(current, ent.name);
      if (ent.isDirectory()) {
        if (WORKSPACE_SNAPSHOT_SKIP_DIRS.has(ent.name)) continue;
        await walk(full, depth + 1);
        continue;
      }
      if (!ent.isFile()) continue;
      try {
        const st = await import_fs.promises.stat(full);
        map.set(import_path.default.normalize(full), {
          mtimeMs: st.mtimeMs,
          size: st.size
        });
      } catch {
      }
    }
  }
  await walk(normalizedRoot, 0);
  return map;
}
function detectWorkspaceWrites(options) {
  const { workspaceRoot, before, after } = options;
  const changed = findChangedFiles(before, after);
  return changed.map((abs) => {
    const rel = import_path.default.relative(workspaceRoot, abs);
    return rel.split(import_path.default.sep).join("/");
  });
}
var WORKSPACE_WRITE_WARNING = "Script created or modified files in the user workspace. Write generated outputs under OTTER_RESULTS_DIR, ./results/, or results/scratch/ in the sandbox step folder. Use promote_artifact to copy deliverables into the workspace when intentional.";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WORKSPACE_SNAPSHOT_SKIP_DIRS,
  WORKSPACE_WRITE_WARNING,
  detectWorkspaceWrites,
  snapshotWorkspaceGuard
});
//# sourceMappingURL=75d69580bd22fbb0cc23526ab0b657562cd022dd.js.map
