function setDetailViewMode(mode) {
  if (state.detailViewMode === mode) return;
  state.detailViewMode = mode;
  render({ preserveScroll: true });
}
window.setDetailViewMode = setDetailViewMode;

function getCurrentDetailEvent() {
  var id = state.params.id;
  var events = state.realEvents || [];
  return events.find(function(e) {
    return Number(e.id) === Number(id);
  }) || events[0] || null;
}

function getSupportContextData(ev) {
  var view = state.view || 'home';

  if (view === 'detail' && ev) {
    return {
      key: 'detail:' + ev.id,
      title: 'Support',
      subtitle: 'Friendly help for this event page.',
      footerText: 'Support explains this event page in simple language for customers.',
      inputPlaceholder: 'Ask Support about this event...',
      intro: 'Hi! I am Support. I can explain this event page, what the chart means, what the prediction means, and how to read the crowd level.',
      options: [
        { topic: 'detail-overview', label: 'Explain this page' },
        { topic: 'detail-chart', label: 'What does the chart mean?' },
        { topic: 'detail-current', label: 'What is current attendance?' },
        { topic: 'detail-prediction', label: 'What does prediction mean?' },
        { topic: 'detail-crowd', label: 'How do I read crowd level?' },
        { topic: 'detail-tutorial', label: 'Show event tutorial' }
      ]
    };
  }

  if (view === 'customer-dashboard') {
    return {
      key: 'settings',
      title: 'Support',
      subtitle: 'Friendly help for your settings page.',
      footerText: 'Support can explain settings, notifications, and your customer history.',
      inputPlaceholder: 'Ask Support about your settings...',
      intro: 'Hi! I am Support. I can explain your Settings page, how notifications work, and guide you step by step if you want a short tutorial.',
      options: [
        { topic: 'settings-overview', label: 'Explain settings page' },
        { topic: 'settings-notifications', label: 'How do notifications work?' },
        { topic: 'settings-name', label: 'How do I update my name?' },
        { topic: 'settings-history', label: 'What is event history?' },
        { topic: 'settings-tutorial', label: 'Show settings tutorial' }
      ]
    };
  }

  return {
    key: 'home',
    title: 'Support',
    subtitle: 'Friendly help for using the website.',
    footerText: 'Support can explain how the platform works for customers in a simple way.',
    inputPlaceholder: 'Ask Support how to use the site...',
    intro: 'Hi! I am Support. I can show you how to use Crowd Analyzing, what customers benefit from it, and guide you with a short tutorial if you want.',
    options: [
      { topic: 'home-overview', label: 'How do I use this website?' },
      { topic: 'home-benefits', label: 'What do customers get?' },
      { topic: 'home-tickets', label: 'How do I buy a ticket?' },
      { topic: 'home-notifications', label: 'What notifications can I get?' },
      { topic: 'home-tutorial', label: 'Show me a tutorial' }
    ]
  };
}

function buildInitialSupportMessages(context) {
  return [
    {
      role: 'bot',
      text: context.intro
    },
    {
      role: 'bot',
      type: 'choices',
      options: context.options || []
    }
  ];
}

function ensureSupportChatState(ev) {
  var context = getSupportContextData(ev);

  if (ev) {
    state.supportChatEventId = ev.id;
  }

  if (state.supportChatContextKey === context.key && (state.supportChatMessages || []).length) {
    return;
  }

  state.supportChatContextKey = context.key;
  state.supportChatMessages = buildInitialSupportMessages(context);
}
window.ensureSupportChatState = ensureSupportChatState;

function toggleSupportChat(forceOpen) {
  if (typeof forceOpen === 'boolean') {
    state.supportChatOpen = forceOpen;
  } else {
    state.supportChatOpen = !state.supportChatOpen;
  }

  render({ preserveScroll: true });
  if (state.supportChatOpen) {
    setTimeout(syncSupportChatScroll, 0);
  }
}
window.toggleSupportChat = toggleSupportChat;

function getCurrentSupportEvent() {
  if (state.view === 'detail') {
    return getCurrentDetailEvent();
  }
  return null;
}

