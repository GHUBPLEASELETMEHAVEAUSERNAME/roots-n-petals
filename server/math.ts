export type Complex = { re: number; im: number };

function tokenize(source: string): string[] {
  const normalized = source
    .replace(/[−–]/g, "-")
    .replace(/,/g, ".")
    .replace(/√/g, "sqrt")
    .replace(/sqrt(\d+(?:\.\d+)?)/gi, "sqrt($1)")
    .replace(/π/g, "pi")
    .replace(/\s+/g, "")
    .replace(/\bpi\b/g, "3.141592653589793");
  const raw = normalized.match(/sqrt|\d*\.?\d+|i|[()+\-*/^]/gi);
  if (!raw || raw.join("") !== normalized) throw new Error("Unsupported expression");
  const tokens: string[] = [];
  const endsValue = (t: string) => /^\d/.test(t) || t === "i" || t === ")";
  const beginsValue = (t: string) => /^\d/.test(t) || t === "i" || t === "(" || t === "sqrt";
  raw.forEach((token, index) => {
    const prev = raw[index - 1];
    if (prev && endsValue(prev) && beginsValue(token)) tokens.push("*");
    tokens.push(token.toLowerCase());
  });
  return tokens;
}

function add(a: Complex, b: Complex): Complex { return { re: a.re + b.re, im: a.im + b.im }; }
function sub(a: Complex, b: Complex): Complex { return { re: a.re - b.re, im: a.im - b.im }; }
function mul(a: Complex, b: Complex): Complex { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function div(a: Complex, b: Complex): Complex {
  const den = b.re * b.re + b.im * b.im;
  if (!den) throw new Error("Division by zero");
  return { re: (a.re * b.re + a.im * b.im) / den, im: (a.im * b.re - a.re * b.im) / den };
}
function sqrt(a: Complex): Complex {
  const r = Math.hypot(a.re, a.im);
  return { re: Math.sqrt(Math.max(0, (r + a.re) / 2)), im: Math.sign(a.im || 1) * Math.sqrt(Math.max(0, (r - a.re) / 2)) };
}

export function evaluate(source: string): Complex {
  const tokens = tokenize(source);
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];
  const primary = (): Complex => {
    const token = take();
    if (token === "+") return primary();
    if (token === "-") { const n = primary(); return { re: -n.re, im: -n.im }; }
    if (token === "i") return { re: 0, im: 1 };
    if (token === "sqrt") {
      if (take() !== "(") throw new Error("Expected ( after sqrt");
      const n = expression();
      if (take() !== ")") throw new Error("Expected )");
      return sqrt(n);
    }
    if (token === "(") {
      const n = expression();
      if (take() !== ")") throw new Error("Expected )");
      return n;
    }
    if (token && /^\d/.test(token)) return { re: Number(token), im: 0 };
    throw new Error("Expected a number");
  };
  const power = (): Complex => {
    let n = primary();
    if (peek() === "^") {
      take();
      const exponent = primary();
      if (exponent.im || !Number.isInteger(exponent.re) || Math.abs(exponent.re) > 8) throw new Error("Unsupported exponent");
      const base = n;
      n = { re: 1, im: 0 };
      for (let k = 0; k < Math.abs(exponent.re); k++) n = mul(n, base);
      if (exponent.re < 0) n = div({ re: 1, im: 0 }, n);
    }
    return n;
  };
  const product = (): Complex => {
    let n = power();
    while (peek() === "*" || peek() === "/") {
      const op = take(); const r = power(); n = op === "*" ? mul(n, r) : div(n, r);
    }
    return n;
  };
  function expression(): Complex {
    let n = product();
    while (peek() === "+" || peek() === "-") {
      const op = take(); const r = product(); n = op === "+" ? add(n, r) : sub(n, r);
    }
    return n;
  }
  const result = expression();
  if (i !== tokens.length || !Number.isFinite(result.re) || !Number.isFinite(result.im)) throw new Error("Invalid expression");
  return result;
}

export function parseRoots(raw: string): Complex[] {
  let value = raw
    .replace(/[−–]/g, "-")
    .replace(/\b(?:x\s*=|x\s*≈)\s*/gi, "")
    .replace(/\b(?:and)\b/gi, ",")
    .trim();
  if (!value || value.length > 180) throw new Error("Enter both roots");
  if (value.includes("±") || value.includes("∓")) {
    const symbol = value.includes("±") ? "±" : "∓";
    const [left, right] = value.split(symbol);
    if (right === undefined) throw new Error("Invalid ± expression");
    const plusFirst = symbol === "±";
    value = `${left}${plusFirst ? "+" : "-"}${right},${left}${plusFirst ? "-" : "+"}${right}`;
  }
  const pieces: string[] = [];
  let depth = 0; let start = 0;
  for (let j = 0; j < value.length; j++) {
    if (value[j] === "(") depth++;
    if (value[j] === ")") depth--;
    if (depth < 0) throw new Error("Unbalanced parentheses");
    if (depth === 0 && (value[j] === "," || value[j] === ";")) { pieces.push(value.slice(start, j)); start = j + 1; }
  }
  pieces.push(value.slice(start));
  if (pieces.length !== 2 || depth !== 0) throw new Error("Enter two roots separated by a comma");
  return pieces.map((piece) => evaluate(piece.replace(/\s/g, "")));
}

export function rootsMatch(user: Complex[], expected: Complex[]): boolean {
  if (user.length !== 2 || expected.length !== 2) return false;
  const close = (a: Complex, b: Complex) => Math.abs(a.re - b.re) < 1e-7 && Math.abs(a.im - b.im) < 1e-7;
  return (close(user[0], expected[0]) && close(user[1], expected[1])) || (close(user[0], expected[1]) && close(user[1], expected[0]));
}
