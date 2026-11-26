# Pronunciation regression and human calibration

These 20 provider responses come from the synthetic TTS benchmark, not human recordings. The manifest records the original Azure scores. They check response parsing, preservation of measured scores, phoneme evidence, and alignment. They cannot establish human accent quality or universal thresholds. The current normalization profile has its own canary baseline (the WAV and measured baseline in `src/lib/fixtures`).

## Quick checks

- `node --test tests/pronunciation-ai.test.cjs`
- `PRONUNCIATION_AI_LIVE_SMOKE=1` enables the real Eleven v4 → Azure → Sol test (credentials via Doppler).
- `PRONUNCIATION_ENSEMBLE_LIVE_SMOKE=1 PRONUNCIATION_ACOUSTICS_PYTHON=/path/to/python` enables the two-voice, same-phrase reference range and actual Praat integration test. Python must have `speech-tools/requirements.txt` installed; ffmpeg must be on PATH. Both live tests use in-memory SQLite and synthetic S3 fixtures, not production history.
- `PRONUNCIATION_COACH_REGRESSION=1` enables live Sol checks over all 20 synthetic fixtures (evidence IDs, numeric claims and synthetic subject labeling).
- The weekly authenticated canary records score deviations and phoneme changes and private storage round trips for a fixed synthetic clip. New normalization versions require a new measured baseline.

## Human validation protocol (not yet conducted)

Recruit at least 10–20 consented clips across different speakers and target accents, with known scripts. Have two listeners independently rate intelligibility, specific perceived sound differences, stress/rhythm and usefulness of suggested drills without seeing Azure or model scores. Record disagreements and mark inconclusive cases. Compare ratings to the calibrated range, repeated phoneme patterns and evidence-grounded Sol coaching. Do not treat accent variation or a single low phoneme estimate as an error. Do not store human audio, identifying info, or ratings in the public repository.

Use the adjacent CSV as a review template with anonymized clip IDs. Inter-rater agreement, coaching precision and false-positive examples should be examined before adopting a human proficiency scale.
