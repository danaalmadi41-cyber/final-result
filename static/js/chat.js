// ============================================================
//  CHAT SYSTEM  —  HTTP polling via Flask / SQLite
// ============================================================

// ── Unread notification system ───────────────────────────────

var _unreadTimer = null;

function _ensureUnreadPoll() {
  if (_unreadTimer) return;
  if (!state.user) return;
  _checkUnread();
  _unreadTimer = setInterval(_checkUnread, 5000);
}
window._ensureUnreadPoll = _ensureUnreadPoll;

function _stopUnreadPoll() {
  if (_unreadTimer) { clearInterval(_unreadTimer); _unreadTimer = null; }
}
window._stopUnreadPoll = _stopUnreadPoll;

async function _checkUnread() {
  if (!state.user) { _stopUnreadPoll(); return; }
  try {
    var r = await fetch('/api/chat/unread-count?user_id=' + state.user.id + '&role=' + encodeURIComponent(state.user.role || ''));
    if (!r.ok) return;
    var data = await r.json();
    _updateBadges(data.count || 0);
  } catch(e) {}
}

function _updateBadges(count) {
  var badges = document.querySelectorAll('.chat-unread-badge');
  badges.forEach(function(b) {
    b.textContent = count > 9 ? '9+' : String(count);
    if (count > 0) b.classList.add('visible');
    else b.classList.remove('visible');
  });
}

function _markRoomRead(roomId) {
  if (!state.user || !roomId) return;
  fetch('/api/chat/mark-read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: state.user.id, room_id: roomId })
  }).then(function() { setTimeout(_checkUnread, 300); }).catch(function(){});
}

var chatPanel = {
  open:       false,
  roomId:     null,
  title:      '',
  lastMsgId:  0,
  pollTimer:  null,
  staffId:    null,
  staffStatus: '',
  allowRemoveStaff: false
};

// ── Room ID convention ───────────────────────────────────────
//   staff  ↔ organizer  →  staff_{staffId}
//   customer ↔ staff    →  cust_{custId}_staff_{staffId}
//   customer ↔ organizer→  cust_{custId}_org_{orgId}

function _chatRoomId(type, a, b) {
  if (type === 'staff_org')  return 'staff_' + a;          // a = staffId
  if (type === 'cust_org')   return 'cust_' + a + '_org_'   + b;
  if (type === 'cust_staff') return 'cust_' + a + '_staff_' + b;
  return 'room_' + a + '_' + b;
}

function _esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _chatTime(ts) {
  var d = new Date(ts);
  if (isNaN(d)) return '';
  var h = d.getHours();
  var m = d.getMinutes().toString().padStart(2,'0');
  var period = h >= 12 ? 'PM' : 'AM';
  var displayH = h % 12 || 12;
  return displayH + ':' + m + ' ' + period;
}

// ── Open / close ─────────────────────────────────────────────

function openChatPanel(roomId, title, options) {
  options = options || {};
  if (!state.user) { navigate('login'); return; }
  _stopPoll();
  chatPanel.open      = true;
  chatPanel.roomId    = roomId;
  chatPanel.title     = title;
  chatPanel.lastMsgId = 0;
  chatPanel.staffId   = options.staffId || null;
  chatPanel.staffStatus = options.staffStatus || '';
  chatPanel.allowRemoveStaff = !!options.allowRemoveStaff;
  _buildPanel();
  _poll(true);
  chatPanel.pollTimer = setInterval(function(){ _poll(false); }, 2500);
  _markRoomRead(roomId);
}
window.openChatPanel = openChatPanel;

function closeChatPanel() {
  _stopPoll();
  chatPanel.open   = false;
  chatPanel.roomId = null;
  chatPanel.staffId = null;
  chatPanel.staffStatus = '';
  chatPanel.allowRemoveStaff = false;
  var el = document.getElementById('chat-panel');
  if (el) el.remove();
}
window.closeChatPanel = closeChatPanel;

function _stopPoll() {
  if (chatPanel.pollTimer) { clearInterval(chatPanel.pollTimer); chatPanel.pollTimer = null; }
}

// ── Polling ──────────────────────────────────────────────────

