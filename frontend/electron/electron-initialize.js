const API_HOST = `${window.env.API_HOST}`
const manifestUri = `${API_HOST}/app-file-manifest.json`;
const applicationDir = window.updateBridge.applicationDir
const tempDir = window.updateBridge.tempDir
const backupDir = window.updateBridge.backupDir
const workingDir = window.updateBridge.workingDir
const server = () => window.updateBridge?.server || ''
class FileSystem {
    static fileExt = /file:/
    static seperator = window.env.os === 'win32' ? '\\' : '/'

    static resolvePath(path, useTempDir) {
        const root = useTempDir ? tempDir : workingDir;
        if (path.startsWith(root)) return path
        return path.startsWith('/') || path.startsWith('\\')
            ? root + this.seperator + path.slice(1)
            : root + this.seperator + path;
    }

    static resolveLocalFileSystemURL(path, existsCallback, notExistsCallback) {
        window.fileSystemAPI.resolveLocalFileSystemURL(path).then((result) => {
            if (result.exists) {
                existsCallback()
            } else {
                notExistsCallback()
            }
        }).catch(e => {
            console.error(e)
            notExistsCallback()
        })
    }
    // create directory if not exists.
    static createDirectory(path) {
        return window.fileSystemAPI.createDirectory(path)
    }
    // if directory exists delete
    static deleteDirectory(path) {
        return window.fileSystemAPI.deleteDirectory(path)
    }

    // copy files from one directory to another
    static copyDirectory(srcDir, destDir, useTempDir = false) {
        const dest = FileSystem.resolvePath(destDir, useTempDir)
        return window.fileSystemAPI.copyDirectory(srcDir, dest)
    }

    //copy a file from one place to another
    static copyFile(srcPath, destPath) {
        return window.fileSystemAPI.copyFile(srcPath, destPath)
    }

    // delete a file if it exists
    static deleteFileIfExists(filePath) {
        return window.fileSystemAPI.deleteFileIfExists(filePath)
    }

    // check if directory exists if not create directory.
    static ensureDirectoryExists(filePath, useTempDir = true) {
        return window.fileSystemAPI.ensureDirectoryExists(FileSystem.resolvePath(filePath, useTempDir))
    }

    // Function to create all necessary directories if they do not exist.
    static createDirectories(path, useTempDir = true) {
        return window.fileSystemAPI.createDirectories(FileSystem.resolvePath(path, useTempDir))
    }

    // download file from uri to destination
    static downloadFile(uri, destPath) {
        return window.fileSystemAPI.downloadFile(uri, destPath)
    }

