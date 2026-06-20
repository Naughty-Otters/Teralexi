# Test Coverage Analysis Report

## src/shared Files Below 90% Threshold

---

## Executive Summary

| File                           | Functions      | Lines          | Status      | Priority |
| ------------------------------ | -------------- | -------------- | ----------- | -------- |
| **registry-config-mapper.ts**  | 83.33% (15/18) | 88.76% (79/89) | ❌ CRITICAL | High     |
| **limit-persisted-content.ts** | 100% (10/10)   | 81.67% (49/60) | ❌ CRITICAL | High     |
| **workflow-panel-skills.ts**   | 100% (2/2)     | 100% (9/9)     | ✅ PASS     | -        |
| **prepare-markdown-source.ts** | 100% (8/8)     | 93.88% (46/49) | ⚠️ CLOSE    | Medium   |
| **locale-settings.ts**         | 83.33% (5/6)   | 92.86% (13/14) | ⚠️ CLOSE    | Low      |
| **editor-settings.ts**         | 100% (3/3)     | 92.31% (12/13) | ⚠️ CLOSE    | Low      |

**Total Estimated Effort:** 7-9 hours

---

## 1. registry-config-mapper.ts

**Path:** `src/shared/mcp/registry-config-mapper.ts`  
**Test File:** `src/shared/mcp/registry-config-mapper.test.ts`

### Current Metrics

- **Function Coverage:** 15/18 (83.33%) - **3 uncovered functions**
- **Line Coverage:** 79/89 (88.76%) - **10 uncovered lines**
- **Branch Coverage:** 77/126 (61.11%) - Many conditional paths untested

### Uncovered Functions (Never Called)

#### 1. `(anonymous_8)` - Environment variable mapping

- **Location:** Line 188 in `draftFromPackage`
- **What it does:** Maps `environmentVariables` array in non-stdio packages
- **Why untested:** The test only covers stdio packages
- **Test needed:** "builds http draft with environment variables"
  ```typescript
  const drafts = listRegistryServerDrafts({
    server: {
      name: 'test/server',
      packages: [
        {
          transport: { type: 'http', url: 'https://example.com' },
          identifier: 'pkg',
          environmentVariables: [{ name: 'API_KEY', isRequired: true }],
        },
      ],
    },
  })
  // Verify envTemplate is populated
  ```

#### 2. `(anonymous_13)` - Transport type filter

- **Location:** Line 266 in `pickPreferredRegistryDraft`
- **What it does:** Filters drafts by preferred transport type
- **Why untested:** Test doesn't pass `preferredTransport` argument
- **Test needed:** "respects preferred transport parameter"
  ```typescript
  const drafts = [...] // mixed transports
  const preferred = pickPreferredRegistryDraft(drafts, 'sse')
  expect(preferred?.transportType).toBe('sse')
  ```

#### 3. `(anonymous_15)` - HTTP fallback filter

- **Location:** Line 273 in `pickPreferredRegistryDraft`
- **What it does:** Returns HTTP draft as fallback
- **Why untested:** Test only checks stdio preference, not HTTP fallback
- **Test needed:** "falls back to http when stdio unavailable"
  ```typescript
  const preferred = pickPreferredRegistryDraft([
    { transportType: 'sse', ... },
    { transportType: 'http', ... }
  ])
  expect(preferred?.transportType).toBe('http')
  ```

### Uncovered Lines (Conditional Branches)

| Line    | Condition                                       | Coverage   | Test Needed                         |
| ------- | ----------------------------------------------- | ---------- | ----------------------------------- |
| 49-53   | `mapRegistryTransportType` null returns         | 0 branches | Unknown/null transport type         |
| 100-103 | Empty version fallback in dedupeRegistryEntries | 0 branches | Two entries with same empty version |
| 148     | Package without transport type                  | 0 branches | Package with missing transport      |
| 179-182 | Remote without headers/url                      | 0 branches | Remote with missing properties      |
| 266-276 | Empty drafts array in pickPreferred             | 0 branches | Empty array parameter               |

### Missing Test Cases (Ordered by Impact)

**High Impact:**

1. ✅ "picks sse draft when preferred" - Test preferredTransport='sse'
2. ✅ "falls back to http without stdio" - No stdio, has http
3. ✅ "returns first draft as last fallback" - No stdio/http
4. ✅ "handles package with http transport and envvars" - Covers anonymous_8

