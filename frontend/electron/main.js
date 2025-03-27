// main.js
const { app, BrowserWindow } = require('electron');

function createWindow () {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      // For security reasons, consider using a preload script with contextIsolation enabled
      nodeIntegration: true 
    }
  });
  
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);