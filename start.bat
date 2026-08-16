@echo off
chcp 65001 >nul
echo ============================================
echo  TRAC QMS - 一键启动脚本 (Windows)
echo ============================================
echo.

where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到Docker，请先安装Docker Desktop
    echo 下载地址: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

echo [1/3] 检查Docker是否运行...
docker info >nul 2>nul
if %errorlevel% neq 0 (
    echo [提示] 请先启动Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    timeout /t 15 /nobreak >nul
)

echo.
echo [2/3] 构建并启动容器（首次运行需要较长时间下载依赖）...
echo.

if "%1"=="dev" (
    echo [开发模式] 启动热重载开发环境...
    docker compose -f docker-compose.dev.yml up -d --build
    echo.
    echo [开发模式] 服务启动中...
    echo    前端地址: http://localhost:5173
    echo    后端API:  http://localhost:3001
) else (
    echo [生产模式] 构建并启动生产环境...
    docker compose up -d --build
    echo.
    echo [生产模式] 服务启动中...
    echo    访问地址: http://localhost:3001
)

echo.
echo [3/3] 等待服务就绪...
timeout /t 10 /nobreak >nul

echo.
echo ============================================
echo  启动完成！
echo ============================================
echo.
echo 查看日志: docker compose logs -f
echo 停止服务: docker compose down
echo 查看状态: docker compose ps
echo.

if "%1"=="dev" (
    start http://localhost:5173
) else (
    start http://localhost:3001
)

pause
