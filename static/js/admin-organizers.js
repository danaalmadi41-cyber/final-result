function adminSafe(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAdminDate(value) {
  if (!value) return 'Not set';
  return typeof formatStoredDateTime === 'function' ? formatStoredDateTime(value) : value;
}

function getApprovalBadge(status) {
  var normalized = String(status || 'approved').toLowerCase();
  if (normalized === 'pending') {
    return '<span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:rgba(245,158,11,0.16);color:#fbbf24;font-size:12px;font-weight:800;border:1px solid rgba(251,191,36,0.22);">Pending Review</span>';
  }
  if (normalized === 'rejected') {
    return '<span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:rgba(239,68,68,0.16);color:#f87171;font-size:12px;font-weight:800;border:1px solid rgba(248,113,113,0.22);">Rejected</span>';
  }
  return '<span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:rgba(34,197,94,0.16);color:#86efac;font-size:12px;font-weight:800;border:1px solid rgba(134,239,172,0.22);">Approved</span>';
}

async function loadAdminOrganizerApplications() {
  if (!state.user || !state.user.is_admin) return;

  state.adminApplicationsLoading = true;
  render({ preserveScroll: true });

  try {
    var response = await fetch('/api/admin/organizer-applications?admin_user_id=' + encodeURIComponent(state.user.id));
    var data = await response.json();

    if (!response.ok) {
      showToast(data.message || 'Failed to load organizer applications', 'error');
      state.adminApplicationsLoading = false;
      return;
    }

    state.adminApplications = Array.isArray(data) ? data : [];
    state.adminApplicationsLoaded = true;
    state.adminApplicationsLoading = false;
    render({ preserveScroll: true });
  } catch (error) {
    console.error('ADMIN APPLICATION LOAD ERROR:', error);
    state.adminApplicationsLoading = false;
    showToast('Server error while loading organizer applications', 'error');
    render({ preserveScroll: true });
  }
}
window.loadAdminOrganizerApplications = loadAdminOrganizerApplications;

async function reviewOrganizerApplication(userId, decision) {
  if (!state.user || !state.user.is_admin) {
    showToast('Admin access required', 'error');
    return;
  }

  try {
    var response = await fetch('/api/admin/organizer-applications/' + userId + '/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_user_id: state.user.id,
        decision: decision
      })
    });

    var data = await response.json();
    if (!response.ok) {
      showToast(data.message || 'Review failed', 'error');
      return;
    }

    showToast(data.message || 'Review saved', 'success');
    state.adminApplicationsLoaded = false;
    loadAdminOrganizerApplications();
  } catch (error) {
    console.error('ADMIN REVIEW ERROR:', error);
    showToast('Server error while saving the review', 'error');
  }
}
window.reviewOrganizerApplication = reviewOrganizerApplication;

function renderAdminOrganizerCards() {
  var items = state.adminApplications || [];
  if (!items.length) {
    return '<div class="card" style="padding:28px;text-align:center;">' +
      '<h2 style="font-family:\'Montserrat\',sans-serif;font-size:24px;font-weight:800;margin-bottom:10px;">No organizer applications yet</h2>' +
      '<p style="color:var(--muted);line-height:1.7;">When an organizer submits a request, their reason and proof document will appear here for review.</p>' +
    '</div>';
  }

  return items.map(function(item) {
    var proofUrl = '/api/admin/organizer-applications/' + item.id + '/proof?admin_user_id=' + encodeURIComponent(state.user.id);
    return '<div class="card" style="padding:24px;margin-bottom:18px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px;">' +
        '<div>' +
          '<h3 style="font-family:\'Montserrat\',sans-serif;font-size:22px;font-weight:800;margin-bottom:6px;">' + adminSafe(item.full_name) + '</h3>' +
          '<div style="color:var(--muted);font-size:14px;line-height:1.7;">' +
            '<div><strong>Email:</strong> ' + adminSafe(item.email) + '</div>' +
            '<div><strong>Submitted:</strong> ' + adminSafe(formatAdminDate(item.created_at)) + '</div>' +
            '<div><strong>Proof:</strong> ' + (item.organizer_proof_name ? '<a href="' + proofUrl + '" target="_blank" style="color:#f8b36c;">' + adminSafe(item.organizer_proof_name) + '</a>' : 'Not uploaded') + '</div>' +
          '</div>' +
        '</div>' +
        getApprovalBadge(item.approval_status) +
      '</div>' +
      '<div style="display:grid;gap:16px;">' +
        '<div style="padding:16px;border-radius:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);">' +
          '<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">Organizer Reason</div>' +
          '<div style="line-height:1.8;color:var(--text);white-space:pre-wrap;">' + adminSafe(item.organizer_application_reason || 'No reason provided') + '</div>' +
        '</div>' +
        '<div style="padding:16px;border-radius:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);font-size:12px;color:var(--muted);">Reviewed at: ' + adminSafe(formatAdminDate(item.reviewed_at)) + (item.reviewed_by_email ? ' by ' + adminSafe(item.reviewed_by_email) : '') + '</div>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
          '<button class="btn-primary" onclick="reviewOrganizerApplication(' + item.id + ', \'approved\')">Approve Organizer</button>' +
          '<button class="btn-ghost" onclick="reviewOrganizerApplication(' + item.id + ', \'rejected\')" style="border-color:rgba(248,113,113,0.3);color:#fca5a5;">Reject Organizer</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderAdminOrganizers() {
  if (!state.user || !state.user.is_admin) {
    return renderTopNav() +
      '<main style="max-width:1180px;margin:0 auto;padding:32px 20px;">' +
        '<div class="card" style="padding:28px;text-align:center;">Admin access required.</div>' +
      '</main>';
  }

  if (!state.adminApplicationsLoaded && !state.adminApplicationsLoading) {
    loadAdminOrganizerApplications();
  }

  var content = state.adminApplicationsLoading
    ? '<div class="card" style="padding:28px;text-align:center;">Loading organizer applications...</div>'
    : renderAdminOrganizerCards();

  var pageHeader = '' +
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px;">' +
      '<div>' +
        '<h1 style="font-family:\'Montserrat\',sans-serif;font-size:36px;font-weight:900;letter-spacing:-0.03em;margin-bottom:8px;">Organizer Approval Queue</h1>' +
        '<p style="color:var(--muted);max-width:720px;line-height:1.8;">Review each organizer request, read why they want access, and open the uploaded proof document before you approve or reject the account.</p>' +
      '</div>' +
      '<button class="btn-ghost" onclick="loadAdminOrganizerApplications()">Refresh</button>' +
    '</div>' +
    content;

  if (state.user.role === 'organizer') {
    return '<div class="org-layout">' +
      renderSidebar('admin-organizers') +
      '<main class="org-main">' +
        '<div style="padding:30px;">' + pageHeader + '</div>' +
      '</main>' +
    '</div>';
  }

  return renderTopNav() +
    '<main style="max-width:1180px;margin:0 auto;padding:32px 20px 60px;">' + pageHeader + '</main>';
}
