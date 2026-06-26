/** Shared validation for config.properties / env override keys. */
export function isValidSystemPropKey(key: string): boolean {
  return /^\w+(\.\w+)+$/.test(key)
}

export const CONFIG_PROPERTIES_FILENAME = 'config.properties'
