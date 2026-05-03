// ============================================================
//  VIEW: ENTRY STAFF (SCANNER)
// ============================================================
var barcodeCameraStream = null;
var barcodeCameraDetector = null;
var barcodeCameraLoopId = null;
var barcodeCameraLastScanAt = 0;
var barcodeCameraActive = false;
var barcodeCameraReader = null;
var barcodeCameraControls = null;
var barcodeCameraMode = '';
var barcodeCameraDeviceId = '';
var barcodeCameraProcessing = false;
var barcodeCameraManualClose = false;
var staffEventsPolling = null;
var barcodeZXingLoadPromise = null;

function getStaffEventsSignature(items) {
  return JSON.stringify(items || []);
}

async function loadStaffEvents(silent) {
  silent = !!silent;
  if (!state.user || state.user.role !== 'entry_staff' || state.eventsLoading) {
    return;
  }

  state.eventsLoading = true;

  try {
    var response = await fetch('/api/staff/events/' + encodeURIComponent(state.user.id));
    var data = await response.json();

    if (!response.ok) {
      state.realEvents = [];
      state.eventsLoaded = true;
      state.eventsLoading = false;
      if (!silent) {
        showToast(data.message || 'Failed to load assigned events', 'error');
      }
      render();
      return;
    }

    var nextEvents = Array.isArray(data) ? data : [];
    var nextSignature = getStaffEventsSignature(nextEvents);
    var hasChanged = state.staffEventsDataSignature !== nextSignature;

    state.realEvents = nextEvents;
    state.eventsLoaded = true;
    state.eventsLoading = false;
    state.staffEventsDataSignature = nextSignature;

    if (!silent || hasChanged) {
      var activeElement = document.activeElement;
      var isTypingTicket = !!(activeElement && activeElement.id === 'ticket-input');
      if (!(silent && isTypingTicket)) {
        render({ preserveScroll: true });
      }
    }
  } catch (error) {
    console.error('LOAD STAFF EVENTS ERROR:', error);
    state.realEvents = [];
    state.eventsLoaded = true;
    state.eventsLoading = false;
    state.staffEventsDataSignature = getStaffEventsSignature([]);
    if (!silent) {
      showToast('Server error loading assigned events', 'error');
    }
    render();
  }
}
window.loadStaffEvents = loadStaffEvents;

function startStaffEventsPolling() {
  stopStaffEventsPolling();
  staffEventsPolling = setInterval(function() {
    if (state.view === 'scan' && state.user && state.user.role === 'entry_staff') {
      loadStaffEvents(true);
    }
  }, 6000);
}
window.startStaffEventsPolling = startStaffEventsPolling;

function stopStaffEventsPolling() {
  if (staffEventsPolling) {
    clearInterval(staffEventsPolling);
    staffEventsPolling = null;
  }
}
window.stopStaffEventsPolling = stopStaffEventsPolling;

function getSelectedStaffEvent() {
  var events = state.realEvents || [];
  var selectedEventId = (state.params && state.params.scanEvent !== undefined)
    ? parseInt(state.params.scanEvent, 10)
    : (events[0] ? events[0].id : null);

  return events.find(function(ev) {
    return Number(ev.id) === Number(selectedEventId);
  }) || events[0] || null;
}

function getStaffAlertConfig(eventData) {
  if (!eventData || !eventData.staff_alert_active) {
    return null;
  }

  var severity = eventData.staff_alert_severity || (eventData.emergency_active ? 'critical' : 'warning');
  var isCritical = severity === 'critical';

  return {
    title: eventData.staff_alert_title || (isCritical ? 'Event Alert' : 'Crowd Warning'),
    message: eventData.staff_alert_message || '',
    border: isCritical ? 'rgba(239,68,68,0.30)' : 'rgba(245,158,11,0.28)',
    background: isCritical ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.10)',
    color: isCritical ? '#fecaca' : '#fde68a'
  };
}

function renderStaffAlertBanner(eventData) {
  var alertConfig = getStaffAlertConfig(eventData);
  if (!alertConfig) return '';

  return '<div style="width:100%;padding:16px 18px;border-radius:16px;border:1px solid ' + alertConfig.border + ';background:' + alertConfig.background + ';color:' + alertConfig.color + ';">' +
    '<div style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:15px;letter-spacing:0.03em;margin-bottom:6px;">' + escapeHtml(alertConfig.title) + '</div>' +
    '<div style="font-size:13px;line-height:1.8;white-space:pre-line;">' + escapeHtml(alertConfig.message) + '</div>' +
    '</div>';
}

function getSelectedScanHistory() {
  var selectedEvent = getSelectedStaffEvent();
  var eventId = selectedEvent && selectedEvent.id != null ? String(selectedEvent.id) : 'default';
  return state.scanHistoryByEvent && state.scanHistoryByEvent[eventId]
    ? state.scanHistoryByEvent[eventId]
    : [];
}

function addScanHistoryEntry(eventId, entry) {
  if (eventId == null) return;
  state.scanHistoryByEvent = state.scanHistoryByEvent || {};
  var key = String(eventId);
  var current = Array.isArray(state.scanHistoryByEvent[key]) ? state.scanHistoryByEvent[key] : [];
  state.scanHistoryByEvent[key] = [entry].concat(current).slice(0, 40);
}

