var _realtimeSubscribed = false;

function mergeRealtimeEventIntoState(eventId, data) {
  var updated = false;

  state.realEvents = (state.realEvents || []).map(function(ev) {
    if (Number(ev.id) !== Number(eventId)) return ev;
    updated = true;
    return Object.assign({}, ev, data, {
      id: ev.id,
      prediction: data.prediction || ev.prediction
    });
  });

  return updated;
}

function shouldRealtimeRender(eventId) {
  if (['dashboard', 'my-events', 'reports', 'customer-dashboard'].indexOf(state.view) !== -1) {
    return true;
  }

  if (state.view === 'scan') {
    return true;
  }

  if (state.view === 'detail') {
    return Number(state.params && state.params.id) === Number(eventId);
  }

  return false;
}

function applyRealtimeEventUpdate(eventId, data) {
  var merged = mergeRealtimeEventIntoState(eventId, data);
  _updateEventCardDOM(eventId, data);

  if (merged) {
    state.dashboardLastUpdated = new Date().toISOString();
    state.dashboardDataSignature = JSON.stringify(state.realEvents || []);
  }

  if (merged && shouldRealtimeRender(eventId)) {
    render({ preserveScroll: true });
  }
}
window.applyRealtimeEventUpdate = applyRealtimeEventUpdate;

function subscribeToRealtimeUpdates() {
  if (typeof fbDb === 'undefined' || _realtimeSubscribed) return;
  _realtimeSubscribed = true;

  fbDb.ref('events').on('child_changed', function(snapshot) {
    var data = snapshot.val() || {};
    var eventId = snapshot.key;
    applyRealtimeEventUpdate(eventId, data);
  });

  console.log('[Firebase] Subscribed to real-time event updates');
}

function _updateEventCardDOM(eventId, data) {
  var crowdEl = document.getElementById('crowd-' + eventId);
  var capBarEl = document.getElementById('capbar-' + eventId);
  var capPctEl = document.getElementById('cappct-' + eventId);

  if (crowdEl && typeof levelBadge === 'function') {
    crowdEl.innerHTML = levelBadge((data.crowd_level || 'low').toLowerCase());
  }

  if (capBarEl && Number(data.capacity || 0) > 0) {
    var pct = Math.round((Number(data.attendance_count || 0) / Number(data.capacity || 0)) * 100);
    capBarEl.style.width = pct + '%';
    capBarEl.style.background = typeof capBarColor === 'function' ? capBarColor(pct) : '#22C55E';
    if (capPctEl) capPctEl.textContent = pct + '%';
  }
}

function unsubscribeRealtimeUpdates() {
  if (typeof fbDb !== 'undefined') {
    fbDb.ref('events').off();
    _realtimeSubscribed = false;
  }
}

window.subscribeToRealtimeUpdates = subscribeToRealtimeUpdates;
window.unsubscribeRealtimeUpdates = unsubscribeRealtimeUpdates;
