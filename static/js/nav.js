if (typeof LOGO === 'undefined') {
  var LOGO = '/images/logo.png';
}

// ============================================================
//  TOP NAV
// ============================================================
function renderTopNav() {
  var user = state.user;
  var activeView = state.view || 'home';
  var onSettingsPage = activeView === 'customer-dashboard';
  var onEventsPage = activeView === 'home' || activeView === 'detail';

  return '' +
  '<header style="position:sticky;top:0;z-index:1000;background:rgba(10,10,30,0.72);backdrop-filter:blur(14px);border-bottom:1px solid var(--border);" class="top-nav-header">' +
    '<div style="max-width:1280px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;">' +

      '<div style="display:flex;align-items:center;gap:14px;">' +
        '<button onclick="navigate(\'home\')" style="background:none;border:none;padding:0;cursor:pointer;display:flex;align-items:center;">' +
          '<img src="' + LOGO + '" alt="logo" class="top-nav-logo-img" style="width:62px;height:62px;object-fit:contain;display:block;" />' +
        '</button>' +

        '<nav class="top-nav-nav-links" style="display:flex;align-items:center;gap:8px;">' +
          '<button onclick="navigate(\'home\')" style="background:' + (onEventsPage ? 'rgba(155,16,64,0.12)' : 'rgba(255,255,255,0.04)') + ';border:1px solid ' + (onEventsPage ? 'rgba(155,16,64,0.2)' : 'rgba(255,255,255,0.10)') + ';color:var(--text);padding:7px 14px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">Events</button>' +
          '<button onclick="goToSettingsPage()" style="background:' + (onSettingsPage ? 'rgba(155,16,64,0.12)' : 'rgba(255,255,255,0.04)') + ';border:1px solid ' + (onSettingsPage ? 'rgba(155,16,64,0.2)' : 'rgba(255,255,255,0.10)') + ';color:var(--text);padding:7px 14px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">Settings</button>' +
        '</nav>' +
      '</div>' +

      '<div style="display:flex;align-items:center;gap:8px;">' +
        (user && user.is_admin ? '<button class="btn-ghost" style="font-size:12px;padding:7px 12px;" onclick="navigate(\'admin-organizers\')">Organizer Requests</button>' : '') +
        '<button id="theme-btn" class="icon-btn" style="position:relative;z-index:2000;" onclick="toggleTheme()" title="Toggle theme">' + (document.documentElement.getAttribute('data-theme') === 'light' ? '☀️' : '🌙') + '</button>' +

        (user
          ? '<div style="display:flex;align-items:center;gap:7px;">' +
              (user.role === 'customer'
                ? '<button onclick="openCustomerChatPicker()" style="background:rgba(155,16,64,0.15);border:1px solid rgba(155,16,64,0.3);color:#fff;padding:8px 12px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">💬</button>'
                : '') +
              '<div class="top-user-chip" onclick="goToUserMainPage()" style="display:flex;align-items:center;gap:9px;padding:7px 11px;border:1px solid rgba(255,255,255,0.10);border-radius:999px;background:rgba(255,255,255,0.04);cursor:pointer;">' +
                '<div class="top-user-avatar" style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#9B1040,#D49A35);color:#fff;font-weight:800;font-size:14px;flex-shrink:0;">' +
                  ((user.name || 'U').charAt(0).toUpperCase()) +
                '</div>' +
                '<div class="top-user-info-text" style="line-height:1.1;">' +
                  '<div style="font-family:Montserrat,sans-serif;font-weight:700;font-size:12px;color:#fff;white-space:nowrap;">' + (user.name || 'User') + '</div>' +
                  '<div style="font-size:11px;color:var(--muted);text-transform:capitalize;">' + (user.role || '') + '</div>' +
                '</div>' +
              '</div>' +
              '<button class="btn-ghost top-nav-logout-btn" style="font-size:12px;padding:7px 12px;" onclick="logout()">Logout</button>' +
            '</div>'
          : '<button class="btn-ghost" style="font-size:13px;padding:7px 14px;" onclick="navigate(\'login\')">Login</button>' +
            '<button class="btn-primary" style="font-size:13px;padding:7px 14px;" onclick="navigate(\'signup\')">Sign Up</button>') +
      '</div>' +

    '</div>' +
  '</header>';
}


