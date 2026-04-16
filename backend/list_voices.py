import asyncio
import edge_tts

async def list_voices():
    voices = await edge_tts.list_voices()
    for v in voices:
        if "en-IN" in v["Name"]:
            print(f"{v['Name']} - {v['Gender']}")

if __name__ == "__main__":
    asyncio.run(list_voices())
