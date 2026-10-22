const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const previews = new Map();
const MAX = 9223372036854775807n;
const invalid = /[\\/:*?"<>|]/;
const fmt = n => n >= 0n && n < 1000n ? n.toString().padStart(3, '0') : n.toString();
function rootDir(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw Error('Choose an absolute folder path.');
  const real = fs.realpathSync(value); if (!fs.statSync(real).isDirectory()) throw Error('The selected path is not a folder.'); return real;
}
function scan(value) {
  const rootPath = rootDir(value), groups = new Map(); let ignoredPdfCount = 0;
  for (const ent of fs.readdirSync(rootPath, {withFileTypes:true})) {
    if (!ent.isFile() || !ent.name.toLowerCase().endsWith('.pdf')) continue;
    const stem = ent.name.slice(0, -4); let prefix, raw;
    if (/^\d+$/.test(stem)) { prefix = ''; raw = stem; }
    else { const i = stem.lastIndexOf('_'); prefix = stem.slice(0, i + 1); raw = stem.slice(i + 1); if (i <= 0 || !/^\d+$/.test(raw)) { ignoredPdfCount++; continue; } }
    let number; try { number = BigInt(raw); } catch { ignoredPdfCount++; continue; }
    if (number > MAX) { ignoredPdfCount++; continue; }
    const stat = fs.statSync(path.join(rootPath, ent.name)); const files = groups.get(prefix) || [];
    files.push({fileName:ent.name, number, sourcePath:path.join(rootPath, ent.name), size:stat.size, mtime:stat.mtimeMs}); groups.set(prefix, files);
  }
  return {rootPath, ignoredPdfCount, groups:[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([prefix,files])=>{
    files.sort((a,b)=>a.number < b.number ? -1 : a.number > b.number ? 1 : a.fileName.localeCompare(b.fileName));
    return {prefix, min:files[0].number.toString(), max:files.at(-1).number.toString(), pdfCount:files.length, files:files.map(f=>({...f,number:f.number.toString()}))};
  })};
}
function makePreview(input) {
  const vi=input.language==='VI';
  const data = scan(input.rootPath); if (!['SINGLE','MERGE'].includes(input.mode) || !Array.isArray(input.selectedPrefixes) || !input.selectedPrefixes.length) throw Error('The selected groups are invalid.');
  const groups = data.groups.filter(g=>input.selectedPrefixes.includes(g.prefix));
  if (groups.length !== input.selectedPrefixes.length || (input.mode === 'SINGLE' && groups.length !== 1) || (input.mode === 'MERGE' && groups.length < 2)) throw Error('The selected groups are no longer available. Scan the folder again.');
  if (input.mode === 'MERGE') groups.sort((a,b)=>a.prefix.localeCompare(b.prefix));
  const availableFiles=groups.flatMap(g=>g.files.map(f=>f.fileName));
  const availableSet=new Set(availableFiles);
  const selectedFileNames=input.selectedFileNames===undefined?availableFiles:input.selectedFileNames;
  if(!Array.isArray(selectedFileNames)||!selectedFileNames.length||new Set(selectedFileNames).size!==selectedFileNames.length||selectedFileNames.some(n=>typeof n!=='string'||!availableSet.has(n))) throw Error('Select one or more valid PDF numbers.');
  const selectedFiles=new Set(selectedFileNames);
  let name = String(input.newName || '').trim(); if (/\.pdf$/i.test(name)) name=name.slice(0,-4);
  if (!name) throw Error('Enter a new filename.');
  let prefix, start;
  if (/^\d+$/.test(name)) { prefix=''; start=BigInt(name); }
  else if (/^(.+_)(\d+)$/.test(name)) { const m=name.match(/^(.+_)(\d+)$/); prefix=m[1]; start=BigInt(m[2]); }
  else { prefix=name.endsWith('_') ? name : name+'_'; start=1n; }
  if (start>MAX || invalid.test(prefix) || (prefix && /[ .]$/.test(prefix))) throw Error('The name contains invalid characters or the starting number is out of range.');
  let offset=0n; const mapping=[], missing=[], errors=[], mergeDetails=[]; let uniqueCount=0;
  const sourceMin=groups.reduce((v,g)=>v===null||BigInt(g.min)<v?BigInt(g.min):v,null), sourceMax=groups.reduce((v,g)=>v===null||BigInt(g.max)>v?BigInt(g.max):v,null);
  for (const g of groups) {
    const min=BigInt(g.min), max=BigInt(g.max), groupStart=start+offset, seen=new Set(), selectedNumbers=new Set();
    for (const f of g.files) { seen.add(f.number); if(selectedFiles.has(f.fileName)){if(selectedNumbers.has(f.number)) errors.push(`Duplicate number ${f.number} in group ${g.prefix}`); selectedNumbers.add(f.number);} } uniqueCount+=seen.size;
    for(let n=min;n<=max;n++) if(!seen.has(n.toString())) missing.push(prefix+fmt(groupStart+n-min));
    for(const f of g.files.filter(file=>selectedFiles.has(file.fileName))) { const targetNumber=groupStart+BigInt(f.number)-min; if(targetNumber>MAX) errors.push(`Target number exceeds the limit: ${f.fileName}`); const targetFile=prefix+fmt(targetNumber)+'.pdf';
      if(targetFile.length+data.rootPath.length+1>=260) errors.push(`Target path is too long: ${targetFile}`);
      mapping.push({sourceFile:f.fileName,sourcePath:f.sourcePath,sourceNumber:f.number,targetNumber:targetNumber.toString(),targetFile,size:f.size,mtime:f.mtime,group:g.prefix}); }
    if(input.mode==='MERGE'){const end=groupStart+(max-min+1n)-1n,delta=groupStart-min;mergeDetails.push(`${g.prefix||(vi?'[Chỉ số]':'[Number only]')} : ${fmt(min)}-${fmt(max)} -> ${prefix}${fmt(groupStart)}-${prefix}${fmt(end)} | ${delta>0n?`N+${delta}`:delta<0n?`N-${-delta}`:'N'}`);}
    offset+=max-min+1n;
  }
  const names=new Set(); for(const m of mapping) { if(names.has(m.targetFile)) errors.push(`Duplicate target name: ${m.targetFile}`); names.add(m.targetFile); }
  const date=new Date(), dateText=[date.getDate(),date.getMonth()+1,date.getFullYear()].map((n,i)=>i<2?String(n).padStart(2,'0'):String(n)).join('_');
  const destinations=input.destinations||{backup:path.join(data.rootPath,'Backup'),output:path.join(data.rootPath,'Output')};
  if(!path.isAbsolute(destinations.backup)||!path.isAbsolute(destinations.output)||path.resolve(destinations.backup).toLowerCase()===path.resolve(destinations.output).toLowerCase()) errors.push('Backup and Output must be different absolute folders.');
  let pair;
  for(let i=1;i<10000;i++){const n=String(i).padStart(2,'0'),backup=path.join(destinations.backup,`${n}_${dateText}`),output=path.join(destinations.output,`${n}_${dateText}`); if(!fs.existsSync(backup)&&!fs.existsSync(output)){pair={backup,output};break;}}
  if(!pair) errors.push('Could not find an available Backup/Output folder pair.');
  const token=crypto.randomUUID(); previews.set(token,{rootPath:data.rootPath,mode:input.mode,selectedPrefixes:input.selectedPrefixes,selectedFileNames,newName:input.newName,mapping,pair,destinations,language:input.language==='VI'?'VI':'EN'});
  const delta=start-(input.mode==='SINGLE'?BigInt(groups[0].min):sourceMin);
  return {token,rootPath:data.rootPath,groups,mode:input.mode,mapping,missing,errors,backupPath:pair?.backup,outputPath:pair?.output,sourceMin:sourceMin.toString(),sourceMax:sourceMax.toString(),uniqueCount,newPrefix:prefix,inputText:String(input.newName),originalPrefix:input.mode==='SINGLE'?(groups[0].prefix||(vi?'[Chỉ có số: 1.pdf, 2.pdf, ...]':'[Number only: 1.pdf, 2.pdf, ...]')):(vi?`GỘP CHUNG (${groups.length} nhóm)`:`MERGED (${groups.length} groups)`),deltaText:input.mode==='MERGE'?(vi?'Theo từng nhóm (N+K/N-K)':'Per group (N+K/N-K)'):delta>0n?`N+${delta}`:delta<0n?`N-${-delta}`:'N',mergeDetails};
}
function preview(input) { return makePreview(input); }
function run(input) {
  const saved=previews.get(input.token); if(!saved) throw Error('Preview expired. Build a new preview.'); previews.delete(input.token);
  const fresh=makePreview({...saved,rootPath:saved.rootPath}); previews.delete(fresh.token);
  if(JSON.stringify(saved.mapping.map(x=>[x.sourceFile,x.size,x.mtime,x.targetFile]))!==JSON.stringify(fresh.mapping.map(x=>[x.sourceFile,x.size,x.mtime,x.targetFile]))) throw Error('Files changed after preview. Scan the folder again.');
  if(saved.pair.backup!==fresh.backupPath||saved.pair.output!==fresh.outputPath) throw Error('A destination folder changed after preview. Build the preview again.');
  if(fresh.errors.length) throw Error(fresh.errors.join('\n'));
  const {backup,output}=saved.pair; fs.mkdirSync(path.dirname(backup),{recursive:true});fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(backup);fs.mkdirSync(output); const errors=[], successes=[];
  try {
    for(const m of saved.mapping){const dest=path.join(backup,m.sourceFile);fs.copyFileSync(m.sourcePath,dest,fs.constants.COPYFILE_EXCL);if(fs.statSync(dest).size!==m.size)throw Error(`Backup size verification failed: ${m.sourceFile}`);}
  } catch(e){errors.push(`Backup error: ${e.message}`);}
  if(!errors.length) for(const m of saved.mapping){const dest=path.join(output,m.targetFile);try{fs.copyFileSync(m.sourcePath,dest,fs.constants.COPYFILE_EXCL);if(fs.statSync(dest).size!==m.size)throw Error('Target size verification failed');successes.push(`${m.sourceFile} -> ${m.targetFile}`);}catch(e){try{fs.unlinkSync(dest);}catch{} errors.push(`${m.sourceFile}: ${e.message}`);}}
  const min=fresh.sourceMin,max=fresh.sourceMax,missingCount=fresh.missing.length;
  const vi=saved.language==='VI', label=(en,vn)=>vi?vn:en;
  const reportLines=[`${label('MIN source','Số nhỏ nhất')}: ${fmt(BigInt(min))}`,`${label('MAX source','Số lớn nhất')}: ${fmt(BigInt(max))}`,`${label('PDFs selected','PDF đã chọn')}: ${saved.mapping.length}`,`${label('Unique numbers','Số thứ tự hiện có')}: ${fresh.uniqueCount}`,`${label('Missing numbers','Số còn thiếu')}: ${missingCount}`,'',label('Missing sequence:','Các số còn thiếu:'),...(fresh.missing.length?fresh.missing:[label('None','Không có')]),'',label('Renamed files:','Tệp sau khi đổi tên:'),...(successes.length===1?[successes[0]]:successes.length>1?[successes[0],'...',successes.at(-1)]:[label('None','Không có')]),'',`${label('Original prefix','Tiền tố gốc')}: ${fresh.originalPrefix}`,`${label('New prefix','Tiền tố mới')}: ${fresh.newPrefix}`,`${label('Entered name','Tên đã nhập')}: ${fresh.inputText}`];
  if(fresh.mergeDetails.length)reportLines.push('',label('Merged groups:','Nhóm đã gộp:'),...fresh.mergeDetails);
  reportLines.push('',`Delta: ${fresh.deltaText}`,'',label('Errors:','Lỗi:'),...(errors.length?errors:[label('None','Không có')]));
  const report=path.join(output,label('Rename results.txt','Kết quả đổi tên.txt')); fs.writeFileSync(report,reportLines.join('\r\n'),'utf8');
  return {backupPath:backup,outputPath:output,reportPath:report,successes:successes.length,errors};
}
module.exports={scan,preview,run};
