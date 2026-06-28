const { app, BrowserWindow } = require('electron');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadFile('index.html');
  const d1 = await win.webContents.executeJavaScript('window.localStorage.getItem("transacoes_app")');
  console.log("index.html data length:", d1 ? d1.length : 0);
  
  await win.loadFile('app.html');
  const d2 = await win.webContents.executeJavaScript('window.localStorage.getItem("transacoes_app")');
  console.log("app.html data length:", d2 ? d2.length : 0);
  app.quit();
});
