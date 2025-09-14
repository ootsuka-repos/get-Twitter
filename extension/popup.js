const q = (sel) => document.querySelector(sel);

async function activeTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]?.id);
    });
  });
}

async function sendToActive(msg) {
  const id = await activeTabId();
  if (!id) throw new Error('No active tab');
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(id, msg, (res) => resolve(res));
  });
}

async function refreshStatus() {
  try {
    const res = await sendToActive({ type: 'X_SCRAPER_STATUS' });
    if (!res?.ok) throw new Error('No response');
    const s = q('#status');
    const when = res.lastAddedAt ? new Date(res.lastAddedAt).toLocaleTimeString() : '-';
    s.textContent = `プロフィール: ${res.profile || '-'} / 収集数: ${res.count} / 実行中: ${res.collecting ? 'はい' : 'いいえ'} / 最終追加: ${when}`;
  } catch (e) {
    q('#status').textContent = '現在のタブでXのプロフィールを開いてください。';
  }
}

async function start() {
  const maxTweets = Number(q('#maxTweets').value) || 500;
  const throttleMs = Number(q('#throttleMs').value) || 900;
  const onlyOwner = q('#onlyOwner').checked;
  await sendToActive({ type: 'X_SCRAPER_START', maxTweets, throttleMs, onlyOwner });
  await refreshStatus();
}

async function stop() {
  await sendToActive({ type: 'X_SCRAPER_STOP' });
  await refreshStatus();
}

async function clearAll() {
  await sendToActive({ type: 'X_SCRAPER_CLEAR' });
  await refreshStatus();
}

async function exportCSV() {
  const res = await sendToActive({ type: 'X_SCRAPER_EXPORT' });
  if (res?.ok) {
    q('#status').textContent = `CSVダウンロード: ${res.count}件`;
  }
}

q('#startBtn').addEventListener('click', start);
q('#stopBtn').addEventListener('click', stop);
q('#clearBtn').addEventListener('click', clearAll);
q('#exportBtn').addEventListener('click', exportCSV);

refreshStatus();
const statusTimer = setInterval(refreshStatus, 1500);
window.addEventListener('unload', () => clearInterval(statusTimer));

