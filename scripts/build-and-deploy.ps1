# StockAnalyzer 一键构建并部署脚本
# 流程：npm run build -> npx electron-builder --win -> 同步 release/win-unpacked 到安装目录
#
# 用法：
#   npm run deploy                              # 推荐：安装到当前用户目录，无需管理员权限
#   scripts\build-and-deploy.cmd                # 效果同上（双击即可）
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-and-deploy.ps1
#
# 可选参数：
#   -InstallDir <路径>   自定义安装目录，默认 %LOCALAPPDATA%\Programs\StockAnalyzer
#   -SkipBuild           跳过构建步骤，仅将已有 release/win-unpacked 同步到安装目录
#
# 说明：默认安装目录位于用户目录下，普通 PowerShell 即可写入，不需要提权。
#       若显式指定 C:\Program Files 等系统目录，则会因权限不足而失败，需以管理员身份运行。

param(
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "Programs\StockAnalyzer"),
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

# 判断当前进程是否具备管理员权限
function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 判断目标目录（或其最近的已存在祖先）是否可写
# 只做一次探测性写文件，不依赖管理员身份判断，便于在自定义目录上给出准确提示
function Test-DirectoryWritable([string]$Path) {
    try {
        $probeDir = $Path
        while ($probeDir -and -not (Test-Path -LiteralPath $probeDir)) {
            $probeDir = Split-Path -Parent $probeDir
        }
        if (-not $probeDir) {
            return $false
        }

        $probeFile = Join-Path $probeDir ([System.IO.Path]::GetRandomFileName())
        # 显式指定 Stop：默认的非终止错误会让 catch 收不到异常，从而误判为可写
        New-Item -ItemType File -Path $probeFile -Force -ErrorAction Stop | Out-Null
        Remove-Item -LiteralPath $probeFile -Force -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

# ---------- 0. 安装目录可写性检查 ----------
# 默认目录在用户空间，通常直接可写；只有显式指向系统目录时才需要提权
if (-not (Test-DirectoryWritable $InstallDir)) {
    Write-Host "错误：目标目录不可写：$InstallDir" -ForegroundColor Red
    if (Test-IsAdministrator) {
        Write-Host "即使以管理员身份仍不可写，请检查目录权限或改用其他目录。" -ForegroundColor Yellow
    }
    else {
        Write-Host "当前为非管理员进程。请任选其一：" -ForegroundColor Yellow
        Write-Host "  1) 不传 -InstallDir，使用默认用户目录（推荐，无需提权）：" -ForegroundColor Yellow
        Write-Host "       npm run deploy" -ForegroundColor Yellow
        Write-Host "  2) 以管理员身份打开 PowerShell 后重新执行本脚本。" -ForegroundColor Yellow
    }
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
    # 必须显式调用 npm.cmd / npx.cmd，不能直接写 npm / npx：
    # 在 PowerShell 中 npm 会解析到 nvm4w 的 npm.ps1，该脚本读取
    # $MyInvocation.Statement（PowerShell 5.1 无此属性），而本脚本启用了
    # Set-StrictMode，子脚本会继承 StrictMode 并因此抛 PropertyNotFoundStrict。
    # .cmd 由 cmd.exe 执行，不进入 PowerShell 脚本作用域，可绕开该问题。
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build 失败，退出码：$LASTEXITCODE" }

    # ---------- 3. 打包 ----------
    Write-Step "执行 npx electron-builder --win"
    npx.cmd electron-builder --win
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
