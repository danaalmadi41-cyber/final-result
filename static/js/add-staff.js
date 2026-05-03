// ============================================================
//  ORGANIZER STAFF
// ============================================================
if (!state.organizerStaff) {
  state.organizerStaff = [];
}

if (state.organizerStaffLoaded === undefined) {
  state.organizerStaffLoaded = false;
}

if (state.organizerStaffLoading === undefined) {
  state.organizerStaffLoading = false;
}

if (state.latestCreatedStaff === undefined) {
  state.latestCreatedStaff = null;
}

if (state.addStaffPreferredDays === undefined) {
  state.addStaffPreferredDays = [];
}

if (state.addStaffPreferredDayCount === undefined) {
  state.addStaffPreferredDayCount = '';
}

var STAFF_WEEKDAY_OPTIONS = [
  { value: 'sunday', label: 'Sunday' },
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' }
];

function normalizeStaffPreferredDays(days) {
  var valid = STAFF_WEEKDAY_OPTIONS.map(function(option) {
    return option.value;
  });
  var normalized = [];
  var seen = {};

  (Array.isArray(days) ? days : []).forEach(function(day) {
    var value = String(day || '').trim().toLowerCase();
    if (!value || valid.indexOf(value) === -1 || seen[value]) return;
    seen[value] = true;
    normalized.push(value);
  });

  return normalized;
}

function getStaffPreferredDayLabel(day) {
  var match = STAFF_WEEKDAY_OPTIONS.find(function(option) {
    return option.value === String(day || '').trim().toLowerCase();
  });
  return match ? match.label : '';
}

function formatStaffPreferredDays(days) {
  var normalized = normalizeStaffPreferredDays(days);
  if (!normalized.length) return 'Not selected';
  return normalized.map(getStaffPreferredDayLabel).filter(Boolean).join(', ');
}

function getSelectedStaffPreferredDays() {
  return normalizeStaffPreferredDays(state.addStaffPreferredDays);
}

function getSelectedStaffPreferredDayCount() {
  var input = document.getElementById('staff-days');
  var rawValue = input ? input.value : state.addStaffPreferredDayCount;
  var count = Number(rawValue || 0);
  if (!isFinite(count) || count < 1 || count > 7) {
    return 0;
  }
  return Math.floor(count);
}

function getStaffDayButtonStyles(selected, disabled) {
  if (selected) {
    return 'padding:10px 14px;border-radius:999px;border:1px solid rgba(212,154,53,0.34);background:linear-gradient(135deg,rgba(155,16,64,0.92),rgba(212,154,53,0.92));color:#fff;font-weight:800;cursor:pointer;';
  }
  if (disabled) {
    return 'padding:10px 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.35);font-weight:700;cursor:not-allowed;opacity:0.65;';
  }
  return 'padding:10px 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.05);color:#f8e4d8;font-weight:700;cursor:pointer;';
}

function syncStaffPreferredDaysUI() {
  var limit = getSelectedStaffPreferredDayCount();
  var selectedDays = getSelectedStaffPreferredDays();
  var helper = document.getElementById('staff-days-helper');
  var hiddenInput = document.getElementById('staff-selected-days');
  var countBadge = document.getElementById('staff-days-count-badge');
  var selectionText = document.getElementById('staff-days-selection-text');
  var trimmed = false;

  if (!limit) {
    selectedDays = [];
  } else if (selectedDays.length > limit) {
    selectedDays = selectedDays.slice(0, limit);
    trimmed = true;
  }

  state.addStaffPreferredDays = selectedDays;
  state.addStaffPreferredDayCount = limit ? String(limit) : '';

  STAFF_WEEKDAY_OPTIONS.forEach(function(option) {
    var button = document.getElementById('staff-day-' + option.value);
    if (!button) return;

    var isSelected = selectedDays.indexOf(option.value) !== -1;
    var isDisabled = !limit || (!isSelected && selectedDays.length >= limit);

    button.disabled = !!isDisabled;
    button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    button.style.cssText = getStaffDayButtonStyles(isSelected, isDisabled);
  });

  if (hiddenInput) {
    hiddenInput.value = JSON.stringify(selectedDays);
  }

  if (countBadge) {
    countBadge.textContent = limit ? (selectedDays.length + ' / ' + limit + ' selected') : 'Choose days per week first';
  }

  if (selectionText) {
    selectionText.textContent = selectedDays.length
      ? formatStaffPreferredDays(selectedDays)
      : 'No days selected yet.';
  }

  if (helper) {
    helper.textContent = !limit
      ? 'Pick how many days this staff member works, then choose the same number of weekdays.'
      : ('Choose exactly ' + limit + ' day' + (limit === 1 ? '' : 's') + '.');
  }

  if (trimmed) {
    showToast('Selected days were reduced to match the new limit', 'success');
  }
}
window.syncStaffPreferredDaysUI = syncStaffPreferredDaysUI;

