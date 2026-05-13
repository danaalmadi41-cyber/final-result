// ============================================================
//  VIEW: LOGIN
// ============================================================
function renderLogin() {
  var roles = ['customer', 'organizer', 'entry_staff'];
  var roleLabels = ['Attendee', 'Organizer', 'Staff'];
  var isStaffLogin = (state.loginRole || 'customer') === 'entry_staff';

  return '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;position:relative;overflow:hidden;background:var(--dark);">' +
    '<div class="grid-bg"></div>' +
    '<div style="position:absolute;inset:0;background:radial-gradient(ellipse 700px 500px at 30% 50%,rgba(155,16,64,0.1) 0%,transparent 70%),radial-gradient(ellipse 500px 400px at 70% 40%,rgba(255,180,0,0.07) 0%,transparent 60%);pointer-events:none;"></div>' +

    '<div class="card" style="width:100%;max-width:420px;padding:36px;position:relative;z-index:1;background:rgba(255,255,255,0.06);backdrop-filter:blur(16px);">' +
      '<div style="text-align:center;margin-bottom:28px;">' +
        '<div style="display:flex;justify-content:center;align-items:center;margin-bottom:18px;">' +
          '<img src="' + LOGO + '" alt="Crowd Analyzing" style="display:block;width:112px;max-width:34vw;height:auto;" />' +
        '</div>' +
        '<h1 style="font-family:\'Montserrat\',sans-serif;font-weight:800;font-size:22px;margin-bottom:6px;">Welcome Back</h1>' +
        '<p style="color:var(--muted);font-size:14px;">Sign in to continue to Crowd Analyzing</p>' +
      '</div>' +

      '<div style="margin-bottom:24px;">' +
        '<div class="tab-bar" id="role-tabs">' +
          roles.map(function(r, i) {
            return '<button type="button" class="tab-btn ' + (state.loginRole === r ? 'active' : '') + '" onclick="setLoginRole(\'' + r + '\')">' + roleLabels[i] + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +

      '<form onsubmit="doLogin(event)" id="login-form">' +
        '<div style="margin-bottom:16px;">' +
          '<label class="field-label">' + (isStaffLogin ? 'Staff ID or Email' : 'Email Address') + '</label>' +
          '<input type="text" class="input-field" placeholder="' + (isStaffLogin ? 'Enter your staff ID' : 'you@example.com') + '" required id="login-email" />' +
        '</div>' +

        '<div style="margin-bottom:24px;">' +
          '<label class="field-label">Password</label>' +
          '<input type="password" class="input-field" placeholder="********" required id="login-password" />' +
        '</div>' +

        '<button type="submit" class="btn-primary" style="width:100%;justify-content:center;font-size:15px;padding:14px;">Sign In</button>' +
      '</form>' +

      '<div style="text-align:center;margin-top:20px;display:flex;flex-direction:column;gap:10px;">' +
        (!isStaffLogin
          ? '<button class="nav-link" style="font-size:13px;" onclick="openForgotPasswordModal()">Forgot Password?</button>'
          : '') +
        (!isStaffLogin
          ? '<div style="font-size:13px;color:var(--muted);">Do not have an account? <button class="nav-link" style="display:inline;color:#9B1040;font-size:13px;" onclick="navigate(\'signup\')">Create Account</button></div>'
          : '') +
      '</div>' +
    '</div>' +
  '</div>';
}


// ============================================================
//  LOGIN ROLE
// ============================================================
function setLoginRole(role) {
  state.loginRole = role;
  render();
}
window.setLoginRole = setLoginRole;


// ============================================================
//  FORGOT PASSWORD
// ============================================================
function openForgotPasswordModal() {
  if ((state.loginRole || 'customer') === 'entry_staff') {
    showToast('Password reset is not available for staff accounts', 'error');
    return;
  }

  closeForgotPasswordModal();

  var currentEmail = '';
  var emailField = document.getElementById('login-email');
  if (emailField && emailField.value) {
    currentEmail = emailField.value.trim();
  }

  var role = state.loginRole || 'customer';
  var roleLabel = role === 'organizer' ? 'organizer' : 'attendee';

  document.body.insertAdjacentHTML('beforeend',
    '<div id="forgot-password-modal" onclick="handleForgotPasswordOverlayClick(event)" style="position:fixed;inset:0;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;z-index:3200;padding:18px;">' +
      '<div class="card" style="width:100%;max-width:430px;padding:24px;">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;">' +
          '<div>' +
            '<div style="font-family:\'Montserrat\',sans-serif;font-size:24px;font-weight:900;letter-spacing:-0.02em;">Reset Password</div>' +
            '<div style="color:var(--muted);font-size:13px;margin-top:6px;">We will email a secure reset link to your ' + roleLabel + ' account.</div>' +
          '</div>' +
          '<button class="btn-ghost" type="button" onclick="closeForgotPasswordModal()" style="padding:10px 14px;">Close</button>' +
        '</div>' +
        '<div style="margin-bottom:14px;">' +
          '<label class="field-label">Email Address</label>' +
          '<input id="forgot-password-email" class="input-field" type="email" placeholder="you@example.com" value="' + escapeHtml(currentEmail) + '" />' +
        '</div>' +
        '<div style="font-size:13px;color:var(--muted);line-height:1.8;margin-bottom:18px;">This option is available for customer and organizer accounts only. Staff passwords are managed by the organizer.</div>' +
        '<button class="btn-primary" type="button" onclick="submitForgotPasswordRequest()" style="width:100%;justify-content:center;">Send Reset Link</button>' +
      '</div>' +
    '</div>'
  );
}
window.openForgotPasswordModal = openForgotPasswordModal;

function closeForgotPasswordModal() {
  var modal = document.getElementById('forgot-password-modal');
  if (modal) modal.remove();
}
window.closeForgotPasswordModal = closeForgotPasswordModal;

function handleForgotPasswordOverlayClick(event) {
  if (event.target && event.target.id === 'forgot-password-modal') {
    closeForgotPasswordModal();
  }
}
window.handleForgotPasswordOverlayClick = handleForgotPasswordOverlayClick;

async function submitForgotPasswordRequest() {
  var emailField = document.getElementById('forgot-password-email');
  var email = emailField ? emailField.value.trim() : '';
  var role = state.loginRole || 'customer';

  if (!email) {
    showToast('Please enter your email address', 'error');
    return;
  }

  try {
    var response = await fetch('/api/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        role: role
      })
    });
    var data = await response.json();

    if (!response.ok) {
      showToast(data.message || 'Unable to send reset link', 'error');
      return;
    }

    closeForgotPasswordModal();
    showToast(data.message || 'If the account exists, a reset link has been sent.', 'success');
  } catch (error) {
    console.error('FORGOT PASSWORD ERROR:', error);
    showToast('Server error. Please try again.', 'error');
  }
}
window.submitForgotPasswordRequest = submitForgotPasswordRequest;


