const state = {
  accounts: [],
  conversations: [],
  messages: [],
  friends: [],
  selectedAccountId: null,
  selectedConversationId: null,
  qrPollingTimer: null,
  toastTimer: null,
};

const elements = {
  accountList: document.getElementById('account-list'),
  accountSummary: document.getElementById('account-summary'),
  conversationList: document.getElementById('conversation-list'),
  friendList: document.getElementById('friend-list'),
  messageList: document.getElementById('message-list'),
  chatHeader: document.getElementById('chat-header'),
  addAccountButton: document.getElementById('add-account-button'),
  qrLoginButton: document.getElementById('qr-login-button'),
  syncFriendsButton: document.getElementById('sync-friends-button'),
  newConversationButton: document.getElementById('new-conversation-button'),
  messageForm: document.getElementById('message-form'),
  messageInput: document.getElementById('message-input'),
  agentEnabled: document.getElementById('agent-enabled'),
  agentPrompt: document.getElementById('agent-prompt'),
  saveAgentButton: document.getElementById('save-agent-button'),
  qrBlock: document.getElementById('qr-block'),
  qrImage: document.getElementById('qr-image'),
  qrStatus: document.getElementById('qr-status'),
  toast: document.getElementById('toast'),
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }

  return response.json();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden');

  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
  }

  state.toastTimer = setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 2600);
}

function getSelectedAccount() {
  return state.accounts.find((account) => account.id === state.selectedAccountId) ?? null;
}

function getSelectedConversation() {
  return state.conversations.find((item) => item.id === state.selectedConversationId) ?? null;
}

function renderAccountSummary() {
  const connectedCount = state.accounts.filter((item) => item.status === 'connected').length;
  const pendingCount = state.accounts.filter((item) => item.status === 'qr_pending').length;

  elements.accountSummary.innerHTML = `
    <div class="summary-label">Workspace</div>
    <div class="summary-grid">
      <div class="summary-metric">
        <div class="summary-value">${state.accounts.length}</div>
        <div class="summary-label">Accounts</div>
      </div>
      <div class="summary-metric">
        <div class="summary-value">${connectedCount}</div>
        <div class="summary-label">Connected</div>
      </div>
      <div class="summary-metric">
        <div class="summary-value">${state.friends.length}</div>
        <div class="summary-label">Friends</div>
      </div>
      <div class="summary-metric">
        <div class="summary-value">${pendingCount}</div>
        <div class="summary-label">QR Pending</div>
      </div>
    </div>
  `;
}

function renderAccounts() {
  elements.accountList.innerHTML = '';

  for (const account of state.accounts) {
    const card = document.createElement('button');
    card.className = `card ${account.id === state.selectedAccountId ? 'active' : ''}`;
    const statusClass = String(account.status || '').replace(/[^a-z_]/g, '');
    const subtitle = account.status === 'connected'
      ? 'Dang ket noi va san sang chat'
      : account.status === 'qr_pending'
        ? 'Dang cho quet QR'
        : account.lastError || 'Chua dang nhap';

    card.innerHTML = `
      <div class="card-title">${account.name}</div>
      <div class="card-subtitle">${subtitle}</div>
      <div class="status-pill ${statusClass}">${account.status}</div>
    `;

    card.addEventListener('click', async () => {
      state.selectedAccountId = account.id;
      state.selectedConversationId = null;
      await hydrateSelectedAccount();
    });

    elements.accountList.appendChild(card);
  }

  renderAccountSummary();
}

