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

// skills/workflow-compiler/actions/index.ts
var index_exports = {};
__export(index_exports, {
  addEntityFieldTool: () => addEntityFieldTool,
  default: () => index_default,
  deleteEntityFieldTool: () => deleteEntityFieldTool,
  editEntitiesDefinition: () => editEntitiesDefinition,
  editWorkflowDefinition: () => editWorkflowDefinition,
  listWorkflowFilesTool: () => listWorkflowFilesTool,
  readEntitiesDefinition: () => readEntitiesDefinition,
  readWorkflowDefinition: () => readWorkflowDefinition,
  tools: () => tools,
  updateEntityFieldTool: () => updateEntityFieldTool,
  writeEntitiesDefinition: () => writeEntitiesDefinition,
  writeWorkflowDefinition: () => writeWorkflowDefinition
});
module.exports = __toCommonJS(index_exports);

// skills/workflow-compiler/actions/lib/source-file-io.ts
var import_fs5 = require("fs");
var import_path5 = require("path");

// src/shared/workflows/definition-serialization.ts
var import_jsonrepair = require("jsonrepair");
var import_zod2 = require("zod");

// src/shared/skills/workflow-panel-skills.ts
var WORKFLOW_RUNTIME_SKILL_ID = "workflow-runtime";
var WORKFLOW_RUNTIME_AGENT_ID = `skill:${WORKFLOW_RUNTIME_SKILL_ID}`;

// src/shared/workflows/normalize-workflow-definition.ts
function isRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return void 0;
}
var DEFAULT_DAILY_CRON = "0 9 * * *";
function normalizeExecutor(raw) {
  const agentId = isRecord(raw) ? firstString(raw.agentId) : void 0;
  if (!agentId) {
    return { agentId: WORKFLOW_RUNTIME_AGENT_ID };
  }
  if (agentId === "skill:default" || agentId === "default") {
    return { agentId: WORKFLOW_RUNTIME_AGENT_ID };
  }
  return { agentId };
}
function normalizeTrigger(raw) {
  if (!isRecord(raw)) {
    return { type: "manual" };
  }
  let type = firstString(raw.type)?.toLowerCase() ?? "manual";
  if (type === "daily" || type === "cron" || type === "everyday") {
    type = "schedule";
  }
  if (type === "manual") {
    return { type: "manual" };
  }
  if (type === "schedule") {
    const cron = firstString(
      raw.cron,
      raw.cronExpression,
      raw.cron_expression,
      raw.expression,
      raw.schedule
    );
    return {
      type: "schedule",
      cron: cron ?? DEFAULT_DAILY_CRON,
      ...firstString(raw.timezone) ? { timezone: firstString(raw.timezone) } : {}
    };
  }
  if (type === "channel_message") {
    return {
      type: "channel_message",
      channelId: firstString(raw.channelId, raw.channel) ?? "slack",
      match: firstString(raw.match, raw.pattern, raw.text) ?? ".*"
    };
  }
  if (type === "channel_form") {
    const formId = firstString(raw.formId, raw.form);
    if (!formId) {
      return { type: "manual" };
    }
    return {
      type: "channel_form",
      formId,
      ...firstString(raw.channelId, raw.channel) ? { channelId: firstString(raw.channelId, raw.channel) } : {}
    };
  }
  if (type === "webhook") {
    const path2 = firstString(raw.path, raw.url);
    if (!path2) {
      return { type: "manual" };
    }
    return { type: "webhook", path: path2 };
  }
  return { type: "manual" };
}
function normalizeToolMock(raw) {
  if (!isRecord(raw)) {
    return null;
  }
  const tool = firstString(raw.tool, raw.toolName, raw.tool_name, raw.name);
  if (!tool) {
    return null;
  }
  return {
    tool,
    ...raw.fixture !== void 0 ? { fixture: raw.fixture } : {},
    ...isRecord(raw.inputMatch) ? { inputMatch: raw.inputMatch } : {}
  };
}
function normalizeHttpMock(raw) {
  if (!isRecord(raw)) {
    return null;
  }
  const match = firstString(raw.match, raw.url, raw.path);
  if (!match) {
    return null;
  }
  const response = isRecord(raw.response) ? raw.response : raw.body !== void 0 ? { body: raw.body } : void 0;
  return {
    match,
    ...firstString(raw.method) ? { method: firstString(raw.method) } : {},
    ...response ? { response } : {}
  };
}
function normalizeMocks(raw) {
  if (!isRecord(raw)) {
    return void 0;
  }
  const http = Array.isArray(raw.http) ? raw.http.map(normalizeHttpMock).filter((entry) => entry != null) : [];
  const tools2 = Array.isArray(raw.tools) ? raw.tools.map(normalizeToolMock).filter((entry) => entry != null) : [];
  if (http.length === 0 && tools2.length === 0) {
    return void 0;
  }
  return {
    ...http.length > 0 ? { http } : {},
    ...tools2.length > 0 ? { tools: tools2 } : {}
  };
}
function normalizeEntityFieldSource(raw) {
  if (!isRecord(raw)) {
    return { kind: "user_input" };
  }
  const kind = firstString(raw.kind) ?? "user_input";
  if (kind === "tool") {
    const tool = firstString(raw.tool, raw.toolName, raw.tool_name, raw.name);
    if (!tool) {
      return { kind: "user_input" };
    }
    return {
      kind: "tool",
      tool,
      ...firstString(raw.stepId) ? { stepId: firstString(raw.stepId) } : {},
      ...firstString(raw.resultPath) ? { resultPath: firstString(raw.resultPath) } : {}
    };
  }
  return {
    kind: "user_input",
    ...firstString(raw.formStepId) ? { formStepId: firstString(raw.formStepId) } : {},
    ...firstString(raw.inputKey) ? { inputKey: firstString(raw.inputKey) } : {}
  };
}
function normalizeEntityField(raw) {
  if (!isRecord(raw)) {
    return null;
  }
  const key = firstString(raw.key);
  const type = firstString(raw.type);
  if (!key || !type) {
    return null;
  }
  return {
    key,
    type,
    ...firstString(raw.label) ? { label: firstString(raw.label) } : {},
    ...typeof raw.required === "boolean" ? { required: raw.required } : {},
    ...firstString(raw.description) ? { description: firstString(raw.description) } : {},
    source: normalizeEntityFieldSource(raw.source),
    ...Array.isArray(raw.options) ? { options: raw.options } : {}
  };
}
function normalizeEntity(raw) {
  if (!isRecord(raw)) {
    return null;
  }
  const id = firstString(raw.id);
  const name = firstString(raw.name);
  if (!id || !name) {
    return null;
  }
  const fields = Array.isArray(raw.fields) ? raw.fields.map(normalizeEntityField).filter((field) => field != null) : [];
  if (fields.length === 0) {
    return null;
  }
  return {
    id,
    name,
    ...firstString(raw.description) ? { description: firstString(raw.description) } : {},
    fields
  };
}
function normalizeWorkflowDefinitionRaw(raw) {
  if (!isRecord(raw)) {
    return raw;
  }
  const normalized = { ...raw };
  if (Array.isArray(raw.triggers)) {
    normalized.triggers = raw.triggers.map(normalizeTrigger);
  } else {
    normalized.triggers = [{ type: "manual" }];
  }
  if (raw.mocks !== void 0) {
    normalized.mocks = normalizeMocks(raw.mocks);
  }
  if (Array.isArray(raw.entities)) {
    normalized.entities = raw.entities.map(normalizeEntity).filter((entity) => entity != null);
  }
  normalized.executor = normalizeExecutor(raw.executor);
  return normalized;
}

