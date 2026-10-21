# StockAnalyzer 一键构建并部署脚本
# 流程：npm run build -> npx electron-builder --win -> 同步 release/win-unpacked 到安装目录
# 用法（普通 CMD 中直接双击 build-and-deploy.cmd 即可，会自动申请管理员权限）：
#   scripts\build-and-deploy.cmd
# 或在已提权的 PowerShell 中：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-and-deploy.ps1
# 可选参数：
#   -InstallDir <路径>   自定义安装目录，默认 C:\Program Files\StockAnalyzer
#   -SkipBuild          跳过构建步骤，仅将已有 release/win-unpacked 同步到安装目录

param(
    [string]$InstallDir = "C:\Program Files\StockAnalyzer",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$SourceDir = Join-Path $ProjectRoot "release\win-unpacked"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

# ---------- 0. 管理员权限检查（写入 Program Files 必需） ----------
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "错误：需要管理员权限才能写入 $InstallDir" -ForegroundColor Red
    Write-Host "请通过 scripts\build-and-deploy.cmd 启动（会自动申请提权），或以管理员身份运行本脚本。" -ForegroundColor Yellow
    exit 1
}

Write-Host "=============================================="
Write-Host " StockAnalyzer 一键构建并部署"
Write-Host " 项目目录：$ProjectRoot"
Write-Host " 安装目录：$InstallDir"
Write-Host "=============================================="

Set-Location $ProjectRoot

# ---------- 1. 结束正在运行的 StockAnalyzer（避免文件被占用） ----------
Write-Step "检查并结束正在运行的 StockAnalyzer 进程"
$running = Get-Process -Name "StockAnalyzer" -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "发现运行中的 StockAnalyzer，正在结束..."
    $running | Stop-Process -Force
    Start-Sleep -Seconds 2
}
else {
    Write-Host "未发现运行中的 StockAnalyzer。"
}

if (-not $SkipBuild) {
    # ---------- 2. 构建 ----------
    Write-Step "执行 npm run build"
    # 注意：不要用 & 调用运算符（& npm run build），否则 nvm4w 的 npm.ps1 会
    # 把 InvocationName 当成 "&"，Substring 切错字符导致 npm 收到 "pm" 而报错。
    # 直接以命令名调用（不带 &），InvocationName 才是正确的 "npm"。
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build 失败，退出码：$LASTEXITCODE" }

    # ---------- 3. 打包 ----------
    Write-Step "执行 npx electron-builder --win"
    npx electron-builder --win
    if ($LASTEXITCODE -ne 0) { throw "electron-builder 打包失败，退出码：$LASTEXITCODE" }
}

# ---------- 4. 校验产物 ----------
Write-Step "校验构建产物：$SourceDir"
if (-not (Test-Path -LiteralPath $SourceDir)) {
    throw "未找到 $SourceDir，请检查构建是否成功（或去掉 -SkipBuild 参数重新构建）。"
}
if (-not (Test-Path -LiteralPath (Join-Path $SourceDir "StockAnalyzer.exe"))) {
    throw "未找到 StockAnalyzer.exe，打包产物不完整。"
}

# ---------- 5. 同步到安装目录 ----------
Write-Step "同步到安装目录：$InstallDir"
if (-not (Test-Path -LiteralPath $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Write-Host "已创建安装目录。"
}

# robocopy /MIR 镜像同步：目标目录中多余的文件会被删除（安装目录仅含程序文件，用户数据不在此处）
& robocopy $SourceDir $InstallDir /MIR /NDL /NFL /NJH /NJS /NP
$robocopyExit = $LASTEXITCODE
if ($robocopyExit -ge 8) {
    throw "robocopy 同步失败，退出码：$robocopyExit"
}
Write-Host "文件同步完成（robocopy 退出码：$robocopyExit）。"

# ---------- 6. 完成 ----------
Write-Host ""
Write-Host "=============================================="
Write-Host " 全部完成！"
Write-Host " 安装目录：$InstallDir"
Write-Host " 可执行文件：$InstallDir\StockAnalyzer.exe"
Write-Host "=============================================="
