from generator import load_csm_1b
import torchaudio

generator = load_csm_1b(device="cuda")
with open("girlfriend_response.txt", "r") as f:
    incoming_text = f.read()
audio = generator.generate(
    text=incoming_text,
    speaker=0,
    context=[],
    max_audio_length_ms=78_000,
)

torchaudio.save("audio.wav", audio.unsqueeze(0).cpu(), generator.sample_rate)