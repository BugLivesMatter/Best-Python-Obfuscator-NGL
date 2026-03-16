export interface VMTransformOptions {
  hard: boolean;
}

/**
 * Simple VM layer: takes top-level simple statements and packs them
 * into a base64-encoded instruction array executed by a tiny interpreter loop.
 *
 * This prevents a trivial static read of the code —
 * an analyst has to trace through the VM dispatch to understand what happens.
 */
export function wrapWithVM(source: string, _opts: VMTransformOptions): string {
  const lines = source.split('\n');

  const topLevelSimple: { idx: number; stmt: string }[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (line[0] === ' ' || line[0] === '\t') continue;

    if (trimmed.startsWith('import ') || trimmed.startsWith('from ') ||
        trimmed.startsWith('def ') || trimmed.startsWith('async def ') ||
        trimmed.startsWith('class ') || trimmed.startsWith('if ') ||
        trimmed.startsWith('elif ') || trimmed.startsWith('else:') ||
        trimmed.startsWith('for ') || trimmed.startsWith('while ') ||
        trimmed.startsWith('try:') || trimmed.startsWith('except') ||
        trimmed.startsWith('finally:') || trimmed.startsWith('with ') ||
        trimmed.startsWith('@') || trimmed.startsWith('raise ') ||
        trimmed.startsWith('yield') || trimmed.startsWith('return')) {
      continue;
    }

    if (trimmed.includes('=') || trimmed.includes('(')) {
      topLevelSimple.push({ idx: i, stmt: trimmed });
      consumed.add(i);
    }
  }

  if (topLevelSimple.length < 3) return source;

  const maxBatch = Math.min(topLevelSimple.length, 40);
  const batch = topLevelSimple.slice(0, maxBatch);

  const encoded = batch.map(b => {
    const b64 = btoa(unescape(encodeURIComponent(b.stmt)));
    return `"${b64}"`;
  });

  const vmBlock = [
    `_vm_ops=[${encoded.join(',')}]`,
    'import base64 as _vb64',
    'for _vm_i in _vm_ops:',
    '    exec(compile(_vb64.b64decode(_vm_i).decode(),"<vm>","exec"))',
    'del _vm_ops,_vb64,_vm_i',
  ];

  const firstIdx = batch[0].idx;
  const lastIdx = batch[batch.length - 1].idx;

  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i) && i >= firstIdx && i <= lastIdx) {
      if (i === firstIdx) {
        result.push(...vmBlock);
      }
      continue;
    }
    result.push(lines[i]);
  }

  return result.join('\n');
}