function renderDetail() {
  var events = state.realEvents || [];

  if (!state.eventsLoaded && !state.eventsLoading && typeof loadEvents === 'function') {
    loadEvents();
  }

  if (state.eventsLoading && !events.length) {
    return renderTopNav() +
      '<div style="max-width:1180px;margin:0 auto;padding:32px;">' +
        '<div class="card" style="padding:32px;text-align:center;">' +
          '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;margin-bottom:12px;">Loading Event...</h2>' +
          '<p style="color:var(--muted);">Please wait while the event loads from the database.</p>' +
        '</div>' +
      '</div>';
  }

  var ev = getCurrentDetailEvent();

  if (!ev) {
    return renderTopNav() +
      '<div style="max-width:1180px;margin:0 auto;padding:32px;">' +
        '<div class="card" style="padding:32px;text-align:center;">' +
          '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;margin-bottom:12px;">No Event Found</h2>' +
          '<p style="color:var(--muted);">There are no events available right now.</p>' +
        '</div>' +
      '</div>';
  }

  var mode = state.detailViewMode || 'current';
  var prediction = ev.prediction || {};
  var capacityPerDay = Number(ev.capacity_per_day || 0);
  var totalCapacity;
  if (capacityPerDay > 0 && ev.start_date && ev.end_date && ev.start_date !== ev.end_date) {
    var sdCap = new Date(ev.start_date + 'T00:00:00');
    var edCap = new Date(ev.end_date + 'T00:00:00');
    var numDaysCap = Math.max(Math.round((edCap - sdCap) / 86400000) + 1, 1);
    totalCapacity = capacityPerDay * numDaysCap;
  } else {
    totalCapacity = Number(ev.capacity || 0);
  }
  var pct = totalCapacity > 0 ? Math.round((Number(ev.attendance_count || 0) / totalCapacity) * 100) : 0;
  var predictedPeakPercent = Number(prediction.predicted_peak_percent || pct);
  var predictedPeakAttendance = Number(prediction.predicted_peak_attendance || prediction.predicted_final_attendance || 0);
  var crowdLevel = (ev.crowd_level || 'low').toLowerCase();
  var predictedCrowdLevel = (prediction.predicted_crowd_level || ev.crowd_level || 'low').toLowerCase();
  var runtime = getEventRuntimeState(ev);
  var remainingTickets = runtime.remainingTickets;
  var eventDateText = (ev.start_date || 'TBA') + (ev.end_date && ev.end_date !== ev.start_date ? ' to ' + ev.end_date : '');
  var eventTimeText = formatTimeRange(ev.start_time || 'TBA', ev.end_time || 'TBA');
  var eventLocationText = (ev.location || 'TBA') + (ev.city ? ', ' + ev.city : '');
  var eventStatusNote = runtime.statusMessage
    ? '<div style="margin-top:16px;padding:12px 14px;border-radius:14px;background:' + (runtime.isEnded ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)') + ';border:1px solid ' + (runtime.isEnded ? 'rgba(239,68,68,0.20)' : 'rgba(245,158,11,0.20)') + ';font-size:13px;line-height:1.7;color:' + (runtime.isEnded ? '#fecaca' : '#fde68a') + ';">' + escapeHtml(runtime.statusMessage) + '</div>'
    : '';
  var buyButtonLabel = runtime.isEnded ? 'Event Ended' : (runtime.isSoldOut ? 'Sold Out' : 'Buy Ticket');
  var buyButtonStyle = runtime.isEnded || runtime.isSoldOut
    ? 'width:100%;justify-content:center;font-size:15px;padding:14px;background:#475569;border-color:#475569;cursor:not-allowed;opacity:0.8;'
    : 'width:100%;justify-content:center;font-size:15px;padding:14px;';
  ensureSupportChatState(ev);

  return renderTopNav() +
    '<div class="event-detail-page" style="max-width:1180px;margin:0 auto;padding:32px;">' +
      '<button class="btn-ghost event-detail-back" style="margin-bottom:24px;" onclick="navigate(\'home\')">Back to Events</button>' +

      '<div class="card event-detail-hero-card" style="overflow:hidden;margin-bottom:28px;background:linear-gradient(135deg,rgba(155,16,64,0.28),rgba(212,154,53,0.12),rgba(255,255,255,0.03));">' +
        '<div style="padding:34px 32px;">' +
          '<div class="event-detail-hero-top" style="display:flex;flex-direction:column;gap:20px;">' +
            '<div class="event-detail-hero-info-row">' +
              '<div class="event-detail-hero-copy-wrap">' +
                '<div class="event-detail-badge-row" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;">' +
                  '<span class="badge badge-cat">' + (ev.category || 'Event') + '</span>' +
                  '<span class="event-detail-status-pill">' + levelBadge(mode === 'prediction' ? predictedCrowdLevel : crowdLevel) + '</span>' +
                '</div>' +
                '<h1 class="event-detail-title" style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:clamp(30px,4vw,44px);letter-spacing:-0.03em;margin-bottom:12px;">' + ev.name + '</h1>' +
                '<div class="event-detail-meta-row">' +
                  renderDetailMetaPill('Date', eventDateText) +
                  renderDetailMetaPill('Time', eventTimeText) +
                  renderDetailMetaPill('Location', eventLocationText) +
                '</div>' +
              '</div>' +
              '<div class="event-detail-description">' +
                '<div class="event-detail-description-label">Description</div>' +
                '<p class="event-detail-hero-copy" style="color:#f6e6eb;line-height:1.8;font-size:15px;">' + (ev.description || 'No description available for this event yet.') + '</p>' +
              '</div>' +
            '</div>' +
            '<div class="event-detail-hero-stats" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">' +
              renderDetailHeroStat('Total Capacity', totalCapacity.toLocaleString()) +
              renderDetailHeroStat('Current Attendance', Number(ev.attendance_count || 0).toLocaleString()) +
              renderDetailHeroStat('Current Crowd', pct + '%') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="event-detail-layout" style="display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:24px;align-items:start;">' +
        '<div class="event-detail-main-column" style="display:flex;flex-direction:column;gap:24px;">' +
          '<div class="card event-detail-overview-card" style="padding:24px;">' +
            '<div class="event-detail-section-head" style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:18px;">' +
              '<div>' +
                '<h2 class="event-detail-section-title" style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;margin-bottom:6px;">Attendance Dashboard</h2>' +
                '<p class="event-detail-section-copy" style="color:var(--muted);font-size:14px;">Clear live and forecast information to help the customer understand the event quickly.</p>' +
              '</div>' +
              '<div class="tab-bar" style="min-width:280px;">' +
                '<button class="tab-btn ' + (mode === 'current' ? 'active' : '') + '" onclick="setDetailViewMode(\'current\')">Current View</button>' +
                '<button class="tab-btn ' + (mode === 'prediction' ? 'active' : '') + '" onclick="setDetailViewMode(\'prediction\')">Prediction View</button>' +
              '</div>' +
            '</div>' +
            '<div class="event-detail-metric-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px;">' +
              (mode === 'current'
                ? [
                    renderEventMetricTile('Current Attendance', Number(ev.attendance_count || 0).toLocaleString()),
                    renderEventMetricTile('Total Capacity', totalCapacity.toLocaleString()),
                    renderEventMetricTile('Live Crowd Level', levelBadge(crowdLevel))
                  ].join('')
                : [
                    renderEventMetricTile('Predicted Peak Attendance', predictedPeakAttendance.toLocaleString()),
                    renderEventMetricTile('Predicted Peak Capacity', predictedPeakPercent + '%'),
                    renderEventMetricTile('Predicted Crowd Level', levelBadge(predictedCrowdLevel))
                  ].join('')
              ) +
            '</div>' +
            '<div class="event-detail-note" style="padding:14px 16px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid var(--border);margin-bottom:16px;">' +
              '<div style="font-size:13px;color:var(--muted);line-height:1.7;">' +
                (mode === 'current'
                  ? 'The current view shows live attendance scanned by staff. Each successful scan increases the attendance immediately.'
                  : (prediction.forecast_summary || 'The prediction view estimates how crowded this event may become based on current tickets, attendance, and event timing.')
                ) +
              '</div>' +
            '</div>' +
            '<div class="event-detail-chart-wrap" style="height:320px;"><canvas id="event-detail-weekly-chart"></canvas></div>' +
          '</div>' +

          '<div class="card event-detail-analysis-card" style="padding:24px;">' +
            '<div class="event-detail-section-head" style="margin-bottom:14px;">' +
              '<h2 class="event-detail-section-title" style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;margin-bottom:6px;">Crowd Level Analysis</h2>' +
              '<p class="event-detail-section-copy" style="color:var(--muted);font-size:14px;">A quick reading of current crowd, forecast, and ticket availability.</p>' +
            '</div>' +
            '<div class="event-detail-analysis-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:16px;">' +
              renderCrowdAnalysisCard('Current Crowd', levelBadge(crowdLevel), 'Live attendance is at ' + pct + '% of capacity right now.') +
              renderCrowdAnalysisCard('Prediction', levelBadge(predictedCrowdLevel), 'Expected peak is ' + predictedPeakPercent + '% of capacity.') +
              renderCrowdAnalysisCard('Available Tickets', remainingTickets != null ? remainingTickets.toLocaleString() : 'N/A', 'Tickets still available for customers.') +
            '</div>' +
            '<div class="event-detail-info-grid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;">' +
              renderInfoGridItem('Event Date', eventDateText) +
              renderInfoGridItem('Event Time', eventTimeText) +
              renderInfoGridItem('Event Location', eventLocationText) +
              renderInfoGridItem('Current Attendance', Number(ev.attendance_count || 0).toLocaleString()) +
            '</div>' +
          '</div>' +

          renderBestVisitTimeCard(ev) +

        '</div>' +

        '<div class="event-detail-side-column" style="position:sticky;top:80px;display:flex;flex-direction:column;gap:18px;">' +
          '<div class="card event-detail-side-card" style="padding:22px;">' +
            '<div class="event-detail-side-kicker" style="font-size:12px;color:var(--muted);font-family:\'Montserrat\',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Live Snapshot</div>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;">' +
              '<div style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:40px;color:' + capBarColor(pct) + ';">' + pct + '%</div>' +
              levelBadge(crowdLevel) +
            '</div>' +
            '<div class="cap-bar-outer" style="height:10px;margin-bottom:18px;">' +
              '<div class="cap-bar-inner" style="width:' + pct + '%;background:' + capBarColor(pct) + ';"></div>' +
            '</div>' +
            '<div class="event-detail-side-list" style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">' +
              detailListRow('Current Attendance', Number(ev.attendance_count || 0).toLocaleString()) +
              detailListRow('Predicted Peak', predictedPeakAttendance.toLocaleString()) +
              detailListRow('Total Capacity', totalCapacity.toLocaleString()) +
            '</div>' +
            '<button class="btn-primary" style="' + buyButtonStyle + '" onclick="buyTicket(' + ev.id + ')"' + ((runtime.isEnded || runtime.isSoldOut) ? ' disabled' : '') + '>' + buyButtonLabel + '</button>' +
            eventStatusNote +
          '</div>' +
        '</div>' +
      '</div>' +
      renderFloatingSupportWidget(ev) +
    '</div>';
}