function renderFriends() {
  elements.friendList.innerHTML = '';

  if (state.friends.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.innerHTML = '<div class="card-subtitle">Chua co ban be duoc dong bo. Bam `Sync Ban be` sau khi account connected.</div>';
    elements.friendList.appendChild(empty);
    return;
  }

  for (const friend of state.friends) {
    const card = document.createElement('button');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-title">${friend.displayName}</div>
      <div class="card-subtitle">${friend.status || friend.phoneNumber || friend.userId}</div>
    `;

    card.addEventListener('click', async () => {
      const conversation = await api('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ accountId: state.selectedAccountId, userId: friend.userId }),
      });
      state.selectedConversationId = conversation.id;
      await refreshConversations();
      await refreshMessages();
      showToast(`Da mo chat voi ${friend.displayName}`);
    });

    elements.friendList.appendChild(card);
  }
}

function renderConversations() {
  elements.conversationList.innerHTML = '';

  if (state.conversations.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.innerHTML = '<div class="card-subtitle">Chua co hoi thoai nao. Hay tao chat local hoac chon mot ban be.</div>';
    elements.conversationList.appendChild(empty);
    return;
  }

  for (const conversation of state.conversations) {
    const card = document.createElement('button');
    card.className = `card ${conversation.id === state.selectedConversationId ? 'active' : ''}`;
    card.innerHTML = `
      <div class="card-title">${conversation.title}</div>
      <div class="card-subtitle">${conversation.subtitle || conversation.threadType}</div>
      <div class="card-subtitle">${new Date(conversation.updatedAt).toLocaleString()}</div>
    `;
    card.addEventListener('click', async () => {
      state.selectedConversationId = conversation.id;
      await refreshMessages();
      renderConversations();
    });
    elements.conversationList.appendChild(card);
  }
}

function renderMessages() {
  elements.messageList.innerHTML = '';
  const conversation = getSelectedConversation();

  elements.chatHeader.innerHTML = `
    <div>
      <div class="eyebrow">Chat Window</div>
      <h2>${conversation ? conversation.title : 'Chon mot hoi thoai'}</h2>
      <div class="card-subtitle">${conversation?.subtitle || 'Nhan tin Zalo trong mot cua so chat don gian.'}</div>
    </div>
  `;

  if (state.messages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'message-bubble in';
    empty.innerHTML = '<div class="card-subtitle">Chua co tin nhan. Ban co the gui mot tin dau tien ngay bay gio.</div>';
    elements.messageList.appendChild(empty);
    return;
  }

  for (const message of state.messages) {
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${message.direction}`;
    bubble.innerHTML = `
      <div class="card-subtitle">${message.senderName}</div>
      <div>${message.text}</div>
      <div class="card-subtitle">${new Date(message.createdAt).toLocaleString()}</div>
    `;
    elements.messageList.appendChild(bubble);
  }

  elements.messageList.scrollTop = elements.messageList.scrollHeight;
}

async function refreshAccounts() {
  state.accounts = await api('/api/accounts');

  if (!state.selectedAccountId && state.accounts.length > 0) {
    state.selectedAccountId = state.accounts[0].id;
  }

  if (state.selectedAccountId && !state.accounts.some((item) => item.id === state.selectedAccountId)) {
    state.selectedAccountId = state.accounts[0]?.id ?? null;
  }

  renderAccounts();
}

async function refreshConversations() {
  if (!state.selectedAccountId) {
    state.conversations = [];
    renderConversations();
    return;
  }

  state.conversations = await api(`/api/conversations?accountId=${state.selectedAccountId}`);
  if (!state.selectedConversationId || !state.conversations.some((item) => item.id === state.selectedConversationId)) {
    state.selectedConversationId = state.conversations[0]?.id ?? null;
  }

  renderConversations();
  await refreshMessages();
}

async function refreshFriends() {
  if (!state.selectedAccountId) {
    state.friends = [];
    renderFriends();
    renderAccountSummary();
    return;
  }

  state.friends = await api(`/api/accounts/${state.selectedAccountId}/friends`);
  renderFriends();
  renderAccountSummary();
}

async function refreshMessages() {
  if (!state.selectedConversationId) {
    state.messages = [];
    renderMessages();
    return;
  }

  state.messages = await api(`/api/conversations/${state.selectedConversationId}/messages`);
  renderMessages();
}

async function loadAgent() {
  if (!state.selectedAccountId) return;
  const workspace = await api(`/api/agents/${state.selectedAccountId}`);
  elements.agentEnabled.checked = workspace.enabled;
  elements.agentPrompt.value = workspace.systemPrompt;
}

function stopQrPolling() {
  if (state.qrPollingTimer) {
    clearInterval(state.qrPollingTimer);
    state.qrPollingTimer = null;
  }
}

