const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow () {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    icon: path.join(__dirname, 'favicon.ico'), // Asegúrate de que el nombre coincida con tu imagen
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true
    }
  });

  // Aquí conectamos la aplicación directamente a tu URL en vivo
  win.loadURL('https://ggy-music.web.app/');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});