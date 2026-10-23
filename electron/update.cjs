const fs = require('node:fs');

function versionParts(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i.exec(String(value));
  if (!match) throw Error('Invalid version.');
  return match.slice(1, 4).map(Number);
}

function isNewerVersion(current, latest) {
  const a = versionParts(current);
  const b = versionParts(latest);
  for (let i = 0; i < 3; i++) if (b[i] !== a[i]) return b[i] > a[i];
  return false;
}

function isWindowsExecutable(filePath) {
  try {
    if (!fs.statSync(filePath).isFile()) return false;
    const fd = fs.openSync(filePath, 'r');
    const signature = Buffer.alloc(2);
    const read = fs.readSync(fd, signature, 0, 2, 0);
    fs.closeSync(fd);
    return read === 2 && signature[0] === 0x4d && signature[1] === 0x5a;
  } catch {
    return false;
  }
}

const portableUpdateScript = String.raw`On Error Resume Next
Set args = WScript.Arguments
target = args(0)
staged = args(1)
parentPid = CLng(args(2))
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
Do
  Set processes = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE ProcessId=" & parentPid)
  If Err.Number <> 0 Then WScript.Quit 1
  If processes.Count = 0 Then Exit Do
  WScript.Sleep 300
Loop
Set fso = CreateObject("Scripting.FileSystemObject")
backup = target & ".previous"
If fso.FileExists(backup) Then WScript.Quit 2
fso.MoveFile target, backup
If Err.Number <> 0 Then WScript.Quit 3
fso.CopyFile staged, target, False
If Err.Number <> 0 Then
  fso.MoveFile backup, target
  WScript.Quit 4
End If
fso.DeleteFile staged, True
Set shell = CreateObject("WScript.Shell")
shell.Run """" & target & """", 1, False
`;

module.exports = { isNewerVersion, isWindowsExecutable, portableUpdateScript };
