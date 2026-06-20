export interface SaveDataToFileInput {
  userId?: string
  relativePath: string
  data: unknown
}

export async function saveDataToFile(input: SaveDataToFileInput): Promise<string> {
  const channel = window.ipcRendererChannel?.SaveDataToFile
  if (!channel?.invoke) {
    throw new Error('IPC channel SaveDataToFile is not available')
  }

  const result = await channel.invoke({
    userId: input.userId ?? 'default',
    relativePath: input.relativePath,
    data: input.data,
  })

  return result.filePath
}
