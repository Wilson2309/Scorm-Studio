/* eslint-disable @typescript-eslint/no-require-imports */
// Read-only live-server canary. Catches the dev/HMR failure production-only QA missed.
require('../tests/register.cjs');
const fs=require('node:fs'),path=require('node:path');const {pathToFileURL}=require('node:url');const {cssFaults}=require('../tests/visual/structural-health.cjs');
async function main(){
 const url=process.env.SCORM_CSS_URL||'http://localhost:3000',out='artifacts/ui-recovery';fs.mkdirSync(out,{recursive:true});
 const response=await fetch(url+'/login'),html=await response.text(),sheets=[];let all='';
 for(const m of html.matchAll(/href="([^" ]+\.css[^" ]*)"/g)){const r=await fetch(new URL(m[1],url)),css=await r.text();if(!r.ok)throw Error('CSS request failed');all+=css;sheets.push({status:r.status,bytes:css.length});}
 if(!sheets.length||cssFaults(all).length)throw Error('Studio stylesheet missing or replaced');
 const {Browser}=await import(pathToFileURL(process.env.SCORM_CDP_MODULE||'./.cache/private/cdp.mjs').href),browser=await Browser.launch();
 try{const page=await browser.newPage();await page.goto(url+'/login');await page.eval(async()=>{await document.fonts.ready;});const styles=await page.eval(()=>({primary:getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),navy:getComputedStyle(document.documentElement).getPropertyValue('--navy').trim(),font:getComputedStyle(document.body).fontFamily}));if(styles.primary!=='#00549b'||styles.navy!=='#082b4c'||!/inter/i.test(styles.font))throw Error('Computed institutional styles missing');await page.screenshot({path:path.join(out,'login-after-1440.png'),format:'png',fullPage:true});fs.writeFileSync(path.join(out,'live-css-check.json'),JSON.stringify({status:'PASS',url,sheets,styles},null,2));console.log(JSON.stringify({liveCSS:'PASS',url,sheets:sheets.length}));}finally{await browser.close();}
}
main().catch(e=>{console.log(JSON.stringify({liveCSS:'FAIL',error:e.message}));process.exitCode=1;});
