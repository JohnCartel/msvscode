param (
    [switch]$c,
    [switch]$i,
    [switch]$p
)

# 定义编译命令和打包命令
$compileCmd = 'rm ..\VSCode-win32-x64 -r; yarn gulp vscode-win32-x64-min'
$packageCmd = 'rm .\.build\win32-x64 -r; yarn gulp vscode-win32-x64-system-setup'

# 定义文件路径变量
$rceditPath = '.\build\win32\rcedit-x64.exe'
$exeFilePath = '..\VSCode-win32-x64\HESDS.exe'
$iconFilePath = '.\resources\win32\code.ico'

# 定义更改图标命令
$changeiconArgs = "`"$exeFilePath`" --set-icon `"$iconFilePath`""

# 定义编译函数
function CompileFunc {
	# 删除log文件
	rm .\build.log -ErrorAction SilentlyContinue
    Write-Host "开始编译..."
    Invoke-Expression $compileCmd *>&1 | Tee-Object -FilePath ".\build.log" | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "编译成功。"
    } else {
        Write-Host "编译失败，请参考 build.log 文件。"
        exit $LASTEXITCODE
    }
}

function ChangeIcon {
    # 判断路径是否存在，如果存在则执行更改图标命令
    if (Test-Path $rceditPath) {
        Write-Host "开始更改图标..."

        # 启动进程并捕获输出和错误信息
        $process = Start-Process -FilePath $rceditPath -ArgumentList $changeiconArgs -NoNewWindow -PassThru -Wait

		# 等待进程完成
        $process.WaitForExit()

		# 输出结果
		if($process.ExitCode -ne 0) {
			Write-Host "更改图标失败。", $process.ExitCode
			exit $process.ExitCode
		}
		else {
			Write-Host "更改图标完成。"
		}

    } else {
        Write-Host "Resource Hacker 路径不存在,请安装ResourceHacker。"
        exit 1
    }
}

# 定义打包函数
function PackageFunc {
    Write-Host "开始打包..."
    Invoke-Expression $packageCmd *>&1 | Tee-Object -FilePath ".\build.log" -Append | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "打包成功。"
    } else {
        Write-Host "打包失败，请参考 build.log 文件。"
        exit $LASTEXITCODE
    }
}

# 编译
if($c -or -not($i -or $p)) {
	CompileFunc
}

# 替换图标
if ($i -or -not($c -or $p)) {
	# 如果有 -i 参数，只更改图标
    ChangeIcon
}

# 打包
if ($p -or -not($c -or $i)) {
	PackageFunc
}
