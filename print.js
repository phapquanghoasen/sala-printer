const net = require('net');
const path = require('path');
const admin = require('firebase-admin');
const Store = require('electron-store').default;
const Encoder = require('esc-pos-encoder');
const { createCanvas } = require('canvas');
const { getBillTotal, formatPrice, formatDate } = require('./utils');

const store = new Store();
const serviceAccountPath = path.join(process.resourcesPath, 'firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

// Hàm trợ giúp để cắt ngắn văn bản nếu nó vượt quá chiều rộng cho phép
function truncateText(ctx, text, maxWidth) {
  let width = ctx.measureText(text).width;
  const ellipsis = '...';
  const ellipsisWidth = ctx.measureText(ellipsis).width;

  if (width <= maxWidth) {
    return text;
  }

  let len = text.length;
  // Lặp lại việc cắt bớt ký tự cuối cho đến khi văn bản + "..." vừa với chiều rộng
  while (width + ellipsisWidth > maxWidth && len > 0) {
    len--;
    text = text.substring(0, len);
    width = ctx.measureText(text).width;
  }

  return text + ellipsis;
}

async function renderBillToImage(data) {
  // =================================================================
  // 1. CẤU HÌNH BỐ CỤC (Không thay đổi)
  // =================================================================
  const config = {
    width: 576,
    fontFamily: 'sans-serif',
    lineHeight: 32,
    margins: { top: 20, bottom: 40, left: 5, right: 10 },
    header: { fontSize: 30, fontStyle: 'bold', spacingAfter: 10 },
    info: { fontSize: 25, spacingAfter: 15 },
    table: {
      headerFontSize: 22,
      headerFontStyle: 'bold',
      bodyFontSize: 25,
      columns: { name: 5, qty: 295, price: 420, total: 566 },
      namePadding: 15,
      spacingAfter: 10,
    },
    total: { fontSize: 30, fontStyle: 'bold', spacingAfter: 15 },
    hr: { height: 2, spacingAfter: 15 },
  };

  const foods = data.foods || [];

  // =================================================================
  // 2. "VẼ NHÁP" ĐỂ TÍNH CHIỀU CAO CHÍNH XÁC (Logic này đã đúng)
  // =================================================================
  let dryRunY = config.margins.top;
  dryRunY += config.header.fontSize + config.header.spacingAfter;
  dryRunY += config.info.fontSize + config.info.spacingAfter;
  dryRunY += config.hr.height + config.hr.spacingAfter;
  dryRunY += config.lineHeight; // Dòng tiêu đề bảng
  dryRunY += foods.length * config.lineHeight; // Các món ăn
  dryRunY += config.table.spacingAfter;
  dryRunY += config.hr.height + config.hr.spacingAfter;
  dryRunY += config.total.fontSize + config.total.spacingAfter;
  dryRunY += config.margins.bottom;

  const height = Math.ceil(dryRunY / 8) * 8;

  // =================================================================
  // 3. "VẼ THẬT" LÊN CANVAS VỚI CHIỀU CAO ĐÃ CÓ
  // =================================================================
  const canvas = createCanvas(config.width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, config.width, height);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';

  let currentY = config.margins.top;

  // Vẽ Header
  ctx.font = `${config.header.fontStyle} ${config.header.fontSize}px ${config.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.fillText('SALA FOOD', config.width / 2, currentY);
  currentY += config.header.fontSize + config.header.spacingAfter;

  // Vẽ thông tin
  const billCreationTime = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : new Date();
  const tableInfo = data.tableNumber ? `Bàn: ${data.tableNumber} - ${formatDate(billCreationTime)}` : formatDate(billCreationTime);
  ctx.font = `${config.info.fontSize}px ${config.fontFamily}`;
  ctx.fillText(tableInfo, config.width / 2, currentY);
  currentY += config.info.fontSize + config.info.spacingAfter;

  // Vẽ đường kẻ ngang đầu tiên
  const horizontalLineWidth = config.width - config.margins.left - config.margins.right;
  ctx.fillRect(config.margins.left, currentY, horizontalLineWidth, config.hr.height);
  currentY += config.hr.height + config.hr.spacingAfter;

  // Vẽ tiêu đề bảng
  ctx.font = `${config.table.headerFontStyle} ${config.table.headerFontSize}px ${config.fontFamily}`;
  const headerTextY = currentY + (config.lineHeight - config.table.headerFontSize) / 2;
  ctx.textAlign = 'left';
  ctx.fillText('Tên', config.table.columns.name, headerTextY);
  ctx.textAlign = 'center';
  ctx.fillText('SL', config.table.columns.qty, headerTextY);
  ctx.textAlign = 'right';
  ctx.fillText('Giá', config.table.columns.price, headerTextY);
  ctx.fillText('TT', config.table.columns.total, headerTextY);
  currentY += config.lineHeight;

  // Vẽ danh sách món ăn
  ctx.font = `${config.table.bodyFontSize}px ${config.fontFamily}`;
  const maxNameWidth = config.table.columns.qty - config.table.columns.name - config.table.namePadding;
  foods.forEach(food => {
    const bodyTextY = currentY + (config.lineHeight - config.table.bodyFontSize) / 2;
    const lineTotal = food.quantity * food.price;
    const displayName = truncateText(ctx, food.name, maxNameWidth);
    ctx.textAlign = 'left';
    ctx.fillText(displayName, config.table.columns.name, bodyTextY);
    ctx.textAlign = 'center';
    ctx.fillText(food.quantity.toString(), config.table.columns.qty, bodyTextY);
    ctx.textAlign = 'right';
    ctx.fillText(formatPrice(food.price, false), config.table.columns.price, bodyTextY);
    ctx.fillText(formatPrice(lineTotal, false), config.table.columns.total, bodyTextY);
    currentY += config.lineHeight;
  });
  currentY += config.table.spacingAfter;

  // Vẽ đường kẻ ngang thứ hai
  ctx.fillRect(config.margins.left, currentY, horizontalLineWidth, config.hr.height);
  currentY += config.hr.height + config.hr.spacingAfter;

  // Vẽ tổng tiền
  ctx.font = `${config.total.fontStyle} ${config.total.fontSize}px ${config.fontFamily}`;
  ctx.textAlign = 'left';
  ctx.fillText('Tổng cộng:', config.margins.left, currentY);
  ctx.textAlign = 'right';
  ctx.fillText(formatPrice(getBillTotal(data.foods)), config.table.columns.total, currentY);
  currentY += config.total.fontSize + config.total.spacingAfter;

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

  return db
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

module.exports = {
  listenPrintQueue,
};