function renderDetailMetaPill(label, value) {
  return '<div class="event-detail-meta-pill">' +
    '<div class="event-detail-meta-label">' + label + '</div>' +
    '<div class="event-detail-meta-value">' + value + '</div>' +
  '</div>';
}

function renderDetailHeroStat(label, value) {
  return '<div class="event-detail-hero-stat" style="padding:14px 16px;border-radius:14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);">' +
    '<div style="font-size:11px;color:#f0c4d0;font-family:\'Montserrat\',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">' + label + '</div>' +
    '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:16px;">' + value + '</div>' +
  '</div>';
}

function renderEventMetricTile(label, value) {
  return '<div class="event-detail-metric-tile" style="padding:14px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid var(--border);">' +
    '<div style="font-size:11px;color:var(--muted);font-family:\'Montserrat\',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">' + label + '</div>' +
    '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;">' + value + '</div>' +
  '</div>';
}

function renderCrowdAnalysisCard(label, value, description) {
  return '<div class="event-detail-analysis-tile" style="padding:16px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid var(--border);">' +
    '<div style="font-size:11px;color:var(--muted);font-family:\'Montserrat\',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">' + label + '</div>' +
    '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:20px;margin-bottom:8px;">' + value + '</div>' +
    '<div style="font-size:13px;color:var(--muted);line-height:1.7;">' + description + '</div>' +
  '</div>';
}

function renderInfoGridItem(label, value) {
  return '<div class="event-detail-info-item" style="padding:16px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid var(--border);">' +
    '<div style="font-size:11px;color:var(--muted);font-family:\'Montserrat\',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">' + label + '</div>' +
    '<div style="font-size:14px;line-height:1.7;">' + value + '</div>' +
  '</div>';
}

function detailListRow(label, value) {
  return '<div class="event-detail-side-list-row" style="display:flex;justify-content:space-between;gap:12px;font-size:14px;">' +
    '<span style="color:var(--muted);">' + label + '</span>' +
    '<span style="font-weight:700;">' + value + '</span>' +
  '</div>';
}

function renderSupportChatbot(ev) {
  var messages = state.supportChatMessages || [];

  return '' +
    '<div class="support-chat-shell">' +
      '<div class="support-chat-log" id="support-chat-log">' +
        messages.map(function(message) {
          return renderSupportMessageBubble(message);
        }).join('') +
      '</div>' +
      '<div class="support-chat-input-row">' +
        '<input id="support-chat-input" class="input-field support-chat-input" type="text" placeholder="' + escapeSupportHtml(getSupportContextData(ev).inputPlaceholder) + '" onkeydown="if(event.key===\'Enter\') sendSupportMessage()" />' +
        '<button class="btn-primary" style="padding:10px 14px;" onclick="sendSupportMessage()">Send</button>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--muted);margin-top:10px;">' + escapeSupportHtml(getSupportContextData(ev).footerText) + '</div>' +
    '</div>';
}

function renderFloatingSupportWidget(ev) {
  var context = getSupportContextData(ev);
  var isOpen = !!state.supportChatOpen;

  return '' +
    '<div class="support-fab-wrap">' +
      (isOpen
        ? '<div class="support-chat-panel card">' +
            '<div class="support-chat-panel-head">' +
              '<div>' +
                '<div style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:20px;">' + context.title + '</div>' +
                '<div style="font-size:12px;color:var(--muted);">' + escapeSupportHtml(context.subtitle) + '</div>' +
              '</div>' +
              '<button class="btn-ghost" style="padding:8px 12px;font-size:12px;" onclick="toggleSupportChat(false)">Close</button>' +
            '</div>' +
            renderSupportChatbot(ev) +
          '</div>'
        : ''
      ) +
      '<button class="support-fab" onclick="toggleSupportChat(' + (!isOpen ? 'true' : 'false') + ')">Support</button>' +
    '</div>';
}
window.renderFloatingSupportWidget = renderFloatingSupportWidget;

