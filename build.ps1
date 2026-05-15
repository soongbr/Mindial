# 🧪 培养基 1.0.0 打包脚本
Write-Host "🧪 培养基 1.0.0 打包脚本" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$FrontendPath = Join-Path $ProjectRoot "frontend"
$BackendPath = Join-Path $ProjectRoot "backend"

# 1. 前端打包
Write-Host ""
Write-Host "📦 正在打包前端..." -ForegroundColor Yellow
Set-Location $FrontendPath
npm run build
Write-Host "✅ 前端打包完成" -ForegroundColor Green

# 2. 复制前端构建文件到后端 public 目录
Write-Host ""
Write-Host "📁 复制前端文件到后端..." -ForegroundColor Yellow
Set-Location $BackendPath
$PublicPath = Join-Path $BackendPath "public"
if (!(Test-Path $PublicPath)) {
    New-Item -ItemType Directory -Path $PublicPath | Out-Null
}
$DistPath = Join-Path $FrontendPath "dist"
Get-ChildItem -Path $DistPath -Recurse | Copy-Item -Destination $PublicPath -Recurse -Force
Write-Host "✅ 前端文件复制完成" -ForegroundColor Green

# 3. 安装后端依赖
Write-Host ""
Write-Host "📦 安装后端依赖..." -ForegroundColor Yellow
npm install --production
Write-Host "✅ 后端依赖安装完成" -ForegroundColor Green

# 4. 创建发布包
Write-Host ""
Write-Host "📦 创建发布包..." -ForegroundColor Yellow
Set-Location $ProjectRoot
$BuildTime = Get-Date -Format "yyyyMMdd_HHmmss"
$ReleaseName = "peiyangji-1.0.0-$BuildTime"
$ReleasePath = Join-Path $ProjectRoot $ReleaseName

if (Test-Path $ReleasePath) {
    Remove-Item -Path $ReleasePath -Recurse -Force
}
New-Item -ItemType Directory -Path $ReleasePath | Out-Null

# 复制后端文件
Get-ChildItem -Path $BackendPath -Exclude "node_modules" | Copy-Item -Destination $ReleasePath -Recurse -Force
# 复制 .env 文件（如果存在）
$EnvFile = Join-Path $BackendPath ".env"
if (Test-Path $EnvFile) {
    Copy-Item -Path $EnvFile -Destination $ReleasePath -Force
}
# 复制 README
$ReadmeFile = Join-Path $ProjectRoot "README.md"
if (Test-Path $ReadmeFile) {
    Copy-Item -Path $ReadmeFile -Destination $ReleasePath -Force
}

Write-Host ""
Write-Host "🎉 打包完成！" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Cyan
Write-Host "发布包位置：$ReleasePath" -ForegroundColor White
Write-Host ""
Write-Host "运行方式：" -ForegroundColor Yellow
Write-Host "  1. 复制 $ReleaseName 到目标服务器"
Write-Host "  2. 运行：npm install --production"
Write-Host "  3. 运行：npm run start:prod"
Write-Host "  4. 访问：http://localhost:3001"
Write-Host ""
