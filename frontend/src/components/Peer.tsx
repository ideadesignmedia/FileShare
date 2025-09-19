import React, { useCallback, useMemo } from 'react'
import { useP2PContext } from '../context/P2PContext'
import Button from './Button'
import { useAppContext } from '../context/AppContext'
import { formatBytes } from '../utils/format'
import { estimateZipSize, streamFolderToZip } from '../utils/zip'
import device, { deviceTypes } from '../constants/device-browser'
import icons from './icons'

function FileTransferProgress({ peer, progress, fileName, fileId, isSending, close }: { peer: string, progress: number, fileName: string, fileId: string, isSending?: boolean, close: (fileId: string) => void }) {
    const { pauseTransfer, resumeTransfer, cancelTransfer, cancelUpload } = useP2PContext()
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
    return <div className='flex items-center justify-between w-full gap-3 p-3 border border-slate-200 rounded-lg bg-white shadow-sm'>
        <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-800 truncate">{fileName}</div>
            <div className="mt-1 flex items-center gap-2">
                <div className="h-2 w-full bg-slate-200 rounded">
                    <div className="h-2 bg-green-500 rounded" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-xs tabular-nums text-slate-600 w-12 text-right">{progress}%</span>
            </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
            {!isSending ? (progress !== 100 ? <>
                <Button icon size='sm' variant='primary' className='h-7 w-7 leading-none rounded' onClick={onTogglePause} aria-label={paused ? 'Resume' : 'Pause'}>
                    {paused ? icons.play : icons.pause}
                </Button>
                <Button icon size='sm' variant='danger' className='h-7 w-7 leading-none rounded' onClick={() => cancelUpload(peer, fileId)} aria-label='Cancel upload'>
                    {icons.x}
                </Button>
            </> : <>
                <Button icon size='sm' variant='danger' className='h-7 w-7 leading-none rounded' onClick={() => close(fileId)} aria-label='Close'>
                    {icons.x}
                </Button>
            </>) : <>
                {progress !== 100 ? (
                    <Button icon size='sm' variant='danger' className='h-7 w-7 leading-none rounded' onClick={() => cancelTransfer(peer, fileId)} aria-label='Cancel transfer'>
                        {icons.x}
                    </Button>
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
    const { state, flash, files } = useAppContext()
    const { requestFileTransfer, disconnectPeerConnection, selectedPeer, createPeerConnection, sentFileProgress, receivedFileProgress, connectedPeers } = useP2PContext()
    const fileRef = React.useRef<HTMLInputElement>(null)
    const [clearedFiles, setClearedFiles] = React.useState<string[]>([])
    const [selectedFiles, setSelectedFiles] = React.useState<File[]>([])
    const [dragOver, setDragOver] = React.useState(false)
    const isConnected = useMemo(() => connectedPeers.some((p) => p === peer), [connectedPeers, peer])
    const name = useMemo(() => state.peers.find(peerD => peerD.deviceId === peer)?.deviceName || peer, [peer, state])
    const handleFiles = useCallback(async () => {
        if (!isConnected) {
            flash('Not connected to peer')
            return
        }
        if (sending) return
        setSending(true)
        const filePromises = []
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
        } else {
            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i]
                filePromises.push(requestFileTransfer(peer, file).then((transfer) => {
                    if (transfer) {
                        return transfer()
                    } else {
                        flash('Failed to start file transfer')
                    }
                }).catch(e => {
                    console.error(e)
                    flash('Failed to start file transfer for:' + file.name + ' Error: ' + e.message)
                }))
            }
        }
        await Promise.allSettled(filePromises)
        setSelectedFiles([])
        setSending(false)
    }, [flash, isConnected, peer, requestFileTransfer, sending, selectedFiles]);
    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const files: File[] = Array.from(e.dataTransfer.files);
        setSelectedFiles(files);
    }, []);
    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => e.preventDefault(), []);
    const receivedProgress = useMemo(() => {
        if (!receivedFileProgress[peer]) return []
        return Object.entries(receivedFileProgress[peer]).filter(([fileId]) => !clearedFiles.includes(fileId)).map(([fileId, { name: fileName, progress }]) => ({
            fileName,
            progress,
            fileId
        }))
    }, [receivedFileProgress, peer, clearedFiles])
    const sentProgress = useMemo(() => {
        if (!sentFileProgress[peer]) return []
        return Object.entries(sentFileProgress[peer]).filter(([fileId]) => !clearedFiles.includes(fileId)).map(([fileId, { name: fileName, progress }]) => ({
            fileName,
            progress,
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
                    {receivedProgress.filter(({ fileId }) => !clearedFiles.includes(fileId)).map((file) => <FileTransferProgress key={file.fileId} peer={peer} fileId={file.fileId} progress={file.progress} fileName={file.fileName} close={clearFile} />)}
                  </div>
                </div>
            </div>) : null}
            {sentProgress.length ? (<div className='flex flex-col gap-2 w-full items-center justify-start mt-2'>
                <div className='w-full border border-slate-200 rounded-lg bg-slate-50 p-3'>
                  <div className='text-xs uppercase tracking-wide text-blue-700 mb-2'>Sent Files</div>
                  <div className='flex flex-col gap-2 w-full items-center justify-start'>
                    {sentProgress.filter(({ fileId }) => !clearedFiles.includes(fileId)).map((file) => <FileTransferProgress key={file.fileId} isSending={true} peer={peer} progress={file.progress} fileName={file.fileName} fileId={file.fileId} close={clearFile} />)}
                  </div>
                </div>
            </div>) : null}

            {isConnected ? <div className='flex flex-col gap-3 items-center justify-center mt-3'>
                <div className='w-full border border-slate-200 rounded-lg bg-slate-50 p-3'>
                  <div className='text-xs uppercase tracking-wide text-blue-700 mb-2'>Send Files</div>
                  {device.deviceType === deviceTypes.Mobile ? (
                    <div className='w-full'>
                      <Button className='w-full' disabled={sending} onClick={() => {
                        if (fileRef.current) {
                          fileRef.current.removeAttribute('webkitdirectory');
                          fileRef.current.click()
                        }
                      }}>Select Files</Button>
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
                        {!sending ? (selectedFiles.length ? <>
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
                          {files.length > 0 && <Button className='flex-1 min-w-[11rem] h-10 whitespace-nowrap' variant='primary' onClick={() => {
                            flash('Not implemented')
                          }}>
                            <span className='inline-flex items-center gap-1'><span>{icons.folder}</span><span>Add Stored File</span></span>
                          </Button>}
                          <Button className='flex-1 min-w-[11rem] h-10 whitespace-nowrap' variant="secondary" disabled={sending} onClick={() => {
                            setSelectedFiles([])
                          }}>
                            <span className='inline-flex items-center gap-1'><span>Clear Files</span><span>{icons.xSmall}</span></span>
                          </Button>
                          <Button className='flex-1 min-w-[11rem] h-10 whitespace-nowrap' variant='success' disabled={sending} onClick={handleFiles}>
                            <span className='inline-flex items-center gap-1'><span>Send Files</span><span>{icons.send}</span></span>
                          </Button>
                        </> : <>
                          {files.length > 0 && <Button className='flex-1 min-w-[11rem] h-10 whitespace-nowrap' onClick={() => {
                            flash('Not implemented')
                          }}>Add Stored File</Button>}
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
                {selectedFiles.length ? <ol className='flex flex-col gap-2 w-full items-center justify-start mt-3'>
                    {selectedFiles.map((file, i) => <li key={i} className='flex gap-3 items-center justify-between w-full p-3 rounded-lg border border-slate-200 bg-white shadow-sm'>
                        <div className='min-w-0 flex-1'>
                            <div className='text-sm font-medium text-slate-800 truncate'>{file.name}</div>
                            <div className='text-xs text-slate-600'>{formatBytes(file.size, 2)}</div>
                        </div>
                        <Button icon size='sm' variant='outlineDanger' className='h-7 w-7 leading-none rounded' aria-label='Remove file' onClick={() => {
                            setSelectedFiles((prev) => prev.filter((f) => f !== file))
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
