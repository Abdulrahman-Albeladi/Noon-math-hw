$ErrorActionPreference = "Stop"
$repo = (Get-Location).Path
if (!(Test-Path (Join-Path $repo "assets")) -or !(Test-Path (Join-Path $repo "index.html"))) { throw "Run this from the root of your Noon-math-hw Git repository." }
$patch = Join-Path $HOME "Downloads\Noon-math-hw-sets-patch.zip"
if (!(Test-Path $patch)) { throw "Put Noon-math-hw-sets-patch.zip in your Downloads folder first." }
$tmp = Join-Path $env:TEMP ("noon-sets-" + [guid]::NewGuid())
Expand-Archive -Path $patch -DestinationPath $tmp -Force
Copy-Item -Path (Join-Path $tmp "*") -Destination $repo -Recurse -Force
Remove-Item $tmp -Recurse -Force
Write-Host "Files added. Checking Git..." -ForegroundColor Green
git add .
git commit -m "Add worksheet sets 1-3 for grades 9-12"
git push
Write-Host "Done. GitHub Pages will update automatically." -ForegroundColor Green
