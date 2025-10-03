import device from "../constants/device-browser";

let dbInstance: IDBDatabase | null = null;
let cleanupDone = false;


export type FileMetadata = {
    fileId: string;
    name: string,
    type: string,
    size: number,
    pathname: string;
    downloaded_at: number,
    stored_in_db: boolean,
    folderRoot?: string,
    relativePath?: string,
    temp?: boolean,
    shareToken?: string
}
export type SavedChunk = {
    id: number,
    fileId: string,
    chunkIndex: number,
    chunkData: Uint8Array
}
export type DownloadMetadata = {
    id: number,
    fileId: string,
    deviceId: string,
    name: string,
    type: string,
    size: number,
    started_at: number,
    resumed_at?: number,
    chunks_received?: number,
    totalChunks?: number,
    stored_in_db: boolean,
    cancelled?: boolean
}

export type UploadSession = {
    id: number,
    fileId: string,
    deviceId: string,
    name: string,
    type: string,
    size: number,
    small: boolean,
    started_at: number,
    sentChunks?: number,
    totalChunks?: number,
    password?: string,
    key?: number[],
    iv?: number[],
    filePath?: string,
    resumeSupported: boolean,
    savedFileId?: string
}

export async function openIndexedDB(): Promise<IDBDatabase> {
    if (dbInstance) return dbInstance;

    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("fileTransferDB", 4);

        request.onupgradeneeded = () => {
            const db = request.result;

            // Chunks store
            if (!db.objectStoreNames.contains("chunks")) {
                const store = db.createObjectStore("chunks", { keyPath: "chunkId" });
                store.createIndex("fileIdIndex", "fileId", { unique: false });
                store.createIndex("chunkIndexIndex", ["fileId", "chunkIndex"], { unique: true });
            }

            // File metadata store
            if (!db.objectStoreNames.contains("fileMetadata")) {
                const metaStore = db.createObjectStore("fileMetadata", { keyPath: "primaryId", autoIncrement: true });
                metaStore.createIndex("fileIdIndex", "fileId", { unique: true });
                metaStore.createIndex("pathnameIndex", "pathname", { unique: false });
                metaStore.createIndex("downloadedAtIndex", "downloaded_at", { unique: false });
                metaStore.createIndex("storedInDbIndex", "stored_in_db", { unique: false });
            }

            // File download store
            if (!db.objectStoreNames.contains('fileDownload')) {
                const downloadStore = db.createObjectStore('fileDownload', { keyPath: 'primaryId', autoIncrement: true })
                downloadStore.createIndex('downloadIdIndex', 'fileId', { unique: true })
                downloadStore.createIndex('deviceIdIndex', 'deviceId', { unique: false })
            }
            // Upload session store for resumable uploads
            if (!db.objectStoreNames.contains('uploadSession')) {
                const uploadStore = db.createObjectStore('uploadSession', { keyPath: 'primaryId', autoIncrement: true })
                uploadStore.createIndex('sessionIdIndex', 'fileId', { unique: true })
                uploadStore.createIndex('deviceIdIndex', 'deviceId', { unique: false })
            }
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            dbInstance.onclose = () => dbInstance = null;

            if (!cleanupDone) {
                const tx = dbInstance.transaction(["chunks", "fileMetadata"], "readwrite");
                const chunkStore = tx.objectStore("chunks");
                const metadataStore = tx.objectStore("fileMetadata");

                const preservedFileIds = new Set<string>();

                const metadataCursorRequest = metadataStore.index('storedInDbIndex').openCursor(IDBKeyRange.only('true'));
                metadataCursorRequest.onsuccess = (event: any) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const value = cursor.value;
                        preservedFileIds.add(value.fileId);
                        cursor.continue();
                    } else {
                        const startCleanup = () => {
                            const ctx = dbInstance!.transaction(["chunks"], "readwrite");
                            const store = ctx.objectStore("chunks");
                            const req = store.openCursor();
                            req.onsuccess = (e: any) => {
                                const cursor = e.target.result;
                                if (cursor) {
                                    const chunk = cursor.value as SavedChunk;
                                    if (!preservedFileIds.has(chunk.fileId)) {
                                        store.delete(cursor.primaryKey);
                                    }
                                    cursor.continue();
                                }
                            };
                            req.onerror = () => {
                                console.error("❌ Error during chunk cleanup");
                                reject(req.error);
                            };
                        }
                        if (dbInstance!.objectStoreNames.contains('fileDownload')) {
                            const dltx = dbInstance!.transaction(["fileDownload"], "readonly");
                            const dlStore = dltx.objectStore("fileDownload");
                            const dlReq = dlStore.openCursor();
                            dlReq.onsuccess = (ev: any) => {
                                const cur = ev.target.result;
                                if (cur) {
                                    const d = cur.value as DownloadMetadata;
                                    const total = d.totalChunks || 0;
                                    const rc = d.chunks_received || 0;
                                    const inProgress = !d.cancelled && (total === 0 || rc < total);
                                    if (inProgress) preservedFileIds.add(d.fileId);
                                    cur.continue();
                                } else {
                                    startCleanup();
                                }
                            }
                            dlReq.onerror = () => startCleanup();
                        } else {
                            startCleanup();
                        }
                    }
                };
                metadataCursorRequest.onerror = () => {
                    console.error("❌ Error reading metadata during cleanup");
                    reject(metadataCursorRequest.error);
                };

                if (device.app) {
                    const deleteFiles: string[] = []
                    const getDeleteFiles: () => Promise<void> = () => {
                        const addFiles: (dir: string) => Promise<void> = (dir: string) => {
                            return window.FileSystemAPI.readDirectory(dir).then((entries) => {
                                const proms = []
                                for (let i = 0; i < entries.length; i++) {
                                    const entry = entries[i]
                                    if (entry.isDirectory) {
                                        proms.push(addFiles(entry.pathname))
                                    } else[
                                        deleteFiles.push(entry.pathname)
                                    ]
                                }
                                return Promise.all(proms).then(() => { })
                            })
                        }
                        return addFiles(window.FileSystemAPI.fileDir)
                    }
                    getDeleteFiles().then(async () => {
                        const handleCursor = (handleData: (metadata: FileMetadata) => Promise<void>, handleUnstored: () => void) => {
                            const handles: Promise<void>[] = []
                            const newTx = dbInstance!.transaction(["fileMetadata"], "readwrite")
                            const metadataStore = newTx.objectStore("fileMetadata");
                            const index = metadataStore.index("storedInDbIndex");
                            const unstoredCursorRequest = index.openCursor(IDBKeyRange.only('false'));
                            unstoredCursorRequest.onsuccess = (e: any) => {
                                const cursor = e.target.result;
                                if (cursor) {
                                    const fileMetadata = cursor.value;
                                    handles.push(handleData(fileMetadata))
                                    cursor.continue();
                                } else {
                                    Promise.allSettled(handles).then(() => {
                                        handleUnstored()
                                    })
                                }
                            };
                            unstoredCursorRequest.onerror = () => {
                                console.error("❌ Error processing unstored files");
                                reject(unstoredCursorRequest.error);
                            };
                        }
                        function deleteFileMetadata(fileId: string): Promise<void> {
                            const tx = dbInstance!.transaction("fileMetadata", "readwrite");
                            const store = tx.objectStore("fileMetadata");
                            const index = metadataStore.index("fileIdIndex");
                            return new Promise((resolve, reject) => {
                                const getRequest = index.getKey(fileId);
                                getRequest.onsuccess = () => {
                                    const key = getRequest.result;
                                    if (key !== undefined) {
                                        store.delete(key);
                                    }
                                };

                                tx.oncomplete = () => resolve();
                                tx.onerror = () => reject(tx.error);
                            });
                        }
                        const toBeRemoved: FileMetadata[] = []
                        const handleRemove = () => {
                            for (let i = 0; i < toBeRemoved.length; i++) {
                                deleteFileMetadata(toBeRemoved[i].fileId).catch(e => {
                                    console.error(e)
                                })
                            }
                        }
                        handleCursor(async (data: FileMetadata) => {
                            const exists = await window.FileSystemAPI.resolveFile(data.pathname).then(({ exists }) => {
                                return exists
                            }).catch(e => {
                                console.error(e)
                                return true // don't delete the metadata incase the filesystem errored and it is actually there.
                            })
                            if (!exists) {
                                toBeRemoved.push(data)
                            } else {
                                const index = deleteFiles.indexOf(data.pathname)
                                if (index !== -1) deleteFiles.splice(index, 1)
                            }
                        }, () => {
                            for (let i = 0; i < deleteFiles.length; i++) {
                                window.FileSystemAPI.deleteFileIfExists(deleteFiles[i]).catch(e => console.error(e))
                            }
                            handleRemove()
                        })
                    }).catch(e => {
                        console.error(e)
                    })
                }
                tx.oncomplete = () => {
                    cleanupDone = true;
                    resolve(dbInstance!);
                };
                tx.onerror = () => {
                    console.error("❌ Error in cleanup transaction");
                    reject(tx.error);
                };
            } else {
                resolve(dbInstance);
            }
        };

        request.onerror = (e) => reject(e);
    });
}


