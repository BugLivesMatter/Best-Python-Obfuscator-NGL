import type { Token } from './tokenizer';
import { prevMeaningful, nextMeaningful } from './analyzer';

// ─── F-string expression renaming ─────────────────────────────────────────────

function isFString(value: string): boolean {
  const prefix = value.match(/^([brfuBRFU]*)/)?.[1] ?? '';
  return /[fF]/.test(prefix);
}

/**
 * Walks through the body of an f-string (content between the outer quotes),
 * finds every `{expr}` block and renames identifiers inside expr.
 * Handles:
 *  - `{{` / `}}` → literal braces, left intact
 *  - nested braces in expressions (e.g. dict literals, set comprehensions)
 *  - single-quoted strings inside expressions (to avoid mis-counting `}` inside them)
 *  - format-spec after `:` (left as-is; only the expression part is renamed)
 *  - `!r` / `!s` / `!a` conversion suffix (left as-is)
 */
function renameFStringContent(content: string, nameMapping: Map<string, string>): string {
  let result = '';
  let i = 0;

  while (i < content.length) {
    const ch = content[i];

    // Escaped braces — pass through unchanged
    if (ch === '{' && content[i + 1] === '{') { result += '{{'; i += 2; continue; }
    if (ch === '}' && content[i + 1] === '}') { result += '}}'; i += 2; continue; }

    if (ch === '{') {
      // Extract expression up to matching `}`
      const { expr, formatSpec, conversion, end } = extractFExpr(content, i + 1);
      const renamed = renameIdentifiersInExpr(expr, nameMapping);
      result += '{' + renamed + conversion + formatSpec + '}';
      i = end;
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

/** Extracts expression, optional `!x` conversion, optional `:spec` from an f-string slot. */
function extractFExpr(
  content: string,
  start: number,
): { expr: string; conversion: string; formatSpec: string; end: number } {
  let depth = 1;
  let j = start;
  let inStr = false;
  let strCh = '';
  let tripleStr = false;

  while (j < content.length && depth > 0) {
    const c = content[j];

    if (inStr) {
      if (c === '\\') { j += 2; continue; }
      if (tripleStr) {
        if (content.slice(j, j + 3) === strCh + strCh + strCh) { inStr = false; j += 3; continue; }
      } else if (c === strCh) {
        inStr = false;
      }
      j++;
      continue;
    }

    if (c === '"' || c === "'") {
      if (content.slice(j, j + 3) === c + c + c) {
        inStr = true; tripleStr = true; strCh = c; j += 3;
      } else {
        inStr = true; tripleStr = false; strCh = c; j++;
      }
      continue;
    }

    if (c === '{') { depth++; j++; continue; }
    if (c === '}') { depth--; if (depth === 0) break; j++; continue; }
    j++;
  }

  const rawExpr = content.slice(start, j);

  // Separate conversion `!r/!s/!a` and format spec `:`
  let expr = rawExpr;
  let conversion = '';
  let formatSpec = '';

  // Strip conversion suffix (must come before format spec)
  const convMatch = expr.match(/^([\s\S]*)(!(?:r|s|a))$/);
  if (convMatch) {
    expr = convMatch[1];
    conversion = convMatch[2];
  }

  // Strip format spec (first unquoted `:` at depth 0)
  const colonIdx = findFormatColon(expr);
  if (colonIdx >= 0) {
    formatSpec = ':' + expr.slice(colonIdx + 1);
    expr = expr.slice(0, colonIdx);
  }

  return { expr, conversion, formatSpec, end: j + 1 };
}

/** Finds the index of a `:` at depth 0 (not inside strings/brackets) within an expression. */
function findFormatColon(expr: string): number {
  let depth = 0;
  let inStr = false;
  let strCh = '';

  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === strCh) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; strCh = c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; continue; }
    if (c === ':' && depth === 0) return i;
  }
  return -1;
}

/** Replaces every bare identifier in a Python expression with its mapped name. */
function renameIdentifiersInExpr(expr: string, nameMapping: Map<string, string>): string {
  // We use a regex that matches Python identifiers and replaces known ones.
  // Word-boundary \b is sufficient here since we're already inside a tokenized expression.
  return expr.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match) =>
    nameMapping.has(match) ? nameMapping.get(match)! : match,
  );
}

/**
 * Applies renaming inside the expression slots of an f-string token.
 * The outer prefix and quotes are preserved exactly.
 */