**Medium Impact:** 5. "dedupes entries with same empty version" - Version comparison edge 6. "skips entries with empty server name" - Empty name handling 7. "builds draft from remote without headers" - Remote with no headers 8. "handles unknown transport type" - Unmapped transport

### Recommended Test Additions

```typescript
// 1. Test preferredTransport parameter
it('picks sse draft when preferred', () => {
  const drafts = [
    { transportType: 'stdio', ... },
    { transportType: 'sse', ... },
    { transportType: 'http', ... }
  ]
  const preferred = pickPreferredRegistryDraft(drafts, 'sse')
  expect(preferred?.transportType).toBe('sse')
})

// 2. Test http fallback
it('falls back to http when stdio unavailable', () => {
  const preferred = pickPreferredRegistryDraft([
    { transportType: 'sse', ... },
    { transportType: 'http', ... }
  ])
  expect(preferred?.transportType).toBe('http')
})

// 3. Test http package with envvars
it('builds http draft from package with environment variables', () => {
  const drafts = listRegistryServerDrafts({
    server: {
      name: 'pkg/http',
      packages: [{
        transport: { type: 'http', url: 'https://api.example.com' },
        identifier: 'pkg',
        environmentVariables: [{
          name: 'AUTH_TOKEN',
          isRequired: true
        }]
      }]
    }
  })
  expect(drafts[0]?.envTemplate).toHaveLength(1)
})

// 4. Test empty version deduplication
it('dedupes entries with same empty version', () => {
  const entries = dedupeRegistryEntries([
    { server: { name: 'pkg', version: '' } },
    { server: { name: 'pkg', version: '' } }
  ])
  expect(entries).toHaveLength(1)
})
```

**Estimated Effort:** 2-3 hours (6-8 test cases)

---

## 2. limit-persisted-content.ts

**Path:** `src/shared/persistence/limit-persisted-content.ts`  
**Test File:** `src/shared/persistence/limit-persisted-content.test.ts`

### Current Metrics

- **Function Coverage:** 10/10 (100%) - All functions called
- **Line Coverage:** 49/60 (81.67%) - **11 uncovered lines**
- **Branch Coverage:** 29/46 (63.04%) - Many error paths untested

### Uncovered Lines Analysis

| Line(s) | Code                                          | Coverage | Issue                             |
| ------- | --------------------------------------------- | -------- | --------------------------------- |
| 85, 88  | shrinkStructuredToFit when json.length <= max | 0%       | Never reaches shrink logic        |
| 91-95   | Pipeline removal loop body                    | 0%       | Empty/missing pipeline not tested |
| 105-109 | Fallback when shrink fails                    | 0%       | Extreme size scenarios untested   |
| 143     | isStructuredPersistShape validation           | 0%       | Outer field existence checks      |

### Critical Missing Coverage

#### Issue 1: shrinkStructuredToFit Empty Pipeline Path

**Lines:** 91-95 (The while loop that pops turns)

```typescript
// Current code
const pipeline = outer?.pipelineConversation
if (!Array.isArray(pipeline) || pipeline.length === 0) {
  return limitTextForStorage(json) // ← Line 88 branch: NEVER TAKEN in tests
}
```

**Problem:** All test payloads have pipelines. When pipeline is empty or missing, the function takes early exit that's untested.

**Test case needed:**

```typescript
it('handles structured payload with empty pipeline', () => {
  const payload = {
    version: 2,
    assistantContent: {
      outer: {
        finalResult: 'x'.repeat(200000),
        pipelineConversation: [], // ← Empty pipeline
      },
      subSteps: [],
    },
  }
  const limited = limitMessageContentForPersistence(
    JSON.stringify(payload),
    'assistant',
  )
  expect(limited.length).toBeLessThanOrEqual(
    PERSISTED_MESSAGE_CONTENT_MAX_CHARS,
  )
})
```

#### Issue 2: shrinkStructuredToFit Loop Never Completes

**Lines:** 105-109 (After while loop)

```typescript
  while (turns.length > 0) {
    turns.pop()
    working = limitStructuredShape(...)
    const next = JSON.stringify(working)
    if (next.length <= PERSISTED_MESSAGE_CONTENT_MAX_CHARS) return next
  }
  // ← Lines 105-109: Fallback when loop can't reduce below max
  return limitTextForStorage(json)
```

