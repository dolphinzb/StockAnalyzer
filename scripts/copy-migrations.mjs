/**
 * 构建期把迁移目录复制到编译产物下
 * - sql/migrations/        → dist-electron/sql/migrations/（业务库 stockanalyzer.db）
 * - sql/market-migrations/ → dist-electron/sql/market-migrations/（行情库 market_data.db）
 *
 * 原因：tsc 只产出 .js/.d.ts，不会复制 .sql；而运行时按编译产物相对路径读取迁移文件，
 * 打包白名单已包含 dist-electron 下的全部文件，会把它一并带进 asar。
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 需要同步的迁移目录名 */
const MIGRATION_DIRS = ['migrations', 'market-migrations'];

let failed = false;

for (const dirName of MIGRATION_DIRS) {
  const source = join(projectRoot, 'sql', dirName);
  const target = join(projectRoot, 'dist-electron', 'sql', dirName);

  if (!existsSync(source)) {
    console.error(`[copy-migrations] 迁移目录不存在: ${source}`);
    failed = true;
    continue;
  }

  rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });

  console.log(`[copy-migrations] ${source} → ${target}`);
}

if (failed) {
  process.exit(1);
}
