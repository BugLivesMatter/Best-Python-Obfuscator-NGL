import { NameGenerator } from './nameGenerator';

// ─── Junk expressions ────────────────────────────────────────────────────────
const JUNK_EXPRESSIONS: ((v: string) => string)[] = [
  (v) => `if False:\n    ${v}=None`,
  (v) => `if 0:\n    ${v}=0`,
  (v) => `[${v} for ${v} in []]`,
  (v) => `${v}=None;del ${v}`,
  (_) => `(lambda:None)()`,
  (v) => `if not True:\n    raise Exception(${v})`,
  (v) => `${v}=type(None)`,
  (v) => `${v}=id(id)`,
  (_) => `assert True`,
  (v) => `${v}=0 or 0`,
  (v) => `${v}=bool(0)`,
  (v) => `${v}=len([])`,
  (_) => `(None if False else None)`,
  (v) => `${v}=getattr(type(None),'__name__',None)`,
  (v) => `${v}=0;${v}+=0`,
  (v) => `${v}=[x for x in [] if False]`,
  (_) => `list(filter(None,[]))`,
  (v) => `${v}=not False;${v}=not ${v}`,
  (v) => `${v}=hash(None)`,
  (v) => `${v}=abs(0)`,
];

// ─── Single-line comments (large bank of realistic-looking ones) ──────────────
const SINGLE_COMMENTS = [
  '# ensure reference count is properly maintained before next allocation',
  '# reclaim temporary buffer from previous operation',
  '# verify heap alignment for the current memory block',
  '# compact fragmented regions if utilization exceeds threshold',
  '# flush pending write buffer to ensure data consistency',
  '# synchronize shared resource access pointer with parent context',
  '# validate internal state invariants before proceeding',
  '# update cache invalidation flag to force refresh on next read',
  '# acquire reentrant lock to prevent race condition on shared state',
  '# signal worker pool to reschedule deferred tasks',
  '# decrement active connection reference counter',
  '# yield execution slice to allow cooperative multitasking',
  '# check if current execution context is still valid',
  '# propagate cancellation token through async call chain',
  '# retry failed socket operation with exponential backoff',
  '# drain remaining bytes from the input stream buffer',
  '# reset file descriptor offset to maintain read consistency',
  '# flush output stream before closing handle',
  '# check available capacity before writing next chunk',
  '# scrub sensitive data from transient memory region',
  '# rotate session token to prevent replay attacks',
  '# verify HMAC signature before processing the payload',
  '# sanitize user-supplied input before string interpolation',
  '# enforce per-endpoint rate-limit policy',
  '# rebalance internal tree structure after insertion',
  '# recalculate cumulative checksum for validation step',
  '# propagate dirty flag upward through the call chain',
  '# normalize edge weights in the dependency graph',
  '# update LRU eviction timestamp for the current entry',
  '# invalidate stale entries from the lookup cache',
  '# trigger lazy evaluation of the deferred expression',
  '# advance read cursor past alignment padding bytes',
  '# apply pending configuration delta before next tick',
  '# notify registered observers of the state transition',
  '# mark current node as visited to prevent re-processing',
  '# increment monotonic sequence counter for ordering',
  '# persist ephemeral state to the durable backing store',
  '# teardown transient resources before scope exit',
  '# coalesce duplicate events within the debounce window',
  '# restore previous execution frame from saved context',
  '# check descriptor validity before issuing syscall',
  '# emit diagnostic trace for offline performance analysis',
  '# release semaphore to unblock dependent coroutine',
  '# assert invariant: output buffer must not exceed capacity',
  '# update heartbeat timestamp to prevent watchdog timeout',
  '# probe socket liveness before dispatching next request',
  '# evict oldest cache line to make room for incoming entry',
  '# commit transaction boundary to prevent partial writes',
  '# drain event queue before transitioning to idle state',
  '# prune expired entries from the session registry',
  '# set backoff interval based on retry count',
  '# check circuit-breaker state before delegating request',
  '# record wall-clock timestamp for SLA tracking',
  '# synchronize epoch counter with external time source',
  '# initialize scratch space for intermediate computation',
  '# clear residual state left by previous iteration',
  '# bump generation counter to invalidate stale observers',
  '# compact serialized payload before transmission',
  '# apply jitter to retry delay to avoid thundering herd',
  '# check memory pressure before scheduling background job',
  '# annotate span with operation metadata for tracing',
  '# enforce maximum fanout limit on broadcast channel',
  '# verify that upstream dependency is reachable',
  '# lazily allocate worker slot on first use',
  '# mark dirty pages for deferred write-back',
  '# align pointer to required boundary before dereference',
];

