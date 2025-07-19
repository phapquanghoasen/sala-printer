const net = require('net');
const { createCanvas } = require('canvas');
const { CONFIG, HEIGHT, LINE_WIDTH } = require('../constants/config');
const { formatPrice, formatDate } = require('./format');

function getBillTotal(foods) {
  return (foods || []).reduce((sum, food) => sum + food.price * food.quantity, 0);
}

function truncateText(ctx, text, maxWidth) {
  if (!text || typeof text !== 'string' || text.length === 0) return '';

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

function renderMultiLineText(ctx, text, x, y, maxWidth, lineHeight) {
  if (!text || typeof text !== 'string' || text.length === 0) return y;

  let currentY = y;

  // Tách theo dấu xuống dòng trước
  const paragraphs = text.split('\n');

  paragraphs.forEach(paragraph => {
    if (paragraph.trim() === '') {
      currentY += lineHeight;
      return;
    }

    const words = paragraph.split(' ').filter(word => word.length > 0);
    if (words.length === 0) {
      currentY += lineHeight;
      return;
    }

    let line = '';

    for (let i = 0; i < words.length; i++) {
      const testLine = line + (line.length > 0 ? ' ' : '') + words[i];
      const testWidth = ctx.measureText(testLine).width;

      if (testWidth > maxWidth && line.length > 0) {
        // Render dòng hiện tại
        ctx.fillText(line, x, currentY);
        currentY += lineHeight;
        line = words[i];
      } else {
        line = testLine;
      }
    }

    // Render dòng cuối cùng của paragraph
    if (line.length > 0) {
      ctx.fillText(line, x, currentY);
      currentY += lineHeight;
    }
  });

  return currentY;
}

function calculateClientBillHeight(foodsLength) {
  let dryRunY = 0;
  dryRunY += HEIGHT.HEADER + CONFIG.SPACING_AFTER;
  dryRunY += HEIGHT.INFO + CONFIG.SPACING_AFTER;
  dryRunY += HEIGHT.HR + CONFIG.SPACING_AFTER;
  dryRunY += HEIGHT.TABLE_ROW + CONFIG.TABLE.SPACING_AFTER;
  dryRunY += foodsLength * HEIGHT.TABLE_ROW;
  dryRunY += foodsLength * CONFIG.TABLE.SPACING_AFTER;
  dryRunY += CONFIG.SPACING_AFTER;
  dryRunY += HEIGHT.HR + CONFIG.SPACING_AFTER;
  dryRunY += HEIGHT.TOTAL + CONFIG.SPACING_AFTER;
  return dryRunY;
}

async function renderClientBillToImage(data) {
  const foods = data.foods || [];
  const height = Math.ceil(calculateClientBillHeight(foods.length) / 8) * 8;
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

  // HR
  ctx.fillRect(CONFIG.MARGINS.LEFT, currentY, LINE_WIDTH, CONFIG.HR.HEIGHT);
  currentY += HEIGHT.HR + CONFIG.SPACING_AFTER;

  // Table header - Client layout: Tên, SL, Giá, TT
  ctx.font = `${CONFIG.TABLE.FONT_STYLE} ${CONFIG.TABLE.FONT_SIZE}px ${CONFIG.FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText('Tên', CONFIG.TABLE.COLUMNS.NAME, currentY);
  ctx.textAlign = 'center';
  ctx.fillText('SL', CONFIG.TABLE.COLUMNS.QTY, currentY);
  ctx.textAlign = 'right';
  ctx.fillText('Giá', CONFIG.TABLE.COLUMNS.PRICE, currentY);
  ctx.fillText('TT', CONFIG.TABLE.COLUMNS.TOTAL, currentY);
  currentY += HEIGHT.TABLE_ROW + CONFIG.TABLE.SPACING_AFTER;

  // Foods - Client layout
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

function calculateNoteLines(text, maxWidth) {
  if (!text || typeof text !== 'string' || text.length === 0) return 0;

  const avgCharWidth = CONFIG.INFO.FONT_SIZE * 0.6;
  const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth);

  // Tách theo dấu xuống dòng trước
  const paragraphs = text.split('\n');
  let totalLines = 0;

  paragraphs.forEach(paragraph => {
    if (paragraph.trim() === '') {
      // Dòng trống vẫn tính là 1 dòng
      totalLines += 1;
      return;
    }

    const words = paragraph.split(' ').filter(word => word.length > 0);
    if (words.length === 0) {
      totalLines += 1;
      return;
    }

    let lines = 1;
    let currentLineLength = 0;

    for (let i = 0; i < words.length; i++) {
      const wordLength = words[i].length + (currentLineLength > 0 ? 1 : 0); // +1 cho space

      if (currentLineLength + wordLength > maxCharsPerLine && currentLineLength > 0) {
        lines++;
        currentLineLength = words[i].length;
      } else {
        currentLineLength += wordLength;
      }
    }

    totalLines += lines;
  });

  return totalLines;
}

function calculateKitchenBillHeight(foodsLength, noteLines = 0) {
  let dryRunY = 0;
  dryRunY += HEIGHT.HEADER + CONFIG.SPACING_AFTER;
  dryRunY += HEIGHT.INFO + CONFIG.SPACING_AFTER;
  dryRunY += HEIGHT.PAGE + CONFIG.SPACING_AFTER;
  if (noteLines > 0) {
    dryRunY += noteLines * HEIGHT.INFO + CONFIG.SPACING_AFTER;
  }
  dryRunY += HEIGHT.HR + CONFIG.SPACING_AFTER;
  dryRunY += HEIGHT.TABLE_ROW + CONFIG.TABLE.SPACING_AFTER;
  dryRunY += foodsLength * HEIGHT.TABLE_ROW;
  dryRunY += foodsLength * CONFIG.TABLE.SPACING_AFTER;
  dryRunY += CONFIG.SPACING_AFTER;
  dryRunY += HEIGHT.HR + CONFIG.SPACING_AFTER;
  return dryRunY;
}

async function renderKitchenBillToImage(data) {
  const foods = data.foods || [];
  const maxWidth = CONFIG.WIDTH - CONFIG.MARGINS.LEFT - CONFIG.MARGINS.RIGHT;
  const noteLines = data.note ? calculateNoteLines(data.note, maxWidth) : 0;

  const height = Math.ceil(calculateKitchenBillHeight(foods.length, noteLines) / 8) * 8;
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

  // Page info
  const pageInfo = `Tờ: ${data.page} / ${data.pageCount}`;
  ctx.font = `${CONFIG.PAGE.FONT_SIZE}px ${CONFIG.FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText(pageInfo, CONFIG.WIDTH / 2, currentY);
  currentY += HEIGHT.PAGE + CONFIG.SPACING_AFTER;

  // Note
  if (data.note) {
    ctx.font = `${CONFIG.INFO.FONT_SIZE}px ${CONFIG.FONT_FAMILY}`;
    ctx.textAlign = 'left';
    currentY = renderMultiLineText(ctx, data.note, CONFIG.MARGINS.LEFT, currentY, maxWidth, HEIGHT.INFO);
    currentY += CONFIG.SPACING_AFTER;
  }

  // HR
  ctx.fillRect(CONFIG.MARGINS.LEFT, currentY, LINE_WIDTH, CONFIG.HR.HEIGHT);
  currentY += HEIGHT.HR + CONFIG.SPACING_AFTER;

  // Table header - Kitchen layout: Tên, SL
  ctx.font = `${CONFIG.TABLE.FONT_STYLE} ${CONFIG.TABLE.FONT_SIZE}px ${CONFIG.FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText('Tên', CONFIG.TABLE.KITCHEN_COLUMNS.NAME, currentY);
  ctx.textAlign = 'right';
  ctx.fillText('SL', CONFIG.TABLE.KITCHEN_COLUMNS.QTY, currentY);
  currentY += HEIGHT.TABLE_ROW + CONFIG.TABLE.SPACING_AFTER;

  // Foods - Kitchen layout
  ctx.font = `${CONFIG.TABLE.FONT_SIZE}px ${CONFIG.FONT_FAMILY}`;
  const nameWidth = CONFIG.TABLE.KITCHEN_COLUMNS.QTY - CONFIG.TABLE.KITCHEN_COLUMNS.NAME - CONFIG.TABLE.NAME_PADDING;

  (foods || []).forEach(food => {
    const displayName = truncateText(ctx, food.name, nameWidth);
    const quantity = food.quantity.toString();

    ctx.textAlign = 'left';
    ctx.fillText(displayName, CONFIG.TABLE.KITCHEN_COLUMNS.NAME, currentY);
    ctx.textAlign = 'right';
    ctx.fillText(quantity, CONFIG.TABLE.KITCHEN_COLUMNS.QTY, currentY);
    currentY += HEIGHT.TABLE_ROW + CONFIG.TABLE.SPACING_AFTER;
  });

  currentY += CONFIG.SPACING_AFTER;

  // HR
  ctx.fillRect(CONFIG.MARGINS.LEFT, currentY, LINE_WIDTH, CONFIG.HR.HEIGHT);
  currentY += HEIGHT.HR + CONFIG.SPACING_AFTER;

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
  renderClientBillToImage,
  renderKitchenBillToImage,
  sendBufferToPrinter,
};