**Problem:** Test payload is large but always becomes small after field truncation. Never tests the scenario where even after removing ALL pipeline turns, size is still too large.

**Test case needed:**

```typescript
it('falls back to text truncation when shrink loop exhausted', () => {
  // Create a payload that won't shrink enough
  const hugeOuter = {
    finalResult: 'x'.repeat(PERSISTED_MESSAGE_CONTENT_MAX_CHARS),
    report: 'y'.repeat(PERSISTED_MESSAGE_CONTENT_MAX_CHARS),
    pipelineConversation: [{ content: 'z'.repeat(1000) }],
  }
  const payload = {
    version: 2,
    assistantContent: { outer: hugeOuter, subSteps: [] },
  }
  const limited = limitMessageContentForPersistence(
    JSON.stringify(payload),
    'assistant',
  )
  expect(limited.length).toBeLessThanOrEqual(
    PERSISTED_MESSAGE_CONTENT_MAX_CHARS,
  )
})
```

#### Issue 3: Missing Nested Object Handling

**Lines:** 43-46, 54-60 (Map callbacks for stepCaptures and pipeline)

**Problem:** Current tests don't cover:

- Pipeline turn with null/undefined content
- stepCaptures with missing content property
- Nested objects that are not plain objects

**Test case needed:**

```typescript
it('handles pipeline turns with missing content fields', () => {
  const payload = {
    version: 2,
    assistantContent: {
      outer: {
        pipelineConversation: [
          { sectionId: 'test' }, // ← No content field
          { content: 'x'.repeat(500) },
          { content: null }, // ← Null content
        ],
      },
      subSteps: [],
    },
  }
  const limited = limitMessageContentForPersistence(
    JSON.stringify(payload),
    'assistant',
  )
  expect(limited.length).toBeLessThanOrEqual(
    PERSISTED_MESSAGE_CONTENT_MAX_CHARS,
  )
})
```

### Recommended Test Additions

```typescript
describe('limitPersistedStepText', () => {
  it('handles empty assistant payload', () => {
    const payload = {
      version: 2,
      assistantContent: {
        outer: {
          finalResult: 'x'.repeat(500),
          pipelineConversation: [],
        },
        subSteps: [],
      },
    }
    const limited = limitMessageContentForPersistence(
      JSON.stringify(payload),
      'assistant',
    )
    expect(limited.length).toBeLessThanOrEqual(
      PERSISTED_MESSAGE_CONTENT_MAX_CHARS,
    )
  })

  it('shrinks payload with only outer fields (no pipeline)', () => {
    const payload = {
      version: 2,
      assistantContent: {
        outer: {
          finalResult: 'x'.repeat(200000),
          report: 'y'.repeat(200000),
        },
        subSteps: [{ content: 'z'.repeat(200000) }],
      },
    }
    const limited = limitMessageContentForPersistence(
      JSON.stringify(payload),
      'assistant',
    )
    expect(limited.length).toBeLessThanOrEqual(
      PERSISTED_MESSAGE_CONTENT_MAX_CHARS,
    )
    const parsed = JSON.parse(limited)
    expect(parsed.assistantContent.outer.finalResult).toContain(
      HEAD_TAIL_OMISSION,
    )
  })

  it('handles malformed pipeline entries', () => {
    const payload = {
      version: 2,
      assistantContent: {
        outer: {
          pipelineConversation: [
            { stepId: 'test' }, // Missing content
            { content: 'x'.repeat(300) },
            { content: null },
            { content: undefined },
          ],
        },
        subSteps: [],
      },
    }
    const limited = limitMessageContentForPersistence(
      JSON.stringify(payload),
      'assistant',
    )
    expect(limited.length).toBeLessThanOrEqual(
      PERSISTED_MESSAGE_CONTENT_MAX_CHARS,
    )
  })

  it('falls back to truncation when maximum shrinking insufficient', () => {
    // Extreme case: payload that's mostly untrimmable outer content
    const huge = 'x'.repeat(
      Math.floor(PERSISTED_MESSAGE_CONTENT_MAX_CHARS * 0.8),
    )
    const payload = {
      version: 2,
      assistantContent: {
        outer: {
          finalResult: huge,
          report: huge,
          pipelineConversation: [{ content: 'y'.repeat(1000) }],
        },
        subSteps: [{ content: huge }],
      },
    }
    const limited = limitMessageContentForPersistence(
      JSON.stringify(payload),
      'assistant',
    )
    expect(limited.length).toBeLessThanOrEqual(
      PERSISTED_MESSAGE_CONTENT_MAX_CHARS,
    )
  })
})
```

