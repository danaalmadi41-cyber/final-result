function setDashboardMode(mode) {
  if (state.dashboardMode === mode) return;
  state.dashboardMode = mode;
  render({ preserveScroll: true });
}
window.setDashboardMode = setDashboardMode;

function setSelectedDashboardEvent(eventId) {
  state.selectedDashboardEventId = eventId == null || eventId === ''
    ? null
    : Number(eventId);
  render({ preserveScroll: true });
}
window.setSelectedDashboardEvent = setSelectedDashboardEvent;

function getDashboardDataSignature(events) {
  return JSON.stringify(events || []);
}

function getSelectedDashboardEvent(events) {
  events = events || [];
  if (!events.length) {
    state.selectedDashboardEventId = null;
    return null;
  }

  var selectedId = Number(state.selectedDashboardEventId || 0);
  var selectedEvent = events.find(function(ev) {
    return Number(ev.id) === selectedId;
  }) || null;

  if (!selectedEvent) {
    selectedEvent = events[0];
    state.selectedDashboardEventId = Number(selectedEvent.id);
  }

  return selectedEvent;
}

function renderDashboard() {
  if (!state.user || state.user.role !== 'organizer') {
    showToast('Access denied', 'error');
    navigate('home');
    return '';
  }

  if (!state.eventsLoaded && !state.eventsLoading) {
    loadDashboardData();
  }

  if (!state.notificationsLoaded && !state.notificationsLoading) {
    loadNotifications(true, { preserveScroll: true });
  }

  if (state.eventsLoading) {
    return '<div class="org-layout">' +
      renderSidebar('dashboard') +
      '<main class="org-main">' +
        '<div style="padding:32px;">' +
          '<div class="card" style="padding:32px;text-align:center;">' +
            '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;margin-bottom:12px;">Loading Dashboard...</h2>' +
            '<p style="color:var(--muted);">Please wait while events are loaded from the database.</p>' +
          '</div>' +
        '</div>' +
      '</main>' +
    '</div>';
  }

  var events = state.realEvents || [];
  var selectedEvent = getSelectedDashboardEvent(events);
  var scopedEvents = selectedEvent ? [selectedEvent] : [];
  var mode = state.dashboardMode || 'current';
  var today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  var totalTickets = scopedEvents.reduce(function(sum, ev) {
    return sum + Number(ev.tickets_sold || 0);
  }, 0);
  var totalAttendance = scopedEvents.reduce(function(sum, ev) {
    return sum + Number(ev.attendance_count || 0);
  }, 0);
  var totalCapacity = scopedEvents.reduce(function(sum, ev) {
    return sum + Number(ev.capacity || 0);
  }, 0);
  var maxCapacity = scopedEvents.reduce(function(max, ev) {
    return Math.max(max, Number(ev.capacity || 0));
  }, 0);
  var occupancyRate = totalCapacity ? Math.round((totalAttendance / totalCapacity) * 100) : 0;
  var topForecastEvent = getTopForecastEvent(scopedEvents);
  var averagePredictedPeak = scopedEvents.length ? Math.round(scopedEvents.reduce(function(sum, ev) {
    return sum + Number(ev.prediction && ev.prediction.predicted_peak_percent || 0);
  }, 0) / scopedEvents.length) : 0;
  var staffAlerts = getDashboardStaffStatusAlerts(state.realNotifications || []);
  var lastUpdatedText = state.dashboardLastUpdated
    ? new Date(state.dashboardLastUpdated).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
      })
    : 'Waiting for live data';

  return '' +
    '<div class="org-layout dashboard-page">' +
      renderSidebar('dashboard') +
      '<main class="org-main">' +
        '<div style="padding:30px;">' +
          '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px;">' +
            '<div>' +
              '<h1 class="dashboard-page-title" style="font-family:\'Montserrat\',sans-serif;font-size:40px;font-weight:900;letter-spacing:-0.03em;margin-bottom:6px;">Organizer Dashboard</h1>' +
              '<div style="font-size:14px;color:var(--muted);">Today: ' + today + '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
              '<div class="dashboard-live-pill" style="display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;background:rgba(34,197,94,0.12);color:#7CFC98;font-size:12px;font-weight:800;border:1px solid rgba(124,252,152,0.2);">' +
                '<span style="width:8px;height:8px;border-radius:50%;background:#7CFC98;box-shadow:0 0 0 0 rgba(124,252,152,0.7);animation:livePulse 1.6s infinite;"></span>' +
                '<span>LIVE ATTENDANCE TRACKING</span>' +
              '</div>' +
              '<div style="font-size:12px;color:var(--muted);">Updated: ' + lastUpdatedText + '</div>' +
              '<button class="btn-primary" onclick="navigate(\'notifications\')" style="padding:12px 18px;">View Notifications</button>' +
            '</div>' +
          '</div>' +

          renderDashboardStaffStatusAlerts(staffAlerts) +

          '<div class="card dashboard-hero-card" style="padding:18px;margin-bottom:20px;background:linear-gradient(135deg,rgba(155,16,64,0.18),rgba(212,154,53,0.08),rgba(255,255,255,0.03));">' +
            '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px;">' +
              '<div style="max-width:720px;">' +
                '<div class="dashboard-hero-kicker" style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#f0c4d0;text-transform:uppercase;margin-bottom:10px;">Dashboard Views</div>' +
                '<h2 class="dashboard-hero-title" style="font-family:\'Montserrat\',sans-serif;font-size:26px;font-weight:900;margin-bottom:8px;">Switch between current attendance and predicted attendance</h2>' +
                '<p class="dashboard-hero-copy" style="color:#f7e6ea;font-size:14px;line-height:1.7;">Choose one event to view its own attendance, capacity, and forecast without mixing it with your other events.</p>' +
              '</div>' +
              '<div style="display:flex;justify-content:flex-end;align-items:flex-start;flex:1;min-width:320px;">' +
                renderDashboardModeTabs(mode) +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:flex-start;align-items:flex-start;">' +
              renderDashboardEventPicker(events, selectedEvent) +
            '</div>' +
          '</div>' +

          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:20px;">' +
            renderDashboardStat('TICKETS SOLD', totalTickets.toLocaleString(), 'Customer purchases confirmed') +
            renderDashboardStat('CURRENT ATTENDANCE', totalAttendance.toLocaleString(), 'Live gate scans counted in real time') +
            renderDashboardStat('MAX CAPACITY', maxCapacity.toLocaleString(), 'Capacity for the selected event') +
            renderDashboardStat('AVG PREDICTED PEAK', averagePredictedPeak + '%', 'Predicted peak for the selected event') +
          '</div>' +

          '<div class="dashboard-primary-grid" style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:18px;margin-bottom:20px;align-items:start;">' +
            renderDashboardViewCard(mode, selectedEvent) +
            '<div class="card dashboard-summary-card" style="padding:22px;">' +
              '<h3 style="font-family:\'Montserrat\',sans-serif;font-size:22px;font-weight:800;margin-bottom:12px;">Live Summary</h3>' +
              (topForecastEvent
                ? renderForecastSummary(topForecastEvent, occupancyRate)
                : '<p style="color:var(--muted);font-size:14px;">Create events and collect attendance to start the analysis.</p>'
              ) +
            '</div>' +
          '</div>' +

          '<div class="card dashboard-hourly-card" style="padding:18px;margin-bottom:20px;">' +
            '<h3 style="font-family:\'Montserrat\',sans-serif;font-size:22px;font-weight:800;margin-bottom:14px;">Next 6 Hours Crowd Prediction</h3>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">' +
              '<div class="dashboard-hourly-copy" style="font-size:13px;color:var(--muted);">' +
                (topForecastEvent
                  ? 'Live forecast for ' + topForecastEvent.name + ', based on tickets sold, current attendance, and event timing.'
                  : 'The hourly forecast will appear once live event data is available.'
                ) +
              '</div>' +
              (topForecastEvent
                ? '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
                    miniLiveStat('Current', Number(topForecastEvent.attendance_count || 0).toLocaleString()) +
                    miniLiveStat('Peak', Number(topForecastEvent.prediction && topForecastEvent.prediction.predicted_peak_percent || 0) + '%') +
                  '</div>'
                : ''
              ) +
            '</div>' +
            '<div style="height:300px;"><canvas id="chart-crowd-forecast"></canvas></div>' +
          '</div>' +

          '<div class="card dashboard-table-card" style="padding:0;overflow:hidden;">' +
            '<div style="padding:18px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">' +
              '<h3 style="font-family:\'Montserrat\',sans-serif;font-size:22px;font-weight:800;">Event Management</h3>' +
              '<button class="btn-primary" onclick="navigate(\'create\')">+ New Event</button>' +
            '</div>' +
            '<div style="overflow-x:auto;">' +
              '<table class="data-table">' +
                '<thead>' +
                  '<tr>' +
                    '<th>EVENT</th>' +
                    '<th>CURRENT</th>' +
                    '<th>PREDICTED PEAK</th>' +
                    '<th>FINAL ATTENDANCE</th>' +
                    '<th>ACTIONS</th>' +
                  '</tr>' +
                '</thead>' +
                '<tbody>' +
                  (events.length
                    ? events.map(function(ev) {
                        var prediction = ev.prediction || {};
                        var isSelected = selectedEvent && Number(selectedEvent.id) === Number(ev.id);
                        return '<tr>' +
                          '<td><div style="font-weight:700;">' + (ev.name || 'Event') + (isSelected ? ' <span style="font-size:11px;color:#f0c4d0;">• Selected</span>' : '') + '</div><div style="font-size:12px;color:var(--muted);">' + (ev.city || 'No city') + ' • ' + (ev.start_date || 'No date') + '</div></td>' +
                          '<td><div>' + Number(ev.attendance_count || 0).toLocaleString() + ' / ' + Number(ev.capacity || 0).toLocaleString() + '</div><div style="font-size:12px;color:var(--muted);">' + levelBadge((ev.crowd_level || 'low').toLowerCase()) + '</div></td>' +
                          '<td><div style="font-weight:700;">' + Number(prediction.predicted_peak_attendance || 0).toLocaleString() + '</div><div style="font-size:12px;color:var(--muted);">' + Number(prediction.predicted_peak_percent || 0) + '% capacity</div></td>' +
                          '<td><div style="font-weight:700;">' + Number(prediction.predicted_final_attendance || 0).toLocaleString() + '</div><div style="font-size:12px;color:var(--muted);">+' + Number(prediction.next_hour_expected_entries || 0).toLocaleString() + ' next hour</div></td>' +
                          '<td><div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn-ghost" onclick="navigate(\'edit\',{id:' + ev.id + '})">Edit</button><button class="btn-ghost" onclick="openEventReport(' + ev.id + ')">Report</button><button class="btn-danger" onclick="openEmergencyModal(' + ev.id + ', \'' + String((ev.name || 'Event')).replace(/\\/g, '\\\\').replace(/'/g, '\\\'') + '\')">Emergency</button></div></td>' +
                        '</tr>';
                      }).join('')
                    : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px;">No events found.</td></tr>'
                  ) +
                '</tbody>' +
              '</table>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</main>' +
    '</div>';
}

