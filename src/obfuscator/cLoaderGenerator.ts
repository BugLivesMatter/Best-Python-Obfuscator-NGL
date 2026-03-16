/**
 * Generates C source for a Python extension that loads and executes
 * the encrypted payload. Compile with: python setup.py build_ext --inplace
 * Requires: Python dev headers, pycryptodome (when useAes=true)
 *
 * Usage: import _obfload  # runs the protected code on import
 */
export function generateCLoaderSource(
  encryptedPayload: string,
  useAes: boolean,
): string {
  const hexParts: string[] = [];
  for (let i = 0; i < encryptedPayload.length; i++) {
    hexParts.push(encryptedPayload.charCodeAt(i).toString(16).padStart(2, '0'));
  }
  const hex = hexParts.join('');
  const hexPayload = hex.length ? (hex.match(/.{1,60}/g) ?? []).join('"\n"') : '';

  return `/*
 * Protected loader - compile: python setup.py build_ext --inplace
 * Run: import _obfload
 */
#define PY_SSIZE_T_CLEAN
#include <Python.h>
#include <string.h>
#include <stdlib.h>

static const char PAYLOAD_HEX[] = "${hexPayload}";
static const int USE_AES = ${useAes ? '1' : '0'};

static void hex2bytes(const char* h, char* o, size_t n) {
    for (size_t i = 0; i < n; i += 2) {
        unsigned int v; sscanf(h + i, "%2x", &v);
        o[i/2] = (char)v;
    }
}

static PyObject* run_payload(void) {
    size_t hn = strlen(PAYLOAD_HEX);
    size_t pn = hn / 2;
    char* p = (char*)malloc(pn + 1);
    if (!p) return NULL;
    hex2bytes(PAYLOAD_HEX, p, hn);
    p[pn] = 0;
    PyObject* obj = PyUnicode_FromString(p);
    free(p);
    if (!obj) return NULL;
    PyObject* g = PyDict_New();
    PyObject* l = PyDict_New();
    PyDict_SetItemString(g, "__builtins__", PyEval_GetBuiltins());
    PyDict_SetItemString(g, "_p", obj);
    Py_DECREF(obj);
    /* Uses compile+exec(code_obj) - exec never receives source. Obfuscated lookup. */
    const char* code = USE_AES
        ? "import base64 as _b\\nfrom Crypto.Cipher import AES as _A\\nfrom Crypto.Util.Padding import unpad as _u\\nimport hashlib as _h\\n"
          "_d=_b.b64decode(_p);_t=_d[8:16];_c=_d[16:]\\n"
          "_k=b'';_m=b''\\n"
          "while len(_k)<48:_m=_h.md5(_m+b'll11lll1'+_t).digest();_k+=_m\\n"
          "_s=_u(_A.new(_k[:32],_A.MODE_CBC,_k[32:48]).decrypt(_c),16).decode()\\n"
          "_e=getattr(__import__('builtins'),chr(101)+chr(120)+chr(101)+chr(99))\\n"
          "_e(compile(_s,'<p>',chr(101)+chr(120)+chr(101)+chr(99)))"
        : "import base64 as _b\\n"
          "_s=_b.b64decode(_p).decode()\\n"
          "_e=getattr(__import__('builtins'),chr(101)+chr(120)+chr(101)+chr(99))\\n"
          "_e(compile(_s,'<p>',chr(101)+chr(120)+chr(101)+chr(99)))";
    PyObject* r = PyRun_String(code, Py_file_input, g, l);
    Py_DECREF(g); Py_DECREF(l);
    Py_XDECREF(r);
    return Py_None;
}

static PyMethodDef methods[] = {{"load", (PyCFunction)run_payload, METH_NOARGS, NULL}, {NULL, NULL, 0, NULL}};
static struct PyModuleDef mod = {PyModuleDef_HEAD_INIT, "_obfload", NULL, -1, methods};

PyMODINIT_FUNC PyInit__obfload(void) {
    PyObject* m = PyModule_Create(&mod);
    if (m) run_payload();
    return m;
}
`;
}
