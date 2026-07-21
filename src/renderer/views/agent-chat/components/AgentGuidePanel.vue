<template>
  <div class="agent-guide" role="region" aria-label="Choose an agent">
    <h2 class="agent-guide__title">{{ t.agentGuide.title }}</h2>
    <p class="agent-guide__subtitle">{{ t.agentGuide.subtitle }}</p>

    <div class="agent-guide__layout">
      <template v-for="row in guideRows" :key="row.key">
        <h3
          v-if="row.kind === 'header'"
          class="agent-guide__section-title"
        >
          {{ row.label }}
        </h3>
        <div v-else class="agent-guide__row">
          <button
            v-for="tile in row.tiles"
            :key="tile.id"
            type="button"
            class="agent-guide__tile"
            :class="{
              'agent-guide__tile--selected': tile.id === selectedAgentId,
              'agent-guide__tile--locked': tile.locked,
            }"
            :title="tile.locked ? t.signInGate.websiteSkill : undefined"
            :disabled="tile.locked"
            @click="onTileClick(tile)"
          >
            <UAvatar :alt="tile.displayName" :color="tile.color" size="md" />
            <span class="agent-guide__tile-name">
              <UIcon
                v-if="tile.locked"
                class="agent-guide__tile-lock"
                name="i-lucide-lock"
                aria-hidden="true"
              />
              {{ tile.tileLabel }}
            </span>
            <span v-if="tile.description" class="agent-guide__tile-desc">
              {{ tile.description }}
            </span>
            <span
              v-if="tile.id === selectedAgentId"
              class="agent-guide__tile-badge"
            >
              {{ t.agentGuide.selected }}
            </span>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import {
  agentPickerRowLabel,
  buildAgentPickerEntries,
  formatAgentGroupDisplayName,
  type SkillGroupAgentRef,
} from '@shared/agent/skill-groups'
import { isAgentLockedWithoutSignIn } from '@shared/auth/signed-in-features'
import { resolveAgentSkillId } from '@shared/agent/workspace-required-skills'
import type { Agent } from '@store/agent'

const props = withDefaults(
  defineProps<{
    agents: Agent[]
    selectedAgentId: string | null
    /** When false, website skill tiles show as locked. */
    signedIn?: boolean
  }>(),
  {
    signedIn: true,
  },
)

const emit = defineEmits<{
  'select-agent': [agentId: string]
  'sign-in-required': []
}>()

const { t } = useI18n()

function onTileClick(tile: GuideTile) {
  if (tile.locked) {
    emit('sign-in-required')
    return
  }
  emit('select-agent', tile.id)
}

type GuideTile = {
  id: string
  color: Agent['color']
  description: string
  displayName: string
  tileLabel: string
  locked: boolean
}

type GuideDisplayRow =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'tiles'; key: string; tiles: GuideTile[] }

const guideRows = computed((): GuideDisplayRow[] => {
  const refs: SkillGroupAgentRef[] = props.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    skillId: agent.skillId,
    skillGroup: agent.skillGroup,
    skillGroupLabel: agent.skillGroupLabel,
    skillVariant: agent.skillVariant,
    skillVariantLabel: agent.skillVariantLabel,
    skillGroupOrder: agent.skillGroupOrder,
    skillVariantOrder: agent.skillVariantOrder,
    enabled: agent.enabled,
  }))

  const entries = buildAgentPickerEntries(refs)
  const rows: GuideDisplayRow[] = []
  let pendingTiles: GuideTile[] = []

  const flushPendingTiles = () => {
    if (pendingTiles.length === 0) return
    rows.push({
      kind: 'tiles',
      key: `tiles:${pendingTiles.map((tile) => tile.id).join('-')}`,
      tiles: pendingTiles,
    })
    pendingTiles = []
  }

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!
    if (entry.kind === 'header') {
      flushPendingTiles()
      rows.push({
        kind: 'header',
        key: `header:${entry.groupId}`,
        label: entry.label,
      })
      continue
    }

    const agent = props.agents.find((item) => item.id === entry.option.id)
    if (!agent) continue

    const groupedUnderHeader = entries[index - 1]?.kind === 'header'
    const skillId = resolveAgentSkillId(agent)
    pendingTiles.push({
      id: agent.id,
      color: agent.color,
      description: agent.description,
      displayName: formatAgentGroupDisplayName(agent),
      tileLabel: agentPickerRowLabel(entry.option, groupedUnderHeader),
      locked: isAgentLockedWithoutSignIn(
        { id: agent.id, skillId },
        props.signedIn ?? true,
      ),
    })
  }

  flushPendingTiles()
  return rows
})
</script>

<style scoped>
.agent-guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: min(520px, 100%);
  padding: 32px 24px 48px;
  text-align: center;
  box-sizing: border-box;
}

.agent-guide__title {
  margin: 0 0 8px;
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ui-text);
}

.agent-guide__subtitle {
  margin: 0 0 28px;
  max-width: 36rem;
  font-size: 14px;
  line-height: 1.55;
  color: var(--ui-text-muted);
}

.agent-guide__layout {
  width: 100%;
  max-width: 1100px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
}

.agent-guide__section-title {
  margin: 8px 0 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
  text-align: center;
}

.agent-guide__row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: stretch;
  gap: 14px;
  width: 100%;
}

.agent-guide__tile {
  box-sizing: border-box;
  display: flex;
  flex: 0 1 200px;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: min(220px, 100%);
  max-width: 100%;
  min-width: 0;
  padding: 18px 16px;
  border: 1px solid var(--ui-border);
  border-radius: 14px;
  background: var(--ui-bg-elevated);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.agent-guide__tile:hover {
  border-color: color-mix(in srgb, var(--color-primary-500, #6366f1) 35%, var(--ui-border));
  box-shadow: 0 8px 24px color-mix(in srgb, var(--ui-text) 8%, transparent);
  transform: translateY(-1px);
}

.agent-guide__tile--selected {
  border-color: var(--color-primary-500, #6366f1);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary-500, #6366f1) 40%, transparent);
}

.agent-guide__tile--locked {
  opacity: 0.72;
  cursor: not-allowed;
}

.agent-guide__tile--locked:hover {
  border-color: var(--ui-border);
  box-shadow: none;
  transform: none;
}

.agent-guide__tile-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
}

.agent-guide__tile-lock {
  width: 14px;
  height: 14px;
  color: var(--ui-text-muted);
}

.agent-guide__tile-desc {
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.agent-guide__tile-badge {
  margin-top: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary-600, var(--color-primary-500, #6366f1));
  background: color-mix(in srgb, var(--color-primary-500, #6366f1) 12%, transparent);
}
</style>
