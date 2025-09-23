import React, { useRef, useState } from 'react';
import { FileMetadata } from '../utils/indexed-db';
import { formatBytes } from '../utils/format';
import { deleteFile, downloadFile } from '../utils/handle-file';
import Button from './Button';
import LoadingPage from './LoadingPage';
import device, { deviceTypes } from '../constants/device-browser';
import useSavedFiles from '../hooks/useSavedFiles';
import { toast } from '../utils/toast';
import icons from './icons';
import { storeFiles } from '../utils/store-files';
import { useP2PContext } from '../context/P2PContext';
import { useAppContext, emitter } from '../context/AppContext';
 
import { fileKindFrom } from '../utils/file-kind'

function formatDateTime(ts: number) {
  try {
    return new Date(ts).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

const SavedFile: React.FC<{ file: FileMetadata }> = ({ file }) => {
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { selectedPeer } = useP2PContext()
  const { confirm, addPopup } = useAppContext()
  return <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 sm:gap-3 items-start sm:items-center w-full max-w-full p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors shadow-sm overflow-hidden">
    <div className="min-w-0 overflow-hidden cursor-pointer" onClick={() => addPopup('file-info', { file })}>
      <div className="flex items-center gap-2 min-w-0">
        <span className='text-blue-600 flex-none'>{(icons as any)[fileKindFrom(file.type, file.name)]}</span>
        <span className="font-medium text-slate-900 truncate">{file.name}</span>
      </div>
      <div className="mt-0.5 text-sm text-slate-600 truncate">
        {file.type || 'Unknown'} • {formatBytes(file.size)}
        <span className='hidden sm:inline'> • {formatDateTime(file.downloaded_at)}</span>
      </div>
    </div>
    <div className="flex items-center sm:justify-end justify-start gap-2 gap-y-2 flex-wrap w-full sm:w-auto">
      <Button size='sm' onClick={() => {
        /* Non-blocking save, handled below */
      }} className='hidden'>Hidden</Button>
      <Button size='sm' className='flex-shrink-0 h-6 sm:h-8 py-0 px-2 sm:px-2.5 text-xs sm:text-sm inline-flex items-center justify-center leading-none' disabled={deleting || saving} onClick={(e) => {
        e.stopPropagation()
        setSaving(true)
        downloadFile(file.fileId).then(() => {
          toast('File saved')
        }).catch(e => {
          console.error(e)
          toast('Error saving file: ' + (e.message || e.toString()))
        }).finally(() => setSaving(false))
      }}>
        {!saving ? <span className='inline-flex items-center gap-1'><span className='transform scale-90 sm:scale-100'>{icons.save}</span><span>Save{(device.app || 'FilePicker' in window) ? ' As' : ''}</span></span> : <span className='text-xs sm:text-sm'>Saving...</span>}
      </Button>
      {Boolean(localStorage.getItem('token')) && <Button size='sm' className='flex-shrink-0 h-6 sm:h-8 py-0 px-2 sm:px-2.5 text-xs sm:text-sm inline-flex items-center justify-center leading-none' disabled={saving || deleting} onClick={(e) => {
        e.stopPropagation()
        emitter.emit('add-saved-to-queue', { peer: selectedPeer, type: 'file', fileId: file.fileId, name: file.name, typeVal: file.type, size: file.size })
        toast('Added to queue')
      }}>
        <span className='inline-flex items-center gap-1'><span>Add</span><span className='transform scale-90 sm:scale-100'>{icons.plus}</span></span>
      </Button>}
      <Button icon size='sm' className='flex-shrink-0 h-6 w-6 sm:h-8 sm:w-8' disabled={deleting || saving} variant='danger' onClick={(e) => {
        e.stopPropagation()
        confirm(`Delete ${file.name}?`, (ok: boolean) => {
          if (!ok) return
          setDeleting(true)
          deleteFile(file.fileId).catch(e => {
            console.error(e)
          }).finally(() => setDeleting(false))
        })
      }}>{icons.trash}</Button>
    </div>
  </div>
}

const SavedFilesPopup: React.FC = () => {
  const { files, loading: loadingFiles, reload: reloadFiles } = useSavedFiles()
  const fileInput = useRef<HTMLInputElement | null>(null)
  const { selectedPeer } = useP2PContext()
  const { confirm } = useAppContext()
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'type'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [filterKind, setFilterKind] = useState<'all' | 'image' | 'video' | 'audio' | 'pdf' | 'zip' | 'code' | 'doc' | 'sheet' | 'slides' | 'text'>('all')
  const [search, setSearch] = useState('')
  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null)
  const folders = React.useMemo(() => {
    const groups: Record<string, FileMetadata[]> = {}
    const singles: FileMetadata[] = []
    const source = files.filter(f => {
      const nameOk = !search || f.name.toLowerCase().includes(search.toLowerCase())
      const kind = fileKindFrom(f.type, f.name)
      const kindOk = filterKind === 'all' || kind === filterKind
      return nameOk && kindOk
    })
    for (const f of source) {
      if (f.folderRoot) {
        (groups[f.folderRoot] ||= []).push(f)
      } else {
        singles.push(f)
      }
    }
    const cmp = (a: FileMetadata, b: FileMetadata) => {
      let v = 0
      if (sortBy === 'name') v = a.name.localeCompare(b.name)
      else if (sortBy === 'type') v = (a.type || '').localeCompare(b.type || '') || a.name.localeCompare(b.name)
      else v = (a.downloaded_at || 0) - (b.downloaded_at || 0)
      return sortDir === 'asc' ? v : -v
    }
    for (const k of Object.keys(groups)) groups[k].sort(cmp)
    singles.sort(cmp)
    return { groups, singles }
  }, [files, sortBy, sortDir, filterKind, search])
  const hasAnyFiles = files.length > 0
  const hasAnyVisible = (Object.keys(folders.groups).length + folders.singles.length) > 0
  return (
    <div className="flex flex-col w-full max-w-full gap-3">
      <div className='w-full shrink-0 sticky top-0 z-10 bg-white pt-2 pb-2 border-b border-slate-200'>
        <div className="w-full flex flex-col gap-1">
          <div className="text-base uppercase tracking-wide text-blue-700 font-semibold whitespace-nowrap">Saved Files</div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Button icon size='sm' variant='outline' className='h-10 w-10 p-0 inline-flex items-center justify-center leading-none border-blue-600 text-blue-700 hover:bg-blue-600 hover:text-white' aria-label='Reload' onClick={() => reloadFiles()}>{icons.refresh}</Button>
            <Button size='sm' className='h-10 whitespace-nowrap inline-flex items-center justify-center flex-1 sm:flex-none w-full sm:w-auto' onClick={() => {
              if (fileInput.current) {
                fileInput.current.removeAttribute('webkitdirectory')
                fileInput.current.multiple = true
                fileInput.current.click()
              }
            }}>
              <span className='inline-flex items-center gap-1'><span>{icons.file}</span><span className='text-xs sm:text-sm'>Store Files</span></span>
            </Button>
            {device.deviceType === deviceTypes.Desktop && (
              <Button size='sm' className='h-10 whitespace-nowrap inline-flex items-center justify-center' onClick={() => {
                if (fileInput.current) {
                  fileInput.current.setAttribute('webkitdirectory', 'true')
                  fileInput.current.multiple = true
                  fileInput.current.click()
                }
              }}>
                <span className='inline-flex items-center gap-1'><span>{icons.folder}</span><span className='text-xs sm:text-sm'>Store Folders</span></span>
              </Button>
            )}
          </div>
        </div>
        {hasAnyFiles ? (
          <div className="w-full mt-2">
            <div className='flex items-end justify-between gap-3 flex-wrap-reverse'>
              <div className='flex items-center gap-2 flex-wrap flex-shrink-0 w-full sm:w-auto order-1 sm:order-none'>
                <div className='flex items-stretch rounded-md border border-slate-300 bg-white overflow-hidden shadow-sm flex-none'>
                  <button type='button' className={`px-3 py-1.5 text-sm ${sortBy === 'name' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`} onClick={() => setSortBy('name')}>Name</button>
                  <div className='w-px bg-slate-200' />
                  <button type='button' className={`px-3 py-1.5 text-sm ${sortBy === 'date' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`} onClick={() => setSortBy('date')}>Date</button>
                  <div className='w-px bg-slate-200' />
                  <button type='button' className={`px-3 py-1.5 text-sm ${sortBy === 'type' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`} onClick={() => setSortBy('type')}>Type</button>
                </div>
                <Button size='sm' variant='outline' className='h-8 w-8 p-0 inline-flex items-center justify-center flex-none' aria-label='Toggle sort direction' onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSortDir(d => d === 'asc' ? 'desc' : 'asc') }}>
                  {sortDir === 'asc' ? icons.up : icons.down}
                </Button>
              </div>
              <div className='flex items-center gap-2 flex-wrap flex-1 min-w-0 w-full sm:flex-1 order-2 sm:order-none'>
                <select className='h-9 leading-6 text-sm border border-slate-300 rounded-md px-2 bg-white text-slate-800 flex-shrink-0 grow-0 basis-auto w-auto min-w-max' value={filterKind} onChange={(e) => setFilterKind(e.target.value as any)}>
                  <option value='all'>All types</option>
                  <option value='image'>Images</option>
                  <option value='video'>Video</option>
                  <option value='audio'>Audio</option>
                  <option value='pdf'>PDF</option>
                  <option value='zip'>Archives</option>
                  <option value='doc'>Docs</option>
                  <option value='sheet'>Sheets</option>
                  <option value='slides'>Slides</option>
                  <option value='code'>Code</option>
                  <option value='text'>Text</option>
                </select>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder='Search' className='h-9 leading-6 text-sm border border-slate-300 rounded-md px-2 bg-white text-slate-800 grow w-auto min-w-0' />
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col items-stretch justify-start w-full overflow-x-hidden gap-2">
        
        {loadingFiles ? (
          <div className='py-10'><LoadingPage /></div>
        ) : hasAnyVisible ? (
          <>
            {Object.entries(folders.groups).map(([folder, fList]) => {
              const open = !!expanded[folder]
              const zipName = `${folder}.zip`
              
              return (
                <div key={folder} className='w-full border border-blue-300 rounded-lg bg-blue-50'>
                  <div className='flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none' onClick={() => toggle(folder)}>
                    <div className='min-w-0 flex items-center gap-2'>
                      <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>{icons.down}</span>
                      <span className='inline-flex items-center gap-2 min-w-0'>
                        <span>{icons.folder}</span>
                        <span className='font-medium truncate'>{folder}</span>
                      </span>
                    </div>
                    <div className='flex items-center gap-2'>
                      {Boolean(localStorage.getItem('token')) && selectedPeer ? (
                        <Button size='sm' className='h-6 sm:h-8 py-0 px-2 sm:px-2.5 text-xs sm:text-sm inline-flex items-center justify-center leading-none' onClick={(e) => {
                          e.stopPropagation()
                          emitter.emit('add-saved-to-queue', { peer: selectedPeer, type: 'folder', name: zipName, files: fList })
                          toast('Folder added to queue')
                        }}>
                          <span className='inline-flex items-center gap-1 whitespace-nowrap'><span className='text-xs sm:text-sm'>Add Folder</span><span className='transform scale-90 sm:scale-100'>{icons.plus}</span></span>
                        </Button>
                      ) : null}
                      <Button icon size='sm' variant='danger' className='h-6 w-6 sm:h-8 sm:w-8' aria-label='Delete folder' disabled={deletingFolder === folder} onClick={(e) => {
                        e.stopPropagation()
                        confirm(`Delete folder ${folder} and its ${fList.length} file(s)?`, (ok: boolean) => {
                          if (!ok) return
                          setDeletingFolder(folder)
                          Promise.allSettled(fList.map(f => deleteFile(f.fileId))).then(() => {
                            toast('Folder deleted')
                          }).finally(() => setDeletingFolder(null))
                        })
                      }}>{icons.trash}</Button>
                    </div>
                  </div>
                  {open ? (
                    <div className='px-2 pb-2'>
                      <ul className='space-y-2'>
                        {fList.map(file => <li key={file.fileId}><SavedFile file={file} /></li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )
            })}
            {folders.singles.map(file => <SavedFile key={file.fileId} file={file} />)}
          </>
        ) : (
          <div className='w-full py-10 text-center text-slate-500'>{hasAnyFiles ? 'No files match your filters' : 'No files saved'}</div>
        )}
      </div>
      <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => {
        const files = Array.from(e.target.files || [])
        if (!files.length) return
        storeFiles(files).then(() => {
          toast('Stored files')
          reloadFiles()
        }).catch(e => {
          console.error(e)
          toast('Failed to store files')
        }).finally(() => {
          if (fileInput.current) fileInput.current.value = ''
        })
      }} />
    </div>
  );
};

export default SavedFilesPopup;
