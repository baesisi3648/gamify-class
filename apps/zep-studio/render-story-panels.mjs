import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = normalize(join(scriptDir, '..', '..'));
const outputDir = join(scriptDir, 'assets', 'genesis', 'story-panels');
const profileDir = mkdtempSync(join(tmpdir(), 'genesis-panel-render-'));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png' };

function chromePath() {
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const found = candidates.find(existsSync);
  if (!found) throw new Error('Chrome 또는 Edge 실행 파일을 찾지 못했습니다.');
  return found;
}

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = normalize(join(repoRoot, pathname));
  if (!file.startsWith(repoRoot)) { response.writeHead(403); response.end('Forbidden'); return; }
  try {
    const content = readFileSync(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(content);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
mkdirSync(outputDir, { recursive: true });

try {
  for (let step = 1; step <= 7; step += 1) {
    const file = `panel_${String(step).padStart(2, '0')}.png`;
    const args = [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-crash-reporter', '--disable-breakpad',
      '--hide-scrollbars', '--force-device-scale-factor=1', '--default-background-color=00000000',
      '--window-size=1280,720', '--virtual-time-budget=1400', `--user-data-dir=${profileDir}`,
      `--screenshot=${join(outputDir, file)}`,
      `http://127.0.0.1:${port}/apps/zep-studio/story-panel-renderer.html?panel=${step}`
    ];
    await new Promise((resolve, reject) => {
      const child = spawn(chromePath(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let errorOutput = '';
      child.stderr.on('data', chunk => { errorOutput += chunk; });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve() : reject(new Error(errorOutput || `패널 ${step} 렌더링 실패`)));
    });
    console.log(`created ${file}`);
  }
} finally {
  server.close();
  rmSync(profileDir, { recursive: true, force: true });
}
