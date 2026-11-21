import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from 'mediabunny';

// Mobile-optimized: Lower bitrate (24kbps) for phones with slow upload. Accuracy stays
// acceptable; the AI hears the words fine. Desktop keeps 48kbps for better accuracy.
const isMobile = () => typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

const SPEECH_DESKTOP = { codec: 'opus', numberOfChannels: 1, sampleRate: 24000, bitrate: 48000 } as const;
const SPEECH_MOBILE  = { codec: 'opus', numberOfChannels: 1, sampleRate: 16000, bitrate: 24000 } as const;

/** A small copy of a file's sound for the speech models. Only this leaves the device. */
export async function speechAudio(file: Blob) {
  const SPEECH = isMobile() ? SPEECH_MOBILE : SPEECH_DESKTOP;
  try {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const conversion = await Conversion.init({ input, output, video: { discard: true }, audio: SPEECH });
    if (conversion.isValid) {
      await conversion.execute();
      return output.target.buffer as ArrayBuffer;
    }
  } catch {
    // A browser that can't make a small copy sends the sound as it is.
  }
  return extractAudio(file);
}

/** Copies the audio track out of a file without re-encoding. */
export async function extractAudio(file: Blob, trim?: { start: number; end: number }) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const conversion = await Conversion.init({ input, output, video: { discard: true }, trim });
  if (!conversion.isValid) throw new Error('This file has no audio we can read.');
  await conversion.execute();
  return output.target.buffer as ArrayBuffer;
}
