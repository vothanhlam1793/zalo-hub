const state = {
  workspaces: [],
  users: [],
  channels: [],
  contacts: [],
  conversations: [],
  messages: [],
  selectedWorkspaceId: null,
  selectedChannelId: null,
  selectedConversationId: null,
  statusPollTimer: null,
};

const elements = {
  userList: document.getElementById('user-list'),
  channelList: document.getElementById('channel-list'),
  contactList: document.getElementById('contact-list'),
  conversationList: document.getElementById('conversation-list'),
  messageList: document.getElementById('message-list'),
  chatHeader: document.getElementById('chat-header'),
  channelDetail: document.getElementById('channel-detail'),
  createChannelButton: document.getElementById('create-channel-button'),
  createConversationButton: document.getElementById('create-conversation-button'),
  channelLoginButton: document.getElementById('channel-login-button'),
  channelSyncButton: document.getElementById('channel-sync-button'),
  qrBlock: document.getElementById('qr-block'),
  qrImage: document.getElementById('qr-image'),
  qrStatus: document.getElementById('qr-status'),
  messageForm: document.getElementById('message-form'),
  messageInput: document.getElementById('message-input'),
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

function selectedConversation() {
  return state.conversations.find((item) => item.id === state.selectedConversationId) ?? null;
}

function selectedChannel() {
  return state.channels.find((item) => item.id === state.selectedChannelId) ?? null;
}

function channelStatusLabel(status) {
  if (status === 'qr_pending') return 'Dang cho quet QR';
  if (status === 'connected') return 'Da ket noi';
  if (status === 'error') return 'Loi dang nhap';
  if (status === 'disabled') return 'Da vo hieu hoa';
  return 'Can dang nhap';
}

function renderUsers() {
  elements.userList.innerHTML = '';
  for (const user of state.users) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-title">${user.displayName}</div>
      <div class="card-subtitle">${user.email}</div>
      <div class="status-pill">${user.status}</div>
    `;
    elements.userList.appendChild(card);
  }
}

function renderChannels() {
  elements.channelList.innerHTML = '';
  for (const channel of state.channels) {
    const card = document.createElement('button');
    card.className = `card ${channel.id === state.selectedChannelId ? 'active' : ''}`;
    card.innerHTML = `
      <div class="card-title">${channel.name}</div>
      <div class="card-subtitle">Provider: ${channel.provider}</div>
      <div class="status-pill">${channelStatusLabel(channel.status)}</div>
    `;
    card.addEventListener('click', async () => {
      state.selectedChannelId = channel.id;
      state.selectedConversationId = null;
      await refreshConversations();
    });
    elements.channelList.appendChild(card);
  }
}

function renderConversations() {
  elements.conversationList.innerHTML = '';
  if (state.conversations.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.innerHTML = '<div class="card-subtitle">Chua co hoi thoai nao trong channel nay.</div>';
    elements.conversationList.appendChild(empty);
    return;
  }

  for (const conversation of state.conversations) {
    const card = document.createElement('button');
    card.className = `card ${conversation.id === state.selectedConversationId ? 'active' : ''}`;
    card.innerHTML = `
      <div class="card-title">${conversation.title}</div>
      <div class="card-subtitle">Trang thai: ${conversation.status}</div>
      <div class="card-subtitle">Cap nhat: ${new Date(conversation.updatedAt).toLocaleString()}</div>
    `;
    card.addEventListener('click', async () => {
      state.selectedConversationId = conversation.id;
      await refreshMessages();
      renderConversations();
    });
    elements.conversationList.appendChild(card);
  }
}

function renderContacts() {
  elements.contactList.innerHTML = '';
  if (state.contacts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.innerHTML = '<div class="card-subtitle">Chua co contact nao trong channel nay. Hay dang nhap va Sync Contacts.</div>';
    elements.contactList.appendChild(empty);
    return;
  }

  for (const contact of state.contacts) {
    const card = document.createElement('button');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-title">${contact.displayName}</div>
      <div class="card-subtitle">${contact.externalContactId}</div>
    `;
    card.addEventListener('click', async () => {
      const result = await api('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ channelId: state.selectedChannelId, contactId: contact.id }),
      });
      state.selectedConversationId = result.conversation.id;
      await refreshConversations();
    });
    elements.contactList.appendChild(card);
  }
}