    // replace file at targetPath with the file from sourcePath.
    static replaceFile(sourcePath, targetPath) {
        return window.fileSystemAPI.replaceFile(sourcePath, targetPath)
    }
}
window.FileSystem = FileSystem
document.addEventListener('DOMContentLoaded', () => {
    const element = document.createElement('welcome-screen')
    console.log('Creating welcome screen', element)
    document.body.append(element)
    class Updater extends EventTarget {
        isUpdating = false
        details = null
        state = 'Complete'
        progress = 0
        noInitialUpdates = false
        constructor() {
            super()
            window.addEventListener('no-updates', () => {
                this.noInitialUpdates = true
            }, { once: true })
        }
        updateStarted = (details) => {
            this.isUpdating = true
            this.details = details
            this.state = 'Started'
            this.progress = 0
            this.dispatchEvent(new CustomEvent('update-started', { detail: details }))
        }
        stateChange = (e) => {
            this.state = e
            this.dispatchEvent(new CustomEvent('state-change', { detail: e }))
        }
        progressChange = (e) => {
            this.progress = e
            this.dispatchEvent(new CustomEvent('progress', { detail: e }))
        }
        updateFailed = (e) => {
            this.isUpdating = false
            this.state = 'Failed'
            this.dispatchEvent(new CustomEvent('update-failed', { detail: e }))
        }
        updateCompleted = () => {
            this.isUpdating = false
            this.state = 'Complete'
            this.progress = 100
            this.dispatchEvent(new CustomEvent('update-completed'))
        }
    }
    window.updates = new Updater()
    async function fetchManifest() {
        try {
            const response = await fetch(manifestUri);
            if (!response.ok) throw new Error(`Failed to fetch manifest: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching manifest:', error);
            return null;
        }
    }
    async function downloadFiles(manifest) {
        for (const file of manifest.files) {
            try {
                const destPath = FileSystem.resolvePath(file.path, true);
                await FileSystem.ensureDirectoryExists(destPath, true);
                await FileSystem.downloadFile(file.uri, destPath);
                file.location = destPath
                window.updates.progressChange(Math.round(((manifest.files.indexOf(file) / manifest.files.length) * 100) / 2 + 20))
            } catch (error) {
                console.error(`Failed to process file ${file.uri}:`, error);
                throw error;
            }
        }
    }

    async function replaceFiles(manifest) {
        let backedup = false;
        try {
            await FileSystem.ensureDirectoryExists(backupDir).catch(e => {
                console.error('Error creating backup directory:', e);
                throw new Error('Error creating backup directory');
            })
            // Step 1: Backup current files
            await FileSystem.copyDirectory(workingDir, backupDir, true).then(() => {
                backedup = true;
            }).catch(e => {
                backedup = false
                console.error('Error backing up files:', workingDir, backupDir, e);
                throw e
            })
            await FileSystem.ensureDirectoryExists(workingDir).catch(e => {
                console.error('Error creating new working directory:', e);
                throw e; // Abort and trigger rollback
            })

            // Step 2: Replace working directory with temp files
            manifest.files.sort((a, b) => (a.path === 'index.js' || a.path === 'index.css') ? 1 : (b.path === 'index.js' || b.path === 'index.css') ? -1 : 0)
            for (const file of manifest.files) {
                const srcPath = file.location || FileSystem.resolvePath(file.path, true);
                const destPath = FileSystem.resolvePath(file.path, false);
                try {
                    await FileSystem.ensureDirectoryExists(destPath, false);
                    await FileSystem.replaceFile(srcPath, destPath);
                    window.updates.progressChange(Math.round(((manifest.files.indexOf(file) / manifest.files.length)) * 29 + 71))
                } catch (error) {
                    console.error(`Error replacing file: ${file.path}`, JSON.stringify(error));
                    throw error; // Abort and trigger rollback
                }
            }
            // Step 3: Cleanup temp directory
            await FileSystem.deleteDirectory(tempDir).catch(e => {
                console.error('Error deleting temp directory:', e);
                throw e; // Abort and trigger rollback
            })
            await FileSystem.deleteDirectory(backupDir).then(() => {
                backedup = false
            }).catch(e => {
                console.error('Error deleting backup directory:', e);
                throw e; // Abort and trigger rollback
            })
        } catch (error) {
            console.error('Error during file replacement, rolling back:', error);
            // Rollback: Restore from backup
            if (backedup) {
                await FileSystem.deleteDirectory(workingDir).catch(e => {
                    console.error('Error deleting new working directory:', e);
                })
            }
            await FileSystem.deleteDirectory(tempDir).catch(e => {
                console.error('Error deleting temp directory:', e);
            })
            if (backedup) {
                await FileSystem.copyDirectory(backupDir, workingDir, false).catch(e => {
                    console.error('Error restoring backup files:', e);
                    return FileSystem.deleteDirectory(workingDir).then(() => {
                        return copyDirectory(applicationDir, workingDir, false)
                    }).catch(() => { });
                }).finally(() => FileSystem.deleteDirectory(backupDir).catch(() => { }))
            }
            throw new Error('File replacement failed and rolled back.');
        }
    }

    const checkDirectoriesExist = () => {
        return Promise.allSettled([
            FileSystem.ensureDirectoryExists(workingDir),
            FileSystem.deleteDirectory(tempDir)
        ])
    }

    async function checkForUpdates() {
        const rootExists = await checkDirectoriesExist().then(results => results.every(result => result.status === 'fulfilled')).catch(e => {
            console.error('Error checking directories:', e);
            return false;
        })
        if (!rootExists) {
            return Promise.reject('Root directories do not exist: ' + workingDir);
        }
        const manifest = await fetchManifest();
        if (!manifest) return Promise.reject('Failed to fetch manifest.');
        const version = parseInt(manifest.version);
        const current = parseInt(localStorage.getItem('version') || window.defaultVersion);
        console.log("VERSION", version, 'CUR', current)
        if (version === current || await window.updateBridge.isUpdating()) {
            window.dispatchEvent(new Event('no-updates'))
            window.updates.updateCompleted()
            return Promise.resolve();
        }
        await window.updateBridge.setUpdating(true)
        try {
            window.updates.updateStarted(manifest)
            await FileSystem.ensureDirectoryExists(tempDir).catch(e => {
                console.error('Error creating temp directory:', e);
                throw new Error('Error creating temp directory.');
            })
            window.updates.progressChange(20)
            window.updates.stateChange('Downloading files...')
            await downloadFiles(manifest).catch(async e => {
                console.error('Error downloading files:', e);
                await FileSystem.deleteDirectory(tempDir).catch(e => {
                    console.error('Error deleting temp directory:', e);
                })
                throw new Error('Error downloading files.');
            })
            window.updates.stateChange('Replacing files...')
            window.updates.progressChange(71)
            await replaceFiles(manifest).catch(async e => {
                console.error('Error replacing files:', e);
                throw new Error('Error replacing files.');
            })
            localStorage.setItem('version', version.toString());
            await window.updateBridge.setUpdating(false)
            window.updates.updateCompleted()
        } catch (e) {
            await window.updateBridge.setUpdating(false)
            throw e
        }
    }
    const load = async () => {
        const reload = async () => {
            localStorage.removeItem('version')
            await FileSystem.deleteDirectory(backupDir).catch(e => {
                console.error('Error deleting backup dir:', e)
            })
            await FileSystem.deleteDirectory(workingDir).catch(e => {
                console.error('Error deleting working dir:', e)
            })
            document.head.querySelector('base')?.remove()
            window.location.reload()
        }
        const loadBundle = () => {
            if (document.head.querySelector('base')) {
                document.head.querySelector('base').href = server();
            } else {
                const base = document.createElement('base');
                base.href = server();
                document.head.prepend(base);
            }
            return fetch('/index.css').then(async res => {
                if (res.ok) {
                    const text = await res.text()
                    if (!text.length) {
                        console.error('Invalid index.css')
                        return reload()
                    }
                    const link = document.createElement('link');
                    link.crossOrigin = true
                    link.href = '/index.css';
                    link.rel = 'stylesheet';
                    document.head.appendChild(link);
                    return fetch('/index.js').then(async res => {
                        if (!res.ok) throw new Error('Failed to fetch index.js')
                        const text = await res.text()
                        if (!text.length) {
                            console.error('Invalid index.js')
                            return reload()
                        }
                        const script = document.createElement('script');
                        script.type = 'module'
                        script.crossOrigin = true
                        script.src = '/index.js';
                        document.head.appendChild(script);
                    }).catch(e => {
                        console.error('Error fetching index.js:', e)
                        reload()
                    })
                } else {
                    console.error('Failed to fetch index.css:', res.statusText)
                    reload()
                }
            }).catch(e => {
                console.error('Error fetching index.css:', e)
                reload()
            })
        }
        if (window.updates.noInitialUpdates) {
            return loadBundle()
        }
        window.addEventListener('updates-complete', () => {
            loadBundle()
        }, { once: true })
        return manageUpdates()
    }
    const initialize = () => {
        return new Promise((resolve, reject) => {
            const create = () => {
                FileSystem.resolveLocalFileSystemURL(workingDir, () => {
                    resolve()
                }, () => {
                    FileSystem.createDirectory(workingDir).then(() => {
                        return FileSystem.copyDirectory(applicationDir, workingDir, false).then(() => {
                            localStorage.setItem('version', window.firstVersion || window.defaultVersion)
                            return resolve()
                        }).catch(reject)
                    }).catch(reject);
                });
            }
            const onFailedRestore = (e) => {
                localStorage.removeItem('version')
                console.error('Error restoring backup:', e)
                return Promise.all([FileSystem.deleteDirectory(workingDir), FileSystem.deleteDirectory(backupDir)]).then(() => {
                    localStorage.setItem('version', window.firstVersion || window.defaultVersion)
                    create()
                }).catch(reject)
            }
            FileSystem.resolveLocalFileSystemURL(backupDir, () => {
                FileSystem.deleteDirectory(workingDir).then(() => {
                    return FileSystem.deleteDirectory(tempDir)
                }).then(() => {
                    return FileSystem.copyDirectory(backupDir, workingDir, false).then(() => {
                        return FileSystem.deleteDirectory(backupDir)
                    }).then(() => {
                        return create()
                    })
                }).catch(onFailedRestore)
            }, () => create())
        })
    }
    const manageUpdates = () => checkForUpdates().catch(e => {
        console.error('ERROR CHECKING FOR UPDATES', e)
        window.updates.updateFailed(e)
    }).finally(() => setTimeout(() => manageUpdates(), 60000 * 5))
    initialize().then(() => {
        if (!document.querySelector('welcome-screen')) document.body.append(document.createElement('welcome-screen'))
    }).catch(e => {
        console.error('Error initializing:', e);
    }).finally(() => {
        load()
    })
}, false)