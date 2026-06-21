# Creator Toolkit

A multi-tool dashboard for short-form content creators. One Groq API key, multiple tools, one shared shell.

Currently includes:
- **Script Humanizer** — turns a clean AI-written voiceover script into something that sounds like a real take, with an optional accent layer.
- **Vouch Comments AI** — analyzes a post's "Comment DNA" and generates realistic comments, reply threads, or DNA-matched rewrites.
- **UGC Director AI** — breaks a UGC script into a scene-by-scene matrix with timing and copy-paste Kling AI video prompts, built around a consistent character reference image.

## Structure

```
creator-toolkit/
├── index.html          → app shell: sidebar nav, topbar, settings modal, all tool views
├── css/
│   └── styles.css       → shared design system + per-tool styling
├── js/
│   ├── app.js           → shared state (API key/model), settings modal, tool router
│   ├── humanizer.js      → Script Humanizer module
│   ├── vouch.js           → Vouch Comments AI module
│   └── ugc.js              → UGC Director AI module
├── api/
│   ├── humanize.js       → serverless function for the Humanizer (own system prompt + accent logic)
│   ├── groq.js             → generic Groq proxy (system + prompt in, text out) — used by Vouch, and any future tool
│   └── ugc.js               → serverless function for UGC Director (own fixed system prompt)
├── package.json
└── .gitignore
```

## Deploy on Vercel

1. Push this folder to a repo, or run `vercel` from inside it with the CLI.
2. Import at vercel.com/new (or finish the CLI prompts). No environment variables required.
3. Open the deployed site, click the **gear icon** top-right, paste your Groq API key (console.groq.com/keys), and save. That key now powers every tool in the sidebar.

## Local testing

```
vercel dev
```

## How the pieces talk to each other

- `js/app.js` owns the API key and model in `localStorage`, exposed through `getApiKey()` / `getModel()` / `setApiKey()` / `setModel()`. Every tool module reads through these instead of keeping its own copy.
- `js/app.js` also owns routing: `showTool(name)` shows/hides the right `<section class="view" id="view-...">` and re-triggers its entrance animation.
- Each tool is a self-contained IIFE module (`window.Humanizer`, `window.Vouch`, `window.Ugc`) exposing `init()` (called once on page load) and `onActivate()` (called every time you switch to that tool — currently unused by all three, but there if a future tool needs to refresh data on switch).
- Humanizer and UGC Director each talk to their own dedicated endpoint (`/api/humanize`, `/api/ugc`) because they have a fixed system prompt baked in server-side. UGC Director also defaults to its own model (`meta-llama/llama-4-maverick-17b-128e-instruct`) regardless of what's set in Settings, since its markdown-table output is sensitive to model choice — pass `model` in the request body if you want to override it. Vouch talks to the generic `/api/groq` endpoint, sending its own `system` + `prompt` text per request.

## Adding a fourth tool

1. Add a sidebar entry in `index.html`: `<button class="nav-item" data-tool="yourtool">...`, and remove it from the "More tools — soon" placeholder.
2. Add `<section class="view view-yourtool" id="view-yourtool" hidden>...</section>` with your tool's markup. Set `--tool-accent` / `--tool-accent-dim` on `.view-yourtool` in `styles.css` to give it its own channel color.
3. Add `js/yourtool.js` as an IIFE exposing `window.YourTool = { init, onActivate }`, same shape as the other three. Use `getApiKey()` / `getModel()` from the shared shell.
4. Either reuse `/api/groq.js` (send `{ system, prompt, model, apiKey, maxTokens }`, get back `{ result }`) or add a dedicated `api/yourtool.js` if it needs its own baked-in prompt logic like Humanizer and UGC Director do.
5. Register it in `js/app.js`: add `'yourtool'` to the `TOOLS` array and a title to `TOOL_TITLES`.

## Customizing tone / prompts

- Humanizer's rules live in the `SYSTEM_PROMPT` constant (plus `ACCENT_BLOCKS`) at the top of `api/humanize.js`.
- UGC Director's rules live in the `SYSTEM_PROMPT` constant at the top of `api/ugc.js`.
- Vouch's prompts are built inline inside `js/vouch.js` (`runAnalyze`, `runGenerate`, `runThreads`, `runRewrite`) since they depend on the live Comment DNA — edit those functions directly.
