/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit, real Auth/PostgREST checks. Credentials arrive on stdin, never in argv or files.
const {createServerClient} = require('@supabase/ssr');
const {projectRef} = require('./supabase-project-ref.cjs');

function permissionDenied(result) {
  // A missing schema, unique violation, server error or empty success is NOT proof of denied privileges.
  return [401, 403].includes(result.status) && result.error?.code === '42501';
}
function ownRows(result, id) {
  return !result.error && Array.isArray(result.data) && result.data.length === 1 && result.data[0].id === id && result.data[0].role === 'TEACHER';
}
function noRows(result) { return !result.error && Array.isArray(result.data) && result.data.length === 0; }

async function checkLive(config, credentials) {
  projectRef(config.url);
  if (!config.key || config.key.startsWith('sb_secret_')) throw new Error('public_config_required');
  if (config.key.split('.').length === 3) {
    const claims = JSON.parse(Buffer.from(config.key.split('.')[1], 'base64url').toString());
    if (claims.role !== 'anon') throw new Error('public_config_required');
  }
  const {a, b} = credentials;
  if (!a?.email || !a.password || !b?.email || !b.password || a.email.trim().toLowerCase() === b.email.trim().toLowerCase()) throw new Error('two_distinct_test_accounts_required');
  const results = [], clients = [];
  const record = (test, pass, result) => {
    const row = {test, status: pass ? 'PASS' : 'FAIL'};
    if (result && Number.isInteger(result.status)) row.httpStatus = result.status;
    if (result?.error?.code && /^[a-zA-Z0-9_]{1,40}$/.test(result.error.code)) row.code = result.error.code;
    results.push(row);
    return pass;
  };
  function makeClient(jar = [], ownsSession = false) {
    const cookies = [...jar];
    const client = createServerClient(config.url, config.key, {
      cookies: {
        getAll: () => cookies,
        setAll: updates => { for (const update of updates) { const at = cookies.findIndex(c => c.name === update.name); if (at >= 0) cookies.splice(at, 1); if (update.value) cookies.push(update); } },
      },
      auth: {autoRefreshToken: false},
      global: {fetch: (input, init) => fetch(input, {...init, signal: AbortSignal.timeout(15000)})},
    });
    if (ownsSession) clients.push(client);
    return {client, cookies};
  }
  try {
    const accounts = [];
    for (const [name, credential] of [['A', a], ['B', b]]) {
      const state = makeClient([], true);
      const login = await state.client.auth.signInWithPassword({email: credential.email, password: credential.password});
      if (!record(`${name}: real login`, !login.error && !!login.data.user, login)) return results;
      const user = login.data.user;
      if (!record(`${name}: email confirmed in Auth`, !!user.email_confirmed_at)) return results;
      const profile = await state.client.from('profiles').select('id,full_name,role');
      if (!record(`${name}: only own TEACHER profile visible`, ownRows(profile, user.id), profile)) return results;
      const restored = makeClient(state.cookies);
      const identity = await restored.client.auth.getUser();
      record(`${name}: SDK SSR session restored from cookies`, !identity.error && identity.data.user?.id === user.id, identity);
      accounts.push({...state, user, profile: profile.data[0]});
    }
    const [first, second] = accounts;
    if (!record('two different real identities', first.user.id !== second.user.id)) return results;
    for (const [name, owner, other] of [['A', first, second], ['B', second, first]]) {
      const read = await owner.client.from('profiles').select('id').eq('id', other.user.id);
      record(`${name}: foreign profile hidden by RLS`, noRows(read), read);
      const write = await owner.client.from('profiles').update({full_name: other.profile.full_name}).eq('id', other.user.id).select('id');
      record(`${name}: foreign profile cannot be updated`, noRows(write), write);
      const own = await owner.client.from('profiles').update({full_name: owner.profile.full_name}).eq('id', owner.user.id).select('id');
      record(`${name}: own full_name update allowed`, !own.error && own.data?.length === 1 && own.data[0].id === owner.user.id, own);
      const role = await owner.client.from('profiles').update({role: 'ADMIN'}).eq('id', owner.user.id).select('id,role');
      if (!record(`${name}: direct API ADMIN escalation denied`, permissionDenied(role), role)) {
        // A security regression must not leave a test account promoted.
        if (!role.error) {
          const restore = await owner.client.from('profiles').update({role: 'TEACHER'}).eq('id', owner.user.id);
          record(`${name}: emergency test-role restoration`, !restore.error, restore);
        }
        return results;
      }
      const id = await owner.client.from('profiles').update({id: owner.user.id}).eq('id', owner.user.id);
      record(`${name}: direct API id update denied`, permissionDenied(id), id);
      // The existing PK and a nonexistent delete target prevent destructive effects if grants regress.
      const insert = await owner.client.from('profiles').insert({id: owner.user.id, full_name: owner.profile.full_name, role: 'ADMIN'});
      record(`${name}: direct API profile insert denied`, permissionDenied(insert), insert);
      const remove = await owner.client.from('profiles').delete().eq('id', '00000000-0000-0000-0000-000000000000');
      record(`${name}: direct API profile delete privilege denied`, permissionDenied(remove), remove);
      const after = await owner.client.from('profiles').select('id,full_name,role');
      record(`${name}: profile still TEACHER after attacks`, ownRows(after, owner.user.id), after);
    }
    const anonymous = makeClient();
    const read = await anonymous.client.from('profiles').select('id');
    record('anonymous direct API access denied', permissionDenied(read), read);
    return results;
  } finally {
    // End only the sessions created by this run. JWTs already issued have normal Auth expiry semantics.
    for (const client of clients) {
      try {
        const session = await client.auth.getSession();
        if (session.data.session) {
          const logout = await client.auth.signOut({scope: 'local'});
          const after = await client.auth.getSession();
          record('test-session logout', !logout.error && !after.data.session, logout);
        }
      } catch { record('test-session logout', false); }
    }
  }
}

