// ============================================================
//  STATE
// ============================================================
function getSavedUser() {
  try {
    var raw = localStorage.getItem('authUser');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    localStorage.removeItem('authUser');
    return null;
  }
}

function saveAuthUser(user) {
  state.user = user;
  try {
    localStorage.setItem('authUser', JSON.stringify(user));
  } catch (e) {}
}
window.saveAuthUser = saveAuthUser;

function clearAuthUser() {
  state.user = null;
  state.customerNotificationsDraft = null;
  state.customerHistory = [];
  state.customerHistoryLoading = false;
  state.customerHistoryLoaded = false;
  state.adminApplications = [];
  state.adminApplicationsLoaded = false;
  state.adminApplicationsLoading = false;
  state.organizerStaff = [];
  state.organizerStaffLoaded = false;
  state.organizerStaffLoading = false;
  state.latestCreatedStaff = null;
  state.supportChatContextKey = null;
  state.supportChatMessages = [];
  state.supportChatOpen = false;
  localStorage.removeItem('authUser');
}
window.clearAuthUser = clearAuthUser;

function resetEventState() {
  state.realEvents = [];
  state.eventsLoaded = false;
  state.eventsLoading = false;
  state.lastScanResultHtml = '';
  state.scanHistoryByEvent = {};
  state.scanValidationInFlight = false;
  state.staffEventsDataSignature = null;
}
window.resetEventState = resetEventState;

var state = {
  user: getSavedUser(),
  view: 'home',
  params: {},
  notifFilter: 'all',
  catFilter: 'all',
  searchQuery: '',
  loginRole: 'customer',
  signupRole: 'customer',
  signupNotificationsEnabled: true,
  dashboardMode: 'current',
  selectedDashboardEventId: null,
  detailViewMode: 'current',
  supportChatEventId: null,
  supportChatContextKey: null,
  supportChatMessages: [],
  supportChatOpen: false,
  adminApplications: [],
  adminApplicationsLoaded: false,
  adminApplicationsLoading: false,
  organizerStaff: [],
  organizerStaffLoaded: false,
  organizerStaffLoading: false,
  latestCreatedStaff: null,
  realNotifications: [],
  notificationsLoaded: false,
  notificationsLoading: false,
  notificationsPolling: null,
  notificationsDataSignature: null,
  customerPreferenceLoading: false,
  customerNotificationsDraft: null,
  customerHistory: [],
  customerHistoryLoading: false,
  customerHistoryLoaded: false,

  // events
  realEvents: [],
  eventsLoaded: false,
  eventsLoading: false,
  dashboardPolling: null,
  dashboardLastUpdated: null,
  dashboardDataSignature: null,
  organizerHourlyCrowdPolling: null,

  // scan
  lastScanResultHtml: '',
  scanHistoryByEvent: {},
  scanValidationInFlight: false,
  staffEventsDataSignature: null,

  // reports
  reportFilters: {
    eventId: '',
    start: '',
    end: ''
  },
  currentReport: null
};
var savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') {
  document.body.classList.add('light-mode');
}


// ============================================================
//  CHART REGISTRY
// ============================================================
var chartReg = {};

function destroyAllCharts() {
  Object.keys(chartReg).forEach(function(k) {
    try {
      chartReg[k].destroy();
    } catch (e) {}
    delete chartReg[k];
  });
}

function isProtectedView(view) {
  return ['dashboard', 'my-events', 'reports', 'add-staff', 'create', 'edit', 'scan', 'admin-organizers'].indexOf(view) !== -1;
}

async function validateSavedAuthSession() {
  if (!state.user || !state.user.id) return true;

  try {
    var response = await fetch('/api/auth/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: state.user.id,
        role: state.user.role
      })
    });

    var data = await response.json();

    if (response.ok && data.user) {
      saveAuthUser({
        id: data.user.id,
        name: data.user.full_name,
        email: data.user.email,
        role: data.user.role,
        is_admin: !!data.user.is_admin,
        approval_status: data.user.approval_status || 'approved',
        notifications_enabled: data.user.notifications_enabled !== false
      });
      return true;
    }

    var previousRole = state.user ? state.user.role : 'customer';
    clearAuthUser();
    resetEventState();
    state.loginRole = previousRole || 'customer';

    if (isProtectedView(state.view)) {
      state.view = 'login';
      state.params = {};
      if (typeof history !== 'undefined' && history.replaceState) {
        history.replaceState({ view: 'login', params: {} }, '', '#login');
      }
      if (typeof render === 'function') {
        render();
      }
    }

    if (typeof showToast === 'function') {
      showToast(data.message || 'Your saved session expired. Please sign in again.', 'error');
    }

    return false;
  } catch (error) {
    console.error('AUTH VALIDATION ERROR:', error);
    return false;
  }
}
window.validateSavedAuthSession = validateSavedAuthSession;
