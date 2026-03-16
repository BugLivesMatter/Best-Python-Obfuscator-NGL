import type { Token } from './tokenizer';
import { isProtectedName } from './tokenizer';

/**
 * Finds the next non-whitespace, non-comment, non-newline token index.
 */
function nextMeaningful(tokens: Token[], from: number): number {
  for (let i = from; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'WHITESPACE' && t.type !== 'COMMENT' && t.type !== 'NEWLINE' && t.type !== 'CONTINUATION') {
      return i;
    }
  }
  return -1;
}

/**
 * Finds the previous non-whitespace, non-comment, non-newline token index.
 */
function prevMeaningful(tokens: Token[], from: number): number {
  for (let i = from; i >= 0; i--) {
    const t = tokens[i];
    if (t.type !== 'WHITESPACE' && t.type !== 'COMMENT' && t.type !== 'NEWLINE' && t.type !== 'CONTINUATION') {
      return i;
    }
  }
  return -1;
}

/**
 * Parses function parameter names from the parameter list starting after '('
 * Returns the list of parameter names found.
 */
function parseFuncParams(tokens: Token[], openParenIdx: number): string[] {
  const params: string[] = [];
  let depth = 1;
  let i = openParenIdx + 1;

  while (i < tokens.length && depth > 0) {
    const t = tokens[i];

    if (t.type === 'OP') {
      if (t.value === '(' || t.value === '[' || t.value === '{') depth++;
      else if (t.value === ')' || t.value === ']' || t.value === '}') {
        depth--;
        if (depth === 0) break;
      }
      // Skip *args, **kwargs prefixes — the identifier follows
      i++;
      continue;
    }

    if (t.type === 'IDENTIFIER' && depth === 1) {
      // Check: could be param name or default value identifier
      // Simple heuristic: if the token before this (meaningful) is , ( * ** or /
      const prev = prevMeaningful(tokens, i - 1);
      const prevTok = prev >= 0 ? tokens[prev] : null;

      if (
        prevTok === null ||
        (prevTok.type === 'OP' && [',', '(', '*', '**', '/'].includes(prevTok.value)) ||
        prevTok.type === 'KEYWORD' // e.g. after some keyword
      ) {
        // Check next meaningful: if it's , ) : = * then it's a param name
        const next = nextMeaningful(tokens, i + 1);
        const nextTok = next >= 0 ? tokens[next] : null;
        if (
          nextTok !== null &&
          nextTok.type === 'OP' &&
          [',', ')', ':', '=', '*'].includes(nextTok.value)
        ) {
          if (!isProtectedName(t.value)) {
            params.push(t.value);
          }
        }
      }
    }

    i++;
  }

  return params;
}

export interface CollectRenameableOptions {
  preserveParamNames?: boolean;
}

/**
 * Collects all user-defined identifiers that can be safely renamed.
 * Returns a Set of identifier names.
 */
