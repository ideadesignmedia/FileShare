import React, { useContext, createContext, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSocket } from './SocketContext';
import { emit, emitter, useAppContext } from './AppContext';
import { chunkSize, largeFileSize, maxBufferAmount, maxMessageSize, numberOfChannels, rtcOptions } from '../constants';
import { saveChunkToIndexedDB, deleteFileFromIndexedDB, createIndexedDBChunkStream, saveFileMetadata, deleteFileMetadata, addDownload, updateDownload, patchDownload, addUploadSession, patchUploadSession, deleteUploadSession, getUploadSessionByFileId, listAllDownloadMetadata, getDownloadedBytes, createIndexedDBFileByteStream, listAllUploadSessions, deleteDownload } from '../utils/indexed-db';
import { BSON } from 'bson';
import { compressSync as brotliCompress, decompressSync as brotliDecompress, Deflate, Inflate } from "fflate";
import { formatBytes } from '../utils/format';
import { createEncrypter, createEncrypterCTR, createDecrypterCTR, createDecrypter, createEncryptionStreamCTR } from '../utils/encryption';
import { deviceId as myDeviceId } from '../constants'
import device from '../constants/device-browser';
import { Buffer } from 'buffer';
import { downloadBlob } from '../utils/handle-file';
import { createChunkedFileWriter } from '../utils/file-writer';
import { FileMessage, Parts, PeerBroadCastMessage, PeerMessage, ReceivedFileInfo, TransferStatus } from '../types/peer-to-peer';
import { checkIfFile } from '../utils/check-if-file';

export type P2PContextType = {
    sendMessage: (deviceId: string, payload: PeerMessage, requestId?: string, timeout?: number) => Promise<PeerMessage | null>;
    sendFile: (deviceId: string, file: File, fileId: string) => void;
    createPeerConnection: (deviceId: string, isInitiator: boolean) => RTCPeerConnection | undefined;
    disconnectPeerConnection: (deviceId: string) => void;
    requestFileTransfer: (deviceId: string, file: File | ReadableStream, fileInfo?: { type: string, name: string, size: number, savedFileId?: string }) => Promise<() => void>;
    pauseTransfer: (deviceId: string, fileId: string) => void;
    resumeTransfer: (deviceId: string, fileId: string) => void;
    cancelTransfer: (deviceId: string, fileId: string) => void;
    cancelUpload: (deviceId: string, fileId: string) => void;
    connectedPeers: string[],
    availablePeers: string[],
    receivedFileProgress: { [deviceId: string]: { [fileId: string]: { progress: number, name: string, status?: string } } };
    sentFileProgress: { [deviceId: string]: { [fileId: string]: { progress: number, name: string, status?: string } } };
    selectedPeer: string
    setSelectedPeer: React.Dispatch<React.SetStateAction<string>>
    setAutoAcceptFiles: React.Dispatch<React.SetStateAction<boolean>>
    setAutoDownloadFiles: React.Dispatch<React.SetStateAction<boolean>>
    autoAcceptFiles: boolean,
    autoDownloadFiles: boolean
    autoResume?: boolean
    setAutoResume?: React.Dispatch<React.SetStateAction<boolean>>
    resumeNeeds: { [deviceId: string]: { [fileId: string]: { name: string, type: string, size: number, receivedChunks: number } } }
    provideResumeFile: (deviceId: string, fileId: string, file: File) => void
    cancelResumeNeed: (deviceId: string, fileId: string) => void
    requestResume: (deviceId: string, fileId: string) => void
    approveResume: (deviceId: string, fileId: string) => void
};

const P2PContext = createContext<P2PContextType | undefined>(undefined);