function renderSupportChoiceBubble(options) {
  return '<div class="support-chat-bubble bot support-chat-choice-bubble">' +
    '<div class="support-chat-meta">Support</div>' +
    '<div style="margin-bottom:10px;">Quick options you can tap:</div>' +
    '<div class="support-chat-choice-grid">' +
      (options || []).map(function(option) {
        return renderSupportChoiceButton(option.label, option.topic);
      }).join('') +
    '</div>' +
  '</div>';
}

function renderSupportChoiceButton(label, topic) {
  return '<button class="support-chat-choice-btn" type="button" onclick="askSupportBot(\'' + topic + '\', \'' + label.replace(/'/g, "\\'") + '\')">' + label + '</button>';
}

function renderSupportMessageBubble(message) {
  if (message.type === 'choices') {
    return renderSupportChoiceBubble(message.options || []);
  }

  var bubbleClass = message.role === 'user' ? 'support-chat-bubble user' : 'support-chat-bubble bot';
  var roleLabel = message.role === 'user' ? 'You' : 'Support';

  return '<div class="' + bubbleClass + '">' +
    '<div class="support-chat-meta">' + roleLabel + '</div>' +
    '<div>' + escapeSupportHtml(message.text) + '</div>' +
  '</div>';
}

function escapeSupportHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>');
}

function getSupportAnswer(topic, ev, mode) {
  var prediction = ev && ev.prediction ? ev.prediction : {};
  var currentPercent = ev && ev.capacity > 0 ? Math.round((Number(ev.attendance_count || 0) / Number(ev.capacity || 0)) * 100) : 0;
  var predictedPeakPercent = Number(prediction.predicted_peak_percent || currentPercent);

  if (topic === 'detail-chart') {
    return 'The bar chart uses the days of the week on the bottom and the number of attendees on the side. The chart always starts from 0 and goes up to the event capacity so it is easy to compare how full the event is.';
  }

  if (topic === 'detail-current') {
    return 'Current attendance means how many people have already been scanned by staff at the gate. Every valid ticket scan increases this number immediately.';
  }

  if (topic === 'detail-prediction') {
    return 'Prediction means the expected attendance later for this event. Right now the forecast expects about ' + Number(prediction.predicted_peak_attendance || prediction.predicted_final_attendance || 0).toLocaleString() + ' attendees at peak time, which is around ' + predictedPeakPercent + '% of capacity.';
  }

  if (topic === 'detail-crowd') {
    return 'Crowd level is a simple way to read how busy the event is. Low means comfortable, medium means getting busier, and high means you should expect heavy crowding. The current crowd is ' + currentPercent + '% of capacity.';
  }

  if (topic === 'detail-tutorial') {
    return 'Event page tutorial:\n1. Read the event name, date, time, and location at the top.\n2. Use Current View to see the live attendance now.\n3. Use Prediction View to see the expected peak later.\n4. Check the crowd level and available tickets.\n5. If you want to attend, press Buy Ticket.';
  }

  if (topic === 'home-overview') {
    return 'Use the home page to browse events, search by name or place, and open any event card to see the full details. When you are ready, sign in as a customer and buy your ticket from the event page.';
  }

  if (topic === 'home-benefits') {
    return 'Customers benefit from Crowd Analyzing by seeing live crowd levels before going, checking attendance predictions, buying tickets online, receiving a barcode instantly, and getting important updates like emergencies or crowd alerts.';
  }

  if (topic === 'home-tickets') {
    return 'To buy a ticket:\n1. Open an event from the home page.\n2. Review the event details and crowd information.\n3. Press Buy Ticket.\n4. Confirm payment.\n5. Receive your ticket code and barcode for entry.';
  }

  if (topic === 'home-notifications') {
    return 'Customers can receive normal notifications for ticket updates and crowd updates, while emergency alerts stay important and are always kept on.';
  }

  if (topic === 'home-tutorial') {
    return 'Website tutorial:\n1. Start on the home page and browse available events.\n2. Use search to find an event faster.\n3. Open an event card to view live attendance and prediction.\n4. Sign in as a customer to buy a ticket.\n5. Keep your barcode ready so staff can scan it at the entrance.';
  }

  if (topic === 'settings-overview') {
    return 'The Settings page lets customers manage their saved name, control normal notifications, and review their event history in one place.';
  }

  if (topic === 'settings-notifications') {
    return 'In Settings, you can turn normal notifications on or off. This affects routine updates like ticket and crowd messages, but emergency alerts always stay enabled for safety.';
  }

  if (topic === 'settings-name') {
    return 'To update your name, type the new name in the Full Name field and press Save Name. Your updated name will appear in your account area and settings.';
  }

  if (topic === 'settings-history') {
    return 'Event history shows the events linked to your tickets, whether you attended them, the event date, and when the ticket was purchased.';
  }

  if (topic === 'settings-tutorial') {
    return 'Settings tutorial:\n1. Open Customer Dashboard / Settings.\n2. Update your saved name if needed.\n3. Review your notification preference.\n4. Turn normal notifications on or off.\n5. Scroll down to review your event history.';
  }

  return mode === 'prediction'
    ? 'This page helps you compare the live crowd with the forecast before you attend. Use Current View for what is happening now, and Prediction View for what the crowd may look like later.'
    : 'This page is customer-friendly by design: event details are at the top, live attendance is in Current View, and the forecast is in Prediction View. You do not need to buy a ticket to read this analysis.';
}

function pushSupportMessage(role, text) {
  state.supportChatMessages = state.supportChatMessages || [];
  state.supportChatMessages.push({
    role: role,
    text: text
  });
}

function syncSupportChatScroll() {
  var log = document.getElementById('support-chat-log');
  if (log) {
    log.scrollTop = log.scrollHeight;
  }
}
window.syncSupportChatScroll = syncSupportChatScroll;

function askSupportBot(topic, label) {
  var ev = getCurrentSupportEvent();

  state.supportChatOpen = true;
  pushSupportMessage('user', label);
  pushSupportMessage('bot', getSupportAnswer(topic, ev, state.detailViewMode || 'current'));
  render({ preserveScroll: true });
  setTimeout(syncSupportChatScroll, 0);
}
window.askSupportBot = askSupportBot;

function sendSupportMessage() {
  var input = document.getElementById('support-chat-input');
  var ev = getCurrentSupportEvent();
  if (!input) return;

  var question = input.value.trim();
  if (!question) return;

  state.supportChatOpen = true;
  pushSupportMessage('user', question);
  pushSupportMessage('bot', getCustomSupportReply(question, ev));
  render({ preserveScroll: true });
  setTimeout(syncSupportChatScroll, 0);
}
window.sendSupportMessage = sendSupportMessage;