export function collectRenameableNames(
  tokens: Token[],
  options: CollectRenameableOptions = {},
): Set<string> {
  const preserveParamNames = options.preserveParamNames === true;
  const renameable = new Set<string>();
  const importedFromExternal = new Set<string>(); // from X import name (don't rename)

  // Track paren context so we don't add keyword-arg names in external calls
  const stack: boolean[] = []; // true = param list (def/class/lambda), false = call
  let nextParenIsParam = false;

  let i = 0;

  while (i < tokens.length) {
    const tok = tokens[i];

    // ── Update paren context for call vs def/class/lambda ──
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
    // Reset nextParenIsParam only after we've seen '(' (so param list is already pushed). Do not reset on IDENTIFIER so "def foo(" is still param.

    // ── KEYWORD contexts ──
    if (tok.type === 'KEYWORD') {
      // def NAME
      if (tok.value === 'def') {
        const ni = nextMeaningful(tokens, i + 1);
        if (ni >= 0 && tokens[ni].type === 'IDENTIFIER') {
          const name = tokens[ni].value;
          if (!isProtectedName(name)) renameable.add(name);

          // Parse params: find the '(' — skip if preserveParamNames (pyobfus-like)
          if (!preserveParamNames) {
            const pi = nextMeaningful(tokens, ni + 1);
            if (pi >= 0 && tokens[pi].value === '(') {
              parseFuncParams(tokens, pi).forEach(p => renameable.add(p));
            }
          }
        }
        i++;
        continue;
      }

      // class NAME
      if (tok.value === 'class') {
        const ni = nextMeaningful(tokens, i + 1);
        if (ni >= 0 && tokens[ni].type === 'IDENTIFIER') {
          const name = tokens[ni].value;
          if (!isProtectedName(name)) renameable.add(name);
        }
        i++;
        continue;
      }

      // for NAME [, NAME ...] in
      if (tok.value === 'for') {
        // Collect loop targets until 'in'
        let j = nextMeaningful(tokens, i + 1);
        while (j >= 0) {
          const t = tokens[j];
          if (t.type === 'KEYWORD' && t.value === 'in') break;
          if (t.type === 'IDENTIFIER' && !isProtectedName(t.value)) {
            renameable.add(t.value);
          }
          j = nextMeaningful(tokens, j + 1);
        }
        i++;
        continue;
      }

      // except [Type] as NAME
      if (tok.value === 'except') {
        let j = nextMeaningful(tokens, i + 1);
        while (j >= 0 && tokens[j].type !== 'NEWLINE') {
          if (tokens[j].type === 'KEYWORD' && tokens[j].value === 'as') {
            const ni2 = nextMeaningful(tokens, j + 1);
            if (ni2 >= 0 && tokens[ni2].type === 'IDENTIFIER') {
              const name = tokens[ni2].value;
              if (!isProtectedName(name)) renameable.add(name);
            }
            break;
          }
          j = nextMeaningful(tokens, j + 1);
        }
        i++;
        continue;
      }

      // with expr as NAME [, expr as NAME ...]
      if (tok.value === 'with') {
        let j = nextMeaningful(tokens, i + 1);
        while (j >= 0) {
          const t = tokens[j];
          if (t.type === 'OP' && t.value === ':') break;
          if (t.type === 'KEYWORD' && t.value === 'as') {
            const ni2 = nextMeaningful(tokens, j + 1);
            if (ni2 >= 0 && tokens[ni2].type === 'IDENTIFIER') {
              const name = tokens[ni2].value;
              if (!isProtectedName(name)) renameable.add(name);
            }
          }
          j = nextMeaningful(tokens, j + 1);
        }
        i++;
        continue;
      }

      // lambda NAME, NAME=default, *NAME, **NAME :
      if (tok.value === 'lambda') {
        if (!preserveParamNames) {
          let j = nextMeaningful(tokens, i + 1);
          while (j >= 0) {
            const t = tokens[j];
            if (t.type === 'OP' && t.value === ':') break;
            if (t.type === 'IDENTIFIER' && !isProtectedName(t.value)) {
              const nj = nextMeaningful(tokens, j + 1);
              const nt = nj >= 0 ? tokens[nj] : null;
              if (nt && nt.type === 'OP' && [',', ':', '='].includes(nt.value)) {
                renameable.add(t.value);
              }
            }
            j = nextMeaningful(tokens, j + 1);
          }
        }
        i++;
        continue;
      }

      // import X [as Y] [, X [as Y] ...]
      if (tok.value === 'import') {
        // Check if preceded by 'from'
        const prev = prevMeaningful(tokens, i - 1);
        const prevTok = prev >= 0 ? tokens[prev] : null;

        if (prevTok && prevTok.type === 'IDENTIFIER') {
          // This is "from MODULE import NAME [as ALIAS]"
          // The module name (prevTok) is already handled when we saw 'from'
          let j = nextMeaningful(tokens, i + 1);
          while (j >= 0) {
            const t = tokens[j];
            if (t.type === 'NEWLINE') break;
            if (t.type === 'OP' && t.value === ')') break;

            if (t.type === 'IDENTIFIER') {
              // Check if it's followed by 'as'
              const nj = nextMeaningful(tokens, j + 1);
              const nt = nj >= 0 ? tokens[nj] : null;
              if (nt && nt.type === 'KEYWORD' && nt.value === 'as') {
                // from X import Y as Z → Z is renameable, Y is external
                importedFromExternal.add(t.value);
                const aliasIdx = nextMeaningful(tokens, nj + 1);
                if (aliasIdx >= 0 && tokens[aliasIdx].type === 'IDENTIFIER') {
                  const alias = tokens[aliasIdx].value;
                  if (!isProtectedName(alias)) renameable.add(alias);
                  j = nextMeaningful(tokens, aliasIdx + 1);
                  continue;
                }
              } else {
                // from X import NAME → don't rename NAME (external reference)
                importedFromExternal.add(t.value);
              }
            }
            j = nextMeaningful(tokens, j + 1);
          }
        } else {
          // Plain "import X [as Y]"
          let j = nextMeaningful(tokens, i + 1);
          while (j >= 0) {
            const t = tokens[j];
            if (t.type === 'NEWLINE') break;
            if (t.type === 'IDENTIFIER') {
              // Check for "as Y"
              const nj = nextMeaningful(tokens, j + 1);
              const nt = nj >= 0 ? tokens[nj] : null;
              if (nt && nt.type === 'KEYWORD' && nt.value === 'as') {
                const aliasIdx = nextMeaningful(tokens, nj + 1);
                if (aliasIdx >= 0 && tokens[aliasIdx].type === 'IDENTIFIER') {
                  const alias = tokens[aliasIdx].value;
                  if (!isProtectedName(alias)) renameable.add(alias);
                  j = nextMeaningful(tokens, aliasIdx + 1);
                  continue;
                }
              }
              // else: bare module name, don't rename
            }
            j = nextMeaningful(tokens, j + 1);
          }
        }
        i++;
        continue;
      }
    }

    // ── IDENTIFIER assignments ──
    if (tok.type === 'IDENTIFIER') {
      // Skip if previous meaningful token is '.' (attribute access)
      const prevIdx = prevMeaningful(tokens, i - 1);
      const prevTok = prevIdx >= 0 ? tokens[prevIdx] : null;
      if (prevTok && prevTok.type === 'OP' && prevTok.value === '.') {
        i++;
        continue;
      }

      // Check for assignment: NAME = / NAME += etc.
      const nextIdx = nextMeaningful(tokens, i + 1);
      const nextTok = nextIdx >= 0 ? tokens[nextIdx] : null;

      const assignOps = new Set(['=', '+=', '-=', '*=', '/=', '//=', '**=', '%=', '&=', '|=', '^=', '@=']);
      if (nextTok && nextTok.type === 'OP' && assignOps.has(nextTok.value)) {
        // If this is keyword-arg position (NAME = value) inside a call, do NOT rename — the callee expects the exact name
        const isKeywordArgInCall =
          nextTok.value === '=' &&
          stack.length > 0 &&
          stack[stack.length - 1] === false &&
          (prevTok?.type === 'OP' && [',', '('].includes(prevTok.value));
        if (isKeywordArgInCall) {
          i++;
          continue;
        }
        // Make sure the = is not part of == (already handled in tokenizer)
        if (!isProtectedName(tok.value)) {
          renameable.add(tok.value);
        }
      }

      // Check for annotated assignment: NAME : TYPE = ...
      if (nextTok && nextTok.type === 'OP' && nextTok.value === ':') {
        const afterColon = nextMeaningful(tokens, nextIdx + 1);
        // scan past the type annotation to find =
        // For simplicity: if there's a = somewhere on this line, treat as assignment
        let j = nextIdx + 1;
        let foundEq = false;
        while (j < tokens.length && tokens[j].type !== 'NEWLINE') {
          if (tokens[j].type === 'OP' && tokens[j].value === '=') {
            const jj = nextMeaningful(tokens, j + 1);
            if (jj >= 0 && tokens[jj].value !== '=') { // not ==
              foundEq = true;
              break;
            }
          }
          j++;
        }
        if (foundEq && !isProtectedName(tok.value)) {
          renameable.add(tok.value);
        }
        // Even without =, "x: int" alone is a declaration
        if (afterColon >= 0 && !isProtectedName(tok.value) && prevTok === null) {
          // Only at module/class level
        }
      }

      // Walrus operator: (NAME := expr)
      if (nextTok && nextTok.type === 'OP' && nextTok.value === ':=') {
        if (!isProtectedName(tok.value)) renameable.add(tok.value);
      }
    }

    i++;
  }

  // Remove externally imported names
  for (const name of importedFromExternal) {
    renameable.delete(name);
  }

  return renameable;
}

