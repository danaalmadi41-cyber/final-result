function renderCustomerDashboard() {
  if (typeof ensureSupportChatState === 'function') {
    ensureSupportChatState(null);
  }

  var user = state.user || null;
  var isCustomer = !!(user && user.role === 'customer');
  var notificationsEnabled = isCustomer && typeof state.customerNotificationsDraft === 'boolean'
    ? state.customerNotificationsDraft
    : (!user || user.notifications_enabled !== false);
  var notificationStatusText = notificationsEnabled ? 'ON' : 'OFF';
  var notificationStatusColor = notificationsEnabled ? '#22C55E' : '#EF4444';
  var notificationStatusBg = notificationsEnabled ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
  var notificationStatusBorder = notificationsEnabled ? 'rgba(34,197,94,0.24)' : 'rgba(239,68,68,0.24)';
  var notificationButtonStyle = notificationsEnabled
    ? 'background:linear-gradient(135deg,#15803d,#22C55E);border-color:rgba(34,197,94,0.32);color:#ffffff;'
    : 'background:linear-gradient(135deg,#b91c1c,#EF4444);border-color:rgba(239,68,68,0.32);color:#ffffff;';

  if (isCustomer && typeof user.notifications_enabled === 'undefined' && !state.customerPreferenceLoading) {
    loadCustomerNotificationPreference(true);
  }

  if (isCustomer && !state.customerHistoryLoading && !state.customerHistoryLoaded) {
    loadCustomerEventHistory(true);
  }

  var profileCard = isCustomer
    ? '<div class="card" style="padding:24px;">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px;">' +
          '<div>' +
            '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:24px;margin-bottom:8px;">Profile & Settings</h2>' +
            '<p style="color:var(--muted);font-size:14px;line-height:1.7;max-width:780px;">Update your name, manage normal notifications, and review your event attendance history.</p>' +
          '</div>' +
          '<div style="padding:10px 14px;border-radius:999px;background:' + notificationStatusBg + ';border:1px solid ' + notificationStatusBorder + ';color:' + notificationStatusColor + ';font-weight:800;font-size:12px;">Notifications ' + notificationStatusText + '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:20px;">' +
        '<div style="padding:18px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid var(--border);">' +
            '<div style="font-size:11px;color:var(--muted);font-family:\'Montserrat\',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Full Name</div>' +
            '<input type="text" id="customer-full-name" class="input-field" value="' + escapeHtml(user.name || '') + '" style="margin-bottom:12px;" />' +
            '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
              '<button class="btn-primary" onclick="saveCustomerProfileName()">Save Name</button>' +
            '</div>' +
            '<div style="font-size:13px;color:var(--muted);margin-top:12px;">Your saved name updates the settings page and the account chip in the navigation bar.</div>' +
          '</div>' +
          renderCustomerInfoTile('Email', escapeHtml(user.email || '-')) +
        '</div>' +
        '<div style="padding:22px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid ' + notificationStatusBorder + ';margin-bottom:20px;">' +
          '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:16px;margin-bottom:10px;">Notification Preference</div>' +
          '<label style="display:flex;align-items:flex-start;gap:12px;cursor:pointer;font-size:14px;color:var(--muted);line-height:1.8;margin-bottom:14px;">' +
            '<input type="checkbox" id="customer-notifications-enabled"' + (notificationsEnabled ? ' checked' : '') + ' onchange="setCustomerNotificationsDraft(this.checked)" style="margin-top:3px;accent-color:' + notificationStatusColor + ';" />' +
            '<span>Receive normal event notifications, ticket updates, and crowd updates. Turn this off if you do not want routine notifications.</span>' +
          '</label>' +
          '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">' +
            '<button class="btn-primary" onclick="saveCustomerNotificationPreference()" style="' + notificationButtonStyle + '">Notifications ' + notificationStatusText + '</button>' +
          '</div>' +
          '<div style="font-size:13px;color:' + notificationStatusColor + ';font-weight:700;margin-bottom:8px;">' + (notificationsEnabled ? 'Normal notifications are currently active.' : 'Normal notifications are currently turned off.') + '</div>' +
          '<div style="font-size:13px;color:var(--muted);">Emergency alerts always stay on.</div>' +
        '</div>' +
        renderCustomerSupportHelpSection() +
        renderCustomerHistorySection() +
      '</div>'
    : '<div class="card" style="padding:24px;">' +
        '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:24px;margin-bottom:10px;">Customer Settings</h2>' +
        '<p style="color:var(--muted);font-size:14px;line-height:1.8;margin-bottom:18px;">Sign in with a customer account to manage your profile details and event history.</p>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
          '<button class="btn-primary" onclick="navigate(\'login\')">Sign In</button>' +
          '<button class="btn-ghost" onclick="navigate(\'signup\')">Create Account</button>' +
        '</div>' +
      '</div>';

  return renderTopNav() +
    '<section class="hero-section noise">' +
      '<div class="grid-bg"></div>' +
      '<div style="position:relative;z-index:1;width:100%;padding:0 32px;">' +
        '<div class="card" style="padding:32px;margin-bottom:24px;background:linear-gradient(135deg,rgba(155,16,64,0.2),rgba(212,154,53,0.12),rgba(255,255,255,0.03));">' +
          '<div class="badge badge-cat" style="margin-bottom:16px;">Customer Dashboard</div>' +
          '<h1 style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:clamp(32px,5vw,56px);line-height:1.05;margin-bottom:16px;">Account settings</h1>' +
          '<p style="color:var(--muted);font-size:16px;line-height:1.8;max-width:720px;">Manage your profile, your event notifications, and your event attendance history.</p>' +
        '</div>' +
        profileCard +
      '</div>' +
    '</section>' +
    (typeof renderFloatingSupportWidget === 'function' ? renderFloatingSupportWidget(null) : '');
}