export const P2PProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const { state, confirm, flash } = useAppContext();
    const { send } = useSocket();
    const [autoAcceptFiles, setAutoAcceptFiles] = React.useState(Boolean(localStorage.getItem('auto-accept')))
    const [autoDownloadFiles, setAutoDownloadFiles] = React.useState(Boolean(localStorage.getItem('auto-download')))
    const [selectedPeer, setSelectedPeer] = React.useState<string>('');
    const peerConnections = useRef<{ [deviceId: string]: RTCPeerConnection }>({});
    const requestedPeers = useRef<Set<string>>(new Set());
    const dataChannels = useRef<{ [deviceId: string]: RTCDataChannel[] }>({});
    const nextChannelIndex = useRef<{ [deviceId: string]: number }>({});
    const disconnectionCount = useRef<{ [deviceId: string]: number }>({});
    const receivedFiles = useRef<{ [deviceId: string]: { [fileId: string]: ReceivedFileInfo } }>({});
    const receivedFilePromises = useRef<{ [deviceId: string]: { [fileId: string]: Promise<ReceivedFileInfo> } }>({})
    const receivedChunks = useRef<{ [deviceId: string]: { [fileId: string]: Map<number, Parts> } }>({});
    const currentTransfers = useRef<{ [deviceId: string]: { [fileId: string]: TransferStatus } }>({});
    const pausedTransfers = useRef<{ [deviceId: string]: { [fileId: string]: boolean } }>({});
    const pendingFileRequests = useRef<{
        [fileId: string]: {
            size: number,
            name: string,
            type: string
        }
    }>({});
    const messageTimeouts = useRef<{ [requestId: string]: any }>({});
    const uploadSessions = useRef<{ [deviceId: string]: { [fileId: string]: { file?: File, name: string, type: string, size: number, small: boolean, key?: Uint8Array, iv?: Uint8Array, password?: string } } }>({});
    const resumeRequested = useRef<{ [deviceId: string]: Set<string> }>({});
    const pendingOffers = useRef<{ [deviceId: string]: Set<string> }>({});
    const [resumeNeeds, setResumeNeeds] = React.useState<{ [deviceId: string]: { [fileId: string]: { name: string, type: string, size: number, receivedChunks: number } } }>({});
    const [rtcPeers, setRtcPeers] = React.useState<{ [deviceId: string]: boolean }>({});
    const [autoResume, setAutoResume] = React.useState<boolean>(Boolean(localStorage.getItem('auto-resume')))
    const [receivedFileProgress, setReceivedFileProgress] = React.useState<{
        [deviceId: string]: { [fileId: string]: { progress: number, name: string, status?: string } }
    }>({});
    const [sentFileProgress, setSentFileProgress] = React.useState<{
        [deviceId: string]: { [fileId: string]: { progress: number, name: string, status?: string } }
    }>({});
    const downloadSpeed = useRef<{ [deviceId: string]: { [fileId: string]: { lastBytes: number, lastTs: number } } }>({});
    const uploadSpeed = useRef<{ [deviceId: string]: { [fileId: string]: { lastBytes: number, lastTs: number } } }>({});
    const requestResume = useCallback((deviceId: string, fileId: string) => {
        Promise.all([
            listAllDownloadMetadata().catch(() => []),
            getDownloadedBytes(fileId).catch(() => 0)
        ]).then(([list, bytes]) => {
            const rec = (list as any[]).find((d: any) => d.fileId === fileId && d.deviceId === deviceId)
            const receivedChunks = rec?.chunks_received || 0
            sendMessage(deviceId, { type: 'resume-request', data: { fileId, receivedChunks, receivedBytes: bytes } })
            setReceivedFileProgress(prev => ({
                ...prev,
                [deviceId]: {
                    ...(prev[deviceId] || {}),
                    [fileId]: {
                        ...(prev[deviceId]?.[fileId] || { name: rec?.name || fileId, progress: 0 }),
                        status: 'waiting-for-sender'
                    }
                }
            }))
        })
    }, [])
    useEffect(() => {
        if (autoAcceptFiles) {
            localStorage.setItem('auto-accept', 'true')
        } else {
            localStorage.removeItem('auto-accept')
        }
    }, [autoAcceptFiles])
    useEffect(() => {
        if (autoDownloadFiles) {
            localStorage.setItem('auto-download', 'true')
        } else {
            localStorage.removeItem('auto-download')
        }
    }, [autoDownloadFiles])
    useEffect(() => {
        if (autoResume) localStorage.setItem('auto-resume', 'true')
        else localStorage.removeItem('auto-resume')
    }, [autoResume])

    useEffect(() => {
        const setStatus = (fileId: string, status: string) => {
            setReceivedFileProgress(prev => {
                const next = { ...prev } as typeof prev;
                let changed = false;
                for (const devId of Object.keys(next)) {
                    const deviceFiles = next[devId];
                    if (deviceFiles && deviceFiles[fileId]) {
                        deviceFiles[fileId] = {
                            ...deviceFiles[fileId],
                            progress: status === 'completed' ? 100 : deviceFiles[fileId].progress,
                            status
                        };
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        };
        const onComplete = (fileId: string) => setStatus(fileId, 'completed');
        const onCancelled = (fileId: string) => setStatus(fileId, 'cancelled');
        const onSaved = (fileId: string) => setStatus(fileId, 'completed');
        emitter.on('download-complete', onComplete);
        emitter.on('download-cancelled', onCancelled);
        emitter.on('file-saved', onSaved);
        return () => {
            emitter.off('download-complete', onComplete);
            emitter.off('download-cancelled', onCancelled);
            emitter.off('file-saved', onSaved);
        };
    }, [])
    const sendMessage = (deviceId: string, payload: PeerMessage, requestId?: string, timeout = 5000): Promise<PeerMessage | null> => {
        const transmit = () => {
            send(
                deviceId === 'all'
                    ? { type: 'broadcast-all', data: { payload } }
                    : { type: 'broadcast', data: { deviceId, payload } }
            );
        };

        if (requestId) {
            return new Promise((resolve, reject) => {
                payload.requestId = requestId;
                const callback = (response: PeerMessage) => {
                    clearTimeout(messageTimeouts.current[requestId]);
                    delete messageTimeouts.current[requestId];
                    resolve(response);
                };

                messageTimeouts.current[requestId] = setTimeout(() => {
                    emitter.off(requestId, callback);
                    reject(new Error(`Request ${requestId} timed out`));
                }, timeout);

                emitter.once(requestId, callback);
                transmit();
            });
        }

        transmit();
        return Promise.resolve(null);
    };





    const disconnectPeerConnection = useCallback((deviceId: string) => {
        const peerConnection = peerConnections.current[deviceId];
        if (peerConnection) {
            peerConnection.onicecandidate = null;
            peerConnection.ontrack = null;
            peerConnection.ondatachannel = null;
            peerConnection.onconnectionstatechange = null;
            peerConnection.close();
        }
        delete peerConnections.current[deviceId];

        for (const dataChannel of dataChannels.current[deviceId] || []) {
            if (dataChannel && dataChannel.readyState === "open") {
                dataChannel.close();
            }
        }
        delete dataChannels.current[deviceId];

        setRtcPeers(prev => {
            const updated = { ...prev };
            delete updated[deviceId];
            return updated;
        });

        requestedPeers.current.delete(deviceId)
        if (disconnectionCount.current[deviceId]) {
            delete disconnectionCount.current[deviceId]
        }

        if (receivedFiles.current[deviceId]) {
            delete receivedFiles.current[deviceId];
        }
        if (receivedFilePromises.current[deviceId]) {
            delete receivedFilePromises.current[deviceId]
        }
        if (receivedChunks.current[deviceId]) {
            delete receivedChunks.current[deviceId];
        }
        if (currentTransfers.current[deviceId]) {
            delete currentTransfers.current[deviceId];
        }
        if (pausedTransfers.current[deviceId]) {
            delete pausedTransfers.current[deviceId];
        }
        if (nextChannelIndex.current[deviceId]) {
            delete nextChannelIndex.current[deviceId];
        }
        setReceivedFileProgress(prev => {
            const updated = { ...prev };
            delete updated[deviceId];
            return updated;
        });
        setSentFileProgress(prev => {
            const updated = { ...prev };
            delete updated[deviceId];
            return updated;
        })
    }, [])




    const messageDataChannel = useCallback((deviceId: string, message: FileMessage) => {
        const channels = dataChannels.current[deviceId];
        if (!channels || channels.length === 0) throw new Error(`No open data channels for device ${deviceId}`);

        if (!nextChannelIndex.current[deviceId]) nextChannelIndex.current[deviceId] = 0;

        let channel = channels[nextChannelIndex.current[deviceId] % channels.length];
        nextChannelIndex.current[deviceId]++;

        if (channel && channel.readyState === "open") {
            channel.send(JSON.stringify(message));
        } else {
            console.error("Data channel closed, trying another channel...");
            for (const ch of channels) {
                if (ch.readyState === "open") {
                    ch.send(JSON.stringify(message));
                    return;
                }
            }
            throw new Error(`All data channels closed for device ${deviceId}`);
        }
    }, []);

    const requestFileTransfer = useCallback((deviceId: string, file: File | ReadableStream, fileInfo?: { name: string, type: string, size: number, savedFileId?: string }) => {
        const fileId = crypto.randomUUID();
        const isFile = checkIfFile(file) && !(file instanceof ReadableStream)
        if (!isFile) {
            if (!fileInfo) throw new Error('fileInfo must be provided for ReadableStream file transfers');
        }
        return sendMessage(deviceId, {
            type: "file-metadata", data: {
                fileId,
                small: Boolean(isFile && file.size < largeFileSize),
                name: isFile ? file.name : fileInfo!.name,
                type: isFile ? file.type : fileInfo!.type,
                size: isFile ? file.size : fileInfo!.size
            }
        }, fileId, 1000 * 60 * 60 * 30)
            .then((response) => {
                if (!response) {
                    return Promise.reject(new Error(`No response for file transfer request to ${deviceId}`));
                }
                if (response.type === 'file-accept') {
                    return () => sendFile(deviceId, file, response.fileId, fileInfo);
                } else if (response.type === 'file-reject') return Promise.reject(new Error(`File transfer (${response.fileId}) rejected by ${deviceId}.`));
                else return Promise.reject(new Error(`Unexpected response type: ${response.type}`));
            })
    }, []);

    const pauseTransfer = useCallback((deviceId: string, fileId: string) => {
        if (!pausedTransfers.current[deviceId]) pausedTransfers.current[deviceId] = {};
        pausedTransfers.current[deviceId][fileId] = true;
        messageDataChannel(deviceId, { type: "file-pause", fileId });
    }, []);


    const resumeTransfer = useCallback((deviceId: string, fileId: string) => {
        if (pausedTransfers.current[deviceId]) delete pausedTransfers.current[deviceId][fileId];
        messageDataChannel(deviceId, { type: "file-resume", fileId });
    }, []);


    const cancelTransfer = useCallback((deviceId: string, fileId: string) => {
        messageDataChannel(deviceId, { type: "file-cancel", fileId });
        sendMessage(deviceId, { type: 'transfer-cancelled', data: { fileId } })
        delete receivedChunks.current[deviceId]?.[fileId];
        delete receivedFiles.current[deviceId]?.[fileId];
        delete receivedFilePromises.current[deviceId]?.[fileId];
        delete pausedTransfers.current[deviceId]?.[fileId];
        if (downloadSpeed.current[deviceId]?.[fileId]) {
            delete downloadSpeed.current[deviceId][fileId]
            if (Object.keys(downloadSpeed.current[deviceId]).length === 0) delete downloadSpeed.current[deviceId]
        }
        setReceivedFileProgress(prev => {
            if (!prev[deviceId]) return prev;
            if (!prev[deviceId][fileId]) return prev;
            const updatedDevice = { ...prev[deviceId] };
            delete updatedDevice[fileId];

            if (Object.keys(updatedDevice).length === 0) {
                const updatedProgress = { ...prev };
                delete updatedProgress[deviceId];
                return updatedProgress;
            }

            return { ...prev, [deviceId]: updatedDevice };
        });
        setSentFileProgress(prev => {
            if (!prev[deviceId]) return prev;
            if (!prev[deviceId][fileId]) return prev;
            const updatedDevice = { ...prev[deviceId] };
            delete updatedDevice[fileId];
            if (Object.keys(updatedDevice).length === 0) {
                const updatedProgress = { ...prev } as typeof prev;
                delete updatedProgress[deviceId];
                return updatedProgress;
            }
            return { ...prev, [deviceId]: updatedDevice };
        })
        patchDownload(fileId, { cancelled: true }).then(() => {
            emit('download-cancelled', fileId)
        }).catch(() => {})
        Promise.allSettled([
            deleteFileFromIndexedDB(fileId),
            deleteFileMetadata(fileId)
        ]).then(() => {
            emit('file-deleted', fileId)
        }).catch(() => {})
    }, []);

    const cancelUpload = useCallback((deviceId: string, fileId: string) => {
        messageDataChannel(deviceId, { type: "cancel-upload", fileId });
        delete currentTransfers.current[deviceId]?.[fileId];
        setSentFileProgress(prev => ({
            ...prev,
            [deviceId]: {
                ...(prev[deviceId] || {}),
                [fileId]: {
                    name: prev[deviceId]?.[fileId]?.name || '',
                    progress: prev[deviceId]?.[fileId]?.progress || 0,
                    status: 'cancelled'
                }
            }
        }));
        deleteUploadSession(fileId).catch(() => { })
    }, [])

    const sendFile = useCallback((deviceId: string, file: File | ReadableStream, fileId: string, fileInfo?: {
        name: string,
        type: string,
        size: number,
        savedFileId?: string
    }) => {
        return new Promise<null>(async (resolve, reject) => {
            const channels = dataChannels.current[deviceId];
            if (!channels || channels.length === 0) {
                reject(new Error(`No open data channels for device ${deviceId}`));
                return;
            }
            const isFile = checkIfFile(file) && !(file instanceof ReadableStream)
            if (!isFile) {
                if (!fileInfo) {
                    reject(new Error('fileInfo must be provided for ReadableStream file transfers'));
                    return;
                }
            }
            const { name, type, size } = isFile ? file : fileInfo!;
            const isSmallFile = isFile && size < largeFileSize;
            const password = requestedPeers.current.has(deviceId) ? myDeviceId : deviceId
            const { key, iv, encrypt } = isSmallFile ? await createEncrypter(password) : await createEncrypterCTR(password)
            uploadSessions.current[deviceId] = uploadSessions.current[deviceId] || {}
            uploadSessions.current[deviceId][fileId] = { file: isFile ? (file as File) : undefined, name, type, size, small: isSmallFile, key, iv, password } as any
            if (fileInfo?.savedFileId) (uploadSessions.current[deviceId][fileId] as any).savedFileId = fileInfo.savedFileId
            addUploadSession({ fileId, deviceId, name, type, size, small: isSmallFile, started_at: Date.now(), resumeSupported: Boolean(!isSmallFile && (!isFile || Boolean(fileInfo?.savedFileId))), password, key: Array.from(key), iv: Array.from(iv), savedFileId: fileInfo?.savedFileId }).catch(() => { })
            let sentBytes = 0;
            let sentChunks = 0

            if (!nextChannelIndex.current[deviceId]) {
                nextChannelIndex.current[deviceId] = 0;
            }
            setSentFileProgress(prev => ({
                ...prev,
                [deviceId]: {
                    ...(prev[deviceId] || {}),
                    [fileId]: { name, progress: 0, status: 'uploading' }
                }
            }))
            const updateProgress = () => {
                if (sentChunks % 5 === 0) setSentFileProgress(prev => ({
                    ...prev,
                    [deviceId]: {
                        ...(prev[deviceId] || {}),
                        [fileId]: {
                            name,
                            progress: parseFloat(Math.min(100, (sentBytes / size) * 100).toFixed(2)),
                            status: prev[deviceId]?.[fileId]?.status || 'uploading'
                        }
                    }
                }));
            };

            const getOpenChannel = (): RTCDataChannel | null => {
                const list = dataChannels.current[deviceId] || [];
                for (let i = 0; i < list.length; i++) {
                    const ch = list[i];
                    if (ch && ch.readyState === 'open') return ch;
                }
                return null;
            };
            const sendChunk = async (channel: RTCDataChannel | undefined, chunk: Uint8Array, chunkNumber: number, chunkPart: number, totalParts: number) => {
                let ch: RTCDataChannel | null = (channel && channel.readyState === 'open') ? channel : getOpenChannel();
                if (!ch) throw new Error('No open data channels');
                while (ch.bufferedAmount > maxBufferAmount) {
                    await new Promise(res => setTimeout(res, 50));
                    if (ch.readyState !== 'open') {
                        ch = getOpenChannel();
                        if (!ch) throw new Error('No open data channels');
                    }
                }
                const encodedChunk = BSON.serialize({ type: "file-chunk", fileId, data: chunk, chunkNumber, chunkPart: Math.max(1, chunkPart), totalParts: Math.max(1, totalParts) });
                const view = new Uint8Array(encodedChunk.buffer as ArrayBuffer, encodedChunk.byteOffset, encodedChunk.byteLength);
                ch.send(view);
            };

            const getNextChannel = (): RTCDataChannel => {
                const channel = channels[nextChannelIndex.current[deviceId] % channels.length];
                nextChannelIndex.current[deviceId]++;
                return channel;
            };

            const sendSmallFile = async () => {
                if (!checkIfFile(file)) throw new Error('Small file transfer requires a File object');
                if (!isSmallFile) throw new Error('not small file')
                try {
                    messageDataChannel(deviceId, {
                        type: "file-metadata",
                        fileId,
                        data: { name, type, size, key: Array.from(key), iv: Array.from(iv), small: true }
                    });
                    const encryptedFile = await encrypt(brotliCompress(new Uint8Array(await file.arrayBuffer())), 0);
                    for (let i = 0; i < encryptedFile.byteLength; i += maxMessageSize) {
                        sentChunks += 1;
                        const chunk = encryptedFile.slice(i, i + maxMessageSize);
                        const channel = getNextChannel();
                        await sendChunk(channel, chunk, sentChunks, 1, 1);
                        sentBytes += chunk.byteLength;
                        updateProgress();
                        const now = Date.now();
                        if (!uploadSpeed.current[deviceId]) uploadSpeed.current[deviceId] = {};
                        const last = uploadSpeed.current[deviceId][fileId];
                        if (last) {
                            const dt = (now - last.lastTs) / 1000;
                            const db = Math.max(0, sentBytes - last.lastBytes);
                            if (dt > 0 && db >= 0) emitter.emit('upload-speed', { fileId, bps: db / dt });
                        }
                        uploadSpeed.current[deviceId][fileId] = { lastBytes: sentBytes, lastTs: now };
                    }
                    messageDataChannel(deviceId, { type: "file-end", fileId, totalChunks: sentChunks });
                    setSentFileProgress(prev => ({
                        ...prev,
                        [deviceId]: {
                            ...(prev[deviceId] || {}),
                            [fileId]: {
                                name,
                                progress: 100,
                                status: 'completed'
                            }
                        }
                    }))
                    resolve(null);
                } catch (e) {
                    reject(e);
                }
            };

            const sendLargeFile = async (resumeFrom = 0) => {
                try {
                    messageDataChannel(deviceId, {
                        type: "file-metadata",
                        fileId,
                        data: { name, type, size, key: Array.from(key), iv: Array.from(iv), small: false }
                    });

                    const sourceStream = (checkIfFile(file) && !(file instanceof ReadableStream) ? (file as File).stream() : (file as ReadableStream));
                    const savedStream = !checkIfFile(file) && !!(fileInfo && (fileInfo as any).savedFileId);
                    const hasPipeThrough = !savedStream && typeof (sourceStream as any).pipeThrough === 'function' && typeof (globalThis as any).TransformStream !== 'undefined';
                    let reader: ReadableStreamDefaultReader<Uint8Array>;
                    let readNext: null | (() => Promise<{ done: boolean, value?: any }>) = null;
                    let manualCompress = false;
                    let compressor: Deflate | null = null;
                    let outQueue: Uint8Array[] = [];
                    if (hasPipeThrough && isFile) {
                        try {
                            const c = new Deflate();
                            const transformStream = new TransformStream<Uint8Array, Uint8Array>({
                                start(controller) {
                                    c.ondata = (chunk, final) => {
                                        controller.enqueue(chunk);
                                        if (final) controller.terminate();
                                    };
                                },
                                transform(chunk) {
                                    c.push(new Uint8Array(chunk));
                                },
                                flush() {
                                    c.push(new Uint8Array(), true);
                                }
                            });
                            reader = (sourceStream as any).pipeThrough(transformStream as any).getReader();
                            readNext = () => reader.read();
                        } catch {
                            manualCompress = true;
                            compressor = new Deflate();
                            compressor.ondata = (chunk) => { outQueue.push(chunk) };
                            if (typeof (sourceStream as any).getReader === 'function') {
                                reader = (sourceStream as ReadableStream).getReader();
                                readNext = () => reader.read();
                            } else if (sourceStream && typeof (sourceStream as any)[Symbol.asyncIterator] === 'function') {
                                const iterator = (sourceStream as any)[Symbol.asyncIterator]();
                                readNext = () => iterator.next();
                            } else {
                                throw new Error('Unsupported source stream for large file transfer');
                            }
                        }
                    } else {
                        manualCompress = true;
                        compressor = new Deflate();
                        compressor.ondata = (chunk) => { outQueue.push(chunk) };
                        if (typeof (sourceStream as any).getReader === 'function') {
                            reader = (sourceStream as ReadableStream).getReader();
                            readNext = () => reader.read();
                        } else if (sourceStream && typeof (sourceStream as any)[Symbol.asyncIterator] === 'function') {
                            const iterator = (sourceStream as any)[Symbol.asyncIterator]();
                            readNext = () => iterator.next();
                        } else {
                            throw new Error('Unsupported source stream for large file transfer');
                        }
                    }

                    const processStream = async () => {
                        let skipUntil = Math.max(0, resumeFrom)
                        while (true) {
                            const { done, value } = await (readNext as () => Promise<{ done: boolean, value?: any }>)();
                            if (done) break;
                            if (!manualCompress) {
                                sentChunks += 1
                                const encryptedChunk = await encrypt(value!, sentChunks)
                                const chunkParts = Math.ceil(encryptedChunk.byteLength / maxMessageSize)
                                let chunkPart = 0
                                if (skipUntil && sentChunks <= skipUntil) {
                                    continue
                                }
                                for (let i = 0; i < encryptedChunk.byteLength; i += maxMessageSize) {
                                    const chunk = encryptedChunk.slice(i, i + maxMessageSize);
                                    const channel = getNextChannel();
                                    chunkPart += 1;
                                    await sendChunk(channel, chunk, sentChunks, chunkPart, chunkParts);
                                    sentBytes += chunk.byteLength;
                                    updateProgress();
                                    const now = Date.now();
                                    if (!uploadSpeed.current[deviceId]) uploadSpeed.current[deviceId] = {};
                                    const last = uploadSpeed.current[deviceId][fileId];
                                    if (last) {
                                        const dt = (now - last.lastTs) / 1000;
                                        const db = Math.max(0, sentBytes - last.lastBytes);
                                        if (dt > 0 && db >= 0) emitter.emit('upload-speed', { fileId, bps: db / dt });
                                    }
                                    uploadSpeed.current[deviceId][fileId] = { lastBytes: sentBytes, lastTs: now };
                                    if (sentChunks % 10 === 0) patchUploadSession(fileId, { sentChunks }).catch(() => { })
                                    if (currentTransfers.current[deviceId]?.[fileId] === 'paused') {
                                        while (currentTransfers.current[deviceId]?.[fileId] === 'paused') {
                                            await new Promise(res => setTimeout(res, 200));
                                        }
                                    }
                                    if (currentTransfers.current[deviceId]?.[fileId] === 'cancelled') {
                                        return reject(new Error("File transfer cancelled"));
                                    }
                                }
                            } else {
                                let input: Uint8Array;
                                if (value instanceof Uint8Array) {
                                    input = value;
                                } else if (value && typeof value === 'object' && 'chunkData' in (value as any)) {
                                    input = (value as any).chunkData as Uint8Array;
                                } else if (value instanceof ArrayBuffer) {
                                    input = new Uint8Array(value);
                                } else {
                                    input = new Uint8Array(value as any);
                                }
                                compressor!.push(input);
                                while (outQueue.length) {
                                    const out = outQueue.shift() as Uint8Array
                                    sentChunks += 1
                                    if (skipUntil && sentChunks <= skipUntil) continue
                                    const encryptedChunk = await encrypt(out, sentChunks)
                                    const chunkParts = Math.ceil(encryptedChunk.byteLength / maxMessageSize)
                                    let chunkPart = 0
                                    for (let i = 0; i < encryptedChunk.byteLength; i += maxMessageSize) {
                                        const chunk = encryptedChunk.slice(i, i + maxMessageSize);
                                        const channel = getNextChannel();
                                        chunkPart += 1;
                                        await sendChunk(channel, chunk, sentChunks, chunkPart, chunkParts);
                                        sentBytes += chunk.byteLength;
                                        updateProgress();
                                        const now = Date.now();
                                        if (!uploadSpeed.current[deviceId]) uploadSpeed.current[deviceId] = {};
                                        const last = uploadSpeed.current[deviceId][fileId];
                                        if (last) {
                                            const dt = (now - last.lastTs) / 1000;
                                            const db = Math.max(0, sentBytes - last.lastBytes);
                                            if (dt > 0 && db >= 0) emitter.emit('upload-speed', { fileId, bps: db / dt });
                                        }
                                        uploadSpeed.current[deviceId][fileId] = { lastBytes: sentBytes, lastTs: now };
                                        if (sentChunks % 10 === 0) patchUploadSession(fileId, { sentChunks }).catch(() => { })
                                        if (currentTransfers.current[deviceId]?.[fileId] === 'paused') {
                                            while (currentTransfers.current[deviceId]?.[fileId] === 'paused') {
                                                await new Promise(res => setTimeout(res, 200));
                                            }
                                        }
                                        if (currentTransfers.current[deviceId]?.[fileId] === 'cancelled') {
                                            return reject(new Error("File transfer cancelled"));
                                        }
                                    }
                                }
                            }
                        }
                        if (manualCompress) {
                            compressor!.push(new Uint8Array(), true)
                            while (outQueue.length) {
                                const out = outQueue.shift() as Uint8Array
                                sentChunks += 1
                                const encryptedChunk = await encrypt(out, sentChunks)
                                const chunkParts = Math.ceil(encryptedChunk.byteLength / maxMessageSize)
                                let chunkPart = 0
                                for (let i = 0; i < encryptedChunk.byteLength; i += maxMessageSize) {
                                    const chunk = encryptedChunk.slice(i, i + maxMessageSize);
                                    const channel = getNextChannel();
                                    chunkPart += 1;
                                    await sendChunk(channel, chunk, sentChunks, chunkPart, chunkParts);
                                    sentBytes += chunk.byteLength;
                                    updateProgress();
                                }
                            }
                        }
                        messageDataChannel(deviceId, { type: "file-end", fileId, totalChunks: sentChunks });
                        setSentFileProgress(prev => ({
                            ...prev,
                            [deviceId]: {
                                ...(prev[deviceId] || {}),
                                [fileId]: {
                                    name,
                                    progress: 100,
                                    status: 'completed'
                                }
                            }
                        }))
                        patchUploadSession(fileId, { sentChunks }).catch(() => { })
                        deleteUploadSession(fileId).catch(() => { })
                        resolve(null);
                    };

                    processStream().catch(reject);
                } catch (e) {
                    reject(e);
                }
            };

            currentTransfers.current[deviceId] = {
                ...(currentTransfers.current[deviceId] || {}),
                [fileId]: 'uploading'
            };

            if (isSmallFile) {
                sendSmallFile();
            } else {
                sendLargeFile();
            }
        });
    }, [messageDataChannel]);

    const resumeUploadLargeFile = useCallback(async (deviceId: string, fileId: string, receivedChunks: number) => {
        let session = uploadSessions.current[deviceId]?.[fileId] as any
        if (!session) {
            try {
                const s = await getUploadSessionByFileId(fileId)
                if (s && s.deviceId === deviceId && !s.small) {
                    session = {
                        name: s.name, type: s.type, size: s.size, small: s.small,
                        key: new Uint8Array(s.key || []), iv: new Uint8Array(s.iv || []), password: s.password,
                        savedFileId: s.savedFileId
                    }
                }
            } catch {}
        }
        if (!session || session.small || !session.key || !session.iv || !session.password) {
            sendMessage(deviceId, { type: 'resume-unsupported', data: { fileId } })
            return
        }
        if (!session.file && !session.savedFileId) {
            setResumeNeeds(prev => ({
                ...prev,
                [deviceId]: {
                    ...(prev[deviceId] || {}),
                    [fileId]: { name: session.name, type: session.type, size: session.size, receivedChunks }
                }
            }))
            return
        }
        const channels = dataChannels.current[deviceId];
        if (!channels || channels.length === 0) return
        if (!nextChannelIndex.current[deviceId]) nextChannelIndex.current[deviceId] = 0;
        const getNextChannel = (): RTCDataChannel => {
            const channel = channels[nextChannelIndex.current[deviceId] % channels.length];
            nextChannelIndex.current[deviceId]++;
            return channel;
        };
        const getOpenChannel = (): RTCDataChannel | null => {
            const list = dataChannels.current[deviceId] || [];
            for (let i = 0; i < list.length; i++) {
                const ch = list[i];
                if (ch && ch.readyState === 'open') return ch;
            }
            return null;
        };
        const sendChunk = async (channel: RTCDataChannel | undefined, chunk: Uint8Array, chunkNumber: number, chunkPart: number, totalParts: number) => {
            let ch: RTCDataChannel | null = (channel && channel.readyState === 'open') ? channel : getOpenChannel();
            if (!ch) throw new Error('No open data channels');
            while (ch.bufferedAmount > maxBufferAmount) {
                await new Promise(res => setTimeout(res, 50));
                if (ch.readyState !== 'open') {
                    ch = getOpenChannel();
                    if (!ch) throw new Error('No open data channels');
                }
            }
            const encodedChunk = BSON.serialize({ type: "file-chunk", fileId, data: chunk, chunkNumber, chunkPart: Math.max(1, chunkPart), totalParts: Math.max(1, totalParts) });
            const view = new Uint8Array(encodedChunk.buffer as ArrayBuffer, encodedChunk.byteOffset, encodedChunk.byteLength);
            ch.send(view);
        };
        const fileStream: ReadableStream<Uint8Array> = session.file ? (session.file as File).stream() : await createIndexedDBFileByteStream(session.savedFileId)
        const canPipe = typeof (fileStream as any).pipeThrough === 'function' && typeof (globalThis as any).TransformStream !== 'undefined';
        let reader: ReadableStreamDefaultReader<Uint8Array>;
        let manualCompress = false;
        let outQueue: Uint8Array[] = [];
        let compressor: Deflate | null = null;
        if (canPipe) {
            try {
                const c = new Deflate();
                const transformStream = new TransformStream({
                    start(controller) {
                        c.ondata = (chunk, final) => {
                            controller.enqueue(chunk);
                            if (final) controller.terminate();
                        };
                    },
                    transform(chunk) {
                        c.push(new Uint8Array(chunk));
                    },
                    flush() {
                        c.push(new Uint8Array(), true);
                    }
                });
                reader = (fileStream as any).pipeThrough(transformStream as any).getReader();
            } catch {
                manualCompress = true;
                compressor = new Deflate();
                compressor.ondata = (chunk) => { outQueue.push(chunk) };
                reader = (fileStream as ReadableStream).getReader();
            }
        } else {
            manualCompress = true;
            compressor = new Deflate();
            compressor.ondata = (chunk) => { outQueue.push(chunk) };
            reader = (fileStream as ReadableStream).getReader();
        }
        const { password, key, iv } = session
        const encrypt = await createEncryptionStreamCTR(password as string, key as Uint8Array, iv as Uint8Array)
        let sentChunks = 0
        let sentBytes = 0
        let baselineBytes = 0
        if (typeof (globalThis as any).performance !== 'undefined') {
            try {
                const list = await listAllDownloadMetadata().catch(() => [])
                const rec = (list as any[]).find((d: any) => d.fileId === fileId && d.deviceId === deviceId)
                const rbytes = (rec && rec.size) ? await getDownloadedBytes(fileId).catch(() => 0) : 0
                baselineBytes = rbytes
                if (rec && rec.size) setSentFileProgress(prev => ({
                    ...prev,
                    [deviceId]: {
                        ...(prev[deviceId] || {}),
                        [fileId]: {
                            name: session.name,
                            progress: rec.size > 0 ? Math.min(100, Math.round((rbytes / rec.size) * 100)) : 0,
                            status: 'resuming'
                        }
                    }
                }))
            } catch { }
        }
        messageDataChannel(deviceId, { type: 'file-metadata', fileId, data: { name: session.name, type: session.type, size: session.size, key: Array.from(key), iv: Array.from(iv), small: false } })
        const processStream = async () => {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (!manualCompress) {
                    sentChunks += 1
                    const encryptedChunk = await encrypt(value, sentChunks)
                    if (sentChunks <= receivedChunks) continue
                    const chunkParts = Math.ceil(encryptedChunk.byteLength / maxMessageSize)
                    let chunkPart = 0
                    for (let i = 0; i < encryptedChunk.byteLength; i += maxMessageSize) {
                        const chunk = encryptedChunk.slice(i, i + maxMessageSize);
                        const channel = getNextChannel();
                        chunkPart += 1;
                        await sendChunk(channel, chunk, sentChunks, chunkPart, chunkParts);
                        sentBytes += chunk.byteLength;
                        setSentFileProgress(prev => ({
                            ...prev,
                            [deviceId]: {
                                ...(prev[deviceId] || {}),
                                [fileId]: {
                                    name: session.name,
                                    progress: session.size > 0 ? Math.min(100, Math.round(((baselineBytes + sentBytes) / session.size) * 100)) : 0,
                                    status: 'resuming'
                                }
                            }
                        }))
                        const now = Date.now();
                        if (!uploadSpeed.current[deviceId]) uploadSpeed.current[deviceId] = {};
                        const last = uploadSpeed.current[deviceId][fileId];
                        if (last) {
                            const dt = (now - last.lastTs) / 1000;
                            const db = Math.max(0, sentBytes - last.lastBytes);
                            if (dt > 0 && db >= 0) emitter.emit('upload-speed', { fileId, bps: db / dt });
                        }
                        uploadSpeed.current[deviceId][fileId] = { lastBytes: sentBytes, lastTs: now };
                    }
                } else {
                    (compressor as Deflate).push(new Uint8Array(value));
                    while (outQueue.length) {
                        const out = outQueue.shift() as Uint8Array
                        sentChunks += 1
                        if (sentChunks <= receivedChunks) continue
                        const encryptedChunk = await encrypt(out, sentChunks)
                        const chunkParts = Math.ceil(encryptedChunk.byteLength / maxMessageSize)
                        let chunkPart = 0
                        for (let i = 0; i < encryptedChunk.byteLength; i += maxMessageSize) {
                            const chunk = encryptedChunk.slice(i, i + maxMessageSize);
                            const channel = getNextChannel();
                            chunkPart += 1;
                            await sendChunk(channel, chunk, sentChunks, chunkPart, chunkParts);
                            sentBytes += chunk.byteLength;
                            setSentFileProgress(prev => ({
                                ...prev,
                                [deviceId]: {
                                    ...(prev[deviceId] || {}),
                                    [fileId]: {
                                        name: session.name,
                                        progress: session.size > 0 ? Math.min(100, Math.round(((baselineBytes + sentBytes) / session.size) * 100)) : 0,
                                        status: 'resuming'
                                    }
                                }
                            }))
                            const now = Date.now();
                            if (!uploadSpeed.current[deviceId]) uploadSpeed.current[deviceId] = {};
                            const last = uploadSpeed.current[deviceId][fileId];
                            if (last) {
                                const dt = (now - last.lastTs) / 1000;
                                const db = Math.max(0, sentBytes - last.lastBytes);
                                if (dt > 0 && db >= 0) emitter.emit('upload-speed', { fileId, bps: db / dt });
                            }
                            uploadSpeed.current[deviceId][fileId] = { lastBytes: sentBytes, lastTs: now };
                        }
                    }
                }
            }
            if (manualCompress) {
                (compressor as Deflate).push(new Uint8Array(), true)
                while (outQueue.length) {
                    const out = outQueue.shift() as Uint8Array
                    sentChunks += 1
                    if (sentChunks <= receivedChunks) continue
                    const encryptedChunk = await encrypt(out, sentChunks)
                    const chunkParts = Math.ceil(encryptedChunk.byteLength / maxMessageSize)
                    let chunkPart = 0
                    for (let i = 0; i < encryptedChunk.byteLength; i += maxMessageSize) {
                        const chunk = encryptedChunk.slice(i, i + maxMessageSize);
                        const channel = getNextChannel();
                        chunkPart += 1;
                        await sendChunk(channel, chunk, sentChunks, chunkPart, chunkParts);
                        sentBytes += chunk.byteLength;
                    }
                }
            }
            messageDataChannel(deviceId, { type: "file-end", fileId, totalChunks: sentChunks });
            setSentFileProgress(prev => ({
                ...prev,
                [deviceId]: {
                    ...(prev[deviceId] || {}),
                    [fileId]: { name: session.name, progress: 100, status: 'completed' }
                }
            }))
            deleteUploadSession(fileId).catch(() => {})
        };
        processStream().catch(() => { })
    }, [createEncrypterCTR, messageDataChannel])

    const provideResumeFile = useCallback((deviceId: string, fileId: string, file: File) => {
        if (!uploadSessions.current[deviceId]) uploadSessions.current[deviceId] = {}
        const existing = uploadSessions.current[deviceId][fileId]
        if (!existing) return
        uploadSessions.current[deviceId][fileId] = { ...existing, file }
        const rc = resumeNeeds[deviceId]?.[fileId]?.receivedChunks || 0
        setResumeNeeds(prev => {
            const next = { ...prev }
            if (next[deviceId]) {
                delete next[deviceId][fileId]
                if (Object.keys(next[deviceId]).length === 0) delete next[deviceId]
            }
            return next
        })
        resumeUploadLargeFile(deviceId, fileId, rc)
    }, [resumeNeeds, resumeUploadLargeFile])

    const cancelResumeNeed = useCallback((deviceId: string, fileId: string) => {
        setResumeNeeds(prev => {
            const next = { ...prev }
            if (next[deviceId]) {
                delete next[deviceId][fileId]
                if (Object.keys(next[deviceId]).length === 0) delete next[deviceId]
            }
            return next
        })
        sendMessage(deviceId, { type: 'transfer-cancelled', data: { fileId } })
        deleteUploadSession(fileId).catch(() => {})
    }, [])

    const approveResume = useCallback((deviceId: string, fileId: string) => {
        if (!pendingOffers.current[deviceId]) pendingOffers.current[deviceId] = new Set()
        pendingOffers.current[deviceId].add(fileId)
        if (!resumeRequested.current[deviceId] || !resumeRequested.current[deviceId].has(fileId)) {
            sendMessage(deviceId, { type: 'resume-offer', data: { fileId } })
            setSentFileProgress(prev => ({
                ...prev,
                [deviceId]: {
                    ...(prev[deviceId] || {}),
                    [fileId]: {
                        name: prev[deviceId]?.[fileId]?.name || fileId,
                        progress: prev[deviceId]?.[fileId]?.progress || 0,
                        status: 'waiting-for-receiver'
                    }
                }
            }))
            return
        }
        const setStatus = () => setSentFileProgress(prev => ({
            ...prev,
            [deviceId]: {
                ...(prev[deviceId] || {}),
                [fileId]: {
                    name: prev[deviceId]?.[fileId]?.name || fileId,
                    progress: prev[deviceId]?.[fileId]?.progress || 0,
                    status: 'resuming'
                }
            }
        }))
        listAllDownloadMetadata().then(list => {
            const rec = list.find(d => d.fileId === fileId && d.deviceId === deviceId)
            const receivedChunks = rec?.chunks_received || 0
            setStatus()
            resumeUploadLargeFile(deviceId, fileId, receivedChunks)
        }).catch(() => {
            setStatus()
            resumeUploadLargeFile(deviceId, fileId, 0)
        })
    }, [resumeUploadLargeFile])

    const downloadFile = useCallback(async (deviceId: string, fileId: string) => {
        const fileInfo = receivedFiles.current[deviceId][fileId];
        if (fileInfo.finalized) return console.warn(`File "${fileInfo.name}" already finalized.`);
        fileInfo.finalized = true
        delete receivedFiles.current[deviceId][fileId];
        delete receivedFilePromises.current[deviceId][fileId]
        if (Object.keys(receivedFiles.current[deviceId]).length === 0) delete receivedFiles.current[deviceId];
        if (Object.keys(receivedFilePromises.current[deviceId]).length === 0) delete receivedFilePromises.current[deviceId];
        
        const saveBlobToFile = async (blob: Blob) => {
            if ('cordova' in window && 'FileSystemAPI' in window) {
                return window.FileSystemAPI.ensureDirectoryExists(window.FileSystemAPI.fileDir, false, true).then(() => {
                    return new Promise<void>((resolve, reject) => {
                        window.resolveLocalFileSystemURL(window.FileSystemAPI.resolvePath(fileInfo.name, false, true), (entry) => {
                            if (entry) {
                                reject('File already exists')
                            } else {
                                reject('Error...')
                            }
                        }, () => {
                            window.resolveLocalDirectory(window.FileSystemAPI.fileDir).then((dirEntry) => {
                                if (!dirEntry) {
                                    return reject('Unable to locate file folder.')
                                }
                                dirEntry.getFile(fileInfo.name, { create: true, exclusive: false }, function (fileEntry) {
                                    fileEntry.createWriter(function (fileWriter) {
                                        let offset = 0;
                                        let totalSize = blob.size;

                                        fileWriter.onerror = function (e) {
                                            reject("Failed file write: " + e.toString());
                                        };

                                        fileWriter.onwriteend = function () {
                                            if (offset < totalSize) {
                                                writeNextChunk();
                                            } else {
                                                
                                                saveFileMetadata(fileId, fileInfo.name, fileInfo.type, fileInfo.size, fileEntry.nativeURL, Date.now(), false)
                                                    .then(() => {
                                                        flash(`Saved file: ${fileInfo.name}`);
                                                        emit('file-saved', fileId);
                                                        resolve();
                                                    })
                                                    .catch(e => {
                                                        flash(`Failed to save metadata!`);
                                                        reject(e);
                                                    });
                                            }
                                        };

                                        function writeNextChunk() {
                                            const nextChunk = blob.slice(offset, offset + chunkSize);
                                            fileWriter.seek(offset);
                                            fileWriter.write(nextChunk);
                                            offset += nextChunk.size;
                                        }

                                        
                                        writeNextChunk();
                                    }, reject)
                                }, (err) => {
                                    console.error('Failed to add entry')
                                    reject(err)
                                });
                            }).catch(e => {
                                console.error('Failed to resolve file directory')
                                reject(e)
                            })
                        })
                    })
                })
            } else if ('FileSystemAPI' in window) {
                const arrayBuffer = await blob.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                return (window as Window).FileSystemAPI.ensureDirectoryExists((window as Window).FileSystemAPI.resolvePath(fileInfo.name, false, true), false, true).then(() => {
                    return window.fileSystemAPI.saveFile(window.FileSystemAPI.resolvePath(fileInfo.name, false, true), buffer).then(() => {
                        return saveFileMetadata(fileId, fileInfo.name, fileInfo.type, fileInfo.size, window.FileSystemAPI.resolvePath(fileInfo.name, false, true), Date.now(), false).then(() => {
                            flash(`Saved file: ${fileInfo.name}`)
                            emit('file-saved', fileId)
                        }).catch(e => {
                            flash(`Failed to save metadata!`)
                            throw e
                        })
                    })
                })
            } else {
                throw new Error("Unable to download file")
            }
        };
        const saveChunksToFile = (chunks: Uint8Array[]) => {
            
            saveFileMetadata(fileId, fileInfo.name, fileInfo.type, fileInfo.size, '', Date.now(), true).then(async () => {
                try {
                    for (let i = 0; i < chunks.length; i++) {
                        await saveChunkToIndexedDB(fileId, i + 1, chunks[i])
                    }
                    
                    flash('File Saved!')
                    emit('file-saved', fileId)
                } catch (e) {
                    flash(`Failed to save file!`)
                    Promise.allSettled([
                        deleteFileFromIndexedDB(fileId),
                        deleteFileMetadata(fileId)
                    ]).catch(() => { }).finally(() => {
                        throw e
                    })
                }
            })
        }

        if (fileInfo.small) {
            const encryptedChunks = Array.from(receivedChunks.current[deviceId][fileId].entries()).sort(([indexA], [indexB]) => {
                return indexA - indexB;
            }).flatMap(([_, { parts }]) => {
                return Array.from(parts.entries()).sort(([indexA], [indexB]) => indexA - indexB).map(([_, part]) => Array.from(part))
            }).flat()
            try {
                const decryptedChunks = await fileInfo.decrypt(new Uint8Array(encryptedChunks), 0) || new Uint8Array()
                const compressedData = new Uint8Array(decryptedChunks)
                const decompressedData = brotliDecompress(compressedData);
                if (autoDownloadFiles || device.app) {
                    const copy = new Uint8Array(decompressedData.byteLength);
                    copy.set(decompressedData);
                    const blob = new Blob([copy.buffer], { type: fileInfo.type });
                    if (device.app) {
                        saveBlobToFile(blob)
                    } else {
                        downloadBlob(blob, fileInfo.name);
                    }
                } else {
                    const decompressedChunks: Uint8Array[] = []
                    for (let i = 0; i < decompressedData.byteLength; i += maxMessageSize) {
                        decompressedChunks.push(decompressedData.slice(i, i + maxMessageSize));
                    }
                    saveChunksToFile(decompressedChunks)
                }
            } catch (error) {
                console.error("Error decompressing Brotli data:", error);
            } finally {
                if (receivedChunks.current[deviceId]) {
                    delete receivedChunks.current[deviceId][fileId];
                    if (Object.keys(receivedChunks.current[deviceId]).length === 0) delete receivedChunks.current[deviceId];
                }
            }
        } else {
            if (receivedChunks.current[deviceId]?.[fileId]) delete receivedChunks.current[deviceId][fileId];
            if (receivedChunks.current[deviceId] && Object.keys(receivedChunks.current[deviceId]).length === 0) delete receivedChunks.current[deviceId];
            createIndexedDBChunkStream(fileId).then((compressedStream) => {
                const inflater = new Inflate();
                let decompressedStream: ReadableStream<Uint8Array>;
                if (typeof (globalThis as any).TransformStream !== 'undefined' && typeof (compressedStream as any).pipeThrough === 'function') {
                    const transformStream = new TransformStream({
                        start(controller) {
                            inflater.ondata = (chunk, final) => {
                                controller.enqueue(chunk);
                                if (final) controller.terminate();
                            };
                        },
                        async transform(chunk) {
                            try {
                                let decrypted
                                try {
                                    decrypted = await fileInfo.decrypt(chunk.chunkData, chunk.chunkIndex)
                                } catch (e) {
                                    console.error('Failed to decrypt', e)
                                }
                                inflater.push(decrypted || new Uint8Array());
                            } catch (e) {
                                console.error('Invalid chunk', chunk.chunkData instanceof Uint8Array, chunk)
                            }
                        },
                        flush() {
                            inflater.push(new Uint8Array(), true)
                        }
                    })
                    decompressedStream = (compressedStream as any).pipeThrough(transformStream as any);
                } else {
                    decompressedStream = new ReadableStream<Uint8Array>({
                        async start(controller) {
                            inflater.ondata = (chunk, final) => {
                                controller.enqueue(chunk);
                                if (final) controller.close();
                            };
                            const reader = (compressedStream as ReadableStream<any>).getReader();
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                try {
                                    const decrypted = await fileInfo.decrypt(value.chunkData, value.chunkIndex)
                                    inflater.push(decrypted || new Uint8Array());
                                } catch (e) {
                                    console.error('Invalid chunk', e)
                                }
                            }
                            inflater.push(new Uint8Array(), true)
                        }
                    })
                }
                const reader = decompressedStream.getReader()
                if (!device.app) {
                    const chunks: Uint8Array[] = [];
                    const read = () => {
                        reader.read().then(({ done, value }) => {
                            if (done) {
                                const finalize = () => {
                                    if (autoDownloadFiles) {
                                        const parts: ArrayBuffer[] = chunks.map((u8) => (u8.buffer as ArrayBuffer).slice(u8.byteOffset, u8.byteOffset + u8.byteLength))
                                        const blob = new Blob(parts, { type: fileInfo.type })
                                        downloadBlob(blob, fileInfo.name);
                                    } else {
                                        saveChunksToFile(chunks)
                                    }
                                }
                                
                                deleteFileFromIndexedDB(fileId).then(() => {
                                    finalize()
                                }).catch(e => {
                                    console.error('Error deleting file from IndexedDB', e);
                                    if (autoDownloadFiles) {
                                        finalize()
                                    } else {
                                        fileId = crypto.randomUUID()
                                        finalize()
                                    }
                                })
                                return;
                            }
                            chunks.push(value)
                            read();
                        });
                    }
                    read()
                } else if ('cordova' in window) {
                    createChunkedFileWriter(fileInfo.name).then(writer => {
                        const read = () => {
                            reader.read().then(({ done, value }) => {
                                if (done) {
                                    writer.close().then(() => {
                                        deleteFileFromIndexedDB(fileId).then(() => saveFileMetadata(fileId, fileInfo.name, fileInfo.type, fileInfo.size, writer.filePath, Date.now(), false).then(() => {
                                            flash(`Saved file: ${fileInfo.name}`);
                                            emit('file-saved', fileId);

                                        }).catch(e => {
                                            flash(`Failed to save metadata!`);
                                            console.error(e)
                                        }))
                                    });
                                    return;
                                }

                                writer.writeChunk(value!).then(() => {
                                    read()
                                });
                            });
                        };
                        read();
                    })
                } else {
                    const filePath = (window as Window).FileSystemAPI.resolvePath(fileInfo.name, false, true);
                    (window as Window).fileSystemAPI.fileWriter.start(filePath).then(() => {
                        const read = () => {
                            reader.read().then(({ done, value }) => {
                                if (done) {
                                    window.fileSystemAPI.fileWriter.close(filePath).then(() => {
                                        deleteFileFromIndexedDB(fileId).then(() => saveFileMetadata(fileId, fileInfo.name, fileInfo.type, fileInfo.size, filePath, Date.now(), false).then(() => {
                                            flash(`Saved file: ${fileInfo.name}`);
                                            emit('file-saved', fileId);

                                        }).catch(e => {
                                            flash(`Failed to save metadata!`);
                                            console.error(e)
                                        }))
                                    });
                                    return;
                                }

                                window.fileSystemAPI.fileWriter.write(filePath, value!).then(() => {
                                    read()
                                });
                            });
                        };
                        read();
                    })
                }
            })
        }
    }, [autoDownloadFiles])

    const onDataChannelMessage = useCallback(async (deviceId: string, data: any) => {
        let message: FileMessage
        try {
            if (typeof data === "string") {
                message = JSON.parse(data);
            } else if ((data as any) instanceof ArrayBuffer) {
                message = BSON.deserialize(data) as FileMessage;
            } else {
                console.error("Unknown data type:", typeof data);
                return;
            }
        } catch (error) {
            console.error("Failed to parse JSON message:", data);
            return;
        }
        const fileId = message.fileId;
        switch (message.type) {
            case "file-metadata": {
                if (!receivedFiles.current[deviceId]) receivedFiles.current[deviceId] = {};
                if (!receivedFilePromises.current[deviceId]) receivedFilePromises.current[deviceId] = {}
                const password = requestedPeers.current.has(deviceId) ? deviceId : myDeviceId
                const { key, iv } = message.data;
                receivedFilePromises.current[deviceId][fileId] = (!message.data.small ? createDecrypterCTR : createDecrypter)(password, new Uint8Array(key), new Uint8Array(iv)).then((decrypt) => {
                    return receivedFiles.current[deviceId][fileId] = {
                        name: message.data.name,
                        size: message.data.size,
                        type: message.data.type,
                        progress: 0,
                        chunkCount: 0,
                        chunksReceived: 0,
                        finalized: false,
                        small: message.data.small,
                        decrypt
                    };
                })
                addDownload(fileId, deviceId, message.data.name, message.data.type, message.data.size, Date.now(), 0).then(() => {
                    emit('download-start', { fileId })
                }).catch(() => { })
                setReceivedFileProgress(prev => ({
                    ...prev,
                    [deviceId]: {
                        ...(prev[deviceId] || {}),
                        [fileId]: { name: message.data.name, progress: 0, status: 'receiving' }
                    }
                }))
                break;
            }

            case "file-chunk": {
                const fileInfo = receivedFiles.current[deviceId]?.[fileId] ? receivedFiles.current[deviceId][fileId] : receivedFilePromises.current[deviceId]?.[fileId] instanceof Promise ? await receivedFilePromises.current[deviceId][fileId] : null;
                if (!fileInfo) return
                if (fileInfo.small) {
                    if (!receivedChunks.current[deviceId]) receivedChunks.current[deviceId] = {};
                    if (!receivedChunks.current[deviceId][fileId]) receivedChunks.current[deviceId][fileId] = new Map<number, Parts>()
                    let chunk: Uint8Array;
                    if (message.data instanceof BSON.Binary) {
                        chunk = message.data.buffer;
                    } else {
                        chunk = new Uint8Array(message.data);
                    }
                    const existingChunk = receivedChunks.current[deviceId][fileId]?.get(message.chunkNumber)
                    if (existingChunk) {
                        existingChunk.parts.set(message.chunkPart, chunk)
                        existingChunk.totalParts = message.totalParts
                    } else {
                        const parts = new Map<number, Uint8Array>()
                        parts.set(message.chunkPart, chunk)
                        receivedChunks.current[deviceId][fileId].set(message.chunkNumber, { parts, totalParts: message.totalParts });
                    }
                    const partialChunks = receivedChunks.current[deviceId][fileId]?.get(message.chunkNumber)
                    if (partialChunks && partialChunks.parts.size === partialChunks.totalParts) {
                        fileInfo.chunksReceived += 1;
                        const receivedSize = Array.from(receivedChunks.current[deviceId][fileId].values())
                            .reduce((acc: number, parts: Parts) => {
                                const chunks = Array.from(parts.parts.entries()).sort(([indexA], [indexB]) => indexA - indexB)
                                for (let i = 0; i < chunks.length; i++) {
                                    const chunk = chunks[i][1] as Uint8Array
                                    acc += chunk.byteLength
                                }
                                return acc
                            }, 0);
                        fileInfo.progress += receivedSize;
                        if (fileInfo.chunksReceived % 5 === 0) {
                            const progress = parseFloat(Math.min(100, (receivedSize / fileInfo.size) * 100).toFixed(2));
                            setReceivedFileProgress(prev => ({
                                ...prev,
                                [deviceId]: prev[deviceId] ? {
                                    ...prev[deviceId],
                                    [fileId]: { progress: Math.max((prev[deviceId]?.[fileId]?.progress || 0), progress), name: fileInfo.name, status: prev[deviceId]?.[fileId]?.status || 'receiving' }
                                } : { [fileId]: { progress, name: fileInfo.name, status: 'receiving' } }
                            }));
                            const now = Date.now()
                            const last = downloadSpeed.current[deviceId]?.[fileId]
                            if (!downloadSpeed.current[deviceId]) downloadSpeed.current[deviceId] = {}
                            if (last) {
                                const dt = (now - last.lastTs) / 1000
                                const db = Math.max(0, receivedSize - last.lastBytes)
                                if (dt > 0 && db >= 0) emitter.emit('download-speed', { fileId, bps: db / dt })
                            }
                            downloadSpeed.current[deviceId][fileId] = { lastBytes: receivedSize, lastTs: now }
                            emit('download-progress', { fileId, progress })
                            updateDownload({ fileId, chunks_received: fileInfo.chunksReceived }).catch(() => { })
                        }
                    }

                } else {
                    let chunk: Uint8Array;
                    if (message.data instanceof BSON.Binary) {
                        chunk = message.data.buffer;
                    } else {
                        chunk = new Uint8Array(message.data);
                    }
                    if (!receivedChunks.current[deviceId]) receivedChunks.current[deviceId] = {};
                    if (!receivedChunks.current[deviceId][fileId]) receivedChunks.current[deviceId][fileId] = new Map<number, Parts>()
                    const existingChunk = receivedChunks.current[deviceId][fileId]?.get(message.chunkNumber)
                    if (existingChunk) {
                        existingChunk.parts.set(message.chunkPart, chunk)
                        existingChunk.totalParts = message.totalParts
                    } else {
                        const parts = new Map<number, Uint8Array>()
                        parts.set(message.chunkPart, chunk)
                        receivedChunks.current[deviceId][fileId].set(message.chunkNumber, { parts, totalParts: message.totalParts });
                    }
                    const partialChunks = receivedChunks.current[deviceId][fileId]?.get(message.chunkNumber)
                    if (partialChunks && partialChunks.parts.size === partialChunks.totalParts) {
                        const fullChunk = new Uint8Array(Array.from(partialChunks.parts.entries()).sort(([indexA], [indexB]) => indexA - indexB).map(([_, value]) => Array.from(value)).flat())
                        saveChunkToIndexedDB(fileId, message.chunkNumber, fullChunk).then(() => {
                            fileInfo.chunksReceived += 1;
                            fileInfo.progress += fullChunk.byteLength;
                            if (fileInfo.chunksReceived % 10 === 0) {
                                const progress = parseFloat(Math.min(100, (fileInfo.progress / fileInfo.size) * 100).toFixed(2));
                                setReceivedFileProgress(prev => ({
                                    ...prev,
                                    [deviceId]: prev[deviceId] ? {
                                        ...prev[deviceId],
                                        [fileId]: { progress: Math.max((prev[deviceId]?.[fileId]?.progress || 0), progress), name: fileInfo.name, status: prev[deviceId]?.[fileId]?.status || 'receiving' }
                                    } : { [fileId]: { progress, name: fileInfo.name, status: 'receiving' } }
                                }));
                                const now = Date.now()
                                const last = downloadSpeed.current[deviceId]?.[fileId]
                                if (!downloadSpeed.current[deviceId]) downloadSpeed.current[deviceId] = {}
                                if (last) {
                                    const dt = (now - last.lastTs) / 1000
                                    const db = Math.max(0, fileInfo.progress - last.lastBytes)
                                    if (dt > 0 && db >= 0) emitter.emit('download-speed', { fileId, bps: db / dt })
                                }
                                downloadSpeed.current[deviceId][fileId] = { lastBytes: fileInfo.progress, lastTs: now }
                                emit('download-progress', { fileId, progress })
                                updateDownload({ fileId, chunks_received: fileInfo.chunksReceived }).catch(() => { })
                            }
                        }).catch(e => {
                            console.error('Error saving chunk to IndexedDB', e);
                        }).finally(() => {
                            receivedChunks.current[deviceId][fileId].delete(message.chunkNumber)
                        })
                    }
                }
                break;
            }
            case 'file-cancel': {
                if (currentTransfers.current[deviceId]) {
                    currentTransfers.current[deviceId][fileId] = 'cancelled';
                }
                
                deleteUploadSession(fileId).catch(() => { })
                setSentFileProgress(prev => {
                    if (!prev[deviceId] || !prev[deviceId][fileId]) return prev;
                    const updatedDevice = { ...prev[deviceId] };
                    delete updatedDevice[fileId];
                    if (Object.keys(updatedDevice).length === 0) {
                        const updated = { ...prev } as typeof prev;
                        delete updated[deviceId];
                        return updated;
                    }
                    return { ...prev, [deviceId]: updatedDevice };
                })
                break
            }
            case "file-pause": {
                if (currentTransfers.current[deviceId]) {
                    currentTransfers.current[deviceId][fileId] = 'paused';
                }
                setSentFileProgress(prev => {
                    if (!prev[deviceId] || !prev[deviceId][fileId]) return prev;
                    return {
                        ...prev,
                        [deviceId]: {
                            ...prev[deviceId],
                            [fileId]: {
                                ...prev[deviceId][fileId],
                                status: 'paused'
                            }
                        }
                    }
                })
                break;
            }
            case "file-resume": {
                if (currentTransfers.current[deviceId]) {
                    currentTransfers.current[deviceId][fileId] = 'uploading';
                }
                setSentFileProgress(prev => {
                    if (!prev[deviceId] || !prev[deviceId][fileId]) return prev;
                    return {
                        ...prev,
                        [deviceId]: {
                            ...prev[deviceId],
                            [fileId]: {
                                ...prev[deviceId][fileId],
                                status: 'uploading'
                            }
                        }
                    }
                })
                break;
            }
            case 'cancel-upload': {
                if (receivedChunks.current[deviceId]) delete receivedChunks.current[deviceId][fileId];
                if (receivedFiles.current[deviceId]) delete receivedFiles.current[deviceId][fileId];
                if (receivedFilePromises.current[deviceId]) delete receivedFilePromises.current[deviceId][fileId]

                if (receivedChunks.current[deviceId] && Object.keys(receivedChunks.current[deviceId]).length === 0) delete receivedChunks.current[deviceId];
                if (receivedFiles.current[deviceId] && Object.keys(receivedFiles.current[deviceId]).length === 0) delete receivedFiles.current[deviceId];
                if (receivedFilePromises.current[deviceId] && Object.keys(receivedFilePromises.current[deviceId]).length === 0) delete receivedFilePromises.current[deviceId];

                setReceivedFileProgress(prev => {
                    if (!prev[deviceId] || !prev[deviceId][fileId]) return prev;
                    const updatedDevice = { ...prev[deviceId] };
                    delete updatedDevice[fileId];
                    if (Object.keys(updatedDevice).length === 0) {
                        const updated = { ...prev } as typeof prev;
                        delete updated[deviceId];
                        return updated;
                    }
                    return { ...prev, [deviceId]: updatedDevice };
                })
                patchDownload(fileId, { cancelled: true }).then(() => {
                    emit('download-cancelled', fileId)
                }).catch(() => { })
                
                Promise.allSettled([
                    deleteFileFromIndexedDB(fileId),
                    deleteFileMetadata(fileId)
                ]).then(() => {
                    emit('file-deleted', fileId)
                }).catch(() => { })
                break
            }
            case "file-end":
                const fileInfo = receivedFiles.current[deviceId]?.[fileId] ? receivedFiles.current[deviceId][fileId] : receivedFilePromises.current[deviceId]?.[fileId] instanceof Promise ? await receivedFilePromises.current[deviceId][fileId] : null;
                if (!fileInfo) return
                fileInfo.chunkCount = message.totalChunks;
                const finishStart = Date.now()
                const finishEnd = finishStart + 1000 * 60
                !(async () => {
                    while (fileInfo.chunksReceived !== fileInfo.chunkCount) {
                        if (finishEnd < Date.now()) {
                            console.warn('Finalizing after timeout', { expected: fileInfo.chunkCount, received: fileInfo.chunksReceived, name: fileInfo.name })
                            break
                        }
                        console.warn(`File transfer incomplete for ${fileInfo.name}. Expected ${fileInfo.chunkCount} chunks, received ${fileInfo.chunksReceived}. Waiting to finish...`);
                        await new Promise((res) => setTimeout(res, 350))
                    }
                    
                    updateDownload({ fileId, chunks_received: fileInfo.chunksReceived }).then(() => {
                        emit('download-complete', fileId)
                    }).catch(() => { })
                    patchDownload(fileId, { totalChunks: fileInfo.chunkCount }).catch(() => { })
                    downloadFile(deviceId, fileId)
                    deleteDownload(fileId).catch(() => { })
                })();
                break;
            default:
                console.warn("Unknown JSON message type:", message);
        }
    }, [downloadFile])

    const onDataChannelMessageRef = useRef(onDataChannelMessage)
    useEffect(() => { onDataChannelMessageRef.current = onDataChannelMessage }, [onDataChannelMessage])

    const setupDataChannel = useCallback((channel: RTCDataChannel, deviceId: string) => {
        channel.onopen = () => { }
        channel.onclose = () => {
            disconnectPeerConnection(deviceId);
        }
        channel.onmessage = (event) => {
            const fn = onDataChannelMessageRef.current
            if (fn) fn(deviceId, event.data)
        }
        channel.onerror = (error) => {
            console.error(`DataChannel error with ${deviceId}:`, error);
        };
    }, [onDataChannelMessage])

    const addDataChannel = useCallback((deviceId: string) => {
        const peerConnection = peerConnections.current[deviceId];
        if (!peerConnection) throw new Error(`No peer connection for device ${deviceId}`);
        if (!dataChannels.current[deviceId]) {
            dataChannels.current[deviceId] = [];
        }
        const dataChannel = peerConnection.createDataChannel(`fileChannel-${Math.random().toString(36).substring(4)}`);
        dataChannels.current[deviceId].push(dataChannel)
        setupDataChannel(dataChannel, deviceId);
    }, [setupDataChannel])
    const createPeerConnection = useCallback((deviceId: string, isInitiator: boolean) => {
        if (disconnectionCount.current[deviceId] > 3) {
            requestedPeers.current.delete(deviceId);
            disconnectPeerConnection(deviceId);
            return
        }
        requestedPeers.current.add(deviceId);
        if (peerConnections.current[deviceId]) {
            return peerConnections.current[deviceId];
        }
        const peerConnection = new RTCPeerConnection(rtcOptions);
        peerConnections.current[deviceId] = peerConnection;

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                sendMessage(deviceId, { type: 'webrtc-ice', data: event.candidate });
            }
        };

        peerConnection.ondatachannel = (event) => {
            if (!dataChannels.current[deviceId]) {
                dataChannels.current[deviceId] = [];
            }
            dataChannels.current[deviceId].push(event.channel)
            setupDataChannel(event.channel, deviceId);
        };

        peerConnection.onconnectionstatechange = (e) => {
            if (peerConnection.connectionState === "connected") {
                disconnectionCount.current[deviceId] = 0;
                setRtcPeers(prev => ({ ...prev, [deviceId]: true }));
            } else if (["disconnected", "closed", "failed"].includes(peerConnection.connectionState)) {
                disconnectionCount.current[deviceId] = (disconnectionCount.current[deviceId] || 0) + 1;
                if (peerConnection.connectionState === 'failed' && requestedPeers.current.has(deviceId)) {
                    delete peerConnections.current[deviceId]
                    delete dataChannels.current[deviceId];
                    setRtcPeers(prev => {
                        const updated = { ...prev };
                        delete updated[deviceId];
                        return updated;
                    });
                    createPeerConnection(deviceId, true);
                } else {
                    disconnectPeerConnection(deviceId);
                }
            }
        };


        if (isInitiator) {
            for (let i = 0; i < numberOfChannels; i++) {
                addDataChannel(deviceId)
            }
            peerConnection.createOffer().then((offer) => {
                peerConnection.setLocalDescription(offer).then(() => {
                    sendMessage(deviceId, { type: "webrtc-offer", data: offer });
                });
            }).catch(console.error);
        } else {
            setSelectedPeer(peer => {
                if (peer !== deviceId) return deviceId
                return peer
            })
        }
        return peerConnection;
    }, [addDataChannel]);

    const onMessage = useCallback(async (deviceId: string, data: PeerMessage) => {

        if (data.requestId && emitter.listeners[data.requestId]) {
            emit(data.requestId, data);
        } else {
            switch (data.type) {
                case "file-metadata": {
                    const { fileId, name, size } = data.data;
                    if (pendingFileRequests.current[fileId]) {
                        console.warn(`Duplicate file request ignored for ${name}`);
                        return;
                    }
                    pendingFileRequests.current[fileId] = {
                        size,
                        name,
                        type: data.data.type
                    };

                    if (!autoAcceptFiles) {
                    confirm(`Accept file "${name}" (${formatBytes(size, 2)}) from ${state.peers.find((({ deviceId: d }) => d === deviceId))?.deviceName || deviceId}?`, (accepted) => {
                            if (accepted) {
                                sendMessage(deviceId, { type: "file-accept", fileId, requestId: data.requestId });
                            } else {
                                sendMessage(deviceId, { type: "file-reject", fileId, requestId: data.requestId });
                            }
                            delete pendingFileRequests.current[fileId];
                        })
                    } else {
                        sendMessage(deviceId, { type: "file-accept", fileId, requestId: data.requestId });
                        delete pendingFileRequests.current[fileId];
                    }

                    
                    try {
                        const bytes = await getDownloadedBytes(fileId)
                        const pct = size > 0 ? Math.min(100, Math.round((bytes / size) * 100)) : 0
                        setReceivedFileProgress(prev => ({
                            ...prev,
                            [deviceId]: {
                                ...(prev[deviceId] || {}),
                                [fileId]: { name, progress: pct, status: pct > 0 ? 'pending' : undefined }
                            }
                        }))
                    } catch {}
                    break;
                }
                case "file-accept":
                    console.warn(`File transfer accepted by ${deviceId}`);
                    break;
                case "file-reject":
                    console.warn(`File transfer rejected by ${deviceId}`);
                    break;
                case "webrtc-offer":
                    const peerConnection = createPeerConnection(deviceId, false);
                    if (!peerConnection) return;
                    peerConnection.setRemoteDescription(new RTCSessionDescription(data.data))
                        .then(() => peerConnection.createAnswer())
                        .then((answer) => {
                            peerConnection.setLocalDescription(answer).then(() => {
                                sendMessage(deviceId, { type: "webrtc-answer", data: answer });
                            });
                        });
                    break;
                case "webrtc-answer":
                    peerConnections.current[deviceId]?.setRemoteDescription(new RTCSessionDescription(data.data));
                    break;
                case "webrtc-ice":
                    peerConnections.current[deviceId]?.addIceCandidate(new RTCIceCandidate(data.data));
                    break;
                case 'resume-request': {
                    
                    const fid = data.data.fileId
                    const rbytes = data.data.receivedBytes || 0
                    let sName = uploadSessions.current[deviceId]?.[fid]?.name as string | undefined
                    let sSize = uploadSessions.current[deviceId]?.[fid]?.size as number | undefined
                    if (!sName || !sSize) {
                        try {
                            const sess = await getUploadSessionByFileId(fid)
                            if (sess && sess.deviceId === deviceId) {
                                sName = sess.name
                                sSize = sess.size
                            }
                        } catch {}
                    }
                    if (sName && sSize) {
                        const pct = sSize > 0 ? Math.min(100, Math.round((rbytes / sSize) * 100)) : 0
                        setSentFileProgress(prev => ({
                            ...prev,
                            [deviceId]: {
                                ...(prev[deviceId] || {}),
                                [fid]: { name: sName!, progress: pct, status: 'pending' }
                            }
                        }))
                    }
                    
                    ;(resumeRequested.current[deviceId] || (resumeRequested.current[deviceId] = new Set())).add(fid)
                    if (pendingOffers.current[deviceId] && pendingOffers.current[deviceId].has(fid)) {
                        const setStatus = () => setSentFileProgress(prev => ({
                            ...prev,
                            [deviceId]: {
                                ...(prev[deviceId] || {}),
                                [fid]: {
                                    name: sName || fid,
                                    progress: prev[deviceId]?.[fid]?.progress || 0,
                                    status: 'resuming'
                                }
                            }
                        }))
                        const list = await listAllDownloadMetadata().catch(() => [])
                        const rec = (list as any[]).find((d: any) => d.fileId === fid && d.deviceId === deviceId)
                        const receivedChunks = rec?.chunks_received || 0
                        setStatus()
                        resumeUploadLargeFile(deviceId, fid, receivedChunks)
                    } else if (autoResume) approveResume(deviceId, fid)
                    break
                }
                case 'resume-status': {
                    const fid = data.data.fileId
                    const rbytes = data.data.receivedBytes || 0
                    let sName = uploadSessions.current[deviceId]?.[fid]?.name as string | undefined
                    let sSize = uploadSessions.current[deviceId]?.[fid]?.size as number | undefined
                    if (!sName || !sSize) {
                        try {
                            const sess = await getUploadSessionByFileId(fid)
                            if (sess && sess.deviceId === deviceId) {
                                sName = sess.name
                                sSize = sess.size
                            }
                        } catch {}
                    }
                    if (sName && sSize) {
                        const pct = sSize > 0 ? Math.min(100, Math.round((rbytes / sSize) * 100)) : 0
                        setSentFileProgress(prev => ({
                            ...prev,
                            [deviceId]: {
                                ...(prev[deviceId] || {}),
                                [fid]: { name: sName!, progress: pct, status: 'pending' }
                            }
                        }))
                    }
                    break
                }
                case 'resume-offer': {
                    const fid = data.data.fileId
                    listAllDownloadMetadata().then(async list => {
                        const rec = list.find(d => d.fileId === fid && d.deviceId === deviceId)
                        const bytes = await getDownloadedBytes(fid).catch(() => 0)
                        const name = rec?.name || fid
                        const size = rec?.size || 0
                        const pct = size > 0 ? Math.min(100, Math.round((bytes / size) * 100)) : 0
                        setReceivedFileProgress(prev => ({
                            ...prev,
                            [deviceId]: {
                                ...(prev[deviceId] || {}),
                                [fid]: { name, progress: pct, status: 'pending' }
                            }
                        }))
                    }).catch(() => {})
                    break
                }
                case 'resume-unsupported': {
                    const fileId = data.data.fileId
                    listAllDownloadMetadata().then(list => {
                        const meta = list.find(d => d.fileId === fileId)
                        if (meta) flash(`Resume not supported: ${meta.name}`)
                        else flash('Resume not supported for this file')
                        return patchDownload(fileId, { cancelled: true }).catch(() => {})
                    }).catch(() => {
                        flash('Resume not supported for this file')
                    })
                    break
                }
                case 'transfer-cancelled': {
                    const fid = data.data.fileId
                    patchDownload(fid, { cancelled: true }).then(() => {
                        emit('download-cancelled', fid)
                    }).catch(() => { })
                    
                    if (receivedChunks.current[deviceId]) delete receivedChunks.current[deviceId][fid];
                    if (receivedFiles.current[deviceId]) delete receivedFiles.current[deviceId][fid];
                    if (receivedFilePromises.current[deviceId]) delete receivedFilePromises.current[deviceId][fid]
                    if (receivedChunks.current[deviceId] && Object.keys(receivedChunks.current[deviceId]).length === 0) delete receivedChunks.current[deviceId];
                    if (receivedFiles.current[deviceId] && Object.keys(receivedFiles.current[deviceId]).length === 0) delete receivedFiles.current[deviceId];
                    if (receivedFilePromises.current[deviceId] && Object.keys(receivedFilePromises.current[deviceId]).length === 0) delete receivedFilePromises.current[deviceId];
                    setReceivedFileProgress(prev => {
                        if (!prev[deviceId] || !prev[deviceId][fid]) return prev;
                        const updatedDevice = { ...prev[deviceId] };
                        delete updatedDevice[fid];
                        if (Object.keys(updatedDevice).length === 0) {
                            const updated = { ...prev } as typeof prev;
                            delete updated[deviceId];
                            return updated;
                        }
                        return { ...prev, [deviceId]: updatedDevice };
                    })
                    
                    setSentFileProgress(prev => {
                        if (!prev[deviceId] || !prev[deviceId][fid]) return prev;
                        const updatedDevice = { ...prev[deviceId] };
                        delete updatedDevice[fid];
                        if (Object.keys(updatedDevice).length === 0) {
                            const updated = { ...prev } as typeof prev;
                            delete updated[deviceId];
                            return updated;
                        }
                        return { ...prev, [deviceId]: updatedDevice };
                    })
                    
                    break
                }
                default:
                    console.warn("Unknown WebSocket message type:", data.type);
                    break;
            }
        }
    }, [createPeerConnection, state.peers, autoAcceptFiles]);

    const onBroadcast = useCallback((message: PeerBroadCastMessage) => {

    }, []);

    useEffect(() => {
        emitter.on('all', onBroadcast);
        return () => {
            emitter.off('all', onBroadcast);
        };
    }, [onBroadcast]);

    useEffect(() => {
        const callbacks = state.peers.map(({ deviceId }) => ({
            deviceId,
            callback: (data: any) => {
                onMessage(deviceId, data as PeerMessage);
            }
        }));

        for (const { deviceId, callback } of callbacks) {
            emitter.on(deviceId, callback);
        }

        return () => {
            for (const { deviceId, callback } of callbacks) {
                emitter.off(deviceId, callback);
            }
        };
    }, [state.peers, onMessage]);
    useEffect(() => {
        return () => {
            Object.values(peerConnections.current).forEach((peerConnection) => {
                peerConnection.onicecandidate = null;
                peerConnection.ontrack = null;
                peerConnection.ondatachannel = null;
                peerConnection.close();
            });
            peerConnections.current = {};

            Object.values(dataChannels.current).forEach((channels) => {
                channels.forEach((channel) => {
                    if (channel && channel.readyState === "open") {
                        channel.close();
                    }
                })
            })
            dataChannels.current = {};

            Object.keys(messageTimeouts.current).forEach((requestId) => {
                clearTimeout(messageTimeouts.current[requestId]);
                delete messageTimeouts.current[requestId];
            });

            receivedFiles.current = {};
            receivedFilePromises.current = {}
            receivedChunks.current = {};
            currentTransfers.current = {};
            pausedTransfers.current = {};
            pendingFileRequests.current = {};
        };
    }, []);
    const connectedPeers = useMemo(() => Object.keys(rtcPeers), [rtcPeers])
    const availablePeers = useMemo(() => Array.from(new Set(state.peers.filter(({ deviceId }) => !rtcPeers[deviceId]).map(peer => peer.deviceId))), [state.peers, rtcPeers])
    useEffect(() => {
        if (!connectedPeers.includes(selectedPeer) && !availablePeers.includes(selectedPeer)) {
            setSelectedPeer('')
        }
    }, [selectedPeer, connectedPeers, availablePeers])
    useEffect(() => {
        const run = async () => {
            const downloads = await listAllDownloadMetadata().catch(() => [])
            for (const deviceId of connectedPeers) {
                for (const d of downloads) {
                    if (d.deviceId !== deviceId) continue
                    if (d.cancelled) continue
                    const total = d.totalChunks || 0
                    const rc = d.chunks_received || 0
                    const inProgress = (total === 0 || rc < total)
                    if (!inProgress) continue
                    const bytes = await getDownloadedBytes(d.fileId).catch(() => 0)
                    const pct = d.size > 0 ? Math.min(100, Math.round((bytes / d.size) * 100)) : 0
                    setReceivedFileProgress(prev => ({
                        ...prev,
                        [deviceId]: {
                            ...(prev[deviceId] || {}),
                            [d.fileId]: {
                                name: d.name,
                                progress: pct,
                                status: 'pending'
                            }
                        }
                    }))
                    
                    sendMessage(deviceId, { type: 'resume-status', data: { fileId: d.fileId, receivedChunks: rc, receivedBytes: bytes } })
                }
            }
        }
        run()
    }, [connectedPeers])

    useEffect(() => {
        const run = async () => {
            const sessions = await listAllUploadSessions().catch(() => [])
            for (const deviceId of connectedPeers) {
                for (const s of sessions) {
                    if (s.deviceId !== deviceId) continue
                    if (s.small) continue
                    setSentFileProgress(prev => ({
                        ...prev,
                        [deviceId]: {
                            ...(prev[deviceId] || {}),
                            [s.fileId]: {
                                name: s.name,
                                progress: prev[deviceId]?.[s.fileId]?.progress || 0,
                                status: 'pending'
                            }
                        }
                    }))
                }
            }
        }
        run()
    }, [connectedPeers])
    return (
        <P2PContext.Provider value={{
            selectedPeer,
            setSelectedPeer,
            pauseTransfer,
            resumeTransfer,
            cancelTransfer,
            receivedFileProgress,
            sendMessage,
            sendFile,
            createPeerConnection,
            disconnectPeerConnection,
            requestFileTransfer,
            requestResume,
            connectedPeers,
            availablePeers,
            cancelUpload,
            sentFileProgress,
            autoAcceptFiles,
            autoDownloadFiles,
            autoResume,
            setAutoAcceptFiles,
            setAutoDownloadFiles,
            setAutoResume,
            resumeNeeds,
            provideResumeFile,
            cancelResumeNeed,
            approveResume,
        }}>
            {children}
        </P2PContext.Provider>
    );
};

export const useP2PContext = () => {
    const context = useContext(P2PContext);
    if (!context) {
        throw new Error('useP2PContext must be used within a P2PProvider');
    }
    return context;
};
