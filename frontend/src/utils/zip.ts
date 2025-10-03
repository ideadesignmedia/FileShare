const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = (c >>> 8) ^ crcTable[(c ^ data[i]) & 0xff]
  return (c ^ 0xffffffff) >>> 0
}

function toDosTime(date: Date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const seconds = Math.floor(date.getSeconds() / 2)
  const dosTime = (hours << 11) | (minutes << 5) | seconds
  const dosDate = ((year - 1980) << 9) | (month << 5) | day
  return { dosTime, dosDate }
}

function u16(n: number) {
  const b = new Uint8Array(2)
  const v = n & 0xffff
  b[0] = v & 0xff
  b[1] = (v >>> 8) & 0xff
  return b
}

function u32(n: number) {
  const b = new Uint8Array(4)
  const v = n >>> 0
  b[0] = v & 0xff
  b[1] = (v >>> 8) & 0xff
  b[2] = (v >>> 16) & 0xff
  b[3] = (v >>> 24) & 0xff
  return b
}

function concat(parts: Uint8Array[]) {
  let len = 0
  for (let i = 0; i < parts.length; i++) len += parts[i].length
  const out = new Uint8Array(len)
  let off = 0
  for (let i = 0; i < parts.length; i++) { out.set(parts[i], off); off += parts[i].length }
  return out
}

export async function zipFiles(entries: { path: string, file: File }[], zipName: string): Promise<File> {
  const encoder = new TextEncoder()
  const now = new Date()
  const { dosTime, dosDate } = toDosTime(now)
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const name = e.path.replace(/^\/+/, '')
    const nameBytes = encoder.encode(name)
    const data = new Uint8Array(await e.file.arrayBuffer())
    const crc = crc32(data)
    const lfh = [
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]
    const lfhBuf = concat(lfh as unknown as Uint8Array[])
    localParts.push(lfhBuf)
    localParts.push(data)

    const cdfh = [
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]
    const cdfhBuf = concat(cdfh as unknown as Uint8Array[])
    centralParts.push(cdfhBuf)
    offset += lfhBuf.length + data.length
  }

  const central = concat(centralParts)
  const locals = concat(localParts)
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(locals.length),
    u16(0),
  ])

  const blob = new Blob([locals, central, eocd], { type: 'application/zip' })
  return new File([blob], zipName, { type: 'application/zip' })
}

export function estimateZipSize(files: File[]): number {
  const encoder = new TextEncoder()
  let total = 22
  for (let i = 0; i < files.length; i++) {
    const f: any = files[i] as any
    const name = (f.webkitRelativePath || f.name) as string
    const nameLen = encoder.encode(name).length
    total += (f.size || 0) + 30 + 46 + (nameLen * 2)
  }
  return total
}

export function streamFolderToZip(files: File[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const now = new Date()
  const { dosTime, dosDate } = toDosTime(now)
  const centralParts: Uint8Array[] = []
  let offset = 0
  let index = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (index < files.length) {
        const f: any = files[index] as any
        const name = (f.webkitRelativePath || f.name) as string
        const nameBytes = encoder.encode(name)
        const ab = new Uint8Array(await (files[index] as File).arrayBuffer())
        const crc = crc32(ab)
        const lfh = concat([
          u32(0x04034b50),
          u16(20),
          u16(0),
          u16(0),
          u16(dosTime),
          u16(dosDate),
          u32(crc),
          u32(ab.length),
          u32(ab.length),
          u16(nameBytes.length),
          u16(0),
          nameBytes,
        ])
        controller.enqueue(lfh)
        controller.enqueue(ab)
        const cdfh = concat([
          u32(0x02014b50),
          u16(20),
          u16(20),
          u16(0),
          u16(0),
          u16(dosTime),
          u16(dosDate),
          u32(crc),
          u32(ab.length),
          u32(ab.length),
          u16(nameBytes.length),
          u16(0),
          u16(0),
          u16(0),
          u16(0),
          u32(0),
          u32(offset),
          nameBytes,
        ])
        centralParts.push(cdfh)
        offset += lfh.length + ab.length
        index++
        return
      }
      const central = concat(centralParts)
      const eocd = concat([
        u32(0x06054b50),
        u16(0),
        u16(0),
        u16(centralParts.length),
        u16(centralParts.length),
        u32(central.length),
        u32(offset),
        u16(0),
      ])
      controller.enqueue(central)
      controller.enqueue(eocd)
      controller.close()
    }
  })
}

export async function zipSavedFolderToBlob(items: { fileId: string, relativePath: string }[]): Promise<Blob> {
  const { getFileMetadata, getChunksFromIndexedDB } = await import('./indexed-db')
  const encoder = new TextEncoder()
  const now = new Date()
  const { dosTime, dosDate } = toDosTime(now)
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0
  for (let i = 0; i < items.length; i++) {
    const meta = await getFileMetadata(items[i].fileId)
    if (!meta) continue
    const blob = await getChunksFromIndexedDB(items[i].fileId, meta.type)
    const ab = new Uint8Array(await blob.arrayBuffer())
    const name = items[i].relativePath || meta.name
    const nameBytes = encoder.encode(name)
    const crc = crc32(ab)
    const lfh = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(ab.length),
      u32(ab.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ])
    localParts.push(lfh)
    localParts.push(ab)
    const cdfh = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(ab.length),
      u32(ab.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ])
    centralParts.push(cdfh)
    offset += lfh.length + ab.length
  }
  const central = concat(centralParts)
  const locals = concat(localParts)
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(centralParts.length),
    u16(centralParts.length),
    u32(central.length),
    u32(locals.length),
    u16(0),
  ])
  return new Blob([locals, central, eocd], { type: 'application/zip' })
}
