// ============================================================
//  THEME
// ============================================================
(function() {
  var saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  // body class applied in state.js after <body> exists
})();

function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme') || 'dark';
  var next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.body.classList.toggle('light-mode', next === 'light');
  localStorage.setItem('theme', next);
  var btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = next === 'dark' ? '\uD83C\uDF19' : '\u2600\uFE0F';
}
window.toggleTheme = toggleTheme;