function getDashboardStaffStatusAlerts(items) {
  return (items || []).filter(function(item) {
    return item && item.type === 'staff_status' && !item.is_read;
  }).slice(0, 3);
}

function renderDashboardStaffStatusAlerts(items) {
  items = items || [];
  if (!items.length) return '';

  var unreadCount = items.filter(function(item) {
    return !item.is_read;
  }).length;

  return '<div class="card" style="padding:18px 20px;margin-bottom:20px;border:1px solid rgba(249,115,22,0.28);background:linear-gradient(135deg,rgba(249,115,22,0.16),rgba(239,68,68,0.08));">' +
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">' +
      '<div>' +
        '<div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#fdba74;margin-bottom:8px;">Staff Stop Alerts</div>' +
        '<div style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:24px;line-height:1.2;">A staff member has stopped working</div>' +
        '<div style="font-size:13px;color:#ffe7d6;margin-top:8px;max-width:720px;">Review these alerts now so you always know when staffing changes affect a live event.</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        (unreadCount ? '<div style="padding:8px 12px;border-radius:999px;background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.12);font-size:12px;font-weight:800;color:#fff;">' + unreadCount + ' unread</div>' : '') +
        '<button class="btn-ghost" onclick="openOrganizerNotifications()" style="border-color:rgba(255,255,255,0.16);">Open Notifications</button>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:12px;">' +
      items.map(function(item) {
        return '<div style="padding:14px 16px;border-radius:14px;background:rgba(17,24,39,0.26);border:1px solid rgba(255,255,255,0.08);">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px;">' +
            '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:15px;">' + escapeHtml(item.title || 'Staff alert') + '</div>' +
            '<div style="font-size:12px;color:#fed7aa;">' + escapeHtml(formatStoredDateTime(item.created_at || '')) + '</div>' +
          '</div>' +
          (item.event_name
            ? '<div style="font-size:12px;color:#fdba74;margin-bottom:6px;">Event: ' + escapeHtml(item.event_name) + '</div>'
            : '') +
          '<div style="font-size:14px;line-height:1.7;color:#fff;">' + escapeHtml(item.message || '') + '</div>' +
          (!item.is_read
            ? '<div style="margin-top:8px;font-size:12px;font-weight:800;color:#fff7ed;">Unread alert</div>'
            : '') +
        '</div>';
      }).join('') +
    '</div>' +
  '</div>';
}

