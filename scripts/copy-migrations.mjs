/**
 * 构建期把 sql/migrations/ 复制到 dist-electron/sql/migrations/
 * 原因：tsc 只产出 .js/.d.ts，不会复制 .sql；而运行时按编译产物相对路径读取迁移文件，
 * 打包白名单已包含 dist-electron 下的全部文件，会把它一并带进 asar。
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(projectRoot, 'sql', 'migrations');
const target = join(projectRoot, 'dist-electron', 'sql', 'migrations');

if (!existsSync(source)) {
  console.error(`[copy-migrations] 迁移目录不存在: ${source}`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(dirname(target), { recursive: true });
cpSync(source, target, { recursive: true });

console.log(`[copy-migrations] ${source} → ${target}`);
