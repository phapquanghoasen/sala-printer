const { app, Tray, Menu, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store').default;
const store = new Store();
const admin = require('firebase-admin');
const net = require('net');
const AutoLaunch = require('electron-auto-launch');
const Sudoer = require('electron-sudo').default;
const sudoer = new Sudoer();
const { createCanvas } = require('canvas');
const Encoder = require('esc-pos-encoder');

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

 function formatDate(date) {
  if (!date) return '';

  return `${date.toLocaleDateString('vi-VN')} - ${date.toLocaleTimeString('vi-VN')}`;
}

function getBillTotal(foods) {
  return (foods || []).reduce((sum, food) => sum + food.price * food.quantity, 0);
}

async function renderBillToImage(data) {
  const lineHeight = 32; // Tăng chiều cao dòng để chữ không bị dính vào nhau
  const startY = 20;
  const contentWidth = 576;

  const foods = data.foods || [];
  const headerLines = 5;
  const footerLines = 2;
  const tableHeaderLines = 1;

  // Tính chiều cao ban đầu, sau đó làm tròn lên bội số của 8
  const calculatedHeight = (headerLines + foods.length + tableHeaderLines + footerLines) * lineHeight + startY;
  const height = Math.ceil(calculatedHeight / 8) * 8;

  const canvas = createCanvas(contentWidth, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, contentWidth, height);
  ctx.fillStyle = '#000';

  let currentY = 25;

  // Vẽ Header
  const headerFontSize = 26;
  ctx.font = `bold ${headerFontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('SALA FOOD', contentWidth / 2, currentY);
  currentY += lineHeight * 1.3;

  // Lấy thời gian và gộp với thông tin bàn
  const billCreationTime = (data.createdAt && data.createdAt.toDate) ? data.createdAt.toDate() : new Date();
  const formattedTime = formatDate(billCreationTime);
  
  let tableInfo = formattedTime;
  if (data.tableNumber) {
    tableInfo = `Bàn: ${data.tableNumber} - ${formattedTime}`;
  }

  ctx.font = '25px sans-serif';
  ctx.fillText(tableInfo, contentWidth / 2, currentY);
  currentY += lineHeight * 1.5;

  // **SỬA LỖI TẠI ĐÂY**
  // Vẽ danh sách món ăn - Tăng kích thước font
  ctx.font = '25px sans-serif';
  ctx.textAlign = 'left';
  foods.forEach(food => {
    ctx.fillText(food.name, 10, currentY);
    ctx.textAlign = 'right';
    ctx.fillText(`${food.quantity} x ${formatPrice(food.price)}`, contentWidth - 10, currentY);
    ctx.textAlign = 'left';
    currentY += lineHeight;
  });

  // Vẽ đường kẻ ngang
  currentY += lineHeight / 2;
  ctx.fillRect(10, currentY, contentWidth - 20, 2);
  currentY += lineHeight;

  // Vẽ tổng tiền
  const total = formatPrice(getBillTotal(data.foods));
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Tổng cộng:', 10, currentY);
  ctx.textAlign = 'right';
  ctx.fillText(total, contentWidth - 10, currentY);
  currentY += lineHeight * 2;

  return canvas;
}

async function printReceipt(billId) {
  console.log(`[PRINT] Bắt đầu in hóa đơn: ${billId}`);
  const uid = store.get('uid');
  if (!uid) throw new Error('Không tìm thấy UID người dùng đã đăng nhập.');

  const userDoc = await admin.firestore().collection('users').doc(uid).get();
  if (!userDoc.exists) throw new Error('Không tìm thấy thông tin người dùng trong CSDL.');
  const userData = userDoc.data();

  const printerIp = userData.printerIp || '192.168.1.194';
  const printerPort = userData.printerPort || 9100;

  const billDoc = await admin.firestore().collection('bills').doc(billId).get();
  if (!billDoc.exists) throw new Error(`Không tìm thấy hóa đơn với ID: ${billId}`);
  const billData = billDoc.data();

  // 1. Render hóa đơn ra đối tượng canvas
  const canvas = await renderBillToImage(billData);

  // 2. Chuyển canvas thành lệnh in ESC/POS
  const encoder = new Encoder();

  // Khởi tạo và thêm lệnh in ảnh
  encoder.initialize();

  // Sử dụng chiều rộng và chiều cao thực tế của canvas (đã được làm tròn)
  encoder.image(canvas, canvas.width, canvas.height, 'threshold', 128);

  // Thêm các lệnh còn lại
  encoder.cut();

  // Lấy buffer cuối cùng
  const resultBuffer = encoder.encode();

  // 3. Gửi lệnh tới máy in qua TCP (giữ nguyên)
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(10000);
    client.connect(printerPort, printerIp, () => {
      client.write(resultBuffer, () => {
        client.end();
        resolve();
      });
    });
    client.on('timeout', () => {
      client.destroy();
      reject(new Error(`Không thể kết nối tới máy in tại ${printerIp}:${printerPort} (hết thời gian chờ)`));
    });
    client.on('error', err => {
      client.destroy();
      reject(new Error(`Lỗi kết nối máy in: ${err.message}`));
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
        dialog.showErrorBox('Lỗi tự khởi động', 'Không thể bật tự khởi động.\nỨng dụng sẽ thử khởi động lại với quyền Administrator.');
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
