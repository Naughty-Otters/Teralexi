import { createLogger } from '@main/logger'
import { getWorkspacePath } from '@main/agent/workspace/conversation-workspace'
import type {
  SkillComposerToolbarInvokeResult,
  SkillComposerToolbarPluginView,
} from '@shared/agent/skill-composer-toolbar'
import type {
  SkillComposerToolbarPlugin,
  SkillComposerToolbarPluginContext,
} from './composer-toolbar-plugin'
import {
  getBundledSkillComposerToolbarPlugins,
} from './bundled-skill-actions'
import {
  isLoadableSkillFolder,
  resolveUserSkillsDirectory,
} from './skill-path'
import { isBundledSkillId } from './bundled-skills-manifest'
import { join } from 'path'
import { SKILL_FILES } from './constants'
import { loadComposerToolbarPluginsFromActionsDir } from './skill-module-loader'

const log = createLogger('skills.composer-toolbar')

function buildContext(args: {
  skillId: string
  conversationId: string
}): SkillComposerToolbarPluginContext {
  const conversationId = args.conversationId.trim()
  return {
    skillId: args.skillId.trim(),
    conversationId,
    workspacePath: conversationId ? getWorkspacePath(conversationId) : null,
  }
}

/** Resolve skill plugins from user override or bundled catalog. */
export async function loadComposerToolbarPluginsForSkillId(
  skillId: string,
): Promise<SkillComposerToolbarPlugin[]> {
  const id = skillId.trim()
  if (!id) return []

  const userSkillsDir = resolveUserSkillsDirectory()
  if (isLoadableSkillFolder(userSkillsDir, id)) {
    const actionsDir = join(userSkillsDir, id, SKILL_FILES.ACTIONS_DIR)
    const fromDisk = await loadComposerToolbarPluginsFromActionsDir(actionsDir)
    if (fromDisk.length > 0) return fromDisk
  }

  if (isBundledSkillId(id)) {
    return getBundledSkillComposerToolbarPlugins(id)
  }
  return []
}

export async function listComposerToolbarPluginViews(args: {
  skillId: string
  conversationId: string
}): Promise<{ ok: boolean; plugins: SkillComposerToolbarPluginView[] }> {
  const skillId = args.skillId?.trim() ?? ''
  const conversationId = args.conversationId?.trim() ?? ''
  if (!skillId || !conversationId) {
    return { ok: true, plugins: [] }
  }

  const plugins = await loadComposerToolbarPluginsForSkillId(skillId)
  const ctx = buildContext({ skillId, conversationId })
  const views: SkillComposerToolbarPluginView[] = []

  for (const plugin of plugins) {
    let enabled = true
    let disabledReason: string | undefined
    try {
      if (plugin.isEnabled) {
        enabled = Boolean(await plugin.isEnabled(ctx))
      }
      if (!enabled && plugin.getDisabledReason) {
        disabledReason = (await plugin.getDisabledReason(ctx)) ?? undefined
      }
    } catch (err) {
      log.warn('composer toolbar isEnabled failed', {
        skillId,
        pluginId: plugin.id,
        err,
      })
      enabled = false
      disabledReason = 'Unable to evaluate button state'
    }
    views.push({
      id: plugin.id,
      label: plugin.label,
      icon: plugin.icon,
      enabled,
      disabledReason,
    })
  }

  return { ok: true, plugins: views }
}

export async function invokeComposerToolbarPlugin(args: {
  skillId: string
  conversationId: string
  pluginId: string
}): Promise<SkillComposerToolbarInvokeResult> {
  const skillId = args.skillId?.trim() ?? ''
  const conversationId = args.conversationId?.trim() ?? ''
  const pluginId = args.pluginId?.trim() ?? ''
  if (!skillId || !conversationId || !pluginId) {
    return { ok: false, error: 'Missing skill, conversation, or plugin id' }
  }

  const plugins = await loadComposerToolbarPluginsForSkillId(skillId)
  const plugin = plugins.find((p) => p.id === pluginId)
  if (!plugin) {
    return { ok: false, error: `Unknown toolbar plugin: ${pluginId}` }
  }

  const ctx = buildContext({ skillId, conversationId })
  try {
    if (plugin.isEnabled && !(await plugin.isEnabled(ctx))) {
      const reason =
        (plugin.getDisabledReason
          ? await plugin.getDisabledReason(ctx)
          : undefined) ?? 'Button is disabled'
      return { ok: false, error: reason }
    }
    return await plugin.execute(ctx)
  } catch (err) {
    log.warn('composer toolbar execute failed', { skillId, pluginId, err })
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
