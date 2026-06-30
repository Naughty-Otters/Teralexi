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
        <div
          v-else
          class="agent-guide__row"
          :class="`agent-guide__row--count-${row.tiles.length}`"
        >
          <button
            v-for="tile in row.tiles"
            :key="tile.id"
            type="button"
            class="agent-guide__tile"
            :class="{ 'agent-guide__tile--selected': tile.id === selectedAgentId }"
            @click="emit('select-agent', tile.id)"
          >
            <UAvatar :alt="tile.displayName" :color="tile.color" size="md" />
            <span class="agent-guide__tile-name">{{ tile.tileLabel }}</span>
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
import type { Agent } from '@store/agent'

const props = defineProps<{
  agents: Agent[]
  selectedAgentId: string | null
}>()

const emit = defineEmits<{
  'select-agent': [agentId: string]
}>()

const { t } = useI18n()

const TILES_PER_ROW = 4

type GuideTile = {
  id: string
  color: Agent['color']
  description: string
  displayName: string
  tileLabel: string
}

type GuideDisplayRow =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'tiles'; key: string; tiles: GuideTile[] }

function pushTileRows(rows: GuideDisplayRow[], tiles: GuideTile[]): void {
  for (let index = 0; index < tiles.length; index += TILES_PER_ROW) {
    const slice = tiles.slice(index, index + TILES_PER_ROW)
    rows.push({
      kind: 'tiles',
      key: `tiles:${slice.map((tile) => tile.id).join('-')}`,
      tiles: slice,
    })
  }
}

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
    pushTileRows(rows, pendingTiles)
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
    pendingTiles.push({
      id: agent.id,
      color: agent.color,
      description: agent.description,
      displayName: formatAgentGroupDisplayName(agent),
      tileLabel: agentPickerRowLabel(entry.option, groupedUnderHeader),
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
  width: min(960px, 100%);
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
  flex-direction: row;
  flex-wrap: nowrap;
  justify-content: center;
  align-items: stretch;
  gap: 14px;
  width: 100%;
}

.agent-guide__tile {
  box-sizing: border-box;
  display: flex;
  flex: 0 0 220px;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 220px;
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

.agent-guide__tile-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
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

@media (max-width: 960px) {
  .agent-guide__tile {
    flex-basis: calc((100% - 3 * 14px) / 4);
    width: calc((100% - 3 * 14px) / 4);
  }
}

@media (max-width: 720px) {
  .agent-guide__row {
    flex-wrap: wrap;
  }

  .agent-guide__tile {
    flex: 0 1 calc((100% - 14px) / 2);
    width: calc((100% - 14px) / 2);
  }
}

@media (max-width: 420px) {
  .agent-guide__tile {
    flex: 1 1 100%;
    width: 100%;
  }
}
</style>
