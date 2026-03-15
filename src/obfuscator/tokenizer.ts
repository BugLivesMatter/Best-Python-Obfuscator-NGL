export const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
  'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
  'while', 'with', 'yield',
]);

export const PYTHON_BUILTINS = new Set([
  'abs', 'all', 'any', 'ascii', 'bin', 'bool', 'breakpoint', 'bytearray',
  'bytes', 'callable', 'chr', 'classmethod', 'compile', 'complex',
  'delattr', 'dict', 'dir', 'divmod', 'enumerate', 'eval', 'exec',
  'filter', 'float', 'format', 'frozenset', 'getattr', 'globals',
  'hasattr', 'hash', 'help', 'hex', 'id', 'input', 'int', 'isinstance',
  'issubclass', 'iter', 'len', 'list', 'locals', 'map', 'max',
  'memoryview', 'min', 'next', 'object', 'oct', 'open', 'ord', 'pow',
  'print', 'property', 'range', 'repr', 'reversed', 'round', 'set',
  'setattr', 'slice', 'sorted', 'staticmethod', 'str', 'sum', 'super',
  'tuple', 'type', 'vars', 'zip',
  'ArithmeticError', 'AssertionError', 'AttributeError', 'BaseException',
  'BlockingIOError', 'BrokenPipeError', 'BufferError', 'BytesWarning',
  'ChildProcessError', 'ConnectionAbortedError', 'ConnectionError',
  'ConnectionRefusedError', 'ConnectionResetError', 'DeprecationWarning',
  'EOFError', 'EnvironmentError', 'Exception', 'FileExistsError',
  'FileNotFoundError', 'FloatingPointError', 'FutureWarning', 'GeneratorExit',
  'IOError', 'ImportError', 'ImportWarning', 'IndentationError', 'IndexError',
  'InterruptedError', 'IsADirectoryError', 'KeyError', 'KeyboardInterrupt',
  'LookupError', 'MemoryError', 'ModuleNotFoundError', 'NameError',
  'NotADirectoryError', 'NotImplemented', 'NotImplementedError', 'OSError',
  'OverflowError', 'PendingDeprecationWarning', 'PermissionError',
  'ProcessLookupError', 'RecursionError', 'ReferenceError', 'ResourceWarning',
  'RuntimeError', 'RuntimeWarning', 'StopAsyncIteration', 'StopIteration',
  'SyntaxError', 'SyntaxWarning', 'SystemError', 'SystemExit', 'TabError',
  'TimeoutError', 'TypeError', 'UnboundLocalError', 'UnicodeDecodeError',
  'UnicodeEncodeError', 'UnicodeError', 'UnicodeTranslateError', 'UnicodeWarning',
  'UserWarning', 'ValueError', 'Warning', 'ZeroDivisionError',
  'copyright', 'credits', 'exit', 'license', 'quit',
  'Ellipsis', 'NotImplemented',
  '__build_class__', '__debug__', '__doc__', '__import__', '__loader__',
  '__name__', '__package__', '__spec__',
]);

export type TokenType =
  | 'KEYWORD'
  | 'IDENTIFIER'
  | 'NUMBER'
  | 'STRING'
  | 'COMMENT'
  | 'OP'
  | 'NEWLINE'
  | 'WHITESPACE'
  | 'CONTINUATION'
  | 'UNKNOWN';

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
}

// Patterns tried in priority order
const PATTERNS: { type: TokenType; re: RegExp }[] = [
  // Triple-quoted strings with optional prefixes (rb, br, fr, rf, r, b, f, u)
  { type: 'STRING', re: /^[brfuBRFU]{0,3}"""[\s\S]*?"""/ },
  { type: 'STRING', re: /^[brfuBRFU]{0,3}'''[\s\S]*?'''/ },
  // Single-line strings
  { type: 'STRING', re: /^[brfuBRFU]{0,3}"(?:[^"\\]|\\.)*"/ },
  { type: 'STRING', re: /^[brfuBRFU]{0,3}'(?:[^'\\]|\\.)*'/ },
  // Comments
  { type: 'COMMENT', re: /^#[^\n]*/ },
  // Line continuation
  { type: 'CONTINUATION', re: /^\\\n/ },
  // Newlines
  { type: 'NEWLINE', re: /^\n/ },
  // Whitespace (non-newline)
  { type: 'WHITESPACE', re: /^[ \t\r]+/ },
  // Numbers (hex, octal, binary, float, complex, int)
  { type: 'NUMBER', re: /^(?:0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+|\d+\.?\d*(?:[eE][+-]?\d+)?[jJ]?|\.\d+(?:[eE][+-]?\d+)?[jJ]?)/ },
  // Identifiers
  { type: 'IDENTIFIER', re: /^[a-zA-Z_][a-zA-Z0-9_]*/ },
  // Multi-char operators (longer first)
  { type: 'OP', re: /^(?:\*\*=|\/\/=|<<=|>>=|\*\*|\/\/|<<|>>|->|:=|==|!=|<=|>=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|@=|\.\.\.)/ },
  // Single-char operators and delimiters
  { type: 'OP', re: /^[+\-*/%&|^~<>=!@()\[\]{},:.;\\@]/ },
];

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < source.length) {
    let matched = false;

    for (const { type, re } of PATTERNS) {
      const slice = source.slice(pos);
      const match = slice.match(re);

      if (match) {
        const value = match[0];
        let tokenType = type;

        if (type === 'IDENTIFIER' && PYTHON_KEYWORDS.has(value)) {
          tokenType = 'KEYWORD';
        }

        tokens.push({ type: tokenType, value, start: pos, end: pos + value.length });
        pos += value.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      tokens.push({ type: 'UNKNOWN', value: source[pos], start: pos, end: pos + 1 });
      pos++;
    }
  }

  return tokens;
}

export function isDunder(name: string): boolean {
  return name.startsWith('__') && name.endsWith('__');
}

export function isProtectedName(name: string): boolean {
  return PYTHON_KEYWORDS.has(name) || PYTHON_BUILTINS.has(name) || isDunder(name);
}
