const { app, session } = require('electron');
app.whenReady().then(async () => {
  const sizes = await session.defaultSession.getStorageData();
  console.log("Storage data sizes:", sizes);
  app.quit();
});
