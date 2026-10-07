// Explicit local Windows tool installation; no system PATH or registry changes.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve('.local/tools');
const packages = [
  {
    name: 'ffmpeg',
    version: '9.0.2',
    url: 'https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip',
    sha256: '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba',
  },
  {
    name: 'poppler',
    version: '26.09.0-0',
    url: 'https://github.com/oschwartz10612/poppler-windows/releases/download/v26.09.0-0/Release-26.09.0-0.zip',
    sha256: '7a6f256a0ddf7536182246a5733331bf4677cbcc34f4663774947ad34556c8d0',
  },
  {
    name: 'clamav',
    version: '1.5.4',
    url: 'https://github.com/Cisco-Talos/clamav/releases/download/clamav-1.5.4/clamav-1.5.4.win.x64.zip',
    sha256: '0d9e0228b2674137ea1a2853566c98a0278ad52ab2582c3d6dbd75373848c395',
  },
];
if (process.platform !== 'win32' || process.env.NODE_ENV === 'production')
  throw new Error(
    'This installer is for local Windows development only. See Media operations for Linux packages.',
  );
await mkdir(path.join(root, 'downloads'), { recursive: true });
for (const item of packages) {
  const archive = path.join(root, 'downloads', item.name + '-' + item.version + '.zip');
  let body;
  try {
    body = await readFile(archive);
  } catch {
    console.log('Downloading ' + item.name + ' ' + item.version);
    const response = await fetch(item.url, { signal: AbortSignal.timeout(300000) });
    if (!response.ok) throw new Error('Tool download failed: ' + item.name);
    body = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(body).digest('hex') !== item.sha256)
    throw new Error('Publisher checksum mismatch: ' + item.name);
  await writeFile(archive, body);
  const destination = path.join(root, item.name);
  await mkdir(destination, { recursive: true });
  // Paths are fixed task-owned directories, passed as arguments rather than shell interpolation.
  const script =
    'param($archive,$destination) Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force';
  const scriptFile = path.join(root, 'expand.ps1');
  await writeFile(scriptFile, script);
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptFile, archive, destination],
    { stdio: 'inherit', windowsHide: true },
  );
  if (result.error || result.status !== 0) throw new Error('Tool extraction failed: ' + item.name);
  console.log('Verified/extracted ' + item.name + ' ' + item.version);
}
async function find(directory, name) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = await find(file, name);
      if (found) return found;
    } else if (entry.name === name) return file;
  }
}
const commands = {};
for (const [key, folder, name] of [
  ['MEDIA_FFMPEG', 'ffmpeg', 'ffmpeg.exe'],
  ['MEDIA_FFPROBE', 'ffmpeg', 'ffprobe.exe'],
  ['MEDIA_PDFINFO', 'poppler', 'pdfinfo.exe'],
  ['MEDIA_PDFTOPPM', 'poppler', 'pdftoppm.exe'],
  ['CLAMD', 'clamav', 'clamd.exe'],
  ['FRESHCLAM', 'clamav', 'freshclam.exe'],
]) {
  commands[key] = await find(path.join(root, folder), name);
  if (!commands[key]) throw new Error('Missing extracted command: ' + name);
}
await writeFile(
  path.join(root, 'commands.json'),
  JSON.stringify({ packages, commands }, null, 2) + '\n',
);
console.log('Local commands recorded; configure/update ClamAV signatures before starting intake.');
