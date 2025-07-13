const { app, Tray, Menu, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const store = new Store();
const admin = require('firebase-admin');
const escpos = require('escpos');
const AutoLaunch = require('electron-auto-launch');

// Khởi tạo trực tiếp với thông tin service account
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      type: "service_account",
      project_id: "sala-food",
      private_key_id: "9ab0bce571734e54381fcfbceae0b61f52fa22ea",
      private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDTsz1gARm2Zvbl\nn7xx7dFKKxb9VyYEKVuISjb7k4JWycBH1MCBzm+Meuhr2l0Ov1KskLZCq7F++S2Y\nRVgGxGrvNd1kB/B3BDczXxwm5yDaebKUppeY9OwQ6ET7iXFT7361f11bIKCLmVMP\nYWJ9C7QSDSxuzBuLED3+VogcBhkqPE9IyXQqVFU7e3g0HFdO+uh+wHRyqBTVDPAN\nJRvGO84+va2HRY5C7uNwJzRiEW3Tx4b0GJUeI/pd5fdXkMElLsiY01aHfW3XOMhZ\nWZNn5huTGup7oUyf3siR/5y/0bfQlX8ULaxZSnMwANbnDy1HI5HTns2Pc+Gj23SC\nMSauW+KNAgMBAAECggEADbrpx6C6pLBf4fuusqrscIWD67Frx0hRZfD+SOnDwdI6\n9M2xIJoddPyBt4EFmQ/CkmueToupKuWJVf9lWqcBknspXTQAng95bw0Dm+hQoqrS\n8L4vRd3Ys64Ez1WWMo3tZ2MX0HG4x+UNVImJ5DdOmf8dux/kx2upwaWmFT82AZ2i\nfzuPsrJVhw45P4Ab0ncgqOe00z3njsIR3fwZMnZ+mxjd7YM0nSIMpeombGvvxUB7\nczb+heMLx0ndnYEDCQiKcPFX3kJSbIZrXaP77ERPOWWSxP5P7NtYgXA2sCK03Uog\nD4P/dophAxB9qJVwypzdXjGUk1bGpYhulwhNkza8kQKBgQD1iioRnonagTj85yGL\ndaLVjawQZNmjy9ve9nmns8hcC9BNMXim5Ft3Z5MN7UpL4EPbiKyoCDJBxcJ+lFiw\nK6jG9G/TiadccQsssAMgp0/OIk15vrWSJB0jiMHbAnvS1kWkQL+D7uqE81lCD1Nh\n7xa+SoWxAwU7yFU4MgZ6sU1iRQKBgQDcuAYrJpNTtNLzaZEL1kaCiukaXirIkVwn\nCdfcWoChxhD/8nnfIL3lZUCAw5hLKoSAKfT2CWmgHxnubR15IvxqpqkGw8PHFjRc\nNRs1wZEfmDQ1tdbN1iw6Db7CDMC1jF2vqfWsMUm0B5+eLHBGkVFWSZcu3OA9OPa0\nUet0sq+nqQKBgQDW9r8d7c6Cnd9minOzxKlqjT22nJRt8mvsJ50aVSt0amNTMZyP\ngB0TzHnSF4yUISNHb8C423QkYR6F8xoyIgcBJ78/U6RSKiW+WdpjHBeiQCXUEEKm\nTzezhGczdlkxnKYbxxPkTabD/siGLSSy+L7Qmi2xaxOJ4zm4mRNTFybIgQKBgQCy\nmN208OPpqbnAaL2LXHl1jD2Orn/kB2sP07EthrXrMT/0OxpOaEoAYuvMxXhn6iGJ\nK2oh4//qJwBuozBkIuEo026WILY8VEVOD1LTLqvlat1kUJ1dtV3YI+MlVfhhbxEn\n4Vj/WmqPGFQaQ08eatvr/GQu8V8pavyFcHwb07K68QKBgQC45Ac/r/C2UzZ6jAJ0\neIDgxkH0Y/MdFsGNp//ZMHopmMoBL3zTzAkf8qJW3TcYxD7WY5C/ZCxUOhRi5paf\njO0Sp4ZfuaVQ4aq/DA1T5QNq0WF54jPiBTQVbDhi7IFNjJs0AytCZ7cAoH7/5FDI\npHqSref2JFeM3bS63cnHkaOCtg==\n-----END PRIVATE KEY-----\n",
      client_email: "firebase-adminsdk-fbsvc@sala-food.iam.gserviceaccount.com",
      client_id: "102509567277449955201",
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40sala-food.iam.gserviceaccount.com",
      universe_domain: "googleapis.com"
    }),
  });
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

async function printReceipt(data) {
  const uid = store.get('uid');
  const userDoc = await admin.firestore().collection('users').doc(uid).get();
  if (!userDoc.exists) throw new Error('Không tìm thấy user!');
  const userData = userDoc.data();
  const printerId = userData.printerId;
  if (!printerId) throw new Error('User chưa cấu hình printerId!');

  const printerDoc = await admin
    .firestore()
    .collection('printers')
    .doc(printerId)
    .get();
  if (!printerDoc.exists) throw new Error('Không tìm thấy máy in!');
  const printerData = printerDoc.data();
  const printerIp = printerData.ip;

  const device = new escpos.Network(printerIp, 9100);
  const printer = new escpos.Printer(device);

  return new Promise((resolve, reject) => {
    device.open(() => {
      try {
        printer
          .encode('GB18030')
          .font('a')
          .style('b')
          .align('ct')
          .text('SALA FOOD')
          .text(`Bàn: ${data.tableNumber || ''}`)
          .text('--------------------------')
          .align('lt')
          .text('Tên món                 Giá         SL');

        (data.foods || data.items).forEach((item) => {
          const name = item.name.padEnd(22, ' ');
          const price = item.price.toLocaleString('vi-VN').padStart(12, ' ');
          const qty = String(item.quantity || item.qty).padStart(8, ' ');
          printer.text(`${name}${price}${qty}`);
        });

        printer
          .text('--------------------------')
          .align('rt')
          .text(
            `Tổng: ${(
              data.total ||
              (data.foods || data.items).reduce(
                (s, f) => s + f.price * (f.quantity || f.qty),
                0
              )
            ).toLocaleString('vi-VN')} VNĐ`
          )
          .text(' ')
          .align('ct')
          .text('NAM MÔ A DI ĐÀ PHẬT')
          .cut()
          .close(resolve);
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
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const docRef = change.doc.ref;
          const data = change.doc.data();
          await docRef.update({ status: PRINT_STATUS.printing });
          try {
            await printReceipt(data);
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

app.on('window-all-closed', (e) => {
  // Không thoát app khi đóng hết cửa sổ (chạy ngầm tray)
  e.preventDefault();
});
