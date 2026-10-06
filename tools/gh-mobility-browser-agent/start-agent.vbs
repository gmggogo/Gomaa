Option Explicit

' DESTINATION
' servertoolsgh-mobility-browser-agentstart-agent.vbs
'
' Starts agent.js hidden so the Super Admin never needs PowerShell.

Dim shell, fso, folder, command
Set shell = CreateObject(WScript.Shell)
Set fso = CreateObject(Scripting.FileSystemObject)

folder = fso.GetParentFolderName(WScript.ScriptFullName)
command = cmd c cd d  & folder &  && node agent.js

shell.Run command, 0, False
