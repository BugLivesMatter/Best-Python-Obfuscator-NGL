import CryptoJS from 'crypto-js';

const AES_PASSWORD = 'll11lll1';

function base64EncodeUtf8(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function escapeForPythonTripleQuoted(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

/** Checks that generated loader has balanced parentheses (debug). */
function checkParenBalance(code: string): { ok: boolean; msg: string } {
  let depth = 0;
  const inStr = { single: false, double: false, triple: 0 };
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (inStr.triple > 0) {
      if (c === '"' && code.slice(i, i + 3) === '"""') {
        inStr.triple--;
        i += 2;
      }
      continue;
    }
    if (!inStr.single && !inStr.double && code.slice(i, i + 3) === '"""') {
      inStr.triple++;
      i += 2;
      continue;
    }
    if (c === "'" && !inStr.double) inStr.single = !inStr.single;
    else if (c === '"' && !inStr.single) inStr.double = !inStr.double;
    else if (!inStr.single && !inStr.double) {
      if (c === '(') depth++;
      else if (c === ')') depth--;
    }
  }
  return depth === 0
    ? { ok: true, msg: 'OK' }
    : { ok: false, msg: `Unbalanced parens: depth=${depth}` };
}

/**
 * Generates a Python loader that decrypts and executes the obfuscated payload.
 * Protection against exec→print/file extraction:
 * - Uses compile()+exec(code_object) so exec never receives source string
 * - Obfuscated exec/compile lookup (no literal "exec" in code)
 * - Integrity check: refuses to run if exec/compile were replaced
 * - Payload executed in isolated namespace (no access to loader variables)
 *
 * When aesEncryption=true: uses AES (requires pycryptodome at runtime).
 * When aesEncryption=false: uses base64 only (weaker, no extra deps).
 *
 * When externalKey=true: NO key is embedded. The key must be provided at
 * runtime via stdin (first line). Use with the Windows .exe launcher.
 */
const _EXEC_BYTES = [101, 120, 101, 99];   // "exec"
const _COMPILE_BYTES = [99, 111, 109, 112, 105, 108, 101];  // "compile" (i before l)

/** Builds Python expression that constructs "exec" or "compile" without literal. */
function pyChrSequence(bytes: number[]): string {
  return bytes.map(b => `chr(${b})`).join('+');
}

export function wrapInBytecodeLoader(
  source: string,
  aesEncryption: boolean,
  /** When true: encrypt with `key`, but do NOT embed key in the .py file.
   *  The key will be read from stdin at runtime (sent by the .exe launcher). */
  externalKey?: string,
): string {
  const execSeq = pyChrSequence(_EXEC_BYTES);
  const compileSeq = pyChrSequence(_COMPILE_BYTES);

  // Determine actual AES password
  const password = externalKey ?? AES_PASSWORD;

  // Isolated exec helper — same for all variants
  const execBlock = `(lambda _b: (lambda _en,_cn: (lambda _e,_c: (_e.__name__!=_en and (lambda: (_ for _ in ()).throw(RuntimeError("Integrity check failed")))() or (lambda _x: _e(_c(_x,"<p>",_en),__ns,__ns))(__p)))(getattr(_b,_en),getattr(_b,_cn)))(${execSeq},${compileSeq}))(__import__("builtins"))`;

  let loaderCode: string;

  if (externalKey !== undefined) {
    // ── EXE-launcher mode: key arrives on stdin, NOT stored in this file ─────
    const encrypted = CryptoJS.AES.encrypt(source, password).toString();
    const encEscaped = escapeForPythonTripleQuoted(encrypted);
    loaderCode = `import sys as _sys,base64 as _b64,hashlib as _hl
from Crypto.Cipher import AES as _AES
from Crypto.Util.Padding import unpad as _up
_pw=_sys.stdin.readline().strip().encode()
try:
    _sys.stdin=open("CONIN$","r")
except Exception:
    pass
def _dec(__s,__pw):
    __d=_b64.b64decode(__s);__t=__d[8:16];__c=__d[16:]
    __k=b'';__m=b''
    while len(__k)<48:__m=_hl.md5(__m+__pw+__t).digest();__k+=__m
    return _up(_AES.new(__k[:32],_AES.MODE_CBC,__k[32:48]).decrypt(__c),16).decode()
__p=_dec("""${encEscaped}""",_pw);del _pw
__ns=dict(__builtins__=__import__("builtins"),__name__="__main__",__file__=__file__ if "__file__" in dir() else "")
${execBlock}`;

  } else if (aesEncryption) {
    // ── Standard AES mode ─────────────────────────────────────────────────────
    const encrypted = CryptoJS.AES.encrypt(source, password).toString();
    const encEscaped = escapeForPythonTripleQuoted(encrypted);
    loaderCode = `import base64 as _b64
from Crypto.Cipher import AES as _AES
from Crypto.Util.Padding import unpad as _up
import hashlib as _hl
def _dec(__s):
    __d=_b64.b64decode(__s);__t=__d[8:16];__c=__d[16:]
    __k=b'';__m=b''
    while len(__k)<48:__m=_hl.md5(__m+b'${AES_PASSWORD}'+__t).digest();__k+=__m
    return _up(_AES.new(__k[:32],_AES.MODE_CBC,__k[32:48]).decrypt(__c),16).decode()
__p=_dec("""${encEscaped}""")
__ns=dict(__builtins__=__import__("builtins"),__name__="__main__")
${execBlock}`;

  } else {
    // ── Base64-only mode ──────────────────────────────────────────────────────
    const payloadBase64 = base64EncodeUtf8(source);
    const b64Escaped = escapeForPythonTripleQuoted(payloadBase64);
    loaderCode = `import base64 as _b64
__p=_b64.b64decode("""${b64Escaped}""").decode()
__ns=dict(__builtins__=__import__("builtins"),__name__="__main__")
${execBlock}`;
  }

  const { ok, msg } = checkParenBalance(loaderCode);
  if (!ok) throw new Error(`Bytecode loader: ${msg}`);
  return loaderCode;
}
