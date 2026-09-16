// Shared deterministic presentation rules; no network calls or retained metric history.
(function(root) {
  const thresholds = Object.freeze({cpuPercent:90,memoryPercent:90,diskPercent:90,diskFreeBytes:10*1024**3,uptimeSeconds:30*86400,freshnessMs:15*60*1000});
  const number = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) ? Number(value) : null;
  const percent = value => number(value) == null ? 'Unknown' : `${number(value)}%`;
  const bytes = value => number(value) == null ? 'Unknown' : `${(number(value)/1024**3).toFixed(1)} GiB`;
  const used = (total,free) => number(total)==null || number(free)==null || number(free)>number(total) ? null : number(total)-number(free);
  const uptime = value => number(value)==null ? 'Unknown' : `${Math.floor(number(value)/86400)}d ${Math.floor(number(value)%86400/3600)}h`;
  const currentValue = (device,key) => Array.isArray(device.health_sample_fields) && !device.health_sample_fields.includes(key) ? null : device[key];
  function evaluate(device, now=Date.now()) {
    const stamp=Date.parse(device.health_snapshot_at);
    const ageMs=Number.isFinite(stamp)?now-stamp:null;
    const freshness=ageMs==null || ageMs<0?'unknown':ageMs>thresholds.freshnessMs?'stale':'current';
    const value=key=>number(currentValue(device,key));
    const cpu=value('cpu_utilization_percent'), memory=value('memory_utilization_percent');
    const disk=value('system_drive_utilization_percent'), free=value('system_drive_free_bytes'), seconds=value('uptime_seconds');
    const flags={
      cpu:cpu==null?null:cpu>=thresholds.cpuPercent,
      memory:memory==null?null:memory>=thresholds.memoryPercent,
      disk:disk!=null && disk>=thresholds.diskPercent || free!=null && free<thresholds.diskFreeBytes ? true : disk==null || free==null ? null : false,
      uptime:seconds==null?null:seconds>=thresholds.uptimeSeconds,
    };
    const warnings=[];
    if(flags.cpu) warnings.push(`CPU ${percent(cpu)}`);
    if(flags.memory) warnings.push(`Memory ${percent(memory)}`);
    if(disk!=null && disk>=thresholds.diskPercent) warnings.push(`Disk ${percent(disk)} used`);
    if(free!=null && free<thresholds.diskFreeBytes) warnings.push(`Disk ${bytes(free)} free (below ${bytes(thresholds.diskFreeBytes)})`);
    if(flags.uptime) warnings.push(`Uptime ${Math.floor(seconds/86400)}d`);
    const unknown=Object.keys(flags).filter(key=>flags[key]===null);
    const state=freshness==='stale'?'stale':freshness==='unknown'?'unknown':warnings.length?'warning':unknown.length?'unknown':'healthy';
    const label=state==='stale'?'Health stale':state==='healthy'?'Healthy / current':state==='warning'?'Warning / current':freshness==='current'?'Health unknown / current':ageMs!=null && ageMs<0?'Health unknown / clock ahead':'Health unknown / never reported';
    return {state,label,freshness,ageMs,flags,warnings,unknown};
  }
  const api={thresholds,evaluate,currentValue,number,percent,bytes,used,uptime};
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.RMMHealth=api;
})(typeof window==='object'?window:globalThis);
