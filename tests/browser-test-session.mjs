// Test-only cookies obtained by the official SSR client's fixture login.
export async function installTestSession(page){
 if(!process.env.SCORM_TEST_AUTH_COOKIE)return;
 await page.send('Network.setCookies',{cookies:process.env.SCORM_TEST_AUTH_COOKIE.split('; ').map(pair=>{const at=pair.indexOf('=');return {name:pair.slice(0,at),value:pair.slice(at+1),url:process.env.SCORM_TEST_URL,path:'/',sameSite:'Lax'};})});
}
