const Encoder = require('esc-pos-encoder');
const { getUserData, getBillData, listenPrintBill, getPrinterInfo } = require('./utils/firestore');
const { renderBillToImage, sendBufferToPrinter } = require('./utils/bill');

async function printReceipt(billId) {
  const userData = await getUserData();
  const billData = await getBillData(billId);
  const { ip, port } = getPrinterInfo('client', userData);

  // 1. Render hóa đơn ra đối tượng canvas (dùng hàm utils)
  const canvas = await renderBillToImage(billData);

  // 2. Chuyển canvas thành lệnh in ESC/POS
  const encoder = new Encoder();
  encoder.initialize();
  encoder.image(canvas, canvas.width, canvas.height, 'threshold', 128);
  encoder.newline();
  encoder.newline();
  encoder.newline();
  encoder.cut();
  const resultBuffer = encoder.encode();

  // 3. Gửi buffer tới máy in qua TCP (dùng hàm utils)
  await sendBufferToPrinter(resultBuffer, ip, port);
}

function listenPrintClientBill() {
  return listenPrintBill('client', printReceipt);
}

module.exports = {
  listenPrintClientBill,
};
