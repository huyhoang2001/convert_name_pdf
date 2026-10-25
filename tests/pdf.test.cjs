const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Writable}=require('node:stream');
const {scan,preview,run}=require('../electron/pdf.cjs');
test('scan, prefix parsing, numeric order and ignored PDFs',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-')); for(const n of ['1.pdf','20.pdf','200.PDF','12_118.pdf','SCC_2020_001.pdf','ABC_XYZ_001.PDF','notes.pdf'])fs.writeFileSync(path.join(root,n),'x');
 fs.mkdirSync(path.join(root,'nested'));fs.writeFileSync(path.join(root,'nested','2.pdf'),'x');
 const r=scan(root);assert.equal(r.ignoredPdfCount,1);assert.deepEqual(r.groups.map(g=>g.prefix),['','12_','ABC_XYZ_','SCC_2020_']);assert.deepEqual(r.groups[0].files.map(f=>f.number),['1','20','200']);fs.rmSync(root,{recursive:true,force:true});
});
test('preview maps gaps; run preserves sources and writes verified copies',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-'));for(const n of ['1.pdf','3.pdf'])fs.writeFileSync(path.join(root,n),n);
 const p=preview({rootPath:root,mode:'SINGLE',selectedPrefixes:[''],newName:'123'});assert.deepEqual(p.mapping.map(x=>x.targetFile),['123.pdf','125.pdf']);assert.deepEqual(p.missing,['124']);assert.equal(fs.readdirSync(root).length,2);
 const result=await run({token:p.token});assert.equal(result.successes,2);assert.equal(fs.readFileSync(path.join(root,'1.pdf'),'utf8'),'1.pdf');assert.equal(fs.readFileSync(path.join(result.outputPath,'125.pdf'),'utf8'),'3.pdf');fs.rmSync(root,{recursive:true,force:true});
});
test('merge uses sorted group order and each full source span',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-'));for(const n of ['B_010.pdf','B_012.pdf','A_001.pdf','A_003.pdf'])fs.writeFileSync(path.join(root,n),n);
 const p=preview({rootPath:root,mode:'MERGE',selectedPrefixes:['B_','A_'],newName:'900'});
 assert.deepEqual(p.mapping.map(x=>[x.group,x.targetFile]),[['A_','900.pdf'],['A_','902.pdf'],['B_','903.pdf'],['B_','905.pdf']]);assert.deepEqual(p.missing,['901','904']);assert.equal(p.mergeDetails.length,2);
 const out=await run({token:p.token});assert.equal(out.successes,4);assert.match(fs.readFileSync(out.reportPath,'utf8'),/Merged groups:/);fs.rmSync(root,{recursive:true,force:true});
});
test('invalid names and stale previews block all copies',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-'));fs.writeFileSync(path.join(root,'A_001.pdf'),'a');
 assert.throws(()=>preview({rootPath:root,mode:'SINGLE',selectedPrefixes:['A_'],newName:'bad/name'}));
 const p=preview({rootPath:root,mode:'SINGLE',selectedPrefixes:['A_'],newName:'New'});fs.writeFileSync(path.join(root,'A_001.pdf'),'changed size');
 await assert.rejects(run({token:p.token}),/changed|preview/i);assert.equal(fs.readdirSync(root).length,1);fs.rmSync(root,{recursive:true,force:true});
});
test('backup failure stops output and leaves ordered error reporting',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-'));for(let n=1;n<=6;n++)fs.writeFileSync(path.join(root,`${n}.pdf`),String(n));
 const p=preview({rootPath:root,mode:'SINGLE',selectedPrefixes:[''],newName:'20'}), originalCreate=fs.createWriteStream;let backupOpens=0;
 fs.createWriteStream=(file,...args)=>{if(file.startsWith(p.backupPath)){backupOpens++;if(file.endsWith('1.pdf')){const failed=new Writable({write(_chunk,_encoding,callback){callback();}});process.nextTick(()=>failed.emit('error',Error('injected backup failure')));return failed;}}return originalCreate(file,...args);};
 try {const result=await run({token:p.token});assert.equal(result.successes,0);assert.match(result.errors[0],/Backup error/);assert.ok(backupOpens<=3);assert.deepEqual(fs.readdirSync(p.outputPath),[path.basename(result.reportPath)]);}
 finally {fs.createWriteStream=originalCreate;fs.rmSync(root,{recursive:true,force:true});}
});
test('output collisions preserve existing files and later copies continue in mapping order',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-'));for(const n of [1,2,3])fs.writeFileSync(path.join(root,`${n}.pdf`),String(n));
 const p=preview({rootPath:root,mode:'SINGLE',selectedPrefixes:[''],newName:'30'}), originalCreate=fs.createWriteStream, collision=path.join(p.outputPath,'030.pdf');
 fs.createWriteStream=(file,...args)=>{if(file===collision&&!fs.existsSync(file))fs.writeFileSync(file,'keep');return originalCreate(file,...args);};
 try {const result=await run({token:p.token});assert.equal(fs.readFileSync(collision,'utf8'),'keep');assert.equal(result.successes,2);assert.equal(result.errors.length,1);assert.deepEqual(fs.readdirSync(p.outputPath).filter(x=>x.endsWith('.pdf')),['030.pdf','031.pdf','032.pdf']);const report=fs.readFileSync(result.reportPath,'utf8');assert.ok(report.includes('3.pdf -> 032.pdf'));assert.ok(report.indexOf('Renamed files:')<report.indexOf('Errors:'));assert.ok(report.includes('1.pdf:'));}
 finally {fs.createWriteStream=originalCreate;fs.rmSync(root,{recursive:true,force:true});}
});
