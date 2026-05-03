// Shared weekday labels keep every attendance chart aligned to the same order.
var WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Convert a date string into the weekday name used on the chart axis.
function getDayOfWeek(dateStr) {
  if (!dateStr) return '';

  var date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  return WEEKDAY_LABELS[date.getDay()];
}

// Normalize event date access because different pages may use different field names.
function getEventChartDate(ev) {
  return ev && (ev.start_date || ev.event_date || ev.date)
    ? (ev.start_date || ev.event_date || ev.date)
    : '';
}

// Pick a safe Y-axis max using event capacity, chart data, and a minimum fallback.
function getAttendanceAxisMax(events, fallbackMax) {
  var maxCapacity = (events || []).reduce(function(max, ev) {
    return Math.max(max, Number(ev.capacity || 0));
  }, 0);

  return Math.max(Number(fallbackMax || 0), maxCapacity, 1);
}

// Start with an empty total for each weekday before grouping event values.
function createEmptyWeekdayMap() {
  return {
    Sunday: 0,
    Monday: 0,
    Tuesday: 0,
    Wednesday: 0,
    Thursday: 0,
    Friday: 0,
    Saturday: 0
  };
}

// Build weekday totals for any event metric passed in through the resolver.
function buildWeekdaySeries(events, valueResolver) {
  var weekdayData = createEmptyWeekdayMap();

  (events || []).forEach(function(ev) {
    var dayOfWeek = getDayOfWeek(getEventChartDate(ev));
    if (!dayOfWeek || !weekdayData.hasOwnProperty(dayOfWeek)) return;

    weekdayData[dayOfWeek] += Number(valueResolver(ev) || 0);
  });

  return WEEKDAY_LABELS.map(function(day) {
    return weekdayData[day] || 0;
  });
}

// For a single event, place its value on the correct weekday and leave the rest at zero.
function buildSingleEventWeekdaySeries(eventData, mode) {
  var series = WEEKDAY_LABELS.map(function() { return 0; });
  if (!eventData) return series;

  var dayOfWeek = getDayOfWeek(getEventChartDate(eventData));
  var dayIndex = WEEKDAY_LABELS.indexOf(dayOfWeek);
  if (dayIndex === -1) return series;

  var prediction = eventData.prediction || {};
  var value = mode === 'prediction'
    ? Number(prediction.predicted_peak_attendance || prediction.predicted_final_attendance || 0)
    : Number(eventData.attendance_count || 0);

  series[dayIndex] = value;
  return series;
}

// Check the active site theme so chart colors match the rest of the UI.
function isLightChartTheme() {
  var theme = document.documentElement.getAttribute('data-theme');
  return theme === 'light' || document.body.classList.contains('light-mode');
}

// Centralize chart colors for light and dark mode styling.
function getChartThemeColors() {
  if (isLightChartTheme()) {
    return {
      text: 'rgba(92, 58, 40, 0.94)',
      axisTitle: 'rgba(92, 58, 40, 0.94)',
      grid: 'rgba(138, 100, 76, 0.18)',
      border: 'rgba(138, 100, 76, 0.18)',
      tooltipBg: 'rgba(255, 248, 241, 0.98)',
      tooltipTitle: '#5c3a28',
      tooltipBody: '#5c3a28',
      tooltipBorder: 'rgba(138, 100, 76, 0.18)'
    };
  }

  return {
    text: 'rgba(230,225,255,0.68)',
    axisTitle: 'rgba(230,225,255,0.68)',
    grid: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.08)',
    tooltipBg: 'rgba(24, 18, 33, 0.96)',
    tooltipTitle: '#f5e8e1',
    tooltipBody: '#f5e8e1',
    tooltipBorder: 'rgba(255,255,255,0.08)'
  };
}

// Shared Chart.js builder used by the dashboard and event detail attendance charts.
function createBarChart(canvasId, labels, data, label, colors, yAxisMax, yAxisTitle) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;

  // Recreate the chart cleanly when the same canvas is rendered again.
  if (chartReg[canvasId]) {
    chartReg[canvasId].destroy();
  }

  // Apply theme-aware defaults before building the current chart instance.
  var themeColors = getChartThemeColors();
  Chart.defaults.color = themeColors.text;
  Chart.defaults.borderColor = themeColors.border;

  chartReg[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: label,
        data: data,
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 10,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: themeColors.tooltipBg,
          titleColor: themeColors.tooltipTitle,
          bodyColor: themeColors.tooltipBody,
          borderColor: themeColors.tooltipBorder,
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              return label + ': ' + Number(context.parsed.y || 0).toLocaleString() + ' attendees';
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: themeColors.grid },
          ticks: {
            color: themeColors.text,
            font: { size: 11 },
            maxRotation: 0,
            minRotation: 0
          },
          title: {
            display: true,
            text: 'Days of the Week',
            color: themeColors.axisTitle,
            font: { family: 'Montserrat', size: 11, weight: '700' }
          }
        },
        y: {
          beginAtZero: true,
          max: yAxisMax,
          grid: { color: themeColors.grid },
          ticks: {
            color: themeColors.text,
            stepSize: Math.max(Math.ceil(yAxisMax / 5), 1),
            font: { size: 11 },
            callback: function(v) { return Number(v).toLocaleString(); }
          },
          title: {
            display: true,
            text: yAxisTitle || 'Number of Attendees',
            color: themeColors.axisTitle,
            font: { family: 'Montserrat', size: 11, weight: '700' }
          }
        }
      }
    }
  });
}

// Render the weekly chart for current recorded attendance totals.
function initCurrentAttendanceChart(canvasId, events) {
  var data = buildWeekdaySeries(events, function(ev) {
    return Number(ev.attendance_count || 0);
  });
  var yAxisMax = getAttendanceAxisMax(events, Math.max.apply(null, data));

  createBarChart(
    canvasId,
    WEEKDAY_LABELS,
    data,
    'Current Attendance',
    'rgba(122, 84, 62, 0.88)',
    yAxisMax,
    'Number of Attendees'
  );
}

// Render the weekly chart for predicted attendance totals.
function initPredictedAttendanceChart(canvasId, events) {
  var data = buildWeekdaySeries(events, function(ev) {
    var prediction = ev.prediction || {};
    return Number(prediction.predicted_peak_attendance || prediction.predicted_final_attendance || 0);
  });
  var yAxisMax = getAttendanceAxisMax(events, Math.max.apply(null, data));

  createBarChart(
    canvasId,
    WEEKDAY_LABELS,
    data,
    'Predicted Attendance',
    'rgba(168, 121, 86, 0.88)',
    yAxisMax,
    'Number of Attendees'
  );
}

// Render the single-event chart in either current or prediction mode.
function initEventDetailAttendanceChart(canvasId, eventData, mode) {
  if (!eventData) return;

  var data = buildSingleEventWeekdaySeries(eventData, mode);
  var yAxisMax = Math.max(Number(eventData.capacity || 0), Math.max.apply(null, data), 1);
  var colors = mode === 'prediction'
    ? 'rgba(168, 121, 86, 0.88)'
    : 'rgba(122, 84, 62, 0.88)';
  var label = mode === 'prediction'
    ? 'Predicted Attendance'
    : 'Current Attendance';

  createBarChart(
    canvasId,
    WEEKDAY_LABELS,
    data,
    label,
    colors,
    yAxisMax,
    'Number of Attendees'
  );
}
