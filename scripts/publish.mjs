// Operator-run release. Credentials must be injected through the environment.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const run=(command,args,options={})=>execFileSync(command,args,{cwd:root,stdio:'inherit',...options});
const output=(command,args)=>run(command,args,{stdio:['ignore','pipe','pipe'],encoding:'utf8'}).trim();
const repo='siminyou-agent/nyc-family-activities';
assert.equal(output('git',['branch','--show-current']),'main','Publish from main');
assert.equal(output('git',['status','--porcelain']),'','Commit reviewed changes before publishing');
assert.match(output('git',['remote','get-url','origin']),/^https:\/\/github\.com\/siminyou-agent\/nyc-family-activities(?:\.git)?$/,'Unexpected remote');
const commit=output('git',['rev-parse','HEAD']);
assert.equal(output('git',['ls-remote','origin','refs/heads/main']).split(/\s/)[0],commit,'Push this commit before publishing');
let workflow;
for(let attempt=0;attempt<12;attempt++){
  const runs=JSON.parse(output('gh',['run','list','--repo',repo,'--workflow','check.yml','--commit',commit,'--event','push','--json','databaseId,headSha,status,conclusion','--limit','1']));
  if(runs.length){workflow=runs[0];break;}
  await new Promise(r=>setTimeout(r,5000));
}
assert(workflow,'No CI run for this commit');
if(workflow.status!=='completed')run('gh',['run','watch',String(workflow.databaseId),'--repo',repo,'--exit-status','--interval','10']);
else assert.equal(workflow.conclusion,'success','CI must pass before production deployment');
for(const args of [['run','check:public'],['run','validate'],['run','export','--','--check'],['test'],['run','build']])run('npm',args);
const manifest=JSON.parse(await readFile(new URL('dist/data/release.json',root),'utf8'));
assert.equal(manifest.commit,commit);assert.equal(manifest.dirty,false);
run('npx',['--yes','wrangler@4.152.0','pages','deploy','dist','--project-name','nyc-family-weekend','--branch','main','--commit-hash',commit,'--commit-dirty=false']);
const bases=(process.env.VERIFY_BASES||'https://nyc-family-weekend.pages.dev').split(',').map(s=>s.replace(/\/$/,''));
for(const base of bases){
  for(const path of ['', '?lang=en&region=nassau']){
    const response=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(45000)});assert.equal(response.status,200);
    assert((await response.text()).includes(`https://github.com/${repo}`),'Missing open-source link');
  }
  const release=await fetch(base+'/data/release.json',{signal:AbortSignal.timeout(45000)});assert.equal(release.status,200);
  assert.deepEqual(await release.json(),manifest,'Live release manifest differs from this commit');
  const agentGuide=await readFile(new URL('public/llms.txt',root),'utf8');
  for(const name of ['llms.txt','llm.txt']){
    const response=await fetch(base+'/'+name,{redirect:'manual',signal:AbortSignal.timeout(45000)});assert.equal(response.status,200);
    assert.match(response.headers.get('content-type')||'',/^text\/plain\b/,'Agent guide must be plain text');
    assert.equal(await response.text(),agentGuide,`Live agent guide mismatch: ${name}`);
  }
  for(const [name,hash] of Object.entries(manifest.sha256)){
    const response=await fetch(base+'/data/'+name,{signal:AbortSignal.timeout(45000)});assert.equal(response.status,200);
    assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),hash,`Live data mismatch: ${name}`);
  }
  run('npm',['run','test:browser'],{env:{...process.env,PREVIEW_URL:base}});
}
console.log(`Published and verified clean commit ${commit} at ${bases.length} origin(s).`);