async function _poll() {
  if (!chatPanel.open || !chatPanel.roomId) return;
  try {
    var r = await fetch('/api/chat/messages/' +
      encodeURIComponent(chatPanel.roomId) + '?since=' + chatPanel.lastMsgId);
    if (!r.ok) return;
    var msgs = await r.json();
    msgs.forEach(function(m) {
      _appendMsg(m);
      if (m.id > chatPanel.lastMsgId) chatPanel.lastMsgId = m.id;
    });
    if (msgs.length) _markRoomRead(chatPanel.roomId);
  } catch(e) {}
}

// ── Render a message bubble ──────────────────────────────────

function _appendMsg(msg) {
  var list = document.getElementById('chat-messages-list');
  if (!list) return;

  // Remove empty state placeholder
  var empty = list.querySelector('.chat-empty');
  if (empty) empty.remove();

  var isMe = state.user && Number(state.user.id) === Number(msg.from_id);
  var initials = (msg.from_name || '?').charAt(0).toUpperCase();

  var row = document.createElement('div');
  row.className = 'chat-msg-row ' + (isMe ? 'sent' : 'recv');

  var avatarHtml = !isMe
    ? '<div class="chat-msg-avatar">' + _esc(initials) + '</div>'
    : '';

  var senderHtml = !isMe
    ? '<div class="chat-msg-sender">' + _esc(msg.from_name) +
      ' <span style="font-weight:400;color:rgba(255,255,255,0.35);text-transform:capitalize;">' +
      _esc(msg.from_role) + '</span></div>'
    : '';

  row.innerHTML =
    avatarHtml +
    '<div class="chat-msg-col">' +
      senderHtml +
      '<div class="chat-bubble ' + (isMe ? 'sent' : 'recv') + '">' + _esc(msg.text) + '</div>' +
      '<div class="chat-bubble-time">' + _chatTime(msg.created_at) + '</div>' +
    '</div>';

  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
}

// ── Send ─────────────────────────────────────────────────────

async function sendChatMessage() {
  if (!chatPanel.roomId || !state.user) return;
  var inp  = document.getElementById('chat-msg-input');
  if (!inp) return;
  var text = (inp.value || '').trim();
  if (!text) return;
  inp.value = '';
  try {
    var r = await fetch('/api/chat/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id:   chatPanel.roomId,
        from_id:   state.user.id,
        from_name: state.user.name || 'User',
        from_role: state.user.role || 'user',
        message:   text
      })
    });
    if (!r.ok) { showToast('Failed to send message','error'); inp.value = text; return; }
    _poll();
  } catch(e) { showToast('Failed to send message','error'); inp.value = text; }
}
window.sendChatMessage = sendChatMessage;

function chatInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
}
window.chatInputKeydown = chatInputKeydown;

// ── Build the floating panel DOM ─────────────────────────────

function deleteChatConversation() {
  if (!chatPanel.roomId) return;
  var confirmEl = document.getElementById('chat-delete-confirm');
  if (confirmEl) { confirmEl.remove(); return; }

  var bar = document.createElement('div');
  bar.id = 'chat-delete-confirm';
  bar.className = 'chat-delete-confirm-bar';
  bar.innerHTML =
    '<span style="font-size:12px;color:rgba(255,255,255,0.82);">Delete entire conversation?</span>' +
    '<div style="display:flex;gap:6px;flex-shrink:0;">' +
      '<button onclick="confirmDeleteChat()" style="background:#EF4444;border:none;border-radius:8px;' +
      'padding:5px 14px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">Delete</button>' +
      '<button onclick="document.getElementById(\'chat-delete-confirm\').remove()" ' +
      'style="background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.12);border-radius:8px;' +
      'padding:5px 10px;color:rgba(255,255,255,0.75);font-size:12px;cursor:pointer;">Cancel</button>' +
    '</div>';

  var panel = document.getElementById('chat-panel');
  if (panel) {
    var header = panel.querySelector('.chat-header');
    if (header && header.nextSibling) {
      panel.insertBefore(bar, header.nextSibling);
    } else {
      panel.appendChild(bar);
    }
  }
}
window.deleteChatConversation = deleteChatConversation;

