import asyncio
import edge_tts

async def check_ananya():
    voices = await edge_tts.list_voices()
    for v in voices:
        if "Ananya" in v["Name"]:
            print(f"Ananya exists: {v['Name']}")
        if "Kavya" in v["Name"]:
            print(f"Kavya exists: {v['Name']}")

if __name__ == "__main__":
    asyncio.run(check_ananya())
