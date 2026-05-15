export default async function handler(request, response) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

    if (!apiKey) {
      return response.status(500).json({ ok: false, error: "GEMINI_API_KEY is missing in Vercel environment variables." });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Reply with only: Gemini test working" }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 30 }
        })
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      return response.status(500).json({
        ok: false,
        gemini_status: geminiRes.status,
        gemini_error: data.error || data
      });
    }

    const reply = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim();

    return response.status(200).json({ ok: true, model, reply: reply || data });
  } catch (error) {
    return response.status(500).json({ ok: false, error: error.message });
  }
}
