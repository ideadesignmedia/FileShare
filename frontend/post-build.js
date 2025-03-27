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

//replace index.html in cordova
fs.readFile(path.join(dist, 'index.html'), 'utf8', (readErr, data) => {
    if (readErr) {
      console.error('Error reading file:', readErr);
      process.exit(1);
    }
  
    // Define the script tag to inject
    const scriptTag = '    <script src="cordova.js"></script>\n';
    // Insert the script tag before the closing </head> tag
    const modifiedHtml = data.replace('<head>', '<head>\n' + scriptTag);
  
    // Write the modified HTML to the new location
    fs.writeFile(path.join(cordovaDir, 'index.html'), modifiedHtml, 'utf8', (writeErr) => {
      if (writeErr) {
        console.error('Error writing file:', writeErr);
      }
      console.log('File written successfully to', outputPath);
    });
  });

  