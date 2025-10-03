import React from 'react'
import useSavedFiles from '../hooks/useSavedFiles'
import Button from './Button'
import { formatBytes } from '../utils/format'

interface Props {
  onSelect: (file: { fileId: string, name: string, type: string, size: number }) => void
}

const SelectSavedFile: React.FC<Props> = ({ onSelect }) => {
  const { files, loading } = useSavedFiles()
  return (
    <div className="flex flex-col w-full max-w-full">
      <h3 className="mb-2">Select Stored File</h3>
      {loading ? (
        <div className="text-sm text-slate-600">Loading…</div>
      ) : files.length ? (
        <ul className="space-y-2">
          {files.map(f => (
            <li key={f.fileId} className="flex items-center justify-between gap-3 p-2 border rounded bg-white">
              <div className="min-w-0">
                <div className="font-medium truncate">{f.name}</div>
                <div className="text-xs text-slate-600 truncate">{f.type} • {formatBytes(f.size)}</div>
              </div>
              <Button size="sm" onClick={() => onSelect({ fileId: f.fileId, name: f.name, type: f.type, size: f.size })}>Add</Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-slate-600">No stored files.</div>
      )}
    </div>
  )
}

export default SelectSavedFile
