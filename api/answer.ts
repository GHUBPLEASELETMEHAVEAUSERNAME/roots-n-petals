import { checkAnswer, getAnswerKey, validateAuthorCode, validateAutoModeCode, validatePuzzleCompleteCode, validateQuestionSolveCode, validateCodeListCode, validatePuzzleRestartCode, validateScreenEffectCode, getScreenEffectText, getGameplayCodewords } from "../server/logic.ts";

type Request = { method?: string; body?: { questionId?: string; answer?: string } };
type Response = { status: (code: number) => Response; json: (body: unknown) => void; setHeader: (name: string, value: string) => void };

export default function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const { questionId, answer } = req.body ?? {};
  if (typeof questionId !== "string" || typeof answer !== "string") return res.status(400).json({ error: "Question and answer are required" });
  if (validatePuzzleCompleteCode(answer)) return res.status(200).json({ puzzleCompleted: true });
  if (validateQuestionSolveCode(answer)) return res.status(200).json({ questionSolved: true });
  if (validatePuzzleRestartCode(answer)) return res.status(200).json({ puzzleRestarted: true });
  if (validateCodeListCode(answer)) return res.status(200).json({ codewords: getGameplayCodewords() });
  if (validateScreenEffectCode(answer)) return res.status(200).json({ screenEffectText: getScreenEffectText() });
  if (validateAutoModeCode(answer)) return res.status(200).json({ autoModeUnlocked: true });
  if (validateAuthorCode(answer)) return res.status(200).json({ keyUnlocked: true, answerKey: getAnswerKey() });
  return res.status(200).json({ correct: checkAnswer(questionId, answer) });
}
