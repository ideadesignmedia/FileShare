require('@ideadesignmedia/config.js')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execSync } = require('child_process')
const electronDir = path.resolve('./electron/build')
const cordovaDir = path.resolve('./cordova/www')
const dist = path.resolve('./dist')
const sw = path.resolve('./sw.js')


if (fs.existsSync(electronDir)) {
  fs.rmdirSync(electronDir, { recursive: true })
}
if (fs.existsSync(cordovaDir)) {
  fs.rmdirSync(cordovaDir, { recursive: true })
}
execSync(`cp -R ${dist} ${electronDir}`)
execSync(`cp -R ${dist} ${cordovaDir}`)

let file = fs.readFileSync(sw, 'utf8')
const exp = /= (.*) \/\//
const strings = file.split('\n')
const cacheLine = strings[0]
const cacheNumber = parseInt(exp.exec(cacheLine)[1].trim())
const newCacheNumber = (cacheNumber + 1).toString()
strings[0] = cacheLine.replace(exp, `= ${newCacheNumber} //`)
file = strings.join('\n')
fs.writeFileSync(sw, file, 'utf8')
fs.writeFileSync(path.join(dist, 'sw.js'), file, 'utf8')

const cordovaInit = path.join(path.dirname(cordovaDir), 'cordova-initialize.js')
if (fs.existsSync(cordovaInit)) fs.copyFileSync(cordovaInit, path.join(cordovaDir, 'cordova-initialize.js'))
const cordovaIndex = path.join(path.dirname(cordovaDir), 'cordova-index.html')
if (fs.existsSync(cordovaIndex)) fs.copyFileSync(cordovaIndex, path.join(cordovaDir, 'index.html'))
const electronIndex = path.join(path.dirname(electronDir), 'electron-index.html')
if (fs.existsSync(electronIndex)) fs.copyFileSync(electronIndex, path.join(electronDir, 'index.html'))
const electronInit = path.join(path.dirname(electronDir), 'electron-initialize.js')
if (fs.existsSync(electronInit)) fs.copyFileSync(electronInit, path.join(electronDir, 'electron-initialize.js'))
const initSW = path.resolve('./init-sw.js')
if (fs.existsSync(initSW)) fs.copyFileSync(initSW, path.join(dist, 'init-sw.js'))


function getFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

// Function to generate manifest
function generateManifest(basePath, relativePath = '') {
  const manifest = [];
  const fullPath = path.join(basePath, relativePath);
  const files = fs.readdirSync(fullPath)
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.endsWith('gz') || file.includes('.well_known') || file.includes('assetlinks.json')) {
      continue
    }
    const absolutePath = path.join(fullPath, file);
    const relativeFilePath = path.join(relativePath, file).replace(/\\/g, '/');

    if (fs.lstatSync(absolutePath).isDirectory()) {
      manifest.push(...generateManifest(basePath, relativeFilePath)); // Recurse for directories
    } else {
      const uri = `${process.env.HOST}/${relativeFilePath}`;
      manifest.push({ uri, path: relativeFilePath, hash: getFileHash(absolutePath) });
    }
  }
  return manifest;
}

// Run the script
try {
  const manifestPath = path.join(dist, 'app-file-manifest.json')
  const manifest = {
    version: newCacheNumber,
    files: generateManifest(dist),
  };
  console.log("Manifest version", manifest.version)
  if (!fs.existsSync(path.dirname(manifestPath))) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('Manifest created successfully at ./dist/app-file-manifest.json');
} catch (error) {
  console.error('Error during operation:', error);
}