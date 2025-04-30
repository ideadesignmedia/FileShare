const API_HOST = ''
const requiredPermissions = [
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "android.permission.READ_EXTERNAL_STORAGE"
];
function requestPermissions(permissions = requiredPermissions) {
    return new Promise((resolve, reject) => {
        window.plugins.permissions.requestPermission(permissions,
            () => {
                resolve();
            },
            (err) => {
                reject(err);
            }
        );
    });
}
let localIp = ''
let port = 8002
let hostname = `localhost`
let serverRunning = false
const server = () => serverRunning ? `http://${hostname}:${port}` : `https://localhost`

function checkIpAddress() {
    return new Promise((resolve, reject) => {
        networkinterface.getIPAddress(function ({ ip: ipAddress }) {
            if (ipAddress !== localIp) {
                localIp = ipAddress;
                // Perform actions based on the IP address change
            }
            console.log("IP Address: " + JSON.stringify(ipAddress, null, 2));
            resolve(localIp)
        }, function () {
            reject(new Error("Error getting IP Address"))
        });
    })
}

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
document.addEventListener('deviceready', () => {
    window.cordova.plugins.screenorientation.lock('portrait');
    const baseDir = cordova.file.tempDirectory || cordova.file.dataDirectory;
    const tempDir = `${baseDir}temp/`;
    const backupDir = `${baseDir}backup/`;
    const workingDir = `${cordova.file.dataDirectory}www/`;
    const manifestUri = `${API_HOST}/app-file-manifest.json`;


    function createDirectory(path) {
        return new Promise((resolve, reject) => {

            // Resolve the directory URL
            window.resolveLocalFileSystemURL(
                path,
                () => {
                    resolve();
                },
                (resolveErr) => {

                    // Remove trailing slash if present
                    const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;

                    // Extract parent directory and directory name
                    const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
                    const dirName = normalizedPath.substring(normalizedPath.lastIndexOf('/') + 1);

                    if (!dirName) {
                        console.error('Invalid directory name extracted from path:', normalizedPath);
                        reject(new Error(`Invalid directory name for path: ${path}`));
                        return;
                    }


                    window.resolveLocalFileSystemURL(
                        parentPath,
                        (parentEntry) => {

                            parentEntry.getDirectory(
                                dirName,
                                { create: true },
                                (dirEntry) => {
                                    resolve();
                                },
                                (createErr) => {
                                    console.error(`Failed to create directory: ${path}`, createErr);
                                    reject(createErr);
                                }
                            );
                        },
                        (parentResolveErr) => {
                            console.error(`Failed to resolve parent path: ${parentPath}`, parentResolveErr);
                            reject(parentResolveErr);
                        }
                    );
                }
            );
        });
    }

    function deleteDirectory(path) {
        return new Promise((resolve, reject) => {
            window.resolveLocalFileSystemURL(
                path,
                (entry) => {
                    entry.removeRecursively(
                        () => {
                            resolve();
                        },
                        (err) => {
                            console.error(`Error deleting directory ${path}:`, err);
                            reject(err);
                        }
                    );
                },
                () => {
                    resolve(); // No need to delete non-existing directory
                }
            );
        });
    }

    async function copyDirectory(srcDir, destDir, destTemp = false) {
        return new Promise((resolve, reject) => {
            window.resolveLocalFileSystemURL(srcDir, (srcEntry) => {
                if (!srcEntry) {
                    console.error(`Source directory does not exist: ${srcDir}`);
                    reject(new Error(`Source directory does not exist: ${srcDir}`));
                    return;
                }
                const copy = (destEntry) => {
                    const dirReader = srcEntry.createReader();
                    dirReader.readEntries(
                        async (entries) => {
                            try {
                                for (const entry of entries) {
                                    if (entry.name === 'plugins' && entry.isDirectory) continue
                                    if (entry.isDirectory) {
                                        // Recursively copy subdirectories
                                        await createDirectory(destEntry.nativeURL + entry.name + "/");
                                        await copyDirectory(entry.nativeURL, destEntry.nativeURL + entry.name + "/", destTemp);
                                    } else if (entry.isFile) {
                                        // Copy files
                                        await copyFile(entry.nativeURL, destEntry.nativeURL + entry.name)
                                    }
                                }
                                resolve(undefined);
                            } catch (e) {
                                console.error('Error reading entries:', e)
                                reject(e)
                            }
                        },
                        e => {
                            console.error(`Error reading source directory: ${srcDir}`, e);
                            reject(e);
                        }
                    );
                }
                window.resolveLocalFileSystemURL(destDir, (destEntry) => {
                    copy(destEntry)
                }, e => {
                    createDirectories(destDir, destTemp).then(() => {
                        window.resolveLocalFileSystemURL(destDir, (destEntry) => {
                            copy(destEntry)
                        }, e => {
                            console.error(`Error resolving destination directory: ${destDir}`, e);
                            reject(e);
                        })
                    }).catch(e => {
                        console.error(`Error creating destination directory: ${destDir}`, e);
                        reject(e);
                    })
                });
            }, e => {
                console.error(`Error resolving source directory: ${srcDir}`, e);
                reject(e);
            });
        });
    }

    async function copyFile(srcPath, destPath) {
        return new Promise((resolve, reject) => {
            window.resolveLocalFileSystemURL(srcPath, (fileEntry) => {
                if (!fileEntry) {
                    console.error(`Source file does not exist: ${srcPath}`);
                    reject(new Error(`Source file does not exist: ${srcPath}`));
                    return;
                }
                window.resolveLocalFileSystemURL(
                    destPath.substring(0, destPath.lastIndexOf("/")),
                    (destDirEntry) => {
                        if (!destDirEntry) {
                            console.error(`Destination directory does not exist: ${destPath}`);
                            reject(new Error(`Destination directory does not exist: ${destPath}`));
                            return;
                        }
                        deleteFileIfExists(destPath).then(() => {
                            fileEntry.copyTo(
                                destDirEntry,
                                destPath.substring(destPath.lastIndexOf("/") + 1),
                                () => {
                                    resolve(undefined);
                                },
                                e => {
                                    console.error(`Error copying file: ${srcPath} to ${destPath}`, e);
                                    reject(e);
                                }
                            );
                        }).catch(e => {
                            console.error(`Error deleting existing file: ${destPath}`, e);
                            reject(e);
                        })
                    },
                    e => {
                        console.error(`Error resolving destination directory: ${destPath}`, e);
                        reject(e);
                    }
                );
            }, e => {
                console.error(`Error resolving source file: ${srcPath}`, e);
                reject(e);
            });
        });
    }

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
    function deleteFileIfExists(filePath) {
        return new Promise((resolve, reject) => {
            window.resolveLocalFileSystemURL(
                filePath,
                (entry) => {
                    entry.remove(
                        () => {
                            resolve();
                        },
                        (err) => {
                            console.error(`Failed to remove existing file: ${filePath}`, JSON.stringify(err));
                            reject(err);
                        }
                    );
                },
                () => {
                    resolve(); // File doesn't exist, so it's safe to proceed.
                }
            );
        });
    }

    async function ensureDirectoryExists(filePath, temp = true) {
        return new Promise((resolve, reject) => {
            window.resolveLocalFileSystemURL(
                filePath.substring(0, filePath.lastIndexOf('/')),
                () => resolve(),
                () => createDirectories(filePath, temp).then(resolve).catch(reject)
            );
        });
    }

    const fileExt = /file:/
    // Function to create necessary directories
    function createDirectories(path, temp = true) {
        return new Promise((resolve, reject) => {
            if (path === tempDir || path === workingDir || path === backupDir) {
                return createDirectory(path).then(resolve).catch(reject);
            }
            const baseDir = temp ? tempDir : workingDir
            const directories = path.replace(baseDir, '').split('/').slice(0, -1).filter(a => a && !fileExt.test(a)); // Exclude the file name
            const createNext = (rootDir, dirs) => {
                if (!dirs.length) {
                    return resolve();
                }
                const nextDir = dirs.shift();
                rootDir.getDirectory(
                    nextDir,
                    { create: true },
                    (dirEntry) => {
                        createNext(dirEntry, dirs); // Recursive call
                    },
                    (error) => {
                        console.error(`Failed to create directory ${nextDir} ---`, error);
                        reject(error);
                    }
                );
            };

            window.resolveLocalFileSystemURL(
                baseDir,
                (rootDir) => {
                    createNext(rootDir, directories);
                },
                (error) => {
                    console.error('Failed to resolve base directory:', error);
                    reject(error);
                }
            );
        });
    }


    // Function to download a single file
    function downloadFile(uri, destPath) {
        return new Promise((resolve, reject) => {
            try {
                const fileTransfer = new window.FileTransfer();
                fileTransfer.download(
                    uri,
                    destPath,
                    (entry) => {
                        window.resolveLocalFileSystemURL(
                            destPath,
                            (fileEntry) => {
                                resolve(fileEntry);
                            },
                            (resolveErr) => {
                                console.error(`Failed to resolve downloaded file: ${destPath}`, resolveErr);
                                reject(resolveErr);
                            }
                        );
                    },
                    (error) => {
                        console.error(`Download failed for ${uri}:`, error);
                        reject(error);
                    }
                );
            } catch (error) {
                console.error('Error initializing FileTransfer:', error);
                reject(error);
            }
        });
    }

    // Function to download all files in the manifest
    async function downloadFiles(manifest) {
        for (const file of manifest.files) {
            const destPath = `${tempDir}${file.path}`;
            try {
                // Ensure the parent directory exists
                await ensureDirectoryExists(destPath, true);
                // Download the file
                const fileEntry = await downloadFile(file.uri, destPath);
                file.location = fileEntry.nativeURL
                window.updates.progressChange(Math.round(((manifest.files.indexOf(file) / manifest.files.length) * 100) / 2 + 20))
            } catch (error) {
                console.error(`Failed to process file ${file.uri}:`, error);
                throw error; // Stop further execution on error
            }
        }
    }




    function replaceFile(sourcePath, targetPath) {
        return new Promise((resolve, reject) => {
            // Resolve the source file
            window.resolveLocalFileSystemURL(sourcePath, (sourceEntry) => {
                // Resolve the target directory
                const targetDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
                const targetFileName = targetPath.substring(targetPath.lastIndexOf('/') + 1);
                window.resolveLocalFileSystemURL(targetDir, (targetDirEntry) => {
                    deleteFileIfExists(targetPath).then(() => {
                        // Copy file to the target location
                        sourceEntry.copyTo(
                            targetDirEntry,
                            targetFileName,
                            () => {
                                resolve();
                            },
                            (copyErr) => {
                                console.error(`Error copying file to target: ${targetPath}`, JSON.stringify(copyErr));
                                reject(copyErr);
                            }
                        );
                    }).catch(e => {
                        console.error(`Error deleting existing file: ${targetPath}`, e);
                        reject(e);
                    })
                }, (targetDirErr) => {
                    console.error(`Error resolving target directory: ${targetDir}`, JSON.stringify(targetDirErr));
                    reject(targetDirErr);
                });
            }, (sourceErr) => {
                console.error(`Error resolving source file: ${sourcePath}`, JSON.stringify(sourceErr));
                reject(sourceErr);
            });
        });
    }

    async function replaceFiles(manifest) {
        let backedup = false;
        try {
            await new Promise((resolve, reject) => {
                window.resolveLocalFileSystemURL(backupDir, resolve, () => {
                    createDirectory(backupDir).then(resolve).catch(reject);
                });
            }).catch(e => {
                console.error('Error creating backup directory:', e);
                throw new Error('Error creating backup directory');
            })
            // Step 1: Backup current files
            await copyDirectory(workingDir, backupDir, true).catch(e => {
                backedup = false
                console.error('Error backing up files:', workingDir, backupDir, e);
                throw e
            })
            backedup = true;
            await createDirectory(workingDir).catch(e => {
                console.error('Error creating new working directory:', e);
                throw e; // Abort and trigger rollback
            })

            // Step 2: Replace working directory with temp files
            manifest.files.sort((a, b) => (a.path === 'index.js' || a.path === 'index.css') ? 1 : (b.path === 'index.js' || b.path === 'index.css') ? -1 : 0)
            for (const file of manifest.files) {
                const srcPath = file.location || `${tempDir}${file.path}`;
                const destPath = `${workingDir}${file.path}`;
                try {
                    await ensureDirectoryExists(destPath, false);
                    await replaceFile(srcPath, destPath);
                    window.updates.progressChange(Math.round(((manifest.files.indexOf(file) / manifest.files.length)) * 29 + 71))
                } catch (error) {
                    console.error(`Error replacing file: ${file.path}`, JSON.stringify(error));
                    throw error; // Abort and trigger rollback
                }
            }

            // Step 3: Cleanup temp directory
            await deleteDirectory(tempDir).catch(e => {
                console.error('Error deleting temp directory:', e);
                throw e; // Abort and trigger rollback
            })
            await deleteDirectory(backupDir).catch(e => {
                console.error('Error deleting backup directory:', e);
                throw e; // Abort and trigger rollback
            })
        } catch (error) {
            console.error('Error during file replacement, rolling back:', JSON.stringify(error));

            // Rollback: Restore from backup
            if (backedup) await deleteDirectory(workingDir).catch(e => {
                console.error('Error deleting new working directory:', e);
            })
            await deleteDirectory(tempDir).catch(e => {
                console.error('Error deleting temp directory:', e);
            })
            if (backedup) await copyDirectory(backupDir, workingDir, false).catch(e => {
                console.error('Error restoring backup files:', e);
                return deleteDirectory(workingDir).then(() => {
                    return copyDirectory(cordova.file.applicationDirectory + 'www/', workingDir, false)
                }).catch(() => { });
            }).finally(() => deleteDirectory(backupDir).catch(() => { }))
            throw new Error('File replacement failed and rolled back.');
        }
    }

    const checkDirectoriesExist = () => {
        return Promise.allSettled([
            new Promise((resolve, reject) => {
                window.resolveLocalFileSystemURL(baseDir, resolve, reject);
            }),
            new Promise((resolve, reject) => {
                window.resolveLocalFileSystemURL(workingDir, resolve, () => {
                    createDirectory(workingDir).then(resolve).catch(reject);
                });
            }),
            deleteDirectory(tempDir)
        ])
    }

    async function checkForUpdates() {
        const rootExists = await checkDirectoriesExist().then(results => results.every(result => result.status === 'fulfilled')).catch(e => {
            console.error('Error checking directories:', e);
            return false;
        })
        if (!rootExists) {
            return Promise.reject('Root directories do not exist: ' + baseDir + ' ' + workingDir);
        }
        const manifest = await fetchManifest();
        if (!manifest) return Promise.reject('Failed to fetch manifest.');
        const version = parseInt(manifest.version);
        const current = parseInt(localStorage.getItem('version') || '1');
        if (version === current) {
            window.dispatchEvent(new Event('no-updates'))
            return Promise.resolve();
        }
        console.log("UPDATING APP from", current, "to", version)
        window.updates.updateStarted(manifest)
        await createDirectory(tempDir).catch(e => {
            console.error('Error creating temp directory:', e);
            throw new Error('Error creating temp directory.');
        })
        window.updates.progressChange(20)
        window.updates.stateChange('Downloading files...')
        await downloadFiles(manifest).catch(async e => {
            console.error('Error downloading files:', e);
            await deleteDirectory(tempDir).catch(e => {
                console.error('Error deleting temp directory:', e);
            })
            await deleteDirectory(backupDir).catch(e => {
                console.error('Error deleting backup directory:', e);
            })
            throw new Error('Error downloading files.');
        })
        window.updates.stateChange('Replacing files...')
        window.updates.progressChange(71)
        await replaceFiles(manifest).then(() => {
            localStorage.setItem('version', version.toString());
            window.updates.updateCompleted()
        }).catch(async e => {
            await deleteDirectory(tempDir).catch(e => {
                console.error('Error deleting temp directory:', e);
            })
            if (await new Promise((resolve) => window.resolveLocalFileSystemURL(backupDir, resolve, () => resolve(false))) === false) {
                await deleteDirectory(workingDir).catch(e => {
                    console.error('Error deleting backup directory:', e);
                })
                await copyDirectory(backupDir, workingDir, false).catch(e => {
                    console.error('Error restoring backup files:', e);
                    return deleteDirectory(workingDir).then(() => {
                        return copyDirectory(cordova.file.applicationDirectory + 'www/', workingDir, false)
                    }).catch(() => { });
                })
                await deleteDirectory(backupDir).catch(e => {
                    console.error('Error deleting backup directory:', e);
                })
            }
            console.error('Error replacing files:', e);
            throw new Error('Error replacing files.');
        })
    }

    const load = async () => {
        const reload = async () => {
            localStorage.removeItem('version')
            await deleteDirectory(backupDir).catch(e => {
                console.error('Error deleting backup dir:', e)
            })
            await deleteDirectory(workingDir).catch(e => {
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
                    console.log("LOADING BUNDLE")
                    const link = document.createElement('link');
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
                        script.src = '/index.js';
                        script.defer = true;
                        document.head.appendChild(script);
                        console.log("BUNDLE LOADED")
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
            console.log("UPDATES COMPLETE LOADING BUNDLE")
            loadBundle()
        }, { once: true })
        return manageUpdates()
    }
    const startServer = () => {
        console.log("STARTING SERVER")
        return new Promise((resolve, reject) => {
            window.webserver.start(
                function () {
                    try {
                        console.log("Server started")
                        serverRunning = true
                        window.webserver.onRequest(function (request) {
                            if (request.path === '/') {
                                request.path = '/index.html'
                            }
                            let serv = workingDir.substring(7, workingDir.length)
                            serv = serv.substring(0, serv.length - 1) + request.path
                            window.webserver.sendResponse(
                                request.requestId,
                                {
                                    status: 200,
                                    path: serv,
                                    headers: {
                                        'Access-Control-Allow-Origin': '*',
                                        'Access-Control-Allow-Headers': '*',
                                        'Access-Control-Allow-Methods': '*',
                                        'Access-Control-Allow-Credentials': 'true',
                                        'Access-Control-Max-Age': '100000000000' //  
                                    }
                                },
                                function () {
    
                                },
                                function (error) {
                                    console.error('Error sending response: ', error.toString());
                                }
                            );
                        });
                        resolve()
                    } catch(e) {
                        console.error('Error starting server:', e)
                        reject(e)
                    }
                },
                function (error) {
                    try {
                        if (error.toString() === 'Server already running') {
                            serverRunning = true
                            console.log('Server already running restarting now')
                            window.webserver.stop(() => {
                                serverRunning = false
                                startServer().then(resolve).catch(reject)
                            }, (e) => {
                                return reject(e)
                            })
                        } else if ((error.toString() === 'bind failed: EADDRINUSE (Address already in use)') || (/address/i.test(error.toString()) && /use/i.test(error.toString()))) {
                            port++
                            console.log('Port in use, trying new port:', port)
                            startServer().then(resolve).catch(reject)
                        } else {
                            console.error('Error starting server:', error.toString())
                            resolve()
                        }
                    } catch (e) {
                        reject(e)
                    }
                },
                port,
                hostname
            )
        })
    }
    const initialize = () => {
        const start = () => {
            return new Promise((resolve, reject) => {
                const create = () => {
                    window.resolveLocalFileSystemURL(workingDir, () => {
                        console.log("Working dir exists")
                        resolve()
                    }, () => {
                        createDirectory(workingDir).then(() => {
                            console.log("Created working dir")
                            return copyDirectory(cordova.file.applicationDirectory + 'www/', workingDir, false).then(() => {
                                console.log("Copied www to working dir")
                                localStorage.setItem('version', window.firstVersion || '49')
                                return resolve()
                            }).catch(reject)
                        }).catch(reject);
                    });
                }
                const onFailedRestore = (e) => {
                    localStorage.removeItem('version')
                    console.error('Error restoring backup:', e)
                    return deleteDirectory(workingDir).then(() => {
                        console.log("Deleted working dir")
                        return deleteDirectory(backupDir).then(() => {
                            console.log("Deleted backup dir")
                            return new Promise((res, rej) => {
                                window.resolveLocalFileSystemURL(workingDir, () => {
                                    console.error()
                                    return rej('Failed to delete working dir, please restart the app')
                                }, () => {
                                    console.log("Validated deletion of working dir")
                                    window.resolveLocalFileSystemURL(backupDir, () => {
                                        console.error()
                                        return rej('Failed to delete backup, please restart the app')
                                    }, () => {
                                        console.log("Validated deletion of backup dir")
                                        return res()
                                    })
                                })
                            })
                        })
                    }).then(() => {
                        localStorage.setItem('version', window.firstVersion || '49')
                        create()
                    }).catch(reject)
                }
                window.resolveLocalFileSystemURL(backupDir, () => {
                    console.log("Restoring backup")
                    deleteDirectory(workingDir).then(() => {
                        console.log("Deleted working dir")
                        return deleteDirectory(tempDir)
                    }).then(() => {
                        console.log("Deleted temp dir")
                        return copyDirectory(backupDir, workingDir, false).then(() => {
                            console.log("Copied backup to working dir")
                            return deleteDirectory(backupDir)
                        }).then(() => {
                            console.log("Deleted backup dir")
                            return create()
                        })
                    }).catch(onFailedRestore)
                }, () => create())
            })
        }

        if (window.cordova.platformId === 'android') {
            return start()
        } else {
            return start()
        }
    }
    const manageUpdates = () => checkForUpdates().catch(e => {
        console.error('ERROR CHECKING FOR UPDATES', e)
        window.updates.updateFailed(e)
    }).finally(() => setTimeout(() => manageUpdates(), 60000 * 5))
    initialize().then(() => startServer()).catch(e => {
        console.error('Error initializing:', e);
    }).finally(() => {
        load()
    })
}, false)