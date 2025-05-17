// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path')
const http = require('http');
const https = require('https')
const fs = require('fs');
const mime = require('mime-types');
const os = require('os');
const { dialog } = require('electron/main');

process.env.PLATFORM = os.platform()
app.commandLine.appendSwitch('enable-features', 'WebRtcHideLocalIpsWithMdns');
app.commandLine.appendSwitch('enable-webrtc-hw-encoding');
app.commandLine.appendSwitch('enable-webrtc-hw-decoding');
const configuration = path.resolve(path.join(__dirname, './config.json'))
if (fs.existsSync(configuration)) {
  try {
    const config = JSON.parse(fs.readFileSync(configuration, 'utf-8'))
    if (typeof config === 'object' && config instanceof Array && config.length > 0) {
      for (let i = 0; i < config.length; i++) if (config[i] && config[i].key && config[i].value) process.env[config[i].key] = config[i].value
    } else if (config && typeof config === 'object') {
      for (let i = 0, k = Object.entries(config); i < k.length; i++) process.env[k[i][0]] = k[i][1]
    }
  } catch { }
}

const applicationDir = path.join(__dirname, 'build');
const userData = app.getPath('userData') || path.join(os.homedir(), 'temporary-electron-data');
const tempDir = path.join(userData, 'temp');
const backupDir = path.join(userData, 'backup');
const workingDir = path.join(userData, 'www');
const fileDir = path.join(userData, 'downloads')
var updatingApp = false

ipcMain.handle('set-updating', (event, value = false) => {
  updatingApp = value
})

ipcMain.handle('is-updating', (event) => updatingApp)

ipcMain.handle('fs:save-file', (event, filePath, data) => {
  return new Promise((res, rej) => {
    fs.writeFile(filePath, data, (err) => {
      if (err) {
        rej(err)
      } else {
        res(true)
      }
    });
  })
});
ipcMain.handle('fs:readdir', (event, pathname) => {
  return new Promise((res, rej) => {
    fs.readdir(pathname, (err, files) => {
      if (err) return rej(err)
      const results = []
      for (let i = 0; i < files.length; i++) {
        try {
          const filePath = path.join(pathname, files[i])
          const stats = fs.statSync(filePath)
          results.push({
            pathname: filePath,
            isDirectory: stats.isDirectory()
          })
        } catch (e) {
          return rej(e)
        }
      }
      return res(results)
    })
  })
})
// Check if a file or directory exists
ipcMain.handle('fs:resolve', (event, filePath) => {
  return new Promise((resolve) => {
    fs.stat(filePath, (err, stats) => {
      if (err) return resolve({ exists: false });
      resolve({ exists: true, isDirectory: stats.isDirectory(), isFile: stats.isFile() });
    });
  });
});

