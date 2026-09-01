// ------------------------------------------------------------------
// Avaliador de expressões aritméticas simples (sem eval).
// Suporta + - * / × ÷ ( ) e % (percentual: "100+10%" = 110).
// Vírgula e ponto são aceitos como separador decimal.
// ------------------------------------------------------------------

export interface CalcResult {
  ok: boolean;
  /** Resultado arredondado em 2 casas (só quando ok). */
  value?: number;
  /** Expressão normalizada para exibição, ex: "12,50 × 3 + 8". */
  normalized?: string;
  error?: string;
}

type Token =
  | { t: "num"; v: number }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "pct" }
  | { t: "(" }
  | { t: ")" };

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Há algum operador/parêntese que caracterize uma expressão (e não um número simples)? */
export function isExpression(input: string): boolean {
  const body = input.trim().replace(/^[-+]/, "");
  return /[+\-*/x×÷()%]/i.test(body);
}

function tokenize(input: string): Token[] | null {
  const s = input.replace(/\s+/g, "").replace(/[x×]/gi, "*").replace(/÷/g, "/");
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.,]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.,]/.test(s[j])) j++;
      const rawNum = s.slice(i, j);
      // separador decimal: usa o último . ou , como decimal, remove os demais
      const lastSep = Math.max(rawNum.lastIndexOf(","), rawNum.lastIndexOf("."));
      let normalized: string;
      if (lastSep === -1) {
        normalized = rawNum;
      } else {
        const intPart = rawNum.slice(0, lastSep).replace(/[.,]/g, "");
        const decPart = rawNum.slice(lastSep + 1).replace(/[.,]/g, "");
        normalized = decPart ? `${intPart}.${decPart}` : intPart;
      }
      const v = Number(normalized);
      if (!Number.isFinite(v)) return null;
      tokens.push({ t: "num", v });
      i = j;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "%") {
      tokens.push({ t: "pct" });
      i++;
      continue;
    }
    if (c === "(" || c === ")") {
      tokens.push({ t: c });
      i++;
      continue;
    }
    return null;
  }
  return tokens;
}

/** Parser recursivo descendente com precedência. */
function parse(tokens: Token[]): number | null {
  let pos = 0;

  const peek = () => tokens[pos];

  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    while (true) {
      const tk = peek();
      if (tk && tk.t === "op" && (tk.v === "+" || tk.v === "-")) {
        pos++;
        const right = parseTerm();
        if (right === null) return null;
        // percentual relativo: 100 + 10% = 110
        const applied = pendingPct ? (left * right) / 100 : right;
        pendingPct = false;
        left = tk.v === "+" ? left + applied : left - applied;
      } else break;
    }
    return left;
  }

  let pendingPct = false;

  function parseTerm(): number | null {
    let left = parseUnary();
    if (left === null) return null;
    while (true) {
      const tk = peek();
      if (tk && tk.t === "op" && (tk.v === "*" || tk.v === "/")) {
        pos++;
        const right = parseUnary();
        if (right === null) return null;
        if (tk.v === "/") {
          if (right === 0) return null;
          left = left / right;
        } else {
          left = left * right;
        }
      } else break;
    }
    return left;
  }

  function parseUnary(): number | null {
    const tk = peek();
    if (tk && tk.t === "op" && (tk.v === "-" || tk.v === "+")) {
      pos++;
      const v = parseUnary();
      if (v === null) return null;
      return tk.v === "-" ? -v : v;
    }
    return parsePostfix();
  }

  function parsePostfix(): number | null {
    const v = parsePrimary();
    if (v === null) return null;
    const tk = peek();
    if (tk && tk.t === "pct") {
      pos++;
      pendingPct = true;
      return v;
    }
    return v;
  }

  function parsePrimary(): number | null {
    const tk = peek();
    if (!tk) return null;
    if (tk.t === "num") {
      pos++;
      return tk.v;
    }
    if (tk.t === "(") {
      pos++;
      const savedPct = pendingPct;
      pendingPct = false;
      const v = parseExpr();
      pendingPct = savedPct;
      if (v === null) return null;
      const close = peek();
      if (!close || close.t !== ")") return null;
      pos++;
      return v;
    }
    return null;
  }

  const result = parseExpr();
  if (result === null || pos !== tokens.length) return null;
  return result;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Reescreve a expressão em forma legível: "12,5*3" → "12,5 × 3". */
export function normalizeExpression(input: string): string {
  const tokens = tokenize(input);
  if (!tokens) return input.trim();
  const symbols: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };
  return tokens
    .map((t) => {
      if (t.t === "num") return fmt(t.v);
      if (t.t === "op") return symbols[t.v];
      if (t.t === "pct") return "%";
      return t.t;
    })
    .join(" ")
    .replace(/\(\s/g, "(")
    .replace(/\s\)/g, ")")
    .trim();
}

/** Avalia a expressão. Retorna `ok: false` quando inválida ou negativa. */
export function evaluateExpression(input: string): CalcResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, error: "Expressão vazia" };
  const tokens = tokenize(raw);
  if (!tokens || tokens.length === 0) return { ok: false, error: "Expressão inválida" };
  const value = parse(tokens);
  if (value === null || !Number.isFinite(value)) return { ok: false, error: "Expressão inválida" };
  return { ok: true, value: round2(value), normalized: normalizeExpression(raw) };
}

/** Formata o resultado no padrão usado pelo campo de moeda (sem "R$"). */
export function formatResultForCurrencyInput(value: number): string {
  return Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
