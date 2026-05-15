@echo off
chcp 65001 >nul
echo 🧪 培养基 1.0.0 打包脚本
echo ================================

:: 1. 前端打包
echo.
echo 📦 正在打包前端...
cd /d "%~dp0frontend"
call npm run build
if errorlevel 1 (
    echo ❌ 前端打包失败！
    exit /b 1
)
echo ✅ 前端打包完成

:: 2. 复制前端构建文件到后端 public 目录
echo.
echo 📁 复制前端文件到后端...
cd /d "%~dp0backend"
if not exist public mkdir public
xcopy /E /Y /Q ..\frontend\dist\* public\
echo ✅ 前端文件复制完成

:: 3. 安装后端依赖
echo.
echo 📦 安装后端依赖...
call npm install --production
if errorlevel 1 (
    echo ❌ 后端依赖安装失败！
    exit /b 1
)
echo ✅ 后端依赖安装完成

:: 4. 创建发布包
echo.
echo 📦 创建发布包...
cd /d "%~dp0"
set BUILD_TIME=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set BUILD_TIME=%BUILD_TIME: =0%
set RELEASE_NAME=peiyangji-1.0.0-%BUILD_TIME%

if exist "%RELEASE_NAME%" rmdir /S /Q "%RELEASE_NAME%"
mkdir "%RELEASE_NAME%"
xcopy /E /Y /Q backend\* "%RELEASE_NAME%\"\
xcopy /Y /Q backend\.env "%RELEASE_NAME%\" 2>nul
xcopy /Y /Q README.md "%RELEASE_NAME%\" 2>nul

echo.
echo 🎉 打包完成！
echo ================================
echo 发布包位置：%CD%\%RELEASE_NAME%
echo.
echo 运行方式：
echo   1. 复制 %RELEASE_NAME% 到目标服务器
echo   2. 运行：npm install --production
echo   3. 运行：npm start
echo   4. 访问：http://localhost:3001
echo.
