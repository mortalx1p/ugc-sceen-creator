export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed" } });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const apiKey = authHeader.replace(/^Bearer\s+/i, "");

  if (!apiKey) {
    res.status(401).json({ error: { message: "Missing API key" } });
    return;
  }

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
    });

    const data = await groqRes.json();
    res.status(groqRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: { message: err.message || "Proxy request failed" } });
  }
}
