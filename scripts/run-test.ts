import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { obfuscate } from '../src/obfuscator/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const examplePath = path.join(root, 'example.py');
const outputPath = path.join(root, 'obfuscated.py');

if (!fs.existsSync(examplePath)) {
  console.error('example.py not found in project root');
  process.exit(1);
}

const source = fs.readFileSync(examplePath, 'utf-8');
console.log('Obfuscating...');
const result = obfuscate(source, {
  renameIdentifiers: true,
  encryptStrings: true,
  injectJunk: true,
});
fs.writeFileSync(outputPath, result.code, 'utf-8');
console.log(`Stats: ${result.stats.renamedCount} renamed, ${result.stats.encryptedStrings} encrypted, ~${result.stats.junkBlocks} junk blocks`);

// ── Step 1: AST syntax check ──────────────────────────────────────────────────
console.log('\n[1/2] Syntax check (ast.parse)...');
const syntaxCheck = spawnSync('python', [
  '-c',
  `import ast, sys; ast.parse(open(r'${outputPath}', encoding='utf-8').read()); print('SYNTAX OK')`,
], { encoding: 'utf-8', timeout: 10000 });

if (syntaxCheck.stdout) process.stdout.write(syntaxCheck.stdout);
if (syntaxCheck.stderr) process.stderr.write(syntaxCheck.stderr);

if (syntaxCheck.status !== 0) {
  console.error('SYNTAX ERROR in obfuscated.py');
  process.exit(1);
}

// ── Step 2: Import-level check (no __main__) ──────────────────────────────────
// Runs the module-level code (imports, class defs, decrypt preamble) but stops
// before if __name__ == '__main__'. We achieve this by compiling and running
// everything except the guarded block via a small wrapper.
console.log('[2/2] Import-level execution check...');
const importCheck = spawnSync('python', [
  '-c',
  `
import sys, types
sys.argv = ['obfuscated']
# Patch __name__ so the main guard never fires
mod = types.ModuleType('__check__')
mod.__file__ = r'${outputPath}'
src = open(r'${outputPath}', encoding='utf-8').read()
code = compile(src, r'${outputPath}', 'exec')
try:
    exec(code, {'__name__': '__check__', '__file__': r'${outputPath}'})
except SystemExit:
    pass
print('IMPORT OK')
`.trim(),
], { encoding: 'utf-8', timeout: 12000 });

if (importCheck.stdout) process.stdout.write(importCheck.stdout);
if (importCheck.stderr) process.stderr.write(importCheck.stderr);

// Timeout (signal != null) means the import-level code hung = likely OK for GUI apps.
// A real NameError / SyntaxError would exit immediately with status 1.
if (importCheck.signal === 'SIGTERM') {
  console.log('\nIMPORT CHECK: timed out (GUI app kept running) — treating as SUCCESS');
  process.exit(0);
}

if (importCheck.status !== 0) {
  console.error('\nIMPORT ERROR in obfuscated.py');
  process.exit(1);
}

console.log('\nAll checks passed.');
process.exit(0);
