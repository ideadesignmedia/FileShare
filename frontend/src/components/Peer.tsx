import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useP2PContext } from '../context/P2PContext'
import Button from './Button'
import { useAppContext, emitter } from '../context/AppContext'
import { formatBytes } from '../utils/format'
import { estimateZipSize, streamFolderToZip } from '../utils/zip'
import device, { deviceTypes } from '../constants/device-browser'
import icons from './icons'
import { createIndexedDBChunkStream } from '../utils/indexed-db'
import { fileKindFrom } from '../utils/file-kind'

function FileTransferProgress({ peer, progress, fileName, fileId, isSending, close, speedBps, status }: { peer: string, progress: number, fileName: string, fileId: string, isSending?: boolean, close: (fileId: string) => void, speedBps?: number, status?: string }) {
    const { pauseTransfer, resumeTransfer, cancelTransfer, cancelUpload, requestResume, approveResume } = useP2PContext()
    const [paused, setPaused] = React.useState(false)
    const onTogglePause = React.useCallback(() => {
        if (paused) {
            resumeTransfer(peer, fileId)
            setPaused(false)
        } else {
            pauseTransfer(peer, fileId)
            setPaused(true)
        }
    }, [paused, peer, fileId, pauseTransfer, resumeTransfer])
    const terminal = status === 'completed' || status === 'cancelled' || status === 'failed' || progress === 100
    const pending = !isSending && status === 'pending'
    const containerClass = pending ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
    const kind = fileKindFrom('', fileName)
    const icon = (icons as any)[kind]
    return <div className={`flex items-center justify-between w-full gap-3 p-3 border rounded-lg shadow-sm ${containerClass}`}>
        <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-800 truncate flex items-center gap-2"><span className='text-blue-600 flex-none'>{icon}</span><span className='truncate'>{fileName}</span></div>
            <div className="mt-1 flex items-center gap-2">
                <div className="h-2 w-full bg-slate-200 rounded">
                    <div className="h-2 bg-green-500 rounded" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-xs tabular-nums text-slate-600 w-12 text-right">{progress}%</span>
            </div>
            {status && status !== 'completed' ? (
                <div className="mt-1 text-xs text-slate-600">{status}</div>
            ) : null}
            {isSending && !terminal && typeof speedBps === 'number' && speedBps >= 0 ? (
                <div className="mt-1 text-xs text-slate-600">{formatBytes(speedBps)}/s</div>
            ) : null}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
            {!isSending ? (!terminal ? <>
                {status !== 'pending' ? (
                    <Button icon size='sm' variant='primary' className='h-7 w-7 leading-none rounded' onClick={onTogglePause} aria-label={paused ? 'Resume' : 'Pause'}>
                        {paused ? icons.play : icons.pause}
                    </Button>
                ) : null}
                {status === 'pending' ? (
                    <Button size='sm' variant='success' onClick={() => requestResume(peer, fileId)}>Resume</Button>
                ) : null}
                <Button icon size='sm' variant='danger' className='h-7 w-7 leading-none rounded' onClick={() => cancelTransfer(peer, fileId)} aria-label='Cancel transfer'>
                    {icons.x}
                </Button>
            </> : <>
                <Button icon size='sm' variant='danger' className='h-7 w-7 leading-none rounded' onClick={() => close(fileId)} aria-label='Close'>
                    {icons.x}
                </Button>
            </>) : <>
                {!terminal ? (
                    <>
                        {status === 'pending' ? (
                            isSending ? (
                                <Button size='sm' variant='success' onClick={() => approveResume(peer, fileId)}>Resume</Button>
                            ) : (
                                <Button size='sm' variant='success' onClick={() => requestResume(peer, fileId)}>Resume</Button>
                            )
                        ) : null}
                        {isSending ? (
                            <Button icon size='sm' variant='danger' className='h-7 w-7 leading-none rounded' onClick={() => cancelUpload(peer, fileId)} aria-label='Cancel upload'>
                                {icons.x}
                            </Button>
                        ) : (
                            <Button icon size='sm' variant='danger' className='h-7 w-7 leading-none rounded' onClick={() => cancelTransfer(peer, fileId)} aria-label='Cancel transfer'>
                                {icons.x}
                            </Button>
                        )}
                    </>
                ) : (
                    <Button icon size='sm' variant='danger' className='h-7 w-7 leading-none rounded' onClick={() => close(fileId)} aria-label='Close'>
                        {icons.x}
                    </Button>
                )}
            </>}
        </div>
    </div>
}

