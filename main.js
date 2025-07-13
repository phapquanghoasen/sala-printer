const { app, Tray, Menu, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const store = new Store();
const admin = require('firebase-admin');
const escpos = require('escpos');
const AutoLaunch = require('electron-auto-launch');

const serviceAccountPath = path.join(process.resourcesPath, 'firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

let tray = null;
let loginWindow = null;
let unsubscribePrintQueue = null;
const salaAutoLauncher = new AutoLaunch({ name: 'Sala Printer' });

function createLoginWindow() {
  if (loginWindow) return;
  loginWindow = new BrowserWindow({
    width: 400,
    height: 300,
    resizable: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  loginWindow.loadFile('index.html');
  loginWindow.setSkipTaskbar(true);
  loginWindow.on('closed', () => {
    loginWindow = null;
  });
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

function startBackground() {
  if (tray) return;
  const iconPath = path.join(process.resourcesPath, 'icon.png');
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Đăng xuất', click: handleLogout },
    { label: 'Thoát', click: () => app.quit() },
  ]);
  tray.setToolTip('Sala Printer');
  tray.setContextMenu(contextMenu);
  listenPrintQueue();
}

function handleLogout() {
  store.delete('uid');
  destroyTray();
  if (unsubscribePrintQueue) {
    unsubscribePrintQueue();
    unsubscribePrintQueue = null;
  }
  createLoginWindow();
}

ipcMain.on('login-success', (event, uid) => {
  store.set('uid', uid);
  if (loginWindow) loginWindow.close();
  startBackground();
});

async function printReceipt(data) {
  const uid = store.get('uid');
  const userDoc = await admin.firestore().collection('users').doc(uid).get();
  if (!userDoc.exists) throw new Error('Không tìm thấy user!');
  const userData = userDoc.data();
  const printerId = userData.printerId;
  if (!printerId) throw new Error('User chưa cấu hình printerId!');

  const printerDoc = await admin.firestore().collection('printers').doc(printerId).get();
  if (!printerDoc.exists) throw new Error('Không tìm thấy máy in!');
  const printerData = printerDoc.data();
  const printerIp = printerData.printerIp || '192.168.1.240';
  const printerPort = printerData.printerPort || 9100;

  const device = new escpos.Network(printerIp, printerPort);
  const printer = new escpos.Printer(device);

  return new Promise((resolve, reject) => {
    device.open(() => {
      try {
        printer
          .encode('GB18030')
          .font('a')
          .style('b')
          .align('ct')
          .text('SALA FOOD')
          .text(`Bàn: ${data.tableNumber || ''}`)
          .text('--------------------------')
          .align('lt')
          .text('Tên món                 Giá         SL');

        (data.foods || data.items).forEach(item => {
          const name = item.name.padEnd(22, ' ');
          const price = item.price.toLocaleString('vi-VN').padStart(12, ' ');
          const qty = String(item.quantity || item.qty).padStart(8, ' ');
          printer.text(`${name}${price}${qty}`);
        });

        printer
          .text('--------------------------')
          .align('rt')
          .text(`Tổng: ${(data.total || (data.foods || data.items).reduce((s, f) => s + f.price * (f.quantity || f.qty), 0)).toLocaleString('vi-VN')} VNĐ`)
          .text(' ')
          .align('ct')
          .text('NAM MÔ A DI ĐÀ PHẬT')
          .cut()
          .close(resolve);
      } catch (err) {
        reject(err);
      }
    });
  });
}

function listenPrintQueue() {
  const db = admin.firestore();
  const PRINT_STATUS = {
    pending: 'pending',
    printing: 'printing',
    success: 'success',
    failed: 'failed',
  };

  // Dừng lắng nghe cũ nếu có
  if (unsubscribePrintQueue) {
    unsubscribePrintQueue();
    unsubscribePrintQueue = null;
  }

  unsubscribePrintQueue = db
    .collection('printQueue')
    .where('status', '==', PRINT_STATUS.pending)
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          const docRef = change.doc.ref;
          const data = change.doc.data();
          await docRef.update({ status: PRINT_STATUS.printing });
          try {
            await printReceipt(data);
            await docRef.update({
              status: PRINT_STATUS.success,
              printedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } catch (err) {
            await docRef.update({
              status: PRINT_STATUS.failed,
              error: err.message,
              failedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }
      });
    });
}

app.on('ready', () => {
  const uid = store.get('uid');
  if (!uid) {
    createLoginWindow();
  } else {
    startBackground();
  }
  salaAutoLauncher.enable().catch(err => {
    console.error('AutoLaunch error:', err);
  });
});

app.on('window-all-closed', e => {
  // Không thoát app khi đóng hết cửa sổ (chạy ngầm tray)
  e.preventDefault();
});
