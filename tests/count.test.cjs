const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {scan,saveReport}=require('../electron/count.cjs');

test('count tool groups numbered files and saves reports in the selected language',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'count-'));
 try{
  for(const name of ['001.pdf','003.pdf','case_2.txt','case_4.docx','notes.txt'])fs.writeFileSync(path.join(root,name),'x');
  const result=scan(root),numbers=result.groups.find(g=>g.label==='Number only'),caseFiles=result.groups.find(g=>g.label==='case_');
  assert.equal(result.groups.length,2);assert.deepEqual(numbers.missing,['002']);assert.equal(numbers.missingCount,'1');assert.deepEqual(caseFiles.missing,['3']);
  const report=saveReport(root,'VI');assert.match(fs.readFileSync(report,'utf8'),/BÁO CÁO KIỂM TRA SỐ/);assert.match(fs.readFileSync(report,'utf8'),/002/);
  assert.equal(scan(root).groups.length,2);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
