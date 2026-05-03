// ============================================================
//  REPORT STATE
// ============================================================
if (!state.reportFilters) {
  state.reportFilters = {
    eventId: '',
    start: '',
    end: ''
  };
}

if (!state.currentReport) {
  state.currentReport = null;
}


// ============================================================
//  VIEW: REPORTS
// ============================================================
function renderReports() {
  if (!state.user || state.user.role !== 'organizer') {
    showToast('Access denied', 'error');
    navigate('home');
    return '';
  }

  var events = state.realEvents || [];
  var filters = state.reportFilters || {};
  var report = state.currentReport;

  if (!events.length) {
    return '<div class="org-layout">' +
      renderSidebar('reports') +
      '<main class="org-main">' +
        '<div style="padding:32px;">' +
          '<div class="card" style="padding:32px;text-align:center;">' +
            '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;margin-bottom:12px;">No Reports Available</h2>' +
            '<p style="color:var(--muted);margin-bottom:20px;">Create an event first to generate reports.</p>' +
            '<button class="btn-primary" onclick="navigate(\'create\')">Create Event</button>' +
          '</div>' +
        '</div>' +
      '</main>' +
    '</div>';
  }

  return '<div class="org-layout">' +
    renderSidebar('reports') +
    '<main class="org-main">' +
      '<div style="padding:32px;">' +

        '<style>' +
          '.report-stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-top:18px;}' +
          '.report-stat-card{background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:14px;padding:18px;text-align:center;}' +
          '.report-stat-card .label{font-size:12px;color:var(--muted);font-family:\'Montserrat\',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;}' +
          '.report-stat-card .value{font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:26px;letter-spacing:-.02em;}' +
          '@media print {' +
            'body * { visibility:hidden !important; }' +
            '#report-print-area, #report-print-area * { visibility:visible !important; }' +
            '#report-print-area { position:absolute; left:0; top:0; width:100%; background:#fff !important; color:#000 !important; padding:24px; }' +
            '.no-print { display:none !important; }' +
            '.print-table { width:100%; border-collapse:collapse; margin-top:12px; }' +
            '.print-table th, .print-table td { border:1px solid #ccc; padding:10px; text-align:left; font-size:12px; color:#000 !important; }' +
            '.print-card { border:1px solid #ddd; padding:16px; border-radius:10px; margin-bottom:18px; box-shadow:none !important; background:#fff !important; }' +
            '.report-stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}' +
            '.report-stat-card{border:1px solid #ccc;background:#fff !important;color:#000 !important;box-shadow:none !important;}' +
          '}' +
        '</style>' +

        '<div class="no-print" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px;">' +
          '<h1 style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:28px;">Reports</h1>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
            '<select id="report-event" class="input-field" style="width:220px;font-size:13px;" onchange="updateReportFilters()">' +
              '<option value="">Select event</option>' +
              events.map(function(ev) {
                var selected = String(filters.eventId) === String(ev.id) ? 'selected' : '';
                return '<option value="' + ev.id + '" ' + selected + '>' + ev.name + '</option>';
              }).join('') +
            '</select>' +

            '<input id="report-start" type="time" class="input-field" style="width:160px;font-size:13px;" value="' + (filters.start || '') + '" onchange="updateReportFilters()" />' +
            '<input id="report-end" type="time" class="input-field" style="width:160px;font-size:13px;" value="' + (filters.end || '') + '" onchange="updateReportFilters()" />' +

            '<button class="btn-primary" onclick="generateReport()">Generate Report</button>' +
            '<button class="btn-primary" style="background:linear-gradient(135deg,#d86d59,#ef9b6d);" onclick="exportReportPdf()">Export PDF</button>' +
          '</div>' +
        '</div>' +

        (!report
          ? '<div class="card" style="padding:32px;text-align:center;">' +
              '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;margin-bottom:12px;">No Report Generated</h2>' +
              '<p style="color:var(--muted);">Choose an event and click Generate Report.</p>' +
            '</div>'
          : '<div id="report-print-area">' +

              // 1. EVENT REPORT
              '<div class="print-card card" style="padding:24px;margin-bottom:20px;">' +
                '<h2 style="font-family:\'Montserrat\',sans-serif;font-weight:900;font-size:26px;margin-bottom:14px;">Event Report</h2>' +
                '<table class="print-table data-table">' +
                  '<tbody>' +
                    '<tr><th>Event Name</th><td>' + report.event_name + '</td></tr>' +
                    '<tr><th>Start Date</th><td>' + (report.start_date || '-') + '</td></tr>' +
                    '<tr><th>End Date</th><td>' + (report.end_date || '-') + '</td></tr>' +
                    '<tr><th>Start Time</th><td>' + (report.filter_start || '-') + '</td></tr>' +
                    '<tr><th>End Time</th><td>' + (report.filter_end || '-') + '</td></tr>' +
                    '<tr><th>Ticket Price</th><td>$' + Number(report.ticket_price || 0).toFixed(2) + '</td></tr>' +
                    '<tr><th>Crowd Level</th><td>' + (report.crowd_level || '-') + '</td></tr>' +
                  '</tbody>' +
                '</table>' +
              '</div>' +

              // 2. STAFF
              '<div class="print-card card" style="padding:24px;margin-bottom:20px;">' +
                '<h3 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:20px;margin-bottom:12px;">Staff</h3>' +
                '<table class="print-table data-table">' +
                  '<thead>' +
                    '<tr><th>#</th><th>Staff ID</th><th>Staff Name</th><th>Event Worked In</th></tr>' +
                  '</thead>' +
                  '<tbody>' +
                    ((report.staff && report.staff.length)
                      ? report.staff.map(function(s, i) {
                          return '<tr>' +
                            '<td>' + (i + 1) + '</td>' +
                            '<td>' + (s.staff_id || '-') + '</td>' +
                            '<td>' + s.staff_name + '</td>' +
                            '<td>' + (s.event_name || report.event_name || '-') + '</td>' +
                          '</tr>';
                        }).join('')
                      : '<tr><td colspan="4">No staff found</td></tr>') +
                  '</tbody>' +
                '</table>' +
              '</div>' +

              // 3. CUSTOMERS
              '<div class="print-card card" style="padding:24px;margin-bottom:20px;">' +
                '<h3 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:20px;margin-bottom:12px;">Customers</h3>' +
                '<table class="print-table data-table">' +
                  '<thead>' +
                    '<tr><th>#</th><th>Customer Name</th><th>Email</th><th>Ticket Code</th><th>Status</th><th>Price</th><th>Purchase Time</th></tr>' +
                  '</thead>' +
                  '<tbody>' +
                    ((report.customers && report.customers.length)
                      ? report.customers.map(function(c, i) {
                          return '<tr>' +
                            '<td>' + (i + 1) + '</td>' +
                            '<td>' + c.customer_name + '</td>' +
                            '<td>' + c.customer_email + '</td>' +
                            '<td>' + c.ticket_code + '</td>' +
                            '<td>' + (c.status || 'Active') + '</td>' +
                            '<td>$' + Number(c.ticket_price || 0).toFixed(2) + '</td>' +
                            '<td>' + (c.purchase_time || '-') + '</td>' +
                          '</tr>';
                        }).join('')
                      : '<tr><td colspan="7">No customers found</td></tr>') +
                  '</tbody>' +
                '</table>' +
              '</div>' +

              // 4. FINANCIAL & ATTENDANCE SUMMARY
              '<div class="print-card card" style="padding:24px;margin-bottom:20px;">' +
                '<h3 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:20px;margin-bottom:12px;">Financial and Attendance Summary</h3>' +
                '<div class="report-stats-grid">' +
                  reportStatCard('Tickets Sold', report.tickets_sold) +
                  reportStatCard('Attendance', report.attendance_count) +
                  reportStatCard('Total Earnings', '$' + Number(report.revenue || 0).toFixed(2)) +
                  reportStatCard('Purchase Rate', Number(report.purchase_rate || 0).toFixed(2) + '%') +
                  reportStatCard('Attendance Rate', Number(report.attendance_rate || 0).toFixed(2) + '%') +
                  reportStatCard('Sold Out', report.sold_out ? 'Yes' : 'No') +
                '</div>' +
              '</div>' +

            '</div>') +

      '</div>' +
    '</main>' +
  '</div>';
}


