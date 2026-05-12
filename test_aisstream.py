"""Quick test to verify aisstream.io WebSocket connection."""
import asyncio
import json
import websockets

API_KEY = "169d5e6303ef39ddf5fe87798f6e95a939f3e863"

async def test():
    url = "wss://stream.aisstream.io/v0/stream"
    print(f"Connecting to {url}...")
    try:
        async with websockets.connect(url, open_timeout=10) as ws:
            print("Connected! Sending subscription...")
            await ws.send(json.dumps({
                "APIKey": API_KEY,
                "BoundingBoxes": [[[-90, -180], [90, 180]]],
                "FilterMessageTypes": ["PositionReport"],
            }))
            print("Waiting for messages (10s timeout)...")
            count = 0
            try:
                while count < 5:
                    msg = await asyncio.wait_for(ws.recv(), timeout=10)
                    data = json.loads(msg)
                    if data.get("Message", {}).get("PositionReport"):
                        count += 1
                        meta = data.get("MetaData", {})
                        rep  = data["Message"]["PositionReport"]
                        print(f"  [{count}] MMSI={meta.get('MMSI')} lat={rep.get('Latitude'):.4f} lon={rep.get('Longitude'):.4f} sog={rep.get('Sog')}")
                    else:
                        print(f"  other msg type: {list(data.get('Message', {}).keys())}")
            except asyncio.TimeoutError:
                print(f"Timeout after {count} messages.")
            print(f"\nSuccess! Received {count} PositionReport messages.")
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}")

asyncio.run(test())
