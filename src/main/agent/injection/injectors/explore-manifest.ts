import { existsSync } from 'node:fs'
import { exploreManifestHasContent } from '@shared/agent/explore-manifest'
import {
  formatExploreManifestForInstructions,
  readExploreManifest,
} from '../../coding/explore-manifest'
import { planModeStorageOptionsFromEnv } from '../../coding/plan-mode-state'
import { resolvePlanModeStorage } from '../../coding/plan-mode-storage-impl'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

export const exploreManifestInjector: AgentInjector = {
  id: 'explore-manifest',
  order: INJECTOR_ORDER.EXPLORE_MANIFEST,
  applies({ profile, ctx }) {
    if (profile.stage !== 'todoExecution' || !profile.isCodingAgent) {
      return false
    }
    const conversationId = ctx.opts.conversationId?.trim()
    if (!conversationId) return false
    const storage = resolvePlanModeStorage(
      conversationId,
      planModeStorageOptionsFromEnv(conversationId),
    )
    if (!storage) return false
    return existsSync(storage.manifestFile.absolutePath)
  },
  injectInstructions({ ctx }) {
    const conversationId = ctx.opts.conversationId?.trim()
    if (!conversationId) return null
    const manifest = readExploreManifest(
      conversationId,
      planModeStorageOptionsFromEnv(conversationId),
    )
    if (!manifest || !exploreManifestHasContent(manifest)) return null
    return formatExploreManifestForInstructions(manifest)
  },
}