function renderChannelDetail() {
  const channel = selectedChannel();
  if (!channel) {
    elements.channelDetail.innerHTML = '<div class="card-subtitle">Chua co channel nao duoc chon.</div>';
    elements.qrBlock.classList.add('hidden');
    elements.qrImage.removeAttribute('src');
    return;
  }

  elements.channelDetail.innerHTML = `
    <div class="card">
      <div class="card-title">${channel.name}</div>
      <div class="card-subtitle">Provider: ${channel.provider}</div>
      <div class="card-subtitle">Status: ${channelStatusLabel(channel.status)}</div>
      <div class="card-subtitle">Updated: ${new Date(channel.updatedAt).toLocaleString()}</div>
      ${channel.lastError ? `<div class="card-subtitle">Error: ${channel.lastError}</div>` : ''}
    </div>
  `;

  elements.channelLoginButton.textContent = channel.status === 'connected' ? 'Da dang nhap' : channel.status === 'qr_pending' ? 'Dang cho quet QR' : 'Dang nhap Zalo';
  elements.channelLoginButton.disabled = channel.status === 'connected' || channel.status === 'qr_pending';

  if (channel.qrCode && channel.status === 'qr_pending') {
    elements.qrBlock.classList.remove('hidden');
    elements.qrImage.src = `data:image/png;base64,${channel.qrCode}`;
    elements.qrStatus.textContent = 'Dang cho quet QR mock de khoa UX truoc khi noi Zalo that.';
  } else if (channel.status === 'connected') {
    elements.qrBlock.classList.remove('hidden');
    elements.qrImage.removeAttribute('src');
    elements.qrStatus.textContent = 'Dang nhap thanh cong. Server se tu duy tri ket noi.';
  } else if (channel.status === 'error') {
    elements.qrBlock.classList.remove('hidden');
    elements.qrImage.removeAttribute('src');
    elements.qrStatus.textContent = channel.lastError || 'Dang nhap that bai. Hay thu dang nhap lai.';
  } else {
    elements.qrBlock.classList.remove('hidden');
    elements.qrImage.removeAttribute('src');
    elements.qrStatus.textContent = 'Channel moi da duoc tao. Bam Dang nhap Zalo de lay QR va ket noi.';
  }
}

function stopStatusPolling() {
  if (state.statusPollTimer) {
    clearInterval(state.statusPollTimer);
    state.statusPollTimer = null;
  }
}

async function pollSelectedChannelUntilSettled() {
  stopStatusPolling();

  state.statusPollTimer = setInterval(async () => {
    if (!state.selectedChannelId) {
      stopStatusPolling();
      return;
    }

    try {
      const channel = await api(`/api/channels/${state.selectedChannelId}`);
      const index = state.channels.findIndex((item) => item.id === channel.id);
      if (index >= 0) {
        state.channels[index] = channel;
      }
      renderChannels();
      renderChannelDetail();

      if (channel.status === 'connected' || channel.status === 'error' || channel.status === 'active') {
        stopStatusPolling();
        if (channel.status === 'connected') {
          try {
            await api(`/api/channels/${channel.id}/sync-contacts`, { method: 'POST' });
            await refreshConversations();
          } catch {
            // Keep success signal for login even if contact sync is not available yet.
          }
          window.alert('Dang nhap Zalo thanh cong');
        }
      }
    } catch {
      stopStatusPolling();
    }
  }, 2000);
}

