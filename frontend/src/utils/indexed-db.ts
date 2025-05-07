let dbInstance: IDBDatabase | null = null;
let cleanupDone = false;


export type FileMetadata = {
    fileId: string;
    name: string,
    type: string,
    size: number,
    pathname: string;
    downloaded_at: number,
    stored_in_db: boolean
}
export async function openIndexedDB(): Promise<IDBDatabase> {
    if (dbInstance) return dbInstance;

    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("fileTransferDB", 2); // ⬅️ bumped to version 2

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
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            dbInstance.onclose = () => dbInstance = null;

            if (!cleanupDone) {
                const tx = dbInstance.transaction(["chunks", "fileMetadata"], "readwrite");
                const chunkStore = tx.objectStore("chunks");
                const metadataStore = tx.objectStore("fileMetadata");

                const preservedFileIds = new Set<string>();

                const metadataCursorRequest = metadataStore.index('storedInDbIndex').openCursor(IDBKeyRange.only(true));
                metadataCursorRequest.onsuccess = (event: any) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const value = cursor.value;
                        preservedFileIds.add(value.fileId);
                        cursor.continue();
                    } else {
                        // Done collecting preserved fileIds
                        const chunkCursorRequest = chunkStore.openCursor();
                        chunkCursorRequest.onsuccess = (e: any) => {
                            const cursor = e.target.result;
                            if (cursor) {
                                const chunk = cursor.value;
                                if (!preservedFileIds.has(chunk.fileId)) {
                                    chunkStore.delete(cursor.primaryKey);
                                }
                                cursor.continue();
                            }
                        };
                        chunkCursorRequest.onerror = () => {
                            console.error("❌ Error during chunk cleanup");
                            reject(chunkCursorRequest.error);
                        };
                    }
                };
                metadataCursorRequest.onerror = () => {
                    console.error("❌ Error reading metadata during cleanup");
                    reject(metadataCursorRequest.error);
                };

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

export async function getFileMetadata(fileId: string): Promise<FileMetadata | null> {
    const db = await openIndexedDB();
    const tx = db.transaction("fileMetadata", "readonly");
    const store = tx.objectStore("fileMetadata");
    const index = store.index("fileIdIndex");

    return new Promise((resolve, reject) => {
        const request = index.get(fileId);
        request.onsuccess = () => resolve(request.result ?? null);
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
    stored_in_db: boolean
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
                store.put({ ...existing, pathname, downloaded_at, stored_in_db });
            } else {
                store.put({ fileId, pathname, downloaded_at, stored_in_db });
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

export async function listAllFileMetadata(): Promise<Array<{ fileId: string; pathname: string; downloaded_at: string }>> {
    const db = await openIndexedDB();
    const tx = db.transaction("fileMetadata", "readonly");
    const store = tx.objectStore("fileMetadata");

    const result: Array<{ fileId: string; pathname: string; downloaded_at: string }> = [];

    return new Promise((resolve, reject) => {
        const request = store.openCursor();
        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                result.push(cursor.value);
                cursor.continue();
            } else {
                resolve(result);
            }
        };
        request.onerror = () => reject(request.error);
    });
}