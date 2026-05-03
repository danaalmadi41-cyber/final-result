function getNotificationSignature(items) {
  return JSON.stringify(items || []);
}

async function markNotificationsRead(notifType, options) {
  options = options || {};

  if (!state.user || !state.user.id) return false;

  var targetType = notifType || null;
  var unreadItems = (state.realNotifications || []).filter(function(item) {
    return !item.is_read && (!targetType || item.type === targetType);
  });

  if (!unreadItems.length) return false;

  state.realNotifications = (state.realNotifications || []).map(function(item) {
    if (!targetType || item.type === targetType) {
      return Object.assign({}, item, { is_read: true });
    }
    return item;
  });
  state.notificationsDataSignature = getNotificationSignature(state.realNotifications);

  if (options.rerender !== false) {
    render({ preserveScroll: true });
  }

  try {
    var response = await fetch('/api/notifications/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: state.user.id,
        type: targetType
      })
    });

    if (!response.ok && !options.silent) {
      showToast('Failed to update notifications', 'error');
    }
  } catch (error) {
    console.error('MARK NOTIFICATIONS READ ERROR:', error);
    if (!options.silent) {
      showToast('Server error updating notifications', 'error');
    }
  }

  return true;
}
window.markNotificationsRead = markNotificationsRead;

async function openOrganizerNotifications() {
  if (state.user && state.user.role === 'organizer') {
    await markNotificationsRead('staff_status', {
      silent: true,
      rerender: false
    });
  }

  navigate('notifications');
}
window.openOrganizerNotifications = openOrganizerNotifications;

function getStaffStatusNotifications(items) {
  return (items || []).filter(function(n) {
    return n && n.type === 'staff_status';
  });
}

function getAttendanceNotifications(items) {
  return (items || []).filter(function(n) {
    return n && n.type === 'attendance';
  });
}

function getUnreadStaffStatusNotifications(items) {
  return getStaffStatusNotifications(items).filter(function(n) {
    return !n.is_read;
  });
}

function maybeAnnounceDashboardStaffAlert(previousItems, nextItems) {
  if ((state.view !== 'dashboard' && state.view !== 'notifications') || !state.user || state.user.role !== 'organizer') {
    return;
  }

  if (!(previousItems || []).length) {
    return;
  }

  var previousIds = {};
  getUnreadStaffStatusNotifications(previousItems).forEach(function(item) {
    previousIds[item.id] = true;
  });

  var freshAlerts = getUnreadStaffStatusNotifications(nextItems).filter(function(item) {
    return !previousIds[item.id];
  });

  if (!freshAlerts.length) {
    freshAlerts = getAttendanceNotifications(nextItems).filter(function(item) {
      return !item.is_read && !(previousItems || []).some(function(prev) {
        return Number(prev.id) === Number(item.id);
      });
    });
  }

  if (!freshAlerts.length) {
    return;
  }

  var newest = freshAlerts[0];
  var toastType = newest.type === 'attendance' ? 'success' : 'error';
  var fallbackMessage = newest.type === 'attendance'
    ? 'A new attendee entered the event.'
    : 'A staff member stopped working.';
  showToast((newest.title || 'Notification') + ': ' + (newest.message || fallbackMessage), toastType);
}

async function loadNotifications(silent, options) {
  options = options || {};
  if (!state.user || !state.user.id) return;
  if (state.notificationsLoading) return;
  state.notificationsLoading = true;

  try {
    var previousItems = (state.realNotifications || []).slice();
    var response = await fetch('/api/notifications/' + state.user.id);
    var data = await response.json();

    if (!response.ok) {
      state.notificationsLoading = false;
      if (!silent) showToast(data.message || 'Failed to load notifications', 'error');
      return;
    }

    var nextSignature = getNotificationSignature(data);
    var hasChanged = state.notificationsDataSignature !== nextSignature;

    state.realNotifications = data;
    state.notificationsLoaded = true;
    state.notificationsLoading = false;
    state.notificationsDataSignature = nextSignature;

    if (hasChanged) {
      maybeAnnounceDashboardStaffAlert(previousItems, data);
    }

    if (state.view === 'notifications') {
      render({ preserveScroll: !!options.preserveScroll });
    } else if (state.view === 'dashboard' && hasChanged) {
      render({ preserveScroll: true });
    }

  } catch (error) {
    console.error('LOAD NOTIFICATIONS ERROR:', error);
    state.notificationsLoading = false;
    if (!silent) showToast('Server error loading notifications', 'error');
  }
}
window.loadNotifications = loadNotifications;

function startNotificationsPolling() {
  stopNotificationsPolling();
  state.notificationsPolling = setInterval(function () {
    loadNotifications(true);
  }, 10000);
}
window.startNotificationsPolling = startNotificationsPolling;

function stopNotificationsPolling() {
  if (state.notificationsPolling) {
    clearInterval(state.notificationsPolling);
    state.notificationsPolling = null;
  }
}
window.stopNotificationsPolling = stopNotificationsPolling;

function markAllNotificationsRead() {
  markNotificationsRead(null, { silent: false });
}
window.markAllNotificationsRead = markAllNotificationsRead;

