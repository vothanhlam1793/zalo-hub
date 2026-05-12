const statusBadge = document.querySelector('#statusBadge');
const loginHint = document.querySelector('#loginHint');
const qrBox = document.querySelector('#qrBox');
const accountInfo = document.querySelector('#accountInfo');
const friendsMeta = document.querySelector('#friendsMeta');
const friendsList = document.querySelector('#friendsList');
const activeFriendName = document.querySelector('#activeFriendName');
const activeFriendMeta = document.querySelector('#activeFriendMeta');
const messagesList = document.querySelector('#messagesList');
const friendIdInput = document.querySelector('#friendIdInput');
const messageInput = document.querySelector('#messageInput');
const sendResult = document.querySelector('#sendResult');
const logoutBtn = document.querySelector('#logoutBtn');
const sendForm = document.querySelector('#sendForm');

const state = {
  friends: [],
  activeFriendId: '',
  activeFriendName: '',
  messagesByFriendId: new Map(),
  lastMessageTimestampByFriendId: new Map(),
  socket: undefined,
  socketReconnectTimer: undefined,
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Request failed');
  }

  return body;
}

function clearSocketReconnectTimer() {
  if (state.socketReconnectTimer) {
    clearTimeout(state.socketReconnectTimer);
    state.socketReconnectTimer = undefined;
  }
}

function scheduleSocketReconnect() {
  clearSocketReconnectTimer();
  state.socketReconnectTimer = setTimeout(() => {
    connectRealtime();
  }, 1500);
}

function subscribeActiveConversation() {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN || !state.activeFriendId) {
    return;
  }

  state.socket.send(JSON.stringify({ type: 'subscribe', friendId: state.activeFriendId }));
}

function connectRealtime() {
  if (state.socket && (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
  state.socket = socket;

  socket.addEventListener('open', () => {
    clearSocketReconnectTimer();
    subscribeActiveConversation();
  });

  socket.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === 'conversation_message' && payload.message?.friendId) {
        mergeMessages(payload.message.friendId, [payload.message]);
        if (payload.message.friendId === state.activeFriendId) {
          renderMessages(payload.message.friendId);
        }
      }
    } catch {
      // Ignore malformed realtime payloads.
    }
  });

  socket.addEventListener('close', () => {
    if (state.socket === socket) {
      state.socket = undefined;
    }
    scheduleSocketReconnect();
  });

  socket.addEventListener('error', () => {
    socket.close();
  });
}

function renderStatus(status) {
  statusBadge.textContent = status.loggedIn
    ? 'Da dang nhap'
    : status.loginInProgress
      ? 'Dang cho dang nhap'
      : status.hasCredential
        ? 'Da co credential'
        : 'Chua dang nhap';

  loginHint.textContent = `Credential: ${status.hasCredential ? 'co' : 'chua co'} | Session: ${status.sessionActive ? 'active' : 'chua active'} | Dang nhap: ${status.loginInProgress ? 'dang xu ly' : 'khong'} | Friend cache: ${status.friendCacheCount}`;

  const account = status.account || {};
  if (status.loggedIn || account.displayName || account.userId || account.phoneNumber) {
    accountInfo.classList.remove('is-empty');
    accountInfo.innerHTML = `
      <div class="account-line"><span class="account-label">Ten:</span>${account.displayName || 'Chua ro'}</div>
      <div class="account-line"><span class="account-label">User ID:</span>${account.userId || 'Chua ro'}</div>
      <div class="account-line"><span class="account-label">So dien thoai:</span>${account.phoneNumber || 'Khong co / API khong tra ve'}</div>
    `;
  } else {
    accountInfo.classList.add('is-empty');
    accountInfo.textContent = 'Chua co thong tin tai khoan dang nhap.';
  }
}

function renderQr(qrCode) {
  if (!qrCode) {
    qrBox.classList.add('is-empty');
    qrBox.textContent = 'QR chua san sang';
    return;
  }

  qrBox.classList.remove('is-empty');
  qrBox.innerHTML = '';
  const image = document.createElement('img');
  image.alt = 'QR dang nhap Zalo';
  image.src = `data:image/png;base64,${qrCode}`;
  qrBox.appendChild(image);
}

