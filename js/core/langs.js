/*
 * langs.js — language detection and keyword sets.
 *
 * Whichever code you paste, the game wants to know two things: what to call it
 * (shown in the HUD) and which words are worth turning into brutes. Python's
 * keywords are useless on a C program, so each language brings its own list.
 */
(function (BL) {
  'use strict';

  /** Keywords that make good brutes: short, common, unambiguous. */
  const KEYWORDS = {
    python: ['def', 'class', 'return', 'import', 'from', 'lambda', 'yield', 'while', 'for', 'elif',
      'else', 'try', 'except', 'finally', 'with', 'async', 'await', 'raise', 'assert', 'global',
      'nonlocal', 'None', 'True', 'False', 'print', 'pass', 'break', 'continue', 'in', 'is', 'not',
      'and', 'or', 'self', 'range', 'len', 'append', 'format', 'str', 'int'],
    c: ['int', 'char', 'void', 'return', 'struct', 'typedef', 'static', 'const', 'unsigned', 'long',
      'short', 'float', 'double', 'while', 'switch', 'case', 'break', 'continue', 'sizeof', 'include',
      'define', 'printf', 'scanf', 'malloc', 'free', 'NULL', 'for', 'else', 'if', 'main'],
    cpp: ['include', 'using', 'namespace', 'std', 'template', 'typename', 'class', 'public',
      'private', 'protected', 'virtual', 'override', 'constexpr', 'nullptr', 'auto', 'vector',
      'string', 'return', 'struct', 'cout', 'cin', 'endl', 'new', 'delete', 'this', 'while', 'for'],
    rust: ['fn', 'let', 'mut', 'pub', 'use', 'mod', 'impl', 'struct', 'enum', 'match', 'Some', 'None',
      'Ok', 'Err', 'unwrap', 'iter', 'collect', 'String', 'Vec', 'self', 'where', 'dyn', 'async',
      'await', 'return', 'loop', 'while', 'for', 'else'],
    go: ['package', 'func', 'var', 'const', 'type', 'struct', 'interface', 'range', 'defer', 'chan',
      'select', 'map', 'string', 'error', 'nil', 'true', 'false', 'return', 'import', 'fmt', 'Printf',
      'Sprintf', 'append', 'make', 'len', 'goroutine'],
    js: ['function', 'const', 'let', 'var', 'return', 'async', 'await', 'class', 'extends', 'import',
      'export', 'default', 'from', 'this', 'new', 'typeof', 'instanceof', 'console', 'require',
      'module', 'exports', 'promise', 'then', 'catch', 'finally', 'throw', 'null', 'undefined',
      'true', 'false', 'forEach', 'map', 'filter', 'reduce'],
    ts: ['interface', 'type', 'enum', 'implements', 'readonly', 'declare', 'namespace', 'as',
      'function', 'const', 'let', 'return', 'async', 'await', 'class', 'import', 'export', 'public',
      'private', 'protected', 'number', 'string', 'boolean', 'void', 'never', 'unknown', 'any'],
    java: ['public', 'private', 'protected', 'class', 'interface', 'static', 'final', 'void',
      'return', 'import', 'package', 'new', 'this', 'super', 'extends', 'implements', 'String',
      'System', 'println', 'Integer', 'Boolean', 'throws', 'catch', 'finally', 'for', 'while'],
    csharp: ['using', 'namespace', 'public', 'private', 'protected', 'internal', 'class', 'struct',
      'interface', 'static', 'readonly', 'void', 'return', 'string', 'int', 'bool', 'var', 'new',
      'this', 'base', 'async', 'await', 'Console', 'WriteLine', 'foreach', 'get', 'set'],
    ruby: ['def', 'end', 'class', 'module', 'require', 'attr_accessor', 'puts', 'do', 'each', 'map',
      'select', 'reject', 'nil', 'true', 'false', 'return', 'yield', 'unless', 'elsif', 'then',
      'self', 'initialize'],
    shell: ['echo', 'export', 'cd', 'then', 'else', 'elif', 'fi', 'do', 'done', 'case', 'esac',
      'function', 'local', 'return', 'exit', 'set', 'if', 'for', 'while', 'read', 'sudo', 'mkdir',
      'rm', 'cp', 'mv', 'cat', 'grep', 'awk', 'sed'],
    sql: ['select', 'from', 'where', 'join', 'left', 'inner', 'group', 'order', 'having', 'limit',
      'insert', 'update', 'delete', 'create', 'table', 'index', 'values', 'and', 'or', 'not',
      'count', 'sum', 'avg', 'case', 'when', 'as', 'on', 'distinct', 'union'],
    html: ['html', 'head', 'body', 'div', 'span', 'class', 'href', 'src', 'meta', 'title', 'script',
      'style', 'link', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'form', 'input', 'button', 'ul',
      'li', 'nav', 'main', 'section', 'header', 'footer'],
    css: ['color', 'background', 'margin', 'padding', 'display', 'flex', 'grid', 'border', 'font',
      'width', 'height', 'position', 'absolute', 'relative', 'transform', 'transition', 'hover',
      'media', 'import', 'root', 'important', 'none', 'block'],
    json: ['true', 'false', 'null', 'name', 'type', 'value', 'id', 'data', 'version', 'items'],
    yaml: ['name', 'version', 'true', 'false', 'null', 'on', 'off', 'yes', 'no', 'steps', 'image',
      'jobs', 'host', 'port'],
    markdown: ['the', 'and', 'for', 'with', 'this', 'that', 'from'],
    plaintext: ['the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'will', 'your'],
  };

  /** Order matters: the first match wins, so specific beats generic. */
  const DETECT = [
    { id: 'python', name: 'python', test: (t) =>
        /^\s*def\s+\w+\s*\(|^\s*class\s+\w+.*:\s*$/m.test(t) ||
        /\b(elif|__init__|self\.\w+|print\()/.test(t) ||
        /^\s*(import|from)\s+[\w.]+/m.test(t) },
    { id: 'rust', name: 'rust', test: (t) => /\bfn\s+\w+\s*[(<]|\blet\s+mut\b|println!|::new\(\)/.test(t) },
    { id: 'go', name: 'go', test: (t) => /^\s*package\s+\w+|:=|func\s+\w+\s*\(/m.test(t) },
    { id: 'csharp', name: 'c#', test: (t) => /Console\.Write|using\s+System|\bnamespace\s+\w+\./.test(t) },
    { id: 'java', name: 'java', test: (t) => /System\.out\.print|\bpublic\s+(static\s+)?(void|class)\b|import\s+java\./.test(t) },
    { id: 'cpp', name: 'c++', test: (t) => /#include\s*<(iostream|vector|string|memory|map)>|\bstd::|\bcout\s*<<|\btemplate\s*</.test(t) },
    { id: 'c', name: 'c', test: (t) => /#include\s*<|\bint\s+main\s*\(|\bprintf\s*\(|\bmalloc\s*\(|\bstruct\s+\w+\s*\{/.test(t) },
    { id: 'ts', name: 'typescript', test: (t) => /\binterface\s+\w+\s*\{|:\s*(string|number|boolean)\b|\bas\s+const\b/.test(t) },
    { id: 'js', name: 'javascript', test: (t) => /\b(const|let|var)\s+\w+\s*=|=>\s*\{|console\.log|require\(|function\s+\w+\s*\(/.test(t) },
    { id: 'ruby', name: 'ruby', test: (t) => /\bdef\s+\w+[?!]?\s*(\(|$)|\battr_accessor\b|\bdo\s*\|[^|]*\||\bputs\b/.test(t) },
    { id: 'sql', name: 'sql', test: (t) => /\b(select|insert\s+into|update|delete\s+from|create\s+table)\b/i.test(t) },
    { id: 'html', name: 'html', test: (t) => /<\/?(html|div|span|p|body|head|table|section|a)\b[^>]*>/i.test(t) },
    { id: 'css', name: 'css', test: (t) => /[.#@]?[\w-]+\s*\{[^}]*:[^}]*;[^}]*\}/.test(t) },
    { id: 'json', name: 'json', test: (t) => { try { const v = JSON.parse(t); return typeof v === 'object'; } catch (e) { return false; } } },
    { id: 'yaml', name: 'yaml', test: (t) => /^\s*[\w-]+:\s+\S/m.test(t) && !/[{};]/.test(t.slice(0, 200)) },
    { id: 'shell', name: 'shell', test: (t) => /^#!\/(bin|usr\/bin)\/(ba)?sh|^\s*(echo|export|sudo|cd)\s/m.test(t) || /\bthen\b[\s\S]*\bfi\b/.test(t) },
    { id: 'markdown', name: 'markdown', test: (t) => /^\s*#{1,6}\s+\S/m.test(t) || /^\s*[-*]\s+\S/m.test(t) },
  ];

  function detect(text) {
    const sample = String(text || '').slice(0, 8000);
    for (const d of DETECT) {
      let hit = false;
      try {
        hit = d.test(sample);
      } catch (e) {
        hit = false;
      }
      if (hit) return d;
    }
    return { id: 'plaintext', name: 'text' };
  }

  function keywordsFor(id) {
    return new Set(KEYWORDS[id] || KEYWORDS.plaintext);
  }

  BL.langs = { detect, keywordsFor, KEYWORDS };
})(window.BL = window.BL || {});