function renderScanHistory(entries) {
  entries = entries || [];
  if (!entries.length) {
    return '<div class="card" style="width:100%;padding:18px;">' +
      '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:16px;margin-bottom:6px;">Scan History</div>' +
      '<div style="font-size:13px;color:var(--muted);line-height:1.7;">Every valid, invalid, and used ticket will appear here automatically after each scan.</div>' +
    '</div>';
  }

  return '<div class="card" style="width:100%;padding:18px;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">' +
      '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:16px;">Scan History</div>' +
      '<div style="font-size:12px;color:var(--muted);">Latest ' + entries.length + ' checks</div>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:10px;">' +
      entries.map(function(item) {
        var palette = item.statusKey === 'valid'
          ? { border: 'rgba(34,197,94,0.35)', bg: 'rgba(34,197,94,0.10)', text: '#22C55E', pill: 'rgba(34,197,94,0.18)' }
          : (item.statusKey === 'used'
            ? { border: 'rgba(249,115,22,0.35)', bg: 'rgba(249,115,22,0.10)', text: '#F97316', pill: 'rgba(249,115,22,0.18)' }
            : { border: 'rgba(239,68,68,0.35)', bg: 'rgba(239,68,68,0.10)', text: '#EF4444', pill: 'rgba(239,68,68,0.18)' });
        return '<div style="padding:14px 15px;border-radius:14px;border:1px solid ' + palette.border + ';background:' + palette.bg + ';">' +
          '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px;">' +
            '<div>' +
              '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:14px;color:#fff;">' + escapeHtml(item.ticketCode || '-') + '</div>' +
              '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' + escapeHtml(formatStoredDateTime(item.createdAt || '')) + '</div>' +
            '</div>' +
            '<div style="padding:7px 10px;border-radius:999px;background:' + palette.pill + ';color:' + palette.text + ';font-size:11px;font-weight:800;letter-spacing:0.06em;">' + escapeHtml(item.statusLabel || 'UNKNOWN') + '</div>' +
          '</div>' +
          '<div style="font-size:13px;color:' + palette.text + ';font-weight:700;line-height:1.7;margin-bottom:4px;">' + escapeHtml(item.reason || '') + '</div>' +
          (item.meta
            ? '<div style="font-size:12px;color:var(--muted);line-height:1.7;">' + escapeHtml(item.meta) + '</div>'
            : '') +
        '</div>';
      }).join('') +
    '</div>' +
  '</div>';
}

function refreshScanHistoryPanel() {
  var historyEl = document.getElementById('scan-history');
  if (historyEl) {
    historyEl.innerHTML = renderScanHistory(getSelectedScanHistory());
  }
}

function setScanValidationBusy(isBusy) {
  state.scanValidationInFlight = !!isBusy;
  var input = document.getElementById('ticket-input');
  var button = document.getElementById('ticket-validate-btn');
  if (input) {
    input.disabled = !!isBusy;
  }
  if (button) {
    button.disabled = !!isBusy;
    button.style.opacity = isBusy ? '0.7' : '';
    button.style.cursor = isBusy ? 'wait' : '';
    button.textContent = isBusy ? 'Checking...' : 'Validate';
  }
}