// ============================================================
//  LOGIN ACTION
// ============================================================
async function doLogin(e) {
  e.preventDefault();

  var email = document.getElementById('login-email').value.trim();
  var password = document.getElementById('login-password').value;
  var role = state.loginRole || 'customer';

  if (!email || !password) {
    showToast('Please fill all fields', 'error');
    return;
  }

  try {
    var response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        password: password,
        role: role
      })
    });

    var data = await response.json();

    if (!response.ok) {
      showToast(data.message || 'Login failed', 'error');
      return;
    }

    var loggedInUser = {
      id: data.user.id,
      name: data.user.full_name,
      email: data.user.email,
      role: data.user.role,
      is_admin: !!data.user.is_admin,
      approval_status: data.user.approval_status || 'approved',
      notifications_enabled: data.user.notifications_enabled !== false
    };
    if (typeof saveAuthUser === 'function') {
      saveAuthUser(loggedInUser);
    } else {
      state.user = loggedInUser;
    }

    state.realEvents = [];
    state.eventsLoaded = false;
    state.eventsLoading = false;

    if (typeof firebaseSignIn === 'function') firebaseSignIn(email, password);
    showToast('Welcome back, ' + state.user.name + '!', 'success');

    setTimeout(function() {
      if (state.user.is_admin && state.user.role !== 'organizer') {
        navigate('admin-organizers');
      } else if (state.user.role === 'organizer') {
        navigate('dashboard');
      } else if (state.user.role === 'entry_staff') {
        navigate('scan');
      } else {
        navigate('customer-dashboard');
      }
    }, 250);
  } catch (error) {
    console.error('LOGIN ERROR:', error);
    showToast('Server error. Please try again.', 'error');
  }
}
window.doLogin = doLogin;
