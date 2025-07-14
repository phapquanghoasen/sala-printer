const { app, Tray, Menu, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store').default;
const store = new Store();
const admin = require('firebase-admin');
const net = require('net');
const AutoLaunch = require('electron-auto-launch');
const Sudoer = require('electron-sudo').default;
const sudoer = new Sudoer();

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

function formatPrice(value) {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  return numValue
    .toLocaleString('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    })
    .replace('₫', 'VNĐ')
    .trim();
}

function getBillTotal(foods) {
  return (foods || []).reduce((sum, food) => sum + food.price * food.quantity, 0);
}

function formatFoodLine(name, qty, price) {
  const nameWidth = 24;
  const qtyWidth = 6;
  const priceWidth = 18;

  let foodName = name.length > nameWidth ? name.slice(0, nameWidth - 1) + '…' : name;
  foodName = foodName.padEnd(nameWidth, ' ');

  const qtyStr = String(qty).padStart(qtyWidth, ' ');
  const priceStr = formatPrice(price).padStart(priceWidth, ' ');

  return `${foodName}${qtyStr}${priceStr}`;
}

function buildEscposBuffer(data) {
  let lines = [];
  lines.push('\x1B\x40'); // ESC @ (reset)
  lines.push('\x1B\x21\x20'); // font double height
  lines.push('SALA FOOD\n');
  if (data.tableNumber) lines.push(`Bàn: ${data.tableNumber}\n`);
  lines.push('------------------------------------------------\n');
  lines.push('Tên món                 SL     Giá\n');
  data.foods.forEach(food => {
    lines.push(formatFoodLine(food.name, food.quantity, food.price) + '\n');
  });
  lines.push('------------------------------------------------\n');
  lines.push(`Tổng: ${formatPrice(getBillTotal(data.foods))}\n`);
  lines.push('\nNAM MÔ A DI ĐÀ PHẬT\n\n\n');
  lines.push('\x1D\x56\x00'); // cut
  return Buffer.from(lines.join(''), 'utf8');
}

async function printReceipt(billId) {
  console.log(`[PRINT] Bắt đầu in hóa đơn: ${billId}`);
  const uid = store.get('uid');
  const userDoc = await admin.firestore().collection('users').doc(uid).get();
  if (!userDoc.exists) {
    console.error('[PRINT] Không tìm thấy user!');
    throw new Error('Không tìm thấy user!');
  }
  const userData = userDoc.data();

  let printerIp = '192.168.1.100';
  let printerPort = 9100;
  if (userData.printerIp) printerIp = userData.printerIp;
  if (userData.printerPort) printerPort = userData.printerPort;

  const billDoc = await admin.firestore().collection('bills').doc(billId).get();
  if (!billDoc.exists) {
    console.error('[PRINT] Không tìm thấy hóa đơn!');
    throw new Error('Không tìm thấy hóa đơn!');
  }
  const billData = billDoc.data();

  const buffer = buildEscposBuffer(billData);

  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let isConnected = false;
    client.setTimeout(5000);

    client.connect(printerPort, printerIp, () => {
      isConnected = true;
      console.log(`[PRINT] Đã kết nối tới máy in ${printerIp}:${printerPort}`);
      client.write(buffer, () => {
        console.log('[PRINT] Đã gửi dữ liệu in thành công');
        client.end();
        resolve();
      });
    });

    client.on('timeout', () => {
      if (!isConnected) {
        const msg = `[PRINT] Không thể kết nối tới máy in tại ${printerIp}:${printerPort} (timeout)`;
        console.error(msg);
        client.destroy();
        reject(new Error(msg));
      }
    });

    client.on('error', err => {
      const msg = `[PRINT] Lỗi khi kết nối hoặc in: ${err.message}`;
      console.error(msg);
      client.destroy();
      reject(new Error(msg));
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
          console.log(`[QUEUE] Nhận yêu cầu in mới: billId=${data.billId}`);
          await docRef.update({ status: PRINT_STATUS.printing });
          try {
            await printReceipt(data.billId);
            await docRef.update({
              status: PRINT_STATUS.success,
              printedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`[QUEUE] In thành công: billId=${data.billId}`);
          } catch (err) {
            await docRef.update({
              status: PRINT_STATUS.failed,
              error: err.message,
              failedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.error(`[QUEUE] In thất bại: billId=${data.billId} - ${err.message}`);
          }
        }
      });
    });
}

// Đảm bảo chỉ chạy 1 instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Nếu có cửa sổ login hoặc main thì focus lên
    if (loginWindow) {
      if (loginWindow.isMinimized()) loginWindow.restore();
      loginWindow.focus();
    } else if (tray) {
      // Có thể show thông báo hoặc tạo lại cửa sổ nếu cần
    }
  });

  app.on('ready', () => {
    console.log('App is starting...');
    const uid = store.get('uid');
    console.log('UID from store:', uid);
    if (!uid) {
      console.log('No UID found, showing login window.');
      createLoginWindow();
    } else {
      console.log('UID found, starting background.');
      startBackground();
    }
    salaAutoLauncher.enable().catch(err => {
      console.error('AutoLaunch error:', err);
      if (err.message && err.message.includes('Access is denied')) {
        dialog.showErrorBox(
          'Lỗi tự khởi động',
          'Không thể bật tự khởi động.\nỨng dụng sẽ thử khởi động lại với quyền Administrator.'
        );
        runAsAdmin();
        app.quit();
      }
    });
  });

  app.on('window-all-closed', e => {
    // Không thoát app khi đóng hết cửa sổ (chạy ngầm tray)
    e.preventDefault();
  });
}

// Hàm này chỉ dùng nếu bạn muốn chạy lại app với quyền admin (không tự động gọi)
function runAsAdmin() {
  sudoer.exec('node main.js', { name: 'Sala Printer' }).then(console.log).catch(console.error);
}
