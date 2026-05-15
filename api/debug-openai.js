export default async function handler(request, response) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.AI_MODEL || "gpt-4o-mini";

    if (!apiKey) {
      return response.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY is missing in Vercel environment variables."
      });
    }

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: "Reply with only: OpenAI test working"
          }
        ],
        max_tokens: 20
      })
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      return response.status(500).json({
        ok: false,
        openai_status: openaiRes.status,
        openai_error: data.error || data
      });
    }

    return response.status(200).json({
      ok: true,
      model,
      reply: data.choices?.[0]?.message?.content || data
    });

  } catch (error) {
    return response.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