function renderDashboardModeTabs(mode) {
  return '' +
    '<div class="tab-bar" style="min-width:320px;">' +
      '<button class="tab-btn ' + (mode === 'current' ? 'active' : '') + '" onclick="setDashboardMode(\'current\')">Current Dashboard</button>' +
      '<button class="tab-btn ' + (mode === 'prediction' ? 'active' : '') + '" onclick="setDashboardMode(\'prediction\')">Prediction Dashboard</button>' +
    '</div>';
}

function renderDashboardEventPicker(events, selectedEvent) {
  if (!(events || []).length) return '';

  return '<div class="card" style="padding:14px;min-width:260px;">' +
    '<label class="field-label" style="margin-bottom:8px;">Selected Event</label>' +
    '<select class="input-field" onchange="setSelectedDashboardEvent(this.value)">' +
      (events || []).map(function(ev) {
        return '<option value="' + ev.id + '"' + (selectedEvent && Number(selectedEvent.id) === Number(ev.id) ? ' selected' : '') + '>' + (ev.name || 'Event') + '</option>';
      }).join('') +
    '</select>' +
  '</div>';
}

function renderDashboardViewCard(mode, selectedEvent) {
  var title = mode === 'prediction' ? 'Prediction Dashboard' : 'Current Dashboard';
  var description = mode === 'prediction'
    ? 'Expected attendance and crowd forecast for the selected event.'
    : 'Real-time attendance for the selected event, updated when staff scan tickets.';
  var tone = mode === 'prediction'
    ? 'rgba(255,216,77,0.85)'
    : 'rgba(255,95,141,0.85)';
  var legendLabel = mode === 'prediction'
    ? 'Predicted attendance'
    : 'Current attendance';

  return '<div class="card" style="padding:18px;">' +
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">' +
      '<div>' +
        '<h3 style="font-family:\'Montserrat\',sans-serif;font-size:22px;font-weight:800;margin-bottom:8px;">' + title + '</h3>' +
        '<div style="font-size:13px;color:var(--muted);max-width:560px;">' + description + (selectedEvent ? ' Viewing: ' + selectedEvent.name + '.' : '') + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);">' +
        chartLegendSwatch(tone, legendLabel) +
      '</div>' +
    '</div>' +
    '<div style="height:340px;"><canvas id="chart-weekly-dashboard"></canvas></div>' +
  '</div>';
}