function renderCustomerSupportHelpSection() {
  return '<div style="padding:22px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid var(--border);margin-bottom:20px;">' +
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:12px;">' +
      '<div>' +
        '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:16px;margin-bottom:6px;">Settings Help</div>' +
        '<div style="font-size:13px;color:var(--muted);line-height:1.8;max-width:720px;">This page helps you update your saved name, control normal notifications, and check your event history. If you want step-by-step help, open Support and choose the tutorial.</div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        '<button class="btn-ghost" onclick="toggleSupportChat(true)">Open Support</button>' +
        '<button class="btn-primary" onclick="askSupportBot(\'settings-tutorial\', \'Show settings tutorial\')">Start Tutorial</button>' +
      '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">' +
      '<div style="padding:14px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border);font-size:13px;line-height:1.8;color:var(--muted);"><strong style="color:var(--text);">Name</strong><br>Update the name shown in your account area.</div>' +
      '<div style="padding:14px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border);font-size:13px;line-height:1.8;color:var(--muted);"><strong style="color:var(--text);">Notifications</strong><br>Choose whether normal updates stay on or off.</div>' +
      '<div style="padding:14px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border);font-size:13px;line-height:1.8;color:var(--muted);"><strong style="color:var(--text);">History</strong><br>Review your attendance status and past ticket activity.</div>' +
    '</div>' +
  '</div>';
}

function renderCustomerInfoTile(label, value) {
  return '<div style="padding:16px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid var(--border);">' +
    '<div style="font-size:11px;color:var(--muted);font-family:\'Montserrat\',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">' + label + '</div>' +
    '<div style="font-size:15px;font-weight:700;line-height:1.6;">' + value + '</div>' +
  '</div>';
}

function renderCustomerHistorySection() {
  var history = state.customerHistory || [];

  return '<div style="padding:22px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid var(--border);">' +
    '<div style="margin-bottom:14px;">' +
      '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:16px;margin-bottom:6px;">History of Events</div>' +
      '<div style="font-size:13px;color:var(--muted);">See whether you attended the event and the event date.</div>' +
    '</div>' +
    (state.customerHistoryLoading
      ? '<div style="padding:22px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border);text-align:center;color:var(--muted);">Loading event history...</div>'
      : !history.length
      ? '<div style="padding:22px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border);text-align:center;color:var(--muted);">No event history found yet.</div>'
      : '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">' +
          history.map(function(item) {
            return renderCustomerHistoryCard(item);
          }).join('') +
        '</div>') +
  '</div>';
}

function renderCustomerHistoryCard(item) {
  var attended = !!item.attended;
  var statusColor = attended ? '#22C55E' : '#F59E0B';
  var statusBg = attended ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)';
  var statusBorder = attended ? 'rgba(34,197,94,0.24)' : 'rgba(245,158,11,0.24)';
  var eventDate = formatCustomerHistoryDate(item.event_date, item.event_end_date, item.event_time);
  var location = (item.location || 'TBA') + (item.city ? ', ' + item.city : '');

  return '<div style="padding:18px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border);">' +
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px;">' +
      '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:18px;line-height:1.4;">' + escapeHtml(item.event_name || 'Event') + '</div>' +
      '<div style="padding:8px 12px;border-radius:999px;background:' + statusBg + ';border:1px solid ' + statusBorder + ';color:' + statusColor + ';font-size:12px;font-weight:800;white-space:nowrap;">' + escapeHtml(item.status || 'Not Attended') + '</div>' +
    '</div>' +
    renderCustomerHistoryRow('Event Date', eventDate) +
    renderCustomerHistoryRow('Event Location', escapeHtml(location)) +
    renderCustomerHistoryRow('Ticket Time', escapeHtml(formatStoredDateTime(item.purchase_time || ''))) +
  '</div>';
}

function renderCustomerHistoryRow(label, value) {
  return '<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,0.08);font-size:14px;">' +
    '<span style="color:var(--muted);">' + label + '</span>' +
    '<span style="font-weight:700;text-align:right;">' + value + '</span>' +
  '</div>';
}

