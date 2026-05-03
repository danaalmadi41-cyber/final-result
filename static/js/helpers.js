// ============================================================
//  HELPERS
// ============================================================
var LOGO = '/images/logo.png';

function showToast(msg, type) {
  type = type || 'success';
  var c = document.getElementById('toast-container');
  var t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.innerHTML = '<span>' + (type === 'success' ? '&#10003;' : '&#10005;') + '</span><span>' + msg + '</span>';
  c.appendChild(t);
  setTimeout(function() { t.style.animation = 'slideOut 0.3s ease forwards'; setTimeout(function() { t.remove(); }, 320); }, 3000);
}
window.showToast = showToast;

function levelBadge(level) {
  var map = { low: 'badge-low', medium: 'badge-medium', high: 'badge-high' };
  var labels = { low: 'Low', medium: 'Medium', high: 'High' };
  return '<span class="badge ' + (map[level] || 'badge-info') + '">\u25cf ' + (labels[level] || level) + '</span>';
}

function capBarColor(pct) {
  if (pct < 50) return '#22C55E';
  if (pct < 75) return '#F59E0B';
  return '#EF4444';
}

function notifIcon(type, sev) {
  if (type === 'emergency') return '\uD83D\uDEA8';
  if (type === 'crowd') return sev === 'high' ? '\u26A0\uFE0F' : '\uD83D\uDCCA';
  return '\u2139\uFE0F';
}

function notifColor(sev) {
  if (sev === 'critical') return '#EF4444';
  if (sev === 'high') return '#F59E0B';
  return '#60A5FA';
}

// load real events from backend
async function loadRealEvents() {
  try {
    var response = await fetch('/api/events');
    var data = await response.json();

    if (!response.ok) {
      showToast('Failed to load events', 'error');
      return [];
    }

    // save real events in state
    state.realEvents = data;
    return data;

  } catch (error) {
    console.error(error);
    showToast('Server error while loading events', 'error');
    return [];
  }
}

window.loadRealEvents = loadRealEvents;

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

function getTodayDateInputValue() {
  var now = new Date();
  var year = now.getFullYear();
  var month = String(now.getMonth() + 1).padStart(2, '0');
  var day = String(now.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}
window.getTodayDateInputValue = getTodayDateInputValue;

function parseEventDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;
  var time = String(timeValue);
  if (time.length === 5) time += ':00';
  var parsed = new Date(String(dateValue) + 'T' + time);
  return isNaN(parsed.getTime()) ? null : parsed;
}
window.parseEventDateTime = parseEventDateTime;

