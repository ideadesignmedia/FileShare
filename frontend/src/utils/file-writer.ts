

export const createChunkedFileWriter = async (filename: string): Promise<{
    writeChunk: (chunk: Uint8Array) => Promise<void>,
    close: () => Promise<void>,
    filePath: string
}> => {
    return new Promise((resolve, reject) => {
        if (!('cordova' in window)) return reject("Must Be Running In Cordova Environment.")
        window.resolveLocalDirectory(window.FileSystemAPI.fileDir).then((dirEntry) => {
            if (!dirEntry) throw new Error('Directory not found.')
            dirEntry.getFile(filename, { create: true, exclusive: false }, (fileEntry) => {
                fileEntry.createWriter((writer) => {
                    let queue: Uint8Array[] = [];
                    let writing = false;
                    let done = false;
                    const processQueue = () => {
                        if (writing || queue.length === 0) return;
                        writing = true;
                        const blob = new Blob([queue.shift()!]);
                        writer.onwriteend = () => {
                            writing = false;
                            processQueue();
                        };
                        writer.onerror = reject;
                        writer.write(blob);
                    };
                    resolve({
                        filePath: fileEntry.nativeURL,
                        writeChunk(chunk: Uint8Array) {
                            return new Promise((res) => {
                                queue.push(chunk);
                                processQueue();
                                // naive delay to ensure write completes before resolve
                                setTimeout(res, 0);
                            });
                        },
                        close() {
                            done = true;
                            return Promise.resolve();
                        }
                    });
                }, reject);
            }, reject);
        }).catch(reject)
    });
}

export const createElectronFileWriter = async (filename: string) => {

}