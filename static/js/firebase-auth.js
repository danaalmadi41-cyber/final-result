// ============================================================
//  FIREBASE AUTH — runs alongside Flask auth
// ============================================================

function firebaseSignIn(email, password) {
  if (typeof fbAuth === 'undefined') return;
  fbAuth.signInWithEmailAndPassword(email, password).catch(function(err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
      fbAuth.createUserWithEmailAndPassword(email, password).catch(function(e) {
        console.log('[Firebase Auth] sign-in fallback error:', e.message);
      });
    }
  });
}

function firebaseSignUp(email, password, displayName) {
  if (typeof fbAuth === 'undefined') return;
  fbAuth.createUserWithEmailAndPassword(email, password)
    .then(function(cred) {
      return cred.user.updateProfile({ displayName: displayName });
    })
    .catch(function(err) {
      if (err.code === 'auth/email-already-in-use') {
        firebaseSignIn(email, password);
      } else {
        console.log('[Firebase Auth] sign-up error:', err.message);
      }
    });
}

function firebaseSignOut() {
  if (typeof fbAuth === 'undefined') return;
  fbAuth.signOut().catch(function() {});
}

// Sync Firebase auth state — re-init FCM token when user signs in
fbAuth && fbAuth.onAuthStateChanged(function(user) {
  if (user && typeof initFCM === 'function') {
    initFCM();
  }
});

window.firebaseSignIn  = firebaseSignIn;
window.firebaseSignUp  = firebaseSignUp;
window.firebaseSignOut = firebaseSignOut;
