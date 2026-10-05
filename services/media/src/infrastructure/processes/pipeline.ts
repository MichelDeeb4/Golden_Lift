import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, open, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApplicationError, record } from '@golden-lift/contracts';
import type { MediaProcessor } from '../../application/ports/processing.js';
import type {
  ProcessingClaim,
  ProcessingResult,
  MediaVariant,
} from '../../application/ports/media.js';
import type { PrivateStorage } from '../../application/ports/storage.js';
import type { MediaPolicy } from '../../domain/media-policy.js';
import { ClamAvScanner } from '../scanning/clamav.js';
import { run } from './run.js';

interface Output {
  profile: string;
  file: string;
  mime: string;
  width: number | null;
  height: number | null;
  duration: string | null;
}
const rejected = () => new ApplicationError('VALIDATION_FAILED', 'Unsupported media content.');
function positive(value: unknown, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > max) throw rejected();
  return n;
}
function videoInfo(text: string, policy: MediaPolicy, canonical: boolean) {
  const item = record(JSON.parse(text) as unknown),
    format = record(item['format']);
  if (!Array.isArray(item['streams']) || item['streams'].length < 1 || item['streams'].length > 2)
    throw rejected();
  const streams = item['streams'].map((s: unknown) => record(s)),
    videos = streams.filter((s) => s['codec_type'] === 'video'),
    audios = streams.filter((s) => s['codec_type'] === 'audio');
  if (videos.length !== 1 || audios.length > 1 || videos.length + audios.length !== streams.length)
    throw rejected();
  const video = videos[0]!;
  if (
    !['h264', 'hevc'].includes(String(video['codec_name'])) ||
    (canonical && video['codec_name'] !== 'h264') ||
    audios.some((s) => !['aac', 'pcm_s16le', 'pcm_s24le'].includes(String(s['codec_name']))) ||
    !String(format['format_name'])
      .split(',')
      .some((s) => ['mov', 'mp4'].includes(s))
  )
    throw rejected();
  const width = positive(video['width'], 4096),
    height = positive(video['height'], 4096),
    duration = positive(format['duration'], policy.videoSeconds);
  const rate = String(video['avg_frame_rate']).split('/');
  const fps = Number(rate[0]) / Number(rate[1]);
  if (
    !Number.isFinite(fps) ||
    fps <= 0 ||
    fps > 60 ||
    width * height > policy.pixels ||
    duration * fps > 36000 ||
    (canonical && video['pix_fmt'] !== 'yuv420p')
  )
    throw rejected();
  return {
    width,
    height,
    duration: String(Math.round(duration * 1000)),
    audio: audios.length === 1,
  };
}
export class SystemMediaProcessor implements MediaProcessor {
  constructor(
    private readonly storage: PrivateStorage,
    private readonly scanner: ClamAvScanner,
    private readonly scratch: string,
    private readonly policy: MediaPolicy,
    private readonly commands: {
      ffmpeg: string;
      ffprobe: string;
      pdfinfo: string;
      pdftoppm: string;
    },
    private readonly outputBytes = 300 * 1024 * 1024,
  ) {}
  async process(claim: ProcessingClaim, signal: AbortSignal): Promise<ProcessingResult> {
    await mkdir(this.scratch, { recursive: true, mode: 0o700 });
    const directory = await mkdtemp(path.join(this.scratch, 'b5-job-'));
    const input = path.join(directory, 'input'),
      handle = await open(input, 'wx', 0o600),
      hash = createHash('sha256');
    let bytes = 0;
    try {
      for await (const chunk of await this.storage.read(
        claim.asset.key,
        undefined,
        claim.asset.inputVersion,
      )) {
        if (signal.aborted) throw new Error('Lease lost.');
        bytes += chunk.byteLength;
        if (bytes > this.policy.maxBytes[claim.asset.kind]) throw rejected();
        hash.update(chunk);
        await handle.writeFile(chunk);
      }
      await handle.close();
      if (String(bytes) !== claim.asset.bytes || hash.digest('hex') !== claim.asset.sha256)
        throw rejected();
      const scanner = await this.scanner.scan(createReadStream(input), signal);
      const header = await open(input, 'r'),
        prefix = Buffer.alloc(16);
      try {
        await header.read(prefix, 0, 16, 0);
      } finally {
        await header.close();
      }
      const mime = prefix.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
        ? 'image/jpeg'
        : prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? 'image/png'
          : prefix.subarray(0, 4).toString() === 'RIFF' &&
              prefix.subarray(8, 12).toString() === 'WEBP'
            ? 'image/webp'
            : prefix.subarray(0, 5).toString() === '%PDF-'
              ? 'application/pdf'
              : prefix.subarray(4, 8).toString() === 'ftyp'
                ? 'video/mp4'
                : null;
      const expected: Record<string, RegExp> = {
        'image/jpeg': /\.jpe?g$/i,
        'image/png': /\.png$/i,
        'image/webp': /\.webp$/i,
        'video/mp4': /\.(mp4|mov)$/i,
        'application/pdf': /\.pdf$/i,
      };
      if (!mime || !expected[mime]?.test(claim.asset.originalName)) throw rejected();
      const evidence: Record<string, string> = {
        scanner,
        inputSha256: claim.asset.sha256!,
        pipeline: 'b5-v1',
      };
      let width: number | null = null,
        height: number | null = null,
        duration: string | null = null,
        outputs: Output[] = [];
      const options = { cwd: directory, timeoutMs: 900000, signal };
      if (claim.asset.kind === 'IMAGE') {
        if (!mime.startsWith('image/')) throw rejected();
        const result = record(
          JSON.parse(
            await run(
              process.execPath,
              [
                fileURLToPath(new URL('./image-entry.js', import.meta.url)),
                input,
                directory,
                String(this.policy.pixels),
              ],
              { ...options, timeoutMs: 90000 },
            ),
          ) as unknown,
        );
        width = positive(result['width'], this.policy.pixels);
        height = positive(result['height'], this.policy.pixels);
        evidence['sharp'] = String(result['sharp']);
        evidence['vips'] = String(result['vips']);
        if (!Array.isArray(result['outputs'])) throw rejected();
        outputs = result['outputs'].map((o: unknown) => {
          const x = record(o);
          return {
            profile: String(x['profile']),
            file: String(x['file']),
            mime: 'image/webp',
            width: positive(x['width'], 2048),
            height: positive(x['height'], 2048),
            duration: null,
          };
        });
      } else if (claim.asset.kind === 'VIDEO') {
        if (mime !== 'video/mp4') throw rejected();
        evidence['ffmpeg'] = (
          await run(this.commands.ffmpeg, ['-version'], { ...options, timeoutMs: 10000 })
        )
          .split('\n')[0]!
          .slice(0, 256);
        const probe = (file: string) =>
          run(
            this.commands.ffprobe,
            [
              '-v',
              'error',
              '-protocol_whitelist',
              'file',
              '-show_streams',
              '-show_format',
              '-of',
              'json',
              file,
            ],
            { ...options, timeoutMs: 30000 },
          );
        const original = videoInfo(await probe(input), this.policy, false);
        const playback = path.join(directory, 'playback.mp4');
        await run(
          this.commands.ffmpeg,
          [
            '-nostdin',
            '-v',
            'error',
            '-protocol_whitelist',
            'file',
            '-threads',
            '1',
            '-i',
            input,
            '-map',
            '0:v:0',
            ...(original.audio ? ['-map', '0:a:0'] : []),
            '-map_metadata',
            '-1',
            '-map_chapters',
            '-1',
            '-vf',
            "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
            '-c:v',
            'libx264',
            '-threads',
            '1',
            '-pix_fmt',
            'yuv420p',
            '-preset',
            'medium',
            '-crf',
            '23',
            '-maxrate',
            '5M',
            '-bufsize',
            '10M',
            '-r',
            '30',
            '-t',
            String(this.policy.videoSeconds),
            '-fs',
            String(Math.min(this.outputBytes, this.policy.outputBytes.VIDEO)),
            ...(original.audio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : ['-an']),
            '-movflags',
            '+faststart',
            playback,
          ],
          options,
        );
        const canonical = videoInfo(await probe(playback), this.policy, true);
        if (Math.abs(Number(canonical.duration) - Number(original.duration)) > 1000)
          throw rejected();
        width = canonical.width;
        height = canonical.height;
        duration = canonical.duration;
        const poster = path.join(directory, 'poster.jpg');
        await run(
          this.commands.ffmpeg,
          [
            '-nostdin',
            '-v',
            'error',
            '-protocol_whitelist',
            'file',
            '-ss',
            String(Math.min(1, Number(duration) / 2000)),
            '-threads',
            '1',
            '-i',
            playback,
            '-frames:v',
            '1',
            '-vf',
            "scale=w='min(640,iw)':h='min(640,ih)':force_original_aspect_ratio=decrease",
            '-q:v',
            '3',
            poster,
          ],
          { ...options, timeoutMs: 30000 },
        );
        outputs = [
          { profile: 'playback', file: playback, mime: 'video/mp4', width, height, duration },
          {
            profile: 'poster',
            file: poster,
            mime: 'image/jpeg',
            width: null,
            height: null,
            duration: null,
          },
        ];
      } else {
        if (mime !== 'application/pdf') throw rejected();
        const info = await run(this.commands.pdfinfo, [input], { ...options, timeoutMs: 30000 });
        evidence['poppler'] =
          (
            await run(this.commands.pdfinfo, ['-v'], {
              ...options,
              timeoutMs: 10000,
              captureStderr: true,
            })
          ).slice(0, 256) || 'pdfinfo version in stderr; capture operator tool manifest';
        const pages = /^Pages:\s+(\d+)$/m.exec(info),
          encrypted = /^Encrypted:\s+no\b/m.test(info),
          pageSize = /^Page size:\s+([\d.]+) x ([\d.]+)/m.exec(info);
        if (
          !pages ||
          !encrypted ||
          !pageSize ||
          positive(pages[1], this.policy.pdfPages) > this.policy.pdfPages ||
          positive(pageSize[1], 14400) * positive(pageSize[2], 14400) > 40000000
        )
          throw rejected();
        await run(
          this.commands.pdftoppm,
          [
            '-f',
            '1',
            '-l',
            '1',
            '-singlefile',
            '-scale-to',
            '1280',
            '-png',
            input,
            path.join(directory, 'preview'),
          ],
          { ...options, timeoutMs: 60000 },
        );
        outputs = [
          {
            profile: 'preview',
            file: path.join(directory, 'preview.png'),
            mime: 'image/png',
            width: null,
            height: null,
            duration: null,
          },
        ];
      }
      const variants: MediaVariant[] = [],
        published = new Map<string, MediaVariant>();
      let total = 0;
      for (const output of outputs) {
        if (output.mime.startsWith('image/')) {
          const checked = record(
            JSON.parse(
              await run(
                process.execPath,
                [fileURLToPath(new URL('./raster-entry.js', import.meta.url)), output.file],
                { cwd: directory, timeoutMs: 20000, signal },
              ),
            ) as unknown,
          );
          output.width = positive(checked['width'], 2048);
          output.height = positive(checked['height'], 2048);
        }
        if (path.dirname(output.file) !== directory) throw rejected();
        const previous = published.get(output.file);
        if (previous) {
          variants.push({ ...previous, profile: output.profile });
          continue;
        }
        const info = await stat(output.file);
        total += info.size;
        if (
          !info.isFile() ||
          info.size < 1 ||
          total > Math.min(this.outputBytes, this.policy.outputBytes[claim.asset.kind])
        )
          throw rejected();
        // Attempt-specific keys prevent a stale process from overwriting the selected generation.
        const key = `outputs/${claim.asset.id}/${claim.token}/${output.profile}`;
        const stored = await this.storage.put(key, createReadStream(output.file), info.size);
        const verified = await this.storage.inspect(key, info.size);
        if (verified.sha256 !== stored.sha256) throw rejected();
        const variant = {
          ...verified,
          profile: output.profile,
          mime: output.mime,
          width: output.width,
          height: output.height,
          duration: output.duration,
        };
        published.set(output.file, variant);
        variants.push(variant);
      }
      return { mime, width, height, duration, evidence, variants };
    } finally {
      await handle.close().catch(() => undefined);
      // mkdtemp owns this scratch directory; retained input/outputs live in a separate storage root.
      if (
        path.dirname(directory) !== path.resolve(this.scratch) ||
        !path.basename(directory).startsWith('b5-job-')
      )
        throw new Error('Unsafe scratch cleanup.');
      await rm(directory, { recursive: true, force: true });
    }
  }
}
