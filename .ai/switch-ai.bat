@echo off
chcp 65001 >nul
setlocal
rem Switch Cline/OpenCode profiles: local, local-q5, local14, cloud, cloud-ollama, status
set "NODE=C:\laragon\bin\nodejs\node-v22\node.exe"
if not exist "%NODE%" set "NODE=node"
"%NODE%" --no-warnings "%~dp0ai-profile.mjs" %*
endlocal