function goToSettingsPage() {
  if (!state.user) {
    state.loginRole = 'customer';
    navigate('login');
    return;
  }

  if (state.user.role === 'organizer') {
    navigate('dashboard');
  } else if (state.user.role === 'entry_staff') {
    navigate('scan');
  } else {
    navigate('customer-dashboard');
  }
}
window.goToSettingsPage = goToSettingsPage;

function scrollToEvents() {
  if (state.view !== 'home') {
    navigate('home');
    setTimeout(function() {
      var el = document.getElementById('events-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  } else {
    var el = document.getElementById('events-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }
}
window.scrollToEvents = scrollToEvents;

function openMobileSidebar() {
  var sb = document.getElementById('org-sidebar');
  var ov = document.getElementById('mob-sidebar-overlay');
  var closeBtn = document.querySelector('.mob-close-sidebar-btn');
  if (sb) sb.classList.add('sidebar-open');
  if (ov) ov.classList.add('open');
  if (closeBtn) closeBtn.style.display = 'flex';
}
window.openMobileSidebar = openMobileSidebar;

function closeMobileSidebar() {
  var sb = document.getElementById('org-sidebar');
  var ov = document.getElementById('mob-sidebar-overlay');
  var closeBtn = document.querySelector('.mob-close-sidebar-btn');
  if (sb) sb.classList.remove('sidebar-open');
  if (ov) ov.classList.remove('open');
  if (closeBtn) closeBtn.style.display = 'none';
}
window.closeMobileSidebar = closeMobileSidebar;

function goToUserMainPage() {
  if (!state.user) {
    navigate('home');
    return;
  }

  if (state.user.is_admin && state.user.role !== 'organizer') {
    navigate('admin-organizers');
  } else if (state.user.role === 'organizer') {
    navigate('dashboard');
  } else if (state.user.role === 'entry_staff') {
    navigate('scan');
  } else {
    navigate('customer-dashboard');
  }
}
window.goToUserMainPage = goToUserMainPage;
function logout() {
  if (typeof firebaseSignOut === 'function') firebaseSignOut();
  if (typeof clearAuthUser === 'function') {
    clearAuthUser();
  } else {
    state.user = null;
  }
  navigate('home');

  setTimeout(function () {
    if (typeof loadEvents === 'function') {
      loadEvents();
    }
  }, 50);
}
window.logout = logout;

// ============================================================
//  ORGANIZER SIDEBAR
// ============================================================
// ============================================================
//  ORGANIZER SIDEBAR (WITH HOME AT BOTTOM)
// ============================================================
function renderSidebar(active) {
  var user = state.user || {};

  function item(view, label, icon) {
    var isActive = active === view;
    var action = view === 'notifications'
      ? 'closeMobileSidebar();openOrganizerNotifications()'
      : 'closeMobileSidebar();navigate(\'' + view + '\')';

    return '' +
      '<button class="org-sidebar-item' + (isActive ? ' active' : '') + '" onclick="' + action + '" style="' +
        'width:100%;display:flex;align-items:center;gap:12px;' +
        'padding:14px 16px;margin-bottom:10px;border-radius:14px;' +
        'border:' + (isActive ? '1px solid rgba(255,255,255,0.10)' : '1px solid transparent') + ';' +
        'background:' + (isActive ? 'linear-gradient(135deg,#9B1040,#D49A35)' : 'transparent') + ';' +
        'color:#fff;cursor:pointer;font-size:14px;font-weight:700;text-align:left;' +
      '">' +
        '<span style="font-size:16px;">' + icon + '</span>' +
        '<span>' + label + '</span>' +
      '</button>';
  }

  return '' +
    '<div class="mob-sidebar-overlay" id="mob-sidebar-overlay" onclick="closeMobileSidebar()"></div>' +
    '<button class="mob-menu-btn" id="mob-menu-btn" onclick="openMobileSidebar()" title="Menu">☰</button>' +
    '<aside class="org-sidebar" id="org-sidebar" style="' +
      'width:260px;min-width:260px;' +
      'background:rgba(19,17,42,0.98);' +
      'border-right:1px solid rgba(255,255,255,0.08);' +
      'display:flex;flex-direction:column;justify-content:space-between;' +
      'padding:22px 16px;height:100vh;position:sticky;top:0;' +
    '">' +

      // ===== TOP =====
      '<div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:26px;padding:6px 8px;">' +
          '<img src="' + LOGO + '" alt="logo" style="width:42px;height:42px;object-fit:contain;" />' +
          '<button onclick="closeMobileSidebar()" style="display:none;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);' +
          'border-radius:8px;color:#fff;font-size:18px;width:32px;height:32px;cursor:pointer;' +
          'align-items:center;justify-content:center;flex-shrink:0;" class="mob-close-sidebar-btn">×</button>' +
        '</div>' +

        item('dashboard', 'Dashboard', '📊') +
        item('my-events', 'My Events', '📅') +
        item('create', 'Create Event', '➕') +
        item('notifications', 'Notifications', '🔔') +
        item('reports', 'Reports', '📄') +
        item('add-staff', 'Add Staff', 'ID') +
        (user.is_admin ? item('admin-organizers', 'Organizer Approvals', 'ADM') : '') +
        '<button class="org-sidebar-item" onclick="openOrganizerChatInbox()" style="width:100%;display:flex;align-items:center;gap:12px;padding:14px 16px;margin-bottom:10px;border-radius:14px;border:1px solid transparent;background:transparent;color:#fff;cursor:pointer;font-size:14px;font-weight:700;text-align:left;position:relative;">' +
          '<span style="font-size:16px;">💬</span><span>Staff Chats</span>' +
          '<span class="chat-unread-badge" style="border-color:#13112a;"></span>' +
        '</button>' +
      '</div>' +

      // ===== BOTTOM =====
      '<div>' +

        // profile card
        '<div class="org-sidebar-profile" style="' +
          'display:flex;align-items:center;gap:10px;' +
          'padding:14px 12px;border:1px solid rgba(255,255,255,0.08);' +
          'border-radius:18px;background:rgba(255,255,255,0.04);margin-bottom:12px;' +
        '">' +
          '<div class="org-sidebar-avatar" style="' +
            'width:38px;height:38px;border-radius:50%;' +
            'display:flex;align-items:center;justify-content:center;' +
            'background:linear-gradient(135deg,#9B1040,#D49A35);' +
            'color:#fff;font-weight:800;' +
          '">' +
            ((user.name || 'U').charAt(0).toUpperCase()) +
          '</div>' +

          '<div style="min-width:0;">' +
            '<div style="font-family:Montserrat,sans-serif;font-size:13px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
              (user.name || 'User') +
            '</div>' +
            '<div style="font-size:12px;color:var(--muted);text-transform:capitalize;">' +
              (user.role || '') +
            '</div>' +
          '</div>' +
        '</div>' +

        // HOME BUTTON
        '<button class="org-sidebar-secondary" onclick="navigate(\'home\')" style="' +
          'width:100%;padding:12px 16px;margin-bottom:10px;border-radius:14px;' +
          'border:1px solid rgba(255,255,255,0.10);background:rgba(255,255,255,0.04);' +
          'color:#fff;font-weight:700;cursor:pointer;text-align:left;' +
        '">🏠 Home</button>' +

        // LOGOUT BUTTON
        '<button class="org-sidebar-secondary" onclick="logout()" style="' +
          'width:100%;padding:12px 16px;border-radius:14px;' +
          'border:1px solid rgba(255,255,255,0.10);background:rgba(255,255,255,0.04);' +
          'color:#fff;font-weight:700;cursor:pointer;text-align:left;' +
        '">🚪 Logout</button>' +

      '</div>' +
    '</aside>';
}