function renderDashboardStat(label, value, meta) {
  return '<div class="card" style="padding:18px;">' +
    '<div style="font-size:12px;font-weight:800;letter-spacing:.04em;color:var(--muted);text-transform:uppercase;margin-bottom:18px;">' + label + '</div>' +
    '<div style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:44px;line-height:1;margin-bottom:10px;">' + value + '</div>' +
    '<div style="font-size:14px;color:var(--muted);">' + meta + '</div>' +
  '</div>';
}

function chartLegendSwatch(color, label) {
  return '<span style="display:inline-flex;align-items:center;gap:7px;">' +
    '<span style="width:10px;height:10px;border-radius:3px;background:' + color + ';display:inline-block;"></span>' +
    '<span>' + label + '</span>' +
  '</span>';
}

function miniLiveStat(label, value) {
  return '<div class="dashboard-mini-stat" style="padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid var(--border);min-width:84px;">' +
    '<div class="dashboard-mini-stat-label" style="font-size:10px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:.06em;margin-bottom:2px;">' + label + '</div>' +
    '<div class="dashboard-mini-stat-value" style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:15px;">' + value + '</div>' +
  '</div>';
}

function getTopForecastEvent(events) {
  if (!events.length) return null;

  return events.slice().sort(function(a, b) {
    return Number((b.prediction && b.prediction.predicted_peak_percent) || 0) - Number((a.prediction && a.prediction.predicted_peak_percent) || 0);
  })[0];
}

