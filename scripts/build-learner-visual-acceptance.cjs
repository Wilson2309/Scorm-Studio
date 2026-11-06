/* eslint-disable @typescript-eslint/no-require-imports */
// Repackage saved teacher-edited questions. No extraction, inference or remote writes.
require('../tests/register.cjs');
const fs=require('node:fs'),{unzipSync,strFromU8}=require('fflate'),{createHash}=require('node:crypto');
const {packageSCORM}=require('../src/lib/scorm/package.ts'),{validateSCORMArtifact}=require('../src/lib/content/scorm-artifact.ts');
const root='artifacts/scorm-learner-refinement',q=JSON.parse(fs.readFileSync(root+'/before/quiz.json','utf8'));
const zip=packageSCORM(q),files=unzipSync(zip),before=unzipSync(fs.readFileSync(root+'/before/package.zip'));
const payload=html=>JSON.parse(html.match(/id="quiz-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const assert=require('node:assert/strict');assert.deepEqual(files['runtime.js'],before['runtime.js']);assert.deepEqual(files['imsmanifest.xml'],before['imsmanifest.xml']);
assert.deepEqual(payload(strFromU8(files['index.html'])),payload(strFromU8(before['index.html'])));
fs.mkdirSync(root+'/after',{recursive:true});for(const [name,bytes]of Object.entries(files))fs.writeFileSync(root+'/after/'+name,bytes);
fs.writeFileSync(root+'/after/preview.html',validateSCORMArtifact(zip,q).html);
fs.writeFileSync(root+'/SCORM-Studio-Unidad-1-learner-refined.zip',zip);
const result={questions:q.questions.length,packageBytes:zip.length,paths:Object.keys(files),runtimeIdentical:true,payloadAndFingerprintIdentical:true,manifestIdentical:true,runtimeSHA256:createHash('sha256').update(files['runtime.js']).digest('hex'),zipSHA256:createHash('sha256').update(zip).digest('hex'),newInferenceCalls:0};
fs.writeFileSync(root+'/package-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
