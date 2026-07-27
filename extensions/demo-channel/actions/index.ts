import type { ExtensionChannelSender, UiPanelContribution } from '@teralexi/skill-sdk'
import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LOG_PATH = join(homedir(), '.teralexi', 'demo-channel.log')

async function appendLine(line: string): Promise<void> {
  const dir = join(homedir(), '.teralexi')
  await mkdir(dir, { recursive: true })
  await appendFile(LOG_PATH, `${line}\n`, 'utf-8')
}

/** Demo outbound channel — logs messages instead of calling an external API. */
const logChannel: ExtensionChannelSender = {
  async sendToTarget(target: string, text: string): Promise<void> {
    await appendLine(
      JSON.stringify({
        at: new Date().toISOString(),
        target,
        text,
      }),
    )
  },
}

export const channels: Record<string, ExtensionChannelSender> = {
  log: logChannel,
}

export const uiPanels: Record<string, UiPanelContribution> = {
  settings: {
    label: 'Demo Channel',
    component: 'ui/DemoChannelPanel.vue',
  },
}