function renderForecastSummary(eventData, occupancyRate) {
  var prediction = eventData.prediction || {};

  return '' +
    '<div style="display:flex;flex-direction:column;gap:14px;">' +
      '<div>' +
        '<div style="font-size:12px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:.06em;">Most at risk event</div>' +
        '<div style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:26px;margin-top:6px;">' + eventData.name + '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        forecastMiniCard('Current Crowd', Number(eventData.attendance_count || 0).toLocaleString()) +
        forecastMiniCard('Predicted Peak', Number(prediction.predicted_peak_attendance || 0).toLocaleString()) +
        forecastMiniCard('Peak Capacity', Number(prediction.predicted_peak_percent || 0) + '%') +
        forecastMiniCard('Crowd Level', prediction.predicted_crowd_level || 'Low') +
      '</div>' +
      '<p style="color:var(--muted);line-height:1.7;margin:0;">' + (prediction.forecast_summary || 'Prediction summary is not available yet.') + '</p>' +
      '<div style="font-size:13px;color:var(--muted);">Portfolio occupancy right now: ' + occupancyRate + '%</div>' +
    '</div>';
}

function forecastMiniCard(label, value) {
  return '<div style="background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:12px;padding:14px;">' +
    '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:.06em;margin-bottom:6px;">' + label + '</div>' +
    '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:20px;">' + value + '</div>' +
  '</div>';
}

function initDashboardCharts() {
  if (typeof Chart === 'undefined') return;

  var events = state.realEvents || [];
  var selectedEvent = getSelectedDashboardEvent(events);
  if (!selectedEvent) return;

  if ((state.dashboardMode || 'current') === 'prediction') {
    initEventDetailAttendanceChart('chart-weekly-dashboard', selectedEvent, 'prediction');
  } else {
    initEventDetailAttendanceChart('chart-weekly-dashboard', selectedEvent, 'current');
  }

  var topForecastEvent = selectedEvent;
  var hourlyLabels = topForecastEvent && topForecastEvent.prediction && Array.isArray(topForecastEvent.prediction.hourly_forecast)
    ? topForecastEvent.prediction.hourly_forecast.map(function(point) { return point.label; })
    : [];
  var hourlyPercentData = topForecastEvent && topForecastEvent.prediction && Array.isArray(topForecastEvent.prediction.hourly_forecast)
    ? topForecastEvent.prediction.hourly_forecast.map(function(point) { return Number(point.percent || 0); })
    : [];
  var forecastCanvas = document.getElementById('chart-crowd-forecast');

  if (!forecastCanvas || !hourlyLabels.length) return;

  if (chartReg.crowdForecast) {
    chartReg.crowdForecast.destroy();
  }

  var isLightTheme = document.documentElement.getAttribute('data-theme') === 'light' ||
    document.body.classList.contains('light-mode');
  var forecastTheme = isLightTheme
    ? {
        text: 'rgba(92, 58, 40, 0.94)',
        axisTitle: 'rgba(92, 58, 40, 0.94)',
        grid: 'rgba(138, 100, 76, 0.18)',
        tooltipBg: 'rgba(255, 248, 241, 0.98)',
        tooltipTitle: '#5c3a28',
        tooltipBody: '#5c3a28',
        tooltipBorder: 'rgba(138, 100, 76, 0.18)'
      }
    : {
        text: 'rgba(230,225,255,0.68)',
        axisTitle: 'rgba(230,225,255,0.68)',
        grid: 'rgba(255,255,255,0.06)',
        tooltipBg: 'rgba(24, 18, 33, 0.96)',
        tooltipTitle: '#f5e8e1',
        tooltipBody: '#f5e8e1',
        tooltipBorder: 'rgba(255,255,255,0.08)'
      };

  var hourlyBarColors = hourlyPercentData.map(function(value) {
    if (value < 50) return 'rgba(34,197,94,0.9)';
    if (value < 80) return 'rgba(245,158,11,0.92)';
    return 'rgba(239,68,68,0.92)';
  });

  chartReg.crowdForecast = new Chart(forecastCanvas, {
    type: 'line',
    data: {
      labels: hourlyLabels,
      datasets: [{
        label: topForecastEvent.name + ' forecast',
        data: hourlyPercentData,
        backgroundColor: 'rgba(216, 109, 89, 0.16)',
        borderColor: 'rgba(216, 109, 89, 0.95)',
        borderWidth: 3,
        fill: false,
        tension: 0.35,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: hourlyBarColors,
        pointBorderColor: hourlyBarColors,
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          backgroundColor: forecastTheme.tooltipBg,
          titleColor: forecastTheme.tooltipTitle,
          bodyColor: forecastTheme.tooltipBody,
          borderColor: forecastTheme.tooltipBorder,
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              return 'Predicted occupancy: ' + Number(context.parsed.y || 0) + '%';
            },
            afterLabel: function(context) {
              var value = Number(context.parsed.y || 0);
              if (value < 50) return 'Risk level: Low';
              if (value < 80) return 'Risk level: Medium';
              return 'Risk level: High';
            }
          }
        },
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          grid: { color: forecastTheme.grid },
          ticks: { color: forecastTheme.text, font: { size: 11 } },
          title: {
            display: true,
            text: 'Live Forecast Window',
            color: forecastTheme.axisTitle,
            font: { family: 'Montserrat', size: 11, weight: '700' }
          }
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: forecastTheme.grid },
          ticks: {
            color: forecastTheme.text,
            font: { size: 11 },
            callback: function(v) { return v + '%'; }
          },
          title: {
            display: true,
            text: 'Predicted Occupancy',
            color: forecastTheme.axisTitle,
            font: { family: 'Montserrat', size: 11, weight: '700' }
          }
        }
      }
    }
  });
}

