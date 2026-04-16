import asyncio
import websockets
import sys
import time

# Try importing sounddevice, handle failure gracefully
try:
    import sounddevice as sd
    import numpy as np
except ImportError:
    print("Please install sounddevice and numpy: pip install sounddevice numpy")
    sys.exit(1)

SAMPLE_RATE = 16000
FRAME_SAMPLES = 480 # 30ms

async def stream_mic(uri):
    loop = asyncio.get_running_loop()
    
    print(f"Connecting to {uri}...")
    async with websockets.connect(uri) as ws:
        print("Connected.")
        
        def callback(indata, frames, time, status):
            if status:
                print(status, file=sys.stderr)
            
            # Convert to int16 PCM
            pcm = (indata[:, 0] * 32767).astype(np.int16)
            
            # Send to WS
            loop.call_soon_threadsafe(
                asyncio.create_task,
                ws.send(pcm.tobytes())
            )
            
        # Start recording
        with sd.InputStream(
            samplerate=SAMPLE_RATE, 
            channels=1, 
            dtype="float32", 
            blocksize=FRAME_SAMPLES, 
            callback=callback
        ):
            print("Streaming from Microphone... Press Ctrl+C to stop.")
            
            while True:
                try:
                    message_str = await ws.recv()
                    print(f"Received: {message_str}")
                except websockets.exceptions.ConnectionClosedOK:
                    print("Connection closed by server.")
                    break
                except Exception as e:
                    print(f"Error reading: {e}")
                    break

def main():
    try:
        asyncio.run(stream_mic("ws://localhost:8765"))
    except KeyboardInterrupt:
        print("\nStopped.")

if __name__ == "__main__":
    main()
