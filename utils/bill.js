const net = require('net');
const { createCanvas } = require('canvas');
const { CONFIG, HEIGHT, LINE_WIDTH } = require('./constants/config');
const { formatPrice, formatDate } = require('./utils/format');

function getBillTotal(foods) {
  return (foods || []).reduce((sum, food) => sum + food.price * food.quantity, 0);
}

function truncateText(ctx, text, maxWidth) {
  let width = ctx.measureText(text).width;
  const ellipsis = '...';
  const ellipsisWidth = ctx.measureText(ellipsis).width;
  if (width <= maxWidth) return text;
  let len = text.length;
  while (width + ellipsisWidth > maxWidth && len > 0) {
    len--;
    text = text.substring(0, len);
    width = ctx.measureText(text).width;
  }
  return text + ellipsis;
}

function calculateBillHeight(foodsLength, hasPage = false) {
  let dryRunY = 0;
  dryRunY += HEIGHT.HEADER + CONFIG.SPACING_AFTER;
  dryRunY += HEIGHT.INFO + CONFIG.SPACING_AFTER;
  if (hasPage) {
    dryRunY += HEIGHT.PAGE + CONFIG.SPACING_AFTER;
  }
  dryRunY += HEIGHT.HR + CONFIG.SPACING_AFTER;
  dryRunY += HEIGHT.TABLE_ROW + CONFIG.TABLE.SPACING_AFTER;
  dryRunY += foodsLength * HEIGHT.TABLE_ROW;
  dryRunY += foodsLength * CONFIG.TABLE.SPACING_AFTER;
  dryRunY += CONFIG.SPACING_AFTER;
  dryRunY += HEIGHT.HR + CONFIG.SPACING_AFTER;
  dryRunY += HEIGHT.TOTAL + CONFIG.SPACING_AFTER;
  return dryRunY;
}

async function renderBillToImage(data, hasPage = false) {
  const foods = data.foods || [];
  const height = Math.ceil(calculateBillHeight(foods.length, hasPage) / 8) * 8;
  const canvas = createCanvas(CONFIG.WIDTH, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, CONFIG.WIDTH, height);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';
  let currentY = 0;

  // Header
  ctx.font = `${CONFIG.HEADER.FONT_STYLE} ${CONFIG.HEADER.FONT_SIZE}px ${CONFIG.FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText('SALA FOOD', CONFIG.WIDTH / 2, currentY);
  currentY += HEIGHT.HEADER + CONFIG.SPACING_AFTER;

  // Info
  const tableInfo = `Bàn: ${data.tableNumber} - ${formatDate(data.createdAt)}`;
  ctx.font = `${CONFIG.INFO.FONT_SIZE}px ${CONFIG.FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText(tableInfo, CONFIG.WIDTH / 2, currentY);
  currentY += HEIGHT.INFO + CONFIG.SPACING_AFTER;

  // Page info (nếu có)
  if (hasPage) {
    const pageInfo = `Tờ: ${data.page} / ${data.pageCount}`;
    ctx.font = `${CONFIG.PAGE.FONT_SIZE}px ${CONFIG.FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.fillText(pageInfo, CONFIG.WIDTH / 2, currentY);
    currentY += HEIGHT.PAGE + CONFIG.SPACING_AFTER;
  }

  // HR
  ctx.fillRect(CONFIG.MARGINS.LEFT, currentY, LINE_WIDTH, CONFIG.HR.HEIGHT);
  currentY += HEIGHT.HR + CONFIG.SPACING_AFTER;

  // Table header
  ctx.font = `${CONFIG.TABLE.FONT_STYLE} ${CONFIG.TABLE.FONT_SIZE}px ${CONFIG.FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText('Tên', CONFIG.TABLE.COLUMNS.NAME, currentY);
  ctx.textAlign = 'center';
  ctx.fillText('SL', CONFIG.TABLE.COLUMNS.QTY, currentY);
  ctx.textAlign = 'right';
  ctx.fillText('Giá', CONFIG.TABLE.COLUMNS.PRICE, currentY);
  ctx.fillText('TT', CONFIG.TABLE.COLUMNS.TOTAL, currentY);
  currentY += HEIGHT.TABLE_ROW + CONFIG.TABLE.SPACING_AFTER;

  // Foods
  ctx.font = `${CONFIG.TABLE.FONT_SIZE}px ${CONFIG.FONT_FAMILY}`;
  const nameWidth = CONFIG.TABLE.COLUMNS.QTY - CONFIG.TABLE.COLUMNS.NAME - CONFIG.TABLE.NAME_PADDING;
  (foods || []).forEach(food => {
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
    currentY += HEIGHT.TABLE_ROW + CONFIG.TABLE.SPACING_AFTER;
  });
  currentY += CONFIG.SPACING_AFTER;

  // HR
  ctx.fillRect(CONFIG.MARGINS.LEFT, currentY, LINE_WIDTH, CONFIG.HR.HEIGHT);
  currentY += HEIGHT.HR + CONFIG.SPACING_AFTER;

  // Total
  const total = formatPrice(getBillTotal(data.foods));
  ctx.font = `${CONFIG.TOTAL.FONT_STYLE} ${CONFIG.TOTAL.FONT_SIZE}px ${CONFIG.FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText('Tổng cộng:', CONFIG.MARGINS.LEFT, currentY);
  ctx.textAlign = 'right';
  ctx.fillText(total, CONFIG.TABLE.COLUMNS.TOTAL, currentY);
  currentY += HEIGHT.TOTAL + CONFIG.SPACING_AFTER;

  return canvas;
}

function sendBufferToPrinter(buffer, printerIp, printerPort) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(10000);
    client.connect(printerPort, printerIp, () => {
      client.write(buffer, () => {
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

module.exports = {
  renderBillToImage,
  sendBufferToPrinter,
};