function handleStaffPreferredDayCountChange() {
  var input = document.getElementById('staff-days');
  state.addStaffPreferredDayCount = input ? String(input.value || '') : '';
  syncStaffPreferredDaysUI();
}
window.handleStaffPreferredDayCountChange = handleStaffPreferredDayCountChange;

function toggleStaffPreferredDay(dayValue) {
  var limit = getSelectedStaffPreferredDayCount();
  if (!limit) {
    showToast('Choose Days Per Week first', 'error');
    return;
  }

  var normalizedDay = String(dayValue || '').trim().toLowerCase();
  var selectedDays = getSelectedStaffPreferredDays();
  var currentIndex = selectedDays.indexOf(normalizedDay);

  if (currentIndex !== -1) {
    selectedDays.splice(currentIndex, 1);
  } else {
    if (selectedDays.length >= limit) {
      showToast('You can only choose ' + limit + ' day' + (limit === 1 ? '' : 's'), 'error');
      return;
    }
    selectedDays.push(normalizedDay);
  }

  state.addStaffPreferredDays = selectedDays;
  syncStaffPreferredDaysUI();
}
window.toggleStaffPreferredDay = toggleStaffPreferredDay;

function getOrganizerEventsForStaffPage() {
  return (state.realEvents || []).filter(function(ev) {
    return state.user && Number(ev.organizer_id) === Number(state.user.id);
  });
}

function formatStaffEventSchedule(ev) {
  if (!ev) return 'Choose an event to see its schedule.';
  var dateText = ev.start_date || 'Date not set';
  if (ev.end_date && ev.end_date !== ev.start_date) {
    dateText += ' to ' + ev.end_date;
  }
  return dateText + ' | ' + formatTimeRange(ev.start_time, ev.end_time, ' to ');
}

function getStaffWorkStatusMeta(status) {
  var normalized = String(status || 'active').toLowerCase();
  if (normalized === 'extra_work') {
    return {
      label: 'Extra Work',
      color: '#60A5FA',
      bg: 'rgba(96,165,250,0.12)',
      border: 'rgba(96,165,250,0.22)'
    };
  }
  if (normalized === 'stop_working') {
    return {
      label: 'Inactive',
      color: '#F59E0B',
      bg: 'rgba(245,158,11,0.12)',
      border: 'rgba(245,158,11,0.24)'
    };
  }
  if (normalized === 'removed') {
    return {
      label: 'Removed',
      color: '#EF4444',
      bg: 'rgba(239,68,68,0.12)',
      border: 'rgba(239,68,68,0.24)'
    };
  }
  return {
    label: 'Active',
    color: '#22C55E',
    bg: 'rgba(34,197,94,0.12)',
    border: 'rgba(34,197,94,0.24)'
  };
}

function renderStaffStatusBadge(status) {
  var meta = getStaffWorkStatusMeta(status);
  return '<span style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:999px;border:1px solid ' + meta.border + ';background:' + meta.bg + ';color:' + meta.color + ';font-size:12px;font-weight:800;">' + meta.label + '</span>';
}