function renderScan() {
  var shouldRestartCamera = barcodeCameraActive && !barcodeCameraManualClose;
  if (barcodeCameraActive) {
    stopBarcodeCamera(true);
  }
  if (shouldRestartCamera) {
    setTimeout(function() {
      if (document.getElementById('barcode-camera-preview')) {
        startBarcodeCamera();
      }
    }, 80);
  }

  startStaffEventsPolling();

  if (typeof subscribeToRealtimeUpdates === 'function') {
    subscribeToRealtimeUpdates();
  }

  var events = state.realEvents || [];

  if (!state.eventsLoaded && !state.eventsLoading) {
    loadStaffEvents();
  }

  if (state.eventsLoading && !events.length) {
    return '<div style="min-height:100vh;background:var(--dark);display:flex;align-items:center;justify-content:center;padding:24px;">' +
      '<div class="card" style="max-width:520px;padding:32px;text-align:center;">' +
        '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;margin-bottom:12px;">Loading Events...</h2>' +
        '<p style="color:var(--muted);">Please wait while the scanner loads real event data.</p>' +
      '</div>' +
    '</div>';
  }

  if (!events.length) {
    return '<div style="min-height:100vh;background:var(--dark);display:flex;align-items:center;justify-content:center;padding:24px;">' +
      '<div class="card" style="max-width:520px;padding:32px;text-align:center;">' +
        '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;margin-bottom:12px;">No Real Events Available</h2>' +
        '<p style="color:var(--muted);margin-bottom:20px;">The scanner only works with events loaded from the database.</p>' +
        '<button class="btn-primary" onclick="navigate(\'home\')">Back to Home</button>' +
      '</div>' +
    '</div>';
  }

  var currentEvent = getSelectedStaffEvent();
  var selectedEventId = currentEvent ? currentEvent.id : null;

  var attendanceCount = currentEvent ? Number(currentEvent.attendance_count || 0) : 0;
  var ticketsSold = currentEvent ? Number(currentEvent.tickets_sold || 0) : 0;
  var remainingEntries = currentEvent ? Math.max(Number(currentEvent.capacity || 0) - attendanceCount, 0) : 0;
  var evName = currentEvent ? currentEvent.name : 'Select Event';
  var runtime = getEventRuntimeState(currentEvent);
  var entryLocked = !!(currentEvent && currentEvent.entry_locked);
  var staffStatusLabel = currentEvent && currentEvent.staff_work_status_label ? currentEvent.staff_work_status_label : 'Active';
  var statusBanner = runtime.statusMessage
    ? '<div style="width:100%;padding:12px 14px;border-radius:14px;background:' + (runtime.isEnded ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)') + ';border:1px solid ' + (runtime.isEnded ? 'rgba(239,68,68,0.24)' : 'rgba(245,158,11,0.24)') + ';font-size:13px;line-height:1.7;color:' + (runtime.isEnded ? '#fecaca' : '#fde68a') + ';">' + escapeHtml(runtime.statusMessage) + '</div>'
    : '';
  var staffAlertBanner = renderStaffAlertBanner(currentEvent);
  var scanHistory = getSelectedScanHistory();

  var staffName = (state.user && state.user.name) ? escapeHtml(state.user.name) : 'Staff';
  var isActive = staffStatusLabel === 'Active' || staffStatusLabel === 'active';
  var statusDotColor = isActive ? '#22C55E' : '#F59E0B';
  var statusCardBg   = isActive ? 'rgba(34,197,94,0.08)'  : 'rgba(245,158,11,0.08)';
  var statusCardBdr  = isActive ? 'rgba(34,197,94,0.22)'  : 'rgba(245,158,11,0.22)';

  return '<div style="min-height:100vh;background:var(--dark);display:flex;flex-direction:column;">' +

    /* \u2500\u2500 HEADER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    '<header style="background:var(--dark2);border-bottom:1px solid var(--border);padding:0 16px;">' +

      /* Row 1: logo + title | icon actions */
      '<div style="height:56px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:10px;min-width:0;">' +
          '<img src="' + LOGO + '" alt="Crowd Analyzing" style="height:28px;flex-shrink:0;" />' +
          '<div style="min-width:0;">' +
            '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:13px;line-height:1.2;">Staff Portal</div>' +
            '<div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + staffName + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">' +
          '<button class="btn-ghost" style="position:relative;font-size:18px;padding:8px 10px;line-height:1;" onclick="openStaffChatPicker()" aria-label="Chat">\uD83D\uDCAC<span class="chat-unread-badge"></span></button>' +
          '<button class="btn-ghost" style="font-size:18px;padding:8px 10px;line-height:1;" onclick="navigate(\'staff-settings\')" aria-label="Settings">\u2699\uFE0F</button>' +
          '<button class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle theme" id="theme-btn">' + (document.documentElement.getAttribute('data-theme') === 'light' ? '\u2600\uFE0F' : '\uD83C\uDF19') + '</button>' +
          '<button class="btn-ghost" style="font-size:11px;padding:6px 10px;font-family:\'Montserrat\',sans-serif;font-weight:700;" onclick="logout()">Logout</button>' +
        '</div>' +
      '</div>' +

    '</header>' +

    /* \u2500\u2500 MAIN \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    '<main style="flex:1;display:flex;flex-direction:column;align-items:center;padding:20px 16px 32px;gap:16px;max-width:600px;margin:0 auto;width:100%;box-sizing:border-box;">' +

      /* Status card \u2500\u2500 Staff Status + Current Event */
      '<div style="width:100%;display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +

        '<div style="padding:14px 16px;border-radius:16px;background:' + statusCardBg + ';border:1px solid ' + statusCardBdr + ';">' +
          '<div style="font-size:10px;font-family:\'Montserrat\',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:8px;">Staff Status</div>' +
          '<div style="display:flex;align-items:center;gap:7px;">' +
            '<span style="width:9px;height:9px;border-radius:50%;background:' + statusDotColor + ';box-shadow:0 0 7px ' + statusDotColor + ';flex-shrink:0;"></span>' +
            '<span style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:14px;color:' + statusDotColor + ';">' + escapeHtml(staffStatusLabel) + '</span>' +
          '</div>' +
        '</div>' +

        '<div style="padding:14px 16px;border-radius:16px;background:rgba(155,16,64,0.08);border:1px solid rgba(155,16,64,0.22);">' +
          '<div style="font-size:10px;font-family:\'Montserrat\',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:8px;">Current Event</div>' +
          '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(evName) + '</div>' +
        '</div>' +

      '</div>' +

      /* Event selector (only if more than 1 event) */
      (events.length > 1
        ? '<div style="width:100%;">' +
            '<label class="field-label">Select Event</label>' +
            '<select class="input-field" style="font-size:14px;" onchange="state.params = state.params || {}; state.params.scanEvent=this.value; state.lastScanResultHtml=\'\'; navigate(\'scan\', state.params)">' +
              events.map(function(e) {
                return '<option value="' + e.id + '" ' + (Number(e.id) === Number(selectedEventId) ? 'selected' : '') + '>' + e.name + '</option>';
              }).join('') +
            '</select>' +
          '</div>'
        : '') +

      /* Runtime / alert banners */
      (statusBanner ? '<div style="width:100%;">' + statusBanner + '</div>' : '') +
      (staffAlertBanner ? '<div style="width:100%;">' + staffAlertBanner + '</div>' : '') +

      /* Scanner area */
      '<div class="scan-area" style="width:100%;max-width:360px;aspect-ratio:1;border:3px solid rgba(155,16,64,0.5);border-radius:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:rgba(155,16,64,0.04);position:relative;overflow:hidden;">' +
        '<div style="position:absolute;inset:0;background:radial-gradient(circle,rgba(155,16,64,0.06) 0%,transparent 70%);pointer-events:none;"></div>' +
        '<div style="position:absolute;top:12px;left:12px;width:24px;height:24px;border-top:3px solid #9B1040;border-left:3px solid #9B1040;border-radius:4px 0 0 0;"></div>' +
        '<div style="position:absolute;top:12px;right:12px;width:24px;height:24px;border-top:3px solid #9B1040;border-right:3px solid #9B1040;border-radius:0 4px 0 0;"></div>' +
        '<div style="position:absolute;bottom:12px;left:12px;width:24px;height:24px;border-bottom:3px solid #9B1040;border-left:3px solid #9B1040;border-radius:0 0 0 4px;"></div>' +
        '<div style="position:absolute;bottom:12px;right:12px;width:24px;height:24px;border-bottom:3px solid #9B1040;border-right:3px solid #9B1040;border-radius:0 0 4px 0;"></div>' +
        '<video id="barcode-camera-preview" playsinline webkit-playsinline autoplay muted style="display:none;width:100%;height:100%;object-fit:cover;"></video>' +
        '<div id="barcode-camera-placeholder" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;">' +
          '<div style="font-family:\'Montserrat\',sans-serif;font-weight:700;font-size:14px;letter-spacing:0.12em;color:rgba(155,16,64,0.8);">SCANNER READY</div>' +
          '<div style="font-size:12px;color:var(--muted);text-align:center;max-width:220px;">Enter a ticket code or open the camera to scan the barcode directly.</div>' +
        '</div>' +
      '</div>' +

      /* Camera buttons */
      '<div style="width:100%;display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
        '<button class="btn-primary" style="justify-content:center;' + (entryLocked ? 'opacity:0.6;cursor:not-allowed;' : '') + '" onclick="startBarcodeCamera()" ' + (entryLocked ? 'disabled' : '') + '>Open Camera</button>' +
        '<button class="btn-ghost" style="justify-content:center;" onclick="stopBarcodeCamera()">Close Camera</button>' +
      '</div>' +

      /* Ticket code input */
      '<div style="width:100%;">' +
        '<label class="field-label">Ticket Code</label>' +
        '<div style="display:flex;gap:10px;">' +
          '<input type="text" class="input-field" id="ticket-input" placeholder="e.g. TKT-0001" style="font-size:16px;font-family:\'Montserrat\',sans-serif;font-weight:700;letter-spacing:0.08em;text-align:center;' + (entryLocked ? 'opacity:0.7;' : '') + '" onkeydown="if(event.key===\'Enter\' && !event.repeat){event.preventDefault();validateTicket();}" ' + (entryLocked ? 'disabled' : '') + ' />' +
          '<button class="btn-primary" id="ticket-validate-btn" style="white-space:nowrap;flex-shrink:0;' + (entryLocked ? 'opacity:0.6;cursor:not-allowed;' : '') + '" onclick="validateTicket()" ' + (entryLocked ? 'disabled' : '') + '>' + (state.scanValidationInFlight ? 'Checking...' : 'Validate') + '</button>' +
        '</div>' +
      '</div>' +

      /* Scan result */
      '<div id="scan-result" style="width:100%;">' + (state.lastScanResultHtml || '') + '</div>' +

      /* Stats row */
      '<div style="width:100%;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;" id="scan-stats">' +
        [
          { label:'Tickets Sold', val: ticketsSold,      color: '#9B1040' },
          { label:'Attendance',   val: attendanceCount,  color: '#22C55E' },
          { label:'Remaining',    val: remainingEntries, color: '#F59E0B' }
        ].map(function(s) {
          return '<div class="stat-card" style="text-align:center;padding:14px 8px;">' +
            '<div style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:26px;color:' + s.color + ';margin-bottom:3px;">' + s.val + '</div>' +
            '<div style="font-size:11px;color:var(--muted);font-family:\'Montserrat\',sans-serif;font-weight:600;">' + s.label + '</div>' +
          '</div>';
        }).join('') +
      '</div>' +

      '<div id="scan-history" style="width:100%;">' + renderScanHistory(scanHistory) + '</div>' +

    '</main>' +
  '</div>';
}

