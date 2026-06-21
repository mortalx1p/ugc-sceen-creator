import { useState, useEffect, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Act as an expert UGC (User Generated Content) Director and AI Video Prompt Engineer.

I am going to give you a script for a viral social media video (TikTok/Reels/Shorts).

Your job is to break it down into a highly structured scene matrix optimized for AI video generators like Kling.

When I give you the script, you must output a Markdown table with the following 4 columns:

1. Scene #
2. Script Segment (The exact words spoken)
3. Fast UGC Duration (The exact timing based on fast-paced, high-energy social media delivery, roughly 3–5 words per second)
4. Kling AI Prompt (The copy/paste prompt for the video generator)

---

# STRICT FORMATTING RULES FOR KLING AI PROMPT COLUMN

Every generated Kling AI Prompt must follow these rules:

* ALWAYS start the prompt exactly with:

"Use this character,"

Then describe only:

* action
* facial expression
* emotion
* body movement
* interaction with objects
* environment

NEVER describe:

* hair
* hairstyle
* hair color
* clothing
* race
* gender
* age
* physical appearance

The user uses a consistent character reference image.

The AI must only generate behavior, emotion, action, framing, and environment.

---

# CAMERA STYLE RULE

Every Kling AI Prompt must ALWAYS end with this exact sentence:

"Handheld iPhone vlog style, vertical video, natural lighting, realistic UGC aesthetic."

Do not change this sentence.

Do not remove it.

---

# BACKGROUND MATCHING RULE

The environment must dynamically match the exact topic mentioned in the Script Segment.

Examples:

If the script mentions Walmart:
Generate a Walmart shopping environment.

If the script mentions Costco:
Generate a Costco warehouse environment.

If the script mentions a product:
Place the character in the correct product environment.

If the script mentions opening packages:
Generate a package-opening environment.

Never create unrelated backgrounds.

---

# SCRIPT PROCESSING RULES

When receiving a script:

1. Keep the spoken words exactly unchanged.
2. Split the script into logical visual beats.
3. Assign each beat its own scene.
4. Calculate duration using fast UGC pacing: 3–5 words per second.
5. Create one Kling prompt per scene.

---

Output ONLY the Markdown table. No preamble, no explanation, no commentary before or after the table.`;

const GROQ_MODELS = "meta-llama/llama-4-maverick-17b-128e-instruct";

const EXAMPLE_OUTPUT = [
  {
    scene: "1",
    segment: "Okay you guys, I found the best hack at Walmart",
    duration: "2–3 sec",
    prompt: "Use this character, wide-eyed and excited, mouth slightly open in disbelief, holding phone up to record, standing in front of a Walmart store entrance with bright signage visible. Handheld iPhone vlog style, vertical video, natural lighting, realistic UGC aesthetic."
  },
  {
    scene: "2",
    segment: "and nobody is talking about this",
    duration: "1–2 sec",
    prompt: "Use this character, leaning in close to camera with a conspiratorial whisper expression, eyebrows raised, finger slightly raised as if sharing a secret, inside Walmart main aisle. Handheld iPhone vlog style, vertical video, natural lighting, realistic UGC aesthetic."
  },
  {
    scene: "3",
    segment: "I'm saving literally hundreds of dollars",
    duration: "2 sec",
    prompt: "Use this character, gesturing enthusiastically with hands spread wide to emphasize the amount, beaming smile, eyes wide, standing near Walmart clearance section with yellow sale tags visible. Handheld iPhone vlog style, vertical video, natural lighting, realistic UGC aesthetic."
  }
];

// ─── MARKDOWN TABLE PARSER ─────────────────────────────────────────────────
function parseMarkdownTable(markdown) {
  const lines = markdown.trim().split("\n").filter(l => l.trim());
  const tableLines = lines.filter(l => l.includes("|"));
  if (tableLines.length < 3) return [];

  const dataRows = tableLines.filter((l, i) => {
    const trimmed = l.trim();
    if (i === 0) return false; // header
    if (/^\|[\s\-|]+\|$/.test(trimmed)) return false; // separator
    return true;
  });

  return dataRows.map((row, i) => {
    const cells = row.split("|").map(c => c.trim()).filter((c, idx) => idx > 0 && idx < row.split("|").length - 1);
    return {
      scene: cells[0] || String(i + 1),
      segment: cells[1] || "",
      duration: cells[2] || "",
      prompt: cells[3] || ""
    };
  }).filter(r => r.segment);
}

// ─── STORAGE HELPERS ───────────────────────────────────────────────────────
const STORAGE_KEY = "ugc_history";
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveHistory(history) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch {}
}

// ─── ICONS ────────────────────────────────────────────────────────────────
const Icon = {
  Clapperboard: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M4 11v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8H4Z"/>
      <path d="m4 11-.88-2.87a1 1 0 0 1 .36-1.09l1.78-1.27a1 1 0 0 1 1.1-.05L8 7l2-4 2 1-2 4 2 1 2-4 2 1-2 4 2 1"/>
      <path d="M2 11h20"/>
    </svg>
  ),
  Sparkles: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  ),
  Copy: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  Download: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="3" y2="15"/>
    </svg>
  ),
  Trash: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  ),
  Clock: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  Film: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M17 3v18"/><path d="M3 7h4"/><path d="M17 7h4"/><path d="M3 12h18"/><path d="M3 17h4"/><path d="M17 17h4"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  Zap: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  Star: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  ArrowRight: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
    </svg>
  ),
  X: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
    </svg>
  )
};

// ─── COPY BUTTON ──────────────────────────────────────────────────────────
function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handle}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
        copied
          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
          : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10 hover:text-white"
      }`}
    >
      {copied ? <Icon.Check /> : <Icon.Copy />}
      {copied ? "Copied!" : label}
    </button>
  );
}

