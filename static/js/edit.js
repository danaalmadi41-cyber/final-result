// ============================================================
//  VIEW: EDIT EVENT
// ============================================================
function renderEdit() {
  var id = state.params.id;
  var events = state.realEvents || [];

  if (!state.eventsLoaded && !state.eventsLoading && typeof loadDashboardData === 'function') {
    loadDashboardData();
  }

  if (state.eventsLoading && !events.length) {
    return '<div class="org-layout">' +
      renderSidebar('my-events') +
      '<main class="org-main">' +
        '<div style="padding:32px;">' +
          '<div class="card" style="padding:32px;text-align:center;">' +
            '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;margin-bottom:12px;">Loading Event...</h2>' +
            '<p style="color:var(--muted);">Please wait while event data is loaded from the database.</p>' +
          '</div>' +
        '</div>' +
      '</main>' +
    '</div>';
  }

  var ev = events.find(function(e) {
    return Number(e.id) === Number(id);
  }) || events[0];

  if (!ev) {
    return '<div class="org-layout">' +
      renderSidebar('my-events') +
      '<main class="org-main">' +
        '<div style="padding:32px;">' +
          '<div class="card" style="padding:32px;text-align:center;">' +
            '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;margin-bottom:12px;">Event Not Found</h2>' +
            '<p style="color:var(--muted);margin-bottom:20px;">There is no stored event to edit.</p>' +
            '<button class="btn-primary" onclick="navigate(\'my-events\')">Back to My Events</button>' +
          '</div>' +
        '</div>' +
      '</main>' +
    '</div>';
  }

  function toTimeInput(t) {
    return t || '';
  }

  return '<div class="org-layout">' +
    renderSidebar('dashboard') +
    '<main class="org-main">' +
      '<div style="padding:32px;max-width:920px;">' +
        '<div style="margin-bottom:28px;">' +
          '<button class="btn-ghost" style="margin-bottom:16px;" onclick="navigate(\'dashboard\')">Back to Dashboard</button>' +
          '<h1 style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:28px;letter-spacing:-0.02em;">Edit Event</h1>' +
          '<p style="font-size:14px;color:var(--muted);">Update the details for <strong>' + ev.name + '</strong></p>' +
        '</div>' +
        '<div class="card" style="padding:32px;">' +
          '<form onsubmit="doSaveEvent(event,' + ev.id + ')" id="edit-form">' +
            '<div class="form-section-title">Basic Information</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">' +
              '<div style="grid-column:1/-1;"><label class="field-label">Event Name *</label><input type="text" class="input-field" required id="ef-name" value="' + ev.name + '" /></div>' +
              '<div><label class="field-label">Category *</label><select class="input-field" required id="ef-cat">' +
                ['music','technology','sports','art','food','entertainment'].map(function(c) {
                  return '<option value="' + c + '" ' + ((ev.category || '').toLowerCase() === c ? 'selected' : '') + '>' + (c.charAt(0).toUpperCase() + c.slice(1)) + '</option>';
                }).join('') +
              '</select></div>' +
              '<div><label class="field-label">Organizer</label><input type="text" class="input-field" id="ef-org" value="' + (ev.organizer_name || state.user.name || '') + '" readonly /></div>' +
              '<div style="grid-column:1/-1;"><label class="field-label">Description *</label><textarea class="input-field" rows="4" required id="ef-desc" style="resize:vertical;">' + (ev.description || '') + '</textarea></div>' +
            '</div>' +
            '<div class="section-divider"></div>' +
            '<div class="form-section-title">Location &amp; Date</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">' +
              '<div><label class="field-label">Venue *</label><input type="text" class="input-field" required id="ef-loc" value="' + (ev.location || '') + '" /></div>' +
              '<div><label class="field-label">City *</label><input type="text" class="input-field" required id="ef-city" value="' + (ev.city || '') + '" /></div>' +
              '<div><label class="field-label">Start Date *</label><input type="date" class="input-field" required id="ef-date" value="' + (ev.start_date || '') + '" /></div>' +
              '<div><label class="field-label">End Date *</label><input type="date" class="input-field" required id="ef-enddate" value="' + (ev.end_date || ev.start_date || '') + '" /></div>' +
              '<div><label class="field-label">Start Time *</label><input type="time" class="input-field" id="ef-time" value="' + toTimeInput(ev.start_time) + '" /></div>' +
              '<div><label class="field-label">End Time *</label><input type="time" class="input-field" id="ef-endtime" value="' + toTimeInput(ev.end_time) + '" /></div>' +
            '</div>' +
            '<div class="section-divider"></div>' +
            '<div class="form-section-title">Capacity &amp; Pricing</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px;">' +
              '<div><label class="field-label">Total Capacity</label><input type="number" class="input-field" id="ef-cap" value="' + Number(ev.capacity || 0) + '" min="1" /></div>' +
              '<div><label class="field-label">Ticket Price</label><input type="number" class="input-field" id="ef-price" value="' + Number(ev.ticket_price || 0) + '" min="0" step="0.01" /></div>' +
            '</div>' +
            '<div style="display:flex;gap:12px;justify-content:flex-end;">' +
              '<button type="button" class="btn-ghost" onclick="navigate(\'dashboard\')">Cancel</button>' +
              '<button type="submit" class="btn-primary" style="padding:12px 28px;">Save Changes</button>' +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>' +
    '</main>' +
  '</div>';
}