async function startBarcodeCamera() {
  var video = document.getElementById('barcode-camera-preview');
  var placeholder = document.getElementById('barcode-camera-placeholder');
  var selectedEvent = getSelectedStaffEvent();
  var runtime = getEventRuntimeState(selectedEvent);

  if (!video) return;

  if (selectedEvent && selectedEvent.entry_locked) {
    showToast(selectedEvent.staff_alert_message || 'Entry actions are currently locked for this event', 'error');
    return;
  }

  if (runtime.isUpcoming) {
    showToast('Event has not started yet', 'error');
    return;
  }

  if (runtime.isEnded) {
    showToast('Event has ended', 'error');
    return;
  }

  if (!window.isSecureContext) {
    showToast('Camera access requires HTTPS or localhost. Open the staff page from a secure link first.', 'error');
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Camera access is not supported on this device', 'error');
    return;
  }

  try {
    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      try {
        var permissionState = await navigator.permissions.query({ name: 'camera' });
        if (permissionState && permissionState.state === 'denied') {
          showToast('Camera permission is blocked in your browser. Allow camera access for this site, then try again.', 'error');
          return;
        }
      } catch (permissionError) {}
    }

    barcodeCameraManualClose = false;
    stopBarcodeCamera(true);

    var started = false;
    if (typeof BarcodeDetector !== 'undefined') {
      started = await startNativeBarcodeCamera(video, placeholder);
    }

    if (!started) {
      started = await startZXingBarcodeCamera(video, placeholder);
    }

    if (!started) {
      showToast('Barcode scanning is not supported in this browser', 'error');
      return;
    }

    showToast('Camera opened. Point it at the ticket barcode.', 'success');
  } catch (error) {
    console.error('BARCODE CAMERA ERROR:', error);
    stopBarcodeCamera(true);
    if (error && error.name === 'NotAllowedError') {
      showToast('Camera permission was denied. Please allow camera access for the staff page.', 'error');
      return;
    }
    if (error && error.name === 'NotFoundError') {
      showToast('No camera was found on this device.', 'error');
      return;
    }
    showToast('Unable to open the camera for barcode scanning', 'error');
  }
}
window.startBarcodeCamera = startBarcodeCamera;

function loadExternalScript(url) {
  return new Promise(function(resolve, reject) {
    var existing = document.querySelector('script[data-dynamic-src="' + url + '"]');
    if (existing) {
      if (existing.getAttribute('data-loaded') === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', function() { resolve(); }, { once: true });
      existing.addEventListener('error', function() { reject(new Error('Failed to load script: ' + url)); }, { once: true });
      return;
    }

    var script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.setAttribute('data-dynamic-src', url);
    script.onload = function() {
      script.setAttribute('data-loaded', 'true');
      resolve();
    };
    script.onerror = function() {
      reject(new Error('Failed to load script: ' + url));
    };
    document.head.appendChild(script);
  });
}

async function ensureZXingLoaded() {
  if (window.ZXing && typeof window.ZXing.BrowserMultiFormatReader === 'function') {
    return true;
  }

  if (!barcodeZXingLoadPromise) {
    barcodeZXingLoadPromise = (async function() {
      var sources = [
        'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js',
        'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js'
      ];

      for (var i = 0; i < sources.length; i += 1) {
        try {
          await loadExternalScript(sources[i]);
          if (window.ZXing && typeof window.ZXing.BrowserMultiFormatReader === 'function') {
            return true;
          }
        } catch (error) {}
      }

      return false;
    })();
  }

  return !!(await barcodeZXingLoadPromise);
}

async function getPreferredCameraConstraints() {
  var fallbackConstraints = {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 }
  };

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
    return fallbackConstraints;
  }

  try {
    var devices = await navigator.mediaDevices.enumerateDevices();
    var videoInputs = devices.filter(function(device) {
      return device && device.kind === 'videoinput';
    });

    if (!videoInputs.length) {
      return fallbackConstraints;
    }

    var rearCamera = videoInputs.find(function(device) {
      return /(back|rear|environment|world|traseira|trasera|hinten)/i.test(String(device.label || ''));
    });

    var preferredCamera = rearCamera || videoInputs[videoInputs.length - 1];
    if (preferredCamera && preferredCamera.deviceId) {
      barcodeCameraDeviceId = preferredCamera.deviceId;
      return {
        deviceId: { exact: preferredCamera.deviceId },
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      };
    }
  } catch (error) {}

  return fallbackConstraints;
}

