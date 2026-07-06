import type { ModelMessage } from '@teralexi-ai'

export const TERALEXI_INJECTOR_META_KEY = 'teralexiInjectorMeta' as const

export type InjectorMessageMeta = {
  injectorId: string
  injectedAt: string
}

export type ModelMessageWithInjectorMeta = ModelMessage & {
  [TERALEXI_INJECTOR_META_KEY]?: InjectorMessageMeta
}

export function readInjectorMessageMeta(
  message: ModelMessage,
): InjectorMessageMeta | undefined {
  const meta = (message as ModelMessageWithInjectorMeta)[TERALEXI_INJECTOR_META_KEY]
  if (!meta || typeof meta !== 'object') return undefined
  const injectorId =
    typeof meta.injectorId === 'string' ? meta.injectorId.trim() : ''
  const injectedAt =
    typeof meta.injectedAt === 'string' ? meta.injectedAt.trim() : ''
  if (!injectorId || !injectedAt) return undefined
  return { injectorId, injectedAt }
}

export function attachInjectorMessageMeta(
  message: ModelMessage,
  meta: InjectorMessageMeta,
): ModelMessageWithInjectorMeta {
  return {
    ...message,
    [TERALEXI_INJECTOR_META_KEY]: meta,
  }
}

export function stripInjectorMessageMeta(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message) => {
    if (!(TERALEXI_INJECTOR_META_KEY in message)) return message
    const { [TERALEXI_INJECTOR_META_KEY]: _meta, ...rest } =
      message as ModelMessageWithInjectorMeta
    return rest as ModelMessage
  })
}

export function findLastInjectorMessageMeta(
  messages: readonly ModelMessage[],
  injectorId: string,
): InjectorMessageMeta | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const meta = readInjectorMessageMeta(messages[index])
    if (meta?.injectorId === injectorId) return meta
  }
  return undefined
}
