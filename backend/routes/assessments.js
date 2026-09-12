/*
 * routes/assessments.js — student skill-assessment endpoints, backed
 * by backend/db/assessments.js (SQLite `assessments` +
 * `skill_assessment_results` tables). Only the authenticated student
 * can ever read/create their own assessments — user_id always comes
 * from the session, never from the request body or URL.
 *
 * SECURITY: the score/proficiency is never accepted from the browser.
 * The client (js/engine.js Assessment.scoreAssessment) already scores
 * the same way for instant UI feedback, but the *persisted* score is
 * independently recomputed here from the raw answers against
 * backend/data/assessmentQuestions.json (the same id/category/answer
 * key as js/data.js ASSESSMENT_QUESTIONS) — a tampered request body
 * claiming an inflated score cannot change what gets stored.
 */

const assessments = require("../db/assessments");
const { readJsonBody } = require("../utils/body");
const questionKey = require("../data/assessmentQuestions.json");

const MAX_ASSESSMENT_TYPE_LENGTH = 50;
const MAX_ANSWER_LENGTH = 200;
const DEFAULT_ASSESSMENT_TYPE = "skill_assessment";

function requireStudent(ctx) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  if (ctx.user.role !== "Student") return { status: 403, body: { error: "Only students can access this endpoint." } };
  return null;
}

function skillResultsToMap(skillResultRows) {
  const map = {};
  for (const r of skillResultRows) map[r.skill_name] = r.score;
  return map;
}

function toClientShape(row, skillResultRows) {
  return {
    id: row.id,
    assessmentType: row.assessment_type,
    score: row.score,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    skillScores: skillResultsToMap(skillResultRows),
  };
}

// Recomputes overall + per-category scores from raw answers, exactly
// mirroring js/engine.js Assessment.calculateOverallScore/
// calculateSkillScores, so a stored record can never diverge from
// what the questions/answer key actually supports.
function scoreAnswers(answers) {
  const total = questionKey.length;
  const categories = [...new Set(questionKey.map((q) => q.category))];
  let correctOverall = 0;
  const perCategory = {};
  for (const category of categories) perCategory[category] = { correct: 0, total: 0 };

  for (const q of questionKey) {
    const isCorrect = answers[String(q.id)] === q.answer;
    if (isCorrect) correctOverall++;
    perCategory[q.category].total++;
    if (isCorrect) perCategory[q.category].correct++;
  }

  const overallScore = total > 0 ? Math.round((correctOverall / total) * 100) : 0;
  const skillResults = Object.entries(perCategory).map(([category, { correct, total: catTotal }]) => ({
    skillName: category,
    score: catTotal > 0 ? Math.round((correct / catTotal) * 100) : 0,
  }));
  return { overallScore, skillResults };
}

function validateAnswers(answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return "Expected an 'answers' object.";
  const keys = Object.keys(answers);
  if (keys.length > questionKey.length * 2) return "Too many answers submitted.";
  for (const key of keys) {
    const value = answers[key];
    if (value !== null && value !== undefined && (typeof value !== "string" || value.length > MAX_ANSWER_LENGTH)) {
      return `Answer for question ${key} is invalid.`;
    }
  }
  return null;
}

function listAssessments(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const rows = assessments.listByStudentUserId(ctx.user.id);
  const shaped = rows.map((row) => toClientShape(row, assessments.getSkillResults(row.id)));
  ctx.sendJson(200, { assessments: shaped });
}

function getAssessment(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const assessmentId = Number(ctx.params.assessmentId);
  if (!Number.isInteger(assessmentId) || assessmentId <= 0) return ctx.sendJson(400, { error: "Invalid assessment id." });

  const row = assessments.findById(assessmentId);
  if (!row || row.student_user_id !== ctx.user.id) return ctx.sendJson(404, { error: "Assessment not found." });
  ctx.sendJson(200, { assessment: toClientShape(row, assessments.getSkillResults(assessmentId)) });
}

async function createAssessment(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }

  const answersError = validateAnswers(body.answers);
  if (answersError) return ctx.sendJson(400, { error: answersError });

  let assessmentType = body.assessmentType ?? DEFAULT_ASSESSMENT_TYPE;
  if (typeof assessmentType !== "string" || assessmentType.length > MAX_ASSESSMENT_TYPE_LENGTH) {
    return ctx.sendJson(400, { error: `assessmentType must be text of ${MAX_ASSESSMENT_TYPE_LENGTH} characters or fewer.` });
  }

  const { overallScore, skillResults } = scoreAnswers(body.answers);
  const created = assessments.create(ctx.user.id, { assessmentType, score: overallScore, skillResults });
  ctx.sendJson(201, { assessment: toClientShape(created, created.skillResults) });
}

module.exports = { listAssessments, getAssessment, createAssessment };