export async function saveChunkToIndexedDB(fileId: string, chunkIndex: number, chunkData: Uint8Array): Promise<void> {
    const db = await openIndexedDB();
    const tx = db.transaction("chunks", "readwrite");
    const store = tx.objectStore("chunks");

    store.put({ chunkId: `${fileId}-chunk-${chunkIndex}`, fileId, chunkIndex, chunkData });

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    });
}

export async function getChunksFromIndexedDB(fileId: string, fileType: string): Promise<Blob> {
    const db = await openIndexedDB();
    const tx = db.transaction("chunks", "readonly");
    const store = tx.objectStore("chunks");
    const index = store.index("fileIdIndex");
    const chunks: { chunkIndex: number, chunkData: Uint8Array }[] = [];

    return new Promise<Blob>((resolve, reject) => {
        const request = index.openCursor(IDBKeyRange.only(fileId));

        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                chunks.push({ chunkIndex: cursor.value.chunkIndex, chunkData: cursor.value.chunkData });
                cursor.continue();
            } else {
                if (chunks.length === 0) {
                    reject(new Error(`No chunks found for fileId ${fileId}`));
                } else {
                    chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
                    resolve(new Blob(chunks.map(c => c.chunkData), { type: fileType }));
                }
            }
        };

        request.onerror = () => reject(new Error("Error retrieving chunks"));
    });
}