function getCustomSupportReply(question, ev) {
  var text = String(question || '').toLowerCase();

  if (text.indexOf('chart') !== -1 || text.indexOf('graph') !== -1) {
    return getSupportAnswer('detail-chart', ev, state.detailViewMode || 'current');
  }

  if (text.indexOf('current') !== -1 || text.indexOf('attendance') !== -1 || text.indexOf('live') !== -1 || text.indexOf('scan') !== -1) {
    return getSupportAnswer('detail-current', ev, state.detailViewMode || 'current');
  }

  if (text.indexOf('predict') !== -1 || text.indexOf('forecast') !== -1 || text.indexOf('expected') !== -1) {
    return getSupportAnswer('detail-prediction', ev, state.detailViewMode || 'current');
  }

  if (text.indexOf('crowd') !== -1 || text.indexOf('busy') !== -1 || text.indexOf('level') !== -1) {
    return getSupportAnswer('detail-crowd', ev, state.detailViewMode || 'current');
  }

  if (text.indexOf('ticket') !== -1 || text.indexOf('buy') !== -1) {
    if (state.view === 'detail') {
      return 'You can read this event page without buying a ticket. If you decide to attend, use the Buy Ticket button and the system will give you a ticket code and barcode after payment.';
    }
    return getSupportAnswer('home-tickets', ev, state.detailViewMode || 'current');
  }

  if (text.indexOf('tutorial') !== -1 || text.indexOf('step') !== -1 || text.indexOf('how do i use') !== -1) {
    if (state.view === 'customer-dashboard') {
      return getSupportAnswer('settings-tutorial', ev, state.detailViewMode || 'current');
    }
    if (state.view === 'detail') {
      return getSupportAnswer('detail-tutorial', ev, state.detailViewMode || 'current');
    }
    return getSupportAnswer('home-tutorial', ev, state.detailViewMode || 'current');
  }

  if (text.indexOf('benefit') !== -1 || text.indexOf('why') !== -1 || text.indexOf('customer') !== -1) {
    return getSupportAnswer('home-benefits', ev, state.detailViewMode || 'current');
  }

  if (text.indexOf('notification') !== -1 || text.indexOf('alert') !== -1) {
    if (state.view === 'customer-dashboard') {
      return getSupportAnswer('settings-notifications', ev, state.detailViewMode || 'current');
    }
    return getSupportAnswer('home-notifications', ev, state.detailViewMode || 'current');
  }

  if (text.indexOf('name') !== -1 || text.indexOf('profile') !== -1 || text.indexOf('setting') !== -1) {
    if (state.view === 'customer-dashboard') {
      return getSupportAnswer('settings-overview', ev, state.detailViewMode || 'current');
    }
  }

  if (text.indexOf('history') !== -1) {
    if (state.view === 'customer-dashboard') {
      return getSupportAnswer('settings-history', ev, state.detailViewMode || 'current');
    }
  }

  if (state.view === 'customer-dashboard') {
    return 'I can explain your settings, notifications, saved name, and event history. Try asking: "How do notifications work?" or "Show settings tutorial".';
  }

  if (state.view === 'detail') {
    return 'You can read this event page without buying a ticket. If you decide to attend, use the Buy Ticket button and the system will give you a ticket code after payment.';
  }

  return 'I can explain how to use the website, what customers get from the platform, tickets, notifications, and give you a simple tutorial. Try asking: "How do I use this website?" or "Show me a tutorial".';
}

function initEventDetailPage() {
  var ev = getCurrentDetailEvent();
  if (!ev) return;

  initEventDetailAttendanceChart('event-detail-weekly-chart', ev, state.detailViewMode || 'current');
  syncSupportChatScroll();
  loadBestVisitTime(ev.id);
}

window.initEventDetailPage = initEventDetailPage;

// ============================================================
//  BEST TIME TO VISIT — ML prediction
// ============================================================

function loadBestVisitTime(eventId, forceRefresh) {
  if (!eventId) return;
  state.bestVisitPrediction = state.bestVisitPrediction || {};

  var existing = state.bestVisitPrediction[eventId];
  if (!forceRefresh && existing && existing._loading) return;
  if (!forceRefresh && existing && !existing._error && !existing._loading) return;

  state.bestVisitPrediction[eventId] = { _loading: true };

  fetch('/api/events/' + eventId + '/best-visit-time')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      state.bestVisitPrediction[eventId] = data;
      var card = document.getElementById('best-visit-card-' + eventId);
      if (card) {
        card.innerHTML = renderBestVisitCardInner(data);
      }
    })
    .catch(function() {
      state.bestVisitPrediction[eventId] = { _error: true };
    });
}
window.loadBestVisitTime = loadBestVisitTime;

function renderBestVisitTimeCard(ev) {
  var pred = (state.bestVisitPrediction || {})[ev.id];
  return '<div class="card" id="best-visit-card-' + ev.id + '" style="padding:24px;">' +
    renderBestVisitCardInner(pred) +
  '</div>';
}

