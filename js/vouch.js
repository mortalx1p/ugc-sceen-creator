'use strict';

/* ============================================================
   VOUCH COMMENTS AI MODULE
   Ported from the standalone tool. Key/model now come from the
   shared shell. Groq calls go through /api/groq (generic proxy)
   instead of hitting Groq directly from the browser.
   ============================================================ */

window.Vouch = (function () {
  const $$ = (id) => document.getElementById(id);
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const TC = {
    curious: '#60A5FA', skeptical: '#FBBF24', excited: '#34D399', funny: '#A78BFA',
    relatable: '#F472B6', vouch: '#36D6A6', experience: '#2DD4BF', question: '#FCD34D',
    starter: '#67E8F9', storytelling: '#FB923C',
  };
  const BD = {
    viral: { i: '🔥', l: 'Viral Potential', c: '#F59E0B' },
    conversation_starter: { i: '💬', l: 'Conversation Starter', c: '#60A5FA' },
    highly_realistic: { i: '✅', l: 'Highly Realistic', c: '#34D399' },
  };

  const S = {
    platform: 'TikTok', count: 10,
    mix: { curious: 30, skeptical: 20, excited: 20, funny: 15, vouch: 15 },
    dna: null, comments: [], threads: [], ttype: 'viewers',
  };

  let els = {};

  function cacheEls() {
    els = {
      platformSelect: $$('v-platformSelect'),
      captionInput: $$('v-captionInput'),
      existingInput: $$('v-existingInput'),
      countRow: $$('v-countRow'),
      mixWrap: $$('v-mixWrap'),
      analyzeBtn: $$('v-analyzeBtn'),
      genWrap: $$('v-genWrap'),
      generateBtn: $$('v-generateBtn'),
      genCount: $$('v-genCount'),
      threadsTabBtn: $$('v-threadsTabBtn'),
      threadsWrap: $$('v-threadsWrap'),
      errorBox: $$('v-errorBox'),
      loaderBar: $$('v-loaderBar'),
      loaderText: $$('v-loaderText'),
      dnaOut: $$('v-dnaOut'),
      resultsOut: $$('v-resultsOut'),
      commentCount: $$('v-commentCount'),
      copyAllBtn: $$('v-copyAllBtn'),
      commentList: $$('v-commentList'),
      typeViewers: $$('v-type-viewers'),
      typeCreator: $$('v-type-creator'),
      creatorHandle: $$('v-creatorHandle'),
      generateThreadsBtn: $$('v-generateThreadsBtn'),
      threadList: $$('v-threadList'),
      rewriteInput: $$('v-rewriteInput'),
      runRewriteBtn: $$('v-runRewriteBtn'),
      rewriteOut: $$('v-rewriteOut'),
    };
  }

  /* ---------- UI helpers ---------- */

  function showErr(m) {
    els.errorBox.textContent = m;
    els.errorBox.hidden = false;
    els.errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function clearErr() { els.errorBox.hidden = true; }
  function showLdr(m) {
    els.loaderText.textContent = m;
    els.loaderBar.hidden = false;
    [els.analyzeBtn, els.generateBtn, els.generateThreadsBtn].forEach((b) => { if (b) b.disabled = true; });
  }
  function hideLdr() {
    els.loaderBar.hidden = true;
    [els.analyzeBtn, els.generateBtn, els.generateThreadsBtn].forEach((b) => { if (b) b.disabled = false; });
  }
  function flash(el, msg, ms) {
    if (!el) return;
    const o = el.textContent;
    el.textContent = msg;
    el.classList.add('ok');
    setTimeout(() => { el.textContent = o; el.classList.remove('ok'); }, ms || 1600);
  }

  /* ---------- Groq call (through the generic proxy) ---------- */

  async function ask(prompt, system, maxTokens, attempt) {
    attempt = attempt || 1;
    const apiKey = getApiKey();
    const model = getModel();
    if (!apiKey) throw new Error('No Groq API key set — click "No Groq key" up top to open Settings.');

    const res = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system, prompt, model, apiKey, maxTokens, temperature: 0.9 }),
    });

    let d = {};
    try { d = await res.json(); } catch (e) { /* leave d empty */ }

    if (!res.ok) {
      const msg = (d && d.error) || ('Error ' + res.status);
      if (res.status === 429 && attempt <= 3) {
        const w = attempt * 6000;
        els.loaderText.textContent = 'Rate limit — retrying in ' + (w / 1000) + 's… (' + attempt + '/3)';
        await sleep(w);
        return ask(prompt, system, maxTokens, attempt + 1);
      }
      if (res.status === 401) throw new Error('Invalid API key — check it in Settings up top.');
      if (res.status === 429) throw new Error('Rate limited after 3 retries. Wait 60s.');
      throw new Error(msg);
    }

    const text = d && d.result;
    if (!text) throw new Error('Empty response. Try again.');
    return text;
  }

  function parseJ(raw) {
    let t = raw.replace(/```(?:json)?\n?/g, '').trim();
    try { return JSON.parse(t); } catch (e) { /* fall through */ }
    const m = t.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (m) { try { return JSON.parse(m[0]); } catch (e) { /* fall through */ } }
    const a = t.match(/\[([\s\S]*)/);
    if (a) {
      let s = a[0];
      const o = (s.match(/\[/g) || []).length;
      const c = (s.match(/\]/g) || []).length;
      for (let i = c; i < o; i++) s += ']';
      try { return JSON.parse(s); } catch (e) { /* fall through */ }
    }
    throw new Error('Could not parse response. Try again.');
  }

  /* ---------- settings: count + mix ---------- */

  function buildCountRow() {
    els.countRow.innerHTML = [10, 20, 30, 50].map((n) =>
      '<button type="button" class="chip' + (n === S.count ? ' on' : '') + '" data-count="' + n + '">' + n + '</button>'
    ).join('');
    els.countRow.querySelectorAll('[data-count]').forEach((btn) => {
      btn.addEventListener('click', () => {
        S.count = parseInt(btn.dataset.count, 10);
        els.countRow.querySelectorAll('.chip').forEach((b) => b.classList.remove('on'));
        btn.classList.add('on');
        els.genCount.textContent = S.count;
      });
    });
  }

  function buildMix() {
    els.mixWrap.innerHTML = '';
    Object.entries(S.mix).forEach(([type, val]) => {
      const color = TC[type] || 'var(--accent-vouch)';
      const row = document.createElement('div');
      row.className = 'mix-row';
      row.innerHTML =
        '<span class="mix-type" style="color:' + color + '">' + type + '</span>' +
        '<input type="range" min="0" max="60" step="5" value="' + val + '" class="mix-slider" data-type="' + type + '" style="accent-color:' + color + '">' +
        '<span class="mix-value">' + val + '%</span>';
      els.mixWrap.appendChild(row);
      const slider = row.querySelector('.mix-slider');
      const valueLabel = row.querySelector('.mix-value');
      slider.addEventListener('input', () => {
        S.mix[type] = parseInt(slider.value, 10);
        valueLabel.textContent = slider.value + '%';
      });
    });
  }

  /* ---------- tabs ---------- */

  function switchTab(name) {
    ['comments', 'threads', 'rewrite'].forEach((t) => {
      $$('v-tab-' + t).classList.toggle('on', t === name);
      $$('v-pan-' + t).hidden = t !== name;
    });
    els.resultsOut.hidden = false;
  }

  function setTType(t) {
    S.ttype = t;
    els.typeViewers.classList.toggle('on', t === 'viewers');
    els.typeCreator.classList.toggle('on', t === 'creator');
  }

  /* ---------- analyze ---------- */

  async function runAnalyze() {
    const cap = els.captionInput.value.trim();
    const ex = els.existingInput.value.trim();
    S.platform = els.platformSelect.value;
    if (!cap) { showErr('Enter a post caption first.'); return; }
    clearErr();
    showLdr('Detecting tone, slang, emoji patterns and conversation DNA…');
    els.dnaOut.hidden = true;
    els.resultsOut.hidden = true;
    S.dna = null;

    const p = 'Analyze comment DNA for this ' + S.platform + ' post.\nPOST: ' + cap +
      (ex ? '\nEXISTING COMMENTS:\n' + ex : '') +
      '\n\nReturn ONLY valid JSON:\n{"tone":"...","audience":"...","slangLevel":"Low|Medium|High","emojiUsage":"None|Low|Medium|High","confidence":88,"capitalization":"...","punctuationStyle":"...","patterns":["p1","p2","p3","p4","p5","p6"],"commonOpenings":["o1","o2"],"conversationStyle":"..."}';

    try {
      const raw = await ask(p, 'You are an expert social media linguist. Return ONLY valid JSON. Nothing else.', 900);
      S.dna = parseJ(raw);
      renderDNA(S.dna);
      els.genWrap.hidden = false;
      els.threadsWrap.hidden = false;
      els.dnaOut.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      showErr('Analysis failed: ' + e.message);
    } finally {
      hideLdr();
    }
  }

  function renderDNA(d) {
    els.dnaOut.hidden = false;
    const LC = {
      High: ['#34D399', 'rgba(52,211,153,.10)'], Medium: ['#FBBF24', 'rgba(251,191,36,.10)'],
      Low: ['#60A5FA', 'rgba(96,165,250,.10)'], None: ['#6B7280', 'rgba(107,114,128,.08)'],
    };
    const [sc, sbg] = LC[d.slangLevel] || LC.Medium;
    const [ec, ebg] = LC[d.emojiUsage] || LC.Medium;
    const CK = ['Tone Detected', 'Audience Detected', 'Slang Level', 'Comment Structure', 'Conversation Patterns', 'Writing Style'];
    const pts = (d.patterns || []).map((p) => '<span class="pattern-tag">✓ ' + esc(p) + '</span>').join('');

    els.dnaOut.innerHTML =
      '<div class="card">' +
        '<div class="dna-head"><div class="dna-blip"></div><span class="dna-title">Comment DNA Analysis</span></div>' +
        '<div class="dna-checklist">' + CK.map((c, i) =>
          '<div class="dna-check" id="v-dc' + i + '"><span class="dna-check-mark">✓</span><span class="dna-check-label">' + c + '</span></div>'
        ).join('') + '</div>' +
        '<div class="dna-grid">' +
          '<div class="dna-lozenge"><div class="dna-lozenge-label">Tone</div><div class="dna-lozenge-value">' + esc(d.tone) + '</div></div>' +
          '<div class="dna-lozenge"><div class="dna-lozenge-label">Audience</div><div class="dna-lozenge-value">' + esc(d.audience) + '</div></div>' +
          '<div class="dna-lozenge" style="background:' + sbg + ';border-color:' + sc + '30"><div class="dna-lozenge-label">Slang Level</div><div class="dna-lozenge-value" style="color:' + sc + '">' + esc(d.slangLevel) + '</div></div>' +
          '<div class="dna-lozenge" style="background:' + ebg + ';border-color:' + ec + '30"><div class="dna-lozenge-label">Emoji Usage</div><div class="dna-lozenge-value" style="color:' + ec + '">' + esc(d.emojiUsage) + '</div></div>' +
        '</div>' +
        '<div class="confidence-row"><span class="field-label" style="margin:0">Realism Confidence</span><span class="confidence-value">' + d.confidence + '%</span></div>' +
        '<div class="confidence-track"><div class="confidence-fill" id="v-confBar"></div></div>' +
        '<span class="field-label">Patterns Learned</span><div class="pattern-row">' + pts + '</div>' +
      '</div>';

    CK.forEach((_, i) => setTimeout(() => { const el = $$('v-dc' + i); if (el) el.classList.add('on'); }, 100 + i * 200));
    setTimeout(() => { const f = $$('v-confBar'); if (f) f.style.width = d.confidence + '%'; }, 300);
  }

  /* ---------- generate comments ---------- */

  async function runGenerate() {
    if (!S.dna) { showErr('Run DNA Analysis first.'); return; }
    clearErr();
    els.commentList.innerHTML = '';
    els.commentCount.textContent = '';
    const cap = els.captionInput.value.trim();
    const mx = Object.entries(S.mix).filter(([, v]) => v > 0).map(([k, v]) => v + '% ' + k).join(', ');
    showLdr('Humanization engine running — generating ' + S.count + ' comments…');

    const p = 'Generate exactly ' + S.count + ' authentic ' + S.platform + ' comments.\n\nPOST: ' + cap +
      '\n\nDNA:\n- Tone: ' + S.dna.tone + '\n- Audience: ' + S.dna.audience + '\n- Slang: ' + S.dna.slangLevel +
      '\n- Emoji: ' + S.dna.emojiUsage + '\n- Patterns: ' + (S.dna.patterns || []).join(', ') +
      '\n- Style: ' + (S.dna.capitalization || 'casual') + ', ' + (S.dna.punctuationStyle || 'casual') +
      '\n\nMix: ' + mx +
      '\n\nRules:\n1. Match DNA writing style exactly\n2. Every comment = different personality\n3. NEVER use "I highly recommend" "worked perfectly" "great opportunity"\n4. Natural imperfections: missing apostrophes, casual spelling\n5. Vary lengths: some 2-5 words, some 15-20 words' +
      '\n\nReturn ONLY valid JSON array:\n[{"text":"...","type":"curious|skeptical|excited|funny|relatable|vouch|experience|question|starter|storytelling","personality":"one word","realism":85,"engagement":78,"believability":90,"badges":[]}]\n\nBadges only if deserved: "viral","conversation_starter","highly_realistic"';

    try {
      const raw = await ask(p, 'Generate hyper-realistic social media comments. Return ONLY valid JSON array. Nothing else.', Math.min(S.count * 90 + 600, 4000));
      S.comments = parseJ(raw);
      if (!Array.isArray(S.comments) || !S.comments.length) throw new Error('No comments returned. Try again.');
      els.commentCount.textContent = S.comments.length + ' comments generated';
      els.commentList.innerHTML = S.comments.map((c, i) => commentHTML(c, i)).join('');
      els.resultsOut.hidden = false;
      switchTab('comments');
      els.resultsOut.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      showErr('Generation failed: ' + e.message);
    } finally {
      hideLdr();
    }
  }

  function scoreMeter(label, value, color) {
    return '<div class="meter-row"><div class="meter-head"><span class="meter-label">' + label + '</span><span class="meter-value">' + value + '%</span></div>' +
      '<div class="meter-track"><div class="meter-fill" style="width:' + value + '%;background:' + color + '"></div></div></div>';
  }

  function commentHTML(c, i) {
    const col = TC[c.type] || 'var(--accent-vouch)';
    const r = c.realism || 85, e = c.engagement || 78, b = c.believability || 90;
    const badges = (c.badges || []).filter((x) => BD[x]).map((x) =>
      '<span class="badge-chip" style="background:' + BD[x].c + '18;color:' + BD[x].c + ';border:1px solid ' + BD[x].c + '30">' + BD[x].i + ' ' + BD[x].l + '</span>'
    ).join('');
    return '<div class="comment-card" style="border-left:3px solid ' + col + '">' +
      '<div class="comment-top"><div class="comment-body">' +
        '<div class="comment-meta"><span class="comment-type" style="background:' + col + '20;color:' + col + '">' + esc(c.type || 'comment') + '</span>' +
        (c.personality ? '<span class="comment-personality">' + esc(c.personality) + '</span>' : '') + '</div>' +
        '<div class="comment-text">' + esc(c.text) + '</div></div>' +
        '<button class="comment-copy" id="v-cb' + i + '" data-copy-index="' + i + '">Copy</button></div>' +
      '<div class="score-grid">' + scoreMeter('Realism', r, 'var(--accent-vouch)') + scoreMeter('Engagement', e, '#34D399') + scoreMeter('Believability', b, '#F472B6') + '</div>' +
      (badges ? '<div class="badge-row">' + badges + '</div>' : '') +
      '</div>';
  }

  /* ---------- threads ---------- */

  async function runThreads() {
    if (!S.dna) { showErr('Run DNA Analysis first.'); return; }
    clearErr();
    els.threadList.innerHTML = '';
    const cap = els.captionInput.value.trim();
    const handle = els.creatorHandle.value.trim() || 'Creator';
    const isCreator = S.ttype === 'creator';
    S.platform = els.platformSelect.value;
    showLdr(isCreator ? 'Building creator reply threads…' : 'Building viewer conversation threads…');

    const viewerPrompt = 'Create 5 realistic ' + S.platform + ' comment threads where VIEWERS talk to each other — no creator.\n\nPOST: ' + cap +
      '\nDNA: Tone=' + S.dna.tone + ', Slang=' + S.dna.slangLevel + ', Audience=' + S.dna.audience +
      '\nPatterns: ' + (S.dna.patterns || []).join(', ') + '\nStyle: ' + (S.dna.capitalization || 'casual') +
      '\n\nEach thread = 1 main viewer comment + 3-5 viewer replies. Real organic conversation. Match DNA exactly.' +
      '\n\nReturn ONLY valid JSON:\n[{"main":{"text":"..."},"replies":[{"text":"...","replies":[{"text":"...","replies":[]}]}]}]';

    const creatorPrompt = 'Create 5 realistic ' + S.platform + ' comment threads where creator "' + handle + '" replies to viewers.\n\nPOST: ' + cap +
      '\nDNA: Tone=' + S.dna.tone + ', Slang=' + S.dna.slangLevel + ', Audience=' + S.dna.audience +
      '\nPatterns: ' + (S.dna.patterns || []).join(', ') +
      '\n\nStructure: viewer comment → creator reply → viewer reactions.\nMark creator replies with "isCreator":true.\nCreator replies: warm, brief, genuine — not corporate.' +
      '\n\nReturn ONLY valid JSON:\n[{"main":{"text":"...","isCreator":false},"replies":[{"text":"...","isCreator":true,"replies":[{"text":"...","isCreator":false,"replies":[]}]}]}]';

    try {
      const raw = await ask(isCreator ? creatorPrompt : viewerPrompt, 'Generate realistic social media threads. Return ONLY valid JSON.', 2500);
      S.threads = parseJ(raw);
      if (!Array.isArray(S.threads)) throw new Error('Unexpected format. Try again.');
      els.threadList.innerHTML = S.threads.map((t) => '<div class="card" style="margin-bottom:12px">' + threadHTML(t, 0, handle) + '</div>').join('');
    } catch (e) {
      showErr('Thread generation failed: ' + e.message);
    } finally {
      hideLdr();
    }
  }

  function threadHTML(n, depth, handle) {
    const txt = n.text || (n.main && n.main.text) || '';
    const isCreator = n.isCreator || (n.main && n.main.isCreator) || false;
    const replies = n.replies || [];
    const badge = isCreator ? '<span class="thread-author">✦ ' + esc(handle) + '</span>' : '';
    const lineClass = isCreator ? 'thread-card thread-creator-line' : 'thread-card';
    return '<div><div class="' + lineClass + '">' + (depth > 0 ? '<span class="thread-arrow">↳</span>' : '') + badge + esc(txt) + '</div>' +
      (replies.length ? '<div class="thread-children">' + replies.map((r) => threadHTML(r, depth + 1, handle)).join('') + '</div>' : '') + '</div>';
  }

  /* ---------- rewrite ---------- */

  async function runRewrite() {
    if (!S.dna) { showErr('Run DNA Analysis first.'); return; }
    const inp = els.rewriteInput.value.trim();
    if (!inp) { showErr('Paste comments to rewrite.'); return; }
    clearErr();
    els.rewriteOut.innerHTML = '';
    showLdr('Rewriting to match Comment DNA…');

    const p = 'Rewrite these comments to match this DNA. Keep meaning, improve realism.\n\nDNA: Tone=' + S.dna.tone +
      ', Slang=' + S.dna.slangLevel + ', Patterns=' + (S.dna.patterns || []).join(', ') + ', Style=' + (S.dna.capitalization || 'casual') +
      '\n\nCOMMENTS:\n' + inp + '\n\nReturn ONLY valid JSON:\n[{"original":"...","rewritten":"..."}]';

    try {
      const raw = await ask(p, 'Rewrite social media comments to match DNA. Return ONLY valid JSON.', 1500);
      const rw = parseJ(raw);
      if (!Array.isArray(rw)) throw new Error('Unexpected format.');
      els.rewriteOut.innerHTML = rw.map((r) =>
        '<div class="card rewrite-pair">' +
          '<div class="rewrite-block"><span class="rewrite-label" style="color:var(--text-faint)">Original</span><div class="rewrite-original">' + esc(r.original) + '</div></div>' +
          '<div class="rewrite-block"><span class="rewrite-label" style="color:var(--good)">✓ Rewritten</span><div class="rewrite-new">' + esc(r.rewritten) + '</div></div>' +
        '</div>'
      ).join('');
    } catch (e) {
      showErr('Rewrite failed: ' + e.message);
    } finally {
      hideLdr();
    }
  }

  /* ---------- copy / export ---------- */

  function cpAll() {
    if (!S.comments.length) return;
    navigator.clipboard.writeText(S.comments.map((c) => c.text).join('\n')).then(() => flash(els.copyAllBtn, '✓ Copied!'));
  }
  function cpOne(i, id) {
    const c = S.comments[i];
    if (!c) return;
    navigator.clipboard.writeText(c.text).then(() => flash($$(id), '✓'));
  }
  function dl(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function expTXT() {
    if (!S.comments.length) return;
    dl('vouch-comments.txt', S.comments.map((c, i) => (i + 1) + '. ' + c.text).join('\n\n'), 'text/plain');
  }
  function expCSV() {
    if (!S.comments.length) return;
    dl('vouch-comments.csv', '#,Type,Personality,Comment,Realism,Engagement,Believability\n' +
      S.comments.map((c, i) => [i + 1, c.type || '', c.personality || '', '"' + (c.text || '').replace(/"/g, '""') + '"', c.realism || '', c.engagement || '', c.believability || ''].join(',')).join('\n'), 'text/csv');
  }

  /* ---------- boot ---------- */

  function init() {
    cacheEls();
    buildCountRow();
    buildMix();

    els.platformSelect.addEventListener('change', () => { S.platform = els.platformSelect.value; });
    els.analyzeBtn.addEventListener('click', runAnalyze);
    els.generateBtn.addEventListener('click', runGenerate);
    els.threadsTabBtn.addEventListener('click', () => switchTab('threads'));
    els.generateThreadsBtn.addEventListener('click', runThreads);
    els.runRewriteBtn.addEventListener('click', runRewrite);
    els.copyAllBtn.addEventListener('click', cpAll);
    $$('v-expTxtBtn').addEventListener('click', expTXT);
    $$('v-expCsvBtn').addEventListener('click', expCSV);
    els.typeViewers.addEventListener('click', () => setTType('viewers'));
    els.typeCreator.addEventListener('click', () => setTType('creator'));
    ['comments', 'threads', 'rewrite'].forEach((t) => {
      $$('v-tab-' + t).addEventListener('click', () => switchTab(t));
    });
    els.commentList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-copy-index]');
      if (!btn) return;
      cpOne(parseInt(btn.dataset.copyIndex, 10), btn.id);
    });
  }

  function onActivate() {
    /* nothing needed right now, hook for future use */
  }

  return { init, onActivate };
})();