function getStaffJsString(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\\\'')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

async function loadOrganizerStaff(silent) {
  if (!state.user || state.user.role !== 'organizer' || state.organizerStaffLoading) {
    return;
  }

  state.organizerStaffLoading = true;

  try {
    var response = await fetch('/api/organizer/staff?organizer_id=' + encodeURIComponent(state.user.id));
    var data = await response.json();

    if (!response.ok) {
      state.organizerStaffLoading = false;
      if (!silent) {
        showToast(data.message || 'Failed to load staff accounts', 'error');
      }
      return;
    }

    state.organizerStaff = Array.isArray(data) ? data : [];
    state.organizerStaffLoaded = true;
    state.organizerStaffLoading = false;

    if (state.view === 'add-staff') {
      render({ preserveScroll: true });
    }
  } catch (error) {
    console.error('LOAD STAFF ERROR:', error);
    state.organizerStaffLoading = false;
    if (!silent) {
      showToast('Server error loading staff accounts', 'error');
    }
  }
}
window.loadOrganizerStaff = loadOrganizerStaff;

function updateAddStaffSchedulePreview() {
  var previewEl = document.getElementById('add-staff-event-preview');
  var eventSelect = document.getElementById('staff-event-id');
  if (!previewEl || !eventSelect) return;

  var events = getOrganizerEventsForStaffPage();
  var selected = events.find(function(ev) {
    return String(ev.id) === String(eventSelect.value);
  }) || null;

  previewEl.innerHTML = selected
    ? '<strong>' + selected.name + '</strong><br><span style="color:var(--muted);">' + formatStaffEventSchedule(selected) + '</span>'
    : '<span style="color:var(--muted);">Choose an event to see its schedule.</span>';
}
window.updateAddStaffSchedulePreview = updateAddStaffSchedulePreview;