function formatEventDateLabel(dateValue) {
  if (!dateValue) return 'TBA';
  var parsed = new Date(String(dateValue) + 'T00:00:00');
  if (isNaN(parsed.getTime())) return String(dateValue);
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
window.formatEventDateLabel = formatEventDateLabel;

function formatClockTime(value) {
  if (!value) return '--';
  var normalized = String(value).trim();
  var match = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return normalized;

  var hours = Number(match[1]);
  var minutes = match[2];

  if (isNaN(hours) || hours < 0 || hours > 23) return normalized;

  var period = hours >= 12 ? 'PM' : 'AM';
  var displayHour = hours % 12;
  if (displayHour === 0) displayHour = 12;

  return displayHour + ':' + minutes + ' ' + period;
}
window.formatClockTime = formatClockTime;

function formatTimeRange(startTime, endTime, separator) {
  var joiner = separator || ' - ';
  return formatClockTime(startTime) + joiner + formatClockTime(endTime);
}
window.formatTimeRange = formatTimeRange;

function parseStoredDateTime(value) {
  if (!value) return null;
  var normalized = String(value).trim().replace(' ', 'T');
  var parsed = new Date(normalized);
  return isNaN(parsed.getTime()) ? null : parsed;
}
window.parseStoredDateTime = parseStoredDateTime;

function formatStoredDateTime(value) {
  if (!value) return '-';
  var parsed = parseStoredDateTime(value);
  if (!parsed) return String(value);
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}
window.formatStoredDateTime = formatStoredDateTime;

function validateEventSchedule(startDate, endDate, startTime, endTime) {
  var startDt = parseEventDateTime(startDate, startTime);
  var endDt = parseEventDateTime(endDate || startDate, endTime);

  if (!startDt || !endDt) {
    return 'Please choose a valid event date and time';
  }

  if (startDt.getTime() <= Date.now()) {
    return 'Event date and time must be in the future';
  }

  if (endDt.getTime() <= startDt.getTime()) {
    return 'Event end time must be after the start time';
  }

  return '';
}
window.validateEventSchedule = validateEventSchedule;

function getEventRuntimeState(ev) {
  var startDt = parseEventDateTime(ev && ev.start_date, ev && ev.start_time);
  var endDt = parseEventDateTime((ev && (ev.end_date || ev.start_date)), ev && ev.end_time);
  var now = new Date();
  var remainingTickets = Math.max(Number(ev && ev.capacity || 0) - Number(ev && ev.tickets_sold || 0), 0);
  var isEnded = !!(endDt && now > endDt);
  var isUpcoming = !!(startDt && now < startDt);
  var isLive = !!(startDt && endDt && now >= startDt && now <= endDt);
  var isSoldOut = remainingTickets <= 0;
  var statusMessage = '';

  if (isEnded) {
    statusMessage = 'Event is ended';
  } else if (isSoldOut) {
    statusMessage = 'Event is sold out for today. Next available tickets on: ' + formatEventDateLabel(ev && (ev.next_available_date || ev.start_date));
  }

  return {
    startDt: startDt,
    endDt: endDt,
    isEnded: isEnded,
    isUpcoming: isUpcoming,
    isLive: isLive,
    isSoldOut: isSoldOut,
    remainingTickets: remainingTickets,
    statusMessage: statusMessage
  };
}
window.getEventRuntimeState = getEventRuntimeState;

var CODE39_PATTERNS = {
  '0': 'nnnwwnwnn',
  '1': 'wnnwnnnnw',
  '2': 'nnwwnnnnw',
  '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn',
  '6': 'nnwwwnnnn',
  '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn',
  '9': 'nnwwnnwnn',
  'A': 'wnnnnwnnw',
  'B': 'nnwnnwnnw',
  'C': 'wnwnnwnnn',
  'D': 'nnnnwwnnw',
  'E': 'wnnnwwnnn',
  'F': 'nnwnwwnnn',
  'G': 'nnnnnwwnw',
  'H': 'wnnnnwwnn',
  'I': 'nnwnnwwnn',
  'J': 'nnnnwwwnn',
  'K': 'wnnnnnnww',
  'L': 'nnwnnnnww',
  'M': 'wnwnnnnwn',
  'N': 'nnnnwnnww',
  'O': 'wnnnwnnwn',
  'P': 'nnwnwnnwn',
  'Q': 'nnnnnnwww',
  'R': 'wnnnnnwwn',
  'S': 'nnwnnnwwn',
  'T': 'nnnnwnwwn',
  'U': 'wwnnnnnnw',
  'V': 'nwwnnnnnw',
  'W': 'wwwnnnnnn',
  'X': 'nwnnwnnnw',
  'Y': 'wwnnwnnnn',
  'Z': 'nwwnwnnnn',
  '-': 'nwnnnnwnw',
  '.': 'wwnnnnwnn',
  ' ': 'nwwnnnwnn',
  '$': 'nwnwnwnnn',
  '/': 'nwnwnnnwn',
  '+': 'nwnnnwnwn',
  '%': 'nnnwnwnwn',
  '*': 'nwnnwnwnn'
};

function normalizeTicketCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^\*+|\*+$/g, '');
}
window.normalizeTicketCode = normalizeTicketCode;

function renderTicketBarcodeSvg(ticketCode, options) {
  options = options || {};
  var normalized = normalizeTicketCode(ticketCode);
  if (!normalized) return '';

  var encoded = '*' + normalized + '*';
  for (var idx = 0; idx < encoded.length; idx += 1) {
    if (!CODE39_PATTERNS[encoded.charAt(idx)]) {
      return '';
    }
  }

  var narrow = Number(options.narrow || 2.5);
  var wide = narrow * 3;
  var height = Number(options.height || 78);
  var quietZone = narrow * 8;
  var x = quietZone;
  var rects = '';

  for (var i = 0; i < encoded.length; i += 1) {
    var pattern = CODE39_PATTERNS[encoded.charAt(i)];
    for (var p = 0; p < pattern.length; p += 1) {
      var width = pattern.charAt(p) === 'w' ? wide : narrow;
      if (p % 2 === 0) {
        rects += '<rect x="' + x + '" y="0" width="' + width + '" height="' + height + '" fill="#111827"></rect>';
      }
      x += width;
    }
    x += narrow;
  }

  var totalWidth = x + quietZone;
  var labelY = height + 18;

  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + totalWidth + '" height="' + (height + 24) + '" viewBox="0 0 ' + totalWidth + ' ' + (height + 24) + '" role="img" aria-label="Barcode for ' + escapeHtml(normalized) + '">' +
    '<rect width="100%" height="100%" fill="#ffffff"></rect>' +
    rects +
    '<text x="' + (totalWidth / 2) + '" y="' + labelY + '" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" letter-spacing="2" fill="#111827">' + escapeHtml(normalized) + '</text>' +
  '</svg>';
}
window.renderTicketBarcodeSvg = renderTicketBarcodeSvg;
