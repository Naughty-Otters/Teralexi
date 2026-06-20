import type Database from 'better-sqlite3'
import type { SkillCompiledArtifact } from '@main/skills/skill-compiled-schema'
import type { SkillCompilationSource, SkillCompilationStatus } from '@main/skills/skill-compiled-schema'

export type StoredSkillCompilation = {
  skillId: string
  source: SkillCompilationSource
  sourceFingerprint: string
  status: SkillCompilationStatus
  compiled: SkillCompiledArtifact | null
  errorMessage: string | null
  compiledAt: string | null
  updatedAt: string
}

type SkillCompilationRow = {
  skill_id: string
  source: SkillCompilationSource
  source_fingerprint: string
  status: SkillCompilationStatus
  compiled_json: string
  error_message: string | null
  compiled_at: string | null
  updated_at: string
}

function mapRow(row: SkillCompilationRow): StoredSkillCompilation {
  let compiled: SkillCompiledArtifact | null = null
  if (row.compiled_json.trim()) {
    try {
      compiled = JSON.parse(row.compiled_json) as SkillCompiledArtifact
    } catch {
      compiled = null
    }
  }
  return {
    skillId: row.skill_id,
    source: row.source,
    sourceFingerprint: row.source_fingerprint,
    status: row.status,
    compiled,
    errorMessage: row.error_message,
    compiledAt: row.compiled_at,
    updatedAt: row.updated_at,
  }
}

export class SkillCompilationsRepository {
  constructor(private readonly db: Database.Database) {}

  get(skillId: string, source: SkillCompilationSource): StoredSkillCompilation | null {
    const row = this.db
      .prepare(
        `SELECT skill_id, source, source_fingerprint, status, compiled_json,
                error_message, compiled_at, updated_at
         FROM skill_compilations
         WHERE skill_id = ? AND source = ?`,
      )
      .get(skillId, source) as SkillCompilationRow | undefined
    return row ? mapRow(row) : null
  }

  /** Prefer user compilation, then bundled. */
  getEffective(skillId: string): StoredSkillCompilation | null {
    return this.get(skillId, 'user') ?? this.get(skillId, 'bundled')
  }

  upsert(args: {
    skillId: string
    source: SkillCompilationSource
    sourceFingerprint: string
    status: SkillCompilationStatus
    compiled: SkillCompiledArtifact | null
    errorMessage: string | null
    compiledAt: string | null
  }): StoredSkillCompilation {
    const now = new Date().toISOString()
    const compiledJson = args.compiled ? JSON.stringify(args.compiled) : ''
    this.db
      .prepare(
        `INSERT INTO skill_compilations (
          skill_id, source, source_fingerprint, status, compiled_json,
          error_message, compiled_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(skill_id, source) DO UPDATE SET
          source_fingerprint = excluded.source_fingerprint,
          status = excluded.status,
          compiled_json = excluded.compiled_json,
          error_message = excluded.error_message,
          compiled_at = excluded.compiled_at,
          updated_at = excluded.updated_at`,
      )
      .run(
        args.skillId,
        args.source,
        args.sourceFingerprint,
        args.status,
        compiledJson,
        args.errorMessage,
        args.compiledAt,
        now,
      )
    return this.get(args.skillId, args.source)!
  }

  delete(skillId: string, source: SkillCompilationSource): void {
    this.db
      .prepare(
        `DELETE FROM skill_compilations WHERE skill_id = ? AND source = ?`,
      )
      .run(skillId, source)
  }

  deleteAllForSkill(skillId: string): void {
    this.delete(skillId, 'user')
    this.delete(skillId, 'bundled')
  }
}
