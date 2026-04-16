# 🚀 Project Run Guide

Since we moved the Audio Service to a local runner on the **D: Drive** to bypass space issues, the way you start the project has changed slightly. Here is your step-by-step guide.

---

## 1. Start the Audio Service (Transcription)
This is the service that handles Whisper and real-time audio. **Do not use Docker for this anymore.**

- **File**: `backend/run_audio_service.bat`
- **Action**: Double-click this file or run it in a terminal:
  ```powershell
  cd "d:\smart-classroom-assistant - Copy\backend"
  .\run_audio_service.bat
  ```
- **Why?**: This script tells Python to use the D: drive for model storage and dependencies, keeping your C: drive free.

---

## 🚀 How to Run (Manual Steps)

To see the project running and ensure everything is active, open **TWO** separate terminal windows:

### Terminal 1: Backend API
```powershell
# Navigate to the project folder
cd "d:\smart-classroom-assistant - Copy"
# Run the backend
.\venv\Scripts\python.exe -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
```

### Terminal 2: Audio/Transcription Service
```powershell
# Navigate to the backend folder
cd "d:\smart-classroom-assistant - Copy\backend"
# Run the audio service batch file
.\run_audio_service.bat
```

### Terminal 3: Frontend (Optional if not already running)
```powershell
cd "d:\smart-classroom-assistant - Copy\frontend"
npm run dev
```

---

## 🔍 Troubleshooting
- **No transcription?** Ensure Terminal 2 is showing `[Worker] Started`. If it shows `Model Loading`, wait a moment.
- **Port Conflict?** If a port is already in use, close all open terminals and run the commands again.
  npm run dev
  ```
- **Access**: Open your browser to `http://localhost:5173`

---

## 🛠 Troubleshooting

### "No pyvenv.cfg file"
If you see this error, it means you are using an old terminal window that is trying to load a deleted environment. **Please close all your terminals and open fresh ones.**

### "Missing modules"
I have already pre-installed the requirements in your new `venv`. If you still see missing modules, run:
`.\venv\Scripts\python.exe -m pip install -r backend/requirements.txt`


### Why is `venv` gone?
During the "Disk Full" crisis, the `venv` was preventing the system from functioning correctly on the D: drive. By using the `.bat` file and the `backend/lib` folder, we've created a more "portable" way to run the heavy parts of the project without clogging your system drive.

### Is Docker needed?
**No.** For the audio service, the local `.bat` runner is much faster and more reliable given your current system disk constraints.
