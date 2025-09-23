import { saveChunkToIndexedDB, saveFileMetadata } from './indexed-db'
import { chunkSize } from '../constants'

export async function storeFiles(files: File[], onProgress?: (fileIndex: number, percent: number) => void): Promise<void> {
  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx]
    const fileId = crypto.randomUUID()
    const total = Math.ceil(file.size / chunkSize)
    let saved = 0
    for (let i = 0; i < file.size; i += chunkSize) {
      const chunk = file.slice(i, i + chunkSize)
      const buffer = new Uint8Array(await chunk.arrayBuffer())
      await saveChunkToIndexedDB(fileId, saved, buffer)
      saved += 1
      if (onProgress) onProgress(idx, Math.round((saved / total) * 100))
    }
    const relativePath = (file as any).webkitRelativePath || file.name
    const folderRoot = relativePath.includes('/') ? relativePath.split('/')[0] : undefined
    await saveFileMetadata(fileId, file.name, file.type, file.size, '', Date.now(), true, { folderRoot, relativePath })
  }
}
