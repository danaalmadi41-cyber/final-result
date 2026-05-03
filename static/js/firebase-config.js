// ============================================================
//  FIREBASE INITIALIZATION
// ============================================================
var firebaseConfig = {
  apiKey: "AIzaSyAzTWM52p4Cz2sXx6RTw-f68PwlTFB5AWM",
  authDomain: "crowd-ai2.firebaseapp.com",
  databaseURL: "https://crowd-ai2-default-rtdb.firebaseio.com",
  projectId: "crowd-ai2",
  storageBucket: "crowd-ai2.firebasestorage.app",
  messagingSenderId: "514914081457",
  appId: "1:514914081457:web:eba46257d32b9998b96090",
  measurementId: "G-EYFT44F9EP"
};

firebase.initializeApp(firebaseConfig);

var fbDb   = firebase.database();
var fbAuth = firebase.auth();

console.log('[Firebase] Initialized — RTDB + Auth ready');
