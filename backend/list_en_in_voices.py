import asyncio
import edge_tts

async def list_en_in():
    voices = await edge_tts.list_voices()
    for v in voices:
        if v["Locale"] == "en-IN":
            print(f"- {v['Name']} ({v['Gender']})")

if __name__ == "__main__":
    asyncio.run(list_en_in())