async function loadDashboardData() {
  return loadDashboardDataInternal(false, false);
}

async function loadDashboardDataSilently() {
  return loadDashboardDataInternal(true, true);
}

async function loadDashboardDataInternal(silent, preserveScroll) {
  if (state.eventsLoading) return;

  state.eventsLoading = true;

  try {
    if (!state.user || !state.user.id) {
      state.eventsLoading = false;
      if (!silent) showToast('User ID not found', 'error');
      return;
    }

    var response = await fetch('/api/organizer/events/' + state.user.id);
    var data = await response.json();

    if (!response.ok) {
      state.realEvents = [];
      state.eventsLoaded = true;
      state.eventsLoading = false;
      state.dashboardDataSignature = getDashboardDataSignature([]);
      if (!silent) showToast(data.message || 'Failed to load events', 'error');
      render({ preserveScroll: preserveScroll });
      return;
    }

    var nextSignature = getDashboardDataSignature(data);
    var hasChanged = state.dashboardDataSignature !== nextSignature;

    state.realEvents = data;
    state.eventsLoaded = true;
    state.eventsLoading = false;
    state.dashboardDataSignature = nextSignature;

    if (hasChanged) {
      state.dashboardLastUpdated = new Date().toISOString();
    }

    if (typeof subscribeToRealtimeUpdates === 'function') {
      subscribeToRealtimeUpdates();
    }

    if (state.user && state.user.role === 'organizer') {
      loadNotifications(true, { preserveScroll: true });
    }

    if (!silent || hasChanged) {
      render({ preserveScroll: preserveScroll });
    }
  } catch (error) {
    console.error('DASHBOARD ERROR:', error);
    state.realEvents = [];
    state.eventsLoaded = true;
    state.eventsLoading = false;
    if (!silent) showToast('Server error loading dashboard', 'error');
    render({ preserveScroll: preserveScroll });
  }
}

async function sendHourlyCrowdUpdatesForOrganizer() {
  if (!state.user || state.user.role !== 'organizer') return;
  var liveEvents = (state.realEvents || []).filter(function(ev) {
    return ev && !ev.is_upcoming && !ev.is_ended;
  });
  if (!liveEvents.length) return;

  for (var i = 0; i < liveEvents.length; i += 1) {
    try {
      var response = await fetch('/api/events/' + liveEvents[i].id + '/hourly-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizer_id: state.user.id })
      });
      if (!response.ok) continue;
      var data = await response.json();
      if (data && data.sent && typeof loadNotifications === 'function') {
        loadNotifications(true, { preserveScroll: true });
      }
    } catch (error) {
      console.error('HOURLY CROWD UPDATE ERROR:', error);
    }
  }
}

function startOrganizerHourlyCrowdPolling() {
  stopOrganizerHourlyCrowdPolling();
  sendHourlyCrowdUpdatesForOrganizer();
  state.organizerHourlyCrowdPolling = setInterval(function() {
    if (state.user && state.user.role === 'organizer') {
      sendHourlyCrowdUpdatesForOrganizer();
    }
  }, 60000);
}

