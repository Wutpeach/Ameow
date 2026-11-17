import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// AI 成功完成审查后，将实际审查的提交 SHA 写入此文件；失败时保留旧记录。
const recordPath = join('D:/Ameow', '.ameow-docs-reviewed-sha');

try {
  // 直接查询 GitHub 的 main，禁止交互并限制等待时间。
  const output = execFileSync(
    'git',
    ['ls-remote', '--exit-code', 'https://github.com/Wutpeach/Ameow.git', 'refs/heads/main'],
    {
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' }
    }
  );

  const match = output.trim().match(/^([a-fA-F0-9]{40}|[a-fA-F0-9]{64})\s+refs\/heads\/main$/);
  if (!match) throw new Error('无法确定远程 main 的提交 SHA');

  let reviewed;
  try {
    reviewed = readFileSync(recordPath, 'utf8').trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  if (reviewed !== undefined && !/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(reviewed)) {
    throw new Error('已审查提交记录格式无效');
  }

  // 完整检查成功；缺少记录或 SHA 不同时允许执行。
  console.log('CINDY_PRECHECK_OK');
  process.exit(reviewed?.toLowerCase() === match[1].toLowerCase() ? 2 : 0);
} catch (error) {
  console.error('文档审查前置检查失败:', error.message);
  process.exit(1);
}