async function startNativeBarcodeCamera(video, placeholder) {
  try {
    if (typeof BarcodeDetector.getSupportedFormats === 'function') {
      var supportedFormats = await BarcodeDetector.getSupportedFormats();
      var preferredFormats = ['code_39', 'code_128', 'ean_13', 'ean_8', 'qr_code'];
      var usableFormats = preferredFormats.filter(function(format) {
        return supportedFormats.indexOf(format) !== -1;
      });
      barcodeCameraDetector = new BarcodeDetector({
        formats: usableFormats.length ? usableFormats : supportedFormats
      });
    } else {
      barcodeCameraDetector = new BarcodeDetector();
    }

    var videoConstraints = await getPreferredCameraConstraints();

    barcodeCameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: videoConstraints.deviceId,
        facingMode: videoConstraints.facingMode,
        width: videoConstraints.width,
        height: videoConstraints.height
      },
      audio: false
    });

    video.srcObject = barcodeCameraStream;
    await video.play();
    video.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
    barcodeCameraActive = true;
    barcodeCameraMode = 'native';
    barcodeCameraLastScanAt = 0;
    barcodeCameraLoop();
    return true;
  } catch (error) {
    console.error('NATIVE BARCODE CAMERA ERROR:', error);
    stopBarcodeCamera(true);
    return false;
  }
}

async function startZXingBarcodeCamera(video, placeholder) {
  var zxingReady = await ensureZXingLoaded();
  if (!zxingReady || !window.ZXing || typeof window.ZXing.BrowserMultiFormatReader !== 'function') {
    return false;
  }

  try {
    var hints = new Map();
    hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      window.ZXing.BarcodeFormat.CODE_39,
      window.ZXing.BarcodeFormat.CODE_128,
      window.ZXing.BarcodeFormat.EAN_13,
      window.ZXing.BarcodeFormat.EAN_8,
      window.ZXing.BarcodeFormat.QR_CODE
    ]);

    barcodeCameraReader = new window.ZXing.BrowserMultiFormatReader(hints, 300);
    barcodeCameraMode = 'zxing';
    barcodeCameraActive = true;

    var videoConstraints = await getPreferredCameraConstraints();

    var handleZXingResult = function(result, err) {
      if (!barcodeCameraActive || barcodeCameraProcessing) return;
      if (result && result.getText) {
        applyScannedTicketCode(result.getText());
      } else if (result && result.text) {
        applyScannedTicketCode(result.text);
      }
    };

    try {
      barcodeCameraControls = await barcodeCameraReader.decodeFromConstraints(
        {
          video: {
            deviceId: videoConstraints.deviceId,
            facingMode: videoConstraints.facingMode,
            width: videoConstraints.width,
            height: videoConstraints.height
          }
        },
        video,
        handleZXingResult
      );
    } catch (constraintError) {
      var fallbackDeviceId = videoConstraints.deviceId && videoConstraints.deviceId.exact
        ? videoConstraints.deviceId.exact
        : undefined;
      barcodeCameraControls = await barcodeCameraReader.decodeFromVideoDevice(
        fallbackDeviceId,
        video,
        handleZXingResult
      );
    }

    video.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
    return true;
  } catch (error) {
    console.error('ZXING BARCODE CAMERA ERROR:', error);
    stopBarcodeCamera(true);
    return false;
  }
}

function stopBarcodeCamera(silent) {
  silent = !!silent;
  if (barcodeCameraLoopId) {
    cancelAnimationFrame(barcodeCameraLoopId);
    barcodeCameraLoopId = null;
  }
  if (barcodeCameraStream) {
    barcodeCameraStream.getTracks().forEach(function(track) {
      track.stop();
    });
    barcodeCameraStream = null;
  }

  if (barcodeCameraControls && typeof barcodeCameraControls.stop === 'function') {
    try {
      barcodeCameraControls.stop();
    } catch (e) {}
    barcodeCameraControls = null;
  }

  if (barcodeCameraReader && typeof barcodeCameraReader.reset === 'function') {
    try {
      barcodeCameraReader.reset();
    } catch (e) {}
    barcodeCameraReader = null;
  }

  barcodeCameraActive = false;
  barcodeCameraDetector = null;
  barcodeCameraMode = '';
  barcodeCameraDeviceId = '';
  barcodeCameraProcessing = false;
  var video = document.getElementById('barcode-camera-preview');
  var placeholder = document.getElementById('barcode-camera-placeholder');
  if (video) {
    video.pause();
    video.srcObject = null;
    video.style.display = 'none';
  }
  if (placeholder) {
    placeholder.style.display = 'flex';
  }

  if (!silent) {
    barcodeCameraManualClose = true;
    showToast('Camera closed', 'success');
  }
}
window.stopBarcodeCamera = stopBarcodeCamera;

function barcodeCameraLoop() {
  if (!barcodeCameraActive || barcodeCameraMode !== 'native') return;

  var video = document.getElementById('barcode-camera-preview');
  if (!video || !barcodeCameraDetector) {
    stopBarcodeCamera(true);
    return;
  }

  barcodeCameraLoopId = requestAnimationFrame(barcodeCameraLoop);

  if (video.readyState < 2) {
    return;
  }

  if (Date.now() - barcodeCameraLastScanAt < 350) {
    return;
  }

  barcodeCameraLastScanAt = Date.now();
  barcodeCameraDetector.detect(video).then(function(barcodes) {
    if (!barcodeCameraActive || !barcodes || !barcodes.length) return;

    var rawValue = '';
    for (var i = 0; i < barcodes.length; i += 1) {
      if (barcodes[i] && barcodes[i].rawValue) {
        rawValue = normalizeTicketCode(barcodes[i].rawValue);
        if (rawValue) break;
      }
    }

    if (!rawValue) return;

    var input = document.getElementById('ticket-input');
    applyScannedTicketCode(rawValue);
  }).catch(function(error) {
    console.error('BARCODE DETECT ERROR:', error);
  });
}