function stopOrganizerHourlyCrowdPolling() {
  if (state.organizerHourlyCrowdPolling) {
    clearInterval(state.organizerHourlyCrowdPolling);
    state.organizerHourlyCrowdPolling = null;
  }
}

function startDashboardPolling() {
  stopDashboardPolling();
  state.dashboardPolling = setInterval(function() {
    if (state.view === 'dashboard' && state.user && state.user.role === 'organizer') {
      loadDashboardDataSilently();
    }
  }, 3500);
}

function stopDashboardPolling() {
  if (state.dashboardPolling) {
    clearInterval(state.dashboardPolling);
    state.dashboardPolling = null;
  }
}

window.startDashboardPolling = startDashboardPolling;
window.stopDashboardPolling = stopDashboardPolling;
window.startOrganizerHourlyCrowdPolling = startOrganizerHourlyCrowdPolling;
window.stopOrganizerHourlyCrowdPolling = stopOrganizerHourlyCrowdPolling;

function openEmergencyModal(eventId, eventName) {
  var existing = document.getElementById('emergency-modal');
  if (existing) existing.remove();

  var eventData = (state.realEvents || []).find(function(ev) {
    return Number(ev.id) === Number(eventId);
  }) || null;
  var safeEventName = eventName || (eventData && eventData.name) || 'Event';
  var isActive = !!(eventData && eventData.emergency_active);
  var activeMessage = eventData && eventData.emergency_message ? escapeHtml(eventData.emergency_message) : '';
  var activeType = eventData && eventData.emergency_type ? escapeHtml(String(eventData.emergency_type).replace(/_/g, ' ')) : 'active emergency';
  var modal =
    '<div id="emergency-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.68);display:flex;align-items:center;justify-content:center;z-index:3200;padding:18px;">' +
      '<div class="card" style="width:100%;max-width:560px;padding:24px;">' +
        '<div class="badge badge-high" style="margin-bottom:12px;">Emergency Alert</div>' +
        '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:24px;margin-bottom:8px;">' + (isActive ? 'Emergency is active' : 'Send emergency notification') + '</h2>' +
        '<p style="color:var(--muted);font-size:14px;line-height:1.7;margin-bottom:18px;">' + (isActive
          ? 'Staff scanning stays locked for <strong>' + safeEventName + '</strong> until you clear this emergency notice.'
          : 'This will notify ticket-holding customers and entry staff linked to <strong>' + safeEventName + '</strong>.') + '</p>' +
        (isActive
          ? '<div class="card" style="padding:16px;background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.24);margin-bottom:12px;">' +
              '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:13px;margin-bottom:8px;color:#EF4444;text-transform:uppercase;letter-spacing:0.08em;">Current emergency</div>' +
              '<div style="font-size:13px;color:#fecaca;line-height:1.7;margin-bottom:8px;">Type: ' + activeType + '</div>' +
              '<div style="font-size:14px;line-height:1.8;color:#fff;white-space:pre-line;">' + activeMessage + '</div>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:14px;">' +
              '<div>' +
                '<label class="field-label">Reassurance Message</label>' +
                '<textarea id="emergency-clear-message" class="input-field" style="min-height:120px;resize:vertical;" placeholder="Example: The situation is under control now. You may continue safely and follow normal event instructions."></textarea>' +
              '</div>' +
              '<div class="card" style="padding:14px;background:rgba(34,197,94,0.10);border-color:rgba(34,197,94,0.20);">' +
                '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:13px;margin-bottom:6px;color:#22C55E;">After clearing</div>' +
                '<div style="font-size:13px;color:var(--muted);line-height:1.7;">This reassurance message will be sent to both customers and staff when you clear the emergency alert.</div>' +
              '</div>' +
            '</div>'
          : '<div style="display:flex;flex-direction:column;gap:14px;">' +
              '<div>' +
                '<label class="field-label">Emergency Type</label>' +
                '<select id="emergency-type" class="input-field">' +
                  '<option value="stop_event">Stop Event</option>' +
                  '<option value="weather_warning">Weather Warning</option>' +
                  '<option value="safety_issue">Safety Issue</option>' +
                  '<option value="other">Other</option>' +
                '</select>' +
              '</div>' +
              '<div>' +
                '<label class="field-label">Emergency Message</label>' +
                '<textarea id="emergency-message" class="input-field" style="min-height:140px;resize:vertical;" placeholder="Example: Please leave the venue immediately and follow staff instructions."></textarea>' +
              '</div>' +
              '<div class="card" style="padding:14px;background:rgba(239,68,68,0.10);border-color:rgba(239,68,68,0.20);">' +
                '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:13px;margin-bottom:6px;color:#EF4444;">Suggested use</div>' +
                '<div style="font-size:13px;color:var(--muted);line-height:1.7;">Use this for urgent cases like stopping the event, weather warnings, safety issues, or other situations where attendees need clear instructions.</div>' +
              '</div>' +
            '</div>') +
        '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px;">' +
          '<button class="btn-ghost" onclick="closeEmergencyModal()">Cancel</button>' +
          '<button class="btn-danger" onclick="' + (isActive ? 'clearEmergencyNotification(' + eventId + ')' : 'sendEmergencyNotification(' + eventId + ')') + '">' + (isActive ? 'Clear Emergency' : 'Send Emergency') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.insertAdjacentHTML('beforeend', modal);
}
window.openEmergencyModal = openEmergencyModal;

