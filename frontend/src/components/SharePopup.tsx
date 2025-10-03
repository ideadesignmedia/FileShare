import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from './Button'
import { toast } from '../utils/toast'
import { useSocket } from '../context/SocketContext'
import { emitter, useAppContext } from '../context/AppContext'
import icons from './icons'
import { fileKindFrom } from '../utils/file-kind'
import { formatBytes } from '../utils/format'
import device, { deviceTypes } from '../constants/device-browser'
import { storeTempShareFiles } from '../utils/store-files'

type SharePopupProps = {
  onDone?: () => void
}

const bytesToSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

export default function SharePopup({ onDone }: SharePopupProps) {
  const [files, setFiles] = useState<File[]>([])
  const [creating, setCreating] = useState(false)
  const [passcode, setPasscode] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const [stored, setStored] = useState<{ fileId: string, name: string, type: string, size: number }[]>([])
  // Load any staged stored files (when this popup was temporarily unmounted)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('share:stagedStored')
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) setStored(arr)
      }
    } catch {}
  }, [])
  // Keep sessionStorage in sync so selection survives nested popup remounts
  useEffect(() => {
    try { sessionStorage.setItem('share:stagedStored', JSON.stringify(stored)) } catch {}
  }, [stored])
  // Listen for out-of-band updates
  useEffect(() => {
    const sync = () => {
      try {
        const raw = sessionStorage.getItem('share:stagedStored')
        if (raw) {
          const arr = JSON.parse(raw)
          if (Array.isArray(arr)) setStored(arr)
        }
      } catch {}
    }
    window.addEventListener('share-stored-updated', sync)
    return () => window.removeEventListener('share-stored-updated', sync)
  }, [])
  useEffect(() => { try { console.log('[Share][Popup] stored list size', stored.length, stored) } catch {} }, [stored])

  const totalSize = useMemo(() => files.reduce((n, f) => n + f.size, 0), [files])
  useEffect(() => {
    ;(window as any).__shareFiles = files
    return () => { try { delete (window as any).__shareFiles } catch {} }
  }, [files])

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = Array.from(e.target.files || [])
    if (f.length) setFiles(prev => [...prev, ...f])
  }, [])
  const onPickFolder = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = Array.from(e.target.files || [])
    if (f.length) setFiles(prev => [...prev, ...f])
  }, [])

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const items = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : []
    if (items.length) setFiles(prev => [...prev, ...items])
  }, [])

  const { send } = useSocket()
  const { addPopup } = useAppContext()
  useEffect(() => () => emitter.off('share-created', () => {}), [])
  useEffect(() => {
    const handler = (data: any) => {
      if (!data) return
      setStored(prev => {
        if (prev.some(p => p.fileId === data.fileId)) return prev
        return [...prev, data]
      })
    }
    const openSelect = () => emitter.emit('open-popup', null)
    const onOpenSelect = () => {
      // invoke the select saved file popup
      emitter.emit('select-saved-file', null)
    }
    emitter.on('open-select-saved', onOpenSelect)
    // bridge: usePopups doesn't listen to custom events; call addPopup directly via a global helper
    ;(window as any).__openSelectSaved = (cb: (file: any) => void) => {
      emitter.emit('add-popup', { type: 'select-saved-file', onSelect: cb })
    }
    return () => {
      emitter.off('open-select-saved', onOpenSelect)
    }
  }, [])
  const onCreate = useCallback(async () => {
    if (!(files.length + stored.length) || !passcode.trim()) return
    setCreating(true)
    let finalNewFiles: File[] = []
    try {
      const byRoot = new Map<string, File[]>()
      const normal: File[] = []
      for (let i = 0; i < files.length; i++) {
        const f: any = files[i] as any
        const rel = (f && typeof f.webkitRelativePath === 'string') ? f.webkitRelativePath as string : ''
        if (rel && rel.includes('/')) {
          const root = rel.split('/')[0]
          const arr = byRoot.get(root) || []
          arr.push(files[i])
          byRoot.set(root, arr)
        } else normal.push(files[i])
      }
      const zips: File[] = []
      if (byRoot.size > 0) {
        const { zipFiles } = await import('../utils/zip')
        for (const [root, arr] of byRoot) {
          const entries = arr.map((ff: any) => ({ path: (ff.webkitRelativePath || ff.name) as string, file: ff as File }))
          const zip = await zipFiles(entries, `${root}.zip`)
          zips.push(zip)
        }
      }
      finalNewFiles = [...normal, ...zips]
    } catch (e) {
      finalNewFiles = [...files]
    }
    const meta = { files: [
      ...finalNewFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
      ...stored.map(s => ({ name: s.name, size: s.size, type: s.type }))
    ] }
    let done = false
    const handler = async (d: { token: string }) => {
      if (done) return
      done = true
      const segs = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)
      const lower = segs.map(s => s.toLowerCase())
      const i = lower.findIndex(s => s === 'share' || s === 'receive' || s === 'recieve')
      const baseSegs = i > 0 ? segs.slice(0, i) : []
      const basePath = '/' + (baseSegs.length ? baseSegs.join('/') + '/' : '')
      const receiveUrl = `${window.location.origin}${basePath}?mode=receive&t=${encodeURIComponent(d.token)}`
      const nextPath = `${basePath}share/${d.token}`
      if (window.location.pathname !== nextPath) {
        window.history.pushState({}, '', nextPath)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }
      try { await storeTempShareFiles(d.token, finalNewFiles) } catch (e) { console.error(e) }
      if (stored.length) {
        try {
          const { markFilesForShare } = await import('../utils/indexed-db')
          await markFilesForShare(d.token, stored.map(s => s.fileId))
        } catch (e) { console.error(e) }
      }
      toast('Share link created')
      if (typeof onDone === 'function') onDone()
      setTimeout(() => {
        try {
          const p = navigator.clipboard?.writeText(receiveUrl)
          if (p && typeof (p as any).catch === 'function') (p as any).catch(() => {})
        } catch {}
      }, 150)
      setCreating(false)
      emitter.off('share-created', handler)
      sessionStorage.setItem(`share-files:${d.token}`, JSON.stringify(meta.files))
      sessionStorage.setItem(`share-pass:${d.token}`, passcode)
      try { sessionStorage.removeItem('share:stagedStored') } catch {}
    }
    emitter.on('share-created', handler)
    try { send({ type: 'share-create', data: { passcode: passcode.trim(), meta } } as any) } catch { setCreating(false); emitter.off('share-created', handler) }
  }, [files, passcode, onDone, send])

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-xs uppercase tracking-wide text-blue-700 font-semibold mb-2">Share via Link or QR</div>
      <h3 className="mb-2">Select Files to Share</h3>
      <div
        className="border border-dashed border-slate-300 bg-white rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50"
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" multiple className="hidden" onChange={onPick} />
        <div className="text-slate-700">Drag and drop files here, or click to choose</div>
        <div className="text-xs text-slate-500 mt-1">You can select multiple files</div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {device.deviceType === deviceTypes.Desktop && (
          <>
            <input ref={folderInputRef} type="file" className="hidden" onChange={onPickFolder} webkitdirectory="" mozdirectory="" />
            <Button variant="outline" onClick={() => folderInputRef.current?.click()}>Select Folder(s)</Button>
          </>
        )}
        <div className="grow"></div>
        <Button variant="light" onClick={() => addPopup('select-saved-file', { onSelect: (file: any) => { try { console.log('[Share][Popup] added stored file', file) } catch {}; try { const key = 'share:stagedStored'; const raw = sessionStorage.getItem(key); const arr = raw ? JSON.parse(raw) : []; if (!arr.some((p: any) => p.fileId === file.fileId)) { arr.push(file); sessionStorage.setItem(key, JSON.stringify(arr)); window.dispatchEvent(new Event('share-stored-updated')) } } catch {}; setStored(prev => (prev.some(p => p.fileId === file.fileId) ? prev : [...prev, file])) } })}>
          <span className='inline-flex items-center gap-2'>Add From Stored Files</span>
        </Button>
      </div>
      {(files.length > 0 || stored.length > 0) && (
        <div className="mt-3 bg-white border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-700">{files.length + stored.length} item{(files.length + stored.length) > 1 ? 's' : ''}</div>
            <div className="text-sm text-slate-600">Total {bytesToSize(totalSize + stored.reduce((n, s) => n + s.size, 0))}</div>
          </div>
          <div className='text-xs text-slate-600 mt-1'>From new: {files.length} • From stored: {stored.length}</div>
          <ul className="mt-2 max-h-60 overflow-auto divide-y divide-slate-100">
            {files.map((f, i) => (
              <li key={`up-${f.name}-${i}`} className="py-2 flex items-center justify-between text-sm">
                <div className='flex items-center gap-3 min-w-0'>
                  <span className='text-blue-600 flex-none'>{(icons as any)[fileKindFrom(f.type, f.name)]}</span>
                  <div className='min-w-0'>
                    <div className='truncate'>{f.name}</div>
                    <div className='text-xs text-slate-600 truncate'>{f.type || 'application/octet-stream'} • {formatBytes(f.size)}</div>
                  </div>
                </div>
                <span className="text-slate-500 shrink-0">{bytesToSize(f.size)}</span>
              </li>
            ))}
            {stored.map((s, i) => (
              <li key={`st-${s.fileId}-${i}`} className="py-2 flex items-center justify-between text-sm">
                <div className='flex items-center gap-3 min-w-0'>
                  <span className='text-blue-600 flex-none'>{(icons as any)[fileKindFrom(s.type, s.name)]}</span>
                  <div className='min-w-0'>
                    <div className='truncate'>{s.name}</div>
                    <div className='text-xs text-slate-600 truncate'>{s.type || 'application/octet-stream'} • {formatBytes(s.size)}</div>
                  </div>
                </div>
                <span className="text-slate-500 shrink-0">{bytesToSize(s.size)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3">
        <label className="text-sm text-slate-700">Passcode
          <input className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30" type="text" placeholder="Set a passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
        </label>
        <div className="text-xs text-slate-500 mt-1">Receivers must enter this passcode to open the share.</div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="light" onClick={onDone}>Cancel</Button>
        <Button disabled={!(files.length + stored.length) || !passcode.trim() || creating} onClick={onCreate}>Create Share Link</Button>
      </div>
    </div>
  )
}