async function confirmDeleteChat() {
  if (!chatPanel.roomId) return;
  var bar = document.getElementById('chat-delete-confirm');
  if (bar) bar.remove();
  try {
    await fetch('/api/chat/messages/' + encodeURIComponent(chatPanel.roomId), { method: 'DELETE' });
    var list = document.getElementById('chat-messages-list');
    if (list) list.innerHTML = '';
    chatPanel.lastMsgId = 0;
    showToast('Conversation deleted', 'success');
  } catch(e) { showToast('Failed to delete','error'); }
}
window.confirmDeleteChat = confirmDeleteChat;

function confirmRemoveStaffFromChat() {
  if (!chatPanel.staffId) return;
  var confirmEl = document.getElementById('chat-remove-confirm');
  if (confirmEl) { confirmEl.remove(); return; }

  var bar = document.createElement('div');
  bar.id = 'chat-remove-confirm';
  bar.className = 'chat-delete-confirm-bar';
  bar.innerHTML =
    '<span style="font-size:12px;color:rgba(255,255,255,0.82);">Remove this inactive staff member from the system?</span>' +
    '<div style="display:flex;gap:6px;flex-shrink:0;">' +
      '<button onclick="removeStaffFromChat()" style="background:#EF4444;border:none;border-radius:8px;padding:5px 14px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">Remove</button>' +
      '<button onclick="document.getElementById(\'chat-remove-confirm\').remove()" style="background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:5px 10px;color:rgba(255,255,255,0.75);font-size:12px;cursor:pointer;">Cancel</button>' +
    '</div>';

  var panel = document.getElementById('chat-panel');
  if (panel) {
    var header = panel.querySelector('.chat-header');
    if (header && header.nextSibling) {
      panel.insertBefore(bar, header.nextSibling);
    } else {
      panel.appendChild(bar);
    }
  }
}
window.confirmRemoveStaffFromChat = confirmRemoveStaffFromChat;

async function removeStaffFromChat() {
  if (!state.user || state.user.role !== 'organizer' || !chatPanel.staffId) return;

  var bar = document.getElementById('chat-remove-confirm');
  if (bar) bar.remove();

  try {
    var response = await fetch('/api/organizer/staff/' + encodeURIComponent(chatPanel.staffId) + '?organizer_id=' + encodeURIComponent(state.user.id), {
      method: 'DELETE'
    });
    var data = await response.json();

    if (!response.ok) {
      showToast(data.message || 'Failed to remove staff member', 'error');
      return;
    }

    state.organizerStaff = (state.organizerStaff || []).filter(function(staff) {
      return Number(staff.staff_id) !== Number(chatPanel.staffId);
    });

    if (state.latestCreatedStaff && Number(state.latestCreatedStaff.staff_id) === Number(chatPanel.staffId)) {
      state.latestCreatedStaff = null;
    }

    showToast(data.message || 'Staff removed successfully', 'success');
    closeChatPanel();

    if (state.view === 'add-staff') {
      render({ preserveScroll: true });
    }
  } catch (error) {
    console.error('REMOVE STAFF FROM CHAT ERROR:', error);
    showToast('Server error while removing staff member', 'error');
  }
}
window.removeStaffFromChat = removeStaffFromChat;

