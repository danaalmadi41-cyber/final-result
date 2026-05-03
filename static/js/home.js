// ============================================================
//  CATEGORY FILTER
// ============================================================
function setCategory(cat) {
  state.catFilter = cat;
  render();
}
window.setCategory = setCategory;

function setSearch(query) {
  state.searchQuery = query;
  var activeEl = document.activeElement;
  var selStart = activeEl ? activeEl.selectionStart : null;
  var selEnd = activeEl ? activeEl.selectionEnd : null;
  render();
  var input = document.querySelector('input[placeholder="Search events, artists, venues..."]') || document.querySelector('input[placeholder="Search events..."]');
  if (input) {
    input.focus();
    try { input.setSelectionRange(selStart, selEnd); } catch(e) {}
  }
}
window.setSearch = setSearch;


// ============================================================
//  LOAD EVENTS
// ============================================================
async function loadEvents() {
  if (state.eventsLoading) return;

  state.eventsLoading = true;

  try {
    var response = await fetch('/api/events');
    var data = await response.json();

    if (!response.ok) {
      state.realEvents = [];
      state.eventsLoaded = true;
      state.eventsLoading = false;
      showToast('Server error loading events', 'error');
      render();
      return;
    }

    state.realEvents = Array.isArray(data) ? data : [];
    state.eventsLoaded = true;
    state.eventsLoading = false;
    render();
    if (typeof subscribeToRealtimeUpdates === 'function') subscribeToRealtimeUpdates();
  } catch (error) {
    console.error('LOAD EVENTS ERROR:', error);
    state.realEvents = [];
    state.eventsLoaded = true;
    state.eventsLoading = false;
    showToast('Server error loading events', 'error');
    render();
  }
}
window.loadEvents = loadEvents;


// ============================================================
//  RENDER ONE EVENT CARD
// ============================================================
function renderEventCard(ev) {
  var pct = ev.capacity > 0
    ? Math.round((Number(ev.attendance_count || 0) / Number(ev.capacity || 0)) * 100)
    : 0;

  var runtime = getEventRuntimeState(ev);
  var crowdLevel = (ev.crowd_level || 'low').toLowerCase();
  var category = ev.category || 'Event';
  var location = ev.location || 'Location not provided';
  var city = ev.city || '';
  var startTime = formatClockTime(ev.start_time || 'Time not provided');
  var startDate = ev.start_date || 'Date not provided';
  var statusMarkup = runtime.statusMessage
    ? '<div style="margin-top:12px;padding:10px 12px;border-radius:12px;background:' + (runtime.isEnded ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.12)') + ';border:1px solid ' + (runtime.isEnded ? 'rgba(239,68,68,0.22)' : 'rgba(245,158,11,0.22)') + ';font-size:12px;line-height:1.6;color:' + (runtime.isEnded ? '#fca5a5' : '#fcd34d') + ';">' + escapeHtml(runtime.statusMessage) + '</div>'
    : '';

  return '<div class="card" style="transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.2s ease;cursor:pointer;" onmouseenter="this.style.transform=\'translateY(-6px)\';this.style.boxShadow=\'0 16px 48px rgba(155,16,64,0.2),0 4px 12px rgba(0,0,0,0.4)\'" onmouseleave="this.style.transform=\'\';this.style.boxShadow=\'\'" onclick="navigate(\'detail\',{id:' + ev.id + '})">' +
    '<div style="position:relative;overflow:hidden;">' +
      '<div style="height:180px;background:linear-gradient(135deg,rgba(199,99,127,0.26),rgba(238,160,108,0.16),rgba(216,116,103,0.10));"></div>' +
      '<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(13,12,26,0.85) 0%,transparent 55%);"></div>' +
      '<span class="badge badge-cat" style="position:absolute;top:12px;left:12px;">' + category + '</span>' +
      '<div id="crowd-' + ev.id + '" style="position:absolute;bottom:12px;right:12px;">' + levelBadge(crowdLevel) + '</div>' +
      '<div style="position:absolute;bottom:16px;left:18px;right:18px;color:#fff;">' +
        '<div style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:22px;line-height:1.1;">' + (ev.name || 'Untitled Event') + '</div>' +
      '</div>' +
    '</div>' +
    '<div style="padding:18px 18px 20px;">' +
      '<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:14px;">' +
        '<span style="font-size:13px;color:var(--muted);">Location: ' + location + (city ? ', ' + city : '') + '</span>' +
        '<span style="font-size:13px;color:var(--muted);">Date: ' + startDate + ' | ' + startTime + '</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="font-size:12px;color:var(--muted);"><span id="cappct-' + ev.id + '" style="color:' + capBarColor(pct) + ';font-weight:700;">' + pct + '%</span> capacity</div>' +
        '<button class="btn-primary" style="font-size:12px;padding:8px 16px;" onclick="event.stopPropagation();navigate(\'detail\',{id:' + ev.id + '})">View Details</button>' +
      '</div>' +
      '<div class="cap-bar-outer" style="margin-top:10px;">' +
        '<div id="capbar-' + ev.id + '" class="cap-bar-inner" style="width:' + pct + '%;background:' + capBarColor(pct) + ';"></div>' +
      '</div>' +
      statusMarkup +
    '</div>' +
  '</div>';
}


