/**
 * Control-flow flattening for Python source code.
 *
 * Transforms simple function bodies into a while-True + state-variable dispatch
 * pattern that makes linear control flow harder to follow.
 *
 * Only transforms functions whose body is a sequence of simple statements
 * (assignments, expressions, return) without nested control structures
 * to avoid breaking semantics.
 */

interface FunctionBlock {
  defLine: string;
  bodyLines: string[];
  bodyIndent: string;
  startIdx: number;
  endIdx: number;
}

function getIndent(line: string): string {
  const m = line.match(/^(\s*)/);
  return m ? m[1] : '';
}

function isSimpleStatement(trimmed: string): boolean {
  if (trimmed === '' || trimmed.startsWith('#')) return true;
  if (trimmed.startsWith('return ') || trimmed === 'return') return true;
  if (trimmed.startsWith('if ') || trimmed.startsWith('elif ') ||
      trimmed.startsWith('else:') || trimmed.startsWith('for ') ||
      trimmed.startsWith('while ') || trimmed.startsWith('try:') ||
      trimmed.startsWith('except') || trimmed.startsWith('finally:') ||
      trimmed.startsWith('with ') || trimmed.startsWith('class ') ||
      trimmed.startsWith('def ') || trimmed.startsWith('async ') ||
      trimmed.startsWith('yield') || trimmed.startsWith('raise ') ||
      trimmed.startsWith('@')) {
    return false;
  }
  return true;
}

function findFunctions(lines: string[]): FunctionBlock[] {
  const results: FunctionBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (!(trimmed.startsWith('def ') || trimmed.startsWith('async def ')) ||
        !trimmed.endsWith(':')) {
      continue;
    }

    const defIndent = getIndent(lines[i]);
    let bodyStart = i + 1;
    while (bodyStart < lines.length && lines[bodyStart].trim() === '') {
      bodyStart++;
    }
    if (bodyStart >= lines.length) continue;

    const actualBodyIndent = getIndent(lines[bodyStart]);
    if (actualBodyIndent.length <= defIndent.length) continue;

    const bodyLines: string[] = [];
    let j = bodyStart;
    let allSimple = true;

    while (j < lines.length) {
      const line = lines[j];
      if (line.trim() === '') {
        bodyLines.push('');
        j++;
        continue;
      }
      const ind = getIndent(line);
      if (ind.length <= defIndent.length && line.trim() !== '') break;
      if (ind.length < actualBodyIndent.length && line.trim() !== '') break;
      if (ind.length > actualBodyIndent.length) {
        allSimple = false;
        break;
      }
      const stmt = line.trimStart();
      if (!isSimpleStatement(stmt)) {
        allSimple = false;
        break;
      }
      bodyLines.push(stmt);
      j++;
    }

    if (!allSimple) continue;

    const stmts = bodyLines.filter(l => l !== '' && !l.startsWith('#'));
    if (stmts.length < 3 || stmts.length > 30) continue;

    results.push({
      defLine: lines[i],
      bodyLines: stmts,
      bodyIndent: actualBodyIndent,
      startIdx: i,
      endIdx: j - 1,
    });
  }

  return results;
}

function shuffleOrder(n: number, seed: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  let s = seed;
  for (let i = n - 1; i > 0; i--) {
    s = ((s * 1664525 + 1013904223) >>> 0);
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function flattenFunction(fn: FunctionBlock, fnIdx: number): string[] {
  const stmts = fn.bodyLines;
  const n = stmts.length;
  const indent = fn.bodyIndent;
  const inner = indent + '    ';
  const innerInner = inner + '    ';

  const stateOrder = shuffleOrder(n + 1, fnIdx * 7 + 31);
  const stateMap: number[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    stateMap[i] = stateOrder[i];
  }

  const exitState = stateMap[n];
  const result: string[] = [fn.defLine];

  const stateVar = `_st${fnIdx}`;
  result.push(`${indent}${stateVar}=${stateMap[0]}`);
  result.push(`${indent}while True:`);

  for (let i = 0; i < n; i++) {
    const cond = i === 0 ? 'if' : 'elif';
    result.push(`${inner}${cond} ${stateVar}==${stateMap[i]}:`);

    const stmt = stmts[i];
    if (stmt.startsWith('return')) {
      result.push(`${innerInner}${stmt}`);
    } else {
      result.push(`${innerInner}${stmt}`);
      result.push(`${innerInner}${stateVar}=${stateMap[i + 1]}`);
    }
  }

  result.push(`${inner}elif ${stateVar}==${exitState}:`);
  result.push(`${innerInner}break`);

  return result;
}

export function flattenControlFlow(source: string): string {
  const lines = source.split('\n');
  const functions = findFunctions(lines);

  if (functions.length === 0) return source;

  const replaceRanges: { start: number; end: number; replacement: string[] }[] = [];

  functions.forEach((fn, idx) => {
    const replacement = flattenFunction(fn, idx);
    replaceRanges.push({
      start: fn.startIdx,
      end: fn.endIdx,
      replacement,
    });
  });

  replaceRanges.sort((a, b) => b.start - a.start);

  const result = [...lines];
  for (const range of replaceRanges) {
    result.splice(range.start, range.end - range.start + 1, ...range.replacement);
  }

  return result.join('\n');
}