/**
 * Finds positions of string tokens that are safe to encrypt.
 * Returns token indices of plain strings (not docstrings, not f-strings).
 */
export function findEncryptableStrings(tokens: Token[]): number[] {
  const result: number[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type !== 'STRING') continue;

    const val = tok.value;

    // Skip f-strings (contain expressions we can't easily handle)
    if (/^[brBRuU]*[fF]/.test(val) || /^[fF]/.test(val)) continue;

    // Skip docstrings (triple-quoted at start of function/class/module)
    // Heuristic: if preceded by : or start of file
    const prev = prevMeaningful(tokens, i - 1);
    const prevTok = prev >= 0 ? tokens[prev] : null;
    if (prevTok && prevTok.type === 'OP' && prevTok.value === ':') continue;
    if (prevTok === null) continue; // module docstring

    // Skip if it's a triple-quoted string used as a standalone statement
    // (common pattern for docstrings)
    if (val.startsWith('"""') || val.startsWith("'''")) {
      // Check if it's used as a value or standalone
      const nextIdx = nextMeaningful(tokens, i + 1);
      const nextTok2 = nextIdx >= 0 ? tokens[nextIdx] : null;
      if (!nextTok2 || nextTok2.type === 'NEWLINE' || (nextTok2.type === 'OP' && nextTok2.value === ')')) {
        continue; // likely standalone docstring
      }
    }

    result.push(i);
  }

  return result;
}

export { prevMeaningful, nextMeaningful };
