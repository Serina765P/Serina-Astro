import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const biomeShim = path.join(root, 'node_modules', '@biomejs', 'biome', 'bin', 'biome');

/** 写注册表 JSON，并套用仓库统一的 biome 格式；格式化不可用时退回普通缩进。 */
export async function writeRegistry(filePath, data) {
  const full = path.resolve(filePath);
  await writeFile(full, `${JSON.stringify(data, null, 2)}\n`);
  if (!existsSync(biomeShim)) return;
  try {
    execFileSync(process.execPath, [biomeShim, 'format', '--write', full], { stdio: 'ignore' });
  } catch {
    // 格式化只影响仓库风格，失败不应影响数据写入
  }
}
