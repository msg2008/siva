// ─── State ────────────────────────────────────────────────────────────────
let token = localStorage.getItem('wa_token') || null;
let currentUser = null;
let socket = null;
let activeChatId = null;
let activeChatData = null;
let replyToMessage = null;
let typingTimer = null;
let pendingUploadType = null;
let allChats = [];
let allMessages = {};
let selectedGroupMembers = [];
let statusBgColor = '#128C7E';
let msgPage = 1;
let loadingMessages = false;

const EMOJIS = ['😀','😁','😂','🤣','😊','😇','🙂','🙃','😉','😍','🥰','😘','😗','😙','😚','😋','😛','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾','👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💅','🤳','💪','🦾','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁','👅','👄','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☯️','🙏','💯','🎉','🎊','🎈','🎁','🎀','🎗','🎟','🎫','🏆','🥇','🥈','🥉','🏅','🎖','🎪','🤹','🎭','🎨','🎬','🎤','🎧','🎼','🎵','🎶','🎙','📱','💻','🖥','⌨️','🖱','🖨','📷','📸','📹','🎥','📽','🎞','📞','📟','📠','📺','📻','🧭','⏱','⏰','🕰','⌚','📡','🔋','🔌','💡','🔦','🕯','🧯','🛢','💸','💵','💴','💶','💷','💰','💳','💎','⚖️','🧲','🔧','🔨','⚙️','🔩','🗜','🔗','⛓','🧰','🔑','🗝','🪝','🪜','🧲'];

// ─── Init ─────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  buildEmojiPicker();
  if (token) {
    fetchMe().then(ok => { if (ok) initApp(); else showAuth(); });
  } else {
    showAuth();
  }
  document.addEventListener('click', closeDropdowns);
});

function showAuth() {
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('appScreen').classList.add('hidden');
}

function showApp() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
}

async function fetchMe() {
  try {
    const res = await api('/api/auth/me');
    if (res.ok) { currentUser = await res.json(); return true; }
    return false;
  } catch { return false; }
}

async function initApp() {
  showApp();
  updateMyAvatar();
  initSocket();
  loadChats();
  loadStatuses();
  loadContacts();
  requestNotificationPermission();
}

// ─── Auth ─────────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t,i) => t.classList.toggle('active', (i===0&&tab==='login')||(i===1&&tab==='register')));
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
  hideAuthError();
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg; el.classList.remove('hidden');
}
function hideAuthError() { document.getElementById('authError').classList.add('hidden'); }

async function login() {
  const phone = document.getElementById('loginPhone').value.trim();
  const pass = document.getElementById('loginPass').value;
  if (!phone || !pass) { showAuthError('Please fill all fields'); return; }
  const res = await api('/api/auth/login', 'POST', { phone, password: pass });
  const data = await res.json();
  if (res.ok) {
    token = data.token; currentUser = data.user;
    localStorage.setItem('wa_token', token);
    hideAuthError(); initApp();
  } else { showAuthError(data.error || 'Login failed'); }
}

async function register() {
  const name = document.getElementById('regName').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const pass = document.getElementById('regPass').value;
  if (!name || !phone || !pass) { showAuthError('Please fill all fields'); return; }
  if (pass.length < 6) { showAuthError('Password min 6 characters'); return; }
  const res = await api('/api/auth/register', 'POST', { name, phone, password: pass });
  const data = await res.json();
  if (res.ok) {
    token = data.token; currentUser = data.user;
    localStorage.setItem('wa_token', token);
    hideAuthError(); initApp();
  } else { showAuthError(data.error || 'Registration failed'); }
}

function logout() {
  token = null; currentUser = null;
  localStorage.removeItem('wa_token');
  if (socket) socket.disconnect();
  location.reload();
}

function togglePass(id, el) {
  const inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  el.classList.toggle('fa-eye'); el.classList.toggle('fa-eye-slash');
}

// ─── Socket ───────────────────────────────────────────────────────────────
function initSocket() {
  socket = io(window.location.origin, { query: { token }, transports: ['websocket', 'polling'] });
  socket.on('connect', () => socket.emit('authenticate', { token }));
  socket.on('authenticated', () => console.log('✅ Socket authenticated'));
  socket.on('new_message', onNewMessage);
  socket.on('message_deleted', onMessageDeleted);
  socket.on('message_read', onMessageRead);
  socket.on('chat_read', onChatRead);
  socket.on('typing', onTyping);
  socket.on('stop_typing', onStopTyping);
  socket.on('user_online', ({ user_id }) => updateUserStatus(user_id, true));
  socket.on('user_offline', ({ user_id, last_seen }) => updateUserStatus(user_id, false, last_seen));
}

