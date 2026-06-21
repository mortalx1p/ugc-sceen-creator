'use strict';

/* ============================================================
   UGC DIRECTOR AI MODULE
   Turns a script into a scene-by-scene matrix with Kling AI
   video prompts. Talks to its own /api/ugc endpoint (fixed
   system prompt lives server-side, like Humanizer's).
   ============================================================ */

window.Ugc = (function () {
  const $$ = (id) => document.getElementById(id);
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const HISTORY_KEY = 'creatorToolkit.ugc.history';
  const HISTORY_LIMIT = 50;

  const S = {
    scenes: [],
    rawMarkdown: '',
    history: [],
  };

  let els = {};

  function cacheEls() {
    els = {
      subtabGenerate: $$('u-subtab-generate'),
      subtabHistory: $$('u-subtab-history'),
      subviewGenerate: $$('u-subview-generate'),
      subviewHistory: $$('u-subview-history'),
      contentStyle: $$('u-contentStyle'),
      scriptInput: $$('u-scriptInput'),
      wordCount: $$('u-wordCount'),
      generateBtn: $$('u-generateBtn'),
      errorBox: $$('u-errorBox'),
      resultsSection: $$('u-resultsSection'),
      sceneCount: $$('u-sceneCount'),
      exportMdBtn: $$('u-exportMdBtn'),
      exportCsvBtn: $$('u-exportCsvBtn'),
      copyAllBtn: $$('u-copyAllBtn'),
      sceneTableBody: $$('u-sceneTableBody'),
      historyCount: $$('u-historyCount'),
      historyList: $$('u-historyList'),
    };
  }

  /* ---------- markdown table parser (ported as-is) ---------- */

  function parseMarkdownTable(markdown) {
    const lines = markdown.trim().split('\n').filter((l) => l.trim());
    const tableLines = lines.filter((l) => l.includes('|'));
    if (tableLines.length < 3) return [];

    const dataRows = tableLines.filter((l, i) => {
      const trimmed = l.trim();
      if (i === 0) return false; // header
      if (/^\|[\s\-|]+\|$/.test(trimmed)) return false; // separator
      return true;
    });

    return dataRows
      .map((row, i) => {
        const parts = row.split('|');
        const cells = parts.map((c) => c.trim()).filter((c, idx) => idx > 0 && idx < parts.length - 1);
        return {
          scene: cells[0] || String(i + 1),
          segment: cells[1] || '',
          duration: cells[2] || '',
          prompt: cells[3] || '',
        };
      })
      .filter((r) => r.segment);
  }

  /* ---------- history storage ---------- */

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function saveHistory(history) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (e) { /* ignore */ }
  }

  /* ---------- UI helpers ---------- */

  function showError(msg) {
    els.errorBox.textContent = msg;
    els.errorBox.hidden = false;
  }
  function clearError() { els.errorBox.hidden = true; }

  function flash(el, msg, ms) {
    if (!el) return;
    const original = el.textContent;
    el.textContent = msg;
    setTimeout(() => { el.textContent = original; }, ms || 1600);
  }

  function updateWordCount() {
    const words = els.scriptInput.value.trim().split(/\s+/).filter(Boolean).length;
    els.wordCount.textContent = words + ' word' + (words === 1 ? '' : 's');
  }

  function canGenerate() {
    return els.scriptInput.value.trim().length > 10;
  }

  /* ---------- sub-tabs (Generate / History) ---------- */

  function switchSubview(name) {
    const isGenerate = name === 'generate';
    els.subtabGenerate.classList.toggle('on', isGenerate);
    els.subtabHistory.classList.toggle('on', !isGenerate);
    els.subviewGenerate.hidden = !isGenerate;
    els.subviewHistory.hidden = isGenerate;
    if (!isGenerate) renderHistory();
  }

  /* ---------- generate ---------- */

  async function runGenerate() {
    if (!canGenerate()) { showError('Paste a script with a bit more detail first.'); return; }
    const apiKey = getApiKey();
    if (!apiKey) { showError('Add your Groq API key first — click "No Groq key" up top to open Settings.'); return; }

    clearError();
    S.scenes = [];
    S.rawMarkdown = '';
    els.resultsSection.hidden = true;
    els.sceneTableBody.innerHTML = '';

    const script = els.scriptInput.value.trim();
    const contentStyle = els.contentStyle.value.trim();

    els.generateBtn.disabled = true;
    els.generateBtn.setAttribute('aria-busy', 'true');
    const originalLabel = els.generateBtn.textContent;
    els.generateBtn.textContent = 'Generating scenes…';

    try {
      const response = await fetch('/api/ugc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, contentStyle, apiKey }),
      });

      let data = {};
      try { data = await response.json(); } catch (e) { /* leave data empty */ }

      if (!response.ok) {
        throw new Error(data.error || 'Request failed (status ' + response.status + ').');
      }

      const markdown = data.result || '';
      const parsed = parseMarkdownTable(markdown);
      if (!parsed.length) throw new Error('Could not parse a scene table from the response. Try again.');

      S.rawMarkdown = markdown;
      S.scenes = parsed;
      renderScenes(parsed);
      els.resultsSection.hidden = false;
      els.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      const entry = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        contentStyle: contentStyle || 'Fast-paced viral UGC',
        scriptPreview: script.slice(0, 120) + (script.length > 120 ? '…' : ''),
        scenes: parsed,
        markdown,
      };
      S.history = [entry, ...S.history].slice(0, HISTORY_LIMIT);
      saveHistory(S.history);
    } catch (err) {
      showError(err.message || 'Something went wrong. Check your API key and try again.');
    } finally {
      els.generateBtn.disabled = false;
      els.generateBtn.removeAttribute('aria-busy');
      els.generateBtn.textContent = originalLabel;
    }
  }

  function renderScenes(scenes) {
    els.sceneCount.textContent = scenes.length + ' scene' + (scenes.length === 1 ? '' : 's') + ' generated';
    els.sceneTableBody.innerHTML = scenes.map((s, i) => sceneRowHTML(s, i)).join('');
  }

  function sceneRowHTML(s, i) {
    return '<tr>' +
      '<td><span class="scene-badge">' + esc(s.scene) + '</span></td>' +
      '<td><p class="scene-segment">' + esc(s.segment) + '</p></td>' +
      '<td><span class="scene-duration">⏱ ' + esc(s.duration) + '</span></td>' +
      '<td><p class="scene-prompt">' + esc(s.prompt) + '</p>' +
        '<button class="comment-copy" type="button" data-copy-prompt="' + i + '">Copy Prompt</button></td>' +
      '</tr>';
  }

  /* ---------- export / copy ---------- */

  function copyAll() {
    if (!S.rawMarkdown) return;
    navigator.clipboard.writeText(S.rawMarkdown).then(() => flash(els.copyAllBtn, '✓ Copied!'));
  }

  function copyPrompt(i, btn) {
    const s = S.scenes[i];
    if (!s) return;
    navigator.clipboard.writeText(s.prompt).then(() => flash(btn, '✓'));
  }

  function dl(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportMarkdown() {
    if (!S.rawMarkdown) return;
    dl('ugc-scene-matrix.md', S.rawMarkdown, 'text/markdown');
  }

  function exportCSV() {
    if (!S.scenes.length) return;
    const header = ['Scene #', 'Script Segment', 'Duration', 'Kling AI Prompt'];
    const rows = S.scenes.map((s) => [
      s.scene,
      '"' + s.segment.replace(/"/g, '""') + '"',
      s.duration,
      '"' + s.prompt.replace(/"/g, '""') + '"',
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    dl('ugc-scene-matrix.csv', csv, 'text/csv');
  }

  /* ---------- history ---------- */

  function renderHistory() {
    els.historyCount.textContent = S.history.length + ' saved generation' + (S.history.length === 1 ? '' : 's') + '.';
    if (!S.history.length) {
      els.historyList.innerHTML =
        '<div class="history-empty">' +
          '<p>No history yet. Generate your first scene matrix.</p>' +
        '</div>';
      return;
    }
    els.historyList.innerHTML = S.history.map((entry) => historyCardHTML(entry)).join('');
  }

  function historyCardHTML(entry) {
    return '<div class="history-card">' +
      '<div class="history-top">' +
        '<div style="flex:1; min-width:0;">' +
          '<div class="history-meta">' +
            '<span class="history-date">' + esc(entry.date) + '</span>' +
            '<span class="history-tag" style="background:rgba(178,134,245,0.12);border-color:rgba(178,134,245,0.3);color:var(--accent-ugc)">' + entry.scenes.length + ' scenes</span>' +
            '<span class="history-tag" style="background:rgba(255,255,255,0.05);border-color:var(--border);color:var(--text-muted)">' + esc(entry.contentStyle) + '</span>' +
          '</div>' +
          '<p class="history-preview">' + esc(entry.scriptPreview) + '</p>' +
        '</div>' +
        '<div class="history-actions">' +
          '<button class="btn btn-ghost btn-sm" type="button" data-load-history="' + entry.id + '">View</button>' +
          '<button class="icon-btn" type="button" data-delete-history="' + entry.id + '" aria-label="Delete">🗑</button>' +
        '</div>' +
      '</div></div>';
  }

  function loadFromHistory(id) {
    const entry = S.history.find((h) => h.id === id);
    if (!entry) return;
    S.scenes = entry.scenes;
    S.rawMarkdown = entry.markdown;
    els.contentStyle.value = entry.contentStyle;
    renderScenes(entry.scenes);
    els.resultsSection.hidden = false;
    switchSubview('generate');
  }

  function deleteFromHistory(id) {
    S.history = S.history.filter((h) => h.id !== id);
    saveHistory(S.history);
    renderHistory();
  }

  /* ---------- boot ---------- */

  function init() {
    cacheEls();
    S.history = loadHistory();

    els.scriptInput.addEventListener('input', updateWordCount);
    updateWordCount();

    els.generateBtn.addEventListener('click', runGenerate);
    els.copyAllBtn.addEventListener('click', copyAll);
    els.exportMdBtn.addEventListener('click', exportMarkdown);
    els.exportCsvBtn.addEventListener('click', exportCSV);

    els.subtabGenerate.addEventListener('click', () => switchSubview('generate'));
    els.subtabHistory.addEventListener('click', () => switchSubview('history'));

    els.sceneTableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-copy-prompt]');
      if (!btn) return;
      copyPrompt(parseInt(btn.dataset.copyPrompt, 10), btn);
    });

    els.historyList.addEventListener('click', (e) => {
      const loadBtn = e.target.closest('[data-load-history]');
      if (loadBtn) { loadFromHistory(parseInt(loadBtn.dataset.loadHistory, 10)); return; }
      const delBtn = e.target.closest('[data-delete-history]');
      if (delBtn) { deleteFromHistory(parseInt(delBtn.dataset.deleteHistory, 10)); }
    });
  }

  function onActivate() {
    /* nothing needed right now, hook for future use */
  }

  return { init, onActivate };
})();
