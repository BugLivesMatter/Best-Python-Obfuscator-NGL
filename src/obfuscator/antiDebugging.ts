/**
 * Injects anti-debugging checks at the start of function bodies.
 * Detects sys.gettrace() / sys.settrace - common debugger hooks.
 */

function getIndent(line: string): string {
  const m = line.match(/^(\s*)/);
  return m ? m[1] : '';
}

const BLOCK_OPENERS = /^(def |async def )/;

export function injectAntiDebugging(source: string): string {
  const lines = source.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.slice(0, line.length - trimmed.length);

    result.push(line);

    // Inject after def/async def line, before first body line
    if (BLOCK_OPENERS.test(trimmed) && trimmed.trimEnd().endsWith(':')) {
      const bodyIndent = indent + '    ';
      const check = `${bodyIndent}if __import__('sys').gettrace() is not None: raise RuntimeError('Debugger detected')`;
      let inserted = false;

      for (let k = i + 1; k < lines.length; k++) {
        const nextLine = lines[k];
        const nextTrimmed = nextLine.trim();
        const nextIndent = getIndent(nextLine);

        if (nextTrimmed === '') continue;

        if (nextIndent.length <= indent.length) break;

        if (nextIndent.length >= bodyIndent.length && !inserted) {
          result.push(check);
          inserted = true;
        }
        break;
      }
    }
  }

  return result.join('\n');
}
