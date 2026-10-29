import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { stickerCode } from './sticker-code.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(root, 'src', 'data', 'stickers.json');
const outputDir = path.join(root, 'public', 'sticker');
const POSTER_SUFFIX = '-still';
const POSTER_OPTIONS = { quality: 72, effort: 6 };
const supportedExtensions = new Set(['.png', '.gif', '.webp']);

function parseArgs(argv) {
  const options = {
    input: null,
    names: null,
    set: 'ml',
    label: '偶像大师百万现场',
    dryRun: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (['--input', '--set', '--label', '--names'].includes(arg)) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`选项 ${arg} 缺少值`);
      options[arg.slice(2)] = value;
      i += 1;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  if (!options.input) throw new Error('请指定 --input <文件或目录>');
  if (!/^[a-z0-9]+$/u.test(options.set)) throw new Error('--set 只能使用小写英文字母和数字');
  if (!options.label.trim()) throw new Error('--label 不能为空');
  return options;
}

async function listFiles(inputPath) {
  const inputStat = await stat(inputPath);
  if (inputStat.isFile()) {
    if (!supportedExtensions.has(path.extname(inputPath).toLowerCase())) {
      throw new Error(`只支持 PNG、GIF 或 WebP 图片：${inputPath}`);
    }
    return [inputPath];
  }
  if (!inputStat.isDirectory()) throw new Error(`输入不是文件或目录：${inputPath}`);
  const files = [];
  for (const entry of await readdir(inputPath, { withFileTypes: true })) {
    const fullPath = path.join(inputPath, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(fullPath)));
    else if (entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase()))
      files.push(fullPath);
  }
  return files.sort((a, b) => a.localeCompare(b, 'en'));
}

