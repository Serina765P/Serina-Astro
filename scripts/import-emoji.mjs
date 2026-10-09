import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(root, 'src', 'data', 'emoji.json');
const outputDir = path.join(root, 'public', 'emoji');
const originalSetFolders = {
  '765pro': '765PRO表情包',
  afterglow: 'Afterglow动态表情包',
  sweet: '甜蜜时光表情包',
  scclassic: '闪耀色彩古韵新辉表情包',
  sc: '闪耀色彩表情包',
};
const labelAliases = new Map([
  ['！！', '惊叹号'],
  ['？', '问号'],
  ['…', '省略号'],
  ['...', '省略号'],
  ['呃...', '呃'],
  ['哈~哈~哈~', '哈哈哈'],
  ['打起来！', '打起来'],
  ['是她！', '是她'],
  ['是我！', '是我'],
]);
const supportedExtensions = new Set(['.png', '.gif', '.webp']);

function parseArgs(argv) {
  const options = { all: false, replace: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all') options.all = true;
    else if (arg === '--replace') options.replace = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (['--input', '--set', '--label', '--keywords'].includes(arg)) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`选项 ${arg} 缺少值`);
      options[arg.slice(2)] = value;
      i += 1;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  if (!options.input) throw new Error('请指定 --input <文件或目录>');
  if (!options.all && (!options.set || !options.label)) {
    throw new Error('新增表情需要同时指定 --set <稳定前缀> 和 --label <套装显示名>');
  }
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
  return files;
}

function sourceLabel(filePath, set) {
  let label = path.parse(filePath).name.replace(/^\[/u, '').replace(/\]$/u, '');
  const sourceFolder = originalSetFolders[set];
  if (sourceFolder && label.startsWith(`${sourceFolder}_`))
    label = label.slice(sourceFolder.length + 1);
  if (label.startsWith(`${set}_`)) label = label.slice(set.length + 1);
  return label;
}

function codeLabel(label) {
  const alias = labelAliases.get(label) ?? label;
  return alias.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/gu, '');
}

function assertCode(code) {
  if (!/^[a-z0-9]+_[\p{L}\p{N}_-]+$/u.test(code)) {
    throw new Error(`短代码格式无效：${code}（套装前缀请用小写字母和数字）`);
  }
}

async function collectAllSources(inputPath, current) {
  const files = await listFiles(inputPath);
  const byName = new Map(
    files.map((file) => [path.parse(file).name.replace(/^\[/u, '').replace(/\]$/u, ''), file]),
  );
  const jobs = [];
  for (const emoji of current) {
    const folder = originalSetFolders[emoji.set];
    if (!folder) throw new Error(`--all 不认识套装前缀 ${emoji.set}`);
    const source = byName.get(`${folder}_${emoji.label}`);
    if (!source) throw new Error(`原图目录缺少 ${folder} / ${emoji.label}`);
    jobs.push({ ...emoji, source });
  }
  return jobs;
}

async function prepareImage(job) {
  const sourceBuffer = await readFile(job.source);
  const inputMetadata = await sharp(sourceBuffer, { animated: true }).metadata();
  const width = inputMetadata.width;
  const height = inputMetadata.pageHeight ?? inputMetadata.height;
  if (!width || !height) throw new Error(`无法读取宽高：${job.source}`);

  let outputBuffer = sourceBuffer;
  if (inputMetadata.format !== 'webp') {
    const animated = (inputMetadata.pages ?? 1) > 1;
    const outputOptions = {
      quality: 65,
      effort: 6,
      alphaQuality: 100,
      minSize: true,
      mixed: true,
      ...(animated
        ? {
            loop: inputMetadata.loop ?? 0,
            ...(inputMetadata.delay ? { delay: inputMetadata.delay } : {}),
          }
        : {}),
    };
    outputBuffer = await sharp(sourceBuffer, { animated }).webp(outputOptions).toBuffer();
  }

  const outputMetadata = await sharp(outputBuffer, { animated: true }).metadata();
  if (outputMetadata.format !== 'webp') throw new Error(`输出不是 WebP：${job.code}`);
  if (inputMetadata.hasAlpha && !outputMetadata.hasAlpha) {
    const alpha = (await sharp(sourceBuffer, { animated: true }).stats()).channels.at(-1);
    if (alpha.min < 255) throw new Error(`透明通道丢失：${job.code}`);
  }
  if (
    outputMetadata.width !== width ||
    (outputMetadata.pageHeight ?? outputMetadata.height) !== height
  ) {
    throw new Error(
      `WebP 尺寸变化：${job.code} ${width}×${height} → ${outputMetadata.width}×${outputMetadata.pageHeight ?? outputMetadata.height}`,
    );
  }
  if ((inputMetadata.pages ?? 1) !== (outputMetadata.pages ?? 1)) {
    throw new Error(
      `动画帧数变化：${job.code} ${inputMetadata.pages ?? 1} → ${outputMetadata.pages ?? 1}`,
    );
  }
  if (inputMetadata.loop !== outputMetadata.loop && (inputMetadata.pages ?? 1) > 1) {
    throw new Error(`动画循环设置变化：${job.code} ${inputMetadata.loop} → ${outputMetadata.loop}`);
  }
  if ((inputMetadata.pages ?? 1) > 1 && inputMetadata.delay) {
    const outputDelays = outputMetadata.delay ?? [];
    if (
      inputMetadata.delay.length !== outputDelays.length ||
      inputMetadata.delay.some((delay, index) => delay !== outputDelays[index])
    ) {
      throw new Error(`动画帧间隔变化：${job.code}`);
    }
  }

  return {
    ...job,
    width,
    height,
    outputBuffer,
    sourceBytes: sourceBuffer.length,
    outputBytes: outputBuffer.length,
    frames: inputMetadata.pages ?? 1,
    delays: inputMetadata.delay ?? [],
    loop: inputMetadata.loop ?? 0,
    output: path.join(outputDir, `${job.code}.webp`),
  };
}