function renderStaffCredentialCard(staff, highlight) {
  var eventName = staff && staff.event ? staff.event.name : 'No event assigned';
  var schedule = staff && staff.event ? formatStaffEventSchedule(staff.event) : 'Schedule not available';
  var workStatus = (staff && staff.work_status) || 'active';
  var isInactiveLocked = workStatus === 'stop_working';
  var borderStyle = highlight
    ? 'border:1px solid rgba(212,154,53,0.45);box-shadow:0 20px 60px rgba(155,16,64,0.18);'
    : 'border:1px solid var(--border);';

  return '' +
    '<div class="card" style="padding:22px;border-radius:18px;' + borderStyle + '">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px;">' +
        '<div>' +
          '<div style="font-family:Montserrat,sans-serif;font-size:22px;font-weight:900;letter-spacing:-0.02em;">' + staff.full_name + '</div>' +
          '<div style="color:var(--muted);font-size:13px;margin-top:6px;">' + eventName + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
          renderStaffStatusBadge(workStatus) +
          (highlight
            ? '<div class="badge badge-cat" style="background:linear-gradient(135deg,#9B1040,#D49A35);color:#fff;">New Staff</div>'
            : '') +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:16px;">' +
        '<div style="padding:14px;border-radius:14px;background:rgba(155,16,64,0.08);border:1px solid rgba(155,16,64,0.18);">' +
          '<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Staff ID</div>' +
          '<div style="font-family:Montserrat,sans-serif;font-size:26px;font-weight:900;">' + staff.staff_id + '</div>' +
        '</div>' +
        '<div style="padding:14px;border-radius:14px;background:rgba(212,154,53,0.10);border:1px solid rgba(212,154,53,0.22);">' +
          '<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Password</div>' +
          '<div style="font-family:Montserrat,sans-serif;font-size:26px;font-weight:900;letter-spacing:0.08em;">' + staff.password + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px;">' +
        '<div><strong>Age:</strong> ' + staff.age + '</div>' +
        '<div><strong>Hours:</strong> ' + staff.preferred_hours + ' hrs</div>' +
        '<div><strong>Days/Week:</strong> ' + staff.preferred_days_per_week + '</div>' +
      '</div>' +
      '<div style="margin-bottom:16px;"><strong>Working Days:</strong> ' + escapeHtml(formatStaffPreferredDays(staff.preferred_days)) + '</div>' +
      '<div style="padding:14px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid var(--border);">' +
        '<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Assigned Event Schedule</div>' +
        '<div>' + schedule + '</div>' +
      '</div>' +
      (isInactiveLocked
        ? '<div style="margin-top:16px;padding:14px;border-radius:14px;background:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.24);">' +
            '<div style="font-family:Montserrat,sans-serif;font-weight:800;font-size:13px;color:#FCD34D;margin-bottom:6px;">Editing Locked</div>' +
            '<div style="font-size:13px;color:#f7e6d4;line-height:1.7;">This staff member is inactive. You can still chat with them, but profile and status edits are disabled. Use Kick / Remove inside Staff Chat if you want to remove them.</div>' +
            '<button class="btn-ghost" style="margin-top:12px;font-size:12px;padding:8px 12px;border-color:rgba(245,158,11,0.26);" onclick="openOrganizerStaffChat(' + staff.staff_id + ', \'' + getStaffJsString(staff.full_name) + '\', \'' + getStaffJsString(workStatus) + '\')">Open Chat</button>' +
          '</div>'
        : '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">' +
            '<button class="btn-ghost" style="font-size:12px;padding:8px 12px;' + (workStatus === 'active' ? 'opacity:0.6;cursor:default;' : '') + '" onclick="updateStaffWorkStatus(' + staff.staff_id + ', \'active\')" ' + (workStatus === 'active' ? 'disabled' : '') + '>Set Active</button>' +
            '<button class="btn-ghost" style="font-size:12px;padding:8px 12px;' + (workStatus === 'extra_work' ? 'opacity:0.6;cursor:default;' : '') + '" onclick="updateStaffWorkStatus(' + staff.staff_id + ', \'extra_work\')" ' + (workStatus === 'extra_work' ? 'disabled' : '') + '>Extra Work</button>' +
            '<button class="btn-ghost" style="font-size:12px;padding:8px 12px;' + (workStatus === 'stop_working' ? 'opacity:0.6;cursor:default;' : '') + '" onclick="updateStaffWorkStatus(' + staff.staff_id + ', \'stop_working\')" ' + (workStatus === 'stop_working' ? 'disabled' : '') + '>Set Inactive</button>' +
          '</div>') +
    '</div>';
}

