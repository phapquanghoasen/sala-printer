const Encoder = require('esc-pos-encoder');
const { groupBy } = require('./utils/format');
const { listenPrintBill, getPrinterInfo, getUserData, getBillData } = require('./utils/firestore');
const { renderBillToImage, sendBufferToPrinter } = require('./utils/bill');

async function printReceipt(billId) {
  const userData = await getUserData();
  const billData = await getBillData(billId);
  const { ip, port } = getPrinterInfo('kitchen', userData);

  const foods = billData.foods || [];
  const groupFoods = Object.values(groupBy(foods, 'type'));
  const pageCount = groupFoods.length;

  const encoder = new Encoder();
  encoder.initialize();

  for (let index = 0; index < groupFoods.length; index++) {
    const foods = groupFoods[index];

    const data = {
      ...billData,
      foods,
      page: index + 1,
      pageCount: pageCount,
    };

    // 1. Render hóa đơn ra đối tượng canvas
    const canvas = await renderBillToImage(data, true);

    // 2. Thêm ảnh vào encoder
    encoder.image(canvas, canvas.width, canvas.height, 'threshold', 128);
    encoder.newline();
    encoder.newline();
    encoder.newline();
    encoder.cut();
  }

  // 3. Gửi buffer tới máy in qua TCP (dùng hàm utils)
  const resultBuffer = encoder.encode();
  await sendBufferToPrinter(resultBuffer, ip, port);
}

function listenPrintKitchenBill() {
  return listenPrintBill('kitchen', printReceipt);
}

module.exports = {
  listenPrintKitchenBill,
};
