const net = require('net');
const path = require('path');
const admin = require('firebase-admin');
const Store = require('electron-store').default;
const Encoder = require('esc-pos-encoder');
const { createCanvas } = require('canvas');
const { CONFIG, HEIGHT, LINE_WIDTH } = require('./constants');
const { getBillTotal, formatPrice, formatDate } = require('./utils');

const store = new Store();
const serviceAccountPath = path.join(process.resourcesPath, 'firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

function truncateText(ctx, text, maxWidth) {
  let width = ctx.measureText(text).width;
  const ellipsis = '...';
  const ellipsisWidth = ctx.measureText(ellipsis).width;

  if (width <= maxWidth) {
    return text;
  }

  let len = text.length;

  while (width + ellipsisWidth > maxWidth && len > 0) {
    len--;
    text = text.substring(0, len);
    width = ctx.measureText(text).width;
  }

  return text + ellipsis;
}

function calculateBillHeight(foodsLength) {
  let dryRunY = 0;

  // Vẽ tiêu đề
  dryRunY += HEIGHT.HEADER;
  dryRunY += CONFIG.SPACING_AFTER;

  // Vẽ thông tin
  dryRunY += HEIGHT.INFO;
  dryRunY += CONFIG.SPACING_AFTER;

  // Vẽ đường kẻ ngang đầu tiên
  dryRunY += HEIGHT.HR;
  dryRunY += CONFIG.SPACING_AFTER;

  // Vẽ tiêu đề bảng
  dryRunY += HEIGHT.TABLE_ROW;
  dryRunY += CONFIG.TABLE.SPACING_AFTER;

  // Vẽ danh sách món ăn
  dryRunY += foodsLength * HEIGHT.TABLE_ROW;
  dryRunY += foodsLength * CONFIG.TABLE.SPACING_AFTER;
  dryRunY += CONFIG.SPACING_AFTER;

  // Vẽ đường kẻ ngang thứ hai
  dryRunY += HEIGHT.HR;
  dryRunY += CONFIG.SPACING_AFTER;

  // Vẽ tổng tiền
  dryRunY += HEIGHT.TOTAL;
  dryRunY += CONFIG.SPACING_AFTER;

  return dryRunY;
}

async function renderBillToImage(data) {
  const foods = data.foods || [];
  const height = Math.ceil(calculateBillHeight(foods.length) / 8) * 8;

  const canvas = createCanvas(CONFIG.WIDTH, height);
  const ctx = canvas.getContext('2d');

  // Xóa toàn bộ canvas với màu trắng
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, CONFIG.WIDTH, height);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';

  let currentY = 0;

  // Vẽ Header - SALA FOOD
  ctx.font = `${CONFIG.HEADER.FONT_STYLE} ${CONFIG.HEADER.FONT_SIZE}px ${CONFIG.FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText('SALA FOOD', CONFIG.WIDTH / 2, currentY);
  currentY += HEIGHT.HEADER;
  currentY += CONFIG.SPACING_AFTER;

  // Vẽ thông tin bàn và thời gian
  const tableInfo = `Bàn: ${data.tableNumber} - ${formatDate(data.createdAt)}`;
  ctx.font = `${CONFIG.INFO.FONT_SIZE}px ${CONFIG.FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText(tableInfo, CONFIG.WIDTH / 2, currentY);
  currentY += HEIGHT.INFO;
  currentY += CONFIG.SPACING_AFTER;

  // Vẽ đường kẻ ngang đầu tiên
  ctx.fillRect(CONFIG.MARGINS.LEFT, currentY, LINE_WIDTH, CONFIG.HR.HEIGHT);
  currentY += HEIGHT.HR;
  currentY += CONFIG.SPACING_AFTER;

  // Vẽ tiêu đề bảng
  ctx.font = `${CONFIG.TABLE.FONT_STYLE} ${CONFIG.TABLE.FONT_SIZE}px ${CONFIG.FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText('Tên', CONFIG.TABLE.COLUMNS.NAME, currentY);
  ctx.textAlign = 'center';
  ctx.fillText('SL', CONFIG.TABLE.COLUMNS.QTY, currentY);
  ctx.textAlign = 'right';
  ctx.fillText('Giá', CONFIG.TABLE.COLUMNS.PRICE, currentY);
  ctx.fillText('TT', CONFIG.TABLE.COLUMNS.TOTAL, currentY);
  currentY += HEIGHT.TABLE_ROW;
  currentY += CONFIG.TABLE.SPACING_AFTER;

  // Vẽ danh sách món ăn
  ctx.font = `${CONFIG.TABLE.FONT_SIZE}px ${CONFIG.FONT_FAMILY}`;
  const nameWidth = CONFIG.TABLE.COLUMNS.QTY - CONFIG.TABLE.COLUMNS.NAME - CONFIG.TABLE.NAME_PADDING;

  foods.forEach(food => {
    const displayName = truncateText(ctx, food.name, nameWidth);
    const quantity = food.quantity.toString();
    const price = formatPrice(food.price, false);
    const lineTotal = formatPrice(food.quantity * food.price, false);

    ctx.textAlign = 'left';
    ctx.fillText(displayName, CONFIG.TABLE.COLUMNS.NAME, currentY);
    ctx.textAlign = 'center';
    ctx.fillText(quantity, CONFIG.TABLE.COLUMNS.QTY, currentY);
    ctx.textAlign = 'right';
    ctx.fillText(price, CONFIG.TABLE.COLUMNS.PRICE, currentY);
    ctx.fillText(lineTotal, CONFIG.TABLE.COLUMNS.TOTAL, currentY);
    currentY += HEIGHT.TABLE_ROW;
    currentY += CONFIG.TABLE.SPACING_AFTER;
  });
  currentY += CONFIG.SPACING_AFTER;

  // Vẽ đường kẻ ngang thứ hai
  ctx.fillRect(CONFIG.MARGINS.LEFT, currentY, LINE_WIDTH, CONFIG.HR.HEIGHT);
  currentY += HEIGHT.HR;
  currentY += CONFIG.SPACING_AFTER;

  // Vẽ tổng tiền
  const total = formatPrice(getBillTotal(data.foods));
  ctx.font = `${CONFIG.TOTAL.FONT_STYLE} ${CONFIG.TOTAL.FONT_SIZE}px ${CONFIG.FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText('Tổng cộng:', CONFIG.MARGINS.LEFT, currentY);
  ctx.textAlign = 'right';
  ctx.fillText(total, CONFIG.TABLE.COLUMNS.TOTAL, currentY);
  currentY += HEIGHT.TOTAL;
  currentY += CONFIG.SPACING_AFTER;

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