function renderNotifications() {
  if (!state.notificationsLoaded && !state.notificationsLoading) {
    loadNotifications(true);
  }

  var user = state.user;
  var items = state.realNotifications || [];
  var unread = items.filter(function(n) { return !n.is_read; }).length;
  var filter = state.notifFilter || 'all';

  var filtered = filter === 'all'
    ? items
    : items.filter(function(n) { return n.type === filter; });

  var content =
    '<div style="padding:32px;max-width:980px;margin:0 auto;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px;">' +
        '<div>' +
          '<h1 style="font-family:Montserrat,sans-serif;font-weight:900;font-size:28px;letter-spacing:-0.02em;margin-bottom:6px;">Notifications</h1>' +
          '<p style="font-size:13px;color:var(--muted);">' + unread + ' unread notifications</p>' +
        '</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
          '<button class="btn-ghost" onclick="markAllNotificationsRead()">Mark All Read</button>' +
        '</div>' +
      '</div>' +

      '<div class="tab-bar" style="margin-bottom:22px;flex-wrap:wrap;">' +
        '<button class="tab-btn ' + (filter === 'all' ? 'active' : '') + '" onclick="state.notifFilter=\'all\';render()">All</button>' +
        '<button class="tab-btn ' + (filter === 'ticket' ? 'active' : '') + '" onclick="state.notifFilter=\'ticket\';render()">Tickets</button>' +
        '<button class="tab-btn ' + (filter === 'attendance' ? 'active' : '') + '" onclick="state.notifFilter=\'attendance\';render()">Attendance</button>' +
        '<button class="tab-btn ' + (filter === 'crowd' ? 'active' : '') + '" onclick="state.notifFilter=\'crowd\';render()">Crowd</button>' +
        '<button class="tab-btn ' + (filter === 'staff_status' ? 'active' : '') + '" onclick="state.notifFilter=\'staff_status\';render()">Staff Alerts</button>' +
        '<button class="tab-btn ' + (filter === 'update' ? 'active' : '') + '" onclick="state.notifFilter=\'update\';render()">Updates</button>' +
        '<button class="tab-btn ' + (filter === 'emergency' ? 'active' : '') + '" onclick="state.notifFilter=\'emergency\';render()">Emergency</button>' +
      '</div>' +

      (state.notificationsLoading
        ? '<div class="card" style="padding:28px;text-align:center;">' +
            '<h3 style="font-family:Montserrat,sans-serif;font-weight:800;font-size:20px;margin-bottom:10px;">Loading Notifications</h3>' +
            '<p style="color:var(--muted);">Please wait while your notifications are loading.</p>' +
          '</div>'
        : !filtered.length
        ? '<div class="card" style="padding:28px;text-align:center;">' +
            '<h3 style="font-family:Montserrat,sans-serif;font-weight:800;font-size:20px;margin-bottom:10px;">No Notifications</h3>' +
            '<p style="color:var(--muted);">There are no notifications in this category.</p>' +
          '</div>'
        : filtered.map(function(n) {
            var meta = getNotificationMeta(n.type);

            return '<div class="notification-row notification-' + meta.key + '">' +
              '<div class="notification-strip" style="background:' + meta.color + ';"></div>' +
              '<div class="notification-icon" style="color:' + meta.color + ';border-color:' + meta.border + ';background:' + meta.bg + ';">' + meta.icon + '</div>' +
              '<div style="flex:1;">' +
                '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px;min-width:0;">' +
                  '<div style="font-family:Montserrat,sans-serif;font-weight:800;font-size:16px;">' + (n.title || 'Notification') + '</div>' +
                  '<span class="notification-pill" style="color:' + meta.color + ';border-color:' + meta.border + ';background:' + meta.bg + ';">' + meta.label + '</span>' +
                  (!n.is_read ? '<span style="width:8px;height:8px;border-radius:50%;background:#9B1040;display:inline-block;"></span>' : '') +
                '</div>' +
                (n.event_name
                  ? '<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Event: ' + n.event_name + '</div>'
                  : '') +
                '<div style="font-size:14px;color:var(--muted);margin-bottom:8px;line-height:1.7;">' + (n.message || '') + '</div>' +
                '<div style="font-size:12px;color:var(--muted);">' + formatStoredDateTime(n.created_at || '') + '</div>' +
              '</div>' +
            '</div>';
          }).join('')) +
    '</div>';

  if (user && user.role === 'organizer') {
    return '<div class="org-layout">' +
      renderSidebar('notifications') +
      '<main class="org-main">' + content + '</main>' +
    '</div>';
  }

  return renderTopNav() + content;
}


function getNotificationMeta(type) {
  if (type === 'emergency') {
    return {
      key: 'emergency',
      label: 'Emergency',
      icon: '!',
      color: '#EF4444',
      border: 'rgba(239,68,68,0.35)',
      bg: 'rgba(239,68,68,0.12)'
    };
  }

  if (type === 'ticket') {
    return {
      key: 'ticket',
      label: 'Ticket',
      icon: '$',
      color: '#22C55E',
      border: 'rgba(34,197,94,0.35)',
      bg: 'rgba(34,197,94,0.12)'
    };
  }

  if (type === 'attendance') {
    return {
      key: 'attendance',
      label: 'Attendance',
      icon: '+',
      color: '#22C55E',
      border: 'rgba(34,197,94,0.35)',
      bg: 'rgba(34,197,94,0.12)'
    };
  }

  if (type === 'crowd') {
    return {
      key: 'crowd',
      label: 'Crowd',
      icon: '!',
      color: '#F59E0B',
      border: 'rgba(245,158,11,0.38)',
      bg: 'rgba(245,158,11,0.14)'
    };
  }

  if (type === 'staff_status') {
    return {
      key: 'staff-status',
      label: 'Staff Alert',
      icon: 'S',
      color: '#F97316',
      border: 'rgba(249,115,22,0.38)',
      bg: 'rgba(249,115,22,0.14)'
    };
  }

  return {
    key: 'update',
    label: 'Update',
    icon: 'i',
    color: '#60A5FA',
    border: 'rgba(96,165,250,0.35)',
    bg: 'rgba(96,165,250,0.12)'
  };
}
