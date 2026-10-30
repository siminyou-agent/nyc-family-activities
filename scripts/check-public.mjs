import {execFileSync} from 'node:child_process';
import {readFile,lstat} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const problems=[];
const privatePatterns=[/\/Users\/[a-z0-9_-]+\//i,/\/home\/[a-z0-9_-]+\//i,/op:\/\//,/https?:\/\/[^\s/]+\.ts\.net/i,/simin\.you/i,/tailf[a-z0-9]+/i,/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,/\b(?:ghp_|github_pat_|sk-or-v1-)[A-Za-z0-9_-]{15,}/,/\b(?:account_id|zone_id)\s*["']?\s*:\s*["'][a-f0-9]{32}/i];
// Reviewed public organizer contact addresses present in official event excerpts.
const allowedEmails=new Set(['poplargarden'+'@gmail.com','sarah.bishow'+'@parks.nyc.gov','creativereaders'+'@optimum.net','cwaldron'+'@oceansidelibrary.com','youngadult'+'@srpl.org','child'+'@pwpl.org','ndeluca'+'@northbellmorelibrary.org']);
for(const file of files){
  if(/(?:^|\/)(?:\.local|raw|staging|node_modules|dist|test-results|\.wrangler|worker)(?:\/|$)|(?:^|\/)[^/]*\.env(?:\.|$)|\.(?:log|pem|key|p12|mobileprovision)$/.test(file))problems.push(`${file}: private artifact`);
  const stat=await lstat(new URL(file,root));if(stat.isSymbolicLink()){problems.push(`${file}: symlink`);continue;}
  const text=await readFile(new URL(file,root),'utf8');
  if(text.includes('\0')){problems.push(`${file}: unexpected binary content`);continue;}
  for(const pattern of privatePatterns)if(pattern.test(text))problems.push(`${file}: private identifier or credential pattern`);
  for(const email of text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[])if(!allowedEmails.has(email))problems.push(`${file}: unreviewed email address`);
}
if(problems.length)throw new Error(problems.join('\n'));
console.log(`Public-file scan passed: ${files.length} files; private artifacts, identifiers, credentials, email addresses, and symlinks checked. This complements manual review.`);