function _buildPanel() {
  var old = document.getElementById('chat-panel');
  if (old) old.remove();

  var title = chatPanel.title || 'Chat';
  var initials = title.replace(/^Chat with\s*/i,'').charAt(0).toUpperCase() || '?';
  var removeAction = state.user && state.user.role === 'organizer' && chatPanel.allowRemoveStaff
    ? '<button class="chat-delete-btn" onclick="confirmRemoveStaffFromChat()">Kick / Remove</button>'
    : '';

  var p = document.createElement('div');
  p.id = 'chat-panel';
  p.className = 'chat-panel-widget';
  p.innerHTML =
    '<div class="chat-header">' +
      '<div class="chat-header-title">' +
        '<div class="chat-avatar">' + _esc(initials) +
          '<div class="chat-online-dot"></div>' +
        '</div>' +
        '<div class="chat-title-wrap">' +
          '<div class="chat-title-text">' + _esc(title) + '</div>' +
          '<div class="chat-title-sub">Active now</div>' +
        '</div>' +
      '</div>' +
      '<div class="chat-header-actions">' +
        removeAction +
        '<button class="chat-delete-btn" onclick="deleteChatConversation()">🗑 Delete</button>' +
        '<button class="chat-close-btn" onclick="closeChatPanel()">×</button>' +
      '</div>' +
    '</div>' +
    '<div id="chat-messages-list" class="chat-messages-list">' +
      '<div class="chat-empty">' +
        '<div class="chat-empty-icon">💬</div>' +
        '<div>No messages yet</div>' +
        '<div style="font-size:11px;margin-top:2px;font-weight:400;">Send the first message!</div>' +
      '</div>' +
    '</div>' +
    '<div class="chat-input-row">' +
      '<input id="chat-msg-input" class="chat-text-input" onkeydown="chatInputKeydown(event)" ' +
      'placeholder="Write a message…" autocomplete="off" />' +
      '<button class="chat-send-btn" onclick="sendChatMessage()">➤</button>' +
    '</div>';
  document.body.appendChild(p);
  setTimeout(function(){ var i=document.getElementById('chat-msg-input'); if(i) i.focus(); }, 60);
}

// ============================================================
//  STAFF CHAT PICKER
//  Shows two options: Customer Chats  |  Chat with Organizer
// ============================================================

function openStaffChatPicker() {
  if (!state.user || state.user.role !== 'entry_staff') return;
  var existing = document.getElementById('staff-chat-picker');
  if (existing) { existing.remove(); return; }

  var ev     = (state.realEvents || [])[0];
  var orgId  = ev ? ev.organizer_id : null;
  var orgName = ev ? (_esc(ev.organizer_name) || 'Organizer') : 'Organizer';

  var modal = document.createElement('div');
  modal.id = 'staff-chat-picker';
  modal.onclick = function(e){ if(e.target===modal) modal.remove(); };
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:9998;' +
    'display:flex;align-items:center;justify-content:center;padding:20px;';

  modal.innerHTML =
    '<div style="background:#16142b;border:1px solid rgba(255,255,255,0.10);' +
    'border-radius:20px;padding:24px;width:100%;max-width:380px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
        '<div style="font-family:Montserrat,sans-serif;font-weight:800;font-size:18px;">Chat</div>' +
        '<button onclick="document.getElementById(\'staff-chat-picker\').remove()" ' +
        'style="background:none;border:none;color:var(--muted);font-size:24px;cursor:pointer;">×</button>' +
      '</div>' +

      // Option 1 — Customer chats
      '<button onclick="document.getElementById(\'staff-chat-picker\').remove();openStaffCustomerChats()" ' +
      'style="width:100%;display:flex;align-items:center;gap:14px;padding:16px;' +
      'background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);' +
      'border-radius:14px;color:#fff;cursor:pointer;margin-bottom:12px;text-align:left;">' +
        '<div style="font-size:22px;">👥</div>' +
        '<div><div style="font-family:Montserrat,sans-serif;font-weight:700;font-size:14px;">Customer Messages</div>' +
        '<div style="font-size:12px;color:var(--muted);margin-top:2px;">View and reply to customer questions</div></div>' +
      '</button>' +

      // Option 2 — Organizer chat
      (orgId
        ? '<button onclick="document.getElementById(\'staff-chat-picker\').remove();openStaffOrganizerChat()" ' +
          'style="width:100%;display:flex;align-items:center;gap:14px;padding:16px;' +
          'background:rgba(155,16,64,0.1);border:1px solid rgba(155,16,64,0.25);' +
          'border-radius:14px;color:#fff;cursor:pointer;text-align:left;">' +
            '<div style="font-size:22px;">💬</div>' +
            '<div><div style="font-family:Montserrat,sans-serif;font-weight:700;font-size:14px;">Chat with Organizer</div>' +
            '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + orgName + '</div></div>' +
          '</button>'
        : '<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px;">No organizer assigned yet.</div>'
      ) +
    '</div>';
  document.body.appendChild(modal);
}
window.openStaffChatPicker = openStaffChatPicker;

