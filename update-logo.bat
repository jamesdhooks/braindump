@echo off
setlocal

if not exist "assets\logo.png" (
    echo ERROR: assets\logo.png not found. Run this from the repo root.
    exit /b 1
)

if not exist "assets\logo_small.png" (
    echo ERROR: assets\logo_small.png not found. Run this from the repo root.
    exit /b 1
)

node scripts\build-icons.js
if %errorlevel% neq 0 (
    echo ERROR: build-icons.js failed ^(see above^).
    exit /b 1
)


