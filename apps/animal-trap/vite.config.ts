/**
 * vite.config.ts — 화면 번들만 만든다. Worker 는 wrangler 가 따로 번들한다.
 * 외부 자원(CDN·외부 글꼴)을 쓰지 않는다 — 학교망에서 하나라도 막히면 수업이 멈춘다.
 * 이 파일은 어느 tsconfig 에도 들지 않는다(node 타입을 화면 검사에 끌어들이지 않기 위해).
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: 'src/client',
  base: '/',
  build: {
    outDir: at('./dist/client'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        index: at('./src/client/index.html'),     // 팀 폰
        teacher: at('./src/client/teacher.html'), // 교사 진행
        tv: at('./src/client/tv.html'),           // TV (읽기 전용)
        // 문제은행 관리는 별도 진입점 — 수업용 번들에 관리 코드가 실리지 않게
        admin: at('./src/client/admin.html')
      }
    }
  }
});