function renderAddStaff() {
  if (!state.user || state.user.role !== 'organizer') {
    showToast('Access denied', 'error');
    navigate('home');
    return '';
  }

  if (!state.eventsLoaded && !state.eventsLoading && typeof loadDashboardData === 'function') {
    loadDashboardData();
  }

  if (!state.organizerStaffLoaded && !state.organizerStaffLoading) {
    loadOrganizerStaff(true);
  }

  var events = getOrganizerEventsForStaffPage();
  var staffList = state.organizerStaff || [];
  var latestStaff = state.latestCreatedStaff;

  if (!state.eventsLoaded && !events.length) {
    return '<div class="org-layout">' +
      renderSidebar('add-staff') +
      '<main class="org-main">' +
        '<div style="padding:32px;">' +
          '<div class="card" style="padding:32px;text-align:center;">' +
            '<h2 style="font-family:Montserrat,sans-serif;font-weight:800;font-size:24px;margin-bottom:12px;">Loading Staff Setup...</h2>' +
            '<p style="color:var(--muted);">We are loading your events so you can assign staff to the right schedule.</p>' +
          '</div>' +
        '</div>' +
      '</main>' +
    '</div>';
  }

  if (!events.length) {
    return '<div class="org-layout">' +
      renderSidebar('add-staff') +
      '<main class="org-main">' +
        '<div style="padding:32px;">' +
          '<div class="card" style="padding:32px;text-align:center;">' +
            '<h2 style="font-family:Montserrat,sans-serif;font-weight:800;font-size:24px;margin-bottom:12px;">Create an Event First</h2>' +
            '<p style="color:var(--muted);margin-bottom:20px;">Staff accounts need to be linked to one of your events so they can work the correct schedule.</p>' +
            '<button class="btn-primary" onclick="navigate(\'create\')">Create Event</button>' +
          '</div>' +
        '</div>' +
      '</main>' +
    '</div>';
  }

  var selectedEvent = events[0];
  var selectedDayCount = getSelectedStaffPreferredDayCount();
  var selectedDays = getSelectedStaffPreferredDays();
  if (!selectedDayCount) {
    selectedDays = [];
    state.addStaffPreferredDays = [];
  } else if (selectedDays.length > selectedDayCount) {
    selectedDays = selectedDays.slice(0, selectedDayCount);
    state.addStaffPreferredDays = selectedDays;
  }

  return '<div class="org-layout">' +
    renderSidebar('add-staff') +
    '<main class="org-main">' +
      '<div style="padding:32px;display:grid;gap:24px;">' +

        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap;">' +
          '<div>' +
            '<h1 style="font-family:Montserrat,sans-serif;font-weight:900;font-size:32px;letter-spacing:-0.03em;margin-bottom:8px;">Add Staff</h1>' +
            '<p style="color:var(--muted);max-width:760px;line-height:1.8;">Create an entry staff account for one of your events. The system generates the staff ID automatically after submit, then shows you the login ID and password here.</p>' +
          '</div>' +
          '<button class="btn-ghost" onclick="loadOrganizerStaff()" style="height:46px;">Refresh Staff List</button>' +
        '</div>' +

        (latestStaff
          ? '<section>' +
              '<div style="font-family:Montserrat,sans-serif;font-weight:800;font-size:18px;margin-bottom:12px;">Latest Generated Credentials</div>' +
              renderStaffCredentialCard(latestStaff, true) +
            '</section>'
          : '') +

        '<div style="display:grid;grid-template-columns:minmax(320px,1.15fr) minmax(320px,1fr);gap:24px;align-items:start;">' +
          '<section class="card" style="padding:24px;border-radius:20px;">' +
            '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px;">' +
              '<div>' +
                '<div style="font-family:Montserrat,sans-serif;font-size:24px;font-weight:900;letter-spacing:-0.02em;">New Staff Account</div>' +
                '<div style="color:var(--muted);font-size:13px;margin-top:6px;">The ID number is generated automatically after you submit.</div>' +
              '</div>' +
              '<div class="badge badge-info">Auto ID</div>' +
            '</div>' +
            '<form onsubmit="createStaffAccount(event)">' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">' +
                '<div>' +
                  '<label class="field-label">First Name</label>' +
                  '<input id="staff-first-name" class="input-field" type="text" placeholder="First name" required />' +
                '</div>' +
                '<div>' +
                  '<label class="field-label">Last Name</label>' +
                  '<input id="staff-last-name" class="input-field" type="text" placeholder="Last name" required />' +
                '</div>' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:14px;">' +
                '<div>' +
                  '<label class="field-label">Age</label>' +
                  '<input id="staff-age" class="input-field" type="number" min="16" max="100" placeholder="Age" required />' +
                '</div>' +
                '<div>' +
                  '<label class="field-label">Hours to Work</label>' +
                  '<input id="staff-hours" class="input-field" type="number" min="1" max="24" step="0.5" placeholder="Hours" required />' +
                '</div>' +
                '<div>' +
                  '<label class="field-label">Days Per Week</label>' +
                  '<select id="staff-days" class="input-field" required onchange="handleStaffPreferredDayCountChange()">' +
                    '<option value="">Choose days</option>' +
                    [1, 2, 3, 4, 5, 6, 7].map(function(dayCount) {
                      return '<option value="' + dayCount + '"' + (dayCount === selectedDayCount ? ' selected' : '') + '>' + dayCount + ' day' + (dayCount === 1 ? '' : 's') + '</option>';
                    }).join('') +
                  '</select>' +
                '</div>' +
              '</div>' +
              '<div style="margin-bottom:16px;">' +
                '<label class="field-label">Working Days</label>' +
                '<input id="staff-selected-days" type="hidden" value="' + escapeHtml(JSON.stringify(selectedDays)) + '" />' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px;">' +
                  '<div id="staff-days-helper" style="color:var(--muted);font-size:13px;line-height:1.7;">' + (selectedDayCount ? ('Choose exactly ' + selectedDayCount + ' day' + (selectedDayCount === 1 ? '' : 's') + '.') : 'Pick how many days this staff member works, then choose the same number of weekdays.') + '</div>' +
                  '<div id="staff-days-count-badge" style="padding:8px 12px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);font-size:12px;font-weight:800;color:#f8e4d8;">' + (selectedDayCount ? (selectedDays.length + ' / ' + selectedDayCount + ' selected') : 'Choose days per week first') + '</div>' +
                '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;">' +
                  STAFF_WEEKDAY_OPTIONS.map(function(option) {
                    var isSelected = selectedDays.indexOf(option.value) !== -1;
                    var isDisabled = !selectedDayCount || (!isSelected && selectedDays.length >= selectedDayCount);
                    return '<button id="staff-day-' + option.value + '" type="button" onclick="toggleStaffPreferredDay(\'' + option.value + '\')" aria-pressed="' + (isSelected ? 'true' : 'false') + '" ' + (isDisabled ? 'disabled' : '') + ' style="' + getStaffDayButtonStyles(isSelected, isDisabled) + '">' + option.label + '</button>';
                  }).join('') +
                '</div>' +
                '<div id="staff-days-selection-text" style="font-size:13px;color:var(--muted);line-height:1.7;">' + escapeHtml(selectedDays.length ? formatStaffPreferredDays(selectedDays) : 'No days selected yet.') + '</div>' +
              '</div>' +
              '<div style="margin-bottom:16px;">' +
                '<label class="field-label">Assigned Event</label>' +
                '<select id="staff-event-id" class="input-field" onchange="updateAddStaffSchedulePreview()">' +
                  events.map(function(ev, index) {
                    return '<option value="' + ev.id + '" ' + (index === 0 ? 'selected' : '') + '>' + ev.name + '</option>';
                  }).join('') +
                '</select>' +
              '</div>' +
              '<div id="add-staff-event-preview" style="margin-bottom:20px;padding:16px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid var(--border);line-height:1.7;">' +
                '<strong>' + selectedEvent.name + '</strong><br><span style="color:var(--muted);">' + formatStaffEventSchedule(selectedEvent) + '</span>' +
              '</div>' +
              '<button class="btn-primary" type="submit" style="width:100%;justify-content:center;">Create Staff Account</button>' +
            '</form>' +
          '</section>' +

          '<section class="card" style="padding:24px;border-radius:20px;">' +
            '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px;">' +
              '<div>' +
                '<div style="font-family:Montserrat,sans-serif;font-size:24px;font-weight:900;letter-spacing:-0.02em;">Current Staff</div>' +
                '<div style="color:var(--muted);font-size:13px;margin-top:6px;">You can always return here to see each staff ID and password.</div>' +
              '</div>' +
              '<div class="badge badge-cat">' + staffList.length + ' Staff</div>' +
            '</div>' +
            (state.organizerStaffLoading && !staffList.length
              ? '<div style="padding:24px;text-align:center;color:var(--muted);">Loading staff accounts...</div>'
              : (!staffList.length
                  ? '<div style="padding:28px;border-radius:16px;background:rgba(255,255,255,0.03);border:1px dashed rgba(255,255,255,0.18);text-align:center;">' +
                      '<h3 style="font-family:Montserrat,sans-serif;font-size:22px;font-weight:800;margin-bottom:10px;">No Staff Yet</h3>' +
                      '<p style="color:var(--muted);line-height:1.8;">Use the form to create your first staff account. Once you submit, the generated ID and password will appear here.</p>' +
                    '</div>'
                  : '<div style="display:grid;gap:16px;">' +
                      staffList.map(function(staff) {
                        return renderStaffCredentialCard(staff, false);
                      }).join('') +
                    '</div>')) +
          '</section>' +
        '</div>' +
      '</div>' +
    '</main>' +
  '</div>';
}

