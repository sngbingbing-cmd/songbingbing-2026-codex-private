const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 1024,
    useContentSize: true,
    frame: false,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await window.loadURL('http://127.0.0.1:5173');
  await new Promise((resolve) => setTimeout(resolve, 900));
  const image = await window.webContents.capturePage();
  const output = path.join(__dirname, '..', 'design', 'qa-implementation.png');
  fs.writeFileSync(output, image.toPNG());
  console.log(output);
  app.quit();
});
