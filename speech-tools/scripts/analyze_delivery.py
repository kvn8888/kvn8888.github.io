#!/usr/bin/env python3
"""Extract interpretable delivery metrics from a speech recording."""

from __future__ import annotations

import argparse
import json
import math
import wave
from pathlib import Path
from typing import Any

import numpy as np
import parselmouth
import webrtcvad


FRAME_MS = 30
SAMPLE_RATE = 16000
MIN_INTERNAL_PAUSE_SEC = 0.18
MAX_SERIES_POINTS = 220


def finite_float(value: float | np.floating[Any] | None, digits: int = 3) -> float | None:
    if value is None or not math.isfinite(float(value)):
        return None
    return round(float(value), digits)


def smooth_flags(flags: list[bool], frame_sec: float) -> list[bool]:
    smoothed = flags[:]
    max_gap_frames = max(1, round(0.18 / frame_sec))
    min_speech_frames = max(1, round(0.12 / frame_sec))

    index = 0
    while index < len(smoothed):
        if smoothed[index]:
            index += 1
            continue
        end = index
        while end < len(smoothed) and not smoothed[end]:
            end += 1
        if index > 0 and end < len(smoothed) and end - index <= max_gap_frames:
            for cursor in range(index, end):
                smoothed[cursor] = True
        index = end

    index = 0
    while index < len(smoothed):
        if not smoothed[index]:
            index += 1
            continue
        end = index
        while end < len(smoothed) and smoothed[end]:
            end += 1
        if end - index < min_speech_frames:
            for cursor in range(index, end):
                smoothed[cursor] = False
        index = end

    return smoothed


def collect_vad_metrics(wav_path: Path) -> tuple[list[dict[str, float]], list[dict[str, float]], float]:
    with wave.open(str(wav_path), "rb") as wav_file:
        if wav_file.getnchannels() != 1 or wav_file.getsampwidth() != 2 or wav_file.getframerate() != SAMPLE_RATE:
            raise RuntimeError("normalized audio must be mono 16-bit PCM at 16 kHz")
        pcm = wav_file.readframes(wav_file.getnframes())

    frame_samples = SAMPLE_RATE * FRAME_MS // 1000
    frame_bytes = frame_samples * 2
    frame_sec = FRAME_MS / 1000
    vad = webrtcvad.Vad(2)
    flags = [
        vad.is_speech(pcm[offset : offset + frame_bytes], SAMPLE_RATE)
        for offset in range(0, len(pcm) - frame_bytes + 1, frame_bytes)
    ]
    flags = smooth_flags(flags, frame_sec)

    speech_segments: list[dict[str, float]] = []
    start_index: int | None = None
    for index, is_speech in enumerate(flags + [False]):
        if is_speech and start_index is None:
            start_index = index
        elif not is_speech and start_index is not None:
            speech_segments.append(
                {
                    "startSec": round(start_index * frame_sec, 3),
                    "endSec": round(index * frame_sec, 3),
                    "durationSec": round((index - start_index) * frame_sec, 3),
                }
            )
            start_index = None

    pauses: list[dict[str, float]] = []
    for previous, current in zip(speech_segments, speech_segments[1:]):
        duration = current["startSec"] - previous["endSec"]
        if duration >= MIN_INTERNAL_PAUSE_SEC:
            pauses.append(
                {
                    "startSec": previous["endSec"],
                    "endSec": current["startSec"],
                    "durationSec": round(duration, 3),
                }
            )

    voiced_duration = sum(segment["durationSec"] for segment in speech_segments)
    return speech_segments, pauses, round(voiced_duration, 3)


