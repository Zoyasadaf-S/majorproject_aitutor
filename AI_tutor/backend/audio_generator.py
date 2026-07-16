import edge_tts
import os
import uuid

async def generate_audio_files(lesson_plan):
    if not os.path.exists("static"):
        os.makedirs("static")

    steps = lesson_plan.get("steps", [])
    
    # 1. Determine Speed
    pace = lesson_plan.get("speaking_pace", "normal")
    rate_str = "+0%" # Default
    
    if pace == "fast":
        rate_str = "+25%"  # Speak 25% faster
    elif pace == "slow":
        rate_str = "-20%"  # Speak 20% slower

    # 2. Select Voice (Indian English Female)
    # You can also use "en-IN-PrabhatNeural" for Male
    voice = "en-IN-NeerjaNeural" 

    for step in steps:
        if "audio" in step and step["audio"]:
            try:
                text = step["audio"]
                
                # Generate Audio using Edge TTS
                communicate = edge_tts.Communicate(text, voice, rate=rate_str)
                
                filename = f"audio_{uuid.uuid4()}.mp3"
                filepath = os.path.join("static", filename)
                
                # Save the file (await is important here)
                await communicate.save(filepath)
                
                step["audio_url"] = f"http://localhost:8000/static/{filename}"
                
            except Exception as e:
                print(f"Audio Error: {e}")
            
    return lesson_plan