function renderFriends(friends) {
  state.friends = friends;
  friendsMeta.textContent = `Tong so ban be: ${friends.length}`;
  friendsList.innerHTML = '';

  if (friends.length === 0) {
    friendsList.innerHTML = '<div class="hint">Chua co du lieu ban be.</div>';
    return;
  }

  for (const friend of friends) {
    const item = document.createElement('article');
    item.className = 'friend-item';
    if (friend.userId === state.activeFriendId) {
      item.classList.add('is-active');
    }
    item.innerHTML = `
      <div>
        <div class="friend-name">${friend.displayName}</div>
        <div class="friend-id">${friend.userId}</div>
      </div>
      <button type="button">Chon</button>
    `;

    item.querySelector('button').addEventListener('click', () => {
      selectFriend(friend);
    });

    friendsList.appendChild(item);
  }
}

function renderActiveFriend() {
  if (!state.activeFriendId) {
    activeFriendName.textContent = 'Chua chon ai';
    activeFriendMeta.textContent = 'Chon mot friend de bat dau trao doi.';
    return;
  }

  activeFriendName.textContent = state.activeFriendName || state.activeFriendId;
  activeFriendMeta.textContent = state.activeFriendId;
}

function renderMessages(friendId = state.activeFriendId) {
  if (!friendId) {
    messagesList.innerHTML = '<div class="chat-empty">Chon mot friend de mo khung chat.</div>';
    return;
  }

  const messages = state.messagesByFriendId.get(friendId) || [];
  if (messages.length === 0) {
    messagesList.innerHTML = '<div class="chat-empty">Chua co tin nhan trong phien nay. Hay gui mot tin hoac cho tin moi do vao.</div>';
    return;
  }

  messagesList.innerHTML = '';
  for (const message of messages) {
    const item = document.createElement('article');
    item.className = `message-bubble ${message.direction === 'outgoing' ? 'is-outgoing' : 'is-incoming'}`;
    item.innerHTML = `
      <div class="message-content"></div>
      <div class="message-time">${new Date(message.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
    `;
    const content = item.querySelector('.message-content');
    if (message.kind === 'image' && message.imageUrl) {
      const image = document.createElement('img');
      image.className = 'message-image';
      image.src = message.imageUrl;
      image.alt = message.text || 'Hinh anh';
      image.loading = 'lazy';
      content.appendChild(image);

      if (message.text && message.text !== '[Hinh anh]') {
        const caption = document.createElement('div');
        caption.className = 'message-text';
        caption.textContent = message.text;
        content.appendChild(caption);
      }
    } else {
      const textNode = document.createElement('div');
      textNode.className = 'message-text';
      textNode.textContent = message.text;
      content.appendChild(textNode);
    }
    messagesList.appendChild(item);
  }

  messagesList.scrollTop = messagesList.scrollHeight;
}

function mergeMessages(friendId, incomingMessages) {
  const existing = state.messagesByFriendId.get(friendId) || [];
  const seenIds = new Set(existing.map((message) => message.id));
  const merged = [...existing];

  for (const message of incomingMessages) {
    if (seenIds.has(message.id)) {
      continue;
    }

    seenIds.add(message.id);
    merged.push(message);
  }

  merged.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  state.messagesByFriendId.set(friendId, merged);
  if (merged.length > 0) {
    state.lastMessageTimestampByFriendId.set(friendId, merged[merged.length - 1].timestamp);
  }
}

async function loadMessages(friendId, { incremental = false } = {}) {
  if (!friendId) {
    return;
  }

  const since = incremental ? state.lastMessageTimestampByFriendId.get(friendId) : undefined;
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  const body = await request(`/api/conversations/${encodeURIComponent(friendId)}/messages${query}`);
  mergeMessages(friendId, body.messages || []);
  if (friendId === state.activeFriendId) {
    renderMessages(friendId);
  }
}