// ── Staff: list of customer conversations ────────────────────

function openStaffCustomerChats() {
  if (!state.user || state.user.role !== 'entry_staff') return;
  var existing = document.getElementById('staff-cust-chats');
  if (existing) { existing.remove(); return; }

  fetch('/api/chat/rooms/staff/' + state.user.id)
    .then(function(r){ return r.json(); })
    .then(function(rooms){
      if (!rooms || !rooms.length) {
        showToast('No customer messages yet', 'error');
        return;
      }
      _renderStaffCustomerList(rooms);
    })
    .catch(function(){ showToast('Could not load messages','error'); });
}
window.openStaffCustomerChats = openStaffCustomerChats;

function _renderStaffCustomerList(rooms) {
  var rows = rooms.map(function(r){
    var click = 'document.getElementById(\'staff-cust-chats\').remove();' +
      'openChatPanel(\'' + _esc(r.room_id) + '\',\'Customer: ' + _esc(r.customer_name) + '\')';
    return '<button onclick="' + click + '" style="width:100%;display:flex;align-items:center;' +
      'gap:12px;padding:12px 14px;background:rgba(255,255,255,0.04);' +
      'border:1px solid rgba(255,255,255,0.08);border-radius:12px;color:#fff;' +
      'cursor:pointer;margin-bottom:8px;text-align:left;">' +
      '<div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;' +
      'background:linear-gradient(135deg,#22C55E,#16A34A);' +
      'display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;">' +
      _esc((r.customer_name||'C').charAt(0).toUpperCase()) + '</div>' +
      '<div style="min-width:0;">' +
        '<div style="font-weight:700;font-size:13px;">' + _esc(r.customer_name) + '</div>' +
        '<div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
        'ID: ' + (r.customer_id||'?') + ' · ' + _esc(r.customer_email) + '</div>' +
      '</div>' +
    '</button>';
  }).join('');

  var modal = document.createElement('div');
  modal.id = 'staff-cust-chats';
  modal.onclick = function(e){ if(e.target===modal) modal.remove(); };
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:9998;' +
    'display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML =
    '<div style="background:#16142b;border:1px solid rgba(255,255,255,0.10);' +
    'border-radius:20px;padding:24px;width:100%;max-width:420px;max-height:80vh;overflow-y:auto;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">' +
        '<div style="font-family:Montserrat,sans-serif;font-weight:800;font-size:18px;">Customer Messages</div>' +
        '<button onclick="document.getElementById(\'staff-cust-chats\').remove()" ' +
        'style="background:none;border:none;color:var(--muted);font-size:24px;cursor:pointer;">×</button>' +
      '</div>' + rows + '</div>';
  document.body.appendChild(modal);
}

// ── Staff → organizer chat ────────────────────────────────────

function openStaffOrganizerChat() {
  if (!state.user || state.user.role !== 'entry_staff') return;
  var ev = (state.realEvents || [])[0];
  if (!ev || !ev.organizer_id) {
    showToast('No organizer found for your event','error'); return;
  }
  openChatPanel(
    _chatRoomId('staff_org', state.user.id),
    'Chat with ' + _esc(ev.organizer_name || 'Organizer')
  );
}
window.openStaffOrganizerChat = openStaffOrganizerChat;

// ============================================================
//  ORGANIZER: staff chat inbox
// ============================================================

function openOrganizerChatInbox() {
  if (!state.user || state.user.role !== 'organizer') return;
  var existing = document.getElementById('org-chat-inbox');
  if (existing) { existing.remove(); return; }
  fetch('/api/organizer/staff?organizer_id=' + state.user.id)
    .then(function(r){ return r.json(); })
    .then(function(data){
      var list = Array.isArray(data) ? data : (data.staff || []);
      _renderOrgChatInbox(list);
    })
    .catch(function(){ showToast('Could not load staff list','error'); });
}
window.openOrganizerChatInbox = openOrganizerChatInbox;

