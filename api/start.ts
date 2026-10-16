import { sampleQuestions } from "../server/logic.ts";

type Request = { method?: string; query?: { count?: string | string[] } };
type Response = { status: (code: number) => Response; json: (body: unknown) => void; setHeader: (name: string, value: string) => void };

export default function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "GET required" });
  const count = Number(Array.isArray(req.query?.count) ? req.query?.count[0] : req.query?.count);
  if (![12, 16, 32, 64, 128].includes(count)) return res.status(400).json({ error: "Choose a supported puzzle size." });
  return res.status(200).json({ questions: sampleQuestions(count) });
}
