/**
 * Generates a Windows C launcher (.exe) that:
 *  1. Has the AES key XOR-obfuscated inside the binary
 *  2. Launches `python <same-name>.py` as a child process
 *  3. Sends the key to the Python process via stdin pipe
 *
 * Build:
 *   gcc launcher.c -o launcher.exe -lkernel32 -mwindows   (GUI, no console)
 *   gcc launcher.c -o launcher.exe -lkernel32              (console)
 *
 * Convention: launcher.exe and protected.py must be in the same folder
 * with the same base name (e.g. app.exe + app.py).
 */
export function generateWinLauncherSource(key: string, guiApp = true): string {
  // XOR-obfuscate the key bytes with a pseudo-random mask
  const keyBytes = Array.from(key).map(c => c.charCodeAt(0));
  const maskLen = 17; // prime length mask avoids obvious patterns
  const mask: number[] = [];
  let rng = 0xA3F1C2B7;
  for (let i = 0; i < maskLen; i++) {
    rng = ((rng * 1664525 + 1013904223) >>> 0);
    mask.push(rng & 0xFF);
  }
  const xored = keyBytes.map((b, i) => b ^ mask[i % maskLen]);

  const cMask = mask.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(',');
  const cData = xored.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(',');
  const keyLen = key.length;

  const subsystem = guiApp
    ? '#pragma comment(linker, "/SUBSYSTEM:WINDOWS")'
    : '#pragma comment(linker, "/SUBSYSTEM:CONSOLE")';

  return `/*
 * Protected launcher — compile on Windows:
 *
 *   cl launcher.c /Fe:launcher.exe
 *   -- or --
 *   gcc launcher.c -o launcher.exe -lkernel32${guiApp ? ' -mwindows' : ''}
 *
 * Place launcher.exe in the same folder as the protected .py file.
 * The .py file must have the same base name as this .exe.
 *
 * Flow:  launcher.exe  -->  python protected.py
 *                    stdin pipe: key  -->  decrypts payload  -->  runs app
 */
#include <windows.h>
#include <stdio.h>
#include <string.h>
${subsystem}

/* XOR-obfuscated key — never stored as a plain string */
static const unsigned char _xm[] = {${cMask}};
static const unsigned char _xd[] = {${cData}};
#define _KL ${keyLen}

static void _decode_key(char *out) {
    for (int i = 0; i < _KL; i++)
        out[i] = (char)(_xd[i] ^ _xm[i % (int)sizeof(_xm)]);
    out[_KL] = '\\n'; /* newline so readline() terminates */
    out[_KL + 1] = '\\0';
}

int WINAPI WinMain(HINSTANCE h, HINSTANCE p, LPSTR cmd, int show) {
    (void)h; (void)p; (void)cmd; (void)show;

    /* ---- find .py file: same dir + same base name as this .exe ---- */
    char exe[MAX_PATH];
    GetModuleFileNameA(NULL, exe, MAX_PATH);
    char py[MAX_PATH];
    strncpy(py, exe, MAX_PATH - 1);
    py[MAX_PATH - 1] = '\\0';
    char *dot = strrchr(py, '.');
    if (dot) strcpy(dot, ".py");

    /* ---- decode key into stack buffer ---- */
    char key[_KL + 2]; /* +2: newline + null */
    _decode_key(key);

    /* ---- stdin pipe setup ---- */
    SECURITY_ATTRIBUTES sa;
    sa.nLength              = sizeof(sa);
    sa.lpSecurityDescriptor = NULL;
    sa.bInheritHandle       = TRUE;

    HANDLE hR, hW;
    if (!CreatePipe(&hR, &hW, &sa, 0)) {
        SecureZeroMemory(key, sizeof(key));
        return 1;
    }
    /* write-end must NOT be inherited so Python gets EOF after we close it */
    SetHandleInformation(hW, HANDLE_FLAG_INHERIT, 0);

    /* ---- build command: pythonw (no console) or python ---- */
    char command[MAX_PATH + 24];
    _snprintf(command, sizeof(command), "${guiApp ? 'pythonw' : 'python'} \\"%s\\"", py);

    STARTUPINFOA si;
    ZeroMemory(&si, sizeof(si));
    si.cb          = sizeof(si);
    si.dwFlags     = STARTF_USESTDHANDLES;
    si.hStdInput   = hR;                           /* piped key  */
    si.hStdOutput  = GetStdHandle(STD_OUTPUT_HANDLE);
    si.hStdError   = GetStdHandle(STD_ERROR_HANDLE);

    PROCESS_INFORMATION pi;
    ZeroMemory(&pi, sizeof(pi));

    BOOL ok = CreateProcessA(
        NULL, command,
        NULL, NULL,
        TRUE,  /* inherit handles */
        0, NULL, NULL,
        &si, &pi
    );
    CloseHandle(hR); /* child owns read end now */

    if (!ok) {
        CloseHandle(hW);
        SecureZeroMemory(key, sizeof(key));
        return 1;
    }

    /* ---- send key to Python stdin ---- */
    DWORD written;
    WriteFile(hW, key, (DWORD)(_KL + 1), &written, NULL);
    SecureZeroMemory(key, sizeof(key)); /* wipe from stack immediately */
    CloseHandle(hW); /* EOF signal to Python */

    /* ---- wait and propagate exit code ---- */
    WaitForSingleObject(pi.hProcess, INFINITE);
    DWORD exitCode = 0;
    GetExitCodeProcess(pi.hProcess, &exitCode);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    return (int)exitCode;
}
`;
}
