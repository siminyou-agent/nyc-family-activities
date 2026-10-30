import {readFile} from 'node:fs/promises';
import {validate,validateSources} from './contract.mjs';
const file=process.argv[2] || new URL('../public/data/events.json',import.meta.url);
const data=JSON.parse(await readFile(file,'utf8'));
console.log('Valid edition:',{...validate(data),...validateSources(data,JSON.parse(await readFile(new URL('../public/data/sources.json',import.meta.url),'utf8')))});
