(function(root){
  const rank={critical:0,attention:1,info:2};
  const categories={hardware:'Hardware',updates:'Updates',offline:'Offline/Connectivity',stale:'Stale/Monitoring',jobs:'Jobs'};
  const filters={all:'All alerts',critical:'Critical',attention:'Attention',info:'Info',...categories};
  // Each normalized alert belongs to exactly one presentation category.
  const category=a=>a.category==='software'?'stale':a.category;
  const matches=(a,kind)=>kind==='all'||a.severity===kind||category(a)===kind;
  function summary(alerts){
    const reasons=[...new Set(alerts.map(a=>(a.detail||'').startsWith('Last reported')?`Last reported: ${a.compact||a.title}`:a.compact||a.title))];
    return reasons.slice(0,3).join(' · ')+(reasons.length>3?` · +${reasons.length-3} more reasons`:'');
  }
  function aggregate(data,devices,kind='all',query=''){
    const counts={critical:0,attention:0,info:0},categoryCounts=Object.fromEntries(Object.keys(categories).map(k=>[k,0]));
    const groups=new Map(),seen=new Set();
    for(const a of data.alerts){
      if(seen.has(a.id))continue;
      seen.add(a.id);counts[a.severity]++;categoryCounts[category(a)]++;
      const key=String(a.deviceId);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(a);
    }
    const q=query.trim().toLowerCase(),rows=[],deviceIds=new Set();
    for(const device of devices){
      const id=String(device.id),alerts=groups.get(id);
      if(deviceIds.has(id)||!alerts)continue;
      deviceIds.add(id);
      if(!`${device.hostname||''} ${device.asset_tag||''}`.toLowerCase().includes(q)||!alerts.some(a=>matches(a,kind)))continue;
      const ordered=[...alerts].sort((a,b)=>rank[a.severity]-rank[b.severity]||(b.at||0)-(a.at||0)||a.id.localeCompare(b.id));
      rows.push({device,alerts:ordered,total:ordered.length,highestSeverity:ordered[0].severity,summary:summary(ordered)});
    }
    rows.sort((a,b)=>rank[a.highestSeverity]-rank[b.highestSeverity]||String(a.device.hostname).localeCompare(String(b.device.hostname))||String(a.device.id).localeCompare(String(b.device.id)));
    return {total:seen.size,affected:groups.size,counts,categoryCounts,rows};
  }
  const api={aggregate,categories,filters,summary};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RMMAlertOverview=api;
})(typeof window==='object'?window:globalThis);
