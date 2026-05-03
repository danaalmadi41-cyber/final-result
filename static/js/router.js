// ============================================================
//  NAVIGATION
// ============================================================
function navigate(view, params) {
  params = params || {};

  state.view = view;
  state.params = params;

  history.pushState(
    { view: view, params: params },
    '',
    '#' + view
  );

  render();
}
window.navigate = navigate;


// ============================================================
//  RENDER ROUTER
// ============================================================
function render(options) {
  options = options || {};
  destroyAllCharts();
  var organizerViews = ['dashboard', 'my-events', 'reports', 'add-staff', 'create', 'edit', 'notifications'];

  if (state.view !== 'dashboard' && typeof stopDashboardPolling === 'function') {
    stopDashboardPolling();
  }

  if (state.view !== 'notifications' && typeof stopNotificationsPolling === 'function') {
    stopNotificationsPolling();
  }

  if (state.view !== 'scan' && typeof stopBarcodeCamera === 'function') {
    stopBarcodeCamera(true);
  }

  if (state.view !== 'scan' && typeof stopStaffEventsPolling === 'function') {
    stopStaffEventsPolling();
  }

  if ((!state.user || state.user.role !== 'organizer' || organizerViews.indexOf(state.view) === -1) && typeof stopOrganizerHourlyCrowdPolling === 'function') {
    stopOrganizerHourlyCrowdPolling();
  }

  var app = document.getElementById('app');
  var v = state.view;

  if (!app) {
    document.body.innerHTML = '<h1 style="color:white;padding:40px;">App container not found</h1>';
    return;
  }

  var previousOrgMain = document.querySelector('.org-main');
  var preservedOrgMainScrollTop = options.preserveScroll && previousOrgMain
    ? previousOrgMain.scrollTop
    : 0;
  var preservedWindowScrollY = options.preserveScroll ? window.scrollY : 0;

  // Staff should never see the home page — redirect to their scanner
  if (v === 'home' && state.user && state.user.role === 'entry_staff') {
    navigate('scan');
    return;
  }

  if (v === 'home') {
    app.innerHTML = renderHome();
    setTimeout(function () {
      if (typeof syncSupportChatScroll === 'function') {
        syncSupportChatScroll();
      }
    }, 20);

  } else if (v === 'detail') {
    app.innerHTML = renderDetail();

    setTimeout(function () {
      if (typeof initEventDetailPage === 'function') {
        initEventDetailPage();
      }
    }, 20);

  } else if (v === 'login') {
    app.innerHTML = renderLogin();

  } else if (v === 'signup') {
    app.innerHTML = renderSignup();

  } else if (v === 'notifications') {
    app.innerHTML = renderNotifications();
    if (typeof startNotificationsPolling === 'function') {
      startNotificationsPolling();
    }
    if (state.user && state.user.role === 'organizer' && typeof startOrganizerHourlyCrowdPolling === 'function') {
      startOrganizerHourlyCrowdPolling();
    }

  } else if (v === 'customer-dashboard') {
    app.innerHTML = renderCustomerDashboard();

    setTimeout(function () {
      if (typeof syncSupportChatScroll === 'function') {
        syncSupportChatScroll();
      }
      if (typeof initCustomerDashboardCharts === 'function') {
        initCustomerDashboardCharts();
      }
    }, 20);

  } else if (v === 'dashboard') {
    if (!state.user || state.user.role !== 'organizer') {
      navigate('login');
      return;
    }
    app.innerHTML = renderDashboard();

    if (typeof startDashboardPolling === 'function') {
      startDashboardPolling();
    }
    if (typeof startOrganizerHourlyCrowdPolling === 'function') {
      startOrganizerHourlyCrowdPolling();
    }

    setTimeout(function () {
      if (typeof initDashboardCharts === 'function') {
        initDashboardCharts();
      }
    }, 20);

  } else if (v === 'my-events') {
    if (!state.user || state.user.role !== 'organizer') {
      navigate('login');
      return;
    }

    app.innerHTML = renderMyEvents();
    if (typeof startOrganizerHourlyCrowdPolling === 'function') {
      startOrganizerHourlyCrowdPolling();
    }

  } else if (v === 'reports') {
    if (!state.user || state.user.role !== 'organizer') {
      navigate('login');
      return;
    }

    app.innerHTML = renderReports();
    if (typeof startOrganizerHourlyCrowdPolling === 'function') {
      startOrganizerHourlyCrowdPolling();
    }

    setTimeout(function () {
      if (typeof initReportsCharts === 'function') {
        initReportsCharts();
      }
    }, 20);

  } else if (v === 'add-staff') {
    if (!state.user || state.user.role !== 'organizer') {
      navigate('login');
      return;
    }

    app.innerHTML = renderAddStaff();
    if (typeof startOrganizerHourlyCrowdPolling === 'function') {
      startOrganizerHourlyCrowdPolling();
    }

  } else if (v === 'create') {
    if (!state.user || state.user.role !== 'organizer') {
      navigate('login');
      return;
    }

    app.innerHTML = renderCreate();
    if (typeof startOrganizerHourlyCrowdPolling === 'function') {
      startOrganizerHourlyCrowdPolling();
    }
    setTimeout(function() {
      if (typeof initCreateEventForm === 'function') {
        initCreateEventForm();
      }
    }, 0);

  } else if (v === 'edit') {
    if (!state.user || state.user.role !== 'organizer') {
      navigate('login');
      return;
    }

    app.innerHTML = renderEdit();
    if (typeof startOrganizerHourlyCrowdPolling === 'function') {
      startOrganizerHourlyCrowdPolling();
    }
    setTimeout(function() {
      if (typeof initEditEventForm === 'function') {
        initEditEventForm();
      }
    }, 0);

  } else if (v === 'scan') {
    if (!state.user || state.user.role !== 'entry_staff') {
      state.loginRole = 'entry_staff';
      navigate('login');
      return;
    }

    app.innerHTML = renderScan();

  } else if (v === 'staff-settings') {
    if (!state.user || state.user.role !== 'entry_staff') {
      state.loginRole = 'entry_staff';
      navigate('login');
      return;
    }

    app.innerHTML = renderStaffSettings();

  } else if (v === 'admin-organizers') {
    if (!state.user || !state.user.is_admin) {
      navigate('login');
      return;
    }

    app.innerHTML = renderAdminOrganizers();

  } else {
    app.innerHTML = renderHome();
  }

  if (options.preserveScroll) {
    setTimeout(function() {
      var nextOrgMain = document.querySelector('.org-main');
      if (nextOrgMain) {
        nextOrgMain.scrollTop = preservedOrgMainScrollTop;
      } else {
        window.scrollTo(0, preservedWindowScrollY);
      }
    }, 0);
  } else {
    window.scrollTo(0, 0);
  }

  if (state.user && typeof _ensureUnreadPoll === 'function') {
    _ensureUnreadPoll();
  }
}


// ============================================================
//  HANDLE BACK / FORWARD
// ============================================================
window.onpopstate = function(event) {
  if (event.state) {
    state.view = event.state.view;
    state.params = event.state.params || {};
    render();
  }
};


// ============================================================
//  BOOT
// ============================================================
if (window.location.hash) {
  state.view = window.location.hash.replace('#', '');
}

// If a staff user has a saved session and lands on home, send them to scan
if (state.view === 'home' && state.user && state.user.role === 'entry_staff') {
  state.view = 'scan';
}

history.replaceState(
  { view: state.view, params: state.params },
  '',
  '#' + state.view
);

render();

if (typeof loadEvents === 'function') {
  loadEvents();
}

if (typeof validateSavedAuthSession === 'function') {
  validateSavedAuthSession();
}