function applyScannedTicketCode(value) {
  var normalized = normalizeTicketCode(value);
  if (!normalized) return;

  if (barcodeCameraProcessing) return;
  barcodeCameraProcessing = true;

  var input = document.getElementById('ticket-input');
  if (input) {
    input.value = normalized;
  }

  // Flash the scan area green so staff sees the scan was captured
  var scanArea = document.querySelector('.scan-area');
  if (scanArea) {
    scanArea.style.transition = 'border-color 0.15s ease';
    scanArea.style.borderColor = '#22C55E';
    setTimeout(function() {
      scanArea.style.borderColor = 'rgba(155,16,64,0.5)';
    }, 500);
  }

  // Extend native detection cooldown by ~2 s so the same ticket isn't re-scanned
  barcodeCameraLastScanAt = Date.now() + 1650;

  validateTicket();

  // Release processing lock after 2 s
  setTimeout(function() {
    barcodeCameraProcessing = false;
  }, 2000);
}

function buildScanResultCard(options) {
  options = options || {};
  var tone = options.tone === 'success' || options.tone === 'used' ? options.tone : 'error';
  var icon = options.icon || (tone === 'success' ? 'OK' : (tone === 'used' ? '!' : 'X'));
  var title = options.title || (tone === 'success' ? 'VALID TICKET' : (tone === 'used' ? 'USED TICKET' : 'INVALID TICKET'));
  var reason = options.reason || '';
  var detail = options.detail || '';
  var meta = options.meta || '';
  var palette = tone === 'success'
    ? {
        background: 'rgba(34,197,94,0.10)',
        border: 'rgba(34,197,94,0.40)',
        title: '#22C55E',
        text: '#d1fae5'
      }
    : (tone === 'used'
      ? {
          background: 'rgba(249,115,22,0.10)',
          border: 'rgba(249,115,22,0.40)',
          title: '#F97316',
          text: '#fed7aa'
        }
      : {
          background: 'rgba(239,68,68,0.10)',
          border: 'rgba(239,68,68,0.40)',
          title: '#EF4444',
          text: '#fecaca'
        });

  return '<div style="background:' + palette.background + ';border:2px solid ' + palette.border + ';border-radius:14px;padding:20px;text-align:center;">' +
    '<div style="font-size:40px;margin-bottom:8px;">' + escapeHtml(icon) + '</div>' +
    '<div style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:20px;color:' + palette.title + ';margin-bottom:8px;">' + escapeHtml(title) + '</div>' +
    (detail
      ? '<div style="font-family:\'Montserrat\',sans-serif;font-weight:700;font-size:14px;margin-bottom:10px;color:#fff;">' + escapeHtml(detail) + '</div>'
      : '') +
    (reason
      ? '<div style="font-size:14px;line-height:1.8;color:' + palette.text + ';margin-bottom:' + (meta ? '10px' : '0') + ';">' + escapeHtml(reason) + '</div>'
      : '') +
    (meta
      ? '<div style="font-size:12px;color:var(--muted);line-height:1.7;">' + escapeHtml(meta) + '</div>'
      : '') +
    '</div>';
}

function setScanResultCard(resultEl, options) {
  var html = buildScanResultCard(options);
  state.lastScanResultHtml = html;
  if (resultEl) resultEl.innerHTML = html;
}

function mapScanOutcomeToHistory(ticketCode, options) {
  options = options || {};
  var tone = options.tone === 'success' || options.tone === 'used' ? options.tone : 'error';
  return {
    ticketCode: ticketCode || '-',
    statusKey: tone === 'success' ? 'valid' : (tone === 'used' ? 'used' : 'invalid'),
    statusLabel: options.title || (tone === 'success' ? 'VALID TICKET' : (tone === 'used' ? 'USED TICKET' : 'INVALID TICKET')),
    reason: options.reason || '',
    meta: options.meta || '',
    createdAt: new Date().toISOString()
  };
}