async function createStaffAccount(event) {
  event.preventDefault();

  if (!state.user || state.user.role !== 'organizer') {
    showToast('Organizer access required', 'error');
    return;
  }

  var firstName = (document.getElementById('staff-first-name').value || '').trim();
  var lastName = (document.getElementById('staff-last-name').value || '').trim();
  var age = (document.getElementById('staff-age').value || '').trim();
  var preferredHours = (document.getElementById('staff-hours').value || '').trim();
  var preferredDays = (document.getElementById('staff-days').value || '').trim();
  var selectedDays = getSelectedStaffPreferredDays();
  var eventId = (document.getElementById('staff-event-id').value || '').trim();

  if (!firstName || !lastName || !age || !preferredHours || !preferredDays || !eventId) {
    showToast('Please complete all staff fields', 'error');
    return;
  }

  if (selectedDays.length !== Number(preferredDays)) {
    showToast('Choose the same number of working days as Days Per Week', 'error');
    return;
  }

  try {
    var response = await fetch('/api/organizer/staff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        organizer_id: state.user.id,
        event_id: eventId,
        first_name: firstName,
        last_name: lastName,
        age: age,
        preferred_hours: preferredHours,
        preferred_days_per_week: preferredDays,
        preferred_days: selectedDays
      })
    });

    var data = await response.json();

    if (!response.ok) {
      showToast(data.message || 'Failed to create staff account', 'error');
      return;
    }

    state.latestCreatedStaff = data.staff;
    state.organizerStaff = [data.staff].concat(state.organizerStaff || []);
    state.organizerStaffLoaded = true;
    state.addStaffPreferredDays = [];
    state.addStaffPreferredDayCount = '';

    showToast('Staff account created successfully', 'success');
    render({ preserveScroll: true });
  } catch (error) {
    console.error('CREATE STAFF ERROR:', error);
    showToast('Server error while creating staff account', 'error');
  }
}
window.createStaffAccount = createStaffAccount;

