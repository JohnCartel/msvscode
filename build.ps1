param (
    [switch]$c,
    [switch]$cp,
    [switch]$p
)

# 定义编译命令和打包命令
$compileCmd = 'rm ..\VSCode-win32-x64 -r; yarn gulp vscode-win32-x64-min'
$packageCmd = 'rm .\.build\win32-x64 -r; yarn gulp vscode-win32-x64-system-setup'

# 定义编译函数
function CompileFunc {
    Write-Host "开始编译..."
    Invoke-Expression $compileCmd
    if ($LASTEXITCODE -eq 0) {
        Write-Host "编译成功。"
    } else {
        Write-Host "编译失败。"
        exit $LASTEXITCODE
    }
}

# 定义打包函数
function PackageFunc {
    Write-Host "开始打包..."
    Invoke-Expression $packageCmd
    if ($LASTEXITCODE -eq 0) {
        Write-Host "打包成功。"
    } else {
        Write-Host "打包失败。"
        exit $LASTEXITCODE
    }
}

# 检查参数并执行相应的命令
if ($c -and $p) {
    # 如果有 -c 和 -p 参数，先编译后打包
    CompileFunc
    PackageFunc
} elseif ($c) {
    # 如果有 -c 参数，只编译
    CompileFunc
} elseif ($p) {
    # 如果有 -p 参数，只打包
    PackageFunc
} elseif ($cp -or -not $PSBoundParameters.ContainsKey('c') -and -not $PSBoundParameters.ContainsKey('cp') -and -not $PSBoundParameters.ContainsKey('p')) {
    # 如果有 -cp 参数或没有命令行参数，先编译然后打包
    CompileFunc
    PackageFunc
} else {
    Write-Host "无效的参数。"
    exit 1
}