// ─── SCENE TABLE ──────────────────────────────────────────────────────────
function SceneTable({ scenes }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            <th className="text-left px-4 py-3 text-violet-400 font-semibold w-16">#</th>
            <th className="text-left px-4 py-3 text-violet-400 font-semibold">Script Segment</th>
            <th className="text-left px-4 py-3 text-violet-400 font-semibold w-28">Duration</th>
            <th className="text-left px-4 py-3 text-violet-400 font-semibold">Kling AI Prompt</th>
          </tr>
        </thead>
        <tbody>
          {scenes.map((s, i) => (
            <tr key={i} className={`border-b border-white/5 transition-colors hover:bg-white/3 ${i % 2 === 0 ? "bg-white/2" : ""}`}>
              <td className="px-4 py-4">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-violet-500/20 text-violet-400 font-bold text-xs border border-violet-500/30">
                  {s.scene}
                </span>
              </td>
              <td className="px-4 py-4">
                <p className="text-white/90 leading-relaxed">{s.segment}</p>
              </td>
              <td className="px-4 py-4">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-pink-500/15 text-pink-400 text-xs font-medium border border-pink-500/20 whitespace-nowrap">
                  <Icon.Clock />
                  {s.duration}
                </span>
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-col gap-2">
                  <p className="text-slate-300 leading-relaxed text-xs max-w-lg">{s.prompt}</p>
                  <CopyButton text={s.prompt} label="Copy Prompt" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────
function LandingPage({ onGetStarted }) {
  return (
    <div className="min-h-screen bg-[#080812] text-white overflow-hidden">
      {/* Gradient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full bg-pink-600/8 blur-[100px]" />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] rounded-full bg-indigo-600/8 blur-[100px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
            <Icon.Clapperboard />
          </div>
          <span className="font-bold text-lg tracking-tight">UGC Director AI</span>
        </div>
        <button
          onClick={onGetStarted}
          className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm transition-all duration-200 hover:shadow-lg hover:shadow-violet-500/25"
        >
          Open Dashboard
        </button>
      </nav>

      {/* Hero */}
      <section className="relative z-10 text-center px-6 pt-20 pb-24 max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm font-medium mb-8">
          <Icon.Sparkles />
          AI-Powered Script-to-Scene Generator
        </div>
        <h1 className="text-5xl md:text-7xl font-black leading-tight tracking-tight mb-6">
          Turn scripts into
          <span className="block bg-gradient-to-r from-violet-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent">
            viral scene matrices
          </span>
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Paste your UGC script. Get a production-ready scene breakdown with exact Kling AI prompts, timing, and camera direction — instantly.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={onGetStarted}
            className="group flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-semibold text-base transition-all duration-200 hover:shadow-2xl hover:shadow-violet-500/30 hover:-translate-y-0.5"
          >
            Start Generating Free
            <Icon.ArrowRight />
          </button>
          <div className="flex items-center gap-1.5 text-slate-500 text-sm">
            <Icon.Star />
            <Icon.Star />
            <Icon.Star />
            <Icon.Star />
            <Icon.Star />
            <span className="ml-1">Trusted by 2,400+ creators</span>
          </div>
        </div>
      </section>

      {/* Workflow steps */}
      <section className="relative z-10 px-6 pb-20 max-w-6xl mx-auto">
        <p className="text-center text-slate-500 text-sm font-medium uppercase tracking-widest mb-10">How it works</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { step: "01", title: "Paste your script", body: "Drop in any TikTok, Reels, or Shorts script — product reviews, hacks, hauls, anything.", icon: <Icon.Film /> },
            { step: "02", title: "AI breaks it down", body: "Our director AI splits every beat into scenes with precise UGC timing at 3–5 words per second.", icon: <Icon.Sparkles /> },
            { step: "03", title: "Copy Kling prompts", body: "Each scene ships with a copy-paste Kling AI prompt. Upload your reference image and shoot.", icon: <Icon.Zap /> }
          ].map(({ step, title, body, icon }) => (
            <div key={step} className="relative p-6 rounded-2xl bg-white/3 border border-white/8 hover:border-violet-500/30 transition-all duration-300 group">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-4xl font-black text-white/5 select-none">{step}</span>
                <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center text-violet-400 border border-violet-500/20">
                  {icon}
                </div>
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Example output */}
      <section className="relative z-10 px-6 pb-24 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-slate-500 text-sm font-medium uppercase tracking-widest mb-2">Example output</p>
          <h2 className="text-3xl font-bold">What you get for every script</h2>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/2 p-1 overflow-hidden">
          <SceneTable scenes={EXAMPLE_OUTPUT} />
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 pb-24 max-w-3xl mx-auto text-center">
        <div className="p-10 rounded-3xl bg-gradient-to-b from-violet-900/40 to-pink-900/20 border border-violet-500/20">
          <h2 className="text-3xl font-bold mb-4">Ready to direct your next viral video?</h2>
          <p className="text-slate-400 mb-8">No credit card needed. Start generating scene matrices in seconds.</p>
          <button
            onClick={onGetStarted}
            className="px-8 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-semibold text-base transition-all duration-200 hover:shadow-2xl hover:shadow-violet-500/30"
          >
            Open Dashboard →
          </button>
        </div>
      </section>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────
function Dashboard({ onGoHome, apiKey, setApiKey }) {
  const [tab, setTab] = useState("generate"); // generate | history
  const [contentStyle, setContentStyle] = useState("");
  const [script, setScript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scenes, setScenes] = useState([]);
  const [rawMarkdown, setRawMarkdown] = useState("");
  const [history, setHistory] = useState(loadHistory);
  const [showApiInput, setShowApiInput] = useState(false);
  const [localApiKey, setLocalApiKey] = useState(apiKey);

  const wordCount = script.trim().split(/\s+/).filter(Boolean).length;
  const canGenerate = script.trim().length > 10;

  const handleSaveKey = () => {
    setApiKey(localApiKey.trim());
    setShowApiInput(false);
  };

  const generate = async () => {
    if (!canGenerate) return;
    if (!apiKey) { setShowApiInput(true); return; }

    setLoading(true);
    setError("");
    setScenes([]);
    setRawMarkdown("");

    const userMessage = `Content Style: ${contentStyle || "Fast-paced viral UGC"}\n\nScript:\n${script}`;

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: GROQ_MODELS,
          max_tokens: 4096,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage }
          ]
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const markdown = data.choices?.[0]?.message?.content || "";
      const parsed = parseMarkdownTable(markdown);

      setRawMarkdown(markdown);
      setScenes(parsed);

      // Save to history
      const entry = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        contentStyle: contentStyle || "Fast-paced viral UGC",
        scriptPreview: script.slice(0, 120) + (script.length > 120 ? "…" : ""),
        scenes: parsed,
        markdown
      };
      const newHistory = [entry, ...history].slice(0, 50);
      setHistory(newHistory);
      saveHistory(newHistory);

    } catch (e) {
      setError(e.message || "Something went wrong. Check your API key and try again.");
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!scenes.length) return;
    const header = ["Scene #", "Script Segment", "Duration", "Kling AI Prompt"];
    const rows = scenes.map(s => [s.scene, `"${s.segment.replace(/"/g, '""')}"`, s.duration, `"${s.prompt.replace(/"/g, '""')}"`]);
    const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "ugc-scene-matrix.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportMarkdown = () => {
    if (!rawMarkdown) return;
    const blob = new Blob([rawMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "ugc-scene-matrix.md"; a.click();
    URL.revokeObjectURL(url);
  };

  const deleteHistory = (id) => {
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    saveHistory(updated);
  };

  const loadFromHistory = (entry) => {
    setScenes(entry.scenes);
    setRawMarkdown(entry.markdown);
    setContentStyle(entry.contentStyle);
    setTab("generate");
  };

  return (
    <div className="min-h-screen bg-[#080812] text-white">
      {/* Gradient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-violet-600/8 blur-[120px]" />
        <div className="absolute top-1/2 -right-40 w-[400px] h-[400px] rounded-full bg-pink-600/6 blur-[100px]" />
      </div>

      {/* API Key modal */}
      {showApiInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-md bg-[#111128] rounded-2xl border border-white/10 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Enter Groq API Key</h3>
              <button onClick={() => setShowApiInput(false)} className="text-slate-500 hover:text-white">
                <Icon.X />
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              Get your free API key at <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-violet-400 underline">console.groq.com</a>. Your key is stored locally only.
            </p>
            <input
              type="password"
              value={localApiKey}
              onChange={e => setLocalApiKey(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSaveKey()}
              placeholder="gsk_..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 text-sm mb-4 focus:outline-none focus:border-violet-500/50"
            />
            <button
              onClick={handleSaveKey}
              className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 font-semibold text-sm transition-colors"
            >
              Save & Continue
            </button>
          </div>
        </div>
      )}

      {/* Sidebar + Main */}
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-60 flex-shrink-0 border-r border-white/8 flex flex-col fixed h-full z-10 bg-[#080812]">
          <div className="p-5 border-b border-white/8">
            <button onClick={onGoHome} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
                <Icon.Clapperboard />
              </div>
              <span className="font-bold text-base tracking-tight">UGC Director</span>
            </button>
          </div>
          <nav className="p-3 flex-1">
            {[
              { id: "generate", label: "Generate", icon: <Icon.Sparkles /> },
              { id: "history", label: "History", icon: <Icon.Clock /> }
            ].map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 mb-1 ${
                  tab === id
                    ? "bg-violet-600/20 text-violet-300 border border-violet-500/20"
                    : "text-slate-500 hover:text-white hover:bg-white/5"
                }`}
              >
                {icon}
                {label}
                {id === "history" && history.length > 0 && (
                  <span className="ml-auto text-xs bg-white/10 text-slate-400 px-2 py-0.5 rounded-full">
                    {history.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-white/8">
            <button
              onClick={() => { setLocalApiKey(apiKey); setShowApiInput(true); }}
              className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
              </svg>
              {apiKey ? "Update API Key" : "Set API Key"}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="ml-60 flex-1 p-6 lg:p-8 relative z-0">
          {tab === "generate" && (
            <div className="max-w-5xl mx-auto">
              <div className="mb-8">
                <h1 className="text-2xl font-bold mb-1">Script Generator</h1>
                <p className="text-slate-500 text-sm">Paste your script and get a full Kling-ready scene matrix.</p>
              </div>

              {/* Input card */}
              <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
                <div className="mb-5">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Content Style</label>
                  <input
                    type="text"
                    value={contentStyle}
                    onChange={e => setContentStyle(e.target.value)}
                    placeholder="e.g. Fast-paced retail exposure / shopping hack"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-violet-500/50 transition-colors"
                  />
                </div>
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-300">Your Script</label>
                    <span className="text-xs text-slate-600">{wordCount} words</span>
                  </div>
                  <textarea
                    value={script}
                    onChange={e => setScript(e.target.value)}
                    placeholder="Okay you guys, I found the best hack at Walmart and nobody is talking about this..."
                    rows={8}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-violet-500/50 transition-colors resize-none leading-relaxed"
                  />
                </div>
                {error && (
                  <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {error}
                  </div>
                )}
                <button
                  onClick={generate}
                  disabled={loading || !canGenerate}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${
                    loading || !canGenerate
                      ? "bg-white/5 text-slate-600 cursor-not-allowed"
                      : "bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white hover:shadow-lg hover:shadow-violet-500/25"
                  }`}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Generating scenes…
                    </>
                  ) : (
                    <>
                      <Icon.Sparkles />
                      Generate Scene Matrix
                    </>
                  )}
                </button>
              </div>

              {/* Results */}
              {scenes.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-bold text-lg">Scene Matrix</h2>
                      <p className="text-slate-500 text-sm">{scenes.length} scenes generated</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={exportMarkdown}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Icon.Download />
                        Export .md
                      </button>
                      <button
                        onClick={exportCSV}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Icon.Download />
                        Export CSV
                      </button>
                      <CopyButton text={rawMarkdown} label="Copy All" />
                    </div>
                  </div>
                  <SceneTable scenes={scenes} />
                </div>
              )}
            </div>
          )}

          {tab === "history" && (
            <div className="max-w-5xl mx-auto">
              <div className="mb-8">
                <h1 className="text-2xl font-bold mb-1">Generation History</h1>
                <p className="text-slate-500 text-sm">{history.length} saved generations.</p>
              </div>
              {history.length === 0 ? (
                <div className="text-center py-20 text-slate-600">
                  <Icon.Clock />
                  <p className="mt-4 text-base">No history yet. Generate your first scene matrix.</p>
                  <button onClick={() => setTab("generate")} className="mt-4 text-violet-400 hover:text-violet-300 text-sm underline">
                    Go to generator
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map(entry => (
                    <div key={entry.id} className="bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-violet-500/20 transition-colors group">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-xs text-slate-600">{entry.date}</span>
                            <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 text-xs border border-violet-500/20">
                              {entry.scenes.length} scenes
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-400 text-xs border border-pink-500/20 truncate max-w-40">
                              {entry.contentStyle}
                            </span>
                          </div>
                          <p className="text-slate-300 text-sm leading-relaxed truncate">{entry.scriptPreview}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => loadFromHistory(entry)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600/20 text-violet-400 border border-violet-500/20 hover:bg-violet-600/30 transition-colors"
                          >
                            <Icon.Film />
                            View
                          </button>
                          <button
                            onClick={() => deleteHistory(entry.id)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Icon.Trash />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("landing"); // landing | dashboard
  const [apiKey, setApiKey] = useState(() => {
    try { return localStorage.getItem("ugc_groq_key") || ""; } catch { return ""; }
  });

  const handleSetApiKey = (key) => {
    setApiKey(key);
    try { localStorage.setItem("ugc_groq_key", key); } catch {}
  };

  return page === "landing" ? (
    <LandingPage onGetStarted={() => setPage("dashboard")} />
  ) : (
    <Dashboard
      onGoHome={() => setPage("landing")}
      apiKey={apiKey}
      setApiKey={handleSetApiKey}
    />
  );
}