function renderBestVisitCardInner(pred) {
  var header =
    '<div style="margin-bottom:18px;">' +
      '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;margin-bottom:6px;">Best Time to Visit</h2>' +
      '<p style="color:var(--muted);font-size:14px;">ML prediction based on attendance patterns and event data.</p>' +
    '</div>';

  if (!pred || pred._loading) {
    return header +
      '<div style="text-align:center;padding:32px 0;color:var(--muted);font-size:14px;">Analysing crowd patterns&hellip;</div>';
  }

  if (pred._error || !pred.hourly) {
    return header +
      '<div style="padding:14px 16px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid var(--border);font-size:13px;color:var(--muted);">Prediction unavailable for this event.</div>';
  }

  var rec = pred.recommended;
  var confidenceColor = pred.model_confidence === 'data-driven' ? '#22C55E' : pred.model_confidence === 'category-prior' ? '#F59E0B' : '#94A3B8';
  var confidenceLabel = pred.model_confidence === 'data-driven' ? 'Data-Driven' : pred.model_confidence === 'category-prior' ? 'Category Model' : 'Low Confidence';

  var recBanner = '';
  if (rec) {
    var recColor = rec.crowd_color || '#22C55E';
    recBanner =
      '<div style="background:rgba(34,197,94,0.08);border:1.5px solid rgba(34,197,94,0.30);border-radius:16px;padding:18px 20px;margin-bottom:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">' +
        '<div style="flex-shrink:0;width:52px;height:52px;border-radius:12px;background:rgba(34,197,94,0.15);display:flex;align-items:center;justify-content:center;">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
        '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:11px;color:#22C55E;font-family:\'Montserrat\',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Recommended Visit Window</div>' +
          '<div style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:22px;margin-bottom:4px;">' + escapeHtml(rec.date_label) + ' &nbsp;<span style="color:' + recColor + ';">' + escapeHtml(rec.time_label) + '</span></div>' +
          '<div style="font-size:13px;color:var(--muted);line-height:1.6;">' + escapeHtml(pred.reason || '') + '</div>' +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0;">' +
          '<div style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:28px;color:' + recColor + ';">' + rec.predicted_pct + '%</div>' +
          '<div style="font-size:11px;color:var(--muted);">predicted crowd</div>' +
        '</div>' +
      '</div>';
  }

  // Timeline chart — show up to 24 slots max to keep it readable
  var slots = pred.hourly || [];
  var maxSlots = 24;
  if (slots.length > maxSlots) {
    var step = Math.ceil(slots.length / maxSlots);
    var sampled = [];
    for (var i = 0; i < slots.length; i += step) sampled.push(slots[i]);
    slots = sampled;
  }

  var hasMultipleDays = slots.length > 1 && slots.some(function(s, i) {
    return i > 0 && s.date_label !== slots[i - 1].date_label;
  });

  var maxPct = Math.max.apply(null, slots.map(function(s) { return s.predicted_pct; })) || 1;
  var minBarH = 4;
  var maxBarH = 80;

  var bars = slots.map(function(s) {
    var barH = Math.max(minBarH, Math.round((s.predicted_pct / maxPct) * maxBarH));
    var isRec = rec && s.time_label === rec.time_label && s.date_label === rec.date_label;
    var opacity = s.is_past ? '0.35' : '1';
    var outline = '';
    var barLabel = hasMultipleDays ? (s.date_label.substring(0, 3) + ' ' + s.time_label) : s.time_label;
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;opacity:' + opacity + ';flex:1;min-width:0;">' +
      '<div style="font-size:9px;color:var(--muted);writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;max-height:72px;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(barLabel) + '</div>' +
      '<div style="width:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:' + maxBarH + 'px;">' +
        '<div style="width:clamp(4px,100%,18px);height:' + barH + 'px;background:' + s.crowd_color + ';border-radius:4px 4px 2px 2px;' + outline + 'transition:height 0.3s;position:relative;">' +
          (isRec ? '<div style="position:absolute;top:-8px;left:50%;transform:translateX(-50%);width:6px;height:6px;background:#22C55E;border-radius:50%;"></div>' : '') +
        '</div>' +
      '</div>' +
      '<div style="font-size:8px;color:' + s.crowd_color + ';font-weight:700;">' + s.predicted_pct + '%</div>' +
    '</div>';
  }).join('');

  var legend =
    '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;">' +
      [['#22C55E','Low (<25%)'],['#F59E0B','Moderate (25–54%)'],['#EF4444','High (55–79%)'],['#991B1B','Very High (≥80%)']].map(function(p) {
        return '<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);">' +
          '<div style="width:10px;height:10px;border-radius:3px;background:' + p[0] + ';flex-shrink:0;"></div>' + escapeHtml(p[1]) +
        '</div>';
      }).join('') +
      '<div style="margin-left:auto;font-size:11px;color:' + confidenceColor + ';font-family:\'Montserrat\',sans-serif;font-weight:700;">' + escapeHtml(confidenceLabel) + '</div>' +
    '</div>';

  var chart =
    '<div style="margin-top:4px;">' +
      '<div style="display:flex;align-items:flex-end;gap:2px;padding:0 4px;overflow-x:auto;">' + bars + '</div>' +
      legend +
    '</div>';

  return header + recBanner + chart;
}

function buyTicket(eventId) {
  var ev = (state.realEvents || []).find(function(item) {
    return Number(item.id) === Number(eventId);
  }) || null;
  var runtime = getEventRuntimeState(ev);

  if (runtime.isEnded) {
    showToast('Event has ended', 'error');
    return;
  }

  if (runtime.isSoldOut) {
    showToast(runtime.statusMessage || 'Tickets are sold out', 'error');
    return;
  }

  if (!state.user || !state.user.id) {
    showToast('You must log in first to purchase a ticket', 'error');
    state.loginRole = 'customer';
    navigate('login');
    return;
  }

  if (String(state.user.role).toLowerCase().trim() !== 'customer') {
    showToast('Only customer accounts can purchase tickets. Please sign in as a customer.', 'error');
    if (typeof clearAuthUser === 'function') {
      clearAuthUser();
    }
    state.loginRole = 'customer';
    navigate('login');
    return;
  }

  openPaymentModal(
    eventId,
    !state.user || state.user.role !== 'customer' || state.user.notifications_enabled !== false
  );
}
window.buyTicket = buyTicket;

