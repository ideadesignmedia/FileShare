import React, { useContext, createContext, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSocket } from './SocketContext';
import { emit, emitter, useAppContext } from './AppContext';
import { rtcOptions } from '../constants';
import { saveChunkToIndexedDB, deleteFileFromIndexedDB, createIndexedDBChunkStream, saveFileMetadata, deleteFileMetadata } from '../utils/indexed-db';
import { BSON } from 'bson';
import { compressSync as brotliCompress, decompressSync as brotliDecompress, Deflate, Inflate } from "fflate";
import { formatBytes } from '../utils/format';
import { createDecryptionStream, createEncryptionStream, genSalts, getCTRBase, createDecryptionStreamCTR, createEncryptionStreamCTR } from '../utils/encryption';
import { deviceId as myDeviceId } from '../constants'
import device from '../constants/device-browser';
import { Buffer } from 'buffer';
import { downloadBlob } from '../utils/handle-file';
import { createChunkedFileWriter } from '../utils/file-writer';

const maxMessageSize = 65536 - 300;
const chunkSize = 1024 * 1024 // 1MB
const maxBufferAmount = 16 * 1024 * 1024 - (maxMessageSize + 300)
export const largeFileSize = 10 * 1024 * 1024; // 10MB
const numberOfChannels = 2;
export type P2PContextType = {
    sendMessage: (deviceId: string, payload: PeerMessage, requestId?: string, timeout?: number) => Promise<PeerMessage | null>;
    sendFile: (deviceId: string, file: File, fileId: string) => void;
    createPeerConnection: (deviceId: string, isInitiator: boolean) => RTCPeerConnection | undefined;
    disconnectPeerConnection: (deviceId: string) => void;
    requestFileTransfer: (deviceId: string, file: File | ReadableStream, fileInfo?: { type: string, name: string, size: number }) => Promise<() => void>;
    pauseTransfer: (deviceId: string, fileId: string) => void;
    resumeTransfer: (deviceId: string, fileId: string) => void;
    cancelTransfer: (deviceId: string, fileId: string) => void;
    cancelUpload: (deviceId: string, fileId: string) => void;
    connectedPeers: string[],
    availablePeers: string[],
    receivedFileProgress: { [deviceId: string]: { [fileId: string]: { progress: number, name: string } } };
    sentFileProgress: { [deviceId: string]: { [fileId: string]: { progress: number, name: string } } };
    selectedPeer: string
    setSelectedPeer: React.Dispatch<React.SetStateAction<string>>
    setAutoAcceptFiles: React.Dispatch<React.SetStateAction<boolean>>
    setAutoDownloadFiles: React.Dispatch<React.SetStateAction<boolean>>
    autoAcceptFiles: boolean,
    autoDownloadFiles: boolean
};

export type PeerMessage = { requestId?: string } & (
    { type: 'connect' } |
    { type: 'webrtc-offer', data: any } |
    { type: 'webrtc-answer', data: any } |
    { type: 'webrtc-ice', data: any } |
    { type: 'file-accept', fileId: string } |
    { type: 'file-reject', fileId: string } |
    {
        type: 'file-metadata',
        data: {
            fileId: string,
            name: string,
            type: string,
            size: number,
            small: boolean
        }
    }
);

type FileMessage = { type: 'file-chunk', data: ArrayBuffer, fileId: string, chunkNumber: number, chunkPart: number, totalParts: number }
    | { type: 'file-end', fileId: string, totalChunks: number }
    | {
        type: 'file-metadata',
        fileId: string,
        data: {
            name: string,
            type: string,
            size: number,
            key: number[],
            iv: number[],
            small: boolean
        }
    }
    | { type: 'file-pause', fileId: string }
    | { type: 'file-resume', fileId: string }
    | { type: 'file-cancel', fileId: string }
    | { type: 'cancel-upload', fileId: string };

type PeerBroadCastMessage = {
    type: 'ping';
};