function onNewMessage(msg) {
  // Update chat list
  updateChatLastMessage(msg);
  if (msg.chat_id === activeChatId) {
    appendMessage(msg);
    scrollToBottom();
    // Mark read
    socket.emit('message_read', { token, message_id: msg.id });
  } else if (msg.sender_id !== currentUser.id) {
    playNotificationSound();
    incrementUnread(msg.chat_id);
    showBrowserNotification(msg);
    // Fallback in-app toast notification
    const chat = allChats.find(c => c.id === msg.chat_id);
    if (chat) showToast(`New message from ${chat.name}`);
  }
}

function onMessageDeleted({ message_id, chat_id }) {
  const el = document.querySelector(`[data-msg-id="${message_id}"]`);
  if (el) {
    el.querySelector('.message-text').textContent = 'This message was deleted';
    el.querySelector('.message-text').classList.add('deleted');
  }
}

function onMessageRead({ message_id, user_id, chat_id }) {
  if (chat_id === activeChatId && user_id !== currentUser.id) {
    const ticks = document.querySelector(`[data-msg-id="${message_id}"] .message-ticks`);
    if (ticks) ticks.classList.add('read');
  }
}

function onChatRead({ chat_id, user_id }) {
  if (chat_id === activeChatId && user_id !== currentUser.id) {
    document.querySelectorAll('.message-ticks').forEach(el => el.classList.add('read'));
  }
}

function onTyping({ user_id, name, chat_id }) {
  if (chat_id !== activeChatId || user_id === currentUser.id) return;
  const ind = document.getElementById('typingIndicator');
  ind.classList.remove('hidden');
  let tn = document.querySelector('.typing-name');
  if (!tn) { tn = document.createElement('div'); tn.className = 'typing-name'; ind.before(tn); }
  if (activeChatData?.is_group) tn.textContent = `${name} is typing...`;
  else tn.textContent = '';
  scrollToBottom();
}

function onStopTyping({ user_id, chat_id }) {
  if (chat_id !== activeChatId) return;
  document.getElementById('typingIndicator').classList.add('hidden');
  const tn = document.querySelector('.typing-name');
  if (tn) tn.remove();
}

function updateUserStatus(user_id, online, last_seen) {
  if (activeChatData && activeChatData.other_user_id === user_id) {
    const statusEl = document.getElementById('chatStatus');
    if (online) { statusEl.textContent = 'online'; statusEl.className = 'chat-status online'; }
    else { statusEl.textContent = `last seen ${formatLastSeen(last_seen)}`; statusEl.className = 'chat-status'; }
  }
  allChats = allChats.map(c => c.other_user_id === user_id ? { ...c, is_online: online } : c);
  renderChatList(allChats);
}

function sendTyping() {
  if (!activeChatId || !socket) return;
  socket.emit('typing', { token, chat_id: activeChatId });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => socket.emit('stop_typing', { token, chat_id: activeChatId }), 2000);
}

// ─── Chats ────────────────────────────────────────────────────────────────
async function loadChats() {
  const res = await api('/api/chats');
  if (res.ok) { allChats = await res.json(); renderChatList(allChats); }
}

