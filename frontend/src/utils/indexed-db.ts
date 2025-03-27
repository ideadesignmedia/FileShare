export async function openIndexedDB(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("fileTransferDB", 1);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("chunks")) {
                const store = db.createObjectStore("chunks", { keyPath: "chunkId" });
                store.createIndex("fileIdIndex", "fileId", { unique: false });
                store.createIndex("chunkIndexIndex", ["fileId", "chunkIndex"], { unique: true });
            }
        };

        request.onsuccess = () => resolve(request.result);
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
            try{
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

            } catch(e) {
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