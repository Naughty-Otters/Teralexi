/** Strip values Electron IPC cannot structured-clone (functions, proxies, etc.). */
export function toIpcSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
