// Real Auth sessions only. No fixtures, screenshots of personal data, role changes or inference.
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import assert from 'node:assert/strict';

export async function adminLiveBrowser({base,credentials,mark}) {
 const modulePath=process.env.SCORM_CDP_MODULE||join(process.env.USERPROFILE||'','.codex/skills/design-taste-frontend/scripts/lib/cdp.mjs');
 const {Browser}=await import(pathToFileURL(modulePath).href);
 const browser=await Browser.launch();
 try {
  const page=await browser.newPage();
  const wait=async fn=>{const start=Date.now();while(Date.now()-start<60000){if(await page.eval(fn))return;await new Promise(r=>setTimeout(r,150));}throw Error('admin_live_browser_timeout');};
  const ready=()=>wait(()=>!!document.querySelector('[data-admin-state=ready]'));
  const set=async(id,value)=>page.eval(({id,value})=>{const e=document.getElementById(id);if(!e)throw Error('field_missing');const type=e.tagName==='SELECT'?HTMLSelectElement:HTMLInputElement;Object.getOwnPropertyDescriptor(type.prototype,'value').set.call(e,value);e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));},{id,value});
  const click=async label=>page.eval(label=>{const e=[...document.querySelectorAll('button,a')].find(e=>e.getClientRects().length&&e.textContent.trim()===label&&!e.disabled);if(!e)throw Error('control_missing');e.click();},label);
  const login=async account=>{await page.goto(base+'/login',{timeoutMs:60000});await wait(()=>!!document.getElementById('email')&&Object.keys(document.querySelector('form')).some(k=>k.startsWith('__reactProps$')));await set('email',account.email);await set('password',account.password);await page.eval(()=>document.querySelector('form').requestSubmit());await wait(()=>!!document.querySelector('.user-menu'));};
  const logout=async()=>{await page.eval(()=>document.querySelector('.user-menu summary').click());await click('Cerrar sesión');await wait(()=>location.pathname==='/login');};
  try {
   await login(credentials.admin);await page.goto(base+'/admin',{timeoutMs:60000});await ready();
   assert.equal(await page.eval(()=>document.querySelectorAll('.admin-metrics').length>0),true);mark('Real browser ADMIN login and dashboard');
   await page.goto(base+'/admin?view=people&role=TEACHER');await ready();
   assert.equal(await page.eval(()=>[...document.querySelectorAll('[data-person-id] .badge')].every(e=>e.textContent==='TEACHER')&&document.querySelectorAll('[data-person-id]').length>0),true);mark('Real browser teacher list and role filter');
   await click('Ver cuenta');await wait(()=>!!document.querySelector('dialog[open]'));mark('Real browser account metadata detail');
   await page.goto(base+'/admin?view=people&role=ADMIN');await ready();await click('Ver cuenta');await wait(()=>!!document.querySelector('dialog[open]'));
   assert.equal(await page.eval(()=>[...document.querySelectorAll('dialog button')].find(e=>e.textContent.trim()==='Cambiar rol')?.disabled),true);mark('Real browser last ADMIN protection visible');
   await page.goto(base+'/admin?view=activities');await ready();mark('Real browser operational activities');
   for(const view of ['overview','people','activities']){await page.goto(base+'/admin?view='+view);await ready();await page.setViewport({width:390,height:900,mobile:true});assert.equal(await page.eval(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.setViewport({width:1440,height:900});}mark('Real browser three views fit narrow viewport');
  } finally {if(await page.eval(()=>!!document.querySelector('.user-menu')).catch(()=>false))await logout();}
  try {
   await login(credentials.teacher);await page.goto(base+'/admin');await wait(()=>location.pathname==='/');mark('Real browser TEACHER denied admin page');
   assert.equal(await page.eval(async()=>(await fetch('/api/admin/overview')).status),403);mark('Real browser TEACHER direct endpoint denied');
  } finally {if(await page.eval(()=>!!document.querySelector('.user-menu')).catch(()=>false))await logout();}
  await page.goto(base+'/admin');await wait(()=>location.pathname==='/login');mark('Real browser anonymous admin page denied');
 } finally {await browser.close();}
}