// src/shared/workflows/schema.ts
var import_zod = require("zod");
var WORKFLOW_DEFINITION_VERSION = 1;
var workflowStatusSchema = import_zod.z.enum([
  "draft",
  "confirmed",
  "testing",
  "deployed"
]);
var workflowInputFieldSchema = import_zod.z.object({
  key: import_zod.z.string().min(1),
  label: import_zod.z.string().optional(),
  type: import_zod.z.enum(["string", "text", "number", "boolean", "select"]),
  required: import_zod.z.boolean().optional(),
  placeholder: import_zod.z.string().optional(),
  options: import_zod.z.array(
    import_zod.z.object({
      value: import_zod.z.string(),
      label: import_zod.z.string().optional()
    })
  ).optional()
});
var workflowTriggerSchema = import_zod.z.discriminatedUnion("type", [
  import_zod.z.object({ type: import_zod.z.literal("manual") }),
  import_zod.z.object({
    type: import_zod.z.literal("schedule"),
    cron: import_zod.z.string().min(1),
    timezone: import_zod.z.string().optional()
  }),
  import_zod.z.object({
    type: import_zod.z.literal("channel_message"),
    channelId: import_zod.z.string().min(1),
    match: import_zod.z.string().min(1)
  }),
  import_zod.z.object({
    type: import_zod.z.literal("channel_form"),
    formId: import_zod.z.string().min(1),
    channelId: import_zod.z.string().optional()
  }),
  import_zod.z.object({
    type: import_zod.z.literal("webhook"),
    path: import_zod.z.string().min(1)
  })
]);
var dslExpressionSchema = import_zod.z.object({
  system_msg: import_zod.z.string().optional(),
  prompt: import_zod.z.string().optional(),
  title: import_zod.z.string().optional(),
  tool: import_zod.z.string().optional(),
  else_tool: import_zod.z.string().optional(),
  else_goto: import_zod.z.string().optional(),
  precondition: import_zod.z.string().optional(),
  when: import_zod.z.string().optional()
});
var workflowTodoItemSchema = import_zod.z.object({
  id: import_zod.z.string().optional(),
  name: import_zod.z.string().min(1),
  description: import_zod.z.string().optional(),
  verifyCommand: import_zod.z.string().optional()
});
var workflowStepSchema = import_zod.z.discriminatedUnion("type", [
  import_zod.z.object({
    id: import_zod.z.string().min(1),
    type: import_zod.z.literal("task"),
    title: import_zod.z.string().optional(),
    tools: import_zod.z.array(import_zod.z.string()).optional(),
    expression: dslExpressionSchema.optional(),
    stage: import_zod.z.string().optional(),
    precondition: import_zod.z.string().optional()
  }),
  import_zod.z.object({
    id: import_zod.z.string().min(1),
    type: import_zod.z.literal("channel"),
    title: import_zod.z.string().optional(),
    channelId: import_zod.z.string().min(1),
    action: import_zod.z.enum(["collect_form", "send_notification"]),
    form: import_zod.z.string().optional(),
    template: import_zod.z.string().optional(),
    target: import_zod.z.string().optional()
  }),
  import_zod.z.object({
    id: import_zod.z.string().min(1),
    type: import_zod.z.literal("plan_foreach"),
    title: import_zod.z.string().optional(),
    todosFrom: import_zod.z.enum(["steps", "inline"]).optional(),
    todos: import_zod.z.array(workflowTodoItemSchema).optional(),
    expression: dslExpressionSchema.optional()
  })
]);
var httpMockSchema = import_zod.z.object({
  match: import_zod.z.string().min(1),
  method: import_zod.z.string().optional(),
  response: import_zod.z.object({
    status: import_zod.z.number().optional(),
    body: import_zod.z.unknown().optional(),
    headers: import_zod.z.record(import_zod.z.string(), import_zod.z.string()).optional()
  })
});
var toolMockSchema = import_zod.z.object({
  tool: import_zod.z.string().min(1),
  fixture: import_zod.z.unknown().optional(),
  inputMatch: import_zod.z.record(import_zod.z.string(), import_zod.z.unknown()).optional()
});
var workflowMocksSchema = import_zod.z.object({
  http: import_zod.z.array(httpMockSchema).optional(),
  tools: import_zod.z.array(toolMockSchema).optional()
});
var workflowEntityFieldSourceSchema = import_zod.z.discriminatedUnion("kind", [
  import_zod.z.object({
    kind: import_zod.z.literal("user_input"),
    formStepId: import_zod.z.string().optional(),
    inputKey: import_zod.z.string().optional()
  }),
  import_zod.z.object({
    kind: import_zod.z.literal("tool"),
    tool: import_zod.z.string().min(1),
    stepId: import_zod.z.string().optional(),
    resultPath: import_zod.z.string().optional()
  })
]);
var workflowEntityFieldSchema = import_zod.z.object({
  key: import_zod.z.string().min(1),
  label: import_zod.z.string().optional(),
  type: import_zod.z.enum([
    "string",
    "text",
    "number",
    "boolean",
    "date",
    "datetime",
    "email",
    "select",
    "reference"
  ]),
  required: import_zod.z.boolean().optional(),
  description: import_zod.z.string().optional(),
  source: workflowEntityFieldSourceSchema,
  options: import_zod.z.array(
    import_zod.z.object({
      value: import_zod.z.string(),
      label: import_zod.z.string().optional()
    })
  ).optional()
});
var workflowBusinessEntitySchema = import_zod.z.object({
  id: import_zod.z.string().min(1),
  name: import_zod.z.string().min(1),
  description: import_zod.z.string().optional(),
  fields: import_zod.z.array(workflowEntityFieldSchema).min(1)
});
var workflowOutputSchema = import_zod.z.object({
  key: import_zod.z.string().min(1),
  from: import_zod.z.string().min(1)
});
var workflowExecutorSchema = import_zod.z.object({
  agentId: import_zod.z.string().min(1),
  model: import_zod.z.string().optional(),
  provider: import_zod.z.string().optional()
});
var workflowDefinitionSchema = import_zod.z.object({
  version: import_zod.z.literal(WORKFLOW_DEFINITION_VERSION),
  id: import_zod.z.string().min(1),
  name: import_zod.z.string().min(1),
  description: import_zod.z.string().optional(),
  status: workflowStatusSchema,
  executor: workflowExecutorSchema,
  inputs: import_zod.z.array(workflowInputFieldSchema).optional(),
  entities: import_zod.z.array(workflowBusinessEntitySchema).optional(),
  triggers: import_zod.z.array(workflowTriggerSchema).optional(),
  steps: import_zod.z.array(workflowStepSchema).min(1),
  mocks: workflowMocksSchema.optional(),
  outputs: import_zod.z.array(workflowOutputSchema).optional(),
  conditionals: import_zod.z.array(
    import_zod.z.object({
      afterStepId: import_zod.z.string().min(1),
      when: import_zod.z.string().min(1),
      thenStepIds: import_zod.z.array(import_zod.z.string().min(1)),
      elseStepIds: import_zod.z.array(import_zod.z.string().min(1)).optional()
    })
  ).optional()
});
var workflowCompileResultSchema = import_zod.z.object({
  definition: workflowDefinitionSchema,
  mermaid: import_zod.z.string(),
  summaryMarkdown: import_zod.z.string(),
  validationErrors: import_zod.z.array(import_zod.z.string()),
  validationWarnings: import_zod.z.array(import_zod.z.string())
});
function safeParseWorkflowDefinition(raw) {
  const result = workflowDefinitionSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}

