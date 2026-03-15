/**
 * Generates confusing names made of 'l', 'I', '1'.
 * First character is always 'l' or 'I' (never '1', as it looks like a number).
 */

const CHARS = ['l', 'I', '1'];
const FIRST_CHARS = ['l', 'I'];

export class NameGenerator {
  private used = new Set<string>();
  private counter = 0;

  constructor(existingNames?: Set<string>) {
    if (existingNames) {
      for (const n of existingNames) this.used.add(n);
    }
  }

  /** Generate the next unique confusing name. */
  next(): string {
    while (true) {
      const name = this.fromIndex(this.counter++);
      if (!this.used.has(name)) {
        this.used.add(name);
        return name;
      }
    }
  }

  private fromIndex(idx: number): string {
    // The sequence:
    // Length 4: first char from FIRST_CHARS (2), rest from CHARS (3) → 2*27 = 54 names
    // Length 5: 2*81 = 162 names, etc.
    // Start at length 4 to avoid short confusing names that might clash with builtins
    let name = '';
    let n = idx;

    // Determine length (start at 4)
    let length = 4;
    let count = 2 * Math.pow(3, length - 1); // names at this length
    while (n >= count) {
      n -= count;
      length++;
      count = 2 * Math.pow(3, length - 1);
    }

    // First char
    const firstCharIdx = Math.floor(n / Math.pow(3, length - 1));
    name += FIRST_CHARS[firstCharIdx];
    n = n % Math.pow(3, length - 1);

    // Remaining chars
    for (let i = length - 2; i >= 0; i--) {
      const charIdx = Math.floor(n / Math.pow(3, i));
      name += CHARS[charIdx];
      n = n % Math.pow(3, i);
    }

    return name;
  }

  /** Build a mapping from original names to obfuscated names. */
  buildMapping(names: Set<string>): Map<string, string> {
    const mapping = new Map<string, string>();
    for (const name of names) {
      mapping.set(name, this.next());
    }
    return mapping;
  }
}