async function selectFriend(friend) {
  state.activeFriendId = friend.userId;
  state.activeFriendName = friend.displayName;
  friendIdInput.value = friend.userId;
  renderFriends(state.friends);
  renderActiveFriend();
  await loadMessages(friend.userId);
  renderMessages(friend.userId);
  subscribeActiveConversation();
  messageInput.focus();
}

async function refreshStatus() {
  const status = await request('/api/status');
  renderStatus(status);
  return status;
}

let loginPoller;

function stopLoginPolling() {
  if (loginPoller) {
    clearInterval(loginPoller);
    loginPoller = undefined;
  }
}

function startLoginPolling() {
  stopLoginPolling();
  loginPoller = setInterval(async () => {
    try {
      const status = await refreshStatus();
      await refreshQr();
      if (status.loggedIn) {
        stopLoginPolling();
        sendResult.textContent = 'Dang nhap thanh cong. Bay gio ban co the tai danh sach ban be hoac gui tin nhan.';
      }
    } catch {
      // Keep polling quietly while login is in progress.
    }
  }, 1500);
}

async function refreshQr() {
  try {
    const body = await request('/api/login/qr');
    renderQr(body.qrCode);
  } catch {
    renderQr('');
  }
}

async function refreshFriends(refresh = false) {
  const body = await request(`/api/friends${refresh ? '?refresh=1' : ''}`);
  renderFriends(body.friends || []);
  await refreshStatus();
}

document.querySelector('#refreshStatusBtn').addEventListener('click', async () => {
  await refreshStatus();
});

logoutBtn.addEventListener('click', async () => {
  try {
    stopLoginPolling();
    await request('/api/logout', { method: 'POST', body: '{}' });
    renderQr('');
    renderFriends([]);
    state.friends = [];
    state.activeFriendId = '';
    state.activeFriendName = '';
    state.messagesByFriendId.clear();
    state.lastMessageTimestampByFriendId.clear();
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({ type: 'unsubscribe' }));
    }
    renderActiveFriend();
    renderMessages();
    friendIdInput.value = '';
    messageInput.value = '';
    sendResult.textContent = 'Da dang xuat va xoa credential local.';
    await refreshStatus();
  } catch (error) {
    sendResult.textContent = error instanceof Error ? error.message : 'Dang xuat that bai';
  }
});

document.querySelector('#startLoginBtn').addEventListener('click', async () => {
  sendResult.textContent = 'Dang tao QR dang nhap...';
  await request('/api/login/start', { method: 'POST', body: '{}' });
  await refreshQr();
  await refreshStatus();
  startLoginPolling();
  sendResult.textContent = 'QR da san sang. Quet QR tren dien thoai, sau do bam Tai lai friends.';
});

document.querySelector('#refreshFriendsBtn').addEventListener('click', async () => {
  try {
    await refreshFriends(true);
    sendResult.textContent = 'Da tai lai danh sach ban be.';
  } catch (error) {
    sendResult.textContent = error instanceof Error ? error.message : 'Tai friends that bai';
  }
});

sendForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    if (!state.activeFriendId) {
      throw new Error('Hay chon mot friend truoc khi gui tin');
    }

    const text = messageInput.value.trim();
    if (!text) {
      throw new Error('Noi dung tin nhan la bat buoc');
    }

    await request('/api/send', {
      method: 'POST',
      body: JSON.stringify({
        friendId: state.activeFriendId,
        text,
      }),
    });
    messageInput.value = '';
    await loadMessages(state.activeFriendId, { incremental: false });
    sendResult.textContent = `Da gui tin cho ${state.activeFriendName || state.activeFriendId}`;
  } catch (error) {
    sendResult.textContent = error instanceof Error ? error.message : 'Gui tin that bai';
  }
});

messageInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') {
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    return;
  }

  event.preventDefault();
  sendForm.requestSubmit();
});

await refreshStatus();
await refreshQr();
await refreshFriends(false).catch(() => {
  friendsMeta.textContent = 'Chua the tai friends. Dang nhap truoc.';
});
renderActiveFriend();
renderMessages();
connectRealtime();
