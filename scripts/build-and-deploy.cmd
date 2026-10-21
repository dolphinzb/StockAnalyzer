@echo off
rem StockAnalyzer 一键构建并部署（双击本文件即可）
rem 自动申请管理员权限后执行 scripts\build-and-deploy.ps1

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo 正在申请管理员权限...
    powershell -NoProfile -Command "Start-Process -FilePath cmd.exe -ArgumentList '/c','%~f0' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-and-deploy.ps1"
if %errorlevel% neq 0 (
    echo.
    echo 构建或部署失败，错误码：%errorlevel%
    pause
    exit /b %errorlevel%
)

echo.
pause
