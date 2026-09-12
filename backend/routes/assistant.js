/*
 * routes/assistant.js — POST /api/assistant/chat for the floating AI
 * Assistant widget (js/assistant/*). Handler signature matches every
 * other route: (req, res, ctx) where ctx = { query, sendJson, logger, user }.
 */

const { readJsonBody } = require("../utils/body");
const assistantService = require("../services/assistantService");

async function chat(req, res, ctx) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }

  try {
    const result = await assistantService.handleChat(
      { message: body.message, history: body.history, context: body.context },
      ctx.logger
    );
    ctx.sendJson(200, result);
  } catch (err) {
    ctx.logger.error("POST /api/assistant/chat failed:", err.message);
    ctx.sendJson(200, { reply: "Sorry, I'm unable to connect right now. Please try again later.", opportunities: [] });
  }
}

module.exports = { chat };