function renameFString(tokenValue: string, nameMapping: Map<string, string>): string {
  const prefixMatch = tokenValue.match(/^([brfuBRFU]*)/);
  const prefix = prefixMatch?.[1] ?? '';
  const rest = tokenValue.slice(prefix.length);

  let quoteStr: string;
  let quoteLen: number;

  if (rest.startsWith('"""'))      { quoteStr = '"""'; quoteLen = 3; }
  else if (rest.startsWith("'''")) { quoteStr = "'''"; quoteLen = 3; }
  else if (rest.startsWith('"'))   { quoteStr = '"';   quoteLen = 1; }
  else if (rest.startsWith("'"))   { quoteStr = "'";   quoteLen = 1; }
  else return tokenValue;

  const content = rest.slice(quoteLen, rest.length - quoteLen);
  const renamed = renameFStringContent(content, nameMapping);
  return prefix + quoteStr + renamed + quoteStr;
}

// ─── Docstring detection (for stripping) ───────────────────────────────────────

function isDocstringToken(tokens: Token[], i: number): boolean {
  const tok = tokens[i];
  if (tok.type !== 'STRING') return false;
  const val = tok.value;
  if (!val.startsWith('"""') && !val.startsWith("'''")) return false;

  const prev = prevMeaningful(tokens, i - 1);
  const prevTok = prev >= 0 ? tokens[prev] : null;

  // Module docstring: at start of file
  if (prevTok === null) return true;

  // After ':' — def/class/with/try etc.
  if (prevTok.type === 'OP' && prevTok.value === ':') return true;

  return false;
}

// ─── Main transformation pass ─────────────────────────────────────────────────

export interface TransformOptions {
  stripDocstrings?: boolean;
}

export function applyTransformations(
  tokens: Token[],
  nameMapping: Map<string, string>,
  posToVarName: Map<number, string>,
  options: TransformOptions = {},
): string {
  const stripDocstrings = options.stripDocstrings === true;
  const parts: string[] = [];
  const stack: boolean[] = []; // true = param list (def/class/lambda), false = call
  let nextParenIsParam = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    // ── Update paren context ─────────────────────────────────────────────────
    if (tok.type === 'KEYWORD' && ['def', 'class', 'lambda'].includes(tok.value)) {
      nextParenIsParam = true;
    }
    if (tok.type === 'OP' && tok.value === '(') {
      stack.push(nextParenIsParam);
      nextParenIsParam = false;
    }
    if (tok.type === 'OP' && tok.value === ')') {
      if (stack.length > 0) stack.pop();
    }
    if (tok.type !== 'WHITESPACE' && tok.type !== 'COMMENT' && tok.type !== 'NEWLINE' && tok.type !== 'OP') {
      nextParenIsParam = false;
    }

    // ── Strip docstrings (pyobfus-like) ──────────────────────────────────────
    if (stripDocstrings && isDocstringToken(tokens, i)) {
      continue;
    }

    // ── Strip comments ──────────────────────────────────────────────────────
    if (tok.type === 'COMMENT') {
      let lineIsOnlyComment = true;
      for (let j = i - 1; j >= 0; j--) {
        const pt = tokens[j];
        if (pt.type === 'NEWLINE' || pt.type === 'CONTINUATION') break;
        if (pt.type !== 'WHITESPACE') { lineIsOnlyComment = false; break; }
      }
      if (lineIsOnlyComment) {
        while (parts.length > 0 && parts[parts.length - 1].match(/^[ \t]+$/)) {
          parts.pop();
        }
        if (i + 1 < tokens.length && tokens[i + 1].type === 'NEWLINE') i++;
      }
      continue;
    }

    // ── Encrypted string replacement ────────────────────────────────────────
    if (tok.type === 'STRING' && posToVarName.has(tok.start)) {
      parts.push(posToVarName.get(tok.start)!);
      continue;
    }

    // ── Rename identifiers inside f-string expressions ──────────────────────
    if (tok.type === 'STRING' && isFString(tok.value)) {
      parts.push(renameFString(tok.value, nameMapping));
      continue;
    }

    // ── Rename regular identifiers ──────────────────────────────────────────
    if (tok.type === 'IDENTIFIER' && nameMapping.has(tok.value)) {
      const nextIdx = nextMeaningful(tokens, i + 1);
      const nextTok = nextIdx >= 0 ? tokens[nextIdx] : null;
      const prevIdx = prevMeaningful(tokens, i - 1);
      const prevTok = prevIdx >= 0 ? tokens[prevIdx] : null;
      const isKeywordArgInCall =
        nextTok?.type === 'OP' && nextTok.value === '=' &&
        stack.length > 0 && stack[stack.length - 1] === false &&
        prevTok?.type === 'OP' && (prevTok.value === ',' || prevTok.value === '(');
      if (isKeywordArgInCall) {
        parts.push(tok.value);
      } else {
        parts.push(nameMapping.get(tok.value)!);
      }
      continue;
    }

    parts.push(tok.value);
  }

  return parts.join('');
}
