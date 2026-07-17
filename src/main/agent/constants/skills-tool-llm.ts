/** LLM prompts for imperative {@link SkillsToolExecutionStep} and validation. Expression stages keep prompts in `expr/*-expr.ts`. */

export const SKILLS_TOOL_EXECUTION_LLM = {
  VERIFIER_SYSTEM: `You are a strict task-result verifier.
Judge the execution output against THIS STEP ONLY, using the step goal below (task name, description, success criteria).
Do not require that the full multi-step plan or overall project objective is finished — only whether this single step's output satisfies its step goal.
Return JSON only with shape: {"valid": boolean, "summary": "string"}.
If invalid, summary must explain what is missing or wrong for this step.
If valid, summary must briefly confirm how this step's requirements are met.`,
  VERIFIER_USER_PREFIX: 'Step goal (verify against this only):',
  VERIFIER_USER_EXECUTION_LABEL: 'Execution output:',
  EXECUTOR_BASE: `You are an expert executor. Execute this single step using available tools and return the result. Satisfy the step goal below — do not treat the overall project outcome as the bar for this step.`,
  PLAN_EXECUTION_DISCIPLINE: `Approved plan execution: complete only the current step goal, then stop. You may call update_todos only to change status on that assigned approved step — do not add, remove, rewrite steps, or update other steps' statuses. Call exit_plan_mode when leaving planning is appropriate. Do not call enter_plan_mode. Do not start work from other plan steps — reply with a brief summary when this step is done.`,
  EXECUTOR_STEP_GOAL_LABEL: 'Step goal:',
  EXECUTOR_ATTEMPT_LABEL: 'Attempt:',
  EXECUTOR_PREVIOUS_CONTEXT_LABEL: 'Previous attempt context:',
  EXECUTOR_RETRY_GUIDANCE:
    'Address the identified gaps and try a different approach.',
  REFERENCE_MATERIALS_HEADER: '=== REFERENCE MATERIALS ===',
  FORM_VALUES_HEADER: '=== USER-PROVIDED FORM VALUES ===',
  FORM_VALUES_FOOTER: '=== END OF USER-PROVIDED FORM VALUES ===',
  TOOL_RESULT_DECISION_RULES: ` ## Tool Result Decision Rules 
 If a tool returns JSON with \`"success": true\` and the task is satisfied, respond with a brief text summary only—do not call the same tool again with the same inputs. If the tool failed or the output is insufficient, use a different approach or tool.`,
  FORM_SUBMIT_FIRST_ATTEMPT:
    'The user has submitted form values above. Use these values as tool parameters to execute this step now.',
  FORM_SUBMIT_RETRY_ATTEMPT:
    'The user has submitted form values above. Use these values as tool parameters to execute this step (retry {attempt}/{maxAttempts}).',
  FORM_SUBMIT_PRIOR_ISSUES: 'Prior issues to address:',
  RETRY_STEP_USER_SUFFIX:
    'Address the issues and take a different approach if necessary.',
} as const

export function buildSkillsToolExecutorInstructions(args: {
  stepGoal: string
  attempt: number
  maxAttempts: number
  lastRetryContext: string
  previousStepBlock: string
  sandboxBlock: string
  referencesContent: string
}): string {
  const {
    stepGoal,
    attempt,
    maxAttempts,
    lastRetryContext,
    previousStepBlock,
    sandboxBlock,
    referencesContent,
  } = args

  let instructionsStr = `${SKILLS_TOOL_EXECUTION_LLM.EXECUTOR_BASE}

${SKILLS_TOOL_EXECUTION_LLM.EXECUTOR_STEP_GOAL_LABEL}
${stepGoal}

${SKILLS_TOOL_EXECUTION_LLM.EXECUTOR_ATTEMPT_LABEL} ${attempt}/${maxAttempts}`

  if (lastRetryContext) {
    instructionsStr += `

${SKILLS_TOOL_EXECUTION_LLM.EXECUTOR_PREVIOUS_CONTEXT_LABEL}
${lastRetryContext}

${SKILLS_TOOL_EXECUTION_LLM.EXECUTOR_RETRY_GUIDANCE}`
  }

  if (previousStepBlock) instructionsStr += `\n\n${previousStepBlock}`
  if (sandboxBlock) instructionsStr += `\n\n${sandboxBlock}`
  if (referencesContent.trim()) {
    instructionsStr += `\n\n${SKILLS_TOOL_EXECUTION_LLM.REFERENCE_MATERIALS_HEADER}\n${referencesContent}`
  }
  instructionsStr += `\n\n${SKILLS_TOOL_EXECUTION_LLM.TOOL_RESULT_DECISION_RULES}`
  return instructionsStr
}

export function buildFormSubmitExecutorDirective(
  stepGoal: string,
  attempt: number,
  maxAttempts: number,
  lastRetryContext: string,
): string {
  if (attempt === 1) {
    return `${SKILLS_TOOL_EXECUTION_LLM.FORM_SUBMIT_FIRST_ATTEMPT}\n\n${stepGoal}`
  }
  return `${SKILLS_TOOL_EXECUTION_LLM.FORM_SUBMIT_RETRY_ATTEMPT.replace('{attempt}', String(attempt)).replace('{maxAttempts}', String(maxAttempts))}\n\n${stepGoal}\n\n${SKILLS_TOOL_EXECUTION_LLM.FORM_SUBMIT_PRIOR_ISSUES}\n${lastRetryContext}`
}
