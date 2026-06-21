function sanitizeKey(raw) {
  if (!raw) return "";
  let v = String(raw).trim();
  v = v.replace(/^['"\u201c\u201d\u2018\u2019]+/, "").replace(/['"\u201c\u201d\u2018\u2019]+$/, "");
  v = v.replace(/^Bearer\s+/i, "");
  return v.trim();
}

const DEFAULT_MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct";

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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      res.status(400).json({ error: "Invalid JSON body." });
      return;
    }
  }

  const script = body && body.script;
  const contentStyle = (body && body.contentStyle) || "";
  const model = (body && body.model) || DEFAULT_MODEL;
  const clientApiKey = body && typeof body.apiKey === "string" ? sanitizeKey(body.apiKey) : "";
  const apiKey = clientApiKey || process.env.GROQ_API_KEY;

  if (!apiKey) {
    res.status(400).json({
      error: "No Groq API key provided. Open Settings and add your key, then try again.",
    });
    return;
  }

  if (!script || typeof script !== "string" || !script.trim()) {
    res.status(400).json({ error: "Missing 'script' text in request body." });
    return;
  }

  const userMessage =
    "Content Style: " + (contentStyle || "Fast-paced viral UGC") + "\n\nScript:\n" + script;

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });

    const data = await groqRes.json();

    if (!groqRes.ok) {
      const detail = (data && data.error && data.error.message) || "Groq API error";
      res.status(groqRes.status).json({ error: detail });
      return;
    }

    const result =
      (data &&
        data.choices &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content) ||
      "";

    res.status(200).json({ result: result.trim() });
  } catch (err) {
    res.status(500).json({ error: (err && err.message) || "Unexpected server error." });
  }
};
