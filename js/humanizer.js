'use strict';

/* ============================================================
   SCRIPT HUMANIZER MODULE
   Reads the API key/model from the shared shell (window app.js).
   Keeps its own accent setting, since that's specific to this tool.
   ============================================================ */

window.Humanizer = (function () {
  const $$ = (id) => document.getElementById(id);
  const ACCENT_STORAGE = 'creatorToolkit.humanizer.accent';

  let els = {};

  function cacheEls() {
    els = {
      accentSelect: $$('h-accent'),
      inputScript: $$('h-inputScript'),
      outputScript: $$('h-outputScript'),
      inputStats: $$('h-inputStats'),
      outputStats: $$('h-outputStats'),
      generateBtn: $$('h-generateBtn'),
      copyBtn: $$('h-copyBtn'),
      downloadBtn: $$('h-downloadBtn'),
      errorMsg: $$('h-errorMsg'),
      recDot: $$('h-recDot'),
      vuMeter: $$('h-vuMeter'),
    };
  }

  function countWords(text) {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }

  function formatTime(words) {
    const totalSeconds = Math.round((words / 150) * 60); // ~150 wpm spoken pace
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function updateStats(textarea, statsEl) {
    const words = countWords(textarea.value);
    statsEl.textContent = words + ' word' + (words === 1 ? '' : 's') + ' · ' + formatTime(words);
  }

  function showError(msg) {
    els.errorMsg.textContent = msg;
    els.errorMsg.hidden = false;
  }
  function clearError() {
    els.errorMsg.hidden = true;
    els.errorMsg.textContent = '';
  }

  async function humanizeScript(script, apiKey, model, accent) {
    const response = await fetch('/api/humanize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script, apiKey, model, accent }),
    });

    let data = {};
    try {
      data = await response.json();
    } catch (e) {
      throw new Error('Server returned an unreadable response (status ' + response.status + ').');
    }

    if (!response.ok) {
      throw new Error(data.error || 'Request failed (status ' + response.status + ').');
    }

    return (data.result || '').trim();
  }

  async function onGenerateClick() {
    clearError();
    const apiKey = getApiKey();
    const model = getModel();
    const accent = els.accentSelect.value || 'none';
    const script = els.inputScript.value.trim();

    if (!apiKey) {
      showError('Add your Groq API key first — click "No Groq key" up top to open Settings.');
      return;
    }
    if (!script) {
      showError('Paste a script into Take 1 first.');
      return;
    }

    els.generateBtn.disabled = true;
    els.generateBtn.setAttribute('aria-busy', 'true');
    els.generateBtn.textContent = 'Rolling tape…';
    els.vuMeter.classList.add('active');
    els.recDot.classList.add('recording');
    els.recDot.classList.remove('printed');

    try {
      const result = await humanizeScript(script, apiKey, model, accent);
      els.outputScript.value = result;
      updateStats(els.outputScript, els.outputStats);
      els.recDot.classList.remove('recording');
      els.recDot.classList.add('printed');
      setTimeout(() => els.recDot.classList.remove('printed'), 1800);
    } catch (err) {
      showError(err.message || 'Something went wrong talking to the server.');
      els.recDot.classList.remove('recording');
    } finally {
      els.generateBtn.disabled = false;
      els.generateBtn.removeAttribute('aria-busy');
      els.generateBtn.textContent = 'Generate Take 2';
      els.vuMeter.classList.remove('active');
    }
  }

  async function onCopyClick() {
    if (!els.outputScript.value.trim()) return;
    try {
      await navigator.clipboard.writeText(els.outputScript.value);
      const original = els.copyBtn.textContent;
      els.copyBtn.textContent = 'Copied';
      setTimeout(() => { els.copyBtn.textContent = original; }, 1400);
    } catch (e) {
      showError('Could not copy automatically — select the text and copy it manually.');
    }
  }

  function onDownloadClick() {
    if (!els.outputScript.value.trim()) return;
    const blob = new Blob([els.outputScript.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'humanized-script.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function init() {
    cacheEls();
    els.accentSelect.value = localStorage.getItem(ACCENT_STORAGE) || 'none';
    els.accentSelect.addEventListener('change', () => {
      localStorage.setItem(ACCENT_STORAGE, els.accentSelect.value);
    });

    els.inputScript.addEventListener('input', () => updateStats(els.inputScript, els.inputStats));
    updateStats(els.inputScript, els.inputStats);
    updateStats(els.outputScript, els.outputStats);

    els.generateBtn.addEventListener('click', onGenerateClick);
    els.copyBtn.addEventListener('click', onCopyClick);
    els.downloadBtn.addEventListener('click', onDownloadClick);
  }

  function onActivate() {
    /* nothing needed right now, hook for future use */
  }

  return { init, onActivate };
})();
