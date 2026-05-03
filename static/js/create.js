// ============================================================
//  VIEW: CREATE EVENT
// ============================================================
function renderCreate() {
  return '<div class="org-layout">' +
    renderSidebar('create') +
    '<main class="org-main">' +
      '<div style="padding:32px;max-width:920px;">' +
        '<div style="margin-bottom:28px;">' +
          '<button class="btn-ghost" style="margin-bottom:16px;" onclick="navigate(\'dashboard\')">← Back to Dashboard</button>' +
          '<h1 style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:28px;letter-spacing:-0.02em;">Create New Event</h1>' +
          '<p style="font-size:14px;color:var(--muted);">Fill in the details below to create and publish your event.</p>' +
        '</div>' +

        '<div class="card" style="padding:32px;">' +
          '<form onsubmit="doCreateEvent(event)" id="create-form">' +

            '<div class="form-section-title">Basic Information</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">' +
              '<div style="grid-column:1/-1;">' +
                '<label class="field-label">Event Name *</label>' +
                '<input type="text" class="input-field" placeholder="Enter event name..." required id="f-name" />' +
              '</div>' +

              '<div>' +
                '<label class="field-label">Category *</label>' +
                '<select class="input-field" required id="f-category">' +
                  '<option value="">Select category</option>' +
                  '<option value="music">Music</option>' +
                  '<option value="technology">Technology</option>' +
                  '<option value="sports">Sports</option>' +
                  '<option value="art">Art</option>' +
                  '<option value="food">Food</option>' +
                  '<option value="entertainment">Entertainment</option>' +
                '</select>' +
              '</div>' +

              '<div>' +
                '<label class="field-label">Organizer Name</label>' +
                '<input type="text" class="input-field" id="f-org" value="' + (state.user ? state.user.name : '') + '" readonly />' +
              '</div>' +

              '<div style="grid-column:1/-1;">' +
                '<label class="field-label">Description *</label>' +
                '<textarea class="input-field" rows="4" placeholder="Describe your event..." required id="f-desc" style="resize:vertical;"></textarea>' +
              '</div>' +
            '</div>' +

            '<div class="section-divider"></div>' +
            '<div class="form-section-title">Location & Date</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">' +
              '<div>' +
                '<label class="field-label">Venue / Location *</label>' +
                '<input type="text" class="input-field" placeholder="Venue name" required id="f-loc" />' +
              '</div>' +

              '<div>' +
                '<label class="field-label">City *</label>' +
                '<input type="text" class="input-field" placeholder="City" required id="f-city" />' +
              '</div>' +

              '<div>' +
                '<label class="field-label">Start Date *</label>' +
                '<input type="date" class="input-field" required id="f-date" />' +
              '</div>' +

              '<div>' +
                '<label class="field-label">End Date *</label>' +
                '<input type="date" class="input-field" required id="f-enddate" />' +
              '</div>' +

              '<div>' +
                '<label class="field-label">Start Time *</label>' +
                '<input type="time" class="input-field" required id="f-time" />' +
              '</div>' +

              '<div>' +
                '<label class="field-label">End Time *</label>' +
                '<input type="time" class="input-field" required id="f-endtime" />' +
              '</div>' +
            '</div>' +

            '<div class="section-divider"></div>' +
            '<div class="form-section-title">Capacity & Tickets</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">' +
              '<div>' +
                '<label class="field-label">Total Capacity *</label>' +
                '<input type="number" class="input-field" placeholder="e.g. 5000" min="1" required id="f-cap" />' +
              '</div>' +

              '<div>' +
                '<label class="field-label">Ticket Price ($)</label>' +
                '<input type="number" class="input-field" placeholder="0.00" min="0" step="0.01" id="f-price" />' +
              '</div>' +
            '</div>' +

            '<div style="display:flex;gap:12px;justify-content:flex-end;">' +
              '<button type="button" class="btn-ghost" onclick="navigate(\'dashboard\')">Cancel</button>' +
              '<button type="submit" class="btn-primary" style="padding:12px 28px;">✨ Publish Event</button>' +
            '</div>' +

          '</form>' +
        '</div>' +
      '</div>' +
    '</main>' +
  '</div>';
}

function syncCreateEventDateConstraints() {
  var startDateEl = document.getElementById('f-date');
  var endDateEl = document.getElementById('f-enddate');
  var startTimeEl = document.getElementById('f-time');
  var endTimeEl = document.getElementById('f-endtime');
  if (!startDateEl || !endDateEl || !startTimeEl || !endTimeEl) return;

  var today = getTodayDateInputValue();
  startDateEl.min = today;
  if (!startDateEl.value || startDateEl.value < today) {
    startDateEl.value = today;
  }

  endDateEl.min = startDateEl.value || today;
  if (!endDateEl.value || endDateEl.value < endDateEl.min) {
    endDateEl.value = endDateEl.min;
  }

  var now = new Date();
  var minTimeToday = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  startTimeEl.min = startDateEl.value === today ? minTimeToday : '';

  if (startDateEl.value === endDateEl.value && startTimeEl.value) {
    endTimeEl.min = startTimeEl.value;
  } else {
    endTimeEl.min = '';
  }
}