const P2PContext = createContext<P2PContextType | undefined>(undefined);
type Parts = { parts: Map<number, Uint8Array>, totalParts: number }
const checkIfFile = (file: File | ReadableStream): boolean => Boolean(file instanceof File || (
    file
    && typeof (file as any).name === 'string'
    && typeof (file as any).type === 'string'
    && typeof (file as any).size === 'number'
    && file instanceof Blob
))
type ReceivedFileInfo = {
    name: string;
    type: string,
    size: number,
    progress: number,
    chunkCount: number,
    chunksReceived: number,
    finalized: boolean,
    small: boolean,
    decrypt: ((chunk: Uint8Array) => Promise<Uint8Array>) | ((chunk: Uint8Array, index: number) => Promise<Uint8Array>)
}
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
    const currentTransfers = useRef<{ [deviceId: string]: { [fileId: string]: 'uploading' | 'paused' | 'cancelled' } }>({});
    const pausedTransfers = useRef<{ [deviceId: string]: { [fileId: string]: boolean } }>({});
    const pendingFileRequests = useRef<{
        [fileId: string]: {
            size: number,
            name: string,
            type: string
        }
    }>({});
    const messageTimeouts = useRef<{ [requestId: string]: any }>({});
    const [rtcPeers, setRtcPeers] = React.useState<{ [deviceId: string]: boolean }>({});
    const [receivedFileProgress, setReceivedFileProgress] = React.useState<{
        [deviceId: string]: { [fileId: string]: { progress: number, name: string } }
    }>({});
    const [sentFileProgress, setSentFileProgress] = React.useState<{
        [deviceId: string]: { [fileId: string]: { progress: number, name: string } }
    }>({});
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
    //ctr for large files because it allows for streaming while encrypting however just encrypt the full file for the small ones.
    const createEncrypter = useCallback(async (password: string): Promise<{ key: Uint8Array, iv: Uint8Array, encrypt: (chunk: Uint8Array) => Promise<Uint8Array> }> => {
        const { salt: key, iv } = genSalts()
        const encrypt = await createEncryptionStream(password, key, iv)
        return { encrypt, key, iv }
    }, [])
    const createEncrypterCTR = useCallback(async (password: string): Promise<{ key: Uint8Array, iv: Uint8Array, encrypt: ((chunk: Uint8Array, index: number) => Promise<Uint8Array>) | ((chunk: Uint8Array, index: number) => Promise<Uint8Array>) }> => {
        const { baseCounter, salt } = getCTRBase()
        const encrypt = await createEncryptionStreamCTR(password, salt, baseCounter)
        return { encrypt, key: salt, iv: baseCounter }
    }, [])
    const createDecrypter = useCallback((password: string, key: Uint8Array, iv: Uint8Array) => {
        return createDecryptionStream(password, key, iv)
    }, [])
    const createDecrypterCTR = useCallback((password: string, salt: Uint8Array, baseCounter: Uint8Array) => {
        return createDecryptionStreamCTR(password, salt, baseCounter)
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

    const requestFileTransfer = useCallback((deviceId: string, file: File | ReadableStream, fileInfo?: { name: string, type: string, size: number }) => {
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
        delete receivedChunks.current[deviceId]?.[fileId];
        delete receivedFiles.current[deviceId]?.[fileId];
        delete receivedFilePromises.current[deviceId]?.[fileId];
        delete pausedTransfers.current[deviceId]?.[fileId];
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
    }, []);

    const cancelUpload = useCallback((deviceId: string, fileId: string) => {
        messageDataChannel(deviceId, { type: "cancel-upload", fileId });
        delete currentTransfers.current[deviceId]?.[fileId];
        setSentFileProgress(prev => {
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
    }, [])

    const sendFile = useCallback((deviceId: string, file: File | ReadableStream, fileId: string, fileInfo?: {
        name: string,
        type: string,
        size: number
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
            let sentBytes = 0;
            let sentChunks = 0

            if (!nextChannelIndex.current[deviceId]) {
                nextChannelIndex.current[deviceId] = 0;
            }
            const updateProgress = () => {
                if (sentChunks % 5 === 0) setSentFileProgress(prev => ({
                    ...prev,
                    [deviceId]: {
                        ...(prev[deviceId] || {}),
                        [fileId]: {
                            name,
                            progress: parseFloat(Math.min(100, (sentBytes / size) * 100).toFixed(2))
                        }
                    }
                }));
            };

            const sendChunk = async (channel: RTCDataChannel, chunk: Uint8Array, chunkNumber: number, chunkPart: number, totalParts: number) => {
                while (channel.bufferedAmount > maxBufferAmount) {
                    await new Promise(res => setTimeout(res, 50));
                }
                const encodedChunk = BSON.serialize({ type: "file-chunk", fileId, data: chunk, chunkNumber, chunkPart: Math.max(1, chunkPart), totalParts: Math.max(1, totalParts) });
                channel.send(encodedChunk);
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
                    }
                    messageDataChannel(deviceId, { type: "file-end", fileId, totalChunks: sentChunks });
                    setSentFileProgress(prev => ({
                        ...prev,
                        [deviceId]: {
                            ...(prev[deviceId] || {}),
                            [fileId]: {
                                name,
                                progress: 100
                            }
                        }
                    }))
                    resolve(null);
                } catch (e) {
                    reject(e);
                }
            };

            const sendLargeFile = async () => {
                try {
                    messageDataChannel(deviceId, {
                        type: "file-metadata",
                        fileId,
                        data: { name, type, size, key: Array.from(key), iv: Array.from(iv), small: false }
                    });

                    const compressor = new Deflate();
                    const transformStream = new TransformStream({
                        start(controller) {
                            compressor.ondata = (chunk, final) => {
                                controller.enqueue(chunk);
                                if (final) controller.terminate();
                            };
                        },
                        transform(chunk) {
                            compressor.push(new Uint8Array(chunk));
                        },
                        flush() {
                            compressor.push(new Uint8Array(), true);
                        }
                    });

                    const reader = (checkIfFile(file) && !(file instanceof ReadableStream) ? file.stream() : file as ReadableStream).pipeThrough(transformStream).getReader();

                    const processStream = async () => {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            sentChunks += 1
                            const encryptedChunk = await encrypt(value, sentChunks)
                            const chunkParts = Math.ceil(encryptedChunk.byteLength / maxMessageSize)
                            let chunkPart = 0
                            for (let i = 0; i < encryptedChunk.byteLength; i += maxMessageSize) {
                                const chunk = encryptedChunk.slice(i, i + maxMessageSize);
                                const channel = getNextChannel();
                                chunkPart += 1;
                                await sendChunk(channel, chunk, sentChunks, chunkPart, chunkParts);
                                sentBytes += chunk.byteLength;
                                updateProgress();
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
                        messageDataChannel(deviceId, { type: "file-end", fileId, totalChunks: sentChunks });
                        setSentFileProgress(prev => ({
                            ...prev,
                            [deviceId]: {
                                ...(prev[deviceId] || {}),
                                [fileId]: {
                                    name,
                                    progress: 100
                                }
                            }
                        }))
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

    const downloadFile = useCallback(async (deviceId: string, fileId: string) => {
        const fileInfo = receivedFiles.current[deviceId][fileId];
        if (fileInfo.finalized) return console.warn(`File "${fileInfo.name}" already finalized.`);
        fileInfo.finalized = true
        delete receivedFiles.current[deviceId][fileId];
        delete receivedFilePromises.current[deviceId][fileId]
        if (Object.keys(receivedFiles.current[deviceId]).length === 0) delete receivedFiles.current[deviceId];
        if (Object.keys(receivedFilePromises.current[deviceId]).length === 0) delete receivedFilePromises.current[deviceId];
        setReceivedFileProgress(prev => {
            return {
                ...prev,
                [deviceId]: prev[deviceId] ? {
                    ...prev[deviceId],
                    [fileId]: { progress: 100, name: fileInfo.name }
                } : { [fileId]: { progress: 100, name: fileInfo.name } }
            }
        });
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
                                                // Done writing all chunks
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
                                            fileWriter.seek(offset); // move to correct position
                                            fileWriter.write(nextChunk);
                                            offset += nextChunk.size;
                                        }

                                        // Start the first chunk write
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
                    const blob = new Blob([decompressedData], { type: fileInfo.type });
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
                delete receivedChunks.current[deviceId][fileId];
                if (Object.keys(receivedChunks.current[deviceId]).length === 0) delete receivedChunks.current[deviceId];
            }
        } else {
            if (receivedChunks.current[deviceId][fileId]) delete receivedChunks.current[deviceId][fileId];
            if (Object.keys(receivedChunks.current[deviceId]).length === 0) delete receivedChunks.current[deviceId];
            createIndexedDBChunkStream(fileId).then((compressedStream) => {
                const inflater = new Inflate();
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
                const decompressedStream = compressedStream.pipeThrough(transformStream);
                const reader = decompressedStream.getReader()
                if (!device.app) {
                    const chunks: Uint8Array[] = [];
                    const read = () => {
                        reader.read().then(({ done, value }) => {
                            if (done) {
                                const finalize = () => {
                                    if (autoDownloadFiles) {
                                        downloadBlob(new Blob(chunks, { type: fileInfo.type }), fileInfo.name);
                                    } else {
                                        saveChunksToFile(chunks)
                                    }
                                }
                                deleteFileFromIndexedDB(fileId).then(() => {
                                    finalize()
                                }).catch(e => {
                                    console.error('Error deleting file from IndexedDB', e);
                                    if (!autoDownloadFiles) {
                                        throw new Error('Failed to delete from indexededDB. Did not save.')
                                    }
                                    //mutate fileId here to ensure that the decompressed chunks are stored to a unique fileId. The old chunks will be deleted on next launch.
                                    fileId = crypto.randomUUID()
                                    finalize()
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
                                    console.log("closing", filePath)
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
                        const receivedSize = Object.values(receivedChunks.current[deviceId][fileId])
                            .reduce((acc: number, map: Parts) => {
                                const chunks = Array.from(map.parts.entries()).sort(([indexA], [indexB]) => {
                                    return indexA - indexB
                                })
                                for (let i = 0; i < chunks.length; i++) {
                                    const chunk = chunks[i][1]
                                    acc += (chunk instanceof ArrayBuffer ? chunk.byteLength : new Blob([chunk]).size)
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
                                    [fileId]: { progress: Math.max((prev[deviceId]?.[fileId]?.progress || 0), progress), name: fileInfo.name }
                                } : { [fileId]: { progress, name: fileInfo.name } }
                            }));
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
                                        [fileId]: { progress: Math.max((prev[deviceId]?.[fileId]?.progress || 0), progress), name: fileInfo.name }
                                    } : { [fileId]: { progress, name: fileInfo.name } }
                                }));
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
                break
            }
            case "file-pause": {
                if (currentTransfers.current[deviceId]) {
                    currentTransfers.current[deviceId][fileId] = 'paused';
                }
                break;
            }
            case "file-resume": {
                if (currentTransfers.current[deviceId]) {
                    currentTransfers.current[deviceId][fileId] = 'uploading';
                }
                break;
            }
            case 'cancel-upload': {
                delete receivedChunks.current[deviceId][fileId];
                delete receivedFiles.current[deviceId][fileId];
                delete receivedFilePromises.current[deviceId][fileId]

                if (Object.keys(receivedChunks.current[deviceId]).length === 0) delete receivedChunks.current[deviceId];
                if (Object.keys(receivedFiles.current[deviceId]).length === 0) delete receivedFiles.current[deviceId];
                if (Object.keys(receivedFilePromises.current[deviceId]).length === 0) delete receivedFilePromises.current[deviceId];

                setReceivedFileProgress(prev => {
                    if (!prev[deviceId]) return prev;
                    if (!prev[deviceId][fileId]) return prev;
                    const updatedDevice = { ...prev[deviceId] };
                    delete updatedDevice[fileId];

                    if (Object.keys(updatedDevice[deviceId]).length === 0) {
                        const updatedProgress = { ...prev };
                        delete updatedProgress[deviceId];
                        return updatedProgress;
                    }

                    return { ...prev, [deviceId]: updatedDevice };
                })
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
                            return
                        } else {
                            console.warn(`File transfer incomplete for ${fileInfo.name}. Expected ${fileInfo.chunkCount} chunks, received ${fileInfo.chunksReceived}. Waiting to finish...`);
                            await new Promise((res) => setTimeout(res, 350))
                        }
                    }
                    downloadFile(deviceId, fileId)
                })();
                break;
            default:
                console.warn("Unknown JSON message type:", message);
        }
    }, [downloadFile])

    const setupDataChannel = useCallback((channel: RTCDataChannel, deviceId: string) => {
        channel.onopen = () => { }
        channel.onclose = () => {
            disconnectPeerConnection(deviceId);
        }
        channel.onmessage = (event) => {
            onDataChannelMessage(deviceId, event.data);
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
    const availablePeers = useMemo(() => state.peers.filter(({ deviceId }) => !rtcPeers[deviceId]).map(peer => peer.deviceId), [state.peers, rtcPeers])
    useEffect(() => {
        if (!connectedPeers.includes(selectedPeer) && !availablePeers.includes(selectedPeer)) {
            setSelectedPeer('')
        }
    }, [selectedPeer, connectedPeers, availablePeers])
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
            connectedPeers,
            availablePeers,
            cancelUpload,
            sentFileProgress,
            autoAcceptFiles,
            autoDownloadFiles,
            setAutoAcceptFiles,
            setAutoDownloadFiles,

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