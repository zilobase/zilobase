import type { MeetingCaptureSource } from "./types";

export const SAMPLE_RATE = 24_000;

export const FRAME_SAMPLES = 480;

export class StreamingResampler {
  private readonly input: number[] = [];
  private position = 0;
  private readonly ratio: number;

  constructor(fromRate: number, toRate: number) {
    this.ratio = fromRate / toRate;
  }

  process(samples: Float32Array) {
    if (this.ratio === 1) return samples;
    this.input.push(...samples);
    const output: number[] = [];
    while (this.position + 1 < this.input.length) {
      const lower = Math.floor(this.position);
      const fraction = this.position - lower;
      output.push(this.input[lower] + (this.input[lower + 1] - this.input[lower]) * fraction);
      this.position += this.ratio;
    }
    const consumed = Math.floor(this.position);
    if (consumed > 0) {
      this.input.splice(0, consumed);
      this.position -= consumed;
    }
    return Float32Array.from(output);
  }
}

export function mixSources(
  microphone: Float32Array,
  system: Float32Array,
  activeSources: MeetingCaptureSource[],
) {
  const output = new Float32Array(FRAME_SAMPLES);
  const sourceCount = Math.max(1, activeSources.length);
  for (let index = 0; index < output.length; index += 1) {
    const value =
      ((activeSources.includes("microphone") ? microphone[index] : 0) +
        (activeSources.includes("system") ? system[index] : 0)) /
      sourceCount;
    output[index] = Math.tanh(value);
  }
  return output;
}

export function floatToPcm(samples: Float32Array) {
  const output = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    output[index] = Math.round(Math.max(-1, Math.min(1, samples[index])) * 0x7fff);
  }
  return output;
}