// ============================================================
//  SCAN ACTION
// ============================================================
async function validateTicket() {
  var input = document.getElementById('ticket-input');
  if (!input) return;
  if (state.scanValidationInFlight) return;

  var code = normalizeTicketCode(input.value);
  var resultEl = document.getElementById('scan-result');
  var events = state.realEvents || [];
  var selectedEvent = getSelectedStaffEvent();
  var selectedEventId = selectedEvent ? selectedEvent.id : null;
  var staffId = state.user && state.user.id ? state.user.id : null;
  var runtime = getEventRuntimeState(selectedEvent);

  if (!code) {
    showToast('Please enter a ticket code', 'error');
    return;
  }

  if (!selectedEventId) {
    showToast('Please select an event', 'error');
    return;
  }

  if (!staffId) {
    showToast('Staff user not found', 'error');
    return;
  }

  if (runtime.isUpcoming) {
    var upcomingOptions = {
      title: 'EVENT NOT STARTED',
      reason: 'Event has not started yet',
      meta: 'Scanning is not available until the event start time.'
    };
    setScanResultCard(resultEl, upcomingOptions);
    addScanHistoryEntry(selectedEventId, mapScanOutcomeToHistory(code, upcomingOptions));
    refreshScanHistoryPanel();
    return;
  }

  if (runtime.isEnded) {
    var endedOptions = {
      title: 'EVENT ENDED',
      reason: 'Event has ended',
      meta: 'Scanning is closed because the event is already finished.'
    };
    setScanResultCard(resultEl, endedOptions);
    addScanHistoryEntry(selectedEventId, mapScanOutcomeToHistory(code, endedOptions));
    refreshScanHistoryPanel();
    return;
  }

  if (selectedEvent && selectedEvent.entry_locked) {
    var lockedOptions = {
      title: selectedEvent.emergency_active ? 'EMERGENCY ACTIVE' : 'SCANNING BLOCKED',
      reason: selectedEvent.emergency_active
        ? 'Emergency active, scanning is blocked'
        : (selectedEvent.staff_alert_message || 'Entry actions are currently locked for this event'),
      meta: selectedEvent.entry_lock_reason ? 'Reason: ' + String(selectedEvent.entry_lock_reason).replace(/_/g, ' ') : ''
    };
    setScanResultCard(resultEl, lockedOptions);
    addScanHistoryEntry(selectedEventId, mapScanOutcomeToHistory(code, lockedOptions));
    refreshScanHistoryPanel();
    return;
  }

  try {
    setScanValidationBusy(true);
    var response = await fetch('/api/events/' + selectedEventId + '/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staff_id: staffId,
        ticket_code: code
      })
    });

    var data = await response.json();

    if (response.ok) {
      state.realEvents = events.map(function(ev) {
        if (Number(ev.id) !== Number(selectedEventId)) return ev;
        return Object.assign({}, ev, {
          attendance_count: data.attendance_count,
          crowd_level: data.crowd_level,
          tickets_sold: data.tickets_sold,
          prediction: data.prediction || ev.prediction,
          time_status: 'live',
          staff_alert_active: data.staff_alert_active,
          staff_alert_type: data.staff_alert_type,
          staff_alert_severity: data.staff_alert_severity,
          staff_alert_title: data.staff_alert_title,
          staff_alert_message: data.staff_alert_message,
          entry_locked: data.entry_locked,
          entry_lock_reason: data.entry_lock_reason,
          emergency_active: data.emergency_active,
          emergency_message: data.emergency_message
        });
      });
      state.staffEventsDataSignature = getStaffEventsSignature(state.realEvents);

      if (typeof applyRealtimeEventUpdate === 'function') {
        applyRealtimeEventUpdate(selectedEventId, {
          attendance_count: data.attendance_count,
          crowd_level: data.crowd_level,
          tickets_sold: data.tickets_sold,
          capacity: selectedEvent ? selectedEvent.capacity : 0,
          prediction: data.prediction,
          staff_alert_active: data.staff_alert_active,
          staff_alert_type: data.staff_alert_type,
          staff_alert_severity: data.staff_alert_severity,
          staff_alert_title: data.staff_alert_title,
          staff_alert_message: data.staff_alert_message,
          entry_locked: data.entry_locked,
          entry_lock_reason: data.entry_lock_reason,
          emergency_active: data.emergency_active,
          emergency_message: data.emergency_message
        });
        resultEl = document.getElementById('scan-result');
      }

      var successOptions = {
        tone: 'success',
        icon: 'OK',
        title: 'VALID TICKET',
        detail: (data.ticket_code || '') + (data.customer_name ? ' - ' + data.customer_name : ''),
        reason: 'Ticket verified successfully',
        meta: 'Attendance: ' + data.attendance_count + ' | Crowd Level: ' + data.crowd_level + ' | Ticket Status: ' + (data.ticket_status || 'Done')
      };
      setScanResultCard(resultEl, successOptions);
      addScanHistoryEntry(selectedEventId, mapScanOutcomeToHistory(data.ticket_code || code, successOptions));
      refreshScanHistoryPanel();
    } else if (response.status === 409) {
      var usedOptions = {
        tone: 'used',
        title: 'USED TICKET',
        reason: 'This ticket has already been used',
        meta: data.message || 'Ticket already used'
      };
      setScanResultCard(resultEl, usedOptions);
      addScanHistoryEntry(selectedEventId, mapScanOutcomeToHistory(code, usedOptions));
      refreshScanHistoryPanel();
    } else if (response.status === 423) {
      var blockedOptions = {
        title: data.message && String(data.message).toLowerCase().indexOf('emergency') !== -1 ? 'EMERGENCY ACTIVE' : 'SCANNING BLOCKED',
        reason: data.message && String(data.message).toLowerCase().indexOf('emergency') !== -1
          ? 'Emergency active, scanning is blocked'
          : 'Scanning is blocked for this event',
        meta: data.message || 'Entry actions are currently locked for this event.'
      };
      setScanResultCard(resultEl, blockedOptions);
      addScanHistoryEntry(selectedEventId, mapScanOutcomeToHistory(code, blockedOptions));
      refreshScanHistoryPanel();
    } else {
      var serverMessage = data.message || 'Ticket not found';
      var loweredMessage = String(serverMessage).toLowerCase();
      var stateTitle = loweredMessage.indexOf('not started') !== -1
        ? 'EVENT NOT STARTED'
        : (loweredMessage.indexOf('has ended') !== -1 ? 'EVENT ENDED' : 'INVALID TICKET');
      var reason = loweredMessage.indexOf('ticket not for this event') !== -1
        ? 'Ticket not for this event'
        : (loweredMessage.indexOf('ticket not found') !== -1
          ? 'Ticket not found'
          : serverMessage);
      var meta = loweredMessage.indexOf('ticket not for this event') !== -1
        ? 'This ticket belongs to a different event.'
        : (loweredMessage.indexOf('ticket not found') !== -1
          ? 'The entered ticket code does not match any ticket for this event.'
          : serverMessage);
      var invalidOptions = {
        title: stateTitle,
        reason: reason,
        meta: meta
      };
      setScanResultCard(resultEl, invalidOptions);
      addScanHistoryEntry(selectedEventId, mapScanOutcomeToHistory(code, invalidOptions));
      refreshScanHistoryPanel();
    }
    renderScanStats(selectedEventId);

    input.value = '';
    input.focus();
  } catch (error) {
    console.error(error);
    var serverErrorOptions = {
      title: 'SERVER ERROR',
      reason: 'Unable to validate ticket right now',
      meta: 'Please try again in a moment.'
    };
    setScanResultCard(resultEl, serverErrorOptions);
    addScanHistoryEntry(selectedEventId, mapScanOutcomeToHistory(code, serverErrorOptions));
    refreshScanHistoryPanel();
  } finally {
    setScanValidationBusy(false);
  }
}


