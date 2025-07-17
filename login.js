const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');

const clientAccountPath = path.join(process.resourcesPath, 'firebase-client-account.json');
const firebaseConfig = JSON.parse(fs.readFileSync(clientAccountPath, 'utf8'));
firebase.initializeApp(firebaseConfig);

const loginBtn = document.getElementById('loginBtn');
const errorDiv = document.getElementById('error');

document.getElementById('loginForm').addEventListener('submit', function (e) {
  e.preventDefault();
  loginBtn.disabled = true;
  errorDiv.textContent = '';
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  firebase
    .auth()
    .signInWithEmailAndPassword(email, password)
    .then(userCredential => {
      const uid = userCredential.user.uid;
      ipcRenderer.send('login-success', uid);
    })
    .catch(error => {
      errorDiv.textContent = error.message;
    })
    .finally(() => {
      loginBtn.disabled = false;
    });
});