function renderChatList(chats) {
  const list = document.getElementById('chatList');
  if (!chats.length) { list.innerHTML = '<div class="loading-state">No chats yet. Start a new conversation!</div>'; return; }
  list.innerHTML = chats.map(c => {
    const avatar = buildAvatar(c.name, c.avatar, 24);
    const time = c.last_message ? formatTime(c.last_message.created_at) : '';
    let preview = '';
    if (c.last_message) {
      if (c.last_message.is_deleted) preview = '🚫 This message was deleted';
      else if (c.last_message.msg_type === 'image') preview = '📷 Photo';
      else if (c.last_message.msg_type === 'video') preview = '🎥 Video';
      else if (c.last_message.msg_type === 'audio') preview = '🎵 Audio';
      else if (c.last_message.msg_type === 'file') preview = `📎 ${c.last_message.file_name}`;
      else preview = c.last_message.content;
      if (c.last_message.sender_id === currentUser.id && !c.is_group) preview = `You: ${preview}`;
    }
    const onlineDot = c.is_online && !c.is_group ? '<div class="online-dot" style="position:absolute;bottom:1px;right:1px"></div>' : '';
    const active = c.id === activeChatId ? 'active' : '';
    return `<div class="chat-list-item ${active}" onclick="openChat('${c.id}', ${JSON.stringify(c).replace(/"/g,'&quot;')})">
      <div style="position:relative;flex-shrink:0">${avatar}${onlineDot}</div>
      <div class="chat-list-info">
        <div class="chat-list-top">
          <div class="chat-list-name">${esc(c.name)}</div>
          <div class="chat-list-time">${time}</div>
        </div>
        <div class="chat-list-bottom">
          <div class="chat-list-preview">${esc(preview)}</div>
          ${c.unread_count ? `<div class="unread-badge">${c.unread_count}</div>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
  updateTotalUnread();
}

function updateTotalUnread() {
  const total = allChats.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  const tab = document.getElementById('tabChats');
  if (total > 0) {
    tab.innerHTML = `Chats <span class="tab-badge">${total}</span>`;
  } else {
    tab.innerHTML = 'Chats';
  }
}

async function openChat(chatId, chatData) {
  activeChatId = chatId;
  activeChatData = chatData;
  msgPage = 1;
  allMessages[chatId] = [];

  // Clear unread count locally
  const chatIdx = allChats.findIndex(c => c.id === chatId);
  if (chatIdx >= 0) {
    allChats[chatIdx].unread_count = 0;
    renderChatList(allChats);
  }
  socket.emit('mark_chat_read', { token, chat_id: chatId });

  document.getElementById('welcomeScreen').classList.add('hidden');
  document.getElementById('activeChat').classList.remove('hidden');
  // Mobile: hide sidebar
  if (window.innerWidth <= 720) document.getElementById('sidebar').classList.add('slide-out');

  document.getElementById('chatName').textContent = chatData.name;
  const avatarEl = document.getElementById('chatAvatar');
  avatarEl.innerHTML = buildAvatar(chatData.name, chatData.avatar, 18).replace(/<div[^>]*>/,'').replace(/<\/div>/,'');
  avatarEl.style.background = chatData.avatar ? '' : getAvatarColor(chatData.name);

  const statusEl = document.getElementById('chatStatus');
  if (chatData.is_online) { statusEl.textContent = 'online'; statusEl.className = 'chat-status online'; }
  else if (chatData.is_group) { statusEl.textContent = `Group`; statusEl.className = 'chat-status'; }
  else if (chatData.last_seen) { statusEl.textContent = `last seen ${formatLastSeen(chatData.last_seen)}`; statusEl.className = 'chat-status'; }

  // Highlight in list
  document.querySelectorAll('.chat-list-item').forEach(el => el.classList.remove('active'));
  event?.currentTarget?.classList.add('active');
  await loadMessages(chatId);
  setTimeout(() => scrollToBottom(true), 100);
}

async function loadMessages(chatId, append=false) {
  if (loadingMessages) return;
  loadingMessages = true;
  const res = await api(`/api/chats/${chatId}/messages?page=${msgPage}`);
  if (res.ok) {
    const msgs = await res.json();
    if (append) {
      const container = document.getElementById('messagesContainer');
      const prevHeight = container.scrollHeight;
      msgs.forEach(m => prependMessage(m));
      container.scrollTop = container.scrollHeight - prevHeight;
    } else {
      document.getElementById('messagesList').innerHTML = '';
      msgs.forEach(m => appendMessage(m));
      scrollToBottom(true);
    }
    allMessages[chatId] = [...(allMessages[chatId] || []), ...msgs];
    // If we loaded first page and it fills the screen, we can allow more loading
    if (msgs.length < 50) {
       // Optional: mark we reached the end
    }
  }
  setTimeout(() => { loadingMessages = false; }, 200);
}

function appendMessage(msg) {
  const list = document.getElementById('messagesList');
  const wrap = buildMessageEl(msg);
  list.appendChild(wrap);
}

function prependMessage(msg) {
  const list = document.getElementById('messagesList');
  const wrap = buildMessageEl(msg);
  list.insertBefore(wrap, list.firstChild);
}

function buildMessageEl(msg) {
  const isOut = msg.sender_id === currentUser.id;
  const wrap = document.createElement('div');
  wrap.className = `message-wrap ${isOut ? 'out' : 'in'}`;
  wrap.dataset.msgId = msg.id;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  let html = '';
  // Group sender name
  if (!isOut && activeChatData?.is_group) {
    html += `<div class="group-sender">${esc(msg.sender_name)}</div>`;
  }
  // Reply
  if (msg.reply_to) {
    const senderName = msg.reply_to_sender_name || 'Unknown';
    let content = msg.reply_to_content || '';
    if (msg.reply_to_type && msg.reply_to_type !== 'text') {
      content = msg.reply_to_type.charAt(0).toUpperCase() + msg.reply_to_type.slice(1);
    }
    html += `<div class="reply-in-bubble" onclick="scrollToMsg('${msg.reply_to}')">
      <div class="reply-sender-name">${esc(senderName)}</div>
      <div class="reply-content">${esc(content)}</div>
    </div>`;
  }
  // Content
  if (msg.is_deleted) {
    html += `<div class="message-text deleted">🚫 This message was deleted</div>`;
  } else if (msg.msg_type === 'image') {
    html += `<img class="msg-image" src="${msg.file_url}" onclick="viewMedia('image','${msg.file_url}')" loading="lazy"/>`;
    if (msg.content) html += `<div class="message-text">${esc(msg.content)}</div>`;
  } else if (msg.msg_type === 'video') {
    html += `<video class="msg-video" src="${msg.file_url}" controls onclick="viewMedia('video','${msg.file_url}')"></video>`;
  } else if (msg.msg_type === 'audio') {
    html += `<div class="msg-audio-player"><i class="fas fa-microphone" style="color:var(--wa-green)"></i><audio controls src="${msg.file_url}"></audio></div>`;
  } else if (msg.msg_type === 'file') {
    html += `<div class="msg-file" onclick="window.open('${msg.file_url}','_blank')"><i class="fas fa-file-alt"></i><div class="msg-file-info"><div class="file-name">${esc(msg.file_name)}</div><div class="file-size">Tap to open</div></div></div>`;
  } else {
    html += `<div class="message-text">${linkify(esc(msg.content))}</div>`;
  }
  // Meta
  const time = formatTime(msg.created_at);
  const readClass = msg.is_read ? 'read' : '';
  const ticks = isOut ? `<span class="message-ticks ${readClass}"><i class="fas fa-check-double"></i></span>` : '';
  
  bubble.innerHTML = `${html}<div class="message-meta"><span class="message-time">${time}</span>${ticks}</div>`;
  
  // Quick reply button on hover
  const replyBtn = document.createElement('div');
  replyBtn.className = 'msg-quick-reply';
  replyBtn.innerHTML = '<i class="fas fa-reply"></i>';
  replyBtn.onclick = (e) => { e.stopPropagation(); setReply(msg); };
  
  wrap.appendChild(bubble);
  wrap.appendChild(replyBtn);

  // Right-click context menu
  bubble.addEventListener('contextmenu', e => { e.preventDefault(); showMsgContextMenu(e, msg, isOut); });
  // Long press for mobile
  let pressTimer;
  bubble.addEventListener('touchstart', e => { pressTimer = setTimeout(() => showMsgContextMenu(e.touches[0], msg, isOut), 600); });
  bubble.addEventListener('touchend', () => clearTimeout(pressTimer));

  return wrap;
}

function sendMessage() {
  const input = document.getElementById('msgInput');
  const content = input.value.trim();
  if (!content && !pendingUploadType) return;
  if (!activeChatId) return;
  socket.emit('send_message', {
    token, chat_id: activeChatId, content,
    msg_type: 'text', reply_to: replyToMessage?.id || ''
  });
  input.value = ''; autoResize(input); cancelReply();
  socket.emit('stop_typing', { token, chat_id: activeChatId });
}

function onMsgKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function onMsgScroll() {
  const c = document.getElementById('messagesContainer');
  if (c.scrollTop < 20 && !loadingMessages && activeChatId && allMessages[activeChatId]?.length >= 50) { 
    msgPage++; 
    loadMessages(activeChatId, true); 
  }
}

function scrollToBottom(instant = false) {
  const c = document.getElementById('messagesContainer');
  if (!c) return;
  const target = c.scrollHeight;
  if (instant) {
    c.scrollTop = target;
  } else {
    c.scrollTo({ top: target, behavior: 'smooth' });
  }
  // Double check after a short delay for mobile layout shifts
  setTimeout(() => { if (c) c.scrollTop = c.scrollHeight; }, 100);
}

function updateChatLastMessage(msg) {
  const idx = allChats.findIndex(c => c.id === msg.chat_id);
  if (idx >= 0) {
    allChats[idx].last_message = msg;
    allChats[idx].last_message_time = msg.created_at;
    if (msg.sender_id !== currentUser.id && msg.chat_id !== activeChatId) {
      allChats[idx].unread_count = (allChats[idx].unread_count || 0) + 1;
    }
    // Move to top
    allChats.unshift(allChats.splice(idx, 1)[0]);
  } else {
    loadChats(); return;
  }
  renderChatList(allChats);
}

function incrementUnread(chatId) {
  // handled in updateChatLastMessage
}

// ─── Message Context Menu ─────────────────────────────────────────────────
function showMsgContextMenu(e, msg, isOut) {
  closeAllContextMenus();
  const menu = document.createElement('div');
  menu.className = 'msg-context-menu';
  menu.id = 'msgContextMenu';
  let items = `<div class="msg-context-item" onclick="setReply(${JSON.stringify(msg).replace(/"/g,'&quot;')})"><i class="fas fa-reply"></i> Reply</div>`;
  if (!msg.is_deleted && msg.msg_type === 'text') items += `<div class="msg-context-item" onclick="copyText('${esc(msg.content)}')"><i class="fas fa-copy"></i> Copy</div>`;
  if (isOut && !msg.is_deleted) items += `<div class="msg-context-item danger" onclick="deleteMessage('${msg.id}')"><i class="fas fa-trash"></i> Delete</div>`;
  menu.innerHTML = items;
  const x = Math.min(e.clientX, window.innerWidth - 180);
  const y = Math.min(e.clientY, window.innerHeight - 150);
  menu.style.cssText = `left:${x}px;top:${y}px`;
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', closeAllContextMenus, { once: true }), 0);
}

function closeAllContextMenus() {
  document.getElementById('msgContextMenu')?.remove();
}

function setReply(msg) {
  replyToMessage = msg;
  document.getElementById('replyPreview').classList.remove('hidden');
  document.getElementById('replySender').textContent = msg.sender_id === currentUser.id ? 'You' : msg.sender_name;
  
  let content = msg.content;
  if (!content) {
    if (msg.msg_type === 'image') content = '📷 Photo';
    else if (msg.msg_type === 'video') content = '🎥 Video';
    else if (msg.msg_type === 'audio') content = '🎵 Audio';
    else if (msg.msg_type === 'file') content = '📎 File';
    else content = 'Message';
  }
  
  document.getElementById('replyText').textContent = content;
  document.getElementById('msgInput').focus();
}

function cancelReply() {
  replyToMessage = null;
  document.getElementById('replyPreview').classList.add('hidden');
}

function deleteMessage(id) {
  socket.emit('delete_message', { token, message_id: id });
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Copied!'));
}

function scrollToMsg(id) {
  const el = document.querySelector(`[data-msg-id="${id}"] .message-bubble`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight-msg');
    setTimeout(() => el.classList.remove('highlight-msg'), 1500);
  } else {
    showToast("Original message not loaded in view");
  }
}

// ─── File Upload ──────────────────────────────────────────────────────────
function triggerUpload(accept, type) {
  pendingUploadType = type;
  const fi = document.getElementById('fileInput');
  fi.accept = accept; fi.click();
  closeAttachMenu();
}

async function handleFileUpload() {
  const fi = document.getElementById('fileInput');
  const file = fi.files[0];
  if (!file || !activeChatId) return;
  const fd = new FormData();
  fd.append('file', file);
  showToast('Uploading...');
  try {
    const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    const data = await res.json();
    if (res.ok) {
      socket.emit('send_message', {
        token, chat_id: activeChatId, content: '',
        msg_type: pendingUploadType, file_url: data.url,
        file_name: data.filename, reply_to: replyToMessage?.id || ''
      });
      cancelReply();
      showToast('Sent!');
    } else { showToast('Upload failed'); }
  } catch { showToast('Upload failed'); }
  fi.value = ''; pendingUploadType = null;
}

async function handleAvatarUpload() {
  const fi = document.getElementById('avatarInput');
  const file = fi.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const data = await res.json();
  if (res.ok) {
    const upRes = await api('/api/auth/update', 'PUT', { avatar: data.url });
    if (upRes.ok) {
      currentUser.avatar = data.url;
      updateMyAvatar();
      document.getElementById('profileAvatar').innerHTML = `<img src="${data.url}"/>`;
      showToast('Avatar updated!');
    }
  }
  fi.value = '';
}

// ─── New Chat / DM ────────────────────────────────────────────────────────
async function searchNewChat() {
  const q = document.getElementById('newChatSearch').value.trim();
  const res = document.getElementById('newChatResults');
  if (q.length < 2) { res.innerHTML = ''; return; }
  const r = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
  const users = await r.json();
  res.innerHTML = users.map(u => `
    <div class="search-result-item" onclick="startDM('${u.id}')">
      ${buildAvatar(u.name, u.avatar, 18)}
      <div><div class="search-result-name">${esc(u.name)}</div><div class="search-result-phone">${u.phone}</div></div>
    </div>`).join('') || '<div style="padding:20px;text-align:center;color:var(--wa-text-secondary)">No users found</div>';
}

async function startDM(userId) {
  const res = await api(`/api/chats/dm/${userId}`, 'POST');
  const data = await res.json();
  closeModal('newChatModal');
  await loadChats();
  const chat = allChats.find(c => c.id === data.chat_id);
  if (chat) openChat(chat.id, chat);
}

// ─── Group ────────────────────────────────────────────────────────────────
async function searchGroupMembers() {
  const q = document.getElementById('groupMemberSearch').value.trim();
  const res = document.getElementById('groupMemberResults');
  if (q.length < 2) { res.innerHTML = ''; return; }
  const r = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
  const users = await r.json();
  res.innerHTML = users.map(u => `
    <div class="search-result-item" onclick="toggleGroupMember('${u.id}','${esc(u.name)}')">
      ${buildAvatar(u.name, u.avatar, 18)}
      <div><div class="search-result-name">${esc(u.name)}</div></div>
    </div>`).join('');
}

function toggleGroupMember(id, name) {
  if (selectedGroupMembers.find(m => m.id === id)) {
    selectedGroupMembers = selectedGroupMembers.filter(m => m.id !== id);
  } else {
    selectedGroupMembers.push({ id, name });
  }
  renderSelectedMembers();
}

function renderSelectedMembers() {
  const container = document.getElementById('selectedMembers');
  container.innerHTML = selectedGroupMembers.map(m => `
    <div class="member-chip">${esc(m.name)}<button onclick="toggleGroupMember('${m.id}','${esc(m.name)}')"><i class="fas fa-times"></i></button></div>
  `).join('');
}

async function createGroup() {
  const name = document.getElementById('groupName').value.trim();
  const desc = document.getElementById('groupDesc').value.trim();
  if (!name) { showToast('Group name required'); return; }
  const res = await api('/api/chats/group', 'POST', { name, description: desc, members: selectedGroupMembers.map(m => m.id) });
  if (res.ok) {
    closeModal('newGroupModal');
    selectedGroupMembers = [];
    await loadChats();
    showToast('Group created!');
  }
}

// ─── Contacts ─────────────────────────────────────────────────────────────
async function loadContacts() {
  const res = await api('/api/contacts');
  if (res.ok) {
    const contacts = await res.json();
    const list = document.getElementById('contactsList');
    list.innerHTML = contacts.map(c => `
      <div class="search-result-item" onclick="startDM('${c.id}')">
        ${buildAvatar(c.nickname || c.name, c.avatar, 18)}
        <div>
          <div class="search-result-name">${esc(c.nickname || c.name)}</div>
          <div class="search-result-phone">${c.phone} ${c.is_online ? '🟢' : ''}</div>
        </div>
      </div>`).join('') || '<div style="padding:20px;text-align:center;color:var(--wa-text-secondary)">No contacts yet. Add some!</div>';
  }
}

async function addContact() {
  const phone = document.getElementById('contactPhone').value.trim();
  const nick = document.getElementById('contactNickname').value.trim();
  if (!phone) { showToast('Enter phone number'); return; }
  const res = await api('/api/contacts', 'POST', { phone, nickname: nick });
  const data = await res.json();
  const msgEl = document.getElementById('addContactMsg');
  msgEl.classList.remove('hidden');
  if (res.ok) {
    msgEl.textContent = `${data.name} added!`; msgEl.style.color = 'var(--wa-green)';
    loadContacts();
    setTimeout(() => closeModal('addContactModal'), 1500);
  } else { msgEl.textContent = data.error; msgEl.style.color = '#ff6b6b'; }
}

// ─── Status ───────────────────────────────────────────────────────────────
async function loadStatuses() {
  const res = await api('/api/statuses');
  if (res.ok) {
    const data = await res.json();
    const list = document.getElementById('statusList');
    list.innerHTML = data.map(d => `
      <div class="status-item" onclick="viewStatus(${JSON.stringify(d).replace(/"/g,'&quot;')})">
        <div class="status-avatar">${buildAvatarInner(d.user.name, d.user.avatar)}</div>
        <div class="status-info">
          <div class="status-name">${esc(d.user.name)}</div>
          <div class="status-preview">${d.statuses.length} update${d.statuses.length>1?'s':''}</div>
        </div>
      </div>`).join('') || '<div style="padding:20px;text-align:center;color:var(--wa-text-secondary)">No status updates</div>';
  }
}

function viewStatus(data) {
  // Simple viewer using media viewer
  const s = data.statuses[0];
  const mc = document.getElementById('mediaContent');
  if (s.type === 'image') {
    mc.innerHTML = `<img src="${s.file_url}" style="max-width:90vw;max-height:85vh;border-radius:8px"/>`;
  } else {
    mc.innerHTML = `<div style="background:${s.bg_color};padding:40px;border-radius:12px;font-size:22px;color:white;max-width:80vw;text-align:center">${esc(s.content)}</div>`;
  }
  document.getElementById('mediaViewer').classList.remove('hidden');
}

function showAddStatus() { openModal('addStatusModal'); }

function switchStatusType(type, btn) {
  document.querySelectorAll('.status-type-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('textStatusForm').classList.toggle('hidden', type !== 'text');
  document.getElementById('imageStatusForm').classList.toggle('hidden', type !== 'image');
}

function setStatusBg(color, el) {
  statusBgColor = color;
  document.getElementById('statusPreviewBox').style.background = color;
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  el.classList.add('active');
}

function previewStatusImage() {
  const f = document.getElementById('statusImageInput').files[0];
  if (f) {
    const url = URL.createObjectURL(f);
    document.getElementById('statusImagePreview').innerHTML = `<img src="${url}" style="max-width:100%;border-radius:8px;margin-top:10px"/>`;
  }
}

async function postStatus() {
  const isImage = !document.getElementById('imageStatusForm').classList.contains('hidden');
  let payload = { type: 'text', bg_color: statusBgColor };
  if (isImage) {
    const f = document.getElementById('statusImageInput').files[0];
    if (!f) { showToast('Select an image'); return; }
    const fd = new FormData(); fd.append('file', f);
    const ur = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    const ud = await ur.json();
    payload = { type: 'image', file_url: ud.url, content: '' };
  } else {
    payload.content = document.getElementById('statusText').value.trim();
    if (!payload.content) { showToast('Write something'); return; }
  }
  const res = await api('/api/statuses', 'POST', payload);
  if (res.ok) { closeModal('addStatusModal'); loadStatuses(); showToast('Status posted!'); }
}

// ─── Profile ──────────────────────────────────────────────────────────────
function openProfileModal() {
  document.getElementById('profileName').textContent = currentUser.name;
  document.getElementById('profilePhone').textContent = currentUser.phone;
  document.getElementById('profileAbout').textContent = currentUser.about;
  const pa = document.getElementById('profileAvatar');
  pa.innerHTML = currentUser.avatar ? `<img src="${currentUser.avatar}"/>` : currentUser.name.charAt(0).toUpperCase();
  pa.style.background = currentUser.avatar ? '' : getAvatarColor(currentUser.name);
  openModal('profileModal');
}

function editField(field) {
  const el = document.getElementById(`profile${field.charAt(0).toUpperCase()+field.slice(1)}`);
  const current = el.textContent;
  el.innerHTML = `<input type="text" value="${esc(current)}" onblur="saveField('${field}',this)" onkeydown="if(event.key==='Enter')this.blur()"/>`;
  el.querySelector('input').focus();
}

async function saveField(field, inp) {
  const val = inp.value.trim();
  const update = {};
  update[field] = val;
  const res = await api('/api/auth/update', 'PUT', update);
  if (res.ok) {
    currentUser[field] = val;
    const el = document.getElementById(`profile${field.charAt(0).toUpperCase()+field.slice(1)}`);
    el.textContent = val;
    updateMyAvatar();
    showToast('Updated!');
  }
}

function triggerAvatarUpload() { document.getElementById('avatarInput').click(); }

function updateMyAvatar() {
  const el = document.getElementById('myAvatar');
  if (currentUser.avatar) { el.innerHTML = `<img src="${currentUser.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`; el.style.background = ''; }
  else { el.textContent = currentUser.name.charAt(0).toUpperCase(); el.style.background = getAvatarColor(currentUser.name); }
}

// ─── Chat Info ────────────────────────────────────────────────────────────
async function openChatInfo() {
  if (!activeChatData) return;
  const body = document.getElementById('chatInfoBody');
  document.getElementById('chatInfoTitle').textContent = activeChatData.is_group ? 'Group Info' : 'Contact Info';
  if (activeChatData.is_group) {
    const membersRes = await api(`/api/chats/${activeChatId}/members`);
    const members = membersRes.ok ? await membersRes.json() : [];
    body.innerHTML = `
      <div style="text-align:center">
        <div class="info-avatar">${buildAvatarInner(activeChatData.name, activeChatData.avatar)}</div>
        <div class="info-name">${esc(activeChatData.name)}</div>
        <div class="info-about">${members.length} members</div>
      </div>
      <div class="info-section-title">Members</div>
      ${members.map(m => `<div class="info-member"><div class="info-member-avatar">${buildAvatarInner(m.name, m.avatar)}</div><div><div style="font-size:14px;font-weight:500">${esc(m.name)}</div><div style="font-size:12px;color:var(--wa-text-secondary)">${m.is_admin ? 'Admin' : ''}</div></div></div>`).join('')}`;
  } else {
    body.innerHTML = `
      <div style="text-align:center">
        <div class="info-avatar">${buildAvatarInner(activeChatData.name, activeChatData.avatar)}</div>
        <div class="info-name">${esc(activeChatData.name)}</div>
        <div class="info-about">${activeChatData.is_online ? '🟢 Online' : `Last seen ${formatLastSeen(activeChatData.last_seen)}`}</div>
      </div>`;
  }
  openModal('chatInfoModal');
}

// ─── Search ───────────────────────────────────────────────────────────────
function onSearch() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  if (!q) { renderChatList(allChats); return; }
  renderChatList(allChats.filter(c => c.name.toLowerCase().includes(q)));
}

function toggleMsgSearch() {
  const bar = document.getElementById('msgSearchBar');
  bar.classList.toggle('hidden');
  if (!bar.classList.contains('hidden')) document.getElementById('msgSearchInput').focus();
}

function closeMsgSearch() { document.getElementById('msgSearchBar').classList.add('hidden'); }

function searchMessages() {
  const q = document.getElementById('msgSearchInput').value.toLowerCase();
  document.querySelectorAll('.message-wrap').forEach(el => {
    const txt = el.querySelector('.message-text')?.textContent.toLowerCase() || '';
    el.style.display = !q || txt.includes(q) ? '' : 'none';
  });
}

// ─── Emoji Picker ─────────────────────────────────────────────────────────
function buildEmojiPicker() {
  const picker = document.getElementById('emojiPicker');
  picker.innerHTML = EMOJIS.map(e => `<div class="emoji-btn-item" onclick="insertEmoji('${e}')">${e}</div>`).join('');
}

function toggleEmojiPicker() {
  document.getElementById('emojiPicker').classList.toggle('hidden');
}

function insertEmoji(emoji) {
  const inp = document.getElementById('msgInput');
  const pos = inp.selectionStart;
  inp.value = inp.value.slice(0, pos) + emoji + inp.value.slice(inp.selectionEnd);
  inp.selectionStart = inp.selectionEnd = pos + emoji.length;
  inp.focus(); autoResize(inp);
}

// ─── Attach Menu ──────────────────────────────────────────────────────────
function toggleAttachMenu() {
  document.getElementById('attachMenu').classList.toggle('hidden');
}

function closeAttachMenu() {
  document.getElementById('attachMenu').classList.add('hidden');
}

// ─── Media Viewer ─────────────────────────────────────────────────────────
function viewMedia(type, url) {
  const mc = document.getElementById('mediaContent');
  mc.innerHTML = type === 'image' ? `<img src="${url}"/>` : `<video src="${url}" controls autoplay></video>`;
  document.getElementById('mediaViewer').classList.remove('hidden');
}

function closeMediaViewer() { document.getElementById('mediaViewer').classList.add('hidden'); }

// ─── Chat Menu ────────────────────────────────────────────────────────────
function toggleChatMenu() {
  document.getElementById('chatMenu').classList.toggle('hidden');
  event?.stopPropagation();
}

function clearChat() {
  document.getElementById('messagesList').innerHTML = '';
  closeDropdowns();
  showToast('Chat cleared locally');
}

// ─── Misc ─────────────────────────────────────────────────────────────────
function goBack() {
  document.getElementById('sidebar').classList.remove('slide-out');
  document.getElementById('activeChat').classList.add('hidden');
  document.getElementById('welcomeScreen').classList.remove('hidden');
  activeChatId = null;
}

function showSection(name) {
  ['chats','status','contacts'].forEach(s => {
    document.getElementById(`section${s.charAt(0).toUpperCase()+s.slice(1)}`).classList.toggle('hidden', s !== name);
    document.getElementById(`tab${s.charAt(0).toUpperCase()+s.slice(1)}`)?.classList.toggle('active', s === name);
  });
  if (name === 'status') loadStatuses();
  if (name === 'contacts') loadContacts();
  closeDropdowns();
}

function showNewChatModal() { openModal('newChatModal'); closeDropdowns(); }
function showNewGroupModal() { selectedGroupMembers = []; openModal('newGroupModal'); closeDropdowns(); }
function showAddContactModal() { openModal('addContactModal'); }
function toggleMenu() { document.getElementById('headerMenu').classList.toggle('hidden'); event?.stopPropagation(); }
function toggleAttachMenu() { document.getElementById('attachMenu').classList.toggle('hidden'); event?.stopPropagation(); }
function toggleEmojiPicker() { document.getElementById('emojiPicker').classList.toggle('hidden'); event?.stopPropagation(); }
function toggleChatMenu() { document.getElementById('chatMenu').classList.toggle('hidden'); event?.stopPropagation(); }

function closeDropdowns() {
  document.getElementById('headerMenu')?.classList.add('hidden');
  document.getElementById('chatMenu')?.classList.add('hidden');
  document.getElementById('attachMenu')?.classList.add('hidden');
  document.getElementById('emojiPicker')?.classList.add('hidden');
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; osc.type = 'sine';
    gain.gain.setValueAtTime(.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .3);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + .3);
  } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function api(url, method='GET', body=null) {
  const opts = { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(url, opts);
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function linkify(text) {
  return text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:var(--wa-green)">$1</a>');
}

const COLORS = ['#128C7E','#075E54','#25D366','#34B7F1','#ECE5DD','#E44D26','#6B21A8','#1E40AF'];
function getAvatarColor(name) { return COLORS[name.charCodeAt(0) % COLORS.length]; }

function buildAvatar(name, url, fontSize=18) {
  if (url) return `<div class="chat-list-avatar"><img src="${url}" loading="lazy"/></div>`;
  const letter = (name || '?').charAt(0).toUpperCase();
  return `<div class="chat-list-avatar" style="background:${getAvatarColor(name)};font-size:${fontSize}px">${letter}</div>`;
}

function buildAvatarInner(name, url) {
  if (url) return `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
  return (name || '?').charAt(0).toUpperCase();
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 864e5);
  
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  if (diffDays === 1 || (new Date(now - 864e5)).toDateString() === d.toDateString()) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
  }
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMsgTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatLastSeen(iso) {
  if (!iso) return 'a long time ago';
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  
  if (diffMin < 1) return 'just now';
  if (d.toDateString() === now.toDateString()) {
    return 'today at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  if ((new Date(now - 864e5)).toDateString() === d.toDateString()) {
    return 'yesterday at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  return 'on ' + d.toLocaleDateString();
}

function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function showBrowserNotification(msg) {
  if ("Notification" in window && Notification.permission === "granted") {
    const chat = allChats.find(c => c.id === msg.chat_id);
    const title = chat ? chat.name : "New Message";
    const options = {
      body: msg.content || (msg.msg_type === 'image' ? "📷 Photo" : "New attachment"),
      icon: chat?.avatar || "/static/img/icon.png"
    };
    new Notification(title, options).onclick = () => {
      window.focus();
      if (chat) openChat(chat.id, chat);
    };
  }
}
