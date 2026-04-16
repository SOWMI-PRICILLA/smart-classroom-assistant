FROM python:3.10-slim

WORKDIR /app

# Build tools (needed for webrtcvad + whisper)
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    cmake \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*


# Install Python deps
COPY audio_service/requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared utils and service code
# This assumes build context is the 'backend' folder
COPY utils /app/backend/utils
COPY audio_service/ /app/

EXPOSE 8765

CMD ["python", "/app/server.py"]
