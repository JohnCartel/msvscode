param (
    [switch]$c,
    [switch]$cp
)

# 编译命令
$compile = 'rm ..\VSCode-win32-x64 -r ; yarn gulp vscode-win32-x64-min'
# 编译
Invoke-Expression $compile

if ($LASTEXITCODE -eq 0) {
    if ($c) {
        # 如果有 -c 参数
        Write-Host "编译成功"
    } elseif ($cp -or -not $PSBoundParameters.ContainsKey('c') -and -not $PSBoundParameters.ContainsKey('cp')) {
        # 如果有 -cp 参数或没有命令行参数，执行前两步
        $package = 'rm .\.build\win32-x64 -r ; yarn gulp vscode-win32-x64-system-setup'
        Invoke-Expression $package
        if ($LASTEXITCODE -eq 0) {
            Write-Host "打包成功。"
        } else {
            Write-Host "打包失败。"
            exit $LASTEXITCODE
        }
    }
} else {
    # 如果第一个命令失败，退出脚本
    Write-Host "编译失败。"
    exit $LASTEXITCODE
}
