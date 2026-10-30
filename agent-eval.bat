@echo off
rem Read-only eval run of the 3060 kit against THIS project.
rem Kit: https://github.com/elips0675-web/3060OllamaClineOpenCode
rem Usage: agent-eval.bat [--tasks E-01,E-07] [--max-calls 6] [--rescore <json>]
setlocal
set "KIT=E:\3060OllamaClineOpenCode-main"
if not exist "%KIT%\scripts\agent-live.mjs" (
  echo Kit not found: %KIT%
  echo Clone https://github.com/elips0675-web/3060OllamaClineOpenCode there.
  exit /b 2
)
node "%KIT%\scripts\agent-live.mjs" --root "%~dp0." %*
