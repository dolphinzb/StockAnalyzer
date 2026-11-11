@echo off
rem StockAnalyzer 一键构建并部署（双击本文件即可）
rem 默认安装到 %LOCALAPPDATA%\Programs\StockAnalyzer，普通权限即可写入，不再申请管理员权限
rem 如需部署到 C:\Program Files 等系统目录，请以管理员身份打开 PowerShell 后运行 ps1

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-and-deploy.ps1" %*
if %errorlevel% neq 0 (
    echo.
    echo 构建或部署失败，错误码：%errorlevel%
    pause
    exit /b %errorlevel%
)

echo.
pause
