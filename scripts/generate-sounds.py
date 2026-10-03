"""
サイコロが陶器のお椀に当たる「カッ」という効果音を合成して assets/sounds/ に書き出す。
標準ライブラリのみで動く:  python scripts/generate-sounds.py
"""
import math
import random
import struct
import wave
from pathlib import Path

RATE = 44100
OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "sounds"


def clack(seed: int, duration=0.16):
    rng = random.Random(seed)
    n = int(RATE * duration)
    # 陶器らしい非整数倍音（固有振動）を数本重ねる
    base = rng.uniform(1900, 2600)
    partials = [
        (base, 1.0, rng.uniform(0.030, 0.045)),
        (base * rng.uniform(2.3, 2.5), 0.6, rng.uniform(0.020, 0.030)),
        (base * rng.uniform(3.9, 4.3), 0.35, rng.uniform(0.012, 0.020)),
        (rng.uniform(700, 900), 0.4, rng.uniform(0.015, 0.025)),  # サイコロ本体のコツッという低め成分
    ]
    phases = [rng.uniform(0, math.tau) for _ in partials]
    samples = []
    for i in range(n):
        t = i / RATE
        v = 0.0
        for (freq, amp, decay), ph in zip(partials, phases):
            v += amp * math.exp(-t / decay) * math.sin(math.tau * freq * t + ph)
        # 当たった瞬間の短いノイズ
        v += 0.8 * math.exp(-t / 0.0015) * rng.uniform(-1, 1)
        # 立ち上がりのクリック防止
        v *= min(1.0, i / 20)
        samples.append(v)
    peak = max(abs(s) for s in samples)
    return [s / peak * 0.9 for s in samples]


def write_wav(path: Path, samples):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(s * 32767)) for s in samples))


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for i in range(4):
        path = OUT_DIR / f"clack{i + 1}.wav"
        write_wav(path, clack(seed=i * 7 + 3))
        print("wrote", path)


if __name__ == "__main__":
    main()
