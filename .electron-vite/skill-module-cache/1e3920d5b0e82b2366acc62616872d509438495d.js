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

// toolSet/html-to-markdown.ts
var html_to_markdown_exports = {};
__export(html_to_markdown_exports, {
  getTurndownService: () => getTurndownService,
  htmlToMarkdown: () => htmlToMarkdown,
  isParseableMarkdown: () => isParseableMarkdown
});
module.exports = __toCommonJS(html_to_markdown_exports);
var import_markdown_it = __toESM(require("markdown-it"));
var import_turndown = __toESM(require("turndown"));
var import_turndown_plugin_gfm = require("turndown-plugin-gfm");
var turndownService;
var markdownParser = new import_markdown_it.default({
  html: false,
  linkify: false,
  breaks: false
});
function getTurndownService() {
  if (!turndownService) {
    turndownService = new import_turndown.default({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
      bulletListMarker: "-"
    });
    turndownService.remove(["script", "style", "noscript"]);
    turndownService.use(import_turndown_plugin_gfm.gfm);
  }
  return turndownService;
}
function isParseableMarkdown(markdown) {
  try {
    markdownParser.parse(markdown);
    return true;
  } catch {
    return false;
  }
}
function htmlToMarkdown(html, title) {
  const converted = getTurndownService().turndown(html).trim();
  const withTitle = title?.trim() ? `# ${title.trim()}

${converted}` : converted;
  return withTitle.replace(/\n{3,}/g, "\n\n").trim();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getTurndownService,
  htmlToMarkdown,
  isParseableMarkdown
});
//# sourceMappingURL=1e3920d5b0e82b2366acc62616872d509438495d.js.map
