import sounddevice as sd
import numpy as np
import asyncio
import websockets
import json
import argparse

SAMPLE_RATE = 16000
FRAME_SAMPLES = 480

async def stream(session_id=None):

    uri = "ws://localhost:8765"

    loop = asyncio.get_running_loop()

    async with websockets.connect(uri, ping_interval=10, ping_timeout=60) as ws:
        audio_queue = asyncio.Queue(maxsize=100)
        
        # If session_id is provided, send initialization message
        if session_id:
            init_msg = json.dumps({
                "type": "p_init",
                "session_id": session_id
            })
            await ws.send(init_msg)
            print(f"Connected to server. Initialized producer session: {session_id}")
        else:
            print("Connected to server. No session_id provided, server will generate one.")

        async def sender():
            """Worker task to pull from queue and send over WebSocket."""
            try:
                while True:
                    data = await audio_queue.get()
                    await ws.send(data)
                    audio_queue.task_done()
            except websockets.exceptions.ConnectionClosed:
                pass
            except asyncio.CancelledError:
                pass

        sender_task = asyncio.create_task(sender())

        def callback(indata, frames, time, status):
            if status:
                print(status)

            pcm = (indata[:, 0] * 32767).astype(np.int16)
            try:
                loop.call_soon_threadsafe(audio_queue.put_nowait, pcm.tobytes())
            except asyncio.QueueFull:
                # Discard if buffer too full
                pass

        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            blocksize=FRAME_SAMPLES,
            callback=callback
        ):
            print("Streaming audio... Speak now.")
            try:
                while True:
                    msg = await ws.recv()
                    try:
                        data = json.loads(msg)
                        m_type = data.get("type")
                        if m_type == "session_id":
                            print(f"\n[ACTIVE SESSION ID]: {data.get('session_id')}")
                            print("Open this ID in the UI to see transcriptions.\n")
                        elif m_type == "partial":
                            # Use \r and end='' for live updating line
                            pass
                            '''
                            text = data.get("text", "")
                            print(f"\r[LIVE]: {text[:80]}...", end='', flush=True)
                            '''
                        elif m_type == "final":
                            # Clear the live line and print final
                            text = data.get("text", "")
                            print(f"\r[FINAL]: {text}                                ") # Extra spaces to clear partial
                        else:
                            print("\nSERVER:", msg)
                    except json.JSONDecodeError:
                        print("SERVER:", msg)
            except websockets.exceptions.ConnectionClosedOK:
                print("\nConnection closed normally by server.")
            except websockets.exceptions.ConnectionClosedError as e:
                print("\nConnection closed with error:", e)
            finally:
                sender_task.cancel()
                try:
                    await sender_task
                except asyncio.CancelledError:
                    pass

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Audio Stream Producer Client")
    parser.add_argument("--session_id", type=str, help="Specify session_id to match UI")
    args = parser.parse_args()

    asyncio.run(stream(session_id=args.session_id))
