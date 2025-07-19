const path = require('path');
const { app, Tray, Menu, BrowserWindow, ipcMain, dialog } = require('electron');
const Store = require('electron-store').default;
const AutoLaunch = require('electron-auto-launch');
const Sudoer = require('electron-sudo').default;
// const { listenPrintClientBill } = require('./print');
const { listenPrintKitchenBill } = require('./print-kitchen');

const store = new Store();
const sudoer = new Sudoer();
const gotTheLock = app.requestSingleInstanceLock();
const salaAutoLauncher = new AutoLaunch({ name: 'Sala Printer' });

let tray = null;
let loginWindow = null;
// let unsubscribePrintClientBill = null;
let unsubscribePrintKitchenBill = null;

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

function createLoginWindow() {
  if (loginWindow) return;

  loginWindow = new BrowserWindow({
    width: 400,
    height: 300,
    resizable: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  loginWindow.loadFile('login.html');
  loginWindow.setSkipTaskbar(true);
  loginWindow.on('closed', () => {
    loginWindow = null;
  });
}

// function clearUnsubscribePrintClientBill() {
//   if (unsubscribePrintClientBill) {
//     unsubscribePrintClientBill();
//     unsubscribePrintClientBill = null;
//   }
// }

function clearUnsubscribePrintKitchenBill() {
  if (unsubscribePrintKitchenBill) {
    unsubscribePrintKitchenBill();
    unsubscribePrintKitchenBill = null;
  }
}

function logout() {
  store.delete('uid');
  destroyTray();
  // clearUnsubscribePrintClientBill();
  clearUnsubscribePrintKitchenBill();
  createLoginWindow();
}

function startBackground() {
  if (tray) return;
  const iconPath = path.join(process.resourcesPath, 'icon.png');
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Đăng xuất', click: logout },
    { label: 'Thoát', click: () => app.quit() },
  ]);
  tray.setToolTip('Sala Printer');
  tray.setContextMenu(contextMenu);

  // clearUnsubscribePrintClientBill();
  // unsubscribePrintClientBill = listenPrintClientBill();
  clearUnsubscribePrintKitchenBill();
  unsubscribePrintKitchenBill = listenPrintKitchenBill();
}

function runAsAdmin() {
  sudoer.exec('node main.js', { name: 'Sala Printer' }).then(console.log).catch(console.error);
}

function setupAutoLaunch() {
  salaAutoLauncher.enable().catch(err => {
    console.error('Lỗi AutoLaunch:', err);
    if (err.message && err.message.includes('Access is denied')) {
      dialog
        .showMessageBox({
          type: 'error',
          title: 'Lỗi tự khởi động',
          message: 'Không thể bật tính năng tự khởi động cùng Windows.',
          detail: 'Ứng dụng cần quyền Administrator để thực hiện việc này. Bạn có muốn khởi động lại ứng dụng với quyền Administrator không?',
          buttons: ['OK', 'Cancel'],
        })
        .then(result => {
          if (result.response === 0) {
            runAsAdmin();
            app.quit();
          }
        });
    }
  });
}

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (loginWindow) {
      if (loginWindow.isMinimized()) loginWindow.restore();
      loginWindow.focus();
    } else if (tray) {
    }
  });

  app.on('ready', () => {
    const uid = store.get('uid');

    if (!uid) {
      createLoginWindow();
    } else {
      startBackground();
    }

    setupAutoLaunch();
  });

  app.on('window-all-closed', e => {
    e.preventDefault();
  });
}

ipcMain.on('login-success', (event, uid) => {
  store.set('uid', uid);
  if (loginWindow) loginWindow.close();
  startBackground();
});
