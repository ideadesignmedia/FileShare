import React from 'react'
import { FileMetadata } from '../utils/indexed-db'
import { formatBytes } from '../utils/format'
import { fileKindFrom } from '../utils/file-kind'
import icons from './icons'

export default function FileInfoPopup({ file }: { file: FileMetadata }) {
  const rows: { label: string, value: React.ReactNode }[] = [
    { label: 'Name', value: file.name },
    { label: 'Type', value: file.type || 'Unknown' },
    { label: 'Size', value: formatBytes(file.size) },
    { label: 'Downloaded', value: new Date(file.downloaded_at).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) },
    { label: 'File ID', value: <code className='break-all'>{file.fileId}</code> },
    ...(file.folderRoot ? [{ label: 'Folder', value: file.folderRoot }] : []),
    ...(file.relativePath ? [{ label: 'Relative Path', value: <code className='break-all'>{file.relativePath}</code> }] : []),
    { label: 'Stored In DB', value: file.stored_in_db ? 'Yes' : 'No' },
  ]
  const kind = fileKindFrom(file.type, file.name)
  const icon = (icons as any)[kind]
  return (
    <div className='w-full max-w-full'>
      <div className='flex items-center gap-2 mb-3'>
        <span className='text-blue-600'>{icon}</span>
        <h3 className='truncate'>{file.name}</h3>
      </div>
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
        {rows.map((r, i) => (
          <div key={i} className='bg-white border border-slate-200 rounded-md p-3'>
            <div className='text-xs uppercase tracking-wide text-slate-500 mb-1'>{r.label}</div>
            <div className='text-sm text-slate-800 break-words'>{r.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

