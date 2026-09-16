(function(root){
  const text=value=>typeof value==='string'&&value.trim()?value.replace(/\s+/g,' ').trim():value!=null&&typeof value==='number'?String(value):'Unknown';
  const number=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))?Number(value):null;
  const bytes=value=>{const n=number(value);return n==null?'Unknown':n>=1024**4?`${(n/1024**4).toFixed(2)} TiB`:`${(n/1024**3).toFixed(1)} GiB`;};
  const percent=value=>number(value)==null?'Unknown':`${number(value)}%`;
  const duration=value=>{const n=number(value);if(n==null||n<0)return 'Unknown';if(n<60)return `${Math.floor(n)} sec`;const d=Math.floor(n/86400),h=Math.floor(n%86400/3600),m=Math.floor(n%3600/60);return d?`${d} ${d===1?'day':'days'} ${h} ${h===1?'hour':'hours'}`:h?`${h} ${h===1?'hour':'hours'} ${m} min`:`${Math.floor(n/60)} min`;};
  const timestamp=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString():'Unknown';
  const age=(value,now=Date.now())=>{const stamp=value?Date.parse(value):NaN;if(!Number.isFinite(stamp))return 'Unknown';if(stamp>now)return 'Clock ahead';const seconds=(now-stamp)/1000;return seconds<60?'Just now':`${duration(seconds)} ago`;};
  const cpuSummary=d=>`${d.processor_count??'Unknown'} ${d.processor_count===1?'processor':'processors'} · ${d.core_count??'Unknown'} cores · ${d.logical_processor_count??'Unknown'} logical processors`;
  const jobName=type=>({inventory_refresh:'Hardware Inventory Refresh',windows_update_scan:'Windows Update Scan',software_inventory_refresh:'Software Inventory Refresh'})[type]||text(type);
  const jobStatus=status=>({queued:'Queued',claimed:'Claimed · awaiting start',started:'In progress',completed:'Completed',failed:'Failed'})[status]||'Unknown';
  function updateKind(update){
    const ids=update.category_ids||[],categories=(update.categories||[]).join(' ').toLowerCase();
    if(/firmware/.test(categories))return 'Firmware';
    if(ids.some(id=>id.toLowerCase()==='ebfc1fc5-71a4-4f7b-9aca-3b9a503104a0')||/\bdrivers?\b/.test(categories))return 'Driver';
    if(ids.some(id=>id.toLowerCase()==='0fa1201d-4330-4fa8-8ae9-b877473b6441')||/\bsecurity\b/.test(categories))return 'Security';
    return /updates|rollup/.test(categories)?'Software / quality':'Unclassified';
  }
  // Exact firmware identifiers documented in docs/RMM-UI-POLISH.md; never infer from a part number.
  const memoryVendorIds={'802C':'Micron','2C00':'Micron','80AD':'SK hynix','AD00':'SK hynix','80CE':'Samsung','CE00':'Samsung','8551':'Qimonda','5105':'Qimonda'};
  function memoryManufacturer(value){
    if(typeof value!=='string'||!value.trim())return 'Unknown';
    const match=/^(?:0x)?([0-9a-f]{4})$/i.exec(value.trim());
    return match&&memoryVendorIds[match[1].toUpperCase()]||value;
  }
  const knownDetails=values=>values.filter(value=>typeof value==='string'&&value.trim()&&value.trim().toLowerCase()!=='unknown').map(text).join(' · ')||'Unknown';
  const api={memoryManufacturer,knownDetails,text,number,bytes,percent,duration,timestamp,age,cpuSummary,jobName,jobStatus,updateKind};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RMMUI=api;
})(typeof window==='object'?window:globalThis);
