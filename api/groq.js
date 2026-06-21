function sanitizeKey(raw) {
  if (!raw) return "";
  let v = String(raw).trim();
  v = v.replace(/^['"\u201c\u201d\u2018\u2019]+/, "").replace(/['"\u201c\u201d\u2018\u2019]+$/, "");
  v = v.replace(/^Bearer\s+/i, "");
  return v.trim();
}

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

  const prompt = body && body.prompt;
  const system = (body && body.system) || "You are a helpful assistant.";
  const model = (body && body.model) || "llama-3.3-70b-versatile";
  const maxTokens = (body && body.maxTokens) || 1500;
  const temperature = body && typeof body.temperature === "number" ? body.temperature : 0.9;
  const clientApiKey = body && typeof body.apiKey === "string" ? sanitizeKey(body.apiKey) : "";
  const apiKey = clientApiKey || process.env.GROQ_API_KEY;

  if (!apiKey) {
    res.status(400).json({
      error: "No Groq API key provided. Open Settings and add your key, then try again.",
    });
    return;
  }

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ error: "Missing 'prompt' text in request body." });
    return;
  }

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: model,
        temperature: temperature,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
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