async function openPaymentModal(eventId, crowdAlertsDefault) {
  var existing = document.getElementById('payment-modal');
  if (existing) existing.remove();

  var ev = (state.realEvents || []).find(function(item) {
    return Number(item.id) === Number(eventId);
  }) || null;
  var runtime = getEventRuntimeState(ev);

  if (runtime.isEnded) {
    showToast('Event has ended', 'error');
    return;
  }

  if (runtime.isSoldOut) {
    showToast(runtime.statusMessage || 'Tickets are sold out', 'error');
    return;
  }

  var capacityPerDay = Number(ev && ev.capacity_per_day || 0);
  var isMultiDay = !!(ev && ev.start_date && ev.end_date && ev.start_date !== ev.end_date);
  var needsDayPicker = capacityPerDay > 0 && isMultiDay;

  var dayPickerHtml = '';
  var initialMax = runtime.remainingTickets != null ? Math.max(Math.min(runtime.remainingTickets, 10), 1) : 10;

  if (needsDayPicker) {
    var daysData = null;
    try {
      var daysResp = await fetch('/api/events/' + eventId + '/days');
      daysData = daysResp.ok ? await daysResp.json() : null;
    } catch (e) { daysData = null; }

    var dayOptions = '<option value="" data-remaining="0">-- Select attendance date --</option>';
    if (daysData && daysData.days && daysData.days.length) {
      daysData.days.forEach(function(d) {
        var label = d.is_sold_out
          ? (d.day_name + ' — ' + d.date_display + ' — Sold Out')
          : (d.day_name + ' — ' + d.date_display + ' — ' + d.remaining + ' ticket' + (d.remaining === 1 ? '' : 's') + ' left');
        dayOptions += '<option value="' + d.date + '" data-remaining="' + d.remaining + '"' + (d.is_sold_out ? ' disabled' : '') + '>' + label + '</option>';
      });
    }
    dayPickerHtml =
      '<div>' +
        '<label class="field-label">Attendance Date</label>' +
        '<select class="input-field" id="pay-day" onchange="onPaymentDayChange(' + capacityPerDay + ')">' + dayOptions + '</select>' +
      '</div>';
    initialMax = Math.min(capacityPerDay, 10);
  }

  var maxSelectableTickets = Math.max(initialMax, 1);

  var modal =
    '<div id="payment-modal" class="payment-modal-shell" onclick="handlePaymentOverlayClick(event)" style="position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:3000;padding:18px;overflow:auto;">' +
      '<div class="card payment-modal-card" style="width:100%;max-width:560px;padding:24px;">' +
        '<div class="payment-modal-head">' +
          '<button class="payment-close-btn" onclick="closePaymentModal()" aria-label="Close purchase details">&times;</button>' +
          '<div>' +
            '<div class="badge badge-cat" style="margin-bottom:10px;">Checkout</div>' +
            '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:24px;margin-bottom:6px;">Purchase Details</h2>' +
            '<p style="color:var(--muted);font-size:14px;line-height:1.7;">Enter your payment information below, or close this window with the X button if you do not want to continue.</p>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:14px;">' +
          dayPickerHtml +
          '<div><label class="field-label">Number of Tickets</label><input type="number" class="input-field" id="pay-quantity" min="1" max="' + maxSelectableTickets + '" value="1" inputmode="numeric" /></div>' +
          '<div><label class="field-label">Cardholder Name</label><input type="text" class="input-field" id="pay-name" placeholder="Name on card" autocomplete="cc-name" /></div>' +
          '<div><label class="field-label">Card Number</label><input type="text" class="input-field" id="pay-number" placeholder="1234567890123456" inputmode="numeric" autocomplete="cc-number" maxlength="19" /></div>' +
          '<div class="payment-card-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '<div><label class="field-label">Expiry Date</label><input type="month" class="input-field" id="pay-expiry" autocomplete="cc-exp" /></div>' +
            '<div><label class="field-label">CVV</label><input type="text" class="input-field" id="pay-cvv" placeholder="123" inputmode="numeric" autocomplete="cc-csc" maxlength="3" /></div>' +
          '</div>' +
        '</div>' +
        '<div class="payment-confirm-note" id="pay-confirm-note">' +
          'You can buy up to ' + maxSelectableTickets + ' ticket' + (maxSelectableTickets === 1 ? '' : 's') + ' in one purchase. Press confirm to receive your ticket code and barcode' + (maxSelectableTickets === 1 ? '' : 's') + ' immediately.' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px;">' +
          '<button class="btn-ghost" onclick="closePaymentModal()">Cancel</button>' +
          '<button class="btn-primary" id="confirm-purchase-btn" onclick="confirmPayment(' + eventId + ')">Confirm Purchase</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.insertAdjacentHTML('beforeend', modal);
  setupPaymentModalFields();
}
window.openPaymentModal = openPaymentModal;

function onPaymentDayChange(capacityPerDay) {
  var select = document.getElementById('pay-day');
  var qtyInput = document.getElementById('pay-quantity');
  var note = document.getElementById('pay-confirm-note');
  if (!select) return;

  var selectedOption = select.options[select.selectedIndex];
  var remaining = selectedOption ? parseInt(selectedOption.getAttribute('data-remaining') || '0', 10) : 0;
  var newMax = Math.max(Math.min(remaining, 10), 1);

  if (qtyInput) {
    qtyInput.max = newMax;
    if (Number(qtyInput.value) > newMax) qtyInput.value = newMax;
    if (!qtyInput.value || Number(qtyInput.value) < 1) qtyInput.value = 1;
  }

  if (note) {
    note.textContent = select.value
      ? 'You can buy up to ' + newMax + ' ticket' + (newMax === 1 ? '' : 's') + ' for this date. Press confirm to receive your ticket code and barcode' + (newMax === 1 ? '' : 's') + ' immediately.'
      : 'Select an attendance date to continue.';
  }
}
window.onPaymentDayChange = onPaymentDayChange;

