(function(root){
  const health=typeof module==='object'&&module.exports?require('./rmmHealth'):root.RMMHealth;
  const windows=Object.freeze({scanMs:8*86400000,failedJobMs:86400000,stuckJobMs:3600000});
  const rank={critical:0,attention:1,info:2};
  const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
  function derive(devices,now=Date.now()){
    const byDevice={},unique=new Map();
    for(const d of devices){
      const h=health.evaluate(d,now),alerts=[];
      const add=(key,severity,category,title,detail,at,compact=title)=>{
        const id=`${d.id}:${key}`;
        if(unique.has(id))return;
        const alert={id,deviceId:d.id,hostname:d.hostname,assetTag:d.asset_tag,severity,category,title,detail,at:stamp(at),compact};
        unique.set(id,alert);alerts.push(alert);
      };
      h.alerts.forEach(a=>add(`hardware:${a.key}`,a.severity,'hardware',a.title,a.detail,d.health_snapshot_at,a.compact));
      if(h.freshness==='stale')add('health:stale','info','stale','Health telemetry stale','Last reported hardware values are not current.',d.health_snapshot_at);
      if(h.state==='unknown')add('health:unknown','info','hardware','Health telemetry unknown','No usable current health snapshot.',d.health_snapshot_at);
      for(const [prefix,label,status] of [['update','Windows Update',d.update_scan_status],['software','Software inventory',d.software_status]]){
        const refreshed=stamp(d[`${prefix}_refreshed_at`]),category=prefix==='update'?'updates':'software';
        if(refreshed==null)add(`${prefix}:never`,'info',category,`${label} never scanned`,'No successful snapshot available.',d[`${prefix}_attempted_at`]);
        else if(refreshed>now)add(`${prefix}:unknown`,'info',category,`${label} timestamp ahead`,'Snapshot freshness is unknown.',d[`${prefix}_refreshed_at`]);
        else if(now-refreshed>windows.scanMs)add(`${prefix}:stale`,'info','stale',`${label} stale`,'Last successful scan is older than 8 days.',d[`${prefix}_refreshed_at`]);
        if(['failed','unavailable'].includes(status))add(`${prefix}:failed`,'attention',category,`${label} latest scan ${status}`,'Previous successful snapshot, if any, is retained.',d[`${prefix}_attempted_at`]);
      }
      const updateAt=stamp(d.update_refreshed_at),updateCurrent=updateAt!=null&&updateAt<=now&&now-updateAt<=windows.scanMs;
      // Pending state is still useful when stale, but never label it as current.
      const reported=updateCurrent?'':'Last reported: ';
      if(updateAt!=null&&updateAt<=now){
        if(health.number(d.update_pending_count)>0)add('update:pending','info','updates','Pending Windows Updates',`${reported}${d.update_pending_count} pending updates`,d.update_refreshed_at,`${d.update_pending_count} updates`);
        if(health.number(d.update_security_count)>0)add('update:security','attention','updates','Pending security updates',`${reported}${d.update_security_count} security updates (included in pending total)`,d.update_refreshed_at);
        if(d.update_reboot_required===true)add('update:reboot','attention','updates','Machine requires reboot',`${reported}Windows reports a required reboot.`,d.update_refreshed_at);
        if((d.pending_updates||[]).some(u=>u.reboot_may_be_required===true))add('update:may-reboot','info','updates','Update may require reboot',`${reported}A pending update may require a reboot if installed; this is not a current reboot requirement.`,d.update_refreshed_at);
      }
      if(d.status==='offline')add('connectivity:offline','info','offline','Endpoint offline','Connectivity state; not a hardware failure.',d.last_seen,'Offline');
      for(const j of d.alert_jobs||[]){
        const completed=stamp(j.completed_at),active=stamp(j.started_at)||stamp(j.claimed_at);
        if(j.status==='failed'&&completed!=null&&completed<=now&&now-completed<=windows.failedJobMs)add(`job:${j.id}`,'attention','jobs','Recent RMM job failed',`${j.job_type} · job #${j.id}`,j.completed_at);
        if(['claimed','started'].includes(j.status)&&active!=null&&active<=now&&now-active>windows.stuckJobMs)add(`job:${j.id}`,'attention','jobs','RMM job may be stuck',`${j.job_type} · ${j.status} for over 1 hour · job #${j.id}`,j.started_at||j.claimed_at);
      }
      alerts.sort(compare);
      byDevice[d.id]={alerts,highestSeverity:alerts[0]?.severity||null,healthState:h.state,offline:d.status==='offline'};
    }
    const alerts=[...unique.values()].sort(compare),counts={critical:0,attention:0,info:0};
    alerts.forEach(a=>counts[a.severity]++);
    return {alerts,counts,byDevice,total:alerts.length};
  }
  function compare(a,b){return rank[a.severity]-rank[b.severity]||(b.at??0)-(a.at??0)||a.id.localeCompare(b.id);}
  function matches(alert,filter){return filter==='all'||alert.severity===filter||alert.category===filter||(filter==='updates'&&alert.id.includes(':update:'));}
  function filter(data,devices,kind='all',query=''){
    const q=query.trim().toLowerCase(),found=devices.filter(d=>`${d.hostname||''} ${d.asset_tag||''}`.toLowerCase().includes(q));
    const ids=new Set(found.map(d=>String(d.id)));
    const alerts=data.alerts.filter(a=>ids.has(String(a.deviceId))&&matches(a,kind));
    const eligible=new Set(alerts.map(a=>String(a.deviceId)));
    return {alerts,devices:found.filter(d=>kind==='all'||eligible.has(String(d.id))).sort((a,b)=>{
      const aa=data.byDevice[a.id]?.alerts[0],bb=data.byDevice[b.id]?.alerts[0];
      return aa&&bb?compare(aa,bb):aa?-1:bb?1:String(a.hostname).localeCompare(String(b.hostname));
    })};
  }
  const api={derive,filter,windows};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RMMAlerts=api;
})(typeof window==='object'?window:globalThis);
