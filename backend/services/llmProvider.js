/*
 * services/llmProvider.js — optional call to an external LLM (Anthropic
 * Claude) to phrase assistant replies. The API key lives only here, in
 * the backend process's environment (backend/.env) — it is never sent
 * to, or readable from, the frontend. See js/api/apiClient.js's own
 * comment for the same rule applied to LinkedIn.
 *
 * If ASSISTANT_LLM_API_KEY isn't set, isConfigured() is false and
 * assistantService falls back to its built-in FAQ/knowledge answers —
 * the chatbot still works with zero external dependencies or cost.
 */

const API_KEY = process.env.ASSISTANT_LLM_API_KEY || "";
const MODEL = process.env.ASSISTANT_LLM_MODEL || "claude-haiku-4-5-20251001";
const API_URL = "https://api.anthropic.com/v1/messages";
const REQUEST_TIMEOUT_MS = 12000;

function isConfigured() {
  return Boolean(API_KEY);
}

// systemPrompt: instructions + sanitized context (already assembled by
// assistantService — never raw secrets). messages: [{role, content}].
async function complete(systemPrompt, messages) {
  if (!isConfigured()) throw new Error("Assistant LLM is not configured.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: systemPrompt,
        messages,
      }),
    });
    if (!res.ok) throw new Error(`LLM provider responded with status ${res.status}`);
    const data = await res.json();
    const text = (data.content || []).map((b) => b.text || "").join("").trim();
    if (!text) throw new Error("LLM provider returned an empty response.");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isConfigured, complete };
