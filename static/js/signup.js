// ============================================================
//  VIEW: SIGN UP
// ============================================================
function renderSignup() {
  var roles = ['customer', 'organizer'];
  var roleLabels = ['Attendee', 'Event Organizer'];
  var signupRole = state.signupRole || 'customer';
  var customerNotificationsEnabled = state.signupNotificationsEnabled !== false;
  var organizerFields = signupRole === 'organizer'
    ? '<div style="margin-bottom:14px;">' +
        '<label class="field-label">Why do you want to organize events?</label>' +
        '<textarea class="input-field" id="signup-organizer-reason" rows="4" placeholder="Tell the admin about your experience, your event plan, or why you are suitable for organizer access." style="resize:vertical;min-height:120px;"></textarea>' +
      '</div>' +
      '<div style="margin-bottom:18px;">' +
        '<label class="field-label">Proof of experience or government approval</label>' +
        '<input type="file" class="input-field" id="signup-organizer-proof" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" style="padding:12px;" />' +
        '<div style="margin-top:8px;font-size:12px;color:var(--muted);line-height:1.6;">Upload a certificate, prior event proof, license, or government approval document. Your account will stay pending until admin review.</div>' +
      '</div>'
    : '';
  var customerNotificationFields = signupRole === 'customer'
    ? '<div style="margin-bottom:18px;padding:16px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid var(--border);">' +
        '<div style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:14px;margin-bottom:8px;">Notification Settings</div>' +
        '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:13px;color:var(--muted);line-height:1.7;">' +
          '<input type="checkbox" id="signup-notifications-enabled"' + (customerNotificationsEnabled ? ' checked' : '') + ' onchange="setSignupNotificationsEnabled(this.checked)" style="margin-top:2px;" />' +
          '<span>Receive normal event notifications and crowd updates. Emergency notifications will always be sent even if this is turned off.</span>' +
        '</label>' +
      '</div>'
    : '';

  return '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;position:relative;overflow:hidden;background:var(--dark);">' +
    '<div class="grid-bg"></div>' +
    '<div style="position:absolute;inset:0;background:radial-gradient(ellipse 700px 500px at 70% 50%,rgba(155,16,64,0.1) 0%,transparent 70%),radial-gradient(ellipse 500px 400px at 30% 40%,rgba(255,180,0,0.07) 0%,transparent 60%);pointer-events:none;"></div>' +
    '<div class="card" style="width:100%;max-width:460px;padding:36px;position:relative;z-index:1;background:rgba(255,255,255,0.06);backdrop-filter:blur(16px);">' +
      '<div style="text-align:center;margin-bottom:28px;">' +
        '<img src="' + LOGO + '" alt="Crowd Analyzing" style="height:50px;margin-bottom:16px;" />' +
        '<h1 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;margin-bottom:6px;">Create Account</h1>' +
        '<p style="color:var(--muted);font-size:14px;">Join Crowd Analyzing and discover smarter events</p>' +
      '</div>' +
      '<div style="margin-bottom:24px;">' +
        '<div class="tab-bar" id="signup-role-tabs">' +
          roles.map(function(r, i) {
            return '<button type="button" class="tab-btn ' + (signupRole === r ? 'active' : '') + '" onclick="setSignupRole(\'' + r + '\')">' + roleLabels[i] + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<form onsubmit="doSignup(event)" id="signup-form">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">' +
          '<div>' +
            '<label class="field-label">First Name</label>' +
            '<input type="text" class="input-field" placeholder="First name" required id="signup-fname" />' +
          '</div>' +
          '<div>' +
            '<label class="field-label">Last Name</label>' +
            '<input type="text" class="input-field" placeholder="Last name" required id="signup-lname" />' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:14px;">' +
          '<label class="field-label">Email Address</label>' +
          '<input type="email" class="input-field" placeholder="you@example.com" required id="signup-email" />' +
        '</div>' +
        '<div style="margin-bottom:14px;">' +
          '<label class="field-label">Password</label>' +
          '<input type="password" class="input-field" placeholder="Min. 8 characters" required minlength="8" id="signup-pass" />' +
        '</div>' +
        '<div style="margin-bottom:24px;">' +
          '<label class="field-label">Confirm Password</label>' +
          '<input type="password" class="input-field" placeholder="Re-enter password" required id="signup-confirm" />' +
        '</div>' +
        organizerFields +
        customerNotificationFields +
        '<div style="margin-bottom:24px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:10px;padding:14px;">' +
          '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:13px;color:var(--muted);">' +
            '<input type="checkbox" required style="margin-top:2px;" />' +
            '<span>I agree to the <span style="color:#9B1040;cursor:pointer;">Terms of Service</span> and <span style="color:#9B1040;cursor:pointer;">Privacy Policy</span></span>' +
          '</label>' +
        '</div>' +
        '<button type="submit" class="btn-primary" style="width:100%;justify-content:center;font-size:15px;padding:14px;">Create Account</button>' +
      '</form>' +
      '<div style="text-align:center;margin-top:20px;">' +
        '<div style="font-size:13px;color:var(--muted);">Already have an account? <button class="nav-link" style="display:inline;color:#9B1040;font-size:13px;" onclick="navigate(\'login\')">Sign In</button></div>' +
      '</div>' +
    '</div>' +
  '</div>';
}


// ============================================================
//  SIGNUP ROLE
// ============================================================
function setSignupRole(role) {
  state.signupRole = role;
  render();
}
window.setSignupRole = setSignupRole;

function setSignupNotificationsEnabled(enabled) {
  state.signupNotificationsEnabled = !!enabled;
}
window.setSignupNotificationsEnabled = setSignupNotificationsEnabled;


// ============================================================
//  SIGNUP ACTION
// ============================================================
async function doSignup(e) {
  e.preventDefault();

  var fname = document.getElementById('signup-fname').value.trim();
  var lname = document.getElementById('signup-lname').value.trim();
  var email = document.getElementById('signup-email').value.trim();
  var pass = document.getElementById('signup-pass').value;
  var confirm = document.getElementById('signup-confirm').value;
  var role = state.signupRole || 'customer';
  var organizerReasonEl = document.getElementById('signup-organizer-reason');
  var organizerProofEl = document.getElementById('signup-organizer-proof');
  var notificationToggleEl = document.getElementById('signup-notifications-enabled');
  var organizerReason = organizerReasonEl ? organizerReasonEl.value.trim() : '';
  var organizerProof = organizerProofEl && organizerProofEl.files ? organizerProofEl.files[0] : null;
  var notificationsEnabled = notificationToggleEl ? notificationToggleEl.checked : true;

  if (!fname || !lname || !email || !pass || !confirm) {
    showToast('Please fill all fields', 'error');
    return;
  }

  if (pass !== confirm) {
    showToast('Passwords do not match', 'error');
    return;
  }

  if (role === 'organizer' && !organizerReason) {
    showToast('Please tell the admin why you want organizer access', 'error');
    return;
  }

  if (role === 'organizer' && !organizerProof) {
    showToast('Please upload proof of experience or approval', 'error');
    return;
  }

  try {
    var formData = new FormData();
    formData.append('full_name', fname + ' ' + lname);
    formData.append('email', email);
    formData.append('password', pass);
    formData.append('role', role);
    formData.append('notifications_enabled', notificationsEnabled ? 'true' : 'false');
    if (role === 'organizer') {
      formData.append('organizer_reason', organizerReason);
      formData.append('organizer_proof', organizerProof);
    }

    var response = await fetch('/api/signup', {
      method: 'POST',
      body: formData
    });

    var data = await response.json();

    if (!response.ok) {
      showToast(data.message || 'Signup failed', 'error');
      return;
    }

    if (!data.was_reapplication && typeof firebaseSignUp === 'function') {
      firebaseSignUp(email, pass, fname + ' ' + lname);
    }

    if (data.requires_approval) {
      showToast(data.message || 'Organizer application submitted. Please wait for admin approval.', 'success');
      if (data.redirect_home) {
        state.signupRole = 'customer';
        state.signupNotificationsEnabled = true;
        navigate('home');
      } else {
        state.loginRole = 'organizer';
        navigate('login');
      }
    } else {
      var signedUpUser = {
        id: data.user ? data.user.id : null,
        name: fname + ' ' + lname,
        email: email,
        role: role,
        is_admin: !!(data.user && data.user.is_admin),
        approval_status: data.user && data.user.approval_status ? data.user.approval_status : 'approved',
        notifications_enabled: !!(data.user && data.user.notifications_enabled !== false)
      };
      if (typeof saveAuthUser === 'function') {
        saveAuthUser(signedUpUser);
      } else {
        state.user = signedUpUser;
      }
      state.realEvents = [];
      state.eventsLoaded = false;
      state.eventsLoading = false;

      showToast('Account created! Welcome, ' + fname + '!', 'success');
      navigate(role === 'customer' ? 'customer-dashboard' : 'home');
    }
  } catch (error) {
    console.error('SIGNUP ERROR:', error);
    showToast('Server error. Please try again.', 'error');
  }
}

window.doSignup = doSignup;
