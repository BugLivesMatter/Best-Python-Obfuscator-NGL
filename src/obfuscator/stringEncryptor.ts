import CryptoJS from 'crypto-js';
import type { NameGenerator } from './nameGenerator';

const AES_PASSWORD = 'll11lll1';

// Hex-like variable names: start with [a-f], rest [0-9a-f], length 22
const HEX_CHARS = '0123456789abcdef';
const HEX_FIRST = 'abcdef';
const VAR_LEN = 22;

export interface EncryptedString {
  varName: string;
  stored: string;
  original: string;
  scheme: number;
}

function genHexName(counter: number, usedNames: Set<string>): string {
  let attempt = counter;
  while (true) {
    let n = (attempt * 1664525 + 1013904223) >>> 0;
    let name = HEX_FIRST[n % 6];
    for (let i = 1; i < VAR_LEN; i++) {
      n = (n * 22695477 + 1) >>> 0;
      name += HEX_CHARS[n % 16];
    }
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
    attempt++;
  }
}

/**
 * Extracts the actual string content from a Python token value.
 * Returns null if the token can't be safely extracted.
 */
function extractStringContent(tokenValue: string): { content: string; hasEscapes: boolean } | null {
  const prefixMatch = tokenValue.match(/^([brBRuU]{0,3})/);
  const prefix = prefixMatch ? prefixMatch[1] : '';
  const rest = tokenValue.slice(prefix.length);

  let content: string;

  if (rest.startsWith('"""')) {
    if (!rest.endsWith('"""') || rest.length < 6) return null;
    content = rest.slice(3, -3);
  } else if (rest.startsWith("'''")) {
    if (!rest.endsWith("'''") || rest.length < 6) return null;
    content = rest.slice(3, -3);
  } else if (rest.startsWith('"')) {
    if (!rest.endsWith('"') || rest.length < 2) return null;
    content = rest.slice(1, -1);
  } else if (rest.startsWith("'")) {
    if (!rest.endsWith("'") || rest.length < 2) return null;
    content = rest.slice(1, -1);
  } else {
    return null;
  }

  const isRaw = prefix.toLowerCase().includes('r');
  const hasEscapes = !isRaw && content.includes('\\');

  return { content, hasEscapes };
}

/**
 * Interprets Python string escape sequences, producing the actual string value.
 */
function unescapePython(raw: string): string {
  let result = '';
  let i = 0;
  while (i < raw.length) {
    if (raw[i] !== '\\') { result += raw[i++]; continue; }
    i++;
    if (i >= raw.length) { result += '\\'; break; }
    const c = raw[i];
    switch (c) {
      case 'n': result += '\n'; i++; break;
      case 't': result += '\t'; i++; break;
      case 'r': result += '\r'; i++; break;
      case '\\': result += '\\'; i++; break;
      case "'": result += "'"; i++; break;
      case '"': result += '"'; i++; break;
      case 'a': result += '\x07'; i++; break;
      case 'b': result += '\x08'; i++; break;
      case 'f': result += '\x0C'; i++; break;
      case 'v': result += '\x0B'; i++; break;
      case '0': result += '\x00'; i++; break;
      case 'x': {
        const h = raw.slice(i + 1, i + 3);
        if (/^[0-9a-fA-F]{2}$/.test(h)) { result += String.fromCharCode(parseInt(h, 16)); i += 3; }
        else { result += '\\x'; i++; }
        break;
      }
      case 'u': {
        const h = raw.slice(i + 1, i + 5);
        if (/^[0-9a-fA-F]{4}$/.test(h)) { result += String.fromCharCode(parseInt(h, 16)); i += 5; }
        else { result += '\\u'; i++; }
        break;
      }
      case 'U': {
        const h = raw.slice(i + 1, i + 9);
        if (/^[0-9a-fA-F]{8}$/.test(h)) { result += String.fromCodePoint(parseInt(h, 16)); i += 9; }
        else { result += '\\U'; i++; }
        break;
      }
      default: result += '\\' + c; i++; break;
    }
  }
  return result;
}

/**
 * Encrypts all encryptable string tokens using AES-CBC (OpenSSL KDF / CryptoJS format).
 * Generates hex-looking variable names for each unique string.
 * Returns:
 *  - encrypted: list of {varName, stored, scheme} records for the preamble
 *  - posToVarName: maps token.start → "decryptFunc(varName, scheme)" replacement text
 */
