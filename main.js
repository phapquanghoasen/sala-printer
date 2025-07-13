const { app, Tray, Menu, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store').default;
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

function printBill(printer, data) {
  // Độ rộng cột
  const nameWidth = 24;
  const qtyWidth = 6;
  const priceWidth = 18;

  // Tiêu đề cột
  const foodName = 'Tên món';
  const foodQty = 'SL';
  const foodPrice = 'Giá';

  // Tạo biến space cho từng cột
  const space1 = ' '.repeat(nameWidth - foodName.length);
  const space2 = ' '.repeat(qtyWidth - foodQty.length);

  // Tạo đường kẻ ngang
  const lineSeparator = '-'.repeat(48);

  // Dòng tiêu đề
  const tableNumber = data.tableNumber ? `Bàn: ${data.tableNumber}` : '';
  printer
    .encode('GB18030')
    .font('a')
    .style('b')
    .align('ct')
    .text('SALA FOOD')
    .text(tableNumber)
    .text(lineSeparator)
    .align('lt')
    .text(foodName + space1 + foodQty + space2 + foodPrice);

  // In từng món ăn
  data.foods.forEach(food => {
    printer.text(formatFoodLine(food.name, food.quantity, food.price));
  });

  // In tổng tiền căn thẳng cột giá
  const totalLabel = 'Tổng:'.padEnd(nameWidth + qtyWidth, ' ');
  const totalValue = formatPrice(getBillTotal(data.foods)).padStart(priceWidth, ' ');
  printer
    .text(lineSeparator)
    .style('b')
    .text(`${totalLabel}${totalValue}`)
    .style('normal')
    .text(' ')
    .align('ct')
    .text('NAM MÔ A DI ĐÀ PHẬT')
    .cut();
}

async function printReceipt(billId) {
  const uid = store.get('uid');
  const userDoc = await admin.firestore().collection('users').doc(uid).get();
  if (!userDoc.exists) throw new Error('Không tìm thấy user!');
  const userData = userDoc.data();

  let printerIp = '192.168.1.240';
  let printerPort = 9100;
  if (userData.printerIp) printerIp = userData.printerIp;
  if (userData.printerPort) printerPort = userData.printerPort;

  const billDoc = await admin.firestore().collection('bills').doc(billId).get();
  if (!billDoc.exists) throw new Error('Không tìm thấy hóa đơn!');
  const billData = billDoc.data();

  const device = new escpos.Network(printerIp, printerPort);
  const printer = new escpos.Printer(device);

  return new Promise((resolve, reject) => {
    device.open(() => {
      try {
        printBill(printer, billData);
        printer.close(resolve);
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
            await printReceipt(data.billId);
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