function closeEmergencyModal() {
  var modal = document.getElementById('emergency-modal');
  if (modal) modal.remove();
}
window.closeEmergencyModal = closeEmergencyModal;

async function sendEmergencyNotification(eventId) {
  var typeEl = document.getElementById('emergency-type');
  var messageEl = document.getElementById('emergency-message');
  var emergencyType = typeEl ? typeEl.value : 'other';
  var message = messageEl ? messageEl.value.trim() : '';

  if (!state.user || !state.user.id) {
    showToast('Organizer session not found', 'error');
    return;
  }

  if (!message) {
    showToast('Please write the emergency message first', 'error');
    return;
  }

  try {
    var response = await fetch('/api/events/' + eventId + '/emergency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizer_id: state.user.id,
        emergency_type: emergencyType,
        message: message
      })
    });

    var data = await response.json();

    if (!response.ok) {
      showToast(data.message || 'Failed to send emergency notification', 'error');
      return;
    }

    if (data.event) {
      state.realEvents = (state.realEvents || []).map(function(ev) {
        return Number(ev.id) === Number(data.event.id) ? data.event : ev;
      });
      if (typeof applyRealtimeEventUpdate === 'function') {
        applyRealtimeEventUpdate(data.event.id, data.event);
      }
    }

    closeEmergencyModal();
    showToast('Emergency alert sent to all linked customers and event staff', 'success');
    if (state.view === 'notifications' && typeof loadNotifications === 'function') {
      loadNotifications(true);
    }
  } catch (error) {
    console.error('EMERGENCY SEND ERROR:', error);
    showToast('Server error sending emergency notification', 'error');
  }
}
window.sendEmergencyNotification = sendEmergencyNotification;

async function clearEmergencyNotification(eventId) {
  if (!state.user || !state.user.id) {
    showToast('Organizer session not found', 'error');
    return;
  }

  var reassuranceEl = document.getElementById('emergency-clear-message');
  var reassuranceMessage = reassuranceEl ? reassuranceEl.value.trim() : '';

  if (!reassuranceMessage) {
    showToast('Please write a reassurance message for customers and staff first', 'error');
    return;
  }

  try {
    var response = await fetch('/api/events/' + eventId + '/emergency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizer_id: state.user.id,
        clear_emergency: true,
        reassurance_message: reassuranceMessage
      })
    });

    var data = await response.json();

    if (!response.ok) {
      showToast(data.message || 'Failed to clear emergency notification', 'error');
      return;
    }

    if (data.event) {
      state.realEvents = (state.realEvents || []).map(function(ev) {
        return Number(ev.id) === Number(data.event.id) ? data.event : ev;
      });
      if (typeof applyRealtimeEventUpdate === 'function') {
        applyRealtimeEventUpdate(data.event.id, data.event);
      }
    }

    closeEmergencyModal();
    showToast('Emergency notice cleared and the reassurance message was sent to customers and staff.', 'success');
  } catch (error) {
    console.error('EMERGENCY CLEAR ERROR:', error);
    showToast('Server error clearing emergency notification', 'error');
  }
}
window.clearEmergencyNotification = clearEmergencyNotification;

function openEventReport(eventId) {
  state.reportFilters = state.reportFilters || {};
  state.reportFilters.eventId = String(eventId);
  navigate('reports');
}
window.openEventReport = openEventReport;
