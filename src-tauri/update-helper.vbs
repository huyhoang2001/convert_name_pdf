On Error Resume Next
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
