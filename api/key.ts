import { getAnswerKey, validateAuthorCode } from "../server/logic.ts";

type Request = { method?: string; body?: { code?: string } };
type Response = { status: (code: number) => Response; json: (body: unknown) => void; setHeader: (name: string, value: string) => void };

export default function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const { code } = req.body ?? {};
  if (!validateAuthorCode(code)) return res.status(401).json({ error: "That code didn’t open the key." });
  return res.status(200).json({ answerKey: getAnswerKey() });
}
