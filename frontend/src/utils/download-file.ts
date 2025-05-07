import device from "../constants/device-browser"
import { emit } from "../context/AppContext";
import { createIndexedDBChunkStream, deleteFileFromIndexedDB, deleteFileMetadata, getFileMetadata } from "./indexed-db"


export const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
export const downloadFile = (fileId: string): Promise<void> => {
    return getFileMetadata(fileId).then(file => {
        if (!file) {
            return Promise.reject("NO FILE FOUND FOR " + fileId)
        }
        if (file.stored_in_db) {
            return createIndexedDBChunkStream(fileId).then((stream) => {
                return new Promise<void>((resolve, reject) => {
                    try {
                        const reader = stream.getReader()
                        const chunks: Uint8Array[] = [];
                        const read = () => {
                            reader.read().then(({ done, value }) => {
                                if (done) {
                                    const blob = new Blob(chunks, { type: file.type });
                                    try {
                                        downloadBlob(blob, file.name)
                                    } catch(e) {
                                        console.error(e)
                                    } finally {
                                        return Promise.allSettled([
                                            deleteFileFromIndexedDB(fileId),
                                            deleteFileMetadata(fileId)
                                        ]).then(() => {
                                            emit('file-downloaded', file)
                                            resolve()
                                        })
                                    }
                                }
                                chunks.push(value)
                                read();
                            });
                        }
                        read()
                    } catch (e) {
                        reject(e)
                    }
                })
            })
        } else if (!device.app) {
            return Promise.allSettled([
                deleteFileMetadata(fileId),
                deleteFileFromIndexedDB(fileId)
            ]).then(() => {
                emit('file-deleted', fileId)
                return Promise.reject("No download methods available deleted file.")
            })
        } else {
            if ('cordova' in window) {
                return new Promise((resolve, reject) => {
                    window.resolveLocalFileSystemURL(file.pathname, (fileEntry) => {
                        const url = fileEntry.toURL()
                        fetch(url).then((response) => {
                            if (response.status !== 200) {
                                reject(new Error('File not found.'))
                                return
                            }
                            return response.blob().then((blob) => {
                                (window.cordova.plugins as any).saveDialog.saveFile(blob, file.name).then((uri: string) => {
                                    return Promise.allSettled([
                                        deleteFileMetadata(fileId),
                                        window.FileSystemAPI.deleteFileIfExists(file.pathname)
                                    ]).then(() => {
                                        emit('file-downloaded', fileId)
                                        resolve()
                                    })
                                }).catch(reject)
                            }).catch(reject)
                        }).catch(reject)
                    }, reject);
                })
            } else {
                return (window as any).fileSystemAPI.moveFile(file.pathname).then(() => {
                    return Promise.allSettled([
                        deleteFileMetadata(fileId),
                        window.FileSystemAPI.deleteFileIfExists(file.pathname)
                    ]).then(() => {
                        emit('file-downloaded', fileId)
                    })
                })
            }
        }
    })
}