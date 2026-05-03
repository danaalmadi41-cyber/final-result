// ============================================================
//  FIREBASE MESSAGING SERVICE WORKER
//  Handles background push notifications
// ============================================================
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAzTWM52p4Cz2sXx6RTw-f68PwlTFB5AWM",
  authDomain: "crowd-ai2.firebaseapp.com",
  databaseURL: "https://crowd-ai2-default-rtdb.firebaseio.com",
  projectId: "crowd-ai2",
  storageBucket: "crowd-ai2.firebasestorage.app",
  messagingSenderId: "514914081457",
  appId: "1:514914081457:web:eba46257d32b9998b96090"
});

var messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  var title = payload.notification ? payload.notification.title : 'Crowd Alert';
  var body  = payload.notification ? payload.notification.body  : '';

  self.registration.showNotification(title, {
    body: body,
    icon: '/images/logo.png',
    badge: '/images/logo.png',
    data: payload.data || {}
  });
});
