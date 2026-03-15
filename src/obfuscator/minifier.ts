/**
 * Python minifier — makes code harder to read while keeping it valid.
 *
 * 1. Shrinks indentation to 1 space per level
 * 2. Strips blank lines
 * 3. Joins consecutive simple statements at the same indent level with `;`
 */

const COMPOUND_START =
  /^(def |async def |class |if |elif |else:|else |for |async for |while |with |async with |try:|except |except:|finally:|@)/;

// ─── Multi-line awareness (brackets / triple-strings / backslash) ─────────────

function buildCompleteFlags(lines: string[]): boolean[] {
  const flags: boolean[] = new Array(lines.length).fill(false);
  let depth = 0;
  let inTriple = false;
  let tripleQ = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inTriple) {
      const close = line.indexOf(tripleQ);
      if (close >= 0) {
        inTriple = false;
        depth += bracketDelta(line.slice(close + 3));
      }
      flags[i] = false;
      continue;
    }

    let j = 0;
    let openedTriple = false;

    while (j < line.length) {
      const ch = line[j];
      if (ch === '#') break;

      if ((ch === '"' || ch === "'") && line[j + 1] === ch && line[j + 2] === ch) {
        const q3 = ch + ch + ch;
        const close = line.indexOf(q3, j + 3);
        if (close >= 0) {
          j = close + 3;
          continue;
        }
        inTriple = true;
        tripleQ = q3;
        openedTriple = true;
        break;
      }

      if (ch === '"' || ch === "'") {
        const q = ch;
        j++;
        while (j < line.length && line[j] !== q) {
          if (line[j] === '\\') j++;
          j++;
        }
        j++;
        continue;
      }

      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      j++;
    }

    const endsBackslash = line.trimEnd().endsWith('\\');
    flags[i] = !openedTriple && !inTriple && depth <= 0 && !endsBackslash;
  }

  return flags;
}

function bracketDelta(text: string): number {
  let d = 0;
  for (const ch of text) {
    if ('([{'.includes(ch)) d++;
    else if (')]}'.includes(ch)) d--;
  }
  return d;
}

// ─── Indent helpers ───────────────────────────────────────────────────────────

function indentSize(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === ' ') n++;
    else if (ch === '\t') n += 4;
    else break;
  }
  return n;
}

function gcd(a: number, b: number): number {
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

function detectIndentUnit(lines: string[]): number {
  let unit = 0;
  for (const line of lines) {
    const s = indentSize(line);
    if (s > 0) unit = unit === 0 ? s : gcd(unit, s);
  }
  return unit || 4;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function minifyPython(source: string): string {
  const rawLines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const complete = buildCompleteFlags(rawLines);

  const unit = detectIndentUnit(rawLines);

  // Phase 1: shrink indentation, strip blank lines, strip comment-only lines
  const shrunk: { text: string; level: number; complete: boolean; origIdx: number }[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trimEnd();
    if (trimmed === '') continue;

    const body = line.trim();
    if (body.startsWith('#')) continue;

    const sz = indentSize(line);
    const level = Math.round(sz / unit);
    const newLine = ' '.repeat(level) + body;

    shrunk.push({ text: newLine, level, complete: complete[i], origIdx: i });
  }

  // Phase 2: join simple statements with `;`
  const joined: string[] = [];
  let i = 0;

  while (i < shrunk.length) {
    const cur = shrunk[i];
    let merged = cur.text;
    const curBody = cur.text.trimStart();

    const canStartGroup =
      cur.complete &&
      !curBody.trimEnd().endsWith(':') &&
      !COMPOUND_START.test(curBody);

    if (canStartGroup) {
      let j = i + 1;
      while (j < shrunk.length) {
        const nxt = shrunk[j];
        const nxtBody = nxt.text.trimStart();

        if (nxt.level !== cur.level) break;
        if (COMPOUND_START.test(nxtBody)) break;
        if (nxtBody.trimEnd().endsWith(':')) break;
        if (!shrunk[j - 1].complete) break;

        merged += ';' + nxtBody;
        if (!nxt.complete) {
          j++;
          break;
        }
        j++;
      }
      joined.push(merged);
      i = j;
    } else {
      joined.push(cur.text);
      i++;
    }
  }

  // Remove any trailing whitespace from each line
  return joined.map(l => l.trimEnd()).join('\n');
}
