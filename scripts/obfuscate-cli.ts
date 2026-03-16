import * as fs from 'fs';
import * as path from 'path';
import { obfuscate } from '../src/obfuscator/index';

const inputPath = process.argv[2] || 'example.py';
const outputPath = process.argv[3] || inputPath.replace(/\.py$/, '_obf.py').replace(/([^/\\]+)$/, 'obf_$1');

const fullInput = path.resolve(process.cwd(), inputPath);
const fullOutput = path.resolve(process.cwd(), outputPath);

if (!fs.existsSync(fullInput)) {
  console.error(`File not found: ${fullInput}`);
  process.exit(1);
}

const source = fs.readFileSync(fullInput, 'utf-8');
const noBytecode     = process.argv.includes('--no-bytecode');
const useExeLauncher = process.argv.includes('--exe-launcher');

const modes: string[] = ['hard'];
if (!noBytecode) modes.push('bytecode');
if (useExeLauncher) modes.push('exe-launcher');
modes.push('aes', 'pyobfus-like');
console.log(`Obfuscating with: ${modes.join(', ')}...`);

const result = obfuscate(source, {
  renameIdentifiers: true,
  encryptStrings: true,
  injectJunk: true,
  minify: true,
  hard: true,
  bytecodeMode: !noBytecode,
  aesEncryption: true,
  cLoader: false,
  pyobfusLike: true,
  exeLauncher: useExeLauncher,
  exeLauncherGui: true,
});

fs.writeFileSync(fullOutput, result.code, 'utf-8');
console.log(`Written: ${fullOutput}`);

if (result.winLauncherCode) {
  const launcherPath = fullOutput.replace(/\.py$/i, '_launcher.c');
  fs.writeFileSync(launcherPath, result.winLauncherCode, 'utf-8');
  console.log(`Launcher C: ${launcherPath}`);
  console.log('');
  console.log('Compile launcher (MinGW/GCC):');
  console.log(`  gcc "${path.basename(launcherPath)}" -o "${path.basename(fullOutput, '.py')}.exe" -lkernel32 -mwindows`);
  console.log('Compile launcher (MSVC):');
  console.log(`  cl "${path.basename(launcherPath)}" /Fe:"${path.basename(fullOutput, '.py')}.exe"`);
}

console.log('Stats:', result.stats);