// ============================================================
//  VIEW: HOME
// ============================================================
function renderHome() {
  if (typeof ensureSupportChatState === 'function') {
    ensureSupportChatState(null);
  }

  if (!state.eventsLoading && !state.eventsLoaded && typeof loadEvents === 'function') {
    loadEvents();
  }

  var fixedCategories = ['all', 'music', 'technology', 'sports', 'art', 'food', 'entertainment'];
  var allEvents = state.realEvents || [];
  var seen = {};
  var uniqueEvents = allEvents.filter(function(ev) {
    var key = ev.id
      ? 'id-' + ev.id
      : (ev.name || '') + '|' + (ev.category || '') + '|' + (ev.start_date || '') + '|' + (ev.start_time || '');

    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });

  var searchQ = (state.searchQuery || '').toLowerCase().trim();
  var events = uniqueEvents.filter(function(ev) {
    var catMatch = state.catFilter === 'all' || (ev.category || '').toLowerCase() === state.catFilter;
    var searchMatch = !searchQ ||
      (ev.name || '').toLowerCase().includes(searchQ) ||
      (ev.location || '').toLowerCase().includes(searchQ) ||
      (ev.city || '').toLowerCase().includes(searchQ) ||
      (ev.category || '').toLowerCase().includes(searchQ);
    return catMatch && searchMatch;
  });

  function renderHero() {
    return '<section class="hero-section noise">' +
      '<div class="grid-bg"></div>' +
      '<div style="position:relative;z-index:1;max-width:760px;margin:0 auto;text-align:center;">' +
        '<div class="badge badge-cat" style="margin-bottom:24px;font-size:12px;padding:6px 16px;">🤖 AI-POWERED CROWD INTELLIGENCE</div>' +
        '<h1 style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:clamp(48px,7vw,80px);line-height:1.0;margin-bottom:20px;letter-spacing:-0.02em;">' +
          '<span style="display:block;">Discover</span>' +
          '<span class="gradient-text" style="display:block;">Events</span>' +
        '</h1>' +
        '<p style="color:var(--muted);font-size:17px;max-width:520px;margin:0 auto 36px;line-height:1.7;">Real-time crowd predictions and AI-powered insights to make every event experience unforgettable.</p>' +
        '<div class="home-search-bar" style="display:flex;align-items:center;gap:0;max-width:600px;margin:0 auto;background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;backdrop-filter:blur(8px);">' +
          '<span style="padding:0 16px;font-size:16px;color:var(--muted);flex-shrink:0;">🔍</span>' +
          '<input placeholder="Search events, artists, venues..." value="' + (state.searchQuery || '') + '" oninput="setSearch(this.value)" style="flex:1;background:transparent;border:none;outline:none;color:var(--text);font-family:Roboto,sans-serif;font-size:15px;padding:14px 0;" />' +
          '<button class="home-search-button" onclick="void(0)" style="background:linear-gradient(135deg,#c7637f,#eea06c,#d87467);color:#fff;border:none;padding:14px 28px;font-family:Montserrat,sans-serif;font-weight:700;font-size:14px;cursor:pointer;flex-shrink:0;">Search</button>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function renderFilters() {
    var cats = fixedCategories.filter(function(c) { return c !== 'entertainment'; });
    return '<section class="events-section-pad" style="width:100%;max-width:1400px;margin:0 auto;padding:40px 32px 0;box-sizing:border-box;">' +
      '<div id="events-section" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">' +
        '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;color:var(--text);">Upcoming Events</h2>' +
        '<div class="home-filter-bar" style="display:flex;gap:6px;flex-wrap:wrap;padding:5px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">' +
          cats.map(function(cat) {
            var active = state.catFilter === cat;
            var label = cat.charAt(0).toUpperCase() + cat.slice(1);
            return '<button class="home-filter-btn ' + (active ? 'active' : '') + '" onclick="setCategory(\'' + cat + '\')" style="' +
              'padding:7px 16px;border-radius:8px;border:none;font-family:Montserrat,sans-serif;font-size:13px;font-weight:700;cursor:pointer;' +
              'transition:background 0.15s ease,color 0.15s ease;' +
              (active
                ? 'background:linear-gradient(135deg,#c7637f,#eea06c,#d87467);color:#fff;box-shadow:0 2px 10px rgba(199,99,127,0.26);'
                : 'background:transparent;color:var(--muted);'
              ) +
            '">' + label + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</section>';
  }

  if (!state.eventsLoaded) {
    return renderTopNav() +
      renderHero() +
      '<section style="width:100%;max-width:1400px;margin:0 auto;padding:48px 32px;box-sizing:border-box;">' +
        '<div class="card" style="padding:32px;text-align:center;">' +
          '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:24px;margin-bottom:12px;">Loading Events...</h2>' +
          '<p style="color:var(--muted);font-size:14px;">Please wait while events are loading.</p>' +
        '</div>' +
      '</section>' +
      (typeof renderFloatingSupportWidget === 'function' ? renderFloatingSupportWidget(null) : '');
  }

  if (!events.length) {
    return renderTopNav() +
      renderHero() +
      renderFilters() +
      '<section style="width:100%;max-width:1400px;margin:0 auto;padding:48px 32px;box-sizing:border-box;">' +
        '<div class="card" style="padding:32px;text-align:center;">' +
          '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:24px;margin-bottom:12px;">No Events Found</h2>' +
          '<p style="color:var(--muted);font-size:14px;">' +
            (state.catFilter === 'all'
              ? 'There are no events available at this time.'
              : 'There are no ' + state.catFilter + ' events available at this moment.'
            ) +
          '</p>' +
        '</div>' +
      '</section>' +
      (typeof renderFloatingSupportWidget === 'function' ? renderFloatingSupportWidget(null) : '');
  }

  return renderTopNav() +
    renderHero() +
    renderFilters() +
    '<section class="events-section-pad" style="width:100%;max-width:1400px;margin:0 auto;padding:24px 32px 48px;box-sizing:border-box;">' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));gap:22px;align-items:start;">' +
        events.map(function(ev) {
          return renderEventCard(ev);
        }).join('') +
      '</div>' +
    '</section>' +
    renderContactSection() +
    (typeof renderFloatingSupportWidget === 'function' ? renderFloatingSupportWidget(null) : '');
}