export async function createIndexedDBChunkStream(fileId: string): Promise<ReadableStream<Uint8Array>> {
    const db = await openIndexedDB();
    return new ReadableStream({
        async start(controller) {
            try {
                const tx = db.transaction("chunks", "readonly");
                const store = tx.objectStore("chunks");
                const index = store.index("chunkIndexIndex");
                const keyRange = IDBKeyRange.bound([fileId, 0], [fileId, Infinity]);
                const cursorRequest = index.openCursor(keyRange);
                cursorRequest.onsuccess = (event: any) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        controller.enqueue(cursor.value);
                        cursor.continue();
                    } else {
                        controller.close();
                    }
                };
                cursorRequest.onerror = (event: any) => {
                    controller.error("IndexedDB cursor error: " + event.target.error);
                };

            } catch (e) {
                console.error('Error in start:', e);
            }
        }
    });
}

export async function createIndexedDBFileByteStream(fileId: string): Promise<ReadableStream<Uint8Array>> {
    const base = await createIndexedDBChunkStream(fileId);
    if (typeof (globalThis as any).TransformStream === 'undefined') {
        return new ReadableStream<Uint8Array>({
            async start(controller) {
                const reader = (base as ReadableStream<any>).getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value && value.chunkData) controller.enqueue(value.chunkData as Uint8Array);
                }
                controller.close();
            }
        });
    }
    const ts = new TransformStream<any, Uint8Array>({
        transform(chunk, controller) {
            if (chunk && chunk.chunkData) controller.enqueue(chunk.chunkData as Uint8Array);
        }
    });
    return (base as any).pipeThrough(ts as any);
}

export async function deleteFileFromIndexedDB(fileId: string): Promise<void> {
    const db = await openIndexedDB();
    const tx = db.transaction("chunks", "readwrite");
    const store = tx.objectStore("chunks");

    return new Promise((resolve, reject) => {
        if (!store.indexNames.contains("fileIdIndex")) {
            console.error("❌ Missing index: fileIdIndex");
            reject(new Error("fileIdIndex not found in IndexedDB"));
            return;
        }

        const index = store.index("fileIdIndex");
        const request = index.openCursor(IDBKeyRange.only(fileId));

        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                store.delete(cursor.primaryKey);
                cursor.continue();
            } else {
                resolve();
            }
        };

        request.onerror = () => reject(new Error("Error deleting file from IndexedDB"));
    });
}