function _renderOrgChatInbox(staffList) {
  if (!staffList.length) { showToast('No staff assigned yet','error'); return; }
  var rows = staffList.map(function(s){
    var name = (s.full_name || ((s.first_name||'') + ' ' + (s.last_name||'')).trim() || 'Staff');
    // API returns "staff_id" — fall back to user_id or id for safety
    var uid  = s.staff_id || s.user_id || s.id;
    var eventName = (s.event && s.event.name) || s.event_name || '';
    var workStatus = String(s.work_status || 'active');
    var statusText = workStatus === 'stop_working' ? 'Inactive' : (workStatus === 'extra_work' ? 'Extra Work' : 'Active');
    var statusColor = workStatus === 'stop_working' ? '#F59E0B' : (workStatus === 'extra_work' ? '#60A5FA' : '#22C55E');
    var click = 'document.getElementById(\'org-chat-inbox\').remove();' +
      'openOrganizerStaffChat(' + uid + ',\'' + _esc(name) + '\',\'' + _esc(workStatus) + '\')';
    return '<button onclick="' + click + '" style="width:100%;display:flex;align-items:center;' +
      'gap:12px;padding:12px 14px;background:rgba(255,255,255,0.04);' +
      'border:1px solid rgba(255,255,255,0.08);border-radius:12px;color:#fff;' +
      'cursor:pointer;margin-bottom:8px;text-align:left;">' +
      '<div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;' +
      'background:linear-gradient(135deg,#9B1040,#D49A35);' +
      'display:flex;align-items:center;justify-content:center;font-weight:800;">' +
      _esc(name.charAt(0).toUpperCase()) + '</div>' +
      '<div><div style="font-weight:700;font-size:13px;">' + _esc(name) + '</div>' +
      '<div style="font-size:11px;color:var(--muted);">' + _esc(eventName) + '</div>' +
      '<div style="font-size:11px;color:' + statusColor + ';margin-top:3px;font-weight:700;">' + _esc(statusText) + '</div></div>' +
    '</button>';
  }).join('');

  var modal = document.createElement('div');
  modal.id = 'org-chat-inbox';
  modal.onclick = function(e){ if(e.target===modal) modal.remove(); };
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:9998;' +
    'display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML =
    '<div style="background:#16142b;border:1px solid rgba(255,255,255,0.10);' +
    'border-radius:20px;padding:24px;width:100%;max-width:420px;max-height:80vh;overflow-y:auto;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">' +
        '<div style="font-family:Montserrat,sans-serif;font-weight:800;font-size:18px;">Staff Chats</div>' +
        '<button onclick="document.getElementById(\'org-chat-inbox\').remove()" ' +
        'style="background:none;border:none;color:var(--muted);font-size:24px;cursor:pointer;">×</button>' +
      '</div>' + rows + '</div>';
  document.body.appendChild(modal);
}

function openOrganizerStaffChat(staffId, staffName, workStatus) {
  if (!state.user || state.user.role !== 'organizer') return;
  var normalizedStatus = String(workStatus || 'active').toLowerCase();
  openChatPanel(
    _chatRoomId('staff_org', staffId),
    'Chat with ' + _esc(staffName || 'Staff'),
    {
      staffId: staffId,
      staffStatus: normalizedStatus,
      allowRemoveStaff: normalizedStatus === 'stop_working'
    }
  );
}
window.openOrganizerStaffChat = openOrganizerStaffChat;

// ============================================================
//  CUSTOMER: chat picker (organizer OR staff)
// ============================================================

function openCustomerChatPicker() {
  if (!state.user) { navigate('login'); return; }
  var existing = document.getElementById('chat-picker-modal');
  if (existing) { existing.remove(); return; }
  fetch('/api/customer/chat-contacts/' + state.user.id)
    .then(function(r){ return r.json(); })
    .then(function(contacts){
      if (!contacts || !contacts.length) {
        showToast('Purchase a ticket first to chat with staff','error'); return;
      }
      _renderCustomerPicker(contacts);
    })
    .catch(function(){ showToast('Could not load contacts','error'); });
}
window.openCustomerChatPicker = openCustomerChatPicker;

