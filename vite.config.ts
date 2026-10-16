import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { checkAnswer, sampleQuestions, validateAuthorCode, validateAutoModeCode, validatePuzzleCompleteCode, validateQuestionSolveCode, validateCodeListCode, validatePuzzleRestartCode, validateScreenEffectCode, getScreenEffectText, getGameplayCodewords, getAnswerKey } from "./server/logic.ts";

async function bodyJson(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  let text = "";
  for await (const chunk of req) text += chunk;
  try { return JSON.parse(text || "{}"); } catch { return {}; }
}

function localApi(): Plugin {
  return {
    name: "local-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        if (!url.pathname.startsWith("/api/")) return next();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        try {
          if (url.pathname === "/api/start" && req.method === "GET") {
            const count = Number(url.searchParams.get("count"));
            if (![12, 16, 32, 64, 128].includes(count)) {
              res.statusCode = 400; res.end(JSON.stringify({ error: "Choose a supported puzzle size." })); return;
            }
            res.end(JSON.stringify({ questions: sampleQuestions(count) })); return;
          }
          const body = await bodyJson(req);
          if (url.pathname === "/api/answer" && req.method === "POST") {
            if (validatePuzzleCompleteCode(body.answer)) { res.end(JSON.stringify({ puzzleCompleted: true })); return; }
            if (validateQuestionSolveCode(body.answer)) { res.end(JSON.stringify({ questionSolved: true })); return; }
            if (validatePuzzleRestartCode(body.answer)) { res.end(JSON.stringify({ puzzleRestarted: true })); return; }
            if (validateCodeListCode(body.answer)) { res.end(JSON.stringify({ codewords: getGameplayCodewords() })); return; }
            if (validateScreenEffectCode(body.answer)) { res.end(JSON.stringify({ screenEffectText: getScreenEffectText() })); return; }
            if (validateAutoModeCode(body.answer)) { res.end(JSON.stringify({ autoModeUnlocked: true })); return; }
            if (validateAuthorCode(body.answer)) { res.end(JSON.stringify({ keyUnlocked: true, answerKey: getAnswerKey() })); return; }
            const correct = typeof body.questionId === "string" && typeof body.answer === "string" && checkAnswer(body.questionId, body.answer);
            res.end(JSON.stringify({ correct })); return;
          }
          if (url.pathname === "/api/key" && req.method === "POST") {
            if (!validateAuthorCode(body.code)) { res.statusCode = 401; res.end(JSON.stringify({ error: "That code didn’t open the key." })); return; }
            res.end(JSON.stringify({ answerKey: getAnswerKey() })); return;
          }
          res.statusCode = 404; res.end(JSON.stringify({ error: "Not found" }));
        } catch {
          res.statusCode = 500; res.end(JSON.stringify({ error: "Something went wrong." }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (env.AUTHOR_KEY_CODE) process.env.AUTHOR_KEY_CODE = env.AUTHOR_KEY_CODE;
  if (env.AUTO_MODE_CODE) process.env.AUTO_MODE_CODE = env.AUTO_MODE_CODE;
  if (env.PUZZLE_COMPLETE_CODE) process.env.PUZZLE_COMPLETE_CODE = env.PUZZLE_COMPLETE_CODE;
  for (const name of ["QUESTION_SOLVE_CODE", "CODE_LIST_CODE", "PUZZLE_RESTART_CODE", "SCREEN_EFFECT_CODE", "SCREEN_EFFECT_TEXT"]) {
    if (env[name]) process.env[name] = env[name];
  }
  return { plugins: [react(), localApi()], server: { port: 5173 } };
});