export default React.memo(function Peer({ peer }: { peer: string }) {
    const [sending, setSending] = React.useState(false)
    const { state, flash, files, addPopup } = useAppContext()
    const { requestFileTransfer, disconnectPeerConnection, selectedPeer, createPeerConnection, sentFileProgress, receivedFileProgress, connectedPeers, resumeNeeds, provideResumeFile, cancelResumeNeed } = useP2PContext()
    const resumeInputRef = React.useRef<HTMLInputElement>(null)
    const fileRef = React.useRef<HTMLInputElement>(null)
    const [clearedFiles, setClearedFiles] = React.useState<string[]>([])
    const [selectedFiles, setSelectedFiles] = React.useState<File[]>([])
    const [selectedSaved, setSelectedSaved] = React.useState<{ fileId: string, name: string, type: string, size: number }[]>([])
    const [dragOver, setDragOver] = React.useState(false)
    const [uploadSpeeds, setUploadSpeeds] = useState<Record<string, number>>({})
    useEffect(() => {
        const handler = ({ fileId, bps }: any) => setUploadSpeeds(prev => ({ ...prev, [fileId]: bps }))
        emitter.on('upload-speed', handler)
        return () => {
            emitter.off('upload-speed', handler)
        }
    }, [])
    useEffect(() => {
        const addSaved = (p: any) => {
            if (!p || p.peer !== peer) return
            if (p.type === 'file') {
                setSelectedSaved(prev => [...prev, { fileId: p.fileId, name: p.name, type: p.typeVal, size: p.size }])
            } else if (p.type === 'folder' && Array.isArray(p.files)) {
                import('../utils/zip').then(async z => {
                    const filesForZip = p.files.map((f: any) => ({ fileId: f.fileId, relativePath: f.relativePath || f.name }))
                    const blob = await z.zipSavedFolderToBlob(filesForZip)
                    const f = new File([blob], p.name, { type: 'application/zip' })
                    setSelectedFiles(prev => [...prev, f])
                })
            }
        }
        emitter.on('add-saved-to-queue', addSaved)
        return () => { emitter.off('add-saved-to-queue', addSaved) }
    }, [peer])
    const isConnected = useMemo(() => connectedPeers.some((p) => p === peer), [connectedPeers, peer])
    const name = useMemo(() => state.peers.find(peerD => peerD.deviceId === peer)?.deviceName || peer, [peer, state])
    const handleFiles = useCallback(async () => {
        if (!isConnected) {
            flash('Not connected to peer')
            return
        }
        if (sending) return
        setSending(true)
        const filePromises: Promise<any>[] = []
        if (selectedFiles.some(({ webkitRelativePath }) => webkitRelativePath)) {
            const name = selectedFiles[0].webkitRelativePath.split('/')[0] + '.zip'
            filePromises.push(requestFileTransfer(peer, streamFolderToZip(selectedFiles), { type: 'application/zip', size: estimateZipSize(selectedFiles), name }).then((transfer) => {
                if (transfer) {
                    return transfer()
                } else {
                    flash('Failed to start file transfer')
                }
            }).catch(e => {
                console.error(e)
                flash('Failed to start file transfer for:' + name + ' Error: ' + e.message)
            }))
        }
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i]
            filePromises.push(requestFileTransfer(peer, file).then((transfer) => {
                if (transfer) {
                    return transfer()
                } else {
                    flash('Failed to start file transfer for:' + file.name)
                }
            }).catch(e => {
                console.error(e)
                flash('Failed to start file transfer for:' + file.name + ' Error: ' + e.message)
            }))
        }
        for (let i = 0; i < selectedSaved.length; i++) {
            const s = selectedSaved[i]
            filePromises.push(
                createIndexedDBChunkStream(s.fileId).then((rs) => {
                    return requestFileTransfer(peer, rs as any, { name: s.name, type: s.type, size: s.size, savedFileId: s.fileId }).then((transfer) => {
                        if (transfer) return transfer()
                        else flash('Failed to start file transfer for:' + s.name)
                    })
                }).catch(e => {
                    console.error(e)
                    flash('Failed to prepare stored file')
                })
            )
        }
        await Promise.allSettled(filePromises)
        setSelectedFiles([])
        setSelectedSaved([])
        setSending(false)
    }, [flash, isConnected, peer, requestFileTransfer, sending, selectedFiles, selectedSaved]);
    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const files: File[] = Array.from(e.dataTransfer.files);
        setSelectedFiles(files);
    }, []);
    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => e.preventDefault(), []);
    const receivedProgress = useMemo(() => {
        if (!receivedFileProgress[peer]) return []
        return Object.entries(receivedFileProgress[peer]).filter(([fileId]) => !clearedFiles.includes(fileId)).map(([fileId, { name: fileName, progress, status }]) => ({
            fileName,
            progress,
            status,
            fileId
        }))
    }, [receivedFileProgress, peer, clearedFiles])
    const sentProgress = useMemo(() => {
        if (!sentFileProgress[peer]) return []
        return Object.entries(sentFileProgress[peer]).filter(([fileId]) => !clearedFiles.includes(fileId)).map(([fileId, { name: fileName, progress, status }]) => ({
            fileName,
            progress,
            status,
            fileId
        }))
    }, [sentFileProgress, peer, clearedFiles])
    const clearFile = useCallback((fileId: string) => {
        setClearedFiles((prev) => [...prev, fileId])
    }, [])
    if (peer !== selectedPeer) return
    return <div
        className='flex flex-col w-full max-w-full gap-3 items-center justify-center h-full max-h-full overflow-y-auto'>
        <div className="w-full">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
            <div className='flex items-start justify-between w-full mb-2'>
                <div className="min-w-0">
                    {isConnected && <div className="text-xs uppercase tracking-wide text-blue-700 font-semibold mb-1">Connected Peer</div>}
                    <div className="min-w-0">
                        <div className="text-sm text-slate-600 truncate">{name}</div>
                    </div>
                </div>
                {isConnected && (
                  <div className='flex items-center gap-2'>
                    <Button icon size="sm" variant='danger' className='h-7 w-7 leading-none rounded' onClick={() => disconnectPeerConnection(peer)} aria-label='Disconnect'>
                      {icons.power}
                    </Button>
                  </div>
                )}
            </div>

            {receivedProgress.length ? (<div className='flex flex-col gap-2 w-full items-center justify-start mt-2'>
                <div className='w-full border border-slate-200 rounded-lg bg-slate-50 p-3'>
                  <div className='text-xs uppercase tracking-wide text-blue-700 mb-2'>Received Files</div>
                  <div className='flex flex-col gap-2 w-full items-center justify-start'>
                    {receivedProgress.filter(({ fileId }) => !clearedFiles.includes(fileId)).map((file) => <FileTransferProgress key={file.fileId} peer={peer} fileId={file.fileId} progress={file.progress} fileName={file.fileName} status={file.status} close={clearFile} />)}
                  </div>
                </div>
            </div>) : null}
            {sentProgress.length ? (<div className='flex flex-col gap-2 w-full items-center justify-start mt-2'>
                <div className='w-full border border-slate-200 rounded-lg bg-slate-50 p-3'>
                  <div className='text-xs uppercase tracking-wide text-blue-700 mb-2'>Sent Files</div>
                  <div className='flex flex-col gap-2 w-full items-center justify-start'>
                    {sentProgress.filter(({ fileId }) => !clearedFiles.includes(fileId)).map((file) => <FileTransferProgress key={file.fileId} isSending={true} peer={peer} progress={file.progress} status={file.status} fileName={file.fileName} fileId={file.fileId} close={clearFile} speedBps={uploadSpeeds[file.fileId]} />)}
                  </div>
                </div>
            </div>) : null}

            {isConnected ? <div className='flex flex-col gap-3 items-center justify-center mt-3'>
                {resumeNeeds[peer] && Object.keys(resumeNeeds[peer]).length ? (
                    <div className='w-full border border-amber-300 rounded-lg bg-amber-50 p-3'>
                      <div className='text-xs uppercase tracking-wide text-amber-700 mb-2'>Resume Needed</div>
                      <ul className='space-y-2'>
                        {Object.entries(resumeNeeds[peer]).map(([fileId, info]) => (
                          <li key={fileId} className='flex items-center justify-between gap-2'>
                            <div className='min-w-0'>
                              <div className='font-medium truncate'>{info.name}</div>
                              <div className='text-xs text-slate-600 truncate'>Needs original file to resume</div>
                            </div>
                            <div className='flex items-center gap-2'>
                              <Button size='sm' onClick={() => {
                                const input = document.createElement('input')
                                input.type = 'file'
                                input.onchange = (e: any) => {
                                  const f = e.target.files && e.target.files[0]
                                  if (f) provideResumeFile(peer, fileId, f)
                                }
                                input.click()
                              }}>Select File</Button>
                              <Button size='sm' variant='outlineDanger' onClick={() => cancelResumeNeed(peer, fileId)}>Cancel</Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                ) : null}
                <div className='w-full border border-slate-200 rounded-lg bg-slate-50 p-3'>
                  <div className='text-xs uppercase tracking-wide text-blue-700 mb-2'>Send Files</div>
                  {device.deviceType === deviceTypes.Mobile ? (
                    <div className='w-full'>
                      {!sending ? (
                        (selectedFiles.length || selectedSaved.length) ? (
                          <div className='flex flex-col gap-2'>
                            <div className='flex flex-wrap gap-2'>
                              <Button className='flex-1 min-w-[11rem] h-10 whitespace-nowrap' variant="primary" disabled={sending} onClick={() => {
                                if (fileRef.current) {
                                  fileRef.current.removeAttribute('webkitdirectory');
                                  fileRef.current.click()
                                }
                              }}>
                                <span className='inline-flex items-center gap-1'><span>{icons.plus}</span><span>Add More</span></span>
                              </Button>
                              <Button className='flex-1 min-w-[11rem] h-10 whitespace-nowrap' variant='secondary' disabled={sending} onClick={() => { setSelectedFiles([]); setSelectedSaved([]) }}>
                                <span className='inline-flex items-center gap-1'><span>Clear</span><span>{icons.xSmall}</span></span>
                              </Button>
                            </div>
                            <Button className='w-full h-10 whitespace-nowrap' variant='success' disabled={sending} onClick={handleFiles}>
                              <span className='inline-flex items-center gap-1'><span>Send Files</span><span>{icons.send}</span></span>
                            </Button>
                          </div>
                        ) : (
                          <Button className='w-full' disabled={sending} onClick={() => {
                            if (fileRef.current) {
                              fileRef.current.removeAttribute('webkitdirectory');
                              fileRef.current.click()
                            }
                          }}>Select Files</Button>
                        )
                      ) : (
                        <div className='text-center text-sm text-slate-600'>Sending...</div>
                      )}
                    </div>
                  ) : (
                    <div
                      className={`w-full rounded-md border-2 border-dashed p-4 text-center transform transition-all duration-300 ease-in-out ${dragOver ? 'border-blue-600 bg-blue-100 scale-[1.01]' : 'border-blue-300 bg-blue-50 scale-100'}`}
                      onDrop={(e) => { setDragOver(false); handleDrop(e) }}
                      onDragOver={(e) => { setDragOver(true); handleDragOver(e) }}
                      onDragEnter={() => setDragOver(true)}
                      onDragLeave={() => setDragOver(false)}
                    >
                      <div className='flex items-center justify-center gap-2 text-sm text-blue-700 mb-3'>
                        <span className='inline-flex items-center justify-center w-6 h-6 rounded bg-blue-100 text-blue-700'>
                          {icons.dropzone}
                        </span>
                        <span>Drag and drop files here or use the buttons.</span>
                      </div>
                      <div className='flex flex-wrap gap-2 items-stretch justify-center w-full'>
                        {!sending ? ((selectedFiles.length || selectedSaved.length) ? <>
                          <Button className='flex-1 min-w-[11rem] h-10 whitespace-nowrap' variant="primary" disabled={sending} onClick={() => {
                            if (fileRef.current) {
                              fileRef.current.removeAttribute('webkitdirectory');
                              fileRef.current.click()
                            }
                          }}>
                            <span className='inline-flex items-center gap-1'><span>{icons.plus}</span><span>Add Files</span></span>
                          </Button>
                          {device.deviceType === deviceTypes.Desktop && <Button className='flex-1 min-w-[11rem] h-10 whitespace-nowrap' variant='primary' disabled={sending} onClick={() => {
                            if (fileRef.current) {
                              fileRef.current.setAttribute('webkitdirectory', 'true');
                              fileRef.current.click()
                            }
                          }}>
                            <span className='inline-flex items-center gap-1'><span>{icons.folder}</span><span>Add Folder</span></span>
                          </Button>}
                          <Button className='flex-1 min-w-[11rem] h-10 whitespace-nowrap' variant='primary' onClick={() => {
                            addPopup('select-saved-file', {
                              onSelect: ({ fileId, name, type, size }: any) => {
                                setSelectedSaved(prev => [...prev, { fileId, name, type, size }])
                              }
                            })
                          }}>
                            <span className='inline-flex items-center gap-1'><span>{icons.folder}</span><span>Add Stored File</span></span>
                          </Button>
                          <Button className='flex-1 min-w-[11rem] h-10 whitespace-nowrap' variant="secondary" disabled={sending} onClick={() => {
                            setSelectedFiles([]); setSelectedSaved([])
                          }}>
                            <span className='inline-flex items-center gap-1'><span>Clear Files</span><span>{icons.xSmall}</span></span>
                          </Button>
                          <Button className='flex-1 min-w-[11rem] h-10 whitespace-nowrap' variant='success' disabled={sending} onClick={handleFiles}>
                            <span className='inline-flex items-center gap-1'><span>Send Files</span><span>{icons.send}</span></span>
                          </Button>
                        </> : <>
                          <Button className='flex-1 min-w-[11rem] h-10 whitespace-nowrap' onClick={() => {
                            addPopup('select-saved-file', {
                              onSelect: ({ fileId, name, type, size }: any) => {
                                setSelectedSaved(prev => [...prev, { fileId, name, type, size }])
                              }
                            })
                          }}>Add Stored File</Button>
                          <Button className='flex-1 min-w-[11rem] h-10 whitespace-nowrap' disabled={sending} onClick={() => {
                            if (fileRef.current) {
                              fileRef.current.removeAttribute('webkitdirectory');
                              fileRef.current.click()
                            }
                          }}>Select Files</Button>
                          {device.deviceType === deviceTypes.Desktop && <Button className='flex-1 min-w-[11rem] h-10 whitespace-nowrap' disabled={sending} onClick={() => {
                            if (fileRef.current) {
                              fileRef.current.setAttribute('webkitdirectory', 'true');
                              fileRef.current.click()
                            }
                          }}>Send Folder</Button>}
                        </>) : <div>
                          <p>Sending...</p>
                        </div>}
                      </div>
                    </div>
                  )}
                {(selectedFiles.length || selectedSaved.length) ? <ol className='flex flex-col gap-2 w-full items-center justify-start mt-3'>
                    {selectedFiles.map((file, i) => <li key={`f-${i}`} className='flex gap-3 items-center justify-between w-full p-3 rounded-lg border border-slate-200 bg-white shadow-sm'>
                        <div className='min-w-0 flex-1'>
                            <div className='text-sm font-medium text-slate-800 truncate flex items-center gap-2'>
                              <span className='text-blue-600 flex-none'>{(icons as any)[fileKindFrom(file.type, file.name)]}</span>
                              <span className='truncate'>{file.name}</span>
                            </div>
                            <div className='text-xs text-slate-600'>{formatBytes(file.size, 2)}</div>
                        </div>
                        <Button icon size='sm' variant='outlineDanger' className='h-7 w-7 leading-none rounded' aria-label='Remove file' onClick={() => {
                            setSelectedFiles((prev) => prev.filter((f) => f !== file))
                        }}>{icons.trash}</Button>
                    </li>)}
                    {selectedSaved.map((s, i) => <li key={`s-${i}`} className='flex gap-3 items-center justify-between w-full p-3 rounded-lg border border-slate-200 bg-white shadow-sm'>
                        <div className='min-w-0 flex-1'>
                            <div className='text-sm font-medium text-slate-800 truncate flex items-center gap-2'>
                              <span className='text-blue-600 flex-none'>{(icons as any)[fileKindFrom(s.type, s.name)]}</span>
                              <span className='truncate'>{s.name}</span>
                            </div>
                            <div className='text-xs text-slate-600'>{formatBytes(s.size, 2)}</div>
                        </div>
                        <Button icon size='sm' variant='outlineDanger' className='h-7 w-7 leading-none rounded' aria-label='Remove file' onClick={() => {
                            setSelectedSaved((prev) => prev.filter((x) => x !== s))
                        }}>{icons.trash}</Button>
                    </li>)}
                </ol> : null}
                <input ref={fileRef} disabled={sending} multiple type="file" hidden onChange={(e) => {
                    if (e.target.files) {
                        setSelectedFiles(Array.from(e.target.files))
                        e.target.value = ''
                    }
                }} />
                </div>
            </div> : <div className='flex flex-col gap-2 items-center justify-center mt-3'>
                <h4>Not connected to: {peer}</h4>
            </div>}
          </div>
        </div>
    </div>
})
