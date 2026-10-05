import sharp from 'sharp';
import path from 'node:path';

// Launched in an isolated child, never imported by the API process.
const [input, directory, pixelsString] = process.argv.slice(2);
if (!input || !directory || !pixelsString || !/^[1-9][0-9]*$/.test(pixelsString))
  throw new Error('Invalid image process invocation.');
sharp.cache(false);
sharp.concurrency(1);
const pixels = Number(pixelsString),
  image = sharp(input, { limitInputPixels: pixels, failOn: 'warning', sequentialRead: true });
const metadata = await image.metadata();
if (
  !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
  (metadata.pages ?? 1) !== 1 ||
  !metadata.width ||
  !metadata.height ||
  metadata.width * metadata.height > pixels
)
  throw new Error('Unsupported static image.');
const profiles = [
  ['thumbnail', 320],
  ['card', 640],
  ['detail', 1280],
  ['large', 2048],
] as const;
const outputs: { profile: string; file: string; width: number; height: number; mime: string }[] =
  [];
const reuse = new Map<number, { file: string; width: number; height: number }>();
for (const [profile, bound] of profiles) {
  const edge = Math.min(bound, Math.max(metadata.width, metadata.height));
  let output = reuse.get(edge);
  if (!output) {
    const file = path.join(directory, profile + '.webp');
    const info = await sharp(input, {
      limitInputPixels: pixels,
      failOn: 'warning',
      sequentialRead: true,
    })
      .rotate()
      .resize({ width: bound, height: bound, fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb')
      .webp({ quality: 82, effort: 4 })
      .timeout({ seconds: 45 })
      .toFile(file);
    const verified = await sharp(file, { limitInputPixels: pixels, failOn: 'warning' }).metadata();
    if (!verified.width || !verified.height || verified.format !== 'webp')
      throw new Error('Invalid derivative.');
    output = { file, width: info.width, height: info.height };
    reuse.set(edge, output);
  }
  outputs.push({ profile, ...output, mime: 'image/webp' });
}
console.log(
  JSON.stringify({
    width: metadata.autoOrient.width,
    height: metadata.autoOrient.height,
    sharp: sharp.versions.sharp,
    vips: sharp.versions.vips,
    outputs,
  }),
);
