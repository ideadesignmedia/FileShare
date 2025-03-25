import React, { useCallback, useMemo } from 'react'
import { largeFileSize, useP2PContext } from '../context/P2PContext'
import Button from './Button'
import { useAppContext } from '../context/AppContext'
import { formatBytes } from '../utils/format'
import { estimateZipSize, streamFolderToZip } from '../utils/zip'

function FileTransferProgress({ peer, progress, fileName, fileId, isSending, close }: { peer: string, progress: number, fileName: string, fileId: string, isSending?: boolean, close: (fileId: string) => void }) {
    const { pauseTransfer, resumeTransfer, cancelTransfer, cancelUpload } = useP2PContext()
    return <div className='flex gap-2 items-center justify-center w-full'>
        <p>{fileName}: {progress}%</p>
        <div style={{ width: '100px', height: '10px', backgroundColor: 'lightgray' }}>
            <div style={{ width: `${progress}%`, height: '100%', backgroundColor: 'green' }}></div>
        </div>
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
}

export default React.memo(function Peer({ peer }: { peer: string }) {
    const [sending, setSending] = React.useState(false)
    const { alert, flash } = useAppContext()
    const { requestFileTransfer, disconnectPeerConnection, selectedPeer, createPeerConnection, sentFileProgress, receivedFileProgress, connectedPeers } = useP2PContext()
    const fileRef = React.useRef<HTMLInputElement>(null)
    const [clearedFiles, setClearedFiles] = React.useState<string[]>([])
    const [selectedFiles, setSelectedFiles] = React.useState<File[]>([])
    const isConnected = useMemo(() => connectedPeers.some((p) => p === peer), [connectedPeers, peer])
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
                    alert('Failed to start file transfer')
                }
            }).catch(e => {
                console.error(e)
                alert('Failed to start file transfer for:' + name + ' Error: ' + e.message)
            }))
        } else {
            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i]
                filePromises.push(requestFileTransfer(peer, file).then((transfer) => {
                    if (transfer) {
                        return transfer()
                    } else {
                        alert('Failed to start file transfer')
                    }
                }).catch(e => {
                    console.error(e)
                    alert('Failed to start file transfer for:' + file.name + ' Error: ' + e.message)
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
        return Object.entries(receivedFileProgress[peer]).map(([fileId, { name: fileName, progress }]) => ({
            fileName,
            progress,
            fileId
        }))
    }, [receivedFileProgress, peer])
    const sentProgress = useMemo(() => {
        if (!sentFileProgress[peer]) return []
        return Object.entries(sentFileProgress[peer]).map(([fileId, { name: fileName, progress }]) => ({
            fileName,
            progress,
            fileId
        }))
    }, [sentFileProgress, peer])
    const clearFile = useCallback((fileId: string) => {
        setClearedFiles((prev) => [...prev, fileId])
    }, [])
    if (peer !== selectedPeer) return
    return <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className='flex flex-col w-full gap-2 items-center justify-center my-2'>
        <h3>{peer}</h3>
        {receivedProgress.length ? (<div className='flex flex-col gap-2 w-full'>
            <h3>Received Files</h3>
            <div className='flex flex-col gap-2 w-full'>
                {receivedProgress.filter(({ fileId }) => !clearedFiles.includes(fileId)).map((file) => <FileTransferProgress key={file.fileName} peer={peer} fileId={file.fileId} progress={file.progress} fileName={file.fileName} close={clearFile} />)}
            </div>
        </div>) : null}
        {sentProgress.length ? (<div className='flex flex-col gap-2 w-full'>
            <h3>Sent Files</h3>
            <div className='flex flex-col gap-2 w-full'>
                {sentProgress.filter(({ fileId }) => !clearedFiles.includes(fileId)).map((file) => <FileTransferProgress key={file.fileId} isSending={true} peer={peer} progress={file.progress} fileName={file.fileName} fileId={file.fileId} close={clearFile} />)}
            </div>
        </div>) : null}
        {isConnected ? <div className='flex flex-col gap-2 items-center justify-center'>
            <h4>Send Files</h4>
            {selectedFiles.length ? <ol className='flex flex-col gap-2'>
                {selectedFiles.map((file, i) => <li key={i} className='flex gap-1 items-center justify-center'>
                    <div className='flex flex-col flex-grow'>
                        <h5>{file.name}</h5>
                        <p>{formatBytes(file.size)} bytes</p>
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
                    <button disabled={sending} onClick={handleFiles}>Send</button>
                    <button disabled={sending} onClick={() => {
                        setSelectedFiles([])
                    }
                    }>Clear</button>
                </> : <>
                    <button disabled={sending} onClick={() => {
                        if (fileRef.current) {
                            fileRef.current.removeAttribute('webkitdirectory');
                            fileRef.current.click()
                        }
                    }
                    }>Select Files</button>
                    <button disabled={sending} onClick={() => {
                        if (fileRef.current) {
                            fileRef.current.setAttribute('webkitdirectory', 'true');
                            fileRef.current.click()
                        }
                    }}>Send Folder</button>
                </>) : <div>
                    <p>Sending...</p>
                </div>}
            </div>
        </div> : <div className='flex flex-col gap-2 items-center justify-center'>
            <h4>Not connected to: {peer}</h4>
        </div>}
        {isConnected ? <Button className="mt-3" onClick={() => {
            disconnectPeerConnection(peer)
        }}>Disconnect</Button> : <Button className="mt-3" onClick={() => {
            createPeerConnection(peer, true)
        }}>
            Connect to Peer
        </Button>}
    </div>
})