const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {scan,preview,run}=require('../electron/pdf.cjs');
test('scan, prefix parsing, numeric order and ignored PDFs',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-')); for(const n of ['1.pdf','20.pdf','200.PDF','12_118.pdf','SCC_2020_001.pdf','ABC_XYZ_001.PDF','notes.pdf'])fs.writeFileSync(path.join(root,n),'x');
 fs.mkdirSync(path.join(root,'nested'));fs.writeFileSync(path.join(root,'nested','2.pdf'),'x');
 const r=scan(root);assert.equal(r.ignoredPdfCount,1);assert.deepEqual(r.groups.map(g=>g.prefix),['','12_','ABC_XYZ_','SCC_2020_']);assert.deepEqual(r.groups[0].files.map(f=>f.number),['1','20','200']);fs.rmSync(root,{recursive:true,force:true});
});
test('preview maps gaps; run preserves sources and writes verified copies',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-'));for(const n of ['1.pdf','3.pdf'])fs.writeFileSync(path.join(root,n),n);
 const p=preview({rootPath:root,mode:'SINGLE',selectedPrefixes:[''],newName:'123'});assert.deepEqual(p.mapping.map(x=>x.targetFile),['123.pdf','125.pdf']);assert.deepEqual(p.missing,['124']);assert.equal(fs.readdirSync(root).length,2);
 const result=run({token:p.token});assert.equal(result.successes,2);assert.equal(fs.readFileSync(path.join(root,'1.pdf'),'utf8'),'1.pdf');assert.equal(fs.readFileSync(path.join(result.outputPath,'125.pdf'),'utf8'),'3.pdf');fs.rmSync(root,{recursive:true,force:true});
});
test('merge uses sorted group order and each full source span',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-'));for(const n of ['B_010.pdf','B_012.pdf','A_001.pdf','A_003.pdf'])fs.writeFileSync(path.join(root,n),n);
 const p=preview({rootPath:root,mode:'MERGE',selectedPrefixes:['B_','A_'],newName:'900'});
 assert.deepEqual(p.mapping.map(x=>[x.group,x.targetFile]),[['A_','900.pdf'],['A_','902.pdf'],['B_','903.pdf'],['B_','905.pdf']]);assert.deepEqual(p.missing,['901','904']);assert.equal(p.mergeDetails.length,2);
 const out=run({token:p.token});assert.equal(out.successes,4);assert.match(fs.readFileSync(out.reportPath,'utf8'),/Merged groups:/);fs.rmSync(root,{recursive:true,force:true});
});
test('invalid names and stale previews block all copies',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pdf-'));fs.writeFileSync(path.join(root,'A_001.pdf'),'a');
 assert.throws(()=>preview({rootPath:root,mode:'SINGLE',selectedPrefixes:['A_'],newName:'bad/name'}));
 const p=preview({rootPath:root,mode:'SINGLE',selectedPrefixes:['A_'],newName:'New'});fs.writeFileSync(path.join(root,'A_001.pdf'),'changed size');
 assert.throws(()=>run({token:p.token}),/changed|lúc preview|preview/i);assert.equal(fs.readdirSync(root).length,1);fs.rmSync(root,{recursive:true,force:true});
});
