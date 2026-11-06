// Validates the private launcher UI checks locally; never remote acceptance evidence.
import {adminLiveBrowser} from './admin-live-browser.mjs';
const base=process.env.SCORM_TEST_URL;
if(!base||!process.env.SCORM_TEST_SUPABASE_URL?.startsWith('http://127.0.0.1:'))throw Error('local_fixture_required');
let checks=0;
await adminLiveBrowser({base,credentials:{admin:{email:'admin@scorm.test',password:'Local-test-password-123!'},teacher:{email:'teacher-b@scorm.test',password:'Local-test-password-123!'}},mark:()=>checks++});
console.log(JSON.stringify({scope:'LOCAL_FIXTURE_LAUNCHER_ONLY',status:'PASS',checks}));