function setupPaymentModalFields() {
  var quantityInput = document.getElementById('pay-quantity');
  var nameInput = document.getElementById('pay-name');
  var cardInput = document.getElementById('pay-number');
  var expiryInput = document.getElementById('pay-expiry');
  var cvvInput = document.getElementById('pay-cvv');

  if (quantityInput) {
    quantityInput.addEventListener('input', function() {
      var min = Number(this.min || 1);
      var max = Number(this.max || 10);
      var digitsOnly = this.value.replace(/\D/g, '');
      if (!digitsOnly) {
        this.value = '';
        return;
      }
      this.value = String(Math.max(min, Math.min(Number(digitsOnly), max)));
    });
  }

  if (nameInput) {
    nameInput.addEventListener('input', function() {
      this.value = this.value.replace(/[^\p{L}\s'.-]/gu, '');
    });
  }

  if (cardInput) {
    cardInput.addEventListener('input', function() {
      this.value = this.value.replace(/\D/g, '').slice(0, 19);
    });
  }

  if (cvvInput) {
    cvvInput.addEventListener('input', function() {
      this.value = this.value.replace(/\D/g, '').slice(0, 3);
    });
  }

  if (expiryInput) {
    var now = new Date();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    expiryInput.min = now.getFullYear() + '-' + month;
  }
}
window.setupPaymentModalFields = setupPaymentModalFields;

function handlePaymentOverlayClick(event) {
  if (event.target && event.target.id === 'payment-modal') {
    closePaymentModal();
  }
}
window.handlePaymentOverlayClick = handlePaymentOverlayClick;

function closePaymentModal() {
  var modal = document.getElementById('payment-modal');
  if (modal) modal.remove();
}
window.closePaymentModal = closePaymentModal;

function showTicketCodeModal(ticketCodes, eventName, ticketBarcodes) {
  var existing = document.getElementById('ticket-code-modal');
  if (existing) existing.remove();
  var allCodes = Array.isArray(ticketCodes)
    ? ticketCodes.filter(Boolean)
    : (ticketCodes ? [ticketCodes] : []);
  var titleText = allCodes.length > 1 ? 'Your tickets' : 'Your ticket';
  var descriptionText = 'Show this barcode to the entry staff when you arrive at ' + eventName + '. Staff can scan it directly.';
  var barcodeCardsMarkup = allCodes.map(function(code, index) {
    var barcodeSrc = Array.isArray(ticketBarcodes) ? String(ticketBarcodes[index] || '') : '';
    var barcodeMarkup = barcodeSrc
      ? '<img src="' + barcodeSrc + '" alt="Ticket barcode ' + (index + 1) + '" style="display:block;width:100%;max-width:320px;height:auto;margin:0 auto;" />'
      : (typeof renderTicketBarcodeSvg === 'function' ? renderTicketBarcodeSvg(code, { height: 74, narrow: 2.4 }) : '');
    var heading = allCodes.length > 1
      ? '<div style="margin-bottom:10px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);">Ticket ' + (index + 1) + '</div>'
      : '';

    return '<div style="margin-bottom:16px;padding:18px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);">' +
      heading +
      '<div style="padding:18px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px dashed rgba(255,255,255,0.22);font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:28px;letter-spacing:.08em;margin-bottom:16px;">' + escapeHtml(code) + '</div>' +
      '<div style="padding:14px;border-radius:14px;background:#ffffff;overflow:auto;">' + barcodeMarkup + '</div>' +
    '</div>';
  }).join('');

  var modal =
    '<div id="ticket-code-modal" onclick="handleTicketCodeOverlayClick(event)" style="position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:3100;padding:18px;overflow:auto;">' +
      '<div class="card" style="width:100%;max-width:460px;padding:24px;text-align:center;max-height:min(92vh,900px);overflow:auto;">' +
        '<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">' +
          '<button class="payment-close-btn" style="position:static;" onclick="closeTicketCodeModal()" aria-label="Close ticket code">&times;</button>' +
        '</div>' +
        '<div class="badge badge-info" style="margin-bottom:12px;">Ticket Confirmed</div>' +
        '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:26px;margin-bottom:10px;">' + titleText + '</h2>' +
        '<p style="color:var(--muted);font-size:14px;line-height:1.8;margin-bottom:18px;">' + descriptionText + '</p>' +
        barcodeCardsMarkup +
        '<button class="btn-primary" style="width:100%;justify-content:center;" onclick="closeTicketCodeModal()">Done</button>' +
      '</div>' +
    '</div>';

  document.body.insertAdjacentHTML('beforeend', modal);
}
window.showTicketCodeModal = showTicketCodeModal;

function handleTicketCodeOverlayClick(event) {
  if (event.target && event.target.id === 'ticket-code-modal') {
    closeTicketCodeModal();
  }
}
window.handleTicketCodeOverlayClick = handleTicketCodeOverlayClick;

function closeTicketCodeModal() {
  var modal = document.getElementById('ticket-code-modal');
  if (modal) modal.remove();
}
window.closeTicketCodeModal = closeTicketCodeModal;

async function confirmPayment(eventId) {
  var confirmBtn = document.getElementById('confirm-purchase-btn');
  var quantityInput = document.getElementById('pay-quantity');
  var cardName = document.getElementById('pay-name');
  var cardNumber = document.getElementById('pay-number');
  var expiry = document.getElementById('pay-expiry');
  var cvv = document.getElementById('pay-cvv');
  var daySelect = document.getElementById('pay-day');
  var crowdAlertsEnabled = !state.user || state.user.role !== 'customer' || state.user.notifications_enabled !== false;
  var quantity = quantityInput ? Number(quantityInput.value || 0) : 0;
  var attendanceDate = daySelect ? (daySelect.value || '') : '';

  if (!quantityInput || !cardName || !cardNumber || !expiry || !cvv) {
    showToast('Payment form is incomplete', 'error');
    return;
  }

  if (daySelect && !attendanceDate) {
    showToast('Please select your attendance date', 'error');
    return;
  }

  if (!String(quantityInput.value || '').trim() || !cardName.value.trim() || !cardNumber.value.trim() || !expiry.value.trim() || !cvv.value.trim()) {
    showToast('Please fill in all card details', 'error');
    return;
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    showToast('Please choose at least 1 ticket', 'error');
    return;
  }

  if (quantity > Number(quantityInput.max || 10)) {
    showToast('Selected ticket quantity is not available', 'error');
    return;
  }

  if (!/^[\p{L}\s'.-]+$/u.test(cardName.value.trim())) {
    showToast('Cardholder name must contain letters only', 'error');
    return;
  }

  if (!/^\d{12,19}$/.test(cardNumber.value.trim())) {
    showToast('Card number must contain digits only', 'error');
    return;
  }

  if (!/^\d{3}$/.test(cvv.value.trim())) {
    showToast('CVV must be exactly 3 digits', 'error');
    return;
  }

  if (!/^\d{4}-\d{2}$/.test(expiry.value.trim())) {
    showToast('Please choose a valid expiry date', 'error');
    return;
  }

  var expiryDate = new Date(expiry.value + '-01T00:00:00');
  var currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);
  if (isNaN(expiryDate.getTime()) || expiryDate < currentMonth) {
    showToast('Expiry date cannot be in the past', 'error');
    return;
  }

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Processing...';
  }

  try {
    var buyBody = {
      user_id: state.user.id,
      quantity: quantity,
      crowd_alerts_enabled: crowdAlertsEnabled
    };
    if (attendanceDate) buyBody.attendance_date = attendanceDate;

    var response = await fetch('/api/events/' + eventId + '/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buyBody)
    });

    var data = await response.json();

    if (!response.ok) {
      if (response.status === 403) {
        showToast(data.message || 'Only customer accounts can purchase tickets.', 'error');
        if (typeof clearAuthUser === 'function') {
          clearAuthUser();
        }
        state.loginRole = 'customer';
        navigate('login');
        return;
      }

      showToast(data.message || 'Purchase failed', 'error');
      return;
    }

    closePaymentModal();
    if (data.ticket_codes && data.ticket_codes.length) {
      showTicketCodeModal(data.ticket_codes, data.event_name || 'your event', data.ticket_barcodes || []);
    } else if (data.ticket_code) {
      showTicketCodeModal(data.ticket_code, data.event_name || 'your event', data.ticket_barcodes || []);
    }
    showToast(data.message || 'Ticket purchased successfully', 'success');

    if (typeof loadEvents === 'function') {
      loadEvents().catch(function(error) {
        console.error('LOAD EVENTS ERROR:', error);
      });
    }
  } catch (error) {
    console.error(error);
    showToast('Server error', 'error');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm Purchase';
    }
  }
}
window.confirmPayment = confirmPayment;
