import CryptoJS from 'crypto-js';
import { tokenize } from './tokenizer';
import { collectRenameableNames, findEncryptableStrings } from './analyzer';
import { NameGenerator } from './nameGenerator';
import { encryptStrings, generateDecryptPreamble } from './stringEncryptor';
import { applyTransformations } from './transformer';
import { injectJunkCode } from './junkGenerator';
import { minifyPython } from './minifier';
import { flattenControlFlow } from './controlFlowFlattener';
import { injectAntiDebugging } from './antiDebugging';
import { wrapInBytecodeLoader } from './bytecodeLoader';
import { generateCLoaderSource } from './cLoaderGenerator';
import { generateWinLauncherSource } from './winLauncherGenerator';

/** Generates a cryptographically random hex string of given byte length. */
function randomHexKey(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    // Node.js fallback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto') as { randomFillSync(buf: Uint8Array): void };
    nodeCrypto.randomFillSync(arr);
  }
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface ObfuscatorOptions {
  renameIdentifiers: boolean;
  encryptStrings: boolean;
  injectJunk: boolean;
  minify: boolean;
  hard?: boolean;
  bytecodeMode?: boolean;
  aesEncryption?: boolean;
  cLoader?: boolean;
  pyobfusLike?: boolean;
  /** When true: generate a .py with NO embedded key + a C Windows launcher
   *  that holds the key and sends it via stdin at runtime. */
  exeLauncher?: boolean;
  /** true = no console window (GUI app), false = console app. Default: true */
  exeLauncherGui?: boolean;
}

export interface ObfuscatorResult {
  code: string;
  cLoaderCode?: string;
  /** C source for the Windows .exe launcher (exeLauncher mode). */
  winLauncherCode?: string;
  stats: {
    renamedCount: number;
    encryptedStrings: number;
    junkBlocks: number;
  };
}

export function obfuscate(source: string, options: ObfuscatorOptions = {
  renameIdentifiers: true,
  encryptStrings: true,
  injectJunk: true,
  minify: true,
}): ObfuscatorResult {
  const isHard = options.hard === true;
  const pyobfusLike = options.pyobfusLike === true;

  // Step 1: Tokenize
  const tokens = tokenize(source);

  // Step 2: Collect renameable identifiers
  const renameableNames = options.renameIdentifiers
    ? collectRenameableNames(tokens, { preserveParamNames: pyobfusLike })
    : new Set<string>();

  // Step 3: Initialize name generator (seeded with existing names to avoid collisions)
  const allNames = new Set([
    ...tokens.filter(t => t.type === 'IDENTIFIER' || t.type === 'KEYWORD').map(t => t.value),
  ]);
  const nameGen = new NameGenerator(allNames, pyobfusLike ? 'In' : 'lI1');

  // Step 4: Build rename mapping
  const nameMapping = nameGen.buildMapping(renameableNames);

  // Step 5: Find and encrypt strings
  const encryptableIndices = options.encryptStrings ? findEncryptableStrings(tokens) : [];
  const decryptFuncName = nameGen.next();
  const usedHexNames = new Set<string>();

  const { encrypted, posToVarName } = encryptStrings(
    encryptableIndices,
    tokens,
    nameGen,
    decryptFuncName,
    usedHexNames,
    isHard,
  );

  // Step 6: Apply transformations (rename + string replacement + optional docstring strip)
  let transformed = applyTransformations(tokens, nameMapping, posToVarName, {
    stripDocstrings: pyobfusLike,
  });

  // Step 7: Prepend decrypt preamble
  const preamble = generateDecryptPreamble(encrypted, decryptFuncName, isHard);
  if (preamble) {
    transformed = preamble + transformed;
  }

  // pyobfus-like: Control flow flattening
  if (pyobfusLike) {
    transformed = flattenControlFlow(transformed);
  }

  // Step 8: Inject junk code
  if (options.injectJunk) {
    transformed = injectJunkCode(transformed, nameGen, isHard || pyobfusLike);
  }

  // pyobfus-like: Anti-debugging injection
  if (pyobfusLike) {
    transformed = injectAntiDebugging(transformed);
  }

  // Step 9: Minify — shrink indentation, remove blank lines, join statements
  if (options.minify) {
    transformed = minifyPython(transformed);
  }

  let finalCode = transformed;
  let cLoaderCode: string | undefined;
  let winLauncherCode: string | undefined;

  // Step 10: Bytecode mode — wrap in loader that decrypts and exec()'s
  const bytecodeMode = options.bytecodeMode === true;
  const aesEncryption = options.aesEncryption !== false;
  const cLoader = options.cLoader === true && bytecodeMode;
  const exeLauncher = options.exeLauncher === true && bytecodeMode;

  if (bytecodeMode) {
    if (exeLauncher) {
      // Generate a fresh random key — NOT stored in the .py file
      const launcherKey = randomHexKey(32);
      finalCode = wrapInBytecodeLoader(transformed, true, launcherKey);
      const guiApp = options.exeLauncherGui !== false;
      winLauncherCode = generateWinLauncherSource(launcherKey, guiApp);
    } else {
      finalCode = wrapInBytecodeLoader(transformed, aesEncryption);
    }

    if (cLoader && !exeLauncher) {
      const encryptedPayload = aesEncryption
        ? CryptoJS.AES.encrypt(transformed, 'll11lll1').toString()
        : btoa(unescape(encodeURIComponent(transformed)));
      cLoaderCode = generateCLoaderSource(encryptedPayload, aesEncryption);
    }
  }

  return {
    code: finalCode,
    cLoaderCode,
    winLauncherCode,
    stats: {
      renamedCount: nameMapping.size,
      encryptedStrings: encrypted.length,
      junkBlocks: options.injectJunk ? Math.floor(transformed.split('\n').length / 8) : 0,
    },
  };
}