**Estimated Effort:** 2 hours (4-5 test cases targeting uncovered paths)

---

## 3. locale-settings.ts

**Path:** `src/shared/i18n/locale-settings.ts`  
**Test File:** `src/shared/i18n/locale-settings.test.ts`

### Current Metrics

- **Function Coverage:** 5/6 (83.33%) - **1 uncovered function**
- **Line Coverage:** 13/14 (92.86%) - **1 uncovered line**
- **Branch Coverage:** 8/11 (72.73%)

### Uncovered Function

**`localeDisplayLabel`** (Line 41-42)

```typescript
export function localeDisplayLabel(locale: AppLocaleId): string {
  return LOCALE_BY_ID.get(locale)?.label ?? locale // ← Line 42: 0 hits
}
```

**Why untested:** Not exported or used in test file

**Test needed:**

```typescript
it('gets locale display label', () => {
  expect(localeDisplayLabel('en')).toBe('English')
  expect(localeDisplayLabel('zh-cn')).toBe('简体中文')
})
```

### Additional Branch Coverage Gaps

| Branch          | Condition               | Hit Count | Test Needed                |
| --------------- | ----------------------- | --------- | -------------------------- |
| Line 33, cond 2 | Empty string after trim | 0         | `normalizeAppLocale('  ')` |
| Line 51         | Empty agent override    | 2+        | Already covered            |

**Recommended Test Additions:**

```typescript
describe('locale-settings', () => {
  // Already covered:
  // - normalizeAppLocale, localeToResponseLanguage, resolveAgentResponseLanguage

  it('returns display label for valid locales', () => {
    expect(localeDisplayLabel('en')).toBe('English')
    expect(localeDisplayLabel('zh-cn')).toBe('简体中文')
  })

  it('returns locale id as-is if not found', () => {
    // This tests the fallback: locale ?? locale
    expect(localeDisplayLabel('fr' as AppLocaleId)).toBe('fr')
  })

  it('normalizes whitespace-only string to default', () => {
    expect(normalizeAppLocale('   ')).toBe(DEFAULT_APP_LOCALE)
  })
})
```

**Estimated Effort:** 0.5 hours (2-3 simple test cases)

---

## 4. prepare-markdown-source.ts

**Path:** `src/shared/markdown/prepare-markdown-source.ts`  
**Test File:** `src/shared/markdown/prepare-markdown-source.test.ts`

### Current Metrics

- **Function Coverage:** 8/8 (100%) - All functions called
- **Line Coverage:** 46/49 (93.88%) - **3 uncovered lines**
- **Branch Coverage:** 32/44 (72.73%)

### Uncovered Lines

| Line(s) | Code Branch                             | Coverage | Scenario               |
| ------- | --------------------------------------- | -------- | ---------------------- |
| 25      | `isProseFenceLang` when lang not in set | 0%       | Unsupported language   |
| 42      | `stripLeadingProseFence` invalid fence  | 0%       | Malformed fence syntax |
| 53      | `stripTrailingProseFence` no match      | 0%       | No closing fence       |

### Analysis of Missing Paths

#### Gap 1: isProseFenceLang Unsupported Language

**Line:** 25 (condition checking for unsupported langs)

```typescript
function isProseFenceLang(lang: string): boolean {
  const normalized = lang.trim().toLowerCase()
  if (PROSE_FENCE_LANGS.has(normalized)) return true
  if (normalized.startsWith('#')) return true
  return false // ← Line 25: Unsupported language - 0 hits
}
```

**Scenario:** Code fence like `\`\`\`javascript\n...\n\`\`\`` should NOT be unwrapped

**Test:**

````typescript
it('preserves non-prose language fences like javascript', () => {
  const source = '```javascript\nconst x = 1\n```'
  expect(unwrapOuterMarkdownFence(source)).toBe(source)
})
````

#### Gap 2: stripLeadingProseFence No Match

**Line:** 34-35 (when fence doesn't match pattern)

```typescript
const lines = trimmed.split('\n')
const firstLine = lines[0] ?? ''
const openMatch = firstLine.match(/^(`{3,}).../)
if (!openMatch) return source // ← Line 34: No regex match - rarely tested
```

**Scenario:** Malformed fence that looks like one but isn't

**Test:**

````typescript
it('handles malformed fence-like content', () => {
  const source = '`` not enough backticks\ncontent\n```'
  expect(stripLeadingProseFence(source)).toBe(source)
})
````