function renderContactSection() {
  return '<footer style="width:100%;background:var(--dark2);border-top:1px solid var(--border);' +
    'padding:48px 32px;text-align:center;box-sizing:border-box;">' +
    '<div style="max-width:600px;margin:0 auto;">' +
      '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:20px;' +
      'margin-bottom:10px;">Contact Us</div>' +
      '<div style="font-size:14px;color:var(--muted);line-height:1.8;margin-bottom:20px;">' +
        'For general questions, event issues, or support — reach us at:' +
      '</div>' +
      '<a href="mailto:analyzingcrowd@gmail.com" ' +
      'style="display:inline-flex;align-items:center;gap:10px;padding:14px 28px;' +
      'background:rgba(155,16,64,0.15);border:1.5px solid rgba(155,16,64,0.35);' +
      'border-radius:12px;color:#fff;font-family:\'Montserrat\',sans-serif;font-weight:700;' +
      'font-size:15px;text-decoration:none;transition:background 0.2s ease;" ' +
      'onmouseenter="this.style.background=\'rgba(155,16,64,0.28)\'" ' +
      'onmouseleave="this.style.background=\'rgba(155,16,64,0.15)\'">' +
        '✉️ analyzingcrowd@gmail.com' +
      '</a>' +
    '</div>' +
  '</footer>';
}
