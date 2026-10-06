Option Explicit

' DESTINATION:
' server\tools\gh-mobility-browser-agent\start-agent.vbs
'
' Starts agent.js hidden so the Super Admin never needs PowerShell.

Dim shell, fso, folder

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

folder = fso.GetParentFolderName(WScript.ScriptFullName)

shell.CurrentDirectory = folder
shell.Run "node agent.js", 0, False