function syncQrBlockForSelectedAccount() {
  const account = getSelectedAccount();

  if (!account || (!account.qrCode && account.status !== 'qr_pending')) {
    elements.qrBlock.classList.add('hidden');
    elements.qrImage.removeAttribute('src');
    return;
  }

  elements.qrBlock.classList.remove('hidden');
  if (account.qrCode) {
    elements.qrImage.src = `data:image/png;base64,${account.qrCode}`;
  }

  if (account.status === 'connected') {
    elements.qrStatus.textContent = 'Dang nhap thanh cong.';
  } else if (account.status === 'error') {
    elements.qrStatus.textContent = account.lastError || 'Dang nhap that bai';
  } else {
    elements.qrStatus.textContent = 'Scan ma QR bang Zalo tren dien thoai.';
  }
}

async function hydrateSelectedAccount() {
  await refreshAccounts();
  await refreshFriends();
  await refreshConversations();
  await loadAgent();
  syncQrBlockForSelectedAccount();
}

async function pollAccountUntilSettled() {
  stopQrPolling();

  state.qrPollingTimer = setInterval(async () => {
    if (!state.selectedAccountId) {
      stopQrPolling();
      return;
    }

    const account = await api(`/api/accounts/${state.selectedAccountId}`);
    const existing = state.accounts.findIndex((item) => item.id === account.id);
    if (existing >= 0) {
      state.accounts[existing] = account;
    }

    renderAccounts();
    syncQrBlockForSelectedAccount();

    if (account.status === 'connected') {
      stopQrPolling();
      await hydrateSelectedAccount();
      showToast('Dang nhap Zalo thanh cong');
    }

    if (account.status === 'error' && account.lastError) {
      stopQrPolling();
      syncQrBlockForSelectedAccount();
    }
  }, 2000);
}

async function startQrLogin() {
  if (!state.selectedAccountId) {
    window.alert('Hay chon account truoc');
    return;
  }

  elements.qrBlock.classList.remove('hidden');
  elements.qrStatus.textContent = 'Dang tao ma QR...';

  const result = await api(`/api/accounts/${state.selectedAccountId}/qr-login`, { method: 'POST' });
  if (result.qrCode) {
    elements.qrImage.src = `data:image/png;base64,${result.qrCode}`;
    elements.qrStatus.textContent = 'Scan ma QR bang Zalo tren dien thoai va xac nhan tren app.';
  }

  await refreshAccounts();
  syncQrBlockForSelectedAccount();
  await pollAccountUntilSettled();
}

elements.addAccountButton.addEventListener('click', async () => {
  const name = window.prompt('Ten tai khoan Zalo trong MyChat');
  if (!name) return;

  const account = await api('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

  state.selectedAccountId = account.id;
  await hydrateSelectedAccount();
  showToast(`Da tao account ${account.name}`);
});

elements.qrLoginButton.addEventListener('click', async () => {
  try {
    await startQrLogin();
  } catch (error) {
    window.alert(error.message || 'Khong the tao QR login');
  }
});

elements.syncFriendsButton.addEventListener('click', async () => {
  if (!state.selectedAccountId) return;
  await api(`/api/accounts/${state.selectedAccountId}/sync-friends`, { method: 'POST' });
  await refreshFriends();
  await refreshConversations();
  showToast('Da dong bo danh sach ban be');
});

elements.newConversationButton.addEventListener('click', async () => {
  if (!state.selectedAccountId) return;
  const title = window.prompt('Ten cuoc chat local');
  if (!title) return;
  await api('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ accountId: state.selectedAccountId, title }),
  });
  await refreshConversations();
});

elements.messageForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.selectedAccountId || !state.selectedConversationId) return;

  const text = elements.messageInput.value.trim();
  if (!text) return;

  await api('/api/messages', {
    method: 'POST',
    body: JSON.stringify({
      accountId: state.selectedAccountId,
      conversationId: state.selectedConversationId,
      text,
    }),
  });

  elements.messageInput.value = '';
  await refreshMessages();
  await refreshConversations();
});

elements.saveAgentButton.addEventListener('click', async () => {
  if (!state.selectedAccountId) return;
  await api(`/api/agents/${state.selectedAccountId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      enabled: elements.agentEnabled.checked,
      systemPrompt: elements.agentPrompt.value,
    }),
  });
  showToast('Da luu Agent config');
});

await hydrateSelectedAccount();