export async function getDownloadedBytes(fileId: string): Promise<number> {
    const db = await openIndexedDB();
    const tx = db.transaction("chunks", "readonly");
    const store = tx.objectStore("chunks");
    const index = store.index("fileIdIndex");
    return new Promise<number>((resolve, reject) => {
        let total = 0;
        const request = index.openCursor(IDBKeyRange.only(fileId));
        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                const value = cursor.value as SavedChunk & { chunkData: Uint8Array };
                total += (value.chunkData?.byteLength || 0);
                cursor.continue();
            } else {
                resolve(total);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

export async function getFileMetadata(fileId: string): Promise<FileMetadata | null> {
    const db = await openIndexedDB();
    const tx = db.transaction("fileMetadata", "readonly");
    const store = tx.objectStore("fileMetadata");
    const index = store.index("fileIdIndex");

    return new Promise((resolve, reject) => {
        const request = index.get(fileId);
        request.onsuccess = () => resolve(request.result ? { ...request.result, stored_in_db: (request.result.stored_in_db as any) === 'true' } : null);
        request.onerror = () => reject(request.error);
    });
}
export async function saveFileMetadata(
    fileId: string,
    name: string,
    type: string,
    size: number,
    pathname: string,
    downloaded_at: number,
    stored_in_db: boolean,
    extra?: Partial<FileMetadata>
): Promise<void> {
    const db = await openIndexedDB();
    const tx = db.transaction("fileMetadata", "readwrite");
    const store = tx.objectStore("fileMetadata");
    const index = store.index("fileIdIndex");

    return new Promise((resolve, reject) => {
        const request = index.get(fileId);
        request.onsuccess = () => {
            const existing = request.result;
            if (existing) {
                store.put({ ...existing, name, type, size, pathname, downloaded_at, stored_in_db: stored_in_db.toString(), ...(extra || {}) });
            } else {
                store.put({ fileId, name, type, size, pathname, downloaded_at, stored_in_db: stored_in_db.toString(), ...(extra || {}) });
            }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
export async function deleteFileMetadata(fileId: string): Promise<void> {
    const db = await openIndexedDB();
    const tx = db.transaction("fileMetadata", "readwrite");
    const store = tx.objectStore("fileMetadata");
    const index = store.index("fileIdIndex");

    return new Promise((resolve, reject) => {
        const getRequest = index.getKey(fileId);

        getRequest.onsuccess = () => {
            const key = getRequest.result;
            if (key !== undefined) {
                store.delete(key);
            }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function listAllFileMetadata(): Promise<Array<FileMetadata>> {
    const db = await openIndexedDB();
    const tx = db.transaction("fileMetadata", "readonly");
    const store = tx.objectStore("fileMetadata");

    const result: Array<FileMetadata> = [];

    return new Promise((resolve, reject) => {
        const request = store.openCursor();
        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                result.push(cursor.value);
                cursor.continue();
            } else {
                for (let i = 0; i < result.length; i++) {
                    result[i].stored_in_db = (result[i].stored_in_db as any) === 'true'
                    if ((result[i] as any).temp === 'true') (result[i] as any).temp = true
                }
                resolve(result);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

export async function listTempFilesByShareToken(shareToken: string): Promise<FileMetadata[]> {
    const all = await listAllFileMetadata()
    return all.filter(f => (f as any).temp === true && (f as any).shareToken === shareToken)
}

export async function deleteTempFilesByShareToken(shareToken: string): Promise<void> {
    const db = await openIndexedDB();
    const tx = db.transaction(["fileMetadata"], "readonly");
    const store = tx.objectStore("fileMetadata");
    const files: string[] = []
    await new Promise<void>((resolve, reject) => {
        const req = store.openCursor()
        req.onsuccess = (e: any) => {
            const cursor = e.target.result
            if (cursor) {
                const v = cursor.value
                if ((v.temp === true || v.temp === 'true') && v.shareToken === shareToken) {
                    files.push(v.fileId)
                }
                cursor.continue()
            } else resolve()
        }
        req.onerror = () => reject(req.error)
    })
    for (let i = 0; i < files.length; i++) {
        try { await deleteFileFromIndexedDB(files[i]) } catch {}
        try { await deleteFileMetadata(files[i]) } catch {}
    }
}

export async function listShareFilesByToken(shareToken: string): Promise<FileMetadata[]> {
    const all = await listAllFileMetadata()
    return all.filter(f => (f as any).shareToken === shareToken)
}

export async function markFilesForShare(shareToken: string, fileIds: string[]): Promise<void> {
    const db = await openIndexedDB();
    await Promise.all(fileIds.map(fileId => new Promise<void>((resolve, reject) => {
        const tx = db.transaction('fileMetadata', 'readwrite')
        const store = tx.objectStore('fileMetadata')
        const index = store.index('fileIdIndex')
        const req = index.get(fileId)
        req.onsuccess = () => {
            const existing = req.result
            if (existing) {
                store.put({ ...existing, shareToken })
            }
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })))
}

export async function clearAllStorage(): Promise<void> {
    const db = await openIndexedDB();
    const storeNames = ["chunks", "fileMetadata", "fileDownload", "uploadSession"] as const;
    const tx = db.transaction(storeNames as unknown as string[], "readwrite");
    storeNames.forEach((name) => {
        const store = tx.objectStore(name as unknown as string);
        store.clear();
    });
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    })
}

export async function addDownload(fileId: string, deviceId: string, name: string, type: string, size: number, started_at: number, totalChunks = 0) {
    const db = await openIndexedDB();
    const tx = db.transaction("fileDownload", "readwrite");
    const store = tx.objectStore("fileDownload");
    const index = store.index('downloadIdIndex')
    const request = index.get(fileId)
    return new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
            const existing = request.result;
            if (existing) {
                store.put({ ...existing, deviceId, name, type, size, started_at, stored_in_db: totalChunks > 0, totalChunks });
            } else {
                store.put({ fileId, deviceId, name, type, size, started_at, stored_in_db: totalChunks > 0, totalChunks });
            }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    })
}

export async function updateDownload({ fileId, resumed_at, chunks_received}: {
    fileId: string,
    resumed_at?: number,
    chunks_received?: number
}) {
    const db = await openIndexedDB();
    const tx = db.transaction("fileDownload", "readwrite");
    const store = tx.objectStore("fileDownload");
    const index = store.index('downloadIdIndex')
    const request = index.get(fileId)
    return new Promise<void>((resolve, reject) => {
        let errored = false
        request.onsuccess = () => {
            const existing = request.result;
            if (!existing) {
                errored = true
                return
            }
            store.put({
                ...existing,
                resumed_at: resumed_at || existing.resumed_at,
                chunks_received: chunks_received || existing.chunks_received
            });
        };
        tx.oncomplete = () => {
            if (errored) return reject(new Error('File not found'))
            resolve();
        }
        tx.onerror = () => reject(tx.error);
    })
}

export async function listAllDownloadMetadata(): Promise<DownloadMetadata[]> {
    const db = await openIndexedDB();
    const tx = db.transaction("fileDownload", "readonly");
    const store = tx.objectStore("fileDownload");

    const result: Array<DownloadMetadata> = [];

    return new Promise((resolve, reject) => {
        const request = store.openCursor();
        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                result.push(cursor.value);
                cursor.continue();
            } else {
                for (let i = 0; i < result.length; i++) {
                    result[i].stored_in_db = (result[i].stored_in_db as any) === 'true'
                }
                resolve(result);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

export async function listAllDownloadsWithDevice(deviceId: string): Promise<DownloadMetadata[]> {
    const db = await openIndexedDB();
    const tx = db.transaction("fileDownload", "readonly");
    const store = tx.objectStore("fileDownload");
    const index = store.index('deviceIdIndex')
    const result: Array<DownloadMetadata> = [];

    return new Promise((resolve, reject) => {
        const request = index.openCursor(IDBKeyRange.only(deviceId));
        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                result.push(cursor.value);
                cursor.continue();
            } else {
                for (let i = 0; i < result.length; i++) {
                    result[i].stored_in_db = (result[i].stored_in_db as any) === 'true'
                }
                resolve(result);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

export async function deleteDownload(fileId: string): Promise<void> {
    const db = await openIndexedDB();
    const tx = db.transaction("fileDownload", "readwrite");
    const store = tx.objectStore("fileDownload");
    const index = store.index('downloadIdIndex')
    return new Promise<void>((resolve, reject) => {
        const req = index.getKey(fileId)
        req.onsuccess = () => {
            const key = req.result
            if (key !== undefined) store.delete(key)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

export async function addUploadSession(session: Omit<UploadSession, 'id'>) {
    const db = await openIndexedDB();
    const tx = db.transaction('uploadSession', 'readwrite')
    const store = tx.objectStore('uploadSession')
    const index = store.index('sessionIdIndex')
    const req = index.get(session.fileId)
    return new Promise<void>((resolve, reject) => {
        req.onsuccess = () => {
            const existing = req.result
            if (existing) store.put({ ...existing, ...session })
            else store.put(session)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

export async function patchUploadSession(fileId: string, patch: Partial<UploadSession>) {
    const db = await openIndexedDB();
    const tx = db.transaction('uploadSession', 'readwrite')
    const store = tx.objectStore('uploadSession')
    const index = store.index('sessionIdIndex')
    const req = index.get(fileId)
    return new Promise<void>((resolve, reject) => {
        let errored = false
        req.onsuccess = () => {
            const existing = req.result
            if (!existing) {
                errored = true
                return
            }
            store.put({ ...existing, ...patch })
        }
        tx.oncomplete = () => {
            if (errored) return reject(new Error('Session not found'))
            resolve()
        }
        tx.onerror = () => reject(tx.error)
    })
}

export async function getUploadSessionByFileId(fileId: string): Promise<UploadSession | null> {
    const db = await openIndexedDB();
    const tx = db.transaction('uploadSession', 'readonly')
    const store = tx.objectStore('uploadSession')
    const index = store.index('sessionIdIndex')
    return new Promise((resolve, reject) => {
        const req = index.get(fileId)
        req.onsuccess = () => resolve(req.result || null)
        req.onerror = () => reject(req.error)
    })
}

export async function listAllUploadSessions(): Promise<UploadSession[]> {
    const db = await openIndexedDB();
    const tx = db.transaction('uploadSession', 'readonly')
    const store = tx.objectStore('uploadSession')
    const result: UploadSession[] = []
    return new Promise((resolve, reject) => {
        const req = store.openCursor()
        req.onsuccess = (e: any) => {
            const cursor = e.target.result
            if (cursor) {
                result.push(cursor.value)
                cursor.continue()
            } else {
                resolve(result)
            }
        }
        req.onerror = () => reject(req.error)
    })
}

export async function getUploadSession(fileId: string): Promise<UploadSession | null> {
    const db = await openIndexedDB();
    const tx = db.transaction('uploadSession', 'readonly')
    const store = tx.objectStore('uploadSession')
    const index = store.index('sessionIdIndex')
    return new Promise((resolve, reject) => {
        const req = index.get(fileId)
        req.onsuccess = () => resolve(req.result || null)
        req.onerror = () => reject(req.error)
    })
}

export async function deleteUploadSession(fileId: string): Promise<void> {
    const db = await openIndexedDB();
    const tx = db.transaction('uploadSession', 'readwrite')
    const store = tx.objectStore('uploadSession')
    const index = store.index('sessionIdIndex')
    return new Promise<void>((resolve, reject) => {
        const req = index.getKey(fileId)
        req.onsuccess = () => {
            const key = req.result
            if (key !== undefined) store.delete(key)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

export async function patchDownload(fileId: string, patch: Partial<DownloadMetadata>): Promise<void> {
    const db = await openIndexedDB();
    const tx = db.transaction('fileDownload', 'readwrite');
    const store = tx.objectStore('fileDownload');
    const index = store.index('downloadIdIndex');
    const request = index.get(fileId);
    return new Promise<void>((resolve, reject) => {
        let errored = false
        request.onsuccess = () => {
            const existing = request.result;
            if (!existing) {
                errored = true
                return
            }
            store.put({ ...existing, ...patch });
        };
        tx.oncomplete = () => {
            if (errored) return reject(new Error('File not found'))
            resolve();
        }
        tx.onerror = () => reject(tx.error);
    })
}

export async function clearCompletedDownloads(): Promise<number> {
    const db = await openIndexedDB();
    const tx = db.transaction('fileDownload', 'readwrite');
    const store = tx.objectStore('fileDownload');
    let removed = 0
    return new Promise<number>((resolve, reject) => {
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                const v = cursor.value as DownloadMetadata
                const isComplete = typeof v.totalChunks === 'number' && typeof v.chunks_received === 'number' && v.totalChunks > 0 && v.chunks_received >= v.totalChunks
                if (isComplete || v.cancelled) {
                    store.delete(cursor.primaryKey)
                    removed++
                }
                cursor.continue();
            } else {
                resolve(removed)
            }
        }
        cursorRequest.onerror = () => reject(cursorRequest.error)
    })
}
