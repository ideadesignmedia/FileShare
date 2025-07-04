// preload.js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('env', {
    API_HOST: process.env.API_HOST,
    os: process.env.PLATFORM
})

contextBridge.exposeInMainWorld('updateBridge', {
    server: process.env.SERVER_URL,
    applicationDir: process.env.APPLICATION_DIR,
    userData: process.env.USER_DIR,
    workingDir: process.env.WORKING_DIR,
    tempDir: process.env.TEMP_DIR,
    backupDir: process.env.BACKUP_DIR,
    fileDir: process.env.FILE_DIR,
    setUpdating: (value) => ipcRenderer.invoke('set-updating', value),
    isUpdating: () => ipcRenderer.invoke('is-updating')
});

contextBridge.exposeInMainWorld('fileSystemAPI', {
    resolveLocalFileSystemURL: (path) => ipcRenderer.invoke('fs:resolve', path),
    saveFile: (path, data) => ipcRenderer.invoke('fs:save-file', path, data),
    readDirectory: (path) => ipcRenderer.invoke('fs:readdir', path),
    createDirectory: (path) => ipcRenderer.invoke('fs:createDirectory', path),
    deleteDirectory: (path) => ipcRenderer.invoke('fs:deleteDirectory', path),
    copyDirectory: (src, dest) => ipcRenderer.invoke('fs:copyDirectory', src, dest),
    copyFile: (src, dest) => ipcRenderer.invoke('fs:copyFile', src, dest),
    deleteFileIfExists: (path) => ipcRenderer.invoke('fs:deleteFile', path),
    ensureDirectoryExists: (path) => ipcRenderer.invoke('fs:ensureDir', path),
    createDirectories: (path) => ipcRenderer.invoke('fs:createDirs', path),
    downloadFile: (url, dest) => ipcRenderer.invoke('fs:downloadFile', url, dest),
    replaceFile: (src, dest) => ipcRenderer.invoke('fs:replaceFile', src, dest),
    moveFile: (srcPath) => ipcRenderer.invoke('move-file', srcPath),
    fileWriter: {
        openFiles: () => ipcRenderer.invoke('fileWriter:openFiles'),
        start: (filePath) => ipcRenderer.invoke('fileWriter:start', filePath),
        write: (filePath, chunk) => ipcRenderer.invoke('fileWriter:write', filePath, chunk),
        close: (filePath) => ipcRenderer.invoke('fileWriter:close', filePath),
        cancel: (filePath) => ipcRenderer.invoke('fileWriter:cancel', filePath)
    }
});