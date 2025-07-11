import React, { useCallback, useMemo } from 'react'
import { useP2PContext } from '../context/P2PContext'
import Button from './Button'
import { useAppContext } from '../context/AppContext'
import { formatBytes } from '../utils/format'
import { estimateZipSize, streamFolderToZip } from '../utils/zip'
import device, { deviceTypes } from '../constants/device-browser'

function FileTransferProgress({ peer, progress, fileName, fileId, isSending, close }: { peer: string, progress: number, fileName: string, fileId: string, isSending?: boolean, close: (fileId: string) => void }) {
    const { pauseTransfer, resumeTransfer, cancelTransfer, cancelUpload } = useP2PContext()
    return <div className='flex gap-2 items-center justify-center w-full flex-wrap p-2 border-1 border-blue-600'>
        <div className="flex gap-1 items-center flex-wrap justify-start w-full">
            <p>{fileName}: {progress}%</p>
            <div style={{ width: '100px', height: '10px', backgroundColor: 'lightgray' }}>
                <div style={{ width: `${progress}%`, height: '100%', backgroundColor: 'green' }}></div>
            </div>
        </div>
        <div className="flex grow items-center justify-start flex-wrap gap-2">
            {!isSending ? (progress !== 100 ? <>
                <Button variant='outline' onClick={() => pauseTransfer(peer, fileId)}>Pause</Button>
                <Button variant='outline' onClick={() => resumeTransfer(peer, fileId)}>Resume</Button>
                <Button variant='outline' onClick={() => cancelUpload(peer, fileId)}>Cancel</Button>
            </> : <>
                <Button variant='outline' onClick={() => close(fileId)}>X</Button>
            </>) : <>
                {progress !== 100 ? <Button variant='outline' onClick={() => cancelTransfer(peer, fileId)}>Cancel</Button> :
                    <Button variant='outline' onClick={() => close(fileId)}>X</Button>
                }
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
    }, [alert, flash, isConnected, peer, requestFileTransfer, sending, selectedFiles]);
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
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className='flex flex-col w-full max-w-full gap-2 items-center justify-center p-2 h-full max-h-full overflow-y-auto'>
        <h3>{name}</h3>
        {receivedProgress.length ? (<div className='flex flex-col gap-2 w-full items-center justify-start'>
            <h3>Received Files</h3>
            <div className='flex flex-col gap-2 w-full items-center justify-start'>
                {receivedProgress.filter(({ fileId }) => !clearedFiles.includes(fileId)).map((file) => <FileTransferProgress key={file.fileId} peer={peer} fileId={file.fileId} progress={file.progress} fileName={file.fileName} close={clearFile} />)}
            </div>
        </div>) : null}
        {sentProgress.length ? (<div className='flex flex-col gap-2 w-full items-center justify-start'>
            <h3>Sent Files</h3>
            <div className='flex flex-col gap-2 w-full items-center justify-start'>
                {sentProgress.filter(({ fileId }) => !clearedFiles.includes(fileId)).map((file) => <FileTransferProgress key={file.fileId} isSending={true} peer={peer} progress={file.progress} fileName={file.fileName} fileId={file.fileId} close={clearFile} />)}
            </div>
        </div>) : null}
        {isConnected ? <div className='flex flex-col gap-2 items-center justify-center'>
            <h4>Send Files</h4>
            {selectedFiles.length ? <ol className='flex flex-col gap-2 w-full items-center justify-start'>
                {selectedFiles.map((file, i) => <li key={i} className='flex gap-1 items-center justify-center w-full p-2 rounded border-1 border-blue-500'>
                    <div className='flex flex-col flex-grow'>
                        <h5>{file.name}</h5>
                        <p>{formatBytes(file.size, 2)}</p>
                    </div>
                    <button onClick={() => {
                        setSelectedFiles((prev) => prev.filter((f) => f !== file))
                    }}>Remove</button>
                </li>)}
            </ol> : null}
            <input ref={fileRef} disabled={sending} multiple type="file" hidden onChange={(e) => {
                if (e.target.files) {
                    setSelectedFiles(Array.from(e.target.files))
                    e.target.value = ''
                }
            }} />
            <div className='flex gap-2 items-center justify-center my-1'>
                {!sending ? (selectedFiles.length ? <>
                    <Button disabled={sending} onClick={handleFiles}>Send</Button>
                    <Button size="sm" variant="secondary" disabled={sending} onClick={() => {
                        setSelectedFiles([])
                    }
                    }>Clear</Button>
                </> : <>
                    {files.length > 0 && <Button onClick={() => {
                        flash('Not implemented')
                    }}>Add Stored File</Button>}
                    <Button disabled={sending} onClick={() => {
                        if (fileRef.current) {
                            fileRef.current.removeAttribute('webkitdirectory');
                            fileRef.current.click()
                        }
                    }
                    }>Select Files</Button>
                    {device.deviceType === deviceTypes.Desktop && <Button disabled={sending} onClick={() => {
                        if (fileRef.current) {
                            fileRef.current.setAttribute('webkitdirectory', 'true');
                            fileRef.current.click()
                        }
                    }}>Send Folder</Button>}
                </>) : <div>
                    <p>Sending...</p>
                </div>}
            </div>
        </div> : <div className='flex flex-col gap-2 items-center justify-center'>
            <h4>Not connected to: {peer}</h4>
        </div>}
        {isConnected ? <Button size="sm" variant='danger' className="mt-5" onClick={() => {
            disconnectPeerConnection(peer)
        }}>Disconnect</Button> : <Button className="mt-5" onClick={() => {
            createPeerConnection(peer, true)
        }}>
            Connect to Peer
        </Button>}
    </div>
})