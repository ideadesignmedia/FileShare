import device from "../constants/device-browser"
import { emit } from "../context/AppContext";
import { deleteFileFromIndexedDB, deleteFileMetadata, getChunksFromIndexedDB, getFileMetadata } from "./indexed-db"
import { toast } from "./toast";
import { extension } from 'mime-types'

export const deleteFile = (fileId: string): Promise<boolean> => {
    return getFileMetadata(fileId).then(file => {
        if (!file) return Promise.resolve(true)
        if (file.stored_in_db) {
            return Promise.all([
                deleteFileMetadata(file.fileId),
                deleteFileFromIndexedDB(file.fileId)
            ]).then(() => {
                emit('file-deleted', file.fileId)
                return true
            }).catch(e => {
                console.error(e)
                return false
            })
        } else if (device.app) {
            return Promise.all([
                deleteFileMetadata(fileId),
                window.FileSystemAPI.deleteFileIfExists(file.pathname)
            ]).then(() => {
                emit('file-deleted', fileId)
                return true
            }).catch(e => {
                console.error(e)
                return false
            })
        } else {
            return deleteFileMetadata(file.fileId).then(() => {
                emit('file-deleted', fileId)
                return true
            }).catch(() => {
                return false
            })
        }
    })
}
export const downloadBlob = async (blob: Blob, name: string) => {
    if ('showSaveFilePicker' in window) {
        try {
            const ext = extension(blob.type); // e.g., "json"
            const extWithDot = ext ? '.' + ext : '';

            const handle = await (window.showSaveFilePicker as any)({
                suggestedName: name.endsWith(extWithDot) ? name : name + extWithDot,
                types: ext
                    ? [
                        {
                            description: `${blob.type} File`,
                            accept: { [blob.type]: [`.${ext}`] }
                        }
                    ]
                    : []
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return;
        } catch (err) {
            console.warn('File Picker canceled or failed, falling back to download.', err);
            // Fall through to fallback below
        }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url)
}
export const downloadFile = (fileId: string): Promise<void> => {
    return getFileMetadata(fileId).then(file => {
        if (!file) {
            return Promise.reject("NO FILE FOUND FOR " + fileId)
        }
        if (file.stored_in_db) {
            return getChunksFromIndexedDB(fileId, file.type).then((blob) => {
                try {
                    downloadBlob(blob, file.name)
                } catch (e) {
                    console.error(e)
                } finally {
                    return Promise.allSettled([
                        deleteFileFromIndexedDB(fileId),
                        deleteFileMetadata(fileId)
                    ]).then(() => {
                        emit('file-downloaded', file)
                    })
                }
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
                    window.resolveLocalFile(file.pathname).then(fileEntry => {
                        if (!fileEntry) {
                            return Promise.allSettled([
                                deleteFileMetadata(fileId),
                                window.FileSystemAPI.deleteFileIfExists(file.pathname)
                            ]).then(() => {
                                emit('file-deleted', fileId)
                                return reject('FILE NOT FOUND')
                            })
                        }
                        cordova.plugins.streamSave.exportFile({
                            sourcePath: file.pathname,
                            suggestedName: file.name,
                            mimeType: file.type
                          }).then(() => {
                            return Promise.allSettled([
                                deleteFileMetadata(fileId),
                                window.FileSystemAPI.deleteFileIfExists(file.pathname)
                            ]).then(() => {
                                emit('file-downloaded', fileId)
                                resolve()
                            })
                          }).catch(e => {
                            if (/ENOENT/.test(e)) {
                                return Promise.allSettled([
                                    deleteFileMetadata(fileId),
                                    window.FileSystemAPI.deleteFileIfExists(file.pathname)
                                ]).then(() => {
                                    emit('file-deleted', fileId)
                                    return reject('FILE NOT FOUND')
                                })
                            }
                            return reject(e)
                          });
                    }).catch(reject)
                })
            } else {
                return (window as any).fileSystemAPI.moveFile(file.pathname).then(() => {
                    return Promise.allSettled([
                        deleteFileMetadata(fileId),
                        window.FileSystemAPI.deleteFileIfExists(file.pathname)
                    ]).then(() => {
                        toast('Deleted FILE')
                        emit('file-downloaded', fileId)
                    })
                })
            }
        }
    })
}