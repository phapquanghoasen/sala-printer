const path = require('path');
const admin = require('firebase-admin');
const Store = require('electron-store').default;

const store = new Store();
const serviceAccountPath = path.join(process.resourcesPath, 'firebase-service-account.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function getUserData() {
  const uid = store.get('uid');
  if (!uid) throw new Error('Không tìm thấy UID người dùng đã đăng nhập.');
  const userDoc = await admin.firestore().collection('users').doc(uid).get();
  if (!userDoc.exists) throw new Error('Không tìm thấy thông tin người dùng trong CSDL.');
  return userDoc.data();
}

async function getBillData(billId) {
  const billDoc = await admin.firestore().collection('bills').doc(billId).get();
  if (!billDoc.exists) throw new Error(`Không tìm thấy hóa đơn với ID: ${billId}`);
  return billDoc.data();
}

function getPrinterInfo(type, userData) {
  if (type === 'kitchen') {
    return {
      ip: userData.printerKitchenIp || '192.168.1.194',
      port: userData.printerKitchenPort || 9100,
    };
  }

  return {
    ip: userData.printerClientIp || '192.168.1.194',
    port: userData.printerClientPort || 9100,
  };
}

function listenPrintBill(type, printReceipt) {
  const PRINT_STATUS = {
    pending: 'pending',
    printing: 'printing',
    success: 'success',
    failed: 'failed',
  };

  // const collectionName = type === 'kitchen' ? 'printKitchenBills' : 'printClientBills';
  const collectionName = type === 'kitchen' ? 'printQueue' : 'printClientBills';

  return db
    .collection(collectionName)
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
  getBillData,
  getPrinterInfo,
  getUserData,
  listenPrintBill,
};