function safeOldPath(src) {
  if (!src.startsWith('/emoji/')) return null;
  const resolved = path.resolve(outputDir, src.slice('/emoji/'.length));
  return path.dirname(resolved) === outputDir ? resolved : null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const resolvedOutput = path.resolve(outputDir);
  if (inputPath === resolvedOutput || inputPath.startsWith(`${resolvedOutput}${path.sep}`)) {
    throw new Error('输入素材不能来自 public/emoji，请用未压缩原图作为输入');
  }

  const current = JSON.parse(await readFile(registryPath, 'utf8'));
  let jobs;
  if (options.all) {
    jobs = await collectAllSources(inputPath, current);
  } else {
    const set = options.set.trim();
    const setLabel = options.label.trim();
    if (!/^[a-z0-9]+$/u.test(set)) throw new Error('--set 只能使用小写英文字母和数字');
    if (!setLabel) throw new Error('--label 不能为空');
    const keywords = (options.keywords ?? '')
      .split(',')
      .map((word) => word.trim())
      .filter(Boolean);
    jobs = (await listFiles(inputPath)).map((source) => {
      const label = sourceLabel(source, set);
      const suffix = codeLabel(label);
      if (!suffix) throw new Error(`文件名无法生成短代码：${source}`);
      const code = `${set}_${suffix}`;
      assertCode(code);
      return {
        code,
        label,
        set,
        setLabel,
        source,
        keywords: [...new Set([label, setLabel, set, ...keywords])],
      };
    });
  }

  if (!jobs.length) throw new Error('没有找到可导入的 PNG、GIF 或 WebP 图片');
  const plannedCodes = new Set();
  const plannedSets = new Map();
  const registered = new Map(current.map((emoji, index) => [emoji.code, index]));
  for (const job of jobs) {
    assertCode(job.code);
    if (plannedCodes.has(job.code)) throw new Error(`本批素材中短代码重复：${job.code}`);
    plannedCodes.add(job.code);
    const previousSetLabel = plannedSets.get(job.set);
    if (previousSetLabel && previousSetLabel !== job.setLabel) {
      throw new Error(`同一批素材中的套装显示名不一致：${job.set}`);
    }
    plannedSets.set(job.set, job.setLabel);
    const existingSetLabel = current.find((emoji) => emoji.set === job.set)?.setLabel;
    if (existingSetLabel && existingSetLabel !== job.setLabel && !options.all) {
      throw new Error(`套装 ${job.set} 已登记为“${existingSetLabel}”，不能改成“${job.setLabel}”`);
    }
    const existing = registered.has(job.code);
    if (existing && !options.replace && !options.all)
      throw new Error(`短代码已存在：${job.code}；如要更新请加 --replace`);
    if (
      !existing &&
      (await fileExists(path.join(outputDir, `${job.code}.webp`))) &&
      !options.all &&
      !options.replace
    ) {
      throw new Error(`输出文件已存在：${job.code}.webp`);
    }
  }

  const prepared = [];
  for (const job of jobs) prepared.push(await prepareImage(job));
  if (options.dryRun) {
    for (const image of prepared) {
      console.log(
        `${image.code}: ${image.width}×${image.height}, ${image.frames} 帧, ${image.source} → ${path.basename(image.output)} (${image.outputBytes} B)`,
      );
    }
    return;
  }

  await mkdir(outputDir, { recursive: true });
  const oldEntries = [...current];
  const next = [...current];
  for (const image of prepared) {
    const item = {
      code: image.code,
      label: image.label,
      set: image.set,
      setLabel: image.setLabel,
      src: `/emoji/${path.basename(image.output)}`,
      width: image.width,
      height: image.height,
      keywords: image.keywords ?? [image.label, image.setLabel, image.set],
    };
    const index = next.findIndex((entry) => entry.code === image.code);
    if (index < 0) next.push(item);
    else next[index] = { ...next[index], ...item };
  }

  for (const image of prepared) await writeFile(image.output, image.outputBuffer);
  await writeFile(registryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');

  const activeSources = new Set(next.map((emoji) => emoji.src));
  for (const old of oldEntries) {
    if (activeSources.has(old.src)) continue;
    const stalePath = safeOldPath(old.src);
    if (stalePath && path.extname(stalePath).toLowerCase() !== '.webp')
      await rm(stalePath, { force: true });
  }

  const originalBytes = prepared.reduce((sum, item) => sum + item.sourceBytes, 0);
  const outputBytes = prepared.reduce((sum, item) => sum + item.outputBytes, 0);
  console.log(
    `${options.all ? '已迁移' : '已导入'} ${prepared.length} 张表情；${originalBytes} B → ${outputBytes} B。`,
  );
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

main().catch((error) => {
  console.error(`表情导入失败：${error.message}`);
  process.exitCode = 1;
});