function renderMessages() {
  elements.messageList.innerHTML = '';
  const conversation = selectedConversation();
  elements.chatHeader.innerHTML = `
    <div>
      <div class="eyebrow">Chat Window</div>
      <h2>${conversation ? conversation.title : 'Chon mot hoi thoai'}</h2>
      <div class="card-subtitle">${conversation ? 'Dang test local chat domain truoc khi noi provider that.' : 'Chua co hoi thoai duoc chon.'}</div>
    </div>
  `;

  if (state.messages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'message-bubble inbound';
    empty.innerHTML = '<div class="card-subtitle">Chua co tin nhan nao.</div>';
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

async function refreshWorkspaces() {
  state.workspaces = await api('/api/workspaces');
  state.selectedWorkspaceId = state.workspaces[0]?.id ?? null;
}

async function refreshUsers() {
  if (!state.selectedWorkspaceId) {
    state.users = [];
    renderUsers();
    return;
  }
  state.users = await api(`/api/users?workspaceId=${state.selectedWorkspaceId}`);
  renderUsers();
}

async function refreshChannels() {
  if (!state.selectedWorkspaceId) {
    state.channels = [];
    renderChannels();
    return;
  }
  state.channels = await api(`/api/channels?workspaceId=${state.selectedWorkspaceId}`);
  if (!state.selectedChannelId || !state.channels.some((item) => item.id === state.selectedChannelId)) {
    state.selectedChannelId = state.channels[0]?.id ?? null;
  }
  renderChannels();
  renderChannelDetail();
}

async function refreshConversations() {
  if (!state.selectedChannelId) {
    state.contacts = [];
    state.conversations = [];
    state.selectedConversationId = null;
    renderContacts();
    renderConversations();
    renderMessages();
    return;
  }
  state.contacts = await api(`/api/contacts?channelId=${state.selectedChannelId}`);
  state.conversations = await api(`/api/conversations?channelId=${state.selectedChannelId}`);
  if (!state.selectedConversationId || !state.conversations.some((item) => item.id === state.selectedConversationId)) {
    state.selectedConversationId = state.conversations[0]?.id ?? null;
  }
  renderContacts();
  renderConversations();
  await refreshMessages();
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

elements.createChannelButton.addEventListener('click', async () => {
  if (!state.selectedWorkspaceId) return;
  const name = window.prompt('Ten channel logic moi');
  if (!name) return;
  const channel = await api('/api/channels', {
    method: 'POST',
    body: JSON.stringify({ workspaceId: state.selectedWorkspaceId, name }),
  });
  state.selectedChannelId = channel.id;
  await refreshChannels();
  await refreshConversations();
  window.alert('Tao channel thanh cong. Tiep theo hay bam Dang nhap Zalo de lay QR.');
});

elements.createConversationButton.addEventListener('click', async () => {
  if (!state.selectedChannelId) return;
  const contactName = window.prompt('Ten contact local moi');
  if (!contactName) return;
  const result = await api('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ channelId: state.selectedChannelId, contactName }),
  });
  state.selectedConversationId = result.conversation.id;
  await refreshConversations();
});

elements.channelLoginButton.addEventListener('click', async () => {
  if (!state.selectedChannelId) return;
  await api(`/api/channels/${state.selectedChannelId}/qr-login`, { method: 'POST' });
  await refreshChannels();
  await pollSelectedChannelUntilSettled();
});

elements.channelSyncButton.addEventListener('click', async () => {
  if (!state.selectedChannelId) return;
  const channel = selectedChannel();
  if (!channel || channel.status !== 'connected') {
    window.alert('Channel chua connected. Hay dang nhap Zalo thanh cong truoc khi dong bo contact.');
    return;
  }
  const result = await api(`/api/channels/${state.selectedChannelId}/sync-contacts`, { method: 'POST' });
  await refreshChannels();
  await refreshConversations();
  const count = Array.isArray(result.contacts) ? result.contacts.length : 0;
  window.alert(`Dong bo contact xong: ${count}`);
});

elements.messageForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.selectedWorkspaceId || !state.selectedChannelId || !state.selectedConversationId || state.users.length === 0) return;

  const text = elements.messageInput.value.trim();
  if (!text) return;

  const sender = state.users[0];
  await api('/api/messages', {
    method: 'POST',
    body: JSON.stringify({
      workspaceId: state.selectedWorkspaceId,
      channelId: state.selectedChannelId,
      conversationId: state.selectedConversationId,
      senderType: 'workspace_user',
      senderRefId: sender.id,
      senderName: sender.displayName,
      text,
    }),
  });

  elements.messageInput.value = '';
  await refreshMessages();
  await refreshConversations();
});

await refreshWorkspaces();
await refreshUsers();
await refreshChannels();
await refreshConversations();