async function updateStaffWorkStatus(staffId, workStatus) {
  if (!state.user || state.user.role !== 'organizer') {
    showToast('Organizer access required', 'error');
    return;
  }

  try {
    var response = await fetch('/api/organizer/staff/' + encodeURIComponent(staffId) + '/status', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        organizer_id: state.user.id,
        work_status: workStatus
      })
    });

    var data = await response.json();

    if (!response.ok) {
      showToast(data.message || 'Failed to update staff status', 'error');
      return;
    }

    state.organizerStaff = (state.organizerStaff || []).map(function(staff) {
      if (Number(staff.staff_id) !== Number(staffId)) return staff;
      return Object.assign({}, staff, {
        work_status: workStatus
      });
    });

    if (state.latestCreatedStaff && Number(state.latestCreatedStaff.staff_id) === Number(staffId)) {
      state.latestCreatedStaff = Object.assign({}, state.latestCreatedStaff, {
        work_status: workStatus
      });
    }

    showToast(data.message || 'Staff status updated successfully', 'success');
    render({ preserveScroll: true });
  } catch (error) {
    console.error('UPDATE STAFF STATUS ERROR:', error);
    showToast('Server error while updating staff status', 'error');
  }
}
window.updateStaffWorkStatus = updateStaffWorkStatus;