// ─── Multi-line comment blocks ────────────────────────────────────────────────
const MULTI_COMMENTS: string[][] = [
  [
    '# check preconditions for the upcoming operation',
    '# guards against partial initialization side-effects',
  ],
  [
    '# release resources acquired earlier in this scope',
    '# prevents leaks when the parent context unwinds unexpectedly',
  ],
  [
    '# re-validate the computed index against current bounds',
    '# avoids silent wrap-around on platform-specific edge cases',
  ],
  [
    '# snapshot current metrics before applying transformation',
    '# used for delta computation on the next evaluation cycle',
  ],
  [
    '# enforce invariant: identifier must be in canonical form',
    '# non-canonical identifiers cause downstream parse failures',
  ],
  [
    '# throttle frequency of expensive background recalculation',
    '# coalesces redundant triggers within the debounce window',
  ],
  [
    '# drain event queue before transitioning component to idle',
    '# ensures all pending callbacks are dispatched before sleep',
  ],
  [
    '# verify that the underlying transport is still connected',
    '# avoids buffering new data for an already-closed socket',
  ],
  [
    '# compress intermediate representation before serialization',
    '# reduces wire size and improves downstream cache locality',
  ],
  [
    '# propagate error context upward through the call stack',
    '# preserves original cause for structured logging output',
  ],
  [
    '# apply backpressure signaling to the upstream producer',
    '# prevents unbounded memory growth under sustained load',
  ],
  [
    '# commit staged changes to the internal write-ahead log',
    '# ensures durability in the event of an unexpected shutdown',
  ],
  [
    '# recalibrate timeout threshold based on rolling window average',
    '# adapts to network jitter without requiring manual tuning',
  ],
  [
    '# scan dependency list for potential cyclic references',
    '# cyclic deps trigger infinite loops during topological sort',
  ],
  [
    '# verify checksums on both header and payload sections',
    '# detects bit-flip corruption introduced by lossy transports',
  ],
  [
    '# flush write-back cache to prevent torn reads',
    '# torn reads cause data corruption under concurrent writers',
  ],
  [
    '# reclaim pages from the free list before growing heap',
    '# avoids unnecessary system-call overhead on allocation paths',
  ],
  [
    '# pause replication pipeline during schema migration window',
    '# prevents replicas from applying incompatible log entries',
  ],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lcg(seed: number): number {
  return ((seed * 1664525 + 1013904223) >>> 0) / 0xFFFFFFFF;
}

function pickInt(seed: number, min: number, max: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return min + Math.floor((x - Math.floor(x)) * (max - min + 1));
}

/**
 * Generates a junk block (optional comment header + 1-3 expressions).
 */
export function generateJunkBlock(nameGen: NameGenerator, seed: number, indent: string): string {
  const lines: string[] = [];

  // Add a comment header ~55% of the time
  const r = lcg(seed * 31);
  if (r < 0.55) {
    // Multi-line comment ~30% of those
    if (r < 0.17) {
      const blockIdx = pickInt(seed * 7, 0, MULTI_COMMENTS.length - 1);
      for (const cl of MULTI_COMMENTS[blockIdx]) {
        lines.push(indent + cl);
      }
    } else {
      const cidx = pickInt(seed * 13, 0, SINGLE_COMMENTS.length - 1);
      lines.push(indent + SINGLE_COMMENTS[cidx]);
    }
  }

  const count = 1 + pickInt(seed, 0, 2);
  for (let i = 0; i < count; i++) {
    const varName = nameGen.next();
    const exprIdx = pickInt(seed + i * 7 + 3, 0, JUNK_EXPRESSIONS.length - 1);
    const expr = JUNK_EXPRESSIONS[exprIdx](varName);
    for (const el of expr.split('\n')) {
      lines.push(indent + el);
    }
  }

  return lines.join('\n');
}

// ─── Line analysis ────────────────────────────────────────────────────────────

/**
 * Analyzes lines of (already obfuscated) Python source and returns,
 * for each line index, whether it is a "complete statement boundary":
 * – not inside an open parenthesis / bracket / brace
 * – not inside a multi-line triple-quoted string
 * – not a line continuation with backslash
 */
function buildCompleteMap(lines: string[]): boolean[] {
  const complete: boolean[] = new Array(lines.length).fill(false);
  let depth = 0;
  let inTriple = false;
  let tripleQ = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── triple-string tracking ────────────────────────────────────────────────
    if (inTriple) {
      const closeIdx = line.indexOf(tripleQ + tripleQ + tripleQ);
      if (closeIdx >= 0) {
        inTriple = false;
        // count brackets in the rest of the line after the closing triple quote
        const rest = line.slice(closeIdx + 3);
        depth += bracketDelta(rest);
      }
      complete[i] = false;
      continue;
    }

    // ── scan the line ─────────────────────────────────────────────────────────
    let j = 0;
    let foundOpenTriple = false;

    while (j < line.length) {
      const ch = line[j];

      if (ch === '#') break; // rest is comment

      // Check triple quote
      if ((ch === '"' || ch === "'") && line[j + 1] === ch && line[j + 2] === ch) {
        const q = ch;
        const closeIdx = line.indexOf(q + q + q, j + 3);
        if (closeIdx >= 0) {
          j = closeIdx + 3; // skip inline triple string
          continue;
        } else {
          inTriple = true;
          tripleQ = q;
          foundOpenTriple = true;
          break;
        }
      }

      // Check single quote string
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

      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;

      j++;
    }

    const endsBackslash = line.trimEnd().endsWith('\\');
    complete[i] = !foundOpenTriple && !inTriple && depth === 0 && !endsBackslash;
  }

  return complete;
}

