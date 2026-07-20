import httpx
import asyncio

async def test():
    async with httpx.AsyncClient() as client:
        res = await client.post('http://127.0.0.1:8000/api/teach', json={'topic':'friction', 'subject':'Physics'}, timeout=30)
        print("STATUS:", res.status_code)
        
        # Read the streaming response line by line
        async for line in res.aiter_lines():
            print(line)
            if "data:" in line:
                pass # Just print it all

asyncio.run(test())
