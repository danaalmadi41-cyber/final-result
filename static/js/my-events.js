// ============================================================
//  VIEW: MY EVENTS
// ============================================================
function renderMyEvents() {
  // protect page for organizer only
  if (!state.user || state.user.role !== 'organizer') {
    showToast('Access denied', 'error');
    navigate('home');
    return '';
  }

  // get organizer events from state
  var events = state.realEvents || [];

  // empty state
  if (!events.length) {
    return '<div class="org-layout">' +
      renderSidebar('my-events') +
      '<main class="org-main">' +
        '<div style="padding:32px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:16px;">' +
            '<div>' +
              '<h1 style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:28px;letter-spacing:-0.02em;margin-bottom:4px;">My Events</h1>' +
              '<p style="font-size:13px;color:var(--muted);">Manage all events created by you.</p>' +
            '</div>' +
            '<button class="btn-primary" onclick="navigate(\'create\')">+ New Event</button>' +
          '</div>' +
          '<div class="card" style="padding:32px;text-align:center;">' +
            '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;margin-bottom:12px;">No Events Yet</h2>' +
            '<p style="color:var(--muted);margin-bottom:20px;">You have not created any events yet.</p>' +
            '<button class="btn-primary" onclick="navigate(\'create\')">Create Event</button>' +
          '</div>' +
        '</div>' +
      '</main>' +
    '</div>';
  }

  return '<div class="org-layout">' +
    renderSidebar('my-events') +
    '<main class="org-main">' +
      '<div style="padding:32px;">' +

        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:16px;">' +
          '<div>' +
            '<h1 style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:28px;letter-spacing:-0.02em;margin-bottom:4px;">My Events</h1>' +
            '<p style="font-size:13px;color:var(--muted);">Manage all events created by you.</p>' +
          '</div>' +
          '<button class="btn-primary" onclick="navigate(\'create\')">+ New Event</button>' +
        '</div>' +

        '<div class="card" style="padding:0;overflow:hidden;">' +
          '<div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">' +
            '<h3 style="font-family:\'Montserrat\',sans-serif;font-weight:700;font-size:15px;">Events List</h3>' +
            '<span style="font-size:12px;color:var(--muted);">' + events.length + ' event(s)</span>' +
          '</div>' +

          '<div style="overflow-x:auto;">' +
            '<table class="data-table">' +
              '<thead>' +
                '<tr>' +
                  '<th>Event</th>' +
                  '<th>Start Date</th>' +
                  '<th>End Date</th>' +
                  '<th>Tickets Sold</th>' +
                  '<th>Attendance</th>' +
                  '<th>Crowd Level</th>' +
                  '<th>Actions</th>' +
                '</tr>' +
              '</thead>' +
              '<tbody>' +
                events.map(function(ev) {
                  return '<tr>' +
                    '<td>' +
                      '<div style="font-family:\'Montserrat\',sans-serif;font-weight:700;font-size:13px;">' + ev.name + '</div>' +
                      '<div style="font-size:12px;color:var(--muted);">' + formatTimeRange(ev.start_time || 'No time', ev.end_time || 'No time') + '</div>' +
                    '</td>' +
                    '<td>' + (ev.start_date || 'No date') + '</td>' +
                    '<td>' + (ev.end_date || 'No date') + '</td>' +
                    '<td>' + (ev.tickets_sold || 0).toLocaleString() + '</td>' +
                    '<td>' + (ev.attendance_count || 0).toLocaleString() + '</td>' +
                    '<td>' + levelBadge((ev.crowd_level || 'low').toLowerCase()) + '</td>' +
                    '<td>' +
                      '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                        '<button class="btn-ghost" style="font-size:11px;padding:6px 10px;" onclick="navigate(\'edit\',{id:' + ev.id + '})">\u270F\uFE0F Edit</button>' +
                        '<button class="btn-ghost" style="font-size:11px;padding:6px 10px;" onclick="openEventReport(' + ev.id + ')">\uD83D\uDCC8 Report</button>' +
                        '<button class="btn-danger" style="font-size:11px;padding:6px 10px;" onclick="openEmergencyModal(' + ev.id + ', \'' + String((ev.name || 'Event')).replace(/\\/g, '\\\\').replace(/'/g, '\\\'') + '\')">\u26A0\uFE0F Emergency</button>' +
                      '</div>' +
                    '</td>' +
                  '</tr>';
                }).join('') +
              '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +

      '</div>' +
    '</main>' +
  '</div>';
}