// src/shared/workflows/definition-serialization.ts
var WORKFLOW_DEFINITION_JSON_FILENAME = "workflow_definition.json";
var ENTITIES_DEFINITION_JSON_FILENAME = "entities_definition.json";
var workflowEntitiesSchema = import_zod2.z.array(workflowBusinessEntitySchema);
function parseJsonText(json) {
  const trimmed = json.trim();
  if (!trimmed) {
    return { success: false, errors: ["JSON input is empty"] };
  }
  try {
    return { success: true, data: JSON.parse((0, import_jsonrepair.jsonrepair)(trimmed)) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    return { success: false, errors: [message] };
  }
}
function formatZodIssues(error, prefix) {
  return error.issues.map((issue) => {
    const path2 = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${prefix}: ${path2}: ${issue.message}`;
  });
}
function stripEntities(definition) {
  const { entities: _entities, ...body } = definition;
  return body;
}
function safeParseWorkflowDefinitionBodyJson(json) {
  const parsedJson = parseJsonText(json);
  if (!parsedJson.success) {
    return {
      success: false,
      errors: parsedJson.errors.map((e) => `${WORKFLOW_DEFINITION_JSON_FILENAME}: ${e}`)
    };
  }
  const normalized = normalizeWorkflowDefinitionRaw(parsedJson.data);
  const parsed = safeParseWorkflowDefinition(normalized);
  if (!parsed.success) {
    return {
      success: false,
      errors: [`${WORKFLOW_DEFINITION_JSON_FILENAME}: ${parsed.error}`]
    };
  }
  return { success: true, data: stripEntities(parsed.data) };
}
function serializeWorkflowDefinitionBody(definition) {
  const full = workflowDefinitionSchema.parse({ ...definition, entities: void 0 });
  return `${JSON.stringify(stripEntities(full), null, 2)}
`;
}
function safeParseEntitiesDefinitionJson(json) {
  const parsedJson = parseJsonText(json);
  if (!parsedJson.success) {
    return {
      success: false,
      errors: parsedJson.errors.map((e) => `${ENTITIES_DEFINITION_JSON_FILENAME}: ${e}`)
    };
  }
  return safeParseWorkflowEntities(parsedJson.data);
}
function parseEntitiesDefinitionJson(json) {
  const parsed = safeParseEntitiesDefinitionJson(json);
  if (!parsed.success) throw new Error(parsed.errors.join("; "));
  return parsed.data;
}
function serializeEntitiesDefinition(entities) {
  return serializeWorkflowEntities(entities);
}
function mergeWorkflowDefinition(body, entities) {
  return workflowDefinitionSchema.parse({
    ...body,
    entities: entities.length > 0 ? entities : void 0
  });
}
function mergeWorkflowSourceJson(workflowDefinitionJson, entitiesDefinitionJson) {
  const body = safeParseWorkflowDefinitionBodyJson(workflowDefinitionJson);
  if (!body.success) return body;
  const entitiesText = entitiesDefinitionJson.trim();
  const entities = entitiesText ? safeParseEntitiesDefinitionJson(entitiesDefinitionJson) : { success: true, data: [] };
  if (!entities.success) return entities;
  try {
    return {
      success: true,
      data: mergeWorkflowDefinition(body.data, entities.data)
    };
  } catch (err) {
    return {
      success: false,
      errors: [
        err instanceof Error ? err.message : "Failed to merge workflow sources"
      ]
    };
  }
}
function safeParseWorkflowEntities(raw) {
  const result = workflowEntitiesSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: formatZodIssues(result.error, ENTITIES_DEFINITION_JSON_FILENAME)
  };
}
function parseWorkflowEntities(raw) {
  const parsed = safeParseWorkflowEntities(raw);
  if (!parsed.success) throw new Error(parsed.errors.join("; "));
  return parsed.data;
}
function serializeWorkflowEntities(entities) {
  return `${JSON.stringify(workflowEntitiesSchema.parse(entities), null, 2)}
`;
}
function parseWorkflowEntityField(raw) {
  return workflowEntityFieldSchema.parse(raw);
}

// src/shared/workflows/source-files.ts
var WORKFLOW_DEFINITION_JSON_FILENAME2 = "workflow_definition.json";
var ENTITIES_DEFINITION_JSON_FILENAME2 = "entities_definition.json";

// toolSet/file-system/edit-replace.ts
var SINGLE_CANDIDATE_SIMILARITY_THRESHOLD = 0;
var MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD = 0.3;
function levenshtein(a, b) {
  if (a === "" || b === "") {
    return Math.max(a.length, b.length);
  }
  const matrix = Array.from(
    { length: a.length + 1 },
    (_, i) => Array.from({ length: b.length + 1 }, (_2, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}
var SimpleReplacer = function* (_content, find) {
  yield find;
};
var LineTrimmedReplacer = function* (content, find) {
  const originalLines = content.split("\n");
  const searchLines = find.split("\n");
  if (searchLines[searchLines.length - 1] === "") {
    searchLines.pop();
  }
  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true;
    for (let j = 0; j < searchLines.length; j++) {
      const originalTrimmed = originalLines[i + j].trim();
      const searchTrimmed = searchLines[j].trim();
      if (originalTrimmed !== searchTrimmed) {
        matches = false;
        break;
      }
    }
    if (matches) {
      let matchStartIndex = 0;
      for (let k = 0; k < i; k++) {
        matchStartIndex += originalLines[k].length + 1;
      }
      let matchEndIndex = matchStartIndex;
      for (let k = 0; k < searchLines.length; k++) {
        matchEndIndex += originalLines[i + k].length;
        if (k < searchLines.length - 1) {
          matchEndIndex += 1;
        }
      }
      yield content.substring(matchStartIndex, matchEndIndex);
    }
  }
};
var BlockAnchorReplacer = function* (content, find) {
  const originalLines = content.split("\n");
  const searchLines = find.split("\n");
  if (searchLines.length < 3) {
    return;
  }
  if (searchLines[searchLines.length - 1] === "") {
    searchLines.pop();
  }
  const firstLineSearch = searchLines[0].trim();
  const lastLineSearch = searchLines[searchLines.length - 1].trim();
  const searchBlockSize = searchLines.length;
  const candidates = [];
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i].trim() !== firstLineSearch) {
      continue;
    }
    for (let j = i + 2; j < originalLines.length; j++) {
      if (originalLines[j].trim() === lastLineSearch) {
        candidates.push({ startLine: i, endLine: j });
        break;
      }
    }
  }
  if (candidates.length === 0) {
    return;
  }
  if (candidates.length === 1) {
    const { startLine, endLine } = candidates[0];
    const actualBlockSize = endLine - startLine + 1;
    let similarity = 0;
    const linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2);
    if (linesToCheck > 0) {
      for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
        const originalLine = originalLines[startLine + j].trim();
        const searchLine = searchLines[j].trim();
        const maxLen = Math.max(originalLine.length, searchLine.length);
        if (maxLen === 0) {
          continue;
        }
        const distance = levenshtein(originalLine, searchLine);
        similarity += (1 - distance / maxLen) / linesToCheck;
        if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) {
          break;
        }
      }
    } else {
      similarity = 1;
    }
    if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) {
      let matchStartIndex = 0;
      for (let k = 0; k < startLine; k++) {
        matchStartIndex += originalLines[k].length + 1;
      }
      let matchEndIndex = matchStartIndex;
      for (let k = startLine; k <= endLine; k++) {
        matchEndIndex += originalLines[k].length;
        if (k < endLine) {
          matchEndIndex += 1;
        }
      }
      yield content.substring(matchStartIndex, matchEndIndex);
    }
    return;
  }
  let bestMatch = null;
  let maxSimilarity = -1;
  for (const candidate of candidates) {
    const { startLine, endLine } = candidate;
    const actualBlockSize = endLine - startLine + 1;
    let similarity = 0;
    const linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2);
    if (linesToCheck > 0) {
      for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
        const originalLine = originalLines[startLine + j].trim();
        const searchLine = searchLines[j].trim();
        const maxLen = Math.max(originalLine.length, searchLine.length);
        if (maxLen === 0) {
          continue;
        }
        const distance = levenshtein(originalLine, searchLine);
        similarity += 1 - distance / maxLen;
      }
      similarity /= linesToCheck;
    } else {
      similarity = 1;
    }
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      bestMatch = candidate;
    }
  }
  if (maxSimilarity >= MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD && bestMatch) {
    const { startLine, endLine } = bestMatch;
    let matchStartIndex = 0;
    for (let k = 0; k < startLine; k++) {
      matchStartIndex += originalLines[k].length + 1;
    }
    let matchEndIndex = matchStartIndex;
    for (let k = startLine; k <= endLine; k++) {
      matchEndIndex += originalLines[k].length;
      if (k < endLine) {
        matchEndIndex += 1;
      }
    }
    yield content.substring(matchStartIndex, matchEndIndex);
  }
};
var WhitespaceNormalizedReplacer = function* (content, find) {
  const normalizeWhitespace = (text) => text.replace(/\s+/g, " ").trim();
  const normalizedFind = normalizeWhitespace(find);
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (normalizeWhitespace(line) === normalizedFind) {
      yield line;
    } else {
      const normalizedLine = normalizeWhitespace(line);
      if (normalizedLine.includes(normalizedFind)) {
        const words = find.trim().split(/\s+/);
        if (words.length > 0) {
          const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
          try {
            const regex = new RegExp(pattern);
            const match = line.match(regex);
            if (match) {
              yield match[0];
            }
          } catch {
          }
        }
      }
    }
  }
  const findLines = find.split("\n");
  if (findLines.length > 1) {
    for (let i = 0; i <= lines.length - findLines.length; i++) {
      const block = lines.slice(i, i + findLines.length);
      if (normalizeWhitespace(block.join("\n")) === normalizedFind) {
        yield block.join("\n");
      }
    }
  }
};
var IndentationFlexibleReplacer = function* (content, find) {
  const removeIndentation = (text) => {
    const textLines = text.split("\n");
    const nonEmptyLines = textLines.filter((line) => line.trim().length > 0);
    if (nonEmptyLines.length === 0) return text;
    const minIndent = Math.min(
      ...nonEmptyLines.map((line) => {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
      })
    );
    return textLines.map((line) => line.trim().length === 0 ? line : line.slice(minIndent)).join("\n");
  };
  const normalizedFind = removeIndentation(find);
  const contentLines = content.split("\n");
  const findLines = find.split("\n");
  for (let i = 0; i <= contentLines.length - findLines.length; i++) {
    const block = contentLines.slice(i, i + findLines.length).join("\n");
    if (removeIndentation(block) === normalizedFind) {
      yield block;
    }
  }
};
var EscapeNormalizedReplacer = function* (content, find) {
  const unescapeString = (str) => {
    return str.replace(/\\(n|t|r|'|"|`|\\|\n|\$)/g, (match, capturedChar) => {
      switch (capturedChar) {
        case "n":
          return "\n";
        case "t":
          return "	";
        case "r":
          return "\r";
        case "'":
          return "'";
        case '"':
          return '"';
        case "`":
          return "`";
        case "\\":
          return "\\";
        case "\n":
          return "\n";
        case "$":
          return "$";
        default:
          return match;
      }
    });
  };
  const unescapedFind = unescapeString(find);
  if (content.includes(unescapedFind)) {
    yield unescapedFind;
  }
  const lines = content.split("\n");
  const findLines = unescapedFind.split("\n");
  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join("\n");
    const unescapedBlock = unescapeString(block);
    if (unescapedBlock === unescapedFind) {
      yield block;
    }
  }
};
var MultiOccurrenceReplacer = function* (content, find) {
  let startIndex = 0;
  while (true) {
    const index = content.indexOf(find, startIndex);
    if (index === -1) break;
    yield find;
    startIndex = index + find.length;
  }
};
var TrimmedBoundaryReplacer = function* (content, find) {
  const trimmedFind = find.trim();
  if (trimmedFind === find) {
    return;
  }
  if (content.includes(trimmedFind)) {
    yield trimmedFind;
  }
  const lines = content.split("\n");
  const findLines = find.split("\n");
  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join("\n");
    if (block.trim() === trimmedFind) {
      yield block;
    }
  }
};
var ContextAwareReplacer = function* (content, find) {
  const findLines = find.split("\n");
  if (findLines.length < 3) {
    return;
  }
  if (findLines[findLines.length - 1] === "") {
    findLines.pop();
  }
  const contentLines = content.split("\n");
  const firstLine = findLines[0].trim();
  const lastLine = findLines[findLines.length - 1].trim();
  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].trim() !== firstLine) continue;
    for (let j = i + 2; j < contentLines.length; j++) {
      if (contentLines[j].trim() === lastLine) {
        const blockLines = contentLines.slice(i, j + 1);
        const block = blockLines.join("\n");
        if (blockLines.length === findLines.length) {
          let matchingLines = 0;
          let totalNonEmptyLines = 0;
          for (let k = 1; k < blockLines.length - 1; k++) {
            const blockLine = blockLines[k].trim();
            const findLine = findLines[k].trim();
            if (blockLine.length > 0 || findLine.length > 0) {
              totalNonEmptyLines++;
              if (blockLine === findLine) {
                matchingLines++;
              }
            }
          }
          if (totalNonEmptyLines === 0 || matchingLines / totalNonEmptyLines >= 0.5) {
            yield block;
            break;
          }
        }
        break;
      }
    }
  }
};
function replace(content, oldString, newString, replaceAll = false) {
  if (oldString === newString) {
    throw new Error("No changes to apply: oldString and newString are identical.");
  }
  let notFound = true;
  for (const replacer of [
    SimpleReplacer,
    LineTrimmedReplacer,
    BlockAnchorReplacer,
    WhitespaceNormalizedReplacer,
    IndentationFlexibleReplacer,
    EscapeNormalizedReplacer,
    TrimmedBoundaryReplacer,
    ContextAwareReplacer,
    MultiOccurrenceReplacer
  ]) {
    for (const search of replacer(content, oldString)) {
      const index = content.indexOf(search);
      if (index === -1) continue;
      notFound = false;
      if (replaceAll) {
        return content.replaceAll(search, newString);
      }
      const lastIndex = content.lastIndexOf(search);
      if (index !== lastIndex) continue;
      return content.substring(0, index) + newString + content.substring(index + search.length);
    }
  }
  if (notFound) {
    throw new Error(
      "Could not find oldString in the file. It must match exactly, including whitespace, indentation, and line endings."
    );
  }
  throw new Error(
    "Found multiple matches for oldString. Provide more surrounding context to make the match unique."
  );
}