function _renderCustomerPicker(contacts) {
  var rows = contacts.map(function(c){
    var en = _esc(c.event_name);
    var staffList = c.staff || [];

    if (!staffList.length) {
      return '<div style="margin-bottom:14px;padding:14px;background:rgba(255,255,255,0.04);' +
        'border:1px solid rgba(255,255,255,0.08);border-radius:14px;">' +
        '<div style="font-family:Montserrat,sans-serif;font-weight:700;font-size:13px;margin-bottom:8px;">' + en + '</div>' +
        '<div style="font-size:12px;color:var(--muted);">No staff assigned to this event yet.</div>' +
        '</div>';
    }

    var staffBtns = staffList.map(function(s){
      var sn = _esc(s.name);
      var isActive = s.work_status === 'active';
      var dot = '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:middle;flex-shrink:0;background:' + (isActive ? '#22C55E' : '#6B7280') + ';box-shadow:' + (isActive ? '0 0 5px #22C55E' : 'none') + ';"></span>';
      var label = dot + sn + (isActive ? '' : '<span style="font-size:10px;font-weight:400;opacity:0.55;margin-left:4px;">(Busy)</span>');
      var sc = 'document.getElementById(\'chat-picker-modal\').remove();' +
        'openCustomerStaffChat(' + s.id + ',\'' + sn + '\',\'' + en + '\')';
      return '<button onclick="' + sc + '" style="display:flex;align-items:center;' +
        'width:100%;padding:12px 14px;margin-bottom:8px;' +
        'background:' + (isActive ? 'rgba(34,197,94,0.07)' : 'rgba(107,114,128,0.07)') + ';' +
        'border:1px solid ' + (isActive ? 'rgba(34,197,94,0.22)' : 'rgba(107,114,128,0.18)') + ';' +
        'border-radius:12px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;text-align:left;">' +
        '<div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;margin-right:11px;' +
        'background:linear-gradient(135deg,' + (isActive ? '#22C55E,#16A34A' : '#4B5563,#374151') + ');' +
        'display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;">' +
        _esc((s.name||'S').charAt(0).toUpperCase()) + '</div>' +
        '<div style="min-width:0;">' +
          '<div style="display:flex;align-items:center;">' + label + '</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:1px;font-weight:400;">' +
          (isActive ? 'Available to chat' : 'Currently busy') + '</div>' +
        '</div>' +
      '</button>';
    }).join('');

    return '<div style="margin-bottom:14px;">' +
      '<div style="font-family:Montserrat,sans-serif;font-weight:700;font-size:12px;' +
      'color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">' + en + '</div>' +
      staffBtns +
      '</div>';
  }).join('');

  var modal = document.createElement('div');
  modal.id = 'chat-picker-modal';
  modal.onclick = function(e){ if(e.target===modal) modal.remove(); };
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:9998;' +
    'display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML =
    '<div style="background:#16142b;border:1px solid rgba(255,255,255,0.10);' +
    'border-radius:20px;padding:24px;width:100%;max-width:440px;max-height:80vh;overflow-y:auto;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">' +
        '<div style="font-family:Montserrat,sans-serif;font-weight:800;font-size:18px;">Start a Chat</div>' +
        '<button onclick="document.getElementById(\'chat-picker-modal\').remove()" ' +
        'style="background:none;border:none;color:var(--muted);font-size:24px;cursor:pointer;">×</button>' +
      '</div>' + rows + '</div>';
  document.body.appendChild(modal);
}

function openCustomerOrgChat(orgId, orgName, eventName) {
  if (!state.user) return;
  openChatPanel(
    _chatRoomId('cust_org', state.user.id, orgId),
    'Chat with ' + _esc(orgName||'Organizer') + (eventName ? ' — ' + _esc(eventName) : '')
  );
}
window.openCustomerOrgChat = openCustomerOrgChat;

function openCustomerStaffChat(staffId, staffName, eventName) {
  if (!state.user) return;
  openChatPanel(
    _chatRoomId('cust_staff', state.user.id, staffId),
    'Chat with ' + _esc(staffName||'Staff') + (eventName ? ' — ' + _esc(eventName) : '')
  );
}
window.openCustomerStaffChat = openCustomerStaffChat;