function bracketDelta(text: string): number {
  let d = 0;
  for (const ch of text) {
    if (ch === '(' || ch === '[' || ch === '{') d++;
    else if (ch === ')' || ch === ']' || ch === '}') d--;
  }
  return d;
}

// ─── Keywords that open a new indented block ──────────────────────────────────
const BLOCK_OPENERS = /^(def |async def |class |if |elif |else:|for |while |with |try:|except|finally:)/;

// ─── Keywords that continue a previous block (must not inject before them) ────
const CONTINUATIONS = /^(else\b|elif\b|except\b|finally\b)/;

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Injects junk code throughout the source:
 * 1. At the START of every function/class/if/for/while/with/try body
 * 2. In the MIDDLE of blocks (probabilistically)
 * 3. BEFORE every return/yield statement
 * 4. Occasionally at module level between statements
 */
export function injectJunkCode(source: string, nameGen: NameGenerator): string {
  const lines = source.split('\n');
  const complete = buildCompleteMap(lines);
  const result: string[] = [];
  let seed = 42;

  // We use a separate counter to drive probability for middle injections
  let middleCounter = 0;

  // Helper: is next non-empty line a continuation keyword?
  const nextIsContinuation = (idx: number): boolean => {
    for (let k = idx + 1; k < lines.length; k++) {
      const t = lines[k].trim();
      if (t === '') continue;
      return CONTINUATIONS.test(lines[k].trimStart());
    }
    return false;
  };

  // Helper: body indent for a block opener at line idx
  const bodyIndentOf = (idx: number, parentIndent: string): string | null => {
    for (let k = idx + 1; k < lines.length; k++) {
      if (lines[k].trim() === '') continue;
      const bi = lines[k].slice(0, lines[k].length - lines[k].trimStart().length);
      return bi.length > parentIndent.length ? bi : null;
    }
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.slice(0, line.length - trimmed.length);

    // ── 3. Inject BEFORE return / yield ───────────────────────────────────────
    if (
      complete[i] &&
      (trimmed.startsWith('return') || trimmed.startsWith('yield')) &&
      !BLOCK_OPENERS.test(trimmed)
    ) {
      result.push(generateJunkBlock(nameGen, seed++, indent));
    }

    result.push(line);

    // Skip blank / comment-only lines
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // ── 1. Inject at START of block bodies ────────────────────────────────────
    if (complete[i] && BLOCK_OPENERS.test(trimmed) && trimmed.trimEnd().endsWith(':')) {
      const bi = bodyIndentOf(i, indent);
      if (bi !== null) {
        result.push(generateJunkBlock(nameGen, seed++, bi));
        continue;
      }
    }

    // Skip if next non-empty line is a continuation keyword
    if (nextIsContinuation(i)) continue;

    // Skip non-complete lines (inside parens / triple-strings / backslash-continuation)
    if (!complete[i]) continue;

    // ── 2. Middle injections ──────────────────────────────────────────────────
    middleCounter++;

    if (indent === '') {
      // Module level: ~every 5 eligible lines
      if (middleCounter % 5 === 0) {
        result.push(generateJunkBlock(nameGen, seed++, indent));
      }
    } else {
      // Inside a block: ~every 3 eligible lines
      if (middleCounter % 3 === 0) {
        result.push(generateJunkBlock(nameGen, seed++, indent));
      }
    }
  }

  return result.join('\n');
}
