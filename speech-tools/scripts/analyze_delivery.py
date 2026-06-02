#!/usr/bin/env python3
"""Extract interpretable delivery metrics from a speech recording."""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import tempfile
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


def normalize_wav(input_path: Path, output_path: Path) -> None:
    command = [
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-i",
        str(input_path),
        "-ac",
        "1",
        "-ar",
        str(SAMPLE_RATE),
        "-c:a",
        "pcm_s16le",
        str(output_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg normalization failed: {result.stderr[-500:]}")


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


def collect_acoustic_metrics(wav_path: Path) -> dict[str, Any]:
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

    return {
        "durationSec": finite_float(duration_sec),
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


def build_acoustic_insights(metrics: dict[str, Any], pauses: list[dict[str, float]]) -> list[dict[str, str]]:
    insights: list[dict[str, str]] = []
    pitch = metrics["pitch"]
    intensity = metrics["intensity"]

    if pitch["rangeSemitones"] is not None and pitch["rangeSemitones"] < 4:
        insights.append(
            {
                "code": "narrow-pitch-range",
                "severity": "improve",
                "message": "Your pitch range was narrow. Emphasize the important words and vary your sentence shape more clearly.",
            }
        )
    if intensity["rangeDb"] is not None and intensity["rangeDb"] < 6:
        insights.append(
            {
                "code": "limited-intensity-range",
                "severity": "improve",
                "message": "Your volume stayed fairly even. Add a little more energy to the words you want listeners to remember.",
            }
        )
    if pitch["endingDeltaSemitones"] is not None and abs(pitch["endingDeltaSemitones"]) < 1:
        insights.append(
            {
                "code": "flat-ending",
                "severity": "consider",
                "message": "Your ending stayed relatively level. Let your pitch settle more clearly at the end of the thought.",
            }
        )
    if any(pause["durationSec"] >= 1 for pause in pauses):
        insights.append(
            {
                "code": "long-pause",
                "severity": "improve",
                "message": "One or more pauses were long enough to interrupt the flow. Review the highlighted pause locations.",
            }
        )

    return insights


def analyze(input_path: Path) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="delivery-analysis-") as temp_dir:
        wav_path = Path(temp_dir) / "normalized.wav"
        normalize_wav(input_path, wav_path)
        speech_segments, pauses, voiced_duration = collect_vad_metrics(wav_path)
        metrics = collect_acoustic_metrics(wav_path)

    return {
        "version": 1,
        "summary": {
            "durationSec": metrics["durationSec"],
            "voicedDurationSec": voiced_duration,
            "pauseCount": len(pauses),
            "totalPauseSec": finite_float(sum(pause["durationSec"] for pause in pauses)),
            "longPauseCount": sum(1 for pause in pauses if pause["durationSec"] >= 1),
        },
        "pitch": metrics["pitch"],
        "intensity": metrics["intensity"],
        "speechSegments": speech_segments,
        "pauses": pauses,
        "acousticInsights": build_acoustic_insights(metrics, pauses),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(analyze(args.input), separators=(",", ":"), allow_nan=False))


if __name__ == "__main__":
    main()
