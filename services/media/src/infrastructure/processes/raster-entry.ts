import sharp from 'sharp';
const input = process.argv[2];
if (!input) throw new Error('Missing generated raster.');
sharp.cache(false);
sharp.concurrency(1);
const image = sharp(input, { limitInputPixels: 4194304, failOn: 'warning' }),
  metadata = await image.metadata();
if (
  !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
  !metadata.width ||
  !metadata.height ||
  (metadata.pages ?? 1) !== 1
)
  throw new Error('Invalid generated raster.');
await image.timeout({ seconds: 15 }).stats();
console.log(JSON.stringify({ width: metadata.width, height: metadata.height }));
