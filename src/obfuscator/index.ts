import { tokenize } from './tokenizer';
import { collectRenameableNames, findEncryptableStrings } from './analyzer';
import { NameGenerator } from './nameGenerator';
import { encryptStrings, generateDecryptPreamble } from './stringEncryptor';
import { applyTransformations } from './transformer';
import { injectJunkCode } from './junkGenerator';
import { minifyPython } from './minifier';

export interface ObfuscatorOptions {
  renameIdentifiers: boolean;
  encryptStrings: boolean;
  injectJunk: boolean;
  minify: boolean;
}

export interface ObfuscatorResult {
  code: string;
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
  // Step 1: Tokenize
  const tokens = tokenize(source);

  // Step 2: Collect renameable identifiers
  const renameableNames = options.renameIdentifiers
    ? collectRenameableNames(tokens)
    : new Set<string>();

  // Step 3: Initialize name generator (seeded with existing names to avoid collisions)
  const allNames = new Set([
    ...tokens.filter(t => t.type === 'IDENTIFIER' || t.type === 'KEYWORD').map(t => t.value),
  ]);
  const nameGen = new NameGenerator(allNames);

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
  );

  // Step 6: Apply transformations (rename + string replacement)
  let transformed = applyTransformations(tokens, nameMapping, posToVarName);

  // Step 7: Prepend decrypt preamble
  const preamble = generateDecryptPreamble(encrypted, decryptFuncName);
  if (preamble) {
    transformed = preamble + transformed;
  }

  // Step 8: Inject junk code
  if (options.injectJunk) {
    transformed = injectJunkCode(transformed, nameGen);
  }

  // Step 9: Minify — shrink indentation, remove blank lines, join statements
  if (options.minify) {
    transformed = minifyPython(transformed);
  }

  return {
    code: transformed,
    stats: {
      renamedCount: nameMapping.size,
      encryptedStrings: encrypted.length,
      junkBlocks: options.injectJunk ? Math.floor(transformed.split('\n').length / 8) : 0,
    },
  };
}
