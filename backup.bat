@echo off
chcp 65001 >nul
echo ============================================
echo  TRAC QMS - 数据备份脚本 (Windows)
echo ============================================
echo.

set BACKUP_DIR=backup
set TIMESTAMP=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%

if not exist %BACKUP_DIR% mkdir %BACKUP_DIR%

echo [1/2] 备份数据库...
if exist "server\data\qms.db" (
    copy "server\data\qms.db" "%BACKUP_DIR%\qms_%TIMESTAMP%.db" >nul
    echo    数据库已备份: %BACKUP_DIR%\qms_%TIMESTAMP%.db
) else (
    echo    [警告] 未找到数据库文件
)

echo.
echo [2/2] 备份上传文件...
if exist "server\uploads" (
    if not exist "%BACKUP_DIR%\uploads_%TIMESTAMP%" mkdir "%BACKUP_DIR%\uploads_%TIMESTAMP%"
    xcopy "server\uploads\*" "%BACKUP_DIR%\uploads_%TIMESTAMP%\" /E /Q /Y >nul
    echo    上传文件已备份: %BACKUP_DIR%\uploads_%TIMESTAMP%\
) else (
    echo    [提示] 无上传文件
)

echo.
echo ============================================
echo  备份完成！
echo  备份位置: %BACKUP_DIR%\
echo ============================================
echo.
echo 恢复数据: 将备份文件复制回 server\data\ 和 server\uploads\ 即可
echo.
pause
