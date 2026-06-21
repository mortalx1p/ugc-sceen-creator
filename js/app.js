'use strict';

/* ============================================================
   APP SHELL — shared state, settings modal, tool router.
   Every tool module reads the API key/model through the
   functions below instead of keeping its own copy.
   ============================================================ */

const $ = (id) => document.getElementById(id);

const STORAGE = {
  apiKey: 'creatorToolkit.groqApiKey',
  model: 'creatorToolkit.groqModel',
  activeTool: 'creatorToolkit.activeTool',
};

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

function sanitizeKey(raw) {
  if (!raw) return '';
  let v = String(raw).trim();
  v = v.replace(/^['"\u201c\u201d\u2018\u2019]+/, '').replace(/['"\u201c\u201d\u2018\u2019]+$/, '');
  v = v.replace(/^Bearer\s+/i, '');
  return v.trim();
}

function getApiKey() {
  return localStorage.getItem(STORAGE.apiKey) || '';
}

function setApiKey(raw) {
  const clean = sanitizeKey(raw);
  localStorage.setItem(STORAGE.apiKey, clean);
  updateKeyStatus();
  return clean;
}

function getModel() {
  return localStorage.getItem(STORAGE.model) || DEFAULT_MODEL;
}

function setModel(raw) {
  const clean = (raw || '').trim() || DEFAULT_MODEL;
  localStorage.setItem(STORAGE.model, clean);
  return clean;
}

function updateKeyStatus() {
  const hasKey = !!getApiKey();
  document.querySelectorAll('.key-pill').forEach((pill) => {
    pill.classList.toggle('connected', hasKey);
    const label = pill.querySelector('.key-pill-label');
    if (label) label.textContent = hasKey ? 'Groq connected' : 'No Groq key';
  });
}

function keyPreviewText(raw) {
  const clean = sanitizeKey(raw);
  if (!clean) return '';
  if (clean.length < 12) return clean + ' · ' + clean.length + ' chars — looks short for a real Groq key';
  return clean.slice(0, 7) + '…' + clean.slice(-4) + ' · ' + clean.length + ' chars saved';
}

/* ---------- settings modal ---------- */

function openSettings() {
  $('settingsApiKey').value = getApiKey();
  $('settingsModel').value = getModel();
  $('settingsKeyPreview').textContent = keyPreviewText($('settingsApiKey').value);
  $('settingsOverlay').hidden = false;
  $('settingsApiKey').focus();
}

function closeSettings() {
  $('settingsOverlay').hidden = true;
}

function initSettingsModal() {
  document.querySelectorAll('.key-pill, [data-open-settings]').forEach((el) => {
    el.addEventListener('click', openSettings);
  });
  $('settingsClose').addEventListener('click', closeSettings);
  $('settingsCancel').addEventListener('click', closeSettings);
  $('settingsOverlay').addEventListener('click', (e) => {
    if (e.target === $('settingsOverlay')) closeSettings();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('settingsOverlay').hidden) closeSettings();
  });
  $('settingsApiKey').addEventListener('input', () => {
    $('settingsKeyPreview').textContent = keyPreviewText($('settingsApiKey').value);
  });
  $('settingsSave').addEventListener('click', () => {
    setApiKey($('settingsApiKey').value);
    setModel($('settingsModel').value);
    closeSettings();
  });
}

/* ---------- router ---------- */

const TOOLS = ['humanizer', 'vouch', 'ugc'];
const TOOL_TITLES = {
  humanizer: 'Script Humanizer',
  vouch: 'Vouch Comments AI',
  ugc: 'UGC Director AI',
};

function showTool(name) {
  if (!TOOLS.includes(name)) return;
  TOOLS.forEach((t) => {
    const view = $('view-' + t);
    if (!view) return;
    const match = t === name;
    view.hidden = !match;
    if (match) {
      view.classList.remove('enter');
      // restart the entrance animation
      // eslint-disable-next-line no-unused-expressions
      void view.offsetWidth;
      view.classList.add('enter');
    }
  });
  document.querySelectorAll('.nav-item[data-tool]').forEach((el) => {
    el.classList.toggle('active', el.dataset.tool === name);
  });
  $('topbarTitle').textContent = TOOL_TITLES[name] || '';
  localStorage.setItem(STORAGE.activeTool, name);

  if (name === 'humanizer' && window.Humanizer && window.Humanizer.onActivate) window.Humanizer.onActivate();
  if (name === 'vouch' && window.Vouch && window.Vouch.onActivate) window.Vouch.onActivate();
  if (name === 'ugc' && window.Ugc && window.Ugc.onActivate) window.Ugc.onActivate();
}

function initRouter() {
  document.querySelectorAll('.nav-item[data-tool]').forEach((el) => {
    el.addEventListener('click', () => showTool(el.dataset.tool));
  });
  const saved = localStorage.getItem(STORAGE.activeTool);
  showTool(TOOLS.includes(saved) ? saved : 'humanizer');
}

/* ---------- boot ---------- */

document.addEventListener('DOMContentLoaded', () => {
  if (window.Humanizer && window.Humanizer.init) window.Humanizer.init();
  if (window.Vouch && window.Vouch.init) window.Vouch.init();
  if (window.Ugc && window.Ugc.init) window.Ugc.init();
  initSettingsModal();
  initRouter();
  updateKeyStatus();
});
