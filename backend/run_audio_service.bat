@echo off
SET "PROJ_DIR=%~dp0.."
SET "VENV_PYTHON=%PROJ_DIR%\venv\Scripts\python.exe"
SET "PYTHONPATH=%PROJ_DIR%\backend;%PROJ_DIR%\backend\audio_service"
SET "HF_HOME=D:\huggingface_cache"
SET "HF_HUB_CACHE=D:\huggingface_cache"

echo ========================================
echo   Smart Classroom - Audio Service
echo ========================================
echo Using Python: %VENV_PYTHON%
echo HF_HOME: %HF_HOME%

if not exist "%HF_HOME%" mkdir "%HF_HOME%"

"%VENV_PYTHON%" -u "%PROJ_DIR%\backend\audio_service\server.py"
@rem No pause here to allow clean auto-restart if needed, 
@rem but for manual running, the user can see the window.
