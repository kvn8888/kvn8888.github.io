/**
 * delivery.ts — Invoke the Python/Praat acoustic analyzer for one recording.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface DeliveryPoint {
  timeSec: number;
  semitones?: number | null;
  db?: number | null;
}

export interface DeliveryPause {
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface DeliveryAnalysis {
  version: number;
  summary: {
    durationSec: number;
    voicedDurationSec: number;
    pauseCount: number;
    totalPauseSec: number;
    longPauseCount: number;
  };
  pitch: {
    medianHz: number | null;
    rangeSemitones: number | null;
    stddevSemitones: number | null;
    endingDeltaSemitones: number | null;
    series: DeliveryPoint[];
  };
  intensity: {
    rangeDb: number | null;
    stddevDb: number | null;
    series: DeliveryPoint[];
  };
  speechSegments: Array<{ startSec: number; endSec: number; durationSec: number }>;
  pauses: DeliveryPause[];
  acousticInsights: Array<{ code: string; severity: "improve" | "consider"; message: string }>;
}

export async function analyzeDelivery(audioBuffer: Buffer, originalName: string): Promise<DeliveryAnalysis> {
  const workDir = mkdtempSync(path.join(tmpdir(), "speech-tools-delivery-"));
  const extension = path.extname(originalName) || ".wav";
  const inputPath = path.join(workDir, `source${extension}`);
  const scriptPath = path.resolve(process.cwd(), "scripts", "analyze_delivery.py");
  writeFileSync(inputPath, audioBuffer);

  try {
    return await new Promise<DeliveryAnalysis>((resolve, reject) => {
      const proc = spawn("python3", [scriptPath, "--input", inputPath]);
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error("delivery analysis timed out after 60 seconds"));
      }, 60_000);

      proc.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      proc.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      proc.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`delivery analyzer exited ${code}: ${Buffer.concat(stderr).toString().slice(-1000)}`));
          return;
        }

        try {
          resolve(JSON.parse(Buffer.concat(stdout).toString()) as DeliveryAnalysis);
        } catch (error) {
          reject(new Error(`delivery analyzer returned invalid JSON: ${String(error)}`));
        }
      });
    });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