// ============================================================
//  SCAN STATS
// ============================================================
function renderScanStats(selectedEventId) {
  var statsEl = document.getElementById('scan-stats');
  if (!statsEl) return;

  var eventData = (state.realEvents || []).find(function(ev) {
    return Number(ev.id) === Number(selectedEventId);
  });

  var attendanceCount = eventData ? Number(eventData.attendance_count || 0) : 0;
  var ticketsSold = eventData ? Number(eventData.tickets_sold || 0) : 0;
  var remainingEntries = eventData ? Math.max(Number(eventData.capacity || 0) - attendanceCount, 0) : 0;

  statsEl.innerHTML = [
    { label:'Tickets Sold', val: ticketsSold, color: '#9B1040' },
    { label:'Attendance', val: attendanceCount, color: '#22C55E' },
    { label:'Remaining', val: remainingEntries, color: '#F59E0B' }
  ].map(function(s) {
    return '<div class="stat-card" style="text-align:center;padding:16px;">' +
      '<div style="font-weight:900;font-size:28px;color:' + s.color + ';">' + s.val + '</div>' +
      '<div style="font-size:12px;color:var(--muted);">' + s.label + '</div>' +
    '</div>';
  }).join('');
}

window.validateTicket = validateTicket;


// ============================================================
//  VIEW: STAFF SETTINGS
// ============================================================
function renderStaffSettings() {
  if (!state.user || state.user.role !== 'entry_staff') {
    navigate('login');
    return '<div></div>';
  }

  var events = state.realEvents || [];
  var currentEvent = getSelectedStaffEvent();
  var rawStatus = currentEvent ? (currentEvent.staff_work_status || 'active') : 'active';
  var isWorking = rawStatus === 'active' || rawStatus === 'extra_work';
  var statusLabel = isWorking ? 'Active — Currently Working' : 'Off Duty — Not Working';
  var statusColor = isWorking ? '#22C55E' : '#F59E0B';
  var btnLabel = isWorking ? 'Stop Working' : 'Start Working';
  var btnColor = isWorking ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)';
  var btnBorder = isWorking ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)';
  var btnTextColor = isWorking ? '#EF4444' : '#22C55E';
  var newStatus = isWorking ? 'stop_working' : 'active';
  var evName = currentEvent ? currentEvent.name : 'No event assigned';

  return '<div style="min-height:100vh;background:var(--dark);display:flex;flex-direction:column;">' +
    '<header style="background:var(--dark2);border-bottom:1px solid var(--border);padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between;">' +
      '<div style="display:flex;align-items:center;gap:12px;">' +
        '<img src="' + LOGO + '" alt="Crowd Analyzing" style="height:32px;" />' +
        '<div style="width:1px;height:24px;background:var(--border);"></div>' +
        '<div style="font-family:\'Montserrat\',sans-serif;font-weight:700;font-size:13px;">Staff Settings</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<button class="btn-ghost" style="font-size:12px;" onclick="navigate(\'scan\')">← Back to Scanner</button>' +
        '<button class="btn-ghost" style="font-size:12px;" onclick="logout()">Logout</button>' +
      '</div>' +
    '</header>' +
    '<main style="flex:1;display:flex;flex-direction:column;align-items:center;padding:32px 24px;gap:20px;max-width:520px;margin:0 auto;width:100%;">' +

      '<div class="card" style="width:100%;padding:24px;">' +
        '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:16px;margin-bottom:4px;">Work Status</div>' +
        '<div style="font-size:12px;color:var(--muted);margin-bottom:20px;">Toggle your availability for scanning tickets at ' + escapeHtml(evName) + '.</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;margin-bottom:16px;">' +
          '<div>' +
            '<div style="font-size:12px;color:var(--muted);margin-bottom:4px;">Current Status</div>' +
            '<div style="font-family:\'Montserrat\',sans-serif;font-weight:700;font-size:15px;color:' + statusColor + ';">' + statusLabel + '</div>' +
          '</div>' +
          '<div style="width:12px;height:12px;border-radius:50%;background:' + statusColor + ';box-shadow:0 0 8px ' + statusColor + ';"></div>' +
        '</div>' +
        '<button onclick="toggleStaffWorkStatus(\'' + newStatus + '\')" ' +
        'style="width:100%;padding:14px;background:' + btnColor + ';border:1.5px solid ' + btnBorder + ';' +
        'border-radius:12px;color:' + btnTextColor + ';font-family:\'Montserrat\',sans-serif;font-weight:700;' +
        'font-size:14px;cursor:pointer;">' + btnLabel + '</button>' +
      '</div>' +

      '<div class="card" style="width:100%;padding:24px;">' +
        '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:16px;margin-bottom:4px;">Chat</div>' +
        '<div style="font-size:12px;color:var(--muted);margin-bottom:16px;">Contact your organizer directly.</div>' +
        '<button onclick="openStaffChatPicker()" style="width:100%;padding:14px;background:rgba(155,16,64,0.15);border:1.5px solid rgba(155,16,64,0.35);border-radius:12px;color:#fff;font-family:\'Montserrat\',sans-serif;font-weight:700;font-size:14px;cursor:pointer;">💬 Open Chat</button>' +
      '</div>' +

    '</main>' +
  '</div>';
}
window.renderStaffSettings = renderStaffSettings;

async function toggleStaffWorkStatus(newStatus) {
  if (!state.user) return;
  try {
    var r = await fetch('/api/staff/self/work-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_user_id: state.user.id, work_status: newStatus })
    });
    var data = await r.json();
    if (!r.ok) {
      showToast(data.message || 'Failed to update status', 'error');
      return;
    }
    showToast('Status updated successfully', 'success');
    state.eventsLoaded = false;
    await loadStaffEvents();
    navigate('staff-settings');
  } catch (e) {
    showToast('Server error', 'error');
  }
}
window.toggleStaffWorkStatus = toggleStaffWorkStatus;
