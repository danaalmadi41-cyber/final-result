// ============================================================
//  FIREBASE CLOUD MESSAGING (PUSH NOTIFICATIONS)
// ============================================================
//
//  To enable push notifications:
//  1. Go to Firebase Console > Project Settings > Cloud Messaging
//  2. Under "Web Push certificates", click "Generate key pair"
//  3. Paste the key string below as VAPID_KEY
//
var VAPID_KEY = 'BG_N2x9FPBmEJl9KsM5OhhBbw14qNyzzpm7cLySGOo86UD7PobSiUwsJRfJpemtcf-6IxyV1VmHOz4QNcV5JLAM';

var _fcmInitialized = false;

function initFCM() {
  if (_fcmInitialized) return;
  if (typeof firebase === 'undefined' || !firebase.messaging || !firebase.messaging.isSupported()) {
    console.log('[FCM] Not supported in this browser');
    return;
  }
  _fcmInitialized = true;

  var messaging = firebase.messaging();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/js/firebase-messaging-sw.js').then(function(reg) {
      messaging.useServiceWorker(reg);
    }).catch(function(err) {
      console.log('[FCM] Service worker error:', err);
    });
  }

  // Request notification permission
  Notification.requestPermission().then(function(permission) {
    if (permission !== 'granted') {
      console.log('[FCM] Notification permission denied');
      return;
    }

    messaging.getToken({ vapidKey: VAPID_KEY }).then(function(token) {
      if (token && state.user && typeof fbDb !== 'undefined') {
        fbDb.ref('fcm_tokens/' + state.user.id).set({
          token: token,
          email: state.user.email || '',
          updated: Date.now()
        });
        console.log('[FCM] Token registered for user', state.user.id);
      }
    }).catch(function(err) {
      console.log('[FCM] Token error:', err);
    });
  });

  // Handle foreground notifications (app is open)
  messaging.onMessage(function(payload) {
    var title = payload.notification ? payload.notification.title : 'Crowd Alert';
    var body  = payload.notification ? payload.notification.body  : '';
    if (typeof showToast === 'function') {
      showToast('🔔 ' + title + ': ' + body, 'success');
    }
  });
}

window.initFCM = initFCM;
