import { randomUUID } from 'node:crypto';
import { link, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** 在目标同目录写一个唯一临时文件；写完才让调用方决定 rename 还是 link。 */
async function writeTempSibling(filePath, content) {
  const directory = path.dirname(filePath);
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(tempPath, content, { flag: 'wx' });
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
  return tempPath;
}

/**
 * 先写同目录临时文件再 rename，保证读者只会看到完整旧文件或完整新文件。
 * 临时文件与目标在同一文件系统，rename 才是原子的；跨目录/跨盘会退化成复制。
 */
export async function writeFileAtomic(filePath, content) {
  const tempPath = await writeTempSibling(filePath, content);
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

/**
 * 创建新文件：先写临时文件，再用 link 原子地挂到目标名。
 * link 在目标已存在时抛 EEXIST，因此同时保留「绝不覆盖」与「读者看不到半截文件」。
 */
export async function writeFileAtomicExclusive(filePath, content) {
  const tempPath = await writeTempSibling(filePath, content);
  try {
    await link(tempPath, filePath);
  } finally {
    await rm(tempPath, { force: true });
  }
}
