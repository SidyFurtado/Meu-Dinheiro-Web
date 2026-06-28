const { app, BrowserWindow } = require('electron');
const fs = require('fs');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  
  if (process.argv.includes('--read')) {
    await win.loadFile('app.html');
    const val = await win.webContents.executeJavaScript('window.localStorage.getItem("test_cross")');
    console.log("Read from app.html:", val);
    app.quit();
  } else {
    await win.loadFile('index.html');
    await win.webContents.executeJavaScript('window.localStorage.setItem("test_cross", "saved_in_index")');
    console.log("Saved in index.html");
    app.quit();
  }
});