function formatCustomerHistoryDate(startDate, endDate, startTime) {
  var start = formatEventDateLabel(startDate);
  if (endDate && endDate !== startDate) {
    start += ' to ' + formatEventDateLabel(endDate);
  }
  if (startTime) {
    start += ' at ' + formatClockTime(startTime);
  }
  return start;
}

async function loadCustomerNotificationPreference(silent) {
  if (!state.user || state.user.role !== 'customer' || !state.user.id) return;
  state.customerPreferenceLoading = true;

  try {
    var response = await fetch('/api/notification-preference/' + encodeURIComponent(state.user.id));
    var data = await response.json();

    if (!response.ok) {
      state.customerPreferenceLoading = false;
      if (!silent) showToast(data.message || 'Failed to load notification preference', 'error');
      return;
    }

    state.user.notifications_enabled = data.enabled !== false;
    state.customerNotificationsDraft = data.enabled !== false;
    if (typeof saveAuthUser === 'function') {
      saveAuthUser(state.user);
    }
    state.customerPreferenceLoading = false;

    if (state.view === 'customer-dashboard') {
      render({ preserveScroll: true });
    }
  } catch (error) {
    console.error('CUSTOMER PREFERENCE LOAD ERROR:', error);
    state.customerPreferenceLoading = false;
    if (!silent) showToast('Server error loading notification preference', 'error');
  }
}
window.loadCustomerNotificationPreference = loadCustomerNotificationPreference;

function setCustomerNotificationsDraft(enabled) {
  state.customerNotificationsDraft = !!enabled;
  if (state.view === 'customer-dashboard') {
    render({ preserveScroll: true });
  }
}
window.setCustomerNotificationsDraft = setCustomerNotificationsDraft;

async function saveCustomerNotificationPreference() {
  if (!state.user || state.user.role !== 'customer' || !state.user.id) {
    showToast('Please sign in as a customer first', 'error');
    return;
  }

  var toggle = document.getElementById('customer-notifications-enabled');
  var enabled = !toggle || !!toggle.checked;

  try {
    var response = await fetch('/api/notification-preference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: state.user.id,
        enabled: enabled
      })
    });

    var data = await response.json();
    if (!response.ok) {
      showToast(data.message || 'Failed to save notification preference', 'error');
      return;
    }

    state.user.notifications_enabled = data.enabled !== false;
    state.customerNotificationsDraft = data.enabled !== false;
    if (typeof saveAuthUser === 'function') {
      saveAuthUser(state.user);
    }
    showToast(enabled ? 'Normal notifications turned on' : 'Normal notifications turned off', 'success');
    render({ preserveScroll: true });
  } catch (error) {
    console.error('CUSTOMER PREFERENCE SAVE ERROR:', error);
    showToast('Server error saving notification preference', 'error');
  }
}
window.saveCustomerNotificationPreference = saveCustomerNotificationPreference;

async function saveCustomerProfileName() {
  if (!state.user || state.user.role !== 'customer' || !state.user.id) {
    showToast('Please sign in as a customer first', 'error');
    return;
  }

  var field = document.getElementById('customer-full-name');
  var fullName = field ? field.value.trim() : '';

  if (!fullName) {
    showToast('Please enter your name', 'error');
    return;
  }

  try {
    var response = await fetch('/api/profile/name', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: state.user.id,
        full_name: fullName
      })
    });

    var data = await response.json();
    if (!response.ok) {
      showToast(data.message || 'Failed to update name', 'error');
      return;
    }

    state.user.name = data.user && data.user.full_name ? data.user.full_name : fullName;
    if (typeof saveAuthUser === 'function') {
      saveAuthUser(state.user);
    }
    showToast(data.message || 'Name updated successfully', 'success');
    render({ preserveScroll: true });
  } catch (error) {
    console.error('CUSTOMER NAME UPDATE ERROR:', error);
    showToast('Server error updating name', 'error');
  }
}
window.saveCustomerProfileName = saveCustomerProfileName;

async function loadCustomerEventHistory(silent) {
  if (!state.user || state.user.role !== 'customer' || !state.user.id) return;
  state.customerHistoryLoading = true;

  try {
    var response = await fetch('/api/customer/history/' + encodeURIComponent(state.user.id));
    var data = await response.json();

    if (!response.ok) {
      state.customerHistoryLoading = false;
      if (!silent) showToast(data.message || 'Failed to load event history', 'error');
      return;
    }

    state.customerHistory = Array.isArray(data) ? data : [];
    state.customerHistoryLoading = false;
    state.customerHistoryLoaded = true;

    if (state.view === 'customer-dashboard') {
      render({ preserveScroll: true });
    }
  } catch (error) {
    console.error('CUSTOMER HISTORY LOAD ERROR:', error);
    state.customerHistoryLoading = false;
    if (!silent) showToast('Server error loading event history', 'error');
  }
}
window.loadCustomerEventHistory = loadCustomerEventHistory;

function initCustomerDashboardCharts() {}
