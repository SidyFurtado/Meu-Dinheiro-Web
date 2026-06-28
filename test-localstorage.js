const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadFile('index.html');
  await win.webContents.executeJavaScript('window.localStorage.setItem("test_shared", "from_index")');
  
  await win.loadFile('app.html');
  const val = await win.webContents.executeJavaScript('window.localStorage.getItem("test_shared")');
  console.log("Shared LocalStorage value:", val);
  
  app.quit();
});