#### Gap 3: stripTrailingProseFence No Match

**Line:** 59 (when no trailing fence found)

```typescript
const trimmed = source.trimEnd()
const match = trimmed.match(/(\r?\n)?(`{3,})[ \t]*$/)
if (!match) return source // ← Line 59: No closing fence - 0 hits
```

**Test:**

```typescript
it('leaves content unchanged when no trailing fence', () => {
  const source = 'some content\nno fence here'
  expect(stripTrailingProseFence(source)).toBe(source)
})
```

### Recommended Test Additions

````typescript
describe('prepareMarkdownSource', () => {
  // Existing tests cover main paths...

  describe('edge case: language tags', () => {
    it('preserves code fences with language tags like python', () => {
      const source = '```python\nprint("hi")\n```'
      expect(unwrapOuterMarkdownFence(source)).toBe(source)
    })

    it('preserves code fences with language tags like javascript', () => {
      const source = '```javascript\nconst x = 1\n```'
      expect(unwrapOuterMarkdownFence(source)).toBe(source)
    })

    it('preserves code fences with language tags like json', () => {
      const source = '```json\n{"key": "value"}\n```'
      expect(unwrapOuterMarkdownFence(source)).toBe(source)
    })
  })

  describe('edge case: malformed fences', () => {
    it('handles content with no closing fence', () => {
      const source = 'some\n```markdown\nno closing fence'
      expect(stripTrailingProseFence(source)).toBe(source)
    })

    it('handles incomplete opening fence', () => {
      const source = '`` backticks only\ncontent'
      expect(stripLeadingProseFence(source)).toBe(source)
    })
  })

  describe('edge case: comment-like prose', () => {
    it('unwraps fence with comment-like prose', () => {
      const inner = '# Comment\nMore text'
      const fenced = `\`\`\`markdown\n${inner}\n\`\`\``
      expect(unwrapOuterMarkdownFence(fenced)).toBe(inner)
    })
  })
})
````

**Estimated Effort:** 1-1.5 hours (4-5 specific edge case tests)

---

## 5. editor-settings.ts

**Path:** `src/shared/editor/editor-settings.ts`  
**Test File:** `src/shared/editor/editor-settings.test.ts`

### Current Metrics

- **Function Coverage:** 3/3 (100%) - All functions called
- **Line Coverage:** 12/13 (92.31%) - **1 uncovered line**
- **Branch Coverage:** 17/20 (85%)

### Uncovered Lines

| Line | Code                         | Coverage | Scenario                 |
| ---- | ---------------------------- | -------- | ------------------------ |
| 30   | parseBoolean fallback return | 0 hits   | Invalid/unexpected value |

### Analysis

#### Gap: parseBoolean Invalid Values

**Line:** 30 (default fallback)

```typescript
function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') return true
  if (normalized === 'false' || normalized === '0') return false
  return fallback // ← Line 30: Invalid input - 0 hits in tests
}
```

**Current test only uses:** `'true'`, `'false'` ✓  
**Missing:** Any other value like `'invalid'`, `'yes'`, `'no'`, etc.

#### Gap: parsePositiveInt Zero/Negative

**Line:** 36 (returning fallback for non-positive)

```typescript
function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback // ← Not all branches hit
  return parsed
}
```

**Missing tests:**

- `'0'` → should return fallback
- `'-5'` → should return fallback
- `'1.5'` → should parse as `1`, still valid

### Recommended Test Additions