def downsample_series(
    times: np.ndarray,
    values: np.ndarray,
    value_key: str,
    max_points: int = MAX_SERIES_POINTS,
) -> list[dict[str, float | None]]:
    if len(times) == 0:
        return []

    step = max(1, math.ceil(len(times) / max_points))
    points: list[dict[str, float | None]] = []
    for start in range(0, len(times), step):
        bucket_times = times[start : start + step]
        bucket_values = values[start : start + step]
        finite_values = bucket_values[np.isfinite(bucket_values)]
        value = float(np.mean(finite_values)) if len(finite_values) else None
        points.append({"timeSec": finite_float(float(np.mean(bucket_times))), value_key: finite_float(value)})
    return points


def percentile_range(values: np.ndarray, low: float = 5, high: float = 95) -> float | None:
    finite_values = values[np.isfinite(values)]
    if len(finite_values) == 0:
        return None
    return float(np.percentile(finite_values, high) - np.percentile(finite_values, low))


def collect_acoustic_metrics(wav_path: Path, alignment: dict[str, Any]) -> dict[str, Any]:
    sound = parselmouth.Sound(str(wav_path))
    duration_sec = sound.get_total_duration()

    pitch = sound.to_pitch(time_step=0.02, pitch_floor=75, pitch_ceiling=500)
    frequencies = pitch.selected_array["frequency"].astype(float)
    frequencies[frequencies <= 0] = np.nan
    voiced_frequencies = frequencies[np.isfinite(frequencies)]
    median_f0 = float(np.median(voiced_frequencies)) if len(voiced_frequencies) else None
    semitones = (
        12 * np.log2(frequencies / median_f0)
        if median_f0 is not None and median_f0 > 0
        else np.full_like(frequencies, np.nan)
    )

    intensity = sound.to_intensity(time_step=0.02, minimum_pitch=75)
    intensity_values = intensity.values[0].astype(float)
    intensity_values[~np.isfinite(intensity_values) | (intensity_values <= 0)] = np.nan

    ending_pitch_delta = None
    voiced_semitones = semitones[np.isfinite(semitones)]
    if len(voiced_semitones) >= 6:
        tail_size = max(3, round(len(voiced_semitones) * 0.2))
        ending_pitch_delta = float(np.mean(voiced_semitones[-tail_size:]) - np.mean(voiced_semitones[:-tail_size]))

    pitch_range = percentile_range(semitones)
    intensity_range = percentile_range(intensity_values)
    pitch_stddev = float(np.std(voiced_semitones)) if len(voiced_semitones) else None
    finite_intensity = intensity_values[np.isfinite(intensity_values)]
    intensity_stddev = float(np.std(finite_intensity)) if len(finite_intensity) else None

    # Azure-aligned vowel formants: descriptive only, use the middle 50% to reduce boundaries.
    # A clip needs several vowel categories before within-speaker z-scores are meaningful.
    vowels = []
    phonemes = alignment.get("phonemes", [])[:300]
    formants = sound.to_formant_burg(time_step=0.01, max_number_of_formants=5,
                                    maximum_formant=5500, window_length=0.025) if phonemes else None
    for segment in phonemes:
        if not isinstance(segment, dict):
            continue
        phoneme = str(segment.get("phoneme", ""))
        if not any(symbol in phoneme for symbol in "aeiouɑɐɒæəɛɜɞɪʊɔʌɨʉɚɝøœy"):
            continue
        try:
            start, end = float(segment["startSec"]), float(segment["endSec"])
        except (KeyError, ValueError, TypeError):
            continue
        if not (0 <= start < end <= duration_sec + 0.01 and end - start >= 0.045):
            continue
        times = np.linspace(start + (end-start)*0.25, start + (end-start)*0.75, 5)
        pairs = [(formants.get_value_at_time(1, t), formants.get_value_at_time(2, t)) for t in times]
        pairs = [(f1, f2) for f1, f2 in pairs if math.isfinite(f1) and math.isfinite(f2) and 150 < f1 < 1200 and f1 + 100 < f2 < 4000]
        if len(pairs) < 3:
            continue
        vowels.append({"id": str(segment.get("id", "")), "phoneme": phoneme,
                       "f1Hz": finite_float(np.median([p[0] for p in pairs]), 1),
                       "f2Hz": finite_float(np.median([p[1] for p in pairs]), 1),
                       "f1Z": None, "f2Z": None})
    if len(vowels) >= 8 and len({v["phoneme"] for v in vowels}) >= 3:
        for field, zfield in [("f1Hz", "f1Z"), ("f2Hz", "f2Z")]:
            values = np.array([v[field] for v in vowels])
            std = np.std(values)
            if std > 0:
                for vowel, val in zip(vowels, (values-np.mean(values))/std):
                    vowel[zfield] = finite_float(val)

    # Normalize pitch by each clip's voiced median, then sample equivalent fractions of aligned phrases.
    phrase_pitch = []
    pitch_times = pitch.xs()
    for phrase in alignment.get("phrases", [])[:80]:
        try:
            start, end = float(phrase["startSec"]), float(phrase["endSec"])
        except (KeyError, ValueError, TypeError):
            continue
        if not 0 <= start < end <= duration_sec + 0.01:
            continue
        contour = []
        for left, right in zip(np.linspace(start, end, 6)[:-1], np.linspace(start, end, 6)[1:]):
            values = semitones[(pitch_times >= left) & (pitch_times < right) & np.isfinite(semitones)]
            contour.append(finite_float(np.median(values), 1) if len(values) >= 2 else None)
        valid = [value for value in contour if value is not None]
        phrase_pitch.append({"id": str(phrase.get("id", "")), "contourSemitones": contour,
                             "endingDeltaSemitones": finite_float(valid[-1]-valid[0], 1) if len(valid) >= 3 else None})
    return {
        "durationSec": finite_float(duration_sec),
        "vowels": vowels,
        "phrasePitch": phrase_pitch,
        "pitch": {
            "medianHz": finite_float(median_f0, 1),
            "rangeSemitones": finite_float(pitch_range, 1),
            "stddevSemitones": finite_float(pitch_stddev, 1),
            "endingDeltaSemitones": finite_float(ending_pitch_delta, 1),
            "series": downsample_series(pitch.xs(), semitones, "semitones"),
        },
        "intensity": {
            "rangeDb": finite_float(intensity_range, 1),
            "stddevDb": finite_float(intensity_stddev, 1),
            "series": downsample_series(intensity.xs(), intensity_values, "db"),
        },
    }


