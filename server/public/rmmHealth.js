// Shared deterministic presentation rules; no network calls or retained metric history.
(function(root) {
  const thresholds = Object.freeze({cpuPercent:90,memoryPercent:90,diskElevatedPercent:80,diskPercent:90,diskFullPercent:98,diskFullFreeBytes:0,diskFreeBytes:10*1024**3,uptimeSeconds:30*86400,freshnessMs:15*60*1000});
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
    const active=freshness==='current';
    const diskState=!active?'unknown':disk!=null && disk>=thresholds.diskFullPercent || free!=null && free<=thresholds.diskFullFreeBytes?'full':disk!=null && disk>=thresholds.diskPercent || free!=null && free<thresholds.diskFreeBytes?'critical':disk!=null && disk>=thresholds.diskElevatedPercent?'elevated':disk==null || free==null?'unknown':'normal';
    const flags={
      cpu:!active||cpu==null?null:cpu>=thresholds.cpuPercent,
      memory:!active||memory==null?null:memory>=thresholds.memoryPercent,
      disk:diskState==='unknown'?null:diskState!=='normal',
      uptime:!active||seconds==null?null:seconds>=thresholds.uptimeSeconds,
    };
    const alerts=[];
    const drive=currentValue(device,'system_drive')||'System drive';
    if(flags.disk) alerts.push({key:'disk',severity:diskState==='elevated'?'attention':'critical',
      title:diskState==='full'?'⛔ Drive Full':diskState==='critical'?'⚠ Storage Critical':'Storage Elevated',
      detail:`${drive} ${percent(disk)} used · ${bytes(free)} free`,compact:`Disk ${percent(disk)} · ${bytes(free)} free`});
    if(flags.memory) alerts.push({key:'memory',severity:'attention',title:'⚠ High Memory Usage',
      detail:`${percent(memory)} used · ${bytes(currentValue(device,'memory_available_bytes'))} available / ${bytes(currentValue(device,'total_memory_bytes'))} total`,compact:`Memory ${percent(memory)}`});
    if(flags.cpu) alerts.push({key:'cpu',severity:'attention',title:'High CPU utilization (current snapshot)',detail:percent(cpu),compact:`CPU ${percent(cpu)}`});
    if(flags.uptime) alerts.push({key:'uptime',severity:'attention',title:'Long Uptime',detail:`${Math.floor(seconds/86400)} days ${Math.floor(seconds%86400/3600)} hours`,compact:`Uptime ${Math.floor(seconds/86400)}d`});
    const warnings=alerts.map(alert=>alert.compact);
    const unknown=Object.keys(flags).filter(key=>flags[key]===null);
    const state=freshness==='stale'?'stale':freshness==='unknown'?'unknown':alerts.some(a=>a.severity==='critical')?'critical':alerts.length?'attention':unknown.length?'unknown':'healthy';
    const label=state==='stale'?'Health stale':state==='healthy'?'Healthy / current':state==='attention'?'Attention / current':state==='critical'?'Critical / current':freshness==='current'?'Health unknown / current':ageMs!=null && ageMs<0?'Health unknown / clock ahead':'Health unknown / never reported';
    // Connectivity is independent; an offline endpoint can retain a current hardware snapshot.
    const connectivity=device.health_status||device.status||'unknown';
    return {state,label,connectivity,freshness,ageMs,flags,diskState,alerts,warnings,unknown};
  }
  const api={thresholds,evaluate,currentValue,number,percent,bytes,used,uptime};
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.RMMHealth=api;
})(typeof window==='object'?window:globalThis);
