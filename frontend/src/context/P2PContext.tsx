import React, { useContext, createContext, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSocket } from './SocketContext';
import { emitter, useAppContext } from './AppContext';
import { rtcOptions } from '../constants';
import { saveChunkToIndexedDB, deleteFileFromIndexedDB, createIndexedDBChunkStream } from '../utils/indexed-db';
import { BSON } from 'bson';
import { compressSync as brotliCompress, decompressSync as brotliDecompress, Deflate, Inflate } from "fflate";
import { formatBytes } from '../utils/format';

const maxMessageSize = 65536 - 300;
const maxBufferAmount = 16 * 1024 * 1024 - (maxMessageSize + 300)
export const largeFileSize = 10 * 1024 * 1024; // 10MB
const numberOfChannels = 4;
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
    setSelectedPeer: (peer: string) => void
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
            size: number
        }
    }
);

type FileMessage = { type: 'file-chunk', data: ArrayBuffer, fileId: string, chunkNumber: number }
    | { type: 'file-end', fileId: string, totalChunks: number }
    | {
        type: 'file-metadata',
        fileId: string,
        data: {
            name: string,
            type: string,
            size: number
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

export const P2PProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const { state, confirm } = useAppContext();
    const { send } = useSocket();
    const [selectedPeer, setSelectedPeer] = React.useState<string>('');
    const peerConnections = useRef<{ [deviceId: string]: RTCPeerConnection }>({});
    const requestedPeers = useRef<Set<string>>(new Set());
    const dataChannels = useRef<{ [deviceId: string]: RTCDataChannel[] }>({});
    const nextChannelIndex = useRef<{ [deviceId: string]: number }>({});
    const disconnectionCount = useRef<{ [deviceId: string]: number }>({});
    const receivedFiles = useRef<{ [deviceId: string]: { [fileId: string]: { name: string; type: string, size: number, progress: number, chunkCount: number, chunksReceived: number, finalized: boolean } } }>({});
    const receivedChunks = useRef<{ [deviceId: string]: { [fileId: string]: { chunk: Uint8Array, index: number }[] } }>({});
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

    const addDataChannel = useCallback((deviceId: string) => {
        const peerConnection = peerConnections.current[deviceId];
        if (!peerConnection) throw new Error(`No peer connection for device ${deviceId}`);
        if (!dataChannels.current[deviceId]) {
            dataChannels.current[deviceId] = [];
        }
        const dataChannel = peerConnection.createDataChannel(`fileChannel-${Math.random().toString(36).substring(4)}`);
        dataChannels.current[deviceId].push(dataChannel)
        setupDataChannel(dataChannel, deviceId);
    }, [])

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
                if (requestedPeers.current.has(deviceId)) {
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
    }, []);

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
        const isFile = file instanceof File
        if (!isFile) {
            if (!fileInfo) throw new Error('fileInfo must be provided for ReadableStream file transfers');
        }
        return sendMessage(deviceId, {
            type: "file-metadata", data: {
                fileId,
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
        return new Promise<null>((resolve, reject) => {
            const channels = dataChannels.current[deviceId];
            if (!channels || channels.length === 0) {
                reject(new Error(`No open data channels for device ${deviceId}`));
                return;
            }
            if (!(file instanceof File)) {
                if (!fileInfo) {
                    reject(new Error('fileInfo must be provided for ReadableStream file transfers'));
                    return;
                }
            }
            const { name, type, size } = file instanceof File ? file : fileInfo!;
            const isSmallFile = file instanceof File && size < largeFileSize;
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

            const sendChunk = async (channel: RTCDataChannel, chunk: Uint8Array) => {
                while (channel.bufferedAmount > maxBufferAmount) {
                    await new Promise(res => setTimeout(res, 50));
                }
                const encodedChunk = BSON.serialize({ type: "file-chunk", fileId, data: chunk, chunkNumber: sentChunks++ });
                channel.send(encodedChunk);
            };

            const getNextChannel = (): RTCDataChannel => {
                const channel = channels[nextChannelIndex.current[deviceId] % channels.length];
                nextChannelIndex.current[deviceId]++;
                return channel;
            };

            const sendSmallFile = async () => {
                if (!(file instanceof File)) throw new Error('Small file transfer requires a File object');
                const compressedFile = brotliCompress(new Uint8Array(await file.arrayBuffer()));
                try {
                    messageDataChannel(deviceId, {
                        type: "file-metadata",
                        fileId,
                        data: { name, type, size }
                    });

                    for (let i = 0; i < compressedFile.byteLength; i += maxMessageSize) {
                        const chunk = compressedFile.slice(i, i + maxMessageSize);
                        const channel = getNextChannel();
                        await sendChunk(channel, chunk);
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
                        data: { name, type, size }
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

                    const reader = (file instanceof File ? file.stream() : file).pipeThrough(transformStream).getReader();

                    const processStream = async () => {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            for (let i = 0; i < value.byteLength; i += maxMessageSize) {
                                const chunk = value.slice(i, i + maxMessageSize);
                                const channel = getNextChannel();
                                await sendChunk(channel, chunk);
                                sentBytes += chunk.byteLength;
                                updateProgress();

                                if (currentTransfers.current[deviceId]?.[fileId] === 'paused') {
                                    while (currentTransfers.current[deviceId]?.[fileId] === 'paused') {
                                        await new Promise(res => setTimeout(res, 200));
                                    }
                                }
                                if (currentTransfers.current[deviceId]?.[fileId] === 'cancelled') {
                                    reject(new Error("File transfer cancelled"));
                                    return;
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

    const downloadFile = useCallback((deviceId: string, fileId: string) => {
        const fileInfo = receivedFiles.current[deviceId][fileId];
        if (fileInfo.finalized) return console.warn(`File "${fileInfo.name}" already finalized.`);
        fileInfo.finalized = true
        setReceivedFileProgress(prev => {
            return {
                ...prev,
                [deviceId]: prev[deviceId] ? {
                    ...prev[deviceId],
                    [fileId]: { progress: 100, name: fileInfo.name }
                } : { [fileId]: { progress: 100, name: fileInfo.name } }
            }
        });
        const sendBlob = (blob: Blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.download = fileInfo.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            delete receivedFiles.current[deviceId][fileId];
            if (Object.keys(receivedFiles.current[deviceId]).length === 0) delete receivedFiles.current[deviceId];
        }
        if (fileInfo.size < largeFileSize) {
            const compressedChunks = receivedChunks.current[deviceId][fileId];
            const compressedData = new Uint8Array(compressedChunks.sort(({ index: indexA }, { index: indexB }) => {
                return indexA - indexB;
            }).reduce((acc: number[], { chunk }) => acc.concat(Array.from(chunk)), []));
            try {
                const decompressedData = brotliDecompress(compressedData);
                const blob = new Blob([decompressedData], { type: fileInfo.type });

                delete receivedChunks.current[deviceId][fileId];
                if (Object.keys(receivedChunks.current[deviceId]).length === 0) delete receivedChunks.current[deviceId];

                sendBlob(blob);
            } catch (error) {
                console.error("Error decompressing Brotli data:", error);
            }
        } else {
            createIndexedDBChunkStream(fileId).then((compressedStream) => {
                const inflater = new Inflate();
                const transformStream = new TransformStream({
                    start(controller) {
                        inflater.ondata = (chunk, final) => {
                            controller.enqueue(chunk);
                            if (final) controller.terminate();
                        };
                    },
                    transform(chunk) {
                        try {
                            inflater.push(chunk);
                        } catch (e) {
                            console.error('Invalid chunk', chunk instanceof Uint8Array)
                        }
                    },
                    flush() {
                        inflater.push(new Uint8Array(), true);
                    }
                })
                const decompressedStream = compressedStream.pipeThrough(transformStream);
                const reader = decompressedStream.getReader()
                const chunks: Uint8Array[] = [];
                const read = () => {
                    reader.read().then(({ done, value }) => {
                        if (done) {
                            deleteFileFromIndexedDB(fileId).catch(e => {
                                console.error('Error deleting file from IndexedDB', e);
                            })
                            const blob = new Blob(chunks, { type: fileInfo.type });
                            sendBlob(blob)
                            return;
                        }
                        chunks.push(value)
                        read();
                    });
                }
                read()
            })
        }
    }, [])

    const onDataChannelMessage = useCallback((deviceId: string, data: any) => {
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
                receivedFiles.current[deviceId][fileId] = {
                    name: message.data.name,
                    size: message.data.size,
                    type: message.data.type,
                    progress: 0,
                    chunkCount: 0,
                    chunksReceived: 0,
                    finalized: false
                };
                break;
            }

            case "file-chunk": {
                const fileInfo = receivedFiles.current[deviceId]?.[fileId];
                if (fileInfo) {
                    fileInfo.chunksReceived++;
                    //console.log("Received chunk", message.chunkNumber, "for file", fileInfo.name, fileInfo.chunksReceived);
                    if (fileInfo.size < largeFileSize) {
                        if (!receivedChunks.current[deviceId]) receivedChunks.current[deviceId] = {};
                        if (!receivedChunks.current[deviceId][fileId]) receivedChunks.current[deviceId][fileId] = []
                        let chunk: Uint8Array;
                        if (message.data instanceof BSON.Binary) {
                            chunk = message.data.buffer;
                        } else {
                            chunk = new Uint8Array(message.data);
                        }
                        receivedChunks.current[deviceId][fileId].push({ chunk, index: message.chunkNumber });
                        const receivedSize = receivedChunks.current[deviceId][fileId]
                            .reduce((acc, { chunk }) => acc + (chunk instanceof ArrayBuffer ? chunk.byteLength : new Blob([chunk]).size), 0);
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
                        if (fileInfo.chunkCount && fileInfo.chunksReceived === fileInfo.chunkCount) {
                            downloadFile(deviceId, fileId)
                        }
                    } else {
                        let chunk: Uint8Array;
                        if (message.data instanceof BSON.Binary) {
                            chunk = message.data.buffer;
                        } else {
                            chunk = new Uint8Array(message.data);
                        }
                        saveChunkToIndexedDB(fileId, message.chunkNumber, chunk).then(() => {
                            fileInfo.progress += chunk.byteLength;
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
                            if (fileInfo.chunkCount && fileInfo.chunksReceived === fileInfo.chunkCount) {
                                downloadFile(deviceId, fileId)
                            }
                        }).catch(e => {
                            console.error('Error saving chunk to IndexedDB', e);
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

                if (Object.keys(receivedChunks.current[deviceId]).length === 0) delete receivedChunks.current[deviceId];
                if (Object.keys(receivedFiles.current[deviceId]).length === 0) delete receivedFiles.current[deviceId];

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
                if (!receivedFiles.current[deviceId] || !receivedFiles.current[deviceId][fileId]) return;
                const fileInfo = receivedFiles.current[deviceId][fileId];
                fileInfo.chunkCount = message.totalChunks;
                if (fileInfo.chunksReceived === fileInfo.chunkCount) {
                    downloadFile(deviceId, fileId)
                } else {
                    console.warn(`File transfer incomplete for ${fileInfo.name}. Expected ${fileInfo.chunkCount} chunks, received ${fileInfo.chunksReceived}. Waiting to finish...`);
                }
                break;
            default:
                console.warn("Unknown JSON message type:", message);
        }
    }, [])

    const onMessage = useCallback((deviceId: string, data: PeerMessage) => {

        if (data.requestId && emitter.listeners[data.requestId]) {
            emitter.emit(data.requestId, data);
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

                    confirm(`Accept file "${name}" (${formatBytes(size, 2)}) from ${state.peers.find((({deviceId: d}) => d === deviceId))?.deviceName || deviceId}?`, (accepted) => {
                        if (accepted) {
                            sendMessage(deviceId, { type: "file-accept", fileId, requestId: data.requestId });
                        } else {
                            sendMessage(deviceId, { type: "file-reject", fileId, requestId: data.requestId });
                        }
                        delete pendingFileRequests.current[fileId];
                    });
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
    }, [createPeerConnection, state.peers]);

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
        } else if (!connectedPeers.includes(selectedPeer) && availablePeers.includes(selectedPeer) && !requestedPeers.current.has(selectedPeer)) {
            createPeerConnection(selectedPeer, true)
        } else if (!selectedPeer && connectedPeers.length) {
            setSelectedPeer(connectedPeers[0])
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
            sentFileProgress
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