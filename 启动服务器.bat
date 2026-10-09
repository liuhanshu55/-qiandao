@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 弈剑阁签到服务器（请勿关闭本窗口）

where node >nul 2>nul
if %errorlevel%==0 (
  set "NODE=node"
) else (
  set "NODE=C:\Users\34566\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
)

echo.
echo 正在启动「弈剑阁 · 每日签到」服务器，浏览器将自动打开签到页面...
echo.

rem 3 秒后自动打开浏览器（后台任务，不影响服务器运行）
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

rem 前台运行服务器（本窗口就是服务器，请保持打开）
"%NODE%" server.js

echo.
echo 服务器已停止。
pause