function fallbackLabel(fileName) {
  return path
    .parse(fileName)
    .name.replace(/@\d+x$/u, '')
    .replace(/^\[/u, '')
    .replace(/\]$/u, '');
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function readNames(namesFile, raw) {
  if (!namesFile) return new Map();
  return new Map(Object.entries(raw));
}

async function buildJob(file, options, existing, names) {
  const fileName = path.basename(file);
  const seed = names.get(fileName);
  const seedLabel = typeof seed === 'string' ? seed : seed?.label;
  const label = (existing?.label ?? seedLabel ?? fallbackLabel(fileName)).trim();
  if (!label) throw new Error(`无法确定贴纸名称：${fileName}`);
  const keywords = [
    ...new Set([
      label,
      options.label.trim(),
      options.set,
      ...(existing?.keywords ?? []).filter(
        (word) => typeof word === 'string' && word !== existing?.label,
      ),
      ...(typeof seed === 'string' ? [] : (seed?.keywords ?? [])),
    ]),
  ].filter(Boolean);
  const code = stickerCode(options.set, label);
  return { fileName, code, label, keywords, file };
}

async function prepareJob(job, options) {
  const sourceBuffer = await readFile(job.file);
  const inputMetadata = await sharp(sourceBuffer, { animated: true }).metadata();
  const width = inputMetadata.width;
  const height = inputMetadata.pageHeight ?? inputMetadata.height;
  if (!width || !height) throw new Error(`无法读取宽高：${job.file}`);

  let outputBuffer = sourceBuffer;
  if (inputMetadata.format !== 'webp') {
    const animated = (inputMetadata.pages ?? 1) > 1;
    outputBuffer = await sharp(sourceBuffer, { animated })
      .webp({
        quality: 65,
        effort: 6,
        alphaQuality: 100,
        ...(animated ? { loop: inputMetadata.loop ?? 0 } : {}),
      })
      .toBuffer();
  }

  const outputMetadata = await sharp(outputBuffer, { animated: true }).metadata();
  if (outputMetadata.format !== 'webp') throw new Error(`输出不是 WebP：${job.code}`);
  if (
    outputMetadata.width !== width ||
    (outputMetadata.pageHeight ?? outputMetadata.height) !== height
  ) {
    throw new Error(`WebP 尺寸变化：${job.code} ${width}×${height} 发生变化`);
  }

  const frames = outputMetadata.pages ?? 1;
  const posterBuffer = await sharp(outputBuffer, { animated: true, page: frames - 1 })
    .webp(POSTER_OPTIONS)
    .toBuffer();
  const posterMetadata = await sharp(posterBuffer).metadata();
  if (posterMetadata.width !== width || posterMetadata.height !== height) {
    throw new Error(`尾帧尺寸不符：${job.code}`);
  }

  return {
    record: {
      code: job.code,
      label: job.label,
      set: options.set,
      setLabel: options.label.trim(),
      src: `/sticker/${job.code}.webp`,
      poster: `/sticker/${job.code}${POSTER_SUFFIX}.webp`,
      width,
      height,
      keywords: job.keywords,
    },
    outputBuffer,
    posterBuffer,
    frames,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const resolvedOutput = path.resolve(outputDir);
  if (inputPath === resolvedOutput || inputPath.startsWith(`${resolvedOutput}${path.sep}`)) {
    throw new Error('输入素材不能来自 public/sticker，请用未压缩原图作为输入');
  }

  const files = await listFiles(inputPath);
  if (!files.length) throw new Error('没有找到可导入的 PNG、GIF 或 WebP 图片');

  const current = await readJson(registryPath, []);
  if (!Array.isArray(current)) throw new Error('stickers.json 应为数组');
  const names = readNames(
    options.names && path.resolve(options.names),
    options.names ? await readJson(path.resolve(options.names), {}) : {},
  );
  if (!options.force && current.length > files.length) {
    throw new Error(
      `输入只有 ${files.length} 张，但注册表已有 ${current.length} 条，疑似选错目录；确认要重建请加 --force`,
    );
  }

  // 不存原始文件名：材料集不变时按导入顺序（文件名字典序）对齐，保留已编辑的名称
  const existing = current.length === files.length ? current : [];
  const jobs = [];
  for (const [index, file] of files.entries())
    jobs.push(await buildJob(file, options, existing[index], names));

  const plannedCodes = new Set();
  const plannedFiles = new Set();
  for (const job of jobs) {
    if (plannedCodes.has(job.code)) throw new Error(`本批素材中短代码重复：${job.code}`);
    if (plannedFiles.has(job.fileName)) throw new Error(`本批素材中文件名重复：${job.fileName}`);
    plannedCodes.add(job.code);
    plannedFiles.add(job.fileName);
  }

  const prepared = [];
  for (const job of jobs) prepared.push(await prepareJob(job, options));
  const records = prepared.map((item) => item.record);

  if (options.dryRun) {
    for (const item of prepared) {
      const { record } = item;
      console.log(
        `${record.code}: ${record.width}×${record.height}, ${item.frames} 帧, ${record.src} (+ ${path.basename(record.poster)})`,
      );
    }
    console.log(`共 ${records.length} 条；未写入任何文件。`);
    return;
  }

  await mkdir(outputDir, { recursive: true });
  for (const item of prepared) {
    await writeFile(path.join(outputDir, `${item.record.code}.webp`), item.outputBuffer);
    await writeFile(
      path.join(outputDir, `${item.record.code}${POSTER_SUFFIX}.webp`),
      item.posterBuffer,
    );
  }

  const keep = new Set(
    records.flatMap((record) => [`${record.code}.webp`, `${record.code}${POSTER_SUFFIX}.webp`]),
  );
  for (const entry of await readdir(outputDir, { withFileTypes: true })) {
    if (!entry.isFile() || keep.has(entry.name)) continue;
    await rm(path.join(outputDir, entry.name));
  }

  const previous = current.length === records.length ? current : [];
  await writeFile(registryPath, `${JSON.stringify(records, null, 2)}\n`);

  for (const [index, record] of records.entries()) {
    const before = previous[index];
    if (!before) console.log(`新增 ${record.code}`);
    else if (before.code !== record.code) console.log(`改名 ${before.code} → ${record.code}`);
  }
  console.log(`已写入 ${records.length} 张贴纸（${options.set} / ${options.label.trim()}）。`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