// toolSet/file-system/file-io-utils.ts
var import_fs = require("fs");
var import_path = __toESM(require("path"));
var import_diff = require("diff");
function normalizeLineEndings(text) {
  return text.replaceAll("\r\n", "\n");
}
function detectLineEnding(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}
function convertToLineEnding(text, ending) {
  if (ending === "\n") return text;
  return text.replaceAll("\n", "\r\n");
}
var fileLocks = /* @__PURE__ */ new Map();
async function withFileLock(filePath, fn) {
  const resolved = import_path.default.resolve(filePath);
  const previous = fileLocks.get(resolved) ?? Promise.resolve();
  let release;
  const gate = new Promise((resolve4) => {
    release = resolve4;
  });
  fileLocks.set(resolved, previous.then(() => gate));
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (fileLocks.get(resolved) === gate) {
      fileLocks.delete(resolved);
    }
  }
}
async function readTextFileIfExists(filePath) {
  try {
    return await import_fs.promises.readFile(filePath, "utf-8");
  } catch (err) {
    if (err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

// src/main/workflows/workflow-compile-context.ts
var CONTEXT_STACK_KEY = /* @__PURE__ */ Symbol.for("openfde.workflowCompileContextStack");
function contextStack() {
  const g = globalThis;
  if (!g[CONTEXT_STACK_KEY]) {
    g[CONTEXT_STACK_KEY] = [];
  }
  return g[CONTEXT_STACK_KEY];
}
function getWorkflowCompileContext() {
  const stack = contextStack();
  return stack[stack.length - 1];
}
function requireWorkflowCompileContext() {
  const ctx = getWorkflowCompileContext();
  if (!ctx) {
    throw new Error(
      "Workflow compile context is not active \u2014 tools must run inside a workflow compiler agent session."
    );
  }
  return ctx;
}

// src/main/workflows/workflow-source-scope.ts
var import_fs3 = require("fs");
var import_path3 = require("path");

// config/openfde-home.ts
var import_module = require("module");
var import_fs2 = require("fs");
var import_os = require("os");
var import_path2 = require("path");
var import_meta = {};
var openfde_HOME_DIRNAME = ".openfde";
var openfde_DB_FILENAME = "openfde.db";
var LEGACY_OTTERS_HOME_DIRNAME = ".otters";
var LEGACY_OTTERS_DB_FILENAME = "otters.db";
var openfde_APP_DIRS = [
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
var openfde_CHANNEL_DATA_DIRS = [
  "whatsapp-auth",
  "telegram-data",
  "discord-data",
  "wechat-data",
  "slack-data"
];
var openfde_DB_DIRNAME = "db";
var initialized = false;
var openfdeHomePath = null;
function resolveopenfdeHomePath() {
  return (0, import_path2.join)((0, import_os.homedir)(), openfde_HOME_DIRNAME);
}
function migrateLegacyHomeIfNeeded(newHome) {
  const legacyHome = (0, import_path2.resolve)((0, import_path2.join)((0, import_os.homedir)(), LEGACY_OTTERS_HOME_DIRNAME));
  const resolvedNew = (0, import_path2.resolve)(newHome);
  if (legacyHome !== resolvedNew && !(0, import_fs2.existsSync)(resolvedNew) && (0, import_fs2.existsSync)(legacyHome)) {
    (0, import_fs2.renameSync)(legacyHome, resolvedNew);
  }
  const legacyDb = (0, import_path2.join)(resolvedNew, openfde_DB_DIRNAME, LEGACY_OTTERS_DB_FILENAME);
  const newDb = (0, import_path2.join)(resolvedNew, openfde_DB_DIRNAME, openfde_DB_FILENAME);
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
function getopenfdeWorkflowsDir() {
  const dir = (0, import_path2.join)(getopenfdeHome(), "workflows");
  ensureDir(dir);
  return dir;
}
function getWorkflowSourceDir(workflowId) {
  const dir = (0, import_path2.join)(getopenfdeWorkflowsDir(), workflowId, "source");
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
  const home = (0, import_path2.resolve)(resolveopenfdeHomePath());
  const resolved = (0, import_path2.resolve)(targetPath);
  const channelsRoot = (0, import_path2.join)(home, "channels");
  for (const name of openfde_CHANNEL_DATA_DIRS) {
    const legacyRoot = (0, import_path2.join)(home, name);
    if (resolved === legacyRoot || resolved.startsWith(`${legacyRoot}${import_path2.sep}`)) {
      const relative2 = resolved.slice(legacyRoot.length).replace(/^[/\\]+/, "");
      return relative2 ? (0, import_path2.join)(channelsRoot, name, relative2) : (0, import_path2.join)(channelsRoot, name);
    }
  }
  return targetPath;
}
function ensureDir(path2) {
  (0, import_fs2.mkdirSync)(redirectLegacyChannelDataPath(path2), { recursive: true });
}
function initializeopenfdeHome(app) {
  const home = (0, import_path2.resolve)(resolveopenfdeHomePath());
  if (initialized) {
    return openfdeHomePath ?? home;
  }
  migrateLegacyHomeIfNeeded(home);
  openfdeHomePath = home;
  initialized = true;
  ensureDir(home);
  for (const dir of openfde_APP_DIRS) {
    ensureDir((0, import_path2.join)(home, dir));
  }
  ensureDir((0, import_path2.join)(home, "workspace", "sandbox"));
  for (const name of openfde_CHANNEL_DATA_DIRS) {
    ensureDir((0, import_path2.join)(home, "channels", name));
  }
  return home;
}

// src/main/workflows/workflow-source-scope.ts
var WORKFLOW_COMPILER_ALLOWED_FILES = [
  WORKFLOW_DEFINITION_JSON_FILENAME2,
  ENTITIES_DEFINITION_JSON_FILENAME2
];
function resolvePathForContainment(filePath) {
  const abs = (0, import_path3.resolve)(filePath);
  let current = abs;
  const tail = [];
  for (; ; ) {
    try {
      const real = (0, import_fs3.realpathSync)(current);
      return tail.length > 0 ? (0, import_path3.join)(real, ...tail) : real;
    } catch {
      const parent = (0, import_path3.resolve)(current, "..");
      if (parent === current) return abs;
      tail.unshift(current.split("/").pop() ?? "");
      current = parent;
    }
  }
}
function isInsideRoot(root, target) {
  const resolvedRoot = resolvePathForContainment(root);
  const resolvedTarget = resolvePathForContainment(target);
  const rel = (0, import_path3.relative)(resolvedRoot, resolvedTarget);
  return rel === "" || !rel.startsWith("..") && !rel.startsWith("/");
}
function normalizeWorkflowSourceRelativePath(raw) {
  const trimmed = raw.trim().replace(/^\/+/, "");
  const base = trimmed.split(/[/\\]/).pop() ?? trimmed;
  if (!WORKFLOW_COMPILER_ALLOWED_FILES.includes(base)) {
    throw new Error(
      `Path "${raw}" is not allowed. Edit only: ${WORKFLOW_COMPILER_ALLOWED_FILES.join(", ")}`
    );
  }
  return base;
}
function resolveWorkflowSourceFilePathInRoot(root, rawPath) {
  const fileName = normalizeWorkflowSourceRelativePath(rawPath);
  const resolvedRoot = (0, import_path3.resolve)(root);
  const abs = (0, import_path3.resolve)(resolvedRoot, fileName);
  if (!isInsideRoot(resolvedRoot, abs)) {
    throw new Error(`Path "${rawPath}" escapes workflow source directory`);
  }
  return abs;
}
function resolveWorkflowSourceFilePathForContext(ctx, rawPath) {
  const root = ctx.sourceDir ?? getWorkflowSourceDir(ctx.workflowId);
  return resolveWorkflowSourceFilePathInRoot(root, rawPath);
}
function workflowSourceScopeError(err) {
  const message = err instanceof Error ? err.message : "Invalid workflow source path";
  return { error: message };
}
function workflowSourceFolderHint(workflowId, sourceDir) {
  return (0, import_path3.resolve)(sourceDir ?? getWorkflowSourceDir(workflowId));
}

// src/main/workflows/workflow-source-validate.ts
var import_fs4 = require("fs");
var import_path4 = require("path");

// src/main/workflows/workflow-validator.ts
function validateWorkflowDefinition(definition, options) {
  const errors = [];
  const warnings = [];
  const stepIds = /* @__PURE__ */ new Set();
  for (const step of definition.steps) {
    if (stepIds.has(step.id)) {
      errors.push(`Duplicate step id: ${step.id}`);
    }
    stepIds.add(step.id);
    if (step.type === "channel") {
      if (step.action === "collect_form" && !step.form?.trim()) {
        errors.push(`Step ${step.id}: collect_form requires form path`);
      }
      if (step.action === "send_notification" && !step.template?.trim()) {
        warnings.push(`Step ${step.id}: send_notification has empty template`);
      }
    }
    if (step.type === "task" && step.expression?.tool && options?.knownTools) {
      const tools2 = [step.expression.tool, step.expression.else_tool].filter(
        Boolean
      );
      for (const tool of tools2) {
        if (!options.knownTools.has(tool)) {
          warnings.push(`Step ${step.id}: unknown tool "${tool}"`);
        }
      }
    }
  }
  for (const branch of definition.conditionals ?? []) {
    if (!stepIds.has(branch.afterStepId)) {
      errors.push(`Conditional references missing step: ${branch.afterStepId}`);
    }
    for (const id of [...branch.thenStepIds, ...branch.elseStepIds ?? []]) {
      if (!stepIds.has(id)) {
        errors.push(`Conditional references missing step: ${id}`);
      }
    }
  }
  for (const input of definition.inputs ?? []) {
    if (!input.key.trim()) {
      errors.push("Input field missing key");
    }
  }
  for (const entity of definition.entities ?? []) {
    if (!entity.id.trim()) {
      errors.push("Entity missing id");
    }
    const fieldKeys = /* @__PURE__ */ new Set();
    for (const field of entity.fields) {
      if (fieldKeys.has(field.key)) {
        errors.push(`Entity ${entity.id}: duplicate field key "${field.key}"`);
      }
      fieldKeys.add(field.key);
      if (field.source.kind === "tool") {
        if (options?.knownTools && !options.knownTools.has(field.source.tool)) {
          warnings.push(
            `Entity ${entity.id}.${field.key}: unknown tool "${field.source.tool}"`
          );
        }
        if (field.source.stepId && !stepIds.has(field.source.stepId)) {
          warnings.push(
            `Entity ${entity.id}.${field.key}: tool source references missing step "${field.source.stepId}"`
          );
        }
      }
      if (field.source.kind === "user_input" && field.source.formStepId) {
        const formStepId = field.source.formStepId;
        const formStep = definition.steps.find((s) => s.id === formStepId);
        if (!formStep) {
          warnings.push(
            `Entity ${entity.id}.${field.key}: formStepId "${formStepId}" not found`
          );
        } else if (formStep.type !== "channel" || formStep.action !== "collect_form") {
          warnings.push(
            `Entity ${entity.id}.${field.key}: formStepId "${formStepId}" is not a collect_form channel step`
          );
        }
      }
    }
  }
  if ((definition.entities ?? []).length === 0) {
    warnings.push("No business entities defined");
  }
  if (!definition.executor.agentId.trim()) {
    errors.push("Executor agentId is required");
  }
  if ((definition.triggers ?? []).length === 0) {
    warnings.push("No triggers defined; workflow can only be run manually from UI");
  }
  return { errors, warnings };
}

// src/main/workflows/workflow-source-validate.ts
function readSourceFile(ctx, fileName) {
  const root = ctx.sourceDir ?? getWorkflowSourceDir(ctx.workflowId);
  try {
    return (0, import_fs4.readFileSync)((0, import_path4.join)((0, import_path4.resolve)(root), fileName), "utf-8");
  } catch {
    return "";
  }
}
function validateWorkflowDefinitionJsonSource(ctx, workflowDefinitionJson) {
  const parsed = safeParseWorkflowDefinitionBodyJson(workflowDefinitionJson);
  if (!parsed.success) {
    return { valid: false, errors: parsed.errors, warnings: [] };
  }
  const errors = [];
  if (parsed.data.id !== ctx.workflowId) {
    errors.push(
      `${WORKFLOW_DEFINITION_JSON_FILENAME2}: id must be "${ctx.workflowId}" (found "${parsed.data.id}")`
    );
  }
  const entitiesJson = readSourceFile(ctx, ENTITIES_DEFINITION_JSON_FILENAME2);
  const merged = mergeWorkflowSourceJson(workflowDefinitionJson, entitiesJson);
  if (!merged.success) {
    errors.push(...merged.errors);
    return { valid: false, errors, warnings: [] };
  }
  const schema = validateWorkflowDefinition(
    {
      ...merged.data,
      id: ctx.workflowId,
      name: merged.data.name?.trim() ? merged.data.name : ctx.workflowName,
      version: WORKFLOW_DEFINITION_VERSION,
      status: merged.data.status ?? "draft",
      executor: merged.data.executor ?? { agentId: WORKFLOW_RUNTIME_AGENT_ID }
    },
    { knownTools: ctx.knownTools }
  );
  errors.push(...schema.errors.map((e) => `${WORKFLOW_DEFINITION_JSON_FILENAME2}: ${e}`));
  return {
    valid: errors.length === 0,
    errors,
    warnings: schema.warnings.map((w) => `${WORKFLOW_DEFINITION_JSON_FILENAME2}: ${w}`)
  };
}
function validateEntitiesDefinitionJsonSource(ctx, entitiesDefinitionJson) {
  const trimmed = entitiesDefinitionJson.trim();
  if (!trimmed) {
    return { valid: true, errors: [], warnings: [] };
  }
  const parsed = safeParseEntitiesDefinitionJson(entitiesDefinitionJson);
  if (!parsed.success) {
    return { valid: false, errors: parsed.errors, warnings: [] };
  }
  const workflowJson = readSourceFile(ctx, WORKFLOW_DEFINITION_JSON_FILENAME2);
  if (!workflowJson.trim()) {
    return { valid: true, errors: [], warnings: [] };
  }
  const merged = mergeWorkflowSourceJson(workflowJson, entitiesDefinitionJson);
  if (!merged.success) {
    return { valid: false, errors: merged.errors, warnings: [] };
  }
  const schema = validateWorkflowDefinition(
    {
      ...merged.data,
      id: ctx.workflowId,
      name: merged.data.name?.trim() ? merged.data.name : ctx.workflowName,
      version: WORKFLOW_DEFINITION_VERSION,
      status: merged.data.status ?? "draft",
      executor: merged.data.executor ?? { agentId: WORKFLOW_RUNTIME_AGENT_ID }
    },
    { knownTools: ctx.knownTools }
  );
  return {
    valid: schema.errors.length === 0,
    errors: schema.errors.map((e) => `${ENTITIES_DEFINITION_JSON_FILENAME2}: ${e}`),
    warnings: schema.warnings.map((w) => `${ENTITIES_DEFINITION_JSON_FILENAME2}: ${w}`)
  };
}
function attachValidationMessage(base, validation) {
  return {
    ...base,
    valid: validation.valid,
    validationErrors: validation.errors,
    validationWarnings: validation.warnings,
    message: validation.valid ? "Saved and validated successfully." : `Saved but validation failed \u2014 fix these errors and call edit again:
${validation.errors.map((e) => `- ${e}`).join("\n")}`
  };
}

// skills/workflow-compiler/actions/lib/source-file-io.ts
async function ensureParentDir(filePath) {
  await import_fs5.promises.mkdir((0, import_path5.dirname)(filePath), { recursive: true });
}
function validateContext() {
  const ctx = requireWorkflowCompileContext();
  return {
    workflowId: ctx.workflowId,
    workflowName: ctx.workflowName,
    knownTools: ctx.knownTools,
    sourceDir: ctx.sourceDir
  };
}
function entitiesResult(base, entities, content, validation) {
  return attachValidationMessage(
    {
      ...base,
      entities,
      content
    },
    validation
  );
}
async function readEntitiesArray(ctx) {
  const path2 = resolveWorkflowSourceFilePathForContext(
    ctx,
    ENTITIES_DEFINITION_JSON_FILENAME2
  );
  const raw = await readTextFileIfExists(path2) ?? "[]";
  const parsed = safeParseEntitiesDefinitionJson(raw);
  return {
    path: path2,
    raw,
    entities: parsed.success ? parsed.data : [],
    parseErrors: parsed.success ? [] : parsed.errors
  };
}
async function persistEntitiesArray(ctx, path2, entities) {
  await ensureParentDir(path2);
  const content = serializeEntitiesDefinition(entities);
  await import_fs5.promises.writeFile(path2, content, "utf-8");
  const validation = validateEntitiesDefinitionJsonSource(ctx, content);
  return { content, validation, entities: parseEntitiesDefinitionJson(content) };
}
function canonicalizeWorkflowBody(ctx, content) {
  const parsed = safeParseWorkflowDefinitionBodyJson(content);
  if (!parsed.success) return content;
  return serializeWorkflowDefinitionBody({
    ...parsed.data,
    id: ctx.workflowId,
    name: parsed.data.name?.trim() ? parsed.data.name : ctx.workflowName,
    version: WORKFLOW_DEFINITION_VERSION,
    status: parsed.data.status ?? "draft",
    executor: parsed.data.executor ?? { agentId: WORKFLOW_RUNTIME_AGENT_ID }
  });
}
async function persistWorkflowBodyContent(ctx, path2, content) {
  await ensureParentDir(path2);
  let validation = validateWorkflowDefinitionJsonSource(ctx, content);
  const toWrite = validation.valid ? canonicalizeWorkflowBody(ctx, content) : content;
  await import_fs5.promises.writeFile(path2, toWrite, "utf-8");
  if (validation.valid && toWrite !== content) {
    validation = validateWorkflowDefinitionJsonSource(ctx, toWrite);
  }
  return validation;
}
async function editJsonFile(args) {
  if (args.oldString === args.newString) {
    return { error: "No changes to apply: old_string and new_string are identical." };
  }
  const path2 = resolveWorkflowSourceFilePathForContext(args.ctx, args.fileName);
  const editResult = await withFileLock(path2, async () => {
    if (args.oldString === "") {
      const contentOld2 = await readTextFileIfExists(path2) ?? "";
      const validation3 = await args.persist(args.ctx, path2, args.newString);
      return {
        written: true,
        file: args.fileName,
        workflowSourceDir: workflowSourceFolderHint(args.ctx.workflowId, args.ctx.sourceDir),
        action: contentOld2 ? "modify" : "create",
        content: args.newString,
        validation: validation3
      };
    }
    const stats = await import_fs5.promises.stat(path2).catch(() => null);
    if (!stats?.isFile()) {
      return { error: `File not found: ${args.fileName}` };
    }
    const contentOld = await import_fs5.promises.readFile(path2, "utf-8");
    const ending = detectLineEnding(contentOld);
    const old = convertToLineEnding(normalizeLineEndings(args.oldString), ending);
    const replacement = convertToLineEnding(normalizeLineEndings(args.newString), ending);
    const contentNew = replace(contentOld, old, replacement, args.replaceAll);
    const validation2 = await args.persist(args.ctx, path2, contentNew);
    return {
      written: true,
      file: args.fileName,
      workflowSourceDir: workflowSourceFolderHint(args.ctx.workflowId, args.ctx.sourceDir),
      action: "modify",
      content: contentNew,
      validation: validation2
    };
  });
  if ("error" in editResult && editResult.error) {
    return editResult;
  }
  const validation = "validation" in editResult && editResult.validation ? editResult.validation : await args.persist(
    args.ctx,
    path2,
    "content" in editResult && typeof editResult.content === "string" ? editResult.content : args.newString
  );
  const { content: _content, validation: _validation, ...base } = editResult;
  return attachValidationMessage(base, validation);
}
async function readWorkflowDefinitionFile() {
  const ctx = validateContext();
  try {
    const path2 = resolveWorkflowSourceFilePathForContext(
      ctx,
      WORKFLOW_DEFINITION_JSON_FILENAME2
    );
    const content = await import_fs5.promises.readFile(path2, "utf-8");
    return {
      file: WORKFLOW_DEFINITION_JSON_FILENAME2,
      workflowSourceDir: workflowSourceFolderHint(ctx.workflowId, ctx.sourceDir),
      content
    };
  } catch (err) {
    return workflowSourceScopeError(err);
  }
}
async function writeWorkflowDefinitionFile(content) {
  const ctx = validateContext();
  try {
    const path2 = resolveWorkflowSourceFilePathForContext(
      ctx,
      WORKFLOW_DEFINITION_JSON_FILENAME2
    );
    const validation = await persistWorkflowBodyContent(ctx, path2, content);
    return attachValidationMessage(
      {
        written: true,
        file: WORKFLOW_DEFINITION_JSON_FILENAME2,
        workflowSourceDir: workflowSourceFolderHint(ctx.workflowId, ctx.sourceDir),
        content: validation.valid ? canonicalizeWorkflowBody(ctx, content) : content
      },
      validation
    );
  } catch (err) {
    return workflowSourceScopeError(err);
  }
}
async function editWorkflowDefinitionFile(oldString, newString, replaceAll) {
  const ctx = validateContext();
  try {
    return editJsonFile({
      ctx,
      fileName: WORKFLOW_DEFINITION_JSON_FILENAME2,
      oldString,
      newString,
      replaceAll,
      persist: persistWorkflowBodyContent
    });
  } catch (err) {
    return workflowSourceScopeError(err);
  }
}
async function readEntitiesDefinitionFile() {
  const ctx = validateContext();
  try {
    const { path: path2, raw, entities, parseErrors } = await readEntitiesArray(ctx);
    if (parseErrors.length > 0) {
      return {
        file: ENTITIES_DEFINITION_JSON_FILENAME2,
        workflowSourceDir: workflowSourceFolderHint(ctx.workflowId, ctx.sourceDir),
        content: raw,
        valid: false,
        validationErrors: parseErrors
      };
    }
    return {
      file: ENTITIES_DEFINITION_JSON_FILENAME2,
      workflowSourceDir: workflowSourceFolderHint(ctx.workflowId, ctx.sourceDir),
      content: raw.trim() ? serializeEntitiesDefinition(entities) : "[]\n",
      entities,
      valid: true
    };
  } catch (err) {
    return workflowSourceScopeError(err);
  }
}
async function writeEntitiesDefinitionFile(content) {
  const ctx = validateContext();
  try {
    const { path: path2 } = await readEntitiesArray(ctx);
    const parsed = safeParseEntitiesDefinitionJson(content);
    if (!parsed.success) {
      return attachValidationMessage(
        {
          written: false,
          file: ENTITIES_DEFINITION_JSON_FILENAME2,
          workflowSourceDir: workflowSourceFolderHint(ctx.workflowId, ctx.sourceDir)
        },
        { valid: false, errors: parsed.errors, warnings: [] }
      );
    }
    const saved = await persistEntitiesArray(ctx, path2, parsed.data);
    return entitiesResult(
      {
        written: true,
        file: ENTITIES_DEFINITION_JSON_FILENAME2,
        workflowSourceDir: workflowSourceFolderHint(ctx.workflowId, ctx.sourceDir)
      },
      saved.entities,
      saved.content,
      saved.validation
    );
  } catch (err) {
    return workflowSourceScopeError(err);
  }
}
async function editEntitiesDefinitionFile(oldString, newString, replaceAll) {
  const ctx = validateContext();
  try {
    const result = await editJsonFile({
      ctx,
      fileName: ENTITIES_DEFINITION_JSON_FILENAME2,
      oldString,
      newString,
      replaceAll,
      persist: async (innerCtx, path2, content2) => {
        const parsed = safeParseEntitiesDefinitionJson(content2);
        if (!parsed.success) {
          await import_fs5.promises.writeFile(path2, content2, "utf-8");
          return { valid: false, errors: parsed.errors, warnings: [] };
        }
        const saved = await persistEntitiesArray(innerCtx, path2, parsed.data);
        return saved.validation;
      }
    });
    if ("error" in result && result.error) {
      return result;
    }
    const { raw, entities, parseErrors } = await readEntitiesArray(ctx);
    const content = parseErrors.length === 0 ? serializeEntitiesDefinition(entities) : raw;
    return {
      ...result,
      entities,
      content
    };
  } catch (err) {
    return workflowSourceScopeError(err);
  }
}
async function listWorkflowFiles() {
  const ctx = validateContext();
  const dir = workflowSourceFolderHint(ctx.workflowId, ctx.sourceDir);
  const entries = [];
  for (const file of WORKFLOW_COMPILER_ALLOWED_FILES) {
    const abs = resolveWorkflowSourceFilePathForContext(ctx, file);
    const exists = await import_fs5.promises.stat(abs).then((s) => s.isFile()).catch(() => false);
    entries.push({ path: file, exists });
  }
  return {
    workflowSourceDir: dir,
    allowedFiles: [...WORKFLOW_COMPILER_ALLOWED_FILES],
    files: entries
  };
}

// skills/workflow-compiler/actions/list-workflow-files.ts
var listWorkflowFilesTool = {
  name: "list_workflow_files",
  description: "List workflow_definition.json and entities_definition.json and whether each exists in the workflow source folder.",
  execute: async () => listWorkflowFiles()
};

// skills/workflow-compiler/actions/read-workflow-definition.ts
var readWorkflowDefinition = {
  name: "read_workflow_definition",
  description: "Read workflow_definition.json (triggers, steps, executor \u2014 no entities) from this workflow folder.",
  execute: async () => readWorkflowDefinitionFile()
};

// skills/workflow-compiler/actions/write-workflow-definition.ts
var writeWorkflowDefinition = {
  name: "write_workflow_definition",
  description: "Write full workflow_definition.json contents. Runs schema validation after save; fix validationErrors if returned.",
  inputSchema: {
    type: "object",
    properties: {
      content: { type: "string", description: "Full workflow_definition.json body" }
    },
    required: ["content"]
  },
  execute: async (input) => writeWorkflowDefinitionFile(String(input.content ?? ""))
};

// skills/workflow-compiler/actions/edit-workflow-definition.ts
var editWorkflowDefinition = {
  name: "edit_workflow_definition",
  description: "Search/replace edit in workflow_definition.json. Runs validation after save; fix validationErrors if returned.",
  inputSchema: {
    type: "object",
    properties: {
      old_string: { type: "string" },
      new_string: { type: "string" },
      replace_all: { type: "boolean" }
    },
    required: ["old_string", "new_string"]
  },
  execute: async (input) => editWorkflowDefinitionFile(
    String(input.old_string ?? ""),
    String(input.new_string ?? ""),
    Boolean(input.replace_all)
  )
};

// skills/workflow-compiler/actions/read-entities-definition.ts
var readEntitiesDefinition = {
  name: "read_entities_definition",
  description: "Read entities_definition.json (business entity array) from this workflow folder. Returns entities and canonical JSON content.",
  execute: async () => readEntitiesDefinitionFile()
};

// skills/workflow-compiler/actions/write-entities-definition.ts
var writeEntitiesDefinition = {
  name: "write_entities_definition",
  description: "Write full entities_definition.json (JSON array of entities). Returns entities and canonical content; fix validationErrors if returned.",
  inputSchema: {
    type: "object",
    properties: {
      content: { type: "string", description: "Full entities_definition.json body (JSON array)" }
    },
    required: ["content"]
  },
  execute: async (input) => writeEntitiesDefinitionFile(String(input.content ?? ""))
};

// skills/workflow-compiler/actions/edit-entities-definition.ts
var editEntitiesDefinition = {
  name: "edit_entities_definition",
  description: "Search/replace edit in entities_definition.json. Returns entities and canonical content after save.",
  inputSchema: {
    type: "object",
    properties: {
      old_string: { type: "string" },
      new_string: { type: "string" },
      replace_all: { type: "boolean" }
    },
    required: ["old_string", "new_string"]
  },
  execute: async (input) => editEntitiesDefinitionFile(
    String(input.old_string ?? ""),
    String(input.new_string ?? ""),
    Boolean(input.replace_all)
  )
};

// skills/workflow-compiler/actions/lib/entity-field-mutations.ts
var import_fs6 = require("fs");
function validateContext2() {
  const ctx = requireWorkflowCompileContext();
  return {
    workflowId: ctx.workflowId,
    workflowName: ctx.workflowName,
    knownTools: ctx.knownTools,
    sourceDir: ctx.sourceDir
  };
}
async function loadEntities() {
  const ctx = validateContext2();
  const path2 = resolveWorkflowSourceFilePathForContext(
    ctx,
    ENTITIES_DEFINITION_JSON_FILENAME2
  );
  const raw = await readTextFileIfExists(path2) ?? "[]";
  let entities = [];
  try {
    entities = raw.trim() ? parseWorkflowEntities(JSON.parse(raw)) : [];
  } catch {
    entities = [];
  }
  return { ctx, path: path2, entities };
}
async function saveEntities(ctx, path2, entities) {
  const content = serializeEntitiesDefinition(entities);
  await import_fs6.promises.writeFile(path2, content, "utf-8");
  const validation = validateEntitiesDefinitionJsonSource(ctx, content);
  return { content, validation, entities: parseWorkflowEntities(JSON.parse(content)) };
}
function findEntity(entities, entityId) {
  return entities.find((e) => e.id === entityId);
}
async function addEntityField(args) {
  const entityId = String(args.entity_id ?? "").trim();
  if (!entityId) {
    return { error: "entity_id is required" };
  }
  let field;
  try {
    field = parseWorkflowEntityField(args.field);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Invalid field object"
    };
  }
  const { ctx, path: path2, entities } = await loadEntities();
  let entity = findEntity(entities, entityId);
  if (!entity) {
    const name = String(args.entity_name ?? entityId).trim() || entityId;
    entity = {
      id: entityId,
      name,
      description: args.entity_description?.trim() || void 0,
      fields: []
    };
    entities.push(entity);
  }
  if (entity.fields.some((f) => f.key === field.key)) {
    return { error: `Field "${field.key}" already exists on entity "${entityId}"` };
  }
  entity.fields.push(field);
  const saved = await saveEntities(ctx, path2, entities);
  return attachValidationMessage(
    {
      written: true,
      action: "add_entity_field",
      file: ENTITIES_DEFINITION_JSON_FILENAME2,
      workflowSourceDir: workflowSourceFolderHint(ctx.workflowId, ctx.sourceDir),
      entity_id: entityId,
      field_key: field.key,
      entities: saved.entities,
      content: saved.content
    },
    saved.validation
  );
}
async function updateEntityField(args) {
  const entityId = String(args.entity_id ?? "").trim();
  const fieldKey = String(args.field_key ?? "").trim();
  if (!entityId || !fieldKey) {
    return { error: "entity_id and field_key are required" };
  }
  let field;
  try {
    field = parseWorkflowEntityField(args.field);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Invalid field object"
    };
  }
  const { ctx, path: path2, entities } = await loadEntities();
  const entity = findEntity(entities, entityId);
  if (!entity) {
    return { error: `Entity not found: ${entityId}` };
  }
  const index = entity.fields.findIndex((f) => f.key === fieldKey);
  if (index < 0) {
    return { error: `Field not found: ${fieldKey} on entity ${entityId}` };
  }
  entity.fields[index] = { ...field, key: fieldKey };
  const saved = await saveEntities(ctx, path2, entities);
  return attachValidationMessage(
    {
      written: true,
      action: "update_entity_field",
      file: ENTITIES_DEFINITION_JSON_FILENAME2,
      workflowSourceDir: workflowSourceFolderHint(ctx.workflowId, ctx.sourceDir),
      entity_id: entityId,
      field_key: fieldKey,
      entities: saved.entities,
      content: saved.content
    },
    saved.validation
  );
}
async function deleteEntityField(args) {
  const entityId = String(args.entity_id ?? "").trim();
  const fieldKey = String(args.field_key ?? "").trim();
  if (!entityId || !fieldKey) {
    return { error: "entity_id and field_key are required" };
  }
  const { ctx, path: path2, entities } = await loadEntities();
  const entity = findEntity(entities, entityId);
  if (!entity) {
    return { error: `Entity not found: ${entityId}` };
  }
  const nextFields = entity.fields.filter((f) => f.key !== fieldKey);
  if (nextFields.length === entity.fields.length) {
    return { error: `Field not found: ${fieldKey} on entity ${entityId}` };
  }
  if (nextFields.length === 0) {
    const withoutEntity = entities.filter((e) => e.id !== entityId);
    const saved2 = await saveEntities(ctx, path2, withoutEntity);
    return attachValidationMessage(
      {
        written: true,
        action: "delete_entity_field",
        file: ENTITIES_DEFINITION_JSON_FILENAME2,
        workflowSourceDir: workflowSourceFolderHint(ctx.workflowId, ctx.sourceDir),
        entity_id: entityId,
        field_key: fieldKey,
        removed_entity: true,
        entities: saved2.entities,
        content: saved2.content
      },
      saved2.validation
    );
  }
  entity.fields = nextFields;
  const saved = await saveEntities(ctx, path2, entities);
  return attachValidationMessage(
    {
      written: true,
      action: "delete_entity_field",
      file: ENTITIES_DEFINITION_JSON_FILENAME2,
      workflowSourceDir: workflowSourceFolderHint(ctx.workflowId, ctx.sourceDir),
      entity_id: entityId,
      field_key: fieldKey,
      entities: saved.entities,
      content: saved.content
    },
    saved.validation
  );
}

// skills/workflow-compiler/actions/add-entity-field.ts
var addEntityFieldTool = {
  name: "add_entity_field",
  description: "Add a field to an entity in entities_definition.json. Creates the entity if missing. Returns updated entities array and canonical JSON.",
  inputSchema: {
    type: "object",
    properties: {
      entity_id: { type: "string", description: "Entity id (e.g. customer)" },
      field: {
        type: "object",
        description: "WorkflowEntityField object (key, label, type, source, etc.)"
      },
      entity_name: { type: "string", description: "Name when creating a new entity" },
      entity_description: { type: "string" }
    },
    required: ["entity_id", "field"]
  },
  execute: async (input) => addEntityField({
    entity_id: String(input.entity_id ?? ""),
    field: input.field,
    entity_name: input.entity_name != null ? String(input.entity_name) : void 0,
    entity_description: input.entity_description != null ? String(input.entity_description) : void 0
  })
};

// skills/workflow-compiler/actions/update-entity-field.ts
var updateEntityFieldTool = {
  name: "update_entity_field",
  description: "Update an existing field on an entity in entities_definition.json. Returns updated entities array and canonical JSON.",
  inputSchema: {
    type: "object",
    properties: {
      entity_id: { type: "string" },
      field_key: { type: "string", description: "Existing field key to replace" },
      field: { type: "object", description: "Updated WorkflowEntityField object" }
    },
    required: ["entity_id", "field_key", "field"]
  },
  execute: async (input) => updateEntityField({
    entity_id: String(input.entity_id ?? ""),
    field_key: String(input.field_key ?? ""),
    field: input.field
  })
};

// skills/workflow-compiler/actions/delete-entity-field.ts
var deleteEntityFieldTool = {
  name: "delete_entity_field",
  description: "Delete a field from an entity in entities_definition.json. Removes the entity if it has no fields left. Returns updated entities array and canonical JSON.",
  inputSchema: {
    type: "object",
    properties: {
      entity_id: { type: "string" },
      field_key: { type: "string" }
    },
    required: ["entity_id", "field_key"]
  },
  execute: async (input) => deleteEntityField({
    entity_id: String(input.entity_id ?? ""),
    field_key: String(input.field_key ?? "")
  })
};

// skills/workflow-compiler/actions/index.ts
var tools = [
  listWorkflowFilesTool,
  readWorkflowDefinition,
  writeWorkflowDefinition,
  editWorkflowDefinition,
  readEntitiesDefinition,
  writeEntitiesDefinition,
  editEntitiesDefinition,
  addEntityFieldTool,
  updateEntityFieldTool,
  deleteEntityFieldTool
];
var index_default = { tools };
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  addEntityFieldTool,
  deleteEntityFieldTool,
  editEntitiesDefinition,
  editWorkflowDefinition,
  listWorkflowFilesTool,
  readEntitiesDefinition,
  readWorkflowDefinition,
  tools,
  updateEntityFieldTool,
  writeEntitiesDefinition,
  writeWorkflowDefinition
});
