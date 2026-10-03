"""
効果音を合成して assets/sounds/ に書き出す。標準ライブラリのみで動く:  python scripts/generate-sounds.py
  clack1〜4.wav : サイコロが陶器のお椀に当たる「カッ」
  taiko-double.wav : 最上級の役（ピンゾロ・アラシ・シゴロ）… 太鼓 2 回「ドン、ドーン」
  taiko-single.wav : 小当たり（○の目）… 太鼓 1 回「ドン」
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


def taiko_hit(total, start, strength=1.0, length=1.1, seed=0):
    """和太鼓を 1 回打つ音。胴の低い響き + 皮の中音 + バチの当たる音"""
    rng = random.Random(seed)
    out = [0.0] * total
    s0 = int(start * RATE)
    lp = 0.0
    phases = [0.0, 0.0, 0.0, 0.0]
    for i in range(int(length * RATE)):
        if s0 + i >= total:
            break
        t = i / RATE
        # 打った瞬間は音程が高く、すぐ下がる（皮の張りが戻る）
        bend = 1 + 0.6 * math.exp(-t / 0.025)
        # iPhone のスピーカーは 200Hz 以下がほぼ出ないので、胴鳴りの中音域（160〜400Hz）を厚めにする
        modes = [
            (88 * bend, 1.0, 0.42 * length),
            (162 * bend, 0.85, 0.3 * length),
            (258 * bend, 0.7, 0.18 * length),
            (395 * bend, 0.4, 0.1 * length),
        ]
        v = 0.0
        for k, (freq, amp, decay) in enumerate(modes):
            phases[k] += math.tau * freq / RATE
            v += amp * math.exp(-t / decay) * math.sin(phases[k])
        # バチの「パン」：こもったノイズを一瞬
        lp += (rng.uniform(-1, 1) - lp) * 0.25
        v += 0.9 * math.exp(-t / 0.008) * lp
        v *= min(1.0, i / 30)
        # iPhone のスピーカーでも聞こえるよう、軽く歪ませて倍音を足す
        out[s0 + i] += math.tanh(v * 3.0 * strength) * strength
    return out


def mix(*tracks):
    return [sum(vals) for vals in zip(*tracks)]


def normalize(samples, peak=0.9):
    m = max(abs(x) for x in samples) or 1
    return [x / m * peak for x in samples]


def taiko_single():
    total = int(RATE * 1.2)
    return normalize(taiko_hit(total, 0.0, 1.0, 1.1, seed=1), 0.85)


def taiko_double():
    total = int(RATE * 1.9)
    # 「ドン、ドーン」：2 打目を強く長く
    return normalize(mix(taiko_hit(total, 0.0, 0.8, 0.9, seed=2), taiko_hit(total, 0.34, 1.0, 1.5, seed=3)), 0.92)


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
    for name, samples in (("taiko-single.wav", taiko_single()), ("taiko-double.wav", taiko_double())):
        path = OUT_DIR / name
        write_wav(path, samples)
        print("wrote", path)


if __name__ == "__main__":
    main()
