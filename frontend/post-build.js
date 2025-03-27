const fs = require('fs')
const path = require('path')
const {execSync} = require('child_process')
const electronDir = path.resolve('./electron/dist')
const cordovaDir = path.resolve('./cordova/www')
const dist = path.resolve('./dist')
if (fs.existsSync(electronDir)) {
    fs.rmdirSync(electronDir, {recursive: true})
}
if (fs.existsSync(cordovaDir)) {
    fs.rmdirSync(electronDir, {recursive: true})
}
execSync(`cp -R ${dist} ${electronDir}`)
execSync(`cp -R ${dist} ${cordovaDir}`)