function syncEditEventDateConstraints() {
  var startDateEl = document.getElementById('ef-date');
  var endDateEl = document.getElementById('ef-enddate');
  var startTimeEl = document.getElementById('ef-time');
  var endTimeEl = document.getElementById('ef-endtime');
  if (!startDateEl || !endDateEl || !startTimeEl || !endTimeEl) return;

  endDateEl.min = startDateEl.value || getTodayDateInputValue();
  if (endDateEl.value && endDateEl.value < endDateEl.min) {
    endDateEl.value = endDateEl.min;
  }

  if (startDateEl.value === endDateEl.value && startTimeEl.value) {
    endTimeEl.min = startTimeEl.value;
  } else {
    endTimeEl.min = '';
  }
}

function initEditEventForm() {
  ['ef-date', 'ef-enddate', 'ef-time', 'ef-endtime'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', syncEditEventDateConstraints);
      el.addEventListener('change', syncEditEventDateConstraints);
    }
  });
  syncEditEventDateConstraints();
}
window.initEditEventForm = initEditEventForm;


// ============================================================
//  SAVE EVENT
// ============================================================
async function doSaveEvent(e, id) {
  e.preventDefault();

  var payload = {
    organizer_id: state.user.id,
    name: document.getElementById('ef-name').value.trim(),
    category: document.getElementById('ef-cat').value.trim().toLowerCase(),
    description: document.getElementById('ef-desc').value.trim(),
    location: document.getElementById('ef-loc').value.trim(),
    city: document.getElementById('ef-city').value.trim(),
    start_date: document.getElementById('ef-date').value,
    end_date: document.getElementById('ef-enddate').value,
    start_time: document.getElementById('ef-time').value,
    end_time: document.getElementById('ef-endtime').value,
    capacity: parseInt(document.getElementById('ef-cap').value, 10) || 0,
    ticket_price: parseFloat(document.getElementById('ef-price').value) || 0
  };

  var scheduleError = validateEventSchedule(payload.start_date, payload.end_date, payload.start_time, payload.end_time);
  if (scheduleError) {
    showToast(scheduleError, 'error');
    return;
  }

  try {
    var response = await fetch('/api/events/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    var data = await response.json();

    if (!response.ok) {
      showToast(data.message || 'Failed to update event', 'error');
      return;
    }

    await loadDashboardData();
    showToast('Event updated successfully!', 'success');
    navigate('dashboard');
  } catch (error) {
    console.error('UPDATE EVENT ERROR:', error);
    showToast('Server error updating event', 'error');
  }
}

window.doSaveEvent = doSaveEvent;