// ============================================================
//  REPORT HELPERS
// ============================================================
function reportStatCard(label, value) {
  return '<div class="report-stat-card">' +
    '<div class="label">' + label + '</div>' +
    '<div class="value">' + value + '</div>' +
  '</div>';
}

function updateReportFilters() {
  state.reportFilters = {
    eventId: document.getElementById('report-event').value,
    start: document.getElementById('report-start').value,
    end: document.getElementById('report-end').value
  };
}
window.updateReportFilters = updateReportFilters;


// ============================================================
//  GENERATE REPORT
// ============================================================
async function generateReport() {
  updateReportFilters();

  var filters = state.reportFilters;

  if (!filters.eventId) {
    showToast('Please select an event', 'error');
    return;
  }

  try {
    var url = '/api/reports/' + filters.eventId +
      '?start=' + encodeURIComponent(filters.start || '') +
      '&end=' + encodeURIComponent(filters.end || '');

    var response = await fetch(url);
    var data = await response.json();

    if (!response.ok) {
      showToast(data.message || 'Failed to generate report', 'error');
      return;
    }

    state.currentReport = data;
    showToast('Report generated successfully', 'success');
    render();

  } catch (error) {
    console.error('REPORT ERROR:', error);
    showToast('Server error generating report', 'error');
  }
}
window.generateReport = generateReport;


// ============================================================
//  EXPORT PDF
// ============================================================
function exportReportPdf() {
  if (!state.currentReport) {
    showToast('Generate a report first', 'error');
    return;
  }

  var originalTitle = document.title;
  document.title = state.currentReport.event_name + ' Report';
  window.print();
  document.title = originalTitle;
}
window.exportReportPdf = exportReportPdf;


// ============================================================
//  EMPTY CHART INIT
// ============================================================
function initReportsCharts() {}
