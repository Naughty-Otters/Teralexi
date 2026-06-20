import type Database from 'better-sqlite3'
import type {
  StoredWorkflow,
  StoredWorkflowDeployment,
  StoredWorkflowStatus,
  StoredWorkflowTrigger,
  StoredWorkflowVersion,
} from './types'

type WorkflowRow = {
  id: string
  user_id: string
  name: string
  description: string
  status: string
  current_version_id: string | null
  created_at: string
  updated_at: string
}

type WorkflowVersionRow = {
  id: string
  workflow_id: string
  version_number: number
  definition_json: string
  mermaid: string
  summary_markdown: string
  compiler_metadata_json: string
  created_at: string
}

type WorkflowDeploymentRow = {
  id: string
  workflow_id: string
  version_id: string
  user_id: string
  target: string
  enabled: number
  config_json: string
  last_run_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

type WorkflowTriggerRow = {
  id: string
  workflow_id: string
  deployment_id: string | null
  trigger_type: string
  config_json: string
  enabled: number
  created_at: string
  updated_at: string
}

function mapWorkflow(row: WorkflowRow): StoredWorkflow {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    status: row.status as StoredWorkflowStatus,
    currentVersionId: row.current_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapVersion(row: WorkflowVersionRow): StoredWorkflowVersion {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    versionNumber: row.version_number,
    definitionJson: row.definition_json,
    mermaid: row.mermaid,
    summaryMarkdown: row.summary_markdown,
    compilerMetadataJson: row.compiler_metadata_json,
    createdAt: row.created_at,
  }
}

function mapDeployment(row: WorkflowDeploymentRow): StoredWorkflowDeployment {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    versionId: row.version_id,
    userId: row.user_id,
    target: row.target as StoredWorkflowDeployment['target'],
    enabled: row.enabled !== 0,
    configJson: row.config_json,
    lastRunAt: row.last_run_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapTrigger(row: WorkflowTriggerRow): StoredWorkflowTrigger {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    deploymentId: row.deployment_id,
    triggerType: row.trigger_type,
    configJson: row.config_json,
    enabled: row.enabled !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class WorkflowsRepository {
  constructor(private readonly db: Database.Database) {}

  list(userId: string): StoredWorkflow[] {
    const rows = this.db
      .prepare(
        `SELECT id, user_id, name, description, status, current_version_id, created_at, updated_at
         FROM workflows WHERE user_id = ? ORDER BY updated_at DESC`,
      )
      .all(userId) as WorkflowRow[]
    return rows.map(mapWorkflow)
  }

  get(workflowId: string): StoredWorkflow | null {
    const row = this.db
      .prepare(
        `SELECT id, user_id, name, description, status, current_version_id, created_at, updated_at
         FROM workflows WHERE id = ?`,
      )
      .get(workflowId) as WorkflowRow | undefined
    return row ? mapWorkflow(row) : null
  }

  upsert(
    workflow: Omit<StoredWorkflow, 'createdAt' | 'updatedAt'> & {
      createdAt?: string
    },
  ): StoredWorkflow {
    const now = new Date().toISOString()
    const createdAt = workflow.createdAt ?? now
    this.db
      .prepare(
        `INSERT INTO workflows (
          id, user_id, name, description, status, current_version_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          user_id = excluded.user_id,
          name = excluded.name,
          description = excluded.description,
          status = excluded.status,
          current_version_id = excluded.current_version_id,
          updated_at = excluded.updated_at`,
      )
      .run(
        workflow.id,
        workflow.userId,
        workflow.name,
        workflow.description,
        workflow.status,
        workflow.currentVersionId,
        createdAt,
        now,
      )
    return { ...workflow, createdAt, updatedAt: now }
  }

  delete(userId: string, workflowId: string): void {
    this.db
      .prepare('DELETE FROM workflows WHERE user_id = ? AND id = ?')
      .run(userId, workflowId)
  }

  insertVersion(
    version: Omit<StoredWorkflowVersion, 'createdAt'>,
  ): StoredWorkflowVersion {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO workflow_versions (
          id, workflow_id, version_number, definition_json, mermaid,
          summary_markdown, compiler_metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        version.id,
        version.workflowId,
        version.versionNumber,
        version.definitionJson,
        version.mermaid,
        version.summaryMarkdown,
        version.compilerMetadataJson,
        now,
      )
    return { ...version, createdAt: now }
  }

  getVersion(versionId: string): StoredWorkflowVersion | null {
    const row = this.db
      .prepare(
        `SELECT id, workflow_id, version_number, definition_json, mermaid,
                summary_markdown, compiler_metadata_json, created_at
         FROM workflow_versions WHERE id = ?`,
      )
      .get(versionId) as WorkflowVersionRow | undefined
    return row ? mapVersion(row) : null
  }

  listVersions(workflowId: string): StoredWorkflowVersion[] {
    const rows = this.db
      .prepare(
        `SELECT id, workflow_id, version_number, definition_json, mermaid,
                summary_markdown, compiler_metadata_json, created_at
         FROM workflow_versions WHERE workflow_id = ? ORDER BY version_number DESC`,
      )
      .all(workflowId) as WorkflowVersionRow[]
    return rows.map(mapVersion)
  }

  nextVersionNumber(workflowId: string): number {
    const row = this.db
      .prepare(
        'SELECT COALESCE(MAX(version_number), 0) AS max_version FROM workflow_versions WHERE workflow_id = ?',
      )
      .get(workflowId) as { max_version: number }
    return (row?.max_version ?? 0) + 1
  }

  upsertDeployment(
    deployment: Omit<
      StoredWorkflowDeployment,
      'createdAt' | 'updatedAt' | 'lastRunAt' | 'lastError'
    > & {
      lastRunAt?: string | null
      lastError?: string | null
    },
  ): StoredWorkflowDeployment {
    const now = new Date().toISOString()
    this.db
      .prepare(
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
          updated_at = excluded.updated_at`,
      )
      .run(
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
        now,
      )
    return {
      ...deployment,
      lastRunAt: deployment.lastRunAt ?? null,
      lastError: deployment.lastError ?? null,
      createdAt: now,
      updatedAt: now,
    }
  }

  getDeployment(deploymentId: string): StoredWorkflowDeployment | null {
    const row = this.db
      .prepare(
        `SELECT id, workflow_id, version_id, user_id, target, enabled, config_json,
                last_run_at, last_error, created_at, updated_at
         FROM workflow_deployments WHERE id = ?`,
      )
      .get(deploymentId) as WorkflowDeploymentRow | undefined
    return row ? mapDeployment(row) : null
  }

  listDeployments(workflowId: string): StoredWorkflowDeployment[] {
    const rows = this.db
      .prepare(
        `SELECT id, workflow_id, version_id, user_id, target, enabled, config_json,
                last_run_at, last_error, created_at, updated_at
         FROM workflow_deployments WHERE workflow_id = ? ORDER BY updated_at DESC`,
      )
      .all(workflowId) as WorkflowDeploymentRow[]
    return rows.map(mapDeployment)
  }

  listEnabledLocalDeployments(userId: string): StoredWorkflowDeployment[] {
    const rows = this.db
      .prepare(
        `SELECT id, workflow_id, version_id, user_id, target, enabled, config_json,
                last_run_at, last_error, created_at, updated_at
         FROM workflow_deployments
         WHERE user_id = ? AND target = 'local' AND enabled = 1
         ORDER BY updated_at DESC`,
      )
      .all(userId) as WorkflowDeploymentRow[]
    return rows.map(mapDeployment)
  }

  setDeploymentLastRun(
    deploymentId: string,
    ranAtIso: string,
    error: string | null,
  ): void {
    this.db
      .prepare(
        `UPDATE workflow_deployments SET last_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?`,
      )
      .run(ranAtIso, error, ranAtIso, deploymentId)
  }

  deleteDeployment(deploymentId: string): void {
    this.db
      .prepare('DELETE FROM workflow_deployments WHERE id = ?')
      .run(deploymentId)
  }

  replaceTriggers(
    workflowId: string,
    deploymentId: string | null,
    triggers: Array<
      Omit<StoredWorkflowTrigger, 'createdAt' | 'updatedAt' | 'workflowId' | 'deploymentId'>
    >,
  ): StoredWorkflowTrigger[] {
    const now = new Date().toISOString()
    this.db
      .prepare(
        'DELETE FROM workflow_triggers WHERE workflow_id = ? AND (deployment_id IS ? OR deployment_id = ?)',
      )
      .run(workflowId, deploymentId, deploymentId)

    const insert = this.db.prepare(
      `INSERT INTO workflow_triggers (
        id, workflow_id, deployment_id, trigger_type, config_json, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    const saved: StoredWorkflowTrigger[] = []
    for (const trigger of triggers) {
      insert.run(
        trigger.id,
        workflowId,
        deploymentId,
        trigger.triggerType,
        trigger.configJson,
        trigger.enabled ? 1 : 0,
        now,
        now,
      )
      saved.push({
        ...trigger,
        workflowId,
        deploymentId,
        createdAt: now,
        updatedAt: now,
      })
    }
    return saved
  }

  listTriggers(workflowId: string): StoredWorkflowTrigger[] {
    const rows = this.db
      .prepare(
        `SELECT id, workflow_id, deployment_id, trigger_type, config_json, enabled, created_at, updated_at
         FROM workflow_triggers WHERE workflow_id = ? ORDER BY created_at ASC`,
      )
      .all(workflowId) as WorkflowTriggerRow[]
    return rows.map(mapTrigger)
  }

  listEnabledChannelMessageTriggers(): StoredWorkflowTrigger[] {
    const rows = this.db
      .prepare(
        `SELECT id, workflow_id, deployment_id, trigger_type, config_json, enabled, created_at, updated_at
         FROM workflow_triggers
         WHERE enabled = 1 AND trigger_type = 'channel_message'`,
      )
      .all() as WorkflowTriggerRow[]
    return rows.map(mapTrigger)
  }
}