export function encryptStrings(
  stringTokenIndices: number[],
  tokens: { value: string; start: number }[],
  _nameGen: NameGenerator,
  decryptFuncName: string,
  usedHexNames: Set<string>,
  hard: boolean,
): {
  encrypted: EncryptedString[];
  posToVarName: Map<number, string>;
} {
  const encrypted: EncryptedString[] = [];
  const posToVarName = new Map<number, string>();
  const contentToInfo = new Map<string, { varName: string; scheme: number }>();
  let hexCounter = 0;

  for (const idx of stringTokenIndices) {
    const tok = tokens[idx];
    const parsed = extractStringContent(tok.value);
    if (!parsed) continue;

    let { content, hasEscapes } = parsed;
    if (content.length === 0) continue;

    if (hasEscapes) {
      try { content = unescapePython(content); }
      catch { continue; }
    }

    // Deduplicate: same content → same variable (same scheme)
    if (contentToInfo.has(content)) {
      const info = contentToInfo.get(content)!;
      posToVarName.set(tok.start, `${decryptFuncName}(${info.varName},${info.scheme})`);
      continue;
    }

    try {
      const encB64 = CryptoJS.AES.encrypt(content, AES_PASSWORD).toString();
      const varName = genHexName(hexCounter++, usedHexNames);
      const scheme = hard ? (hexCounter % 2) : 0;
      let stored: string;
      if (scheme === 1) {
        stored = encB64.split('').reverse().join('');
      } else {
        stored = encB64;
      }
      encrypted.push({ varName, stored, original: content, scheme });
      contentToInfo.set(content, { varName, scheme });
      posToVarName.set(tok.start, `${decryptFuncName}(${varName},${scheme})`);
    } catch {
      // Skip strings that fail to encrypt
    }
  }

  return { encrypted, posToVarName };
}

/**
 * Generates the Python preamble with:
 * - AES decrypt function (uses pycryptodome + EVP_BytesToKey)
 * - Global variables holding the AES-encrypted strings
 *
 * The decrypt function embeds the password "ll11lll1" so the caller
 * only needs to pass the encrypted base64 value.
 *
 * Requires at runtime: pip install pycryptodome
 */
export function generateDecryptPreamble(
  encrypted: EncryptedString[],
  decryptFuncName: string,
  hard = false,
): string {
  if (encrypted.length === 0) return '';

  const lines: string[] = [
    'import base64 as _b64,hashlib as _hl',
    'from Crypto.Cipher import AES as _AES',
    'from Crypto.Util.Padding import unpad as _up',
    'def _dec_core(__s):',
    '    __d=_b64.b64decode(__s);__t=__d[8:16];__c=__d[16:]',
    "    __k=b'';__m=b''",
    "    while len(__k)<48:__m=_hl.md5(__m+b'll11lll1'+__t).digest();__k+=__m",
    '    return _up(_AES.new(__k[:32],_AES.MODE_CBC,__k[32:48]).decrypt(__c),16).decode()',
    '',
  ];

  if (!hard) {
    lines.push(
      `def ${decryptFuncName}(__v,__scheme=0):`,
      '    if __scheme==0:',
      '        return _dec_core(__v)',
      '    if __scheme==1:',
      '        return _dec_core(__v[::-1])',
      '',
    );
  } else {
    lines.push(
      `def ${decryptFuncName}(__v,__scheme=0):`,
      '    def _dec_core(__s):',
      '        __d=_b64.b64decode(__s);__t=__d[8:16];__c=__d[16:]',
      "        __k=b'';__m=b''",
      "        while len(__k)<48:__m=_hl.md5(__m+b'll11lll1'+__t).digest();__k+=__m",
      '        return _up(_AES.new(__k[:32],_AES.MODE_CBC,__k[32:48]).decrypt(__c),16).decode()',
      '    __s=0',
      '    __s+=1',
      '    try:',
      '        raise MemoryError(__s)',
      '    except MemoryError as __e:',
      '        if __e.args[0]==1:',
      '            if __scheme==0:',
      '                __r=_dec_core(__v)',
      '            elif __scheme==1:',
      '                __r=_dec_core(__v[::-1])',
      '            else:',
      '                __r=_dec_core(__v)',
      '            try:',
      '                if _TAMPERED[0] and isinstance(__r,str) and __r:',
      '                    return __r[::-1]',
      '            except Exception:',
      '                pass',
      '            return __r',
      '',
    );
  }

  // String constants used by decryptor
  for (const enc of encrypted) {
    lines.push(`${enc.varName}="${enc.stored}"`);
  }

  if (hard) {
    const concat = encrypted.map((e) => e.stored).join('');
    const hashHex = CryptoJS.SHA256(concat).toString();
    const varList = encrypted.map((e) => e.varName).join(',');
    lines.push(
      '',
      `_STR_CONSTS=[${varList}]`,
      `_EXPECTED_STR_HASH="${hashHex}"`,
      'def _do_str_verify():',
      '    global _TAMPERED',
      '    _TAMPERED=[False]',
      '    def _ihash_strs():',
      '        try:',
      "            return _hl.sha256(''.join(_STR_CONSTS).encode()).hexdigest()",
      '        except Exception:',
      '            return None',
      '    __h=_ihash_strs()',
      '    if __h is None or __h!=_EXPECTED_STR_HASH:',
      '        _TAMPERED[0]=True',
      '_do_str_verify()',
      '',
    );
  }

  lines.push('');
  return lines.join('\n');
}