def analyze(input_path: Path, alignment: dict[str, Any]) -> dict[str, Any]:
    # Only canonical PCM is accepted; this is exactly the audio sent to Azure.
    with wave.open(str(input_path), "rb") as sound_file:
        if sound_file.getnchannels() != 1 or sound_file.getsampwidth() != 2 or sound_file.getframerate() != SAMPLE_RATE:
            raise ValueError("Expected mono 16 kHz PCM")
        if not 0 < sound_file.getnframes() <= 30 * SAMPLE_RATE:
            raise ValueError("Audio must be 30 seconds or shorter")
    speech_segments, pauses, voiced_duration = collect_vad_metrics(input_path)
    metrics = collect_acoustic_metrics(input_path, alignment)
    return {
        "version": 2,
        "summary": {"durationSec": metrics["durationSec"], "voicedDurationSec": voiced_duration,
                    "pauseCount": len(pauses), "totalPauseSec": finite_float(sum(p["durationSec"] for p in pauses)),
                    "longPauseCount": sum(1 for p in pauses if p["durationSec"] >= 1)},
        "pitch": metrics["pitch"],
        "intensity": metrics["intensity"],
        "speechSegments": speech_segments,
        "pauses": pauses,
        "vowels": metrics["vowels"],
        "phrasePitch": metrics["phrasePitch"],
        "acousticInsights": [],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--alignment", type=Path)
    args = parser.parse_args()
    alignment = json.loads(args.alignment.read_text()) if args.alignment else {}
    print(json.dumps(analyze(args.input, alignment), separators=(",", ":"), allow_nan=False))


if __name__ == "__main__":
    main()
