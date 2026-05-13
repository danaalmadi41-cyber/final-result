(function() {
  // Adds a version to script URLs so the browser loads the latest files.
  var ASSET_VERSION = '20260514-04';

  // Checks if this file is running in the page head or body.
  function getPhase() {
    try {
      var current = document.currentScript;
      if (!current || !current.src) return 'body';
      var url = new URL(current.src, window.location.href);
      return url.searchParams.get('phase') || 'body';
    } catch (e) {
      return 'body';
    }
  }

  // Applies the saved theme early so the page does not flash the wrong theme.
  function applyThemeEarly() {
    try {
      var saved = localStorage.getItem('theme') || 'dark';
      document.documentElement.setAttribute('data-theme', saved);
    } catch (e) {}
  }

  // Loads scripts one by one so they are ready in the correct order.
  function loadScriptSequentially(paths) {
    return paths.reduce(function(chain, path) {
      return chain.then(function() {
        return new Promise(function(resolve, reject) {
          var script = document.createElement('script');
          script.src = path + (path.indexOf('?') === -1 ? '?v=' : '&v=') + ASSET_VERSION;
          script.onload = resolve;
          script.onerror = function() {
            reject(new Error('Failed to load script: ' + path));
          };
          document.body.appendChild(script);
        });
      });
    }, Promise.resolve());
  }

  // Shows a simple error screen if the app fails to start.
  function showBootError(message) {
    try {
      var app = document.getElementById('app');
      if (!app) return;
      app.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0D0C1A;color:#E8E4FF;">' +
          '<div style="max-width:760px;width:100%;padding:28px;border-radius:18px;border:1px solid rgba(239,68,68,0.35);background:rgba(255,255,255,0.05);">' +
            '<div style="font-family:Montserrat,sans-serif;font-weight:900;font-size:28px;margin-bottom:10px;">Website Boot Error</div>' +
            '<div style="color:rgba(232,228,255,0.78);line-height:1.8;font-size:14px;">' + message + '</div>' +
            '<div style="margin-top:16px;color:rgba(232,228,255,0.6);font-size:13px;">Refresh with Ctrl+F5 to load the newest files.</div>' +
          '</div>' +
        '</div>';
    } catch (e) {}
  }

  // Finds out how this startup file should run on this page load.
  var phase = getPhase();

  if (phase === 'head') {
    // In head mode, only apply the theme and stop here.
    applyThemeEarly();
    return;
  }

  // Catches startup errors and shows a helpful message.
  window.addEventListener('error', function(event) {
    var source = event && event.filename ? event.filename : 'unknown script';
    var message = event && event.message ? event.message : 'Unknown JavaScript error';
    showBootError('JavaScript failed in ' + source + '. Message: ' + message);
  });

  // Catches failed async startup tasks that might otherwise be missed.
  window.addEventListener('unhandledrejection', function(event) {
    var reason = event && event.reason ? String(event.reason) : 'Unknown promise rejection';
    showBootError('An unexpected loading error occurred. Message: ' + reason);
  });

  // Main app files load in order because some depend on earlier ones.
  var localScripts = [
    '/static/js/firebase-config.js',
    '/static/js/state.js',
    '/static/js/helpers.js',
    '/static/js/nav.js',
    '/static/js/home.js',
    '/static/js/login.js',
    '/static/js/signup.js',
    '/static/js/event-detail.js',
    '/static/js/entry-staff.js',
    '/static/js/notifications.js',
    '/static/js/admin-organizers.js',
    '/static/js/chart.js',
    '/static/js/customer-dashboard.js',
    '/static/js/dashboard.js',
    '/static/js/create.js',
    '/static/js/edit.js',
    '/static/js/my-events.js',
    '/static/js/reports.js',
    '/static/js/add-staff.js',
    '/static/js/chat.js',
    '/static/js/firebase-realtime.js',
    '/static/js/firebase-auth.js',
    '/static/js/firebase-notifications.js',
    '/static/js/theme.js',
    '/static/js/router.js'
  ];

  // Starts loading the app files and shows an error if one fails.
  loadScriptSequentially(localScripts).catch(function(error) {
    console.error(error);
    showBootError(error && error.message ? error.message : 'Failed to load application scripts.');
  });
})();
