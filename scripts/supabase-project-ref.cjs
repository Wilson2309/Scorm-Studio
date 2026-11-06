/* eslint-disable @typescript-eslint/no-require-imports */
// Prints a public project identifier, never the URL or key.
function projectRef(value) {
  const url = new URL(value || '');
  const match = /^([a-z]{20})\.supabase\.co$/.exec(url.hostname);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname) || !match) {
    throw new Error('Use the project ref from the Supabase dashboard for a custom domain.');
  }
  return match[1];
}
if (require.main === module) {
  require('@next/env').loadEnvConfig(process.cwd(), true, {info(){}, error(){}});
  try { console.log(projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL)); }
  catch { console.error('Cannot derive a project ref. Check the local Supabase URL or use the dashboard ref.'); process.exitCode = 1; }
}
module.exports = {projectRef};
