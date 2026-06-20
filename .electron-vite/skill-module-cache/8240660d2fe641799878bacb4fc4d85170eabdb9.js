var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// skills/github/actions/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => index_default,
  tools: () => tools
});
module.exports = __toCommonJS(index_exports);
var githubAuthStatus = {
  name: "github_auth_status",
  description: "Return a lightweight GitHub authentication status summary.",
  execute: async () => ({ authenticated: false, message: "GitHub auth status is unavailable in this environment." })
};
var githubPrList = {
  name: "github_pr_list",
  description: "List pull requests for the current repository.",
  execute: async () => ({ pullRequests: [], message: "GitHub PR listing is unavailable in this environment." })
};
var tools = [githubAuthStatus, githubPrList];
var index_default = { tools };
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  tools
});
//# sourceMappingURL=8240660d2fe641799878bacb4fc4d85170eabdb9.js.map