// Create a directory (recursively)
ipcMain.handle('fs:createDirectory', (event, dirPath) => {
  return new Promise((resolve, reject) => {
    fs.mkdir(dirPath, { recursive: true }, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
});

// Delete a directory recursively
ipcMain.handle('fs:deleteDirectory', (event, dirPath) => {
  return new Promise((resolve, reject) => {
    fs.rm(dirPath, { recursive: true, force: true }, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
});

// Copy a directory recursively
ipcMain.handle('fs:copyDirectory', (event, srcDir, destDir) => {
  return new Promise((resolve, reject) => {
    const copyRecursive = (src, dest, cb) => {
      fs.mkdir(dest, { recursive: true }, (err) => {
        if (err) return cb(err);
        fs.readdir(src, { withFileTypes: true }, (err, entries) => {
          if (err) return cb(err);
          let pending = entries.length;
          if (!pending) return cb();

          entries.forEach((entry) => {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
              copyRecursive(srcPath, destPath, (err) => {
                if (--pending === 0) cb(err);
              });
            } else {
              fs.copyFile(srcPath, destPath, (err) => {
                if (--pending === 0) cb(err);
              });
            }
          });
        });
      });
    };

    copyRecursive(srcDir, destDir, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
});

// Copy a file
ipcMain.handle('fs:copyFile', (event, srcPath, destPath) => {
  return new Promise((resolve, reject) => {
    fs.mkdir(path.dirname(destPath), { recursive: true }, (err) => {
      if (err) return reject(err);
      fs.copyFile(srcPath, destPath, (err) => {
        if (err) return reject(err);
        resolve(true);
      });
    });
  });
});

// Delete a file
ipcMain.handle('fs:deleteFile', (event, filePath) => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') return reject(err);
      else if (err) return resolve(false)
      resolve(true);
    });
  });
});

// Ensure directory exists
ipcMain.handle('fs:ensureDir', (event, filePath) => {
  return new Promise((resolve, reject) => {
    fs.mkdir(path.dirname(filePath), { recursive: true }, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
});

// Recursively create path parts
ipcMain.handle('fs:createDirs', (event, filePath) => {
  return new Promise((resolve, reject) => {
    const parts = path.normalize(filePath).split(path.sep).filter(Boolean);
    let currentPath = path.isAbsolute(filePath) ? path.sep : '';
    const createNext = () => {
      if (!parts.length) return resolve(true);
      currentPath = path.join(currentPath, parts.shift());
      fs.mkdir(currentPath, { recursive: false }, (err) => {
        if (err && err.code !== 'EEXIST') return reject(err);
        createNext();
      });
    };
    createNext();
  });
});

// Download a file
ipcMain.handle('fs:downloadFile', (event, uri, destPath) => {
  return new Promise((resolve, reject) => {
    const protocol = uri.startsWith('https') ? https : http;
    fs.mkdir(path.dirname(destPath), { recursive: true }, (err) => {
      if (err) return reject(err);
      const file = fs.createWriteStream(destPath);
      protocol.get(uri, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download: ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve(true));
        });
      }).on('error', reject);
    });
  });
});

// Replace file
ipcMain.handle('fs:replaceFile', (event, sourcePath, targetPath) => {
  return new Promise((resolve, reject) => {
    fs.copyFile(sourcePath, targetPath, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
});
ipcMain.handle('move-file', async (event, sourcePath) => {
  return dialog.showSaveDialog({
    title: 'Save File As',
    defaultPath: path.basename(sourcePath),
  }).then(({ filePath, canceled }) => {
    if (!canceled && filePath) {
      return new Promise((res, rej) => {
        fs.rename(sourcePath, filePath, (err) => {
          if (err) return rej('Failed to move file: ' + err.toString());
          res()
        })
      })
    } else {
      return Promise.reject("Failed to move file")
    }
  })
})

const fileStream = new Map()

ipcMain.handle('fileWriter:openFiles', (event) => {
  return new Promise(res => res(Array.from(fileStream.keys())))
})

ipcMain.handle('fileWriter:start', (event, filePath) => {
  return new Promise((res, rej) => {
    if (fileStream.has(filePath)) return rej('Already streaming path')
    fileStream.set(filePath, fs.createWriteStream(filePath))
    return res(true)
  })
});

ipcMain.handle('fileWriter:write', (event, filePath, chunk) => {
  return new Promise((res, rej) => {
    if (fileStream.has(filePath) && chunk instanceof Uint8Array) {
      fileStream.get(filePath).write(Buffer.from(chunk));
      return res(true)
    }
    return rej('Failed to write chunk.')
  })
});

ipcMain.handle('fileWriter:close', (event, filePath) => {
  console.log(filePath, fileStream.has(filePath))
  return new Promise((res, rej) => {
    if (fileStream.has(filePath)) {
      fileStream.get(filePath).end();
      fileStream.delete(filePath);
      return res(true)
    } else {
      return rej('Failed to close filestream not in list.')
    }
  })
});
ipcMain.handle('fileWriter:cancel', (event, filePath) => {
  return new Promise((res, rej) => {
    if (fileStream.has(filePath)) {
      fileStream.get(filePath).end();
      fileStream.delete(filePath);
      return new Promise((res) => {
        fs.unlink(filePath, (err) => {
          if (err) console.error(err)
          res(true)
        })
      }).then((result) => res(result)).catch(rej)
    } else {
      rej('Failed to cancel filestream not in our list.')
    }
  })
});
function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile('build/index.html');
}
function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let reqPath = decodeURIComponent(req.url.split('?')[0]);
      if (reqPath === '/') reqPath = '/index.html';
      const filePath = path.join(workingDir, reqPath);
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(workingDir)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }
      fs.stat(resolvedPath, (err, stats) => {
        if (err || !stats.isFile()) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }
        const mimeType = mime.lookup(resolvedPath) || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);
        fs.createReadStream(resolvedPath).pipe(res);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve(`http://127.0.0.1:${port}/`);
    });
    server.on('error', reject);
  });
}
app.whenReady().then(() => {
  startStaticServer().then((serverUrl) => {
    if (!serverUrl) throw new Error('Failed to start server!');
    process.env.APPLICATION_DIR = applicationDir
    process.env.BACKUP_DIR = backupDir
    process.env.USER_DIR = userData
    process.env.TEMP_DIR = tempDir
    process.env.WORKING_DIR = workingDir
    process.env.SERVER_URL = serverUrl
    process.env.FILE_DIR = fileDir
    createWindow()
  }).catch(e => {
    console.error('Failed to start server', e)
    process.exit(1)
  })
});