function initCreateEventForm() {
  ['f-date', 'f-enddate', 'f-time', 'f-endtime'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', syncCreateEventDateConstraints);
      el.addEventListener('change', syncCreateEventDateConstraints);
    }
  });
  syncCreateEventDateConstraints();
}
window.initCreateEventForm = initCreateEventForm;


// ============================================================
//  CREATE EVENT
// ============================================================
async function doCreateEvent(e) {
  e.preventDefault();
  console.log('PUBLISH CLICKED');

  var submitBtn = document.querySelector('#create-form button[type="submit"]');
  var submitBtnText = submitBtn ? submitBtn.textContent : 'Publish Event';

  var nameEl = document.getElementById('f-name');
  var categoryEl = document.getElementById('f-category');
  var descEl = document.getElementById('f-desc');
  var locEl = document.getElementById('f-loc');
  var cityEl = document.getElementById('f-city');
  var dateEl = document.getElementById('f-date');
  var endDateEl = document.getElementById('f-enddate');
  var timeEl = document.getElementById('f-time');
  var endTimeEl = document.getElementById('f-endtime');
  var capEl = document.getElementById('f-cap');
  var priceEl = document.getElementById('f-price');

  var name = nameEl ? nameEl.value.trim() : '';
  var category = categoryEl ? categoryEl.value.trim().toLowerCase() : '';
  var desc = descEl ? descEl.value.trim() : '';
  var location = locEl ? locEl.value.trim() : '';
  var city = cityEl ? cityEl.value.trim() : '';
  var startDate = dateEl ? dateEl.value : '';
  var endDate = endDateEl ? endDateEl.value : '';
  var startTime = timeEl ? timeEl.value : '';
  var endTime = endTimeEl ? endTimeEl.value : '';
  var cap = capEl ? parseInt(capEl.value, 10) || 0 : 0;
  var ticketPrice = priceEl ? parseFloat(priceEl.value) || 0 : 0;

  console.log({
    name: name,
    category: category,
    desc: desc,
    location: location,
    city: city,
    startDate: startDate,
    endDate: endDate,
    startTime: startTime,
    endTime: endTime,
    cap: cap,
    ticketPrice: ticketPrice
  });

  if (!state.user) {
    showToast('Please log in first', 'error');
    navigate('login');
    return;
  }

  if (!state.user.id) {
    if (typeof clearAuthUser === 'function') {
      clearAuthUser();
    }
    showToast('Your organizer session expired. Please sign in again.', 'error');
    state.loginRole = 'organizer';
    navigate('login');
    return;
  }

  if (String(state.user.role).toLowerCase().trim() !== 'organizer') {
    showToast('Organizer account is required', 'error');
    return;
  }

  if (!name || !category || !desc || !location || !city || !startDate || !endDate || !startTime || !endTime || !cap) {
    showToast('Please fill all required fields', 'error');
    return;
  }

  var scheduleError = validateEventSchedule(startDate, endDate, startTime, endTime);
  if (scheduleError) {
    showToast(scheduleError, 'error');
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Publishing...';
    }

    var response = await fetch('/api/events', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        organizer_id: state.user.id,
        name: name,
        start_date: startDate,
        end_date: endDate,
        start_time: startTime,
        end_time: endTime,
        description: desc,
        capacity: cap,
        ticket_price: ticketPrice,
        category: category,
        location: location,
        city: city
      })
    });

    var data = await response.json();

    if (!response.ok) {
      if (response.status === 404) {
        if (typeof clearAuthUser === 'function') {
          clearAuthUser();
        }
        showToast(data.message || 'Organizer account not found. Please sign in again.', 'error');
        state.loginRole = 'organizer';
        navigate('login');
        return;
      }

      showToast(data.message || 'Error creating event', 'error');
      return;
    }

    showToast('Event created successfully!', 'success');

    state.eventsLoaded = false;
    state.eventsLoading = false;

    if (typeof loadEvents === 'function') {
      await loadEvents();
    }

    navigate('dashboard');

  } catch (error) {
    console.error('CREATE EVENT ERROR:', error);
    showToast('Server error creating event', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = submitBtnText;
    }
  }
}
window.doCreateEvent = doCreateEvent;