```typescript
describe('editor-settings', () => {
  describe('parseBoolean', () => {
    it('returns fallback for invalid values', () => {
      expect(parseBoolean('invalid', true)).toBe(true)
      expect(parseBoolean('yes', false)).toBe(false)
      expect(parseBoolean('no', true)).toBe(true)
    })

    it('handles whitespace-only strings', () => {
      expect(parseBoolean('   ', true)).toBe(true)
      expect(parseBoolean('\t', false)).toBe(false)
    })

    it('is case-insensitive', () => {
      expect(parseBoolean('TRUE', false)).toBe(true)
      expect(parseBoolean('False', true)).toBe(false)
    })
  })

  describe('parsePositiveInt', () => {
    it('returns fallback for zero and negative', () => {
      expect(parsePositiveInt('0', 99)).toBe(99)
      expect(parsePositiveInt('-5', 99)).toBe(99)
      expect(parsePositiveInt('-999', 1)).toBe(1)
    })

    it('returns fallback for non-integer', () => {
      expect(parsePositiveInt('1.5', 2)).toBe(2)
      expect(parsePositiveInt('NaN', 3)).toBe(3)
    })

    it('handles whitespace', () => {
      expect(parsePositiveInt('  42  ', 0)).toBe(42)
    })
  })

  describe('parseEditorSettings', () => {
    it('applies defaults for invalid values', () => {
      const parsed = parseEditorSettings({
        [EDITOR_SETTINGS_PROP_KEYS.formatOnSave]: 'invalid',
        [EDITOR_SETTINGS_PROP_KEYS.tabSize]: '0',
        [EDITOR_SETTINGS_PROP_KEYS.insertSpaces]: 'maybe',
        [EDITOR_SETTINGS_PROP_KEYS.eslintEnabled]: 'yes',
        [EDITOR_SETTINGS_PROP_KEYS.eslintDebounceMs]: '-100',
      })

      expect(parsed).toEqual(DEFAULT_EDITOR_SETTINGS)
    })
  })
})
```

**Estimated Effort:** 1 hour (4-5 targeted test cases)

---

## 6. workflow-panel-skills.ts ✅

**Path:** `src/shared/skills/workflow-panel-skills.ts`  
**Test File:** `src/shared/skills/workflow-panel-skills.test.ts`

### Current Metrics

- **Function Coverage:** 2/2 (100%) ✅
- **Line Coverage:** 9/9 (100%) ✅
- **Branch Coverage:** 2/4 (50%)

### Status

**PASSING ALL THRESHOLDS** - No additional tests needed for coverage, though branch coverage could be improved (50% → 100%).

**Optional enhancement:** Add test for `isWorkflowPanelAgentId` with non-trimmed empty string:

```typescript
it('handles empty agent id without trimming', () => {
  expect(isWorkflowPanelAgentId('   ')).toBe(false)
})
```

---

## Implementation Roadmap

### Phase 1: Critical Coverage (7-8 hours)

1. **registry-config-mapper.ts** (2-3 hrs)
   - Add 6-8 test cases for uncovered functions
   - Focus on `pickPreferredRegistryDraft` with transport preference
   - Cover HTTP package with environment variables

2. **limit-persisted-content.ts** (2 hrs)
   - Add 4-5 test cases for empty pipeline / shrink loop fallback
   - Test extreme size scenarios

### Phase 2: Close-Gap Coverage (2-3 hours)

3. **prepare-markdown-source.ts** (1-1.5 hrs)
   - Add 4-5 fence edge case tests
   - Test unsupported language tags

4. **editor-settings.ts** (1 hr)
   - Add 4-5 parser edge case tests
   - Test zero/negative/invalid values

5. **locale-settings.ts** (0.5 hrs)
   - Add `localeDisplayLabel` test
   - Test whitespace normalization

### Phase 3: Excellence (Optional)

6. **workflow-panel-skills.ts** - Already excellent
   - Consider optional branch coverage improvement

---

## Quick Reference: Files Ready for Testing

### Highest Priority (Missing Critical Paths)

```
src/shared/mcp/registry-config-mapper.test.ts
  → Add tests with preferredTransport parameter
  → Add tests for HTTP packages with envvars
  → Add tests for empty/missing pipeline

src/shared/persistence/limit-persisted-content.test.ts
  → Add tests for empty pipeline
  → Add tests for shrink loop exhaustion
  → Add tests for malformed pipeline entries
```

### Medium Priority (Almost There)

```
src/shared/markdown/prepare-markdown-source.test.ts
  → Add language tag preservation tests
  → Add malformed fence tests

src/shared/editor/editor-settings.test.ts
  → Add invalid value fallback tests
  → Add zero/negative integer tests
```

### Low Priority (Minor Gaps)

```
src/shared/i18n/locale-settings.test.ts
  → Add localeDisplayLabel test
```

---

## Success Criteria

✅ All files reach **90% function coverage**  
✅ All files reach **90% line coverage**  
✅ All public functions have at least one test  
✅ All conditional branches in exported functions tested

**Target completion:** 1-2 dev days
