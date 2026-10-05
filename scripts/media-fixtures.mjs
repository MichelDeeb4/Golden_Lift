import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
await fs.mkdir('.local', { recursive: true });
const directory = await fs.mkdtemp(path.resolve('.local/b5-fixtures-'));
sharp.cache(false);
await sharp({
  create: {
    width: 300,
    height: 1200,
    channels: 4,
    background: { r: 20, g: 90, b: 130, alpha: 0.7 },
  },
})
  .png()
  .toFile(path.join(directory, 'image.png'));
const text = 'BT /F1 14 Tf 40 100 Td (Synthetic Golden Lift B5 fixture - no company data) Tj ET\n';
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}endstream`,
];
let pdf = '%PDF-1.4\n',
  offsets = [0];
for (const [index, object] of objects.entries()) {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
}
const xref = Buffer.byteLength(pdf);
pdf +=
  `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
  offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n')
    .join('');
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
await fs.writeFile(path.join(directory, 'source.pdf'), pdf, { flag: 'wx' });
const result = spawnSync(
  process.env.MEDIA_FFMPEG ?? 'ffmpeg',
  [
    '-nostdin',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=640x360:rate=30',
    '-t',
    '2',
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    path.join(directory, 'video.mp4'),
  ],
  { windowsHide: true, encoding: 'utf8', timeout: 30000 },
);
if (result.status !== 0 || result.error)
  throw new Error(
    'FFmpeg fixture generation unavailable. Image/PDF fixtures were generated privately at ' +
      directory +
      '.',
  );
console.log(
  JSON.stringify({
    directory,
    files: ['image.png', 'video.mp4', 'source.pdf'].map((file) => path.join(directory, file)),
  }),
);