async function main() {
  if (!process.argv.includes('--run-live')) {
    console.log(JSON.stringify({status: 'NOT_EXECUTED', reason: 'Use the private PowerShell launcher after migration and email confirmation.'}));
    process.exitCode = 2;
    return;
  }
  require('@next/env').loadEnvConfig(process.cwd(), true, {info(){}, error(){}});
  let input = '';
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 8192) throw new Error('invalid_private_input'); }
  let credentials;
  try {
    credentials = JSON.parse(input); input = '';
    const results = await checkLive({url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}, credentials);
    const pass = results.length > 0 && results.every(row => row.status === 'PASS');
    console.log(JSON.stringify({transport: 'REAL_SUPABASE_AUTH_POSTGREST', scope: 'AUTH_API_RLS_ONLY', phaseAcceptance: 'NOT_DETERMINED_BY_THIS_SCRIPT', status: pass ? 'PASS' : 'FAIL', results,
      manualChecks: {registrationDelivery: 'NOT_VERIFIED_BY_THIS_SCRIPT', emailCallbackUI: 'NOT_VERIFIED_BY_THIS_SCRIPT', loginLogoutUI: 'NOT_VERIFIED_BY_THIS_SCRIPT', recoveryUI: 'NOT_VERIFIED_BY_THIS_SCRIPT', browserReload: 'NOT_VERIFIED_BY_THIS_SCRIPT', metadataRoleAttack: 'NOT_VERIFIED_BY_THIS_SCRIPT', adminAssignment: 'NOT_VERIFIED_BY_THIS_SCRIPT'}}, null, 2));
    if (!pass) process.exitCode = 1;
  } finally {
    input = ''; if (credentials) { credentials.a = null; credentials.b = null; }
  }
}
if (require.main === module) main().catch(() => { console.log(JSON.stringify({status: 'FAIL', error: 'controlled_live_check_error', details: 'Check local configuration, two confirmed test accounts and connectivity. No credentials were logged.'})); process.exitCode = 1; });
module.exports = {permissionDenied, ownRows, noRows, checkLive};
