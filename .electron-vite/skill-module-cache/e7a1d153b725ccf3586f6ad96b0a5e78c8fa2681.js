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

// toolSet/run-script-artifacts.ts
var run_script_artifacts_exports = {};
__export(run_script_artifacts_exports, {
  STEP_NON_DELIVERABLE_SUBDIRS: () => STEP_NON_DELIVERABLE_SUBDIRS,
  buildScriptArtifacts: () => buildScriptArtifacts,
  classifySandboxArtifactPath: () => classifySandboxArtifactPath,
  filterDeliverableChangedPaths: () => filterDeliverableChangedPaths,
  findChangedFiles: () => findChangedFiles,
  readPrimaryArtifactPreview: () => readPrimaryArtifactPreview,
  snapshotDeliverableFiles: () => snapshotDeliverableFiles,
  snapshotFilesUnderDir: () => snapshotFilesUnderDir
});
module.exports = __toCommonJS(run_script_artifacts_exports);
var import_fs = require("fs");
var import_path = __toESM(require("path"));
var TEXT_EXTENSIONS = /* @__PURE__ */ new Set([
  ".md",
  ".txt",
  ".json",
  ".csv",
  ".html",
  ".xml",
  ".yaml",
  ".yml",
  ".log",
  ".tex"
]);
var STEP_NON_DELIVERABLE_SUBDIRS = ["scripts"];
async function snapshotFilesUnderDir(dir, maxDepth = 5) {
  return snapshotFilesUnderDirWithExclusions(dir, { maxDepth });
}
async function snapshotDeliverableFiles(watchRoot, options) {
  return snapshotFilesUnderDirWithExclusions(watchRoot, {
    maxDepth: options?.maxDepth ?? 5,
    excludeTopLevelDirs: options?.excludeTopLevelDirs ?? STEP_NON_DELIVERABLE_SUBDIRS
  });
}
async function snapshotFilesUnderDirWithExclusions(dir, options) {
  const map = /* @__PURE__ */ new Map();
  const excludeTop = new Set(options.excludeTopLevelDirs ?? []);
  const normalizedRoot = import_path.default.normalize(dir);
  async function walk(current, depth) {
    if (depth > options.maxDepth) return;
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
        if (depth === 0 && excludeTop.has(ent.name)) continue;
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
function filterDeliverableChangedPaths(changedPaths, watchRoot, excludeSubdirs = STEP_NON_DELIVERABLE_SUBDIRS) {
  const blockedRoots = excludeSubdirs.map(
    (name) => import_path.default.normalize(import_path.default.join(watchRoot, name))
  );
  return changedPaths.filter((filePath) => {
    const norm = import_path.default.normalize(filePath);
    for (const blocked of blockedRoots) {
      if (norm === blocked) return false;
      const rel = import_path.default.relative(blocked, norm);
      if (!rel.startsWith("..") && !import_path.default.isAbsolute(rel)) return false;
    }
    return true;
  });
}
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
function toPosixRel(sandboxRoot, absPath) {
  return import_path.default.relative(sandboxRoot, absPath).split(import_path.default.sep).join("/");
}
function isCaptureLike(filePath, captureAbs) {
  if (captureAbs && import_path.default.normalize(filePath) === import_path.default.normalize(captureAbs)) {
    return true;
  }
  const base = import_path.default.basename(filePath).toLowerCase();
  return base.startsWith("capture-") && base.endsWith(".txt");
}
function sandboxRelativePosix(sandboxRoot, absPath) {
  return import_path.default.relative(import_path.default.resolve(sandboxRoot), import_path.default.resolve(absPath)).split(import_path.default.sep).join("/");
}
function classifySandboxArtifactPath(absPath, sandboxRoot) {
  const rel = sandboxRelativePosix(sandboxRoot, absPath);
  const segments = rel.split("/").filter(Boolean);
  const base = import_path.default.basename(absPath).toLowerCase();
  if (segments.includes("scripts")) return "non_promotable";
  if (segments[0] === "skills" || segments[0] === "refs") return "non_promotable";
  if (isCaptureLike(absPath)) return "temp";
  const resultsIdx = segments.indexOf("results");
  if (resultsIdx >= 0) {
    const afterResults = segments.slice(resultsIdx + 1);
    if (afterResults[0] === "scratch" || afterResults[0] === "tmp" || afterResults[0] === "cache") {
      return "temp";
    }
  }
  if (/\.(tmp|log)$/i.test(base)) return "temp";
  return "deliverable";
}
function dispositionForArtifact(options) {
  const { role, absPath, sandboxRoot, primaryAbs } = options;
  if (role === "script") return "non_promotable";
  if (role === "capture") return "temp";
  if (role === "primary") return "deliverable";
  if (primaryAbs && import_path.default.normalize(absPath) === import_path.default.normalize(primaryAbs)) {
    return "deliverable";
  }
  return classifySandboxArtifactPath(absPath, sandboxRoot);
}
function scorePrimaryCandidate(filePath) {
  const ext = import_path.default.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return 100;
  if (ext) return 10;
  return 1;
}
function pickPrimaryPath(options) {
  const { declaredPrimaryAbs, changedPaths, captureAbs, scriptAbs } = options;
  if (declaredPrimaryAbs) {
    try {
      return import_path.default.normalize(declaredPrimaryAbs);
    } catch {
    }
  }
  const candidates = changedPaths.map((p) => import_path.default.normalize(p)).filter((p) => !isCaptureLike(p, captureAbs)).filter((p) => !scriptAbs || p !== import_path.default.normalize(scriptAbs));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const scored = [...candidates].sort((a, b) => {
    const scoreDiff = scorePrimaryCandidate(b) - scorePrimaryCandidate(a);
    if (scoreDiff !== 0) return scoreDiff;
    return b.length - a.length;
  });
  return scored[0] ?? null;
}
function buildScriptArtifacts(options) {
  const {
    sandboxRoot,
    scriptPath,
    captureAbsolutePath,
    declaredPrimaryAbs,
    changedPaths
  } = options;
  const primaryAbs = pickPrimaryPath({
    declaredPrimaryAbs,
    changedPaths,
    captureAbs: captureAbsolutePath,
    scriptAbs: scriptPath
  });
  const artifacts = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (artifact) => {
    const key = artifact.path.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    artifacts.push(artifact);
  };
  push({
    role: "script",
    disposition: "non_promotable",
    path: scriptPath,
    relPath: toPosixRel(sandboxRoot, scriptPath)
  });
  push({
    role: "capture",
    disposition: "temp",
    path: captureAbsolutePath,
    relPath: toPosixRel(sandboxRoot, captureAbsolutePath)
  });
  for (const abs of changedPaths) {
    const normalized = import_path.default.normalize(abs);
    if (isCaptureLike(normalized, captureAbsolutePath)) continue;
    if (normalized === import_path.default.normalize(scriptPath)) continue;
    const role = primaryAbs && normalized === primaryAbs ? "primary" : "sidecar";
    push({
      role,
      disposition: dispositionForArtifact({
        role,
        absPath: normalized,
        sandboxRoot,
        primaryAbs
      }),
      path: normalized,
      relPath: toPosixRel(sandboxRoot, normalized)
    });
  }
  if (declaredPrimaryAbs && import_path.default.normalize(declaredPrimaryAbs) !== import_path.default.normalize(captureAbsolutePath) && !artifacts.some((a) => a.role === "primary")) {
    const normalizedPrimary = import_path.default.normalize(declaredPrimaryAbs);
    push({
      role: "primary",
      disposition: "deliverable",
      path: normalizedPrimary,
      relPath: toPosixRel(sandboxRoot, normalizedPrimary)
    });
  }
  return artifacts;
}
var MAX_PRIMARY_PREVIEW_BYTES = 48 * 1024;
async function readPrimaryArtifactPreview(artifacts, sandboxRoot) {
  const primary = artifacts.find((a) => a.role === "primary") ?? artifacts.find((a) => a.role === "sidecar" && TEXT_EXTENSIONS.has(import_path.default.extname(a.path).toLowerCase()));
  if (!primary) return null;
  const abs = import_path.default.isAbsolute(primary.path) ? primary.path : sandboxRoot ? import_path.default.join(sandboxRoot, primary.relPath) : primary.path;
  try {
    const buf = await import_fs.promises.readFile(abs);
    const slice = buf.subarray(0, Math.min(buf.length, MAX_PRIMARY_PREVIEW_BYTES));
    const text = slice.toString("utf8").trim();
    if (!text) return null;
    const suffix = buf.length > MAX_PRIMARY_PREVIEW_BYTES ? "\n\u2026[truncated]" : "";
    return { text: text + suffix, relPath: primary.relPath };
  } catch {
    return null;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  STEP_NON_DELIVERABLE_SUBDIRS,
  buildScriptArtifacts,
  classifySandboxArtifactPath,
  filterDeliverableChangedPaths,
  findChangedFiles,
  readPrimaryArtifactPreview,
  snapshotDeliverableFiles,
  snapshotFilesUnderDir
});
//# sourceMappingURL=e7a1d153b725ccf3586f6ad96b0a5e78c8fa2681.js.map
