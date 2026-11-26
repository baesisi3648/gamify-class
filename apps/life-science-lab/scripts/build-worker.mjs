import { mkdir, copyFile } from 'node:fs/promises';
const app = new URL('../',import.meta.url);
for (const file of ['index.html','styles.css','app.js','quiz.js','quiz-paper.js','autosave.js','draft-store.js','roster.js','seed.js','vendor/qrcode.mjs','vendor/xlsx.full.min.js']) {
  const target = new URL('dist/'+file,app);
  await mkdir(new URL('./',target),{recursive:true});
  await copyFile(new URL(file,app),target);
}
for (const [source,destination] of [['report-document.js','report-document.js'],['node_modules/html2pdf.js/dist/html2pdf.bundle.min.js','vendor/html2pdf.bundle.min.js'],['node_modules/html2pdf.js/dist/html2pdf.bundle.min.js.LICENSE.txt','vendor/html2pdf.bundle.min.js.LICENSE.txt']]) {
  const target = new URL('dist/'+destination,app);
  await mkdir(new URL('./',target),{recursive:true});
  await copyFile(new URL(source,app),target);
}
const fonts = new URL('dist/fonts/',app);
await mkdir(fonts,{recursive:true});
await copyFile(new URL('../../fonts/PretendardVariable.woff2',app),new URL('PretendardVariable.woff2',fonts));
console.log('Worker용 공개 화면·글꼴만 dist/에 준비했습니다.');
