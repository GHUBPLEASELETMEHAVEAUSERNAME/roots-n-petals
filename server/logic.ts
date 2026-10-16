import questionData from "../src/data/questions.json" with { type: "json" };
import { parseRoots, rootsMatch } from "./math.ts";
import { readFileSync } from "node:fs";

export type PublicQuestion = { id: string; function: string; kind: string };
const questions = questionData as PublicQuestion[];

function loadAnswers(): Record<string, string[]> {
  if (process.env.ANSWER_KEY_JSON) {
    return JSON.parse(process.env.ANSWER_KEY_JSON) as Record<string, string[]>;
  }
  try {
    return JSON.parse(readFileSync(new URL("./answerKey.private.json", import.meta.url), "utf8")) as Record<string, string[]>;
  } catch {
    throw new Error("Missing private answer key. Set ANSWER_KEY_JSON on the server.");
  }
}

const answers = loadAnswers();

const QUESTION_MIX = [
  { kind: "imaginary", numerator: 2, accepts: (question: PublicQuestion) => question.kind === "complex" },
  { kind: "distinct-real", numerator: 4, accepts: (question: PublicQuestion) => question.kind === "real" || question.kind === "irrational" },
  { kind: "repeated", numerator: 6, accepts: (question: PublicQuestion) => question.kind === "repeated" },
] as const;

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getQuestionCounts(count: number): number[] {
  const allocations = QUESTION_MIX.map((group) => {
    const exact = count * group.numerator / 12;
    return { base: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = count - allocations.reduce((sum, item) => sum + item.base, 0);
  const priority = allocations
    .map((allocation, index) => ({ index, remainder: allocation.remainder }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of priority) {
    if (remaining <= 0) break;
    allocations[index].base++;
    remaining--;
  }
  return allocations.map((item) => item.base);
}

export function sampleQuestions(count: number): PublicQuestion[] {
  const counts = getQuestionCounts(count);
  const selected: PublicQuestion[] = [];
  for (const [index, group] of QUESTION_MIX.entries()) {
    const pool = questions.filter(group.accepts);
    if (pool.length < counts[index]) {
      throw new Error(`The ${group.kind} question pool is too small for a ${count}-piece puzzle.`);
    }
    selected.push(...shuffled(pool).slice(0, counts[index]));
  }
  return shuffled(selected);
}

export function checkAnswer(id: string, input: string): boolean {
  const expected = answers[id];
  if (!expected || typeof input !== "string") return false;
  try {
    return rootsMatch(parseRoots(input), expected.map(parseRootsSingle));
  } catch {
    return false;
  }
}

function parseRootsSingle(source: string) {
  // Each stored root is one expression, so evaluate it through the same safe parser.
  return parseRoots(`${source},${source}`)[0];
}

export function getAnswerKey() {
  return questions.map((question) => ({ ...question, roots: answers[question.id] }));
}

export function validateAuthorCode(code: unknown): boolean {
  const secret = process.env.AUTHOR_KEY_CODE;
  if (typeof code !== "string" || !secret || code.length > 160) return false;
  const normalize = (value: string) => value.trim().toUpperCase().replace(/[\s_-]+/g, "");
  const words = secret.trim().toUpperCase().split(/[\s_-]+/).filter(Boolean);
  const alias = words.filter((word) => word !== "OF" && word !== "THE").reverse().join("");
  const candidate = Buffer.from(normalize(code));
  return [normalize(secret), alias].some((value) => {
    const expected = Buffer.from(value);
    return candidate.length === expected.length && expected.length > 0 && timingSafeEqual(candidate, expected);
  });
}

export function validateAutoModeCode(code: unknown): boolean {
  return validateConfiguredCode(code, process.env.AUTO_MODE_CODE);
}

export function validatePuzzleCompleteCode(code: unknown): boolean {
  return validateConfiguredCode(code, process.env.PUZZLE_COMPLETE_CODE);
}

export function validateQuestionSolveCode(code: unknown): boolean {
  return validateConfiguredCode(code, process.env.QUESTION_SOLVE_CODE);
}

export function validateCodeListCode(code: unknown): boolean {
  return validateConfiguredCode(code, process.env.CODE_LIST_CODE);
}

export function validatePuzzleRestartCode(code: unknown): boolean {
  return validateConfiguredCode(code, process.env.PUZZLE_RESTART_CODE);
}

export function validateScreenEffectCode(code: unknown): boolean {
  return validateConfiguredCode(code, process.env.SCREEN_EFFECT_CODE);
}

export function getScreenEffectText(): string {
  return (process.env.SCREEN_EFFECT_TEXT || "WORDS").slice(0, 80);
}

export function getGameplayCodewords(): { label: string; code: string }[] {
  const entries: [string, string | undefined][] = [
    ["Solve one question", process.env.QUESTION_SOLVE_CODE],
    ["List codewords", process.env.CODE_LIST_CODE],
    ["Restart this puzzle", process.env.PUZZLE_RESTART_CODE],
    ["Unlock Auto mode", process.env.AUTO_MODE_CODE],
    ["Complete the puzzle", process.env.PUZZLE_COMPLETE_CODE],
    ["Screen effect", process.env.SCREEN_EFFECT_CODE],
  ];
  const result = entries.filter(([, code]) => Boolean(code)).map(([label, code]) => ({ label, code: code! }));
  const authorCode = process.env.AUTHOR_KEY_CODE?.trim();
  if (authorCode) {
    result.push({ label: "Open the answer key", code: authorCode.replace(/[_-]+/g, " ") });
    const alternate = authorCode.toUpperCase().split(/[\s_-]+/).filter((word) => word && word !== "OF" && word !== "THE").reverse().join(" ");
    if (alternate) result.push({ label: "Alternate answer-key code", code: alternate });
  }
  return result;
}

function validateConfiguredCode(code: unknown, secret: string | undefined): boolean {
  if (typeof code !== "string" || !secret || code.length > 160) return false;
  const normalize = (value: string) => value.trim().toUpperCase().replace(/[\s_-]+/g, "");
  const candidate = Buffer.from(normalize(code));
  const expected = Buffer.from(normalize(secret));
  return candidate.length === expected.length && expected.length > 0 && timingSafeEqual(candidate, expected);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
