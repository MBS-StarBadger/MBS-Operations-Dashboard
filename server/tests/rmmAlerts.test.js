const alerts=require('../public/rmmAlerts');
const now=Date.parse('2026-09-16T12:00:00Z'),iso=age=>new Date(now-age).toISOString();
const base={id:1,hostname:'LT226',asset_tag:'MBS-226',status:'online',health_snapshot_at:iso(0),cpu_utilization_percent:5,memory_utilization_percent:40,system_drive_utilization_percent:20,system_drive_free_bytes:100*1024**3,uptime_seconds:100,update_refreshed_at:iso(0),software_refreshed_at:iso(0),update_pending_count:0,update_security_count:0};
const derive=(patch={})=>alerts.derive([{...base,...patch}],now);
const find=(patch,key)=>derive(patch).alerts.find(a=>a.id===`1:${key}`);
test('healthy current endpoints stay quiet',()=>{expect(derive().total).toBe(0);expect(derive().byDevice[1].healthState).toBe('healthy');});
test.each([
 [{system_drive_utilization_percent:90},'disk','critical'],
 [{system_drive_utilization_percent:80},'disk','attention'],
 [{system_drive_utilization_percent:98},'disk','critical'],
 [{system_drive_free_bytes:0},'disk','critical'],
 [{system_drive_free_bytes:9*1024**3},'disk','critical'],
 [{memory_utilization_percent:90},'memory','attention'],
 [{cpu_utilization_percent:90},'cpu','attention'],
 [{uptime_seconds:30*86400},'uptime','attention']
])('hardware uses shared evaluator: %j',(patch,key,severity)=>expect(find(patch,`hardware:${key}`).severity).toBe(severity));
test.each([null,iso(16*60000),iso(-1000)])('unusable health at %s does not create hardware failures',health_snapshot_at=>{
 const result=derive({health_snapshot_at,cpu_utilization_percent:99,system_drive_utilization_percent:99});
 expect(result.alerts.some(a=>a.id.includes(':hardware:'))).toBe(false);expect(result.byDevice[1].highestSeverity).toBe('info');
});
test('partial sample coverage never claims healthy',()=>{
 const result=derive({health_sample_fields:[]});expect(result.alerts[0].title).toBe('Health telemetry unknown');
});
test('health staleness boundary',()=>{expect(find({health_snapshot_at:iso(15*60000)},'health:stale')).toBeUndefined();expect(find({health_snapshot_at:iso(15*60000+1)},'health:stale')).toBeDefined();});
test.each([
 [{update_pending_count:2},'update:pending','info'],[{update_security_count:1},'update:security','attention'],
 [{update_reboot_required:true},'update:reboot','attention'],[{pending_updates:[{reboot_may_be_required:true}]},'update:may-reboot','info'],
 [{update_scan_status:'failed'},'update:failed','attention'],[{update_scan_status:'unavailable'},'update:failed','attention'],
 [{update_refreshed_at:iso(9*86400000)},'update:stale','info'],[{update_refreshed_at:null},'update:never','info'],
 [{software_refreshed_at:iso(9*86400000)},'software:stale','info'],[{software_refreshed_at:null},'software:never','info'],
 [{software_status:'failed'},'software:failed','attention'],[{status:'offline'},'connectivity:offline','info']
])('non-hardware source %j',(patch,key,severity)=>expect(find(patch,key).severity).toBe(severity));
test('may require reboot does not imply machine requires reboot',()=>{expect(find({pending_updates:[{reboot_may_be_required:true}]},'update:reboot')).toBeUndefined();});
test('stale pending values are last reported; future snapshot cannot assert pending state',()=>{
 expect(find({update_refreshed_at:iso(9*86400000),update_pending_count:2},'update:pending').detail).toContain('Last reported');
 expect(find({update_refreshed_at:iso(-1000),update_pending_count:2},'update:pending')).toBeUndefined();
});
test.each(['update','software'])('eight day scan boundary %s',prefix=>{
 expect(find({[`${prefix}_refreshed_at`]:iso(8*86400000)},`${prefix}:stale`)).toBeUndefined();
 expect(find({[`${prefix}_refreshed_at`]:iso(8*86400000+1)},`${prefix}:stale`)).toBeDefined();
});
test.each([[86400000,true],[86400001,false],[-1,false]])('failed job age %s', (age,expected)=>{
 expect(Boolean(find({alert_jobs:[{id:7,status:'failed',completed_at:iso(age)}]},'job:7'))).toBe(expected);
});
test.each([['claimed',3600001,true],['started',3600001,true],['started',3600000,false],['queued',7200000,false],['completed',7200000,false]])('stuck %s age %s',(status,age,expected)=>{
 expect(Boolean(find({alert_jobs:[{id:7,status,claimed_at:iso(age),started_at:status==='started'?iso(age):null}]},'job:7'))).toBe(expected);
});
test('counts deduplicate job objects, sort severity/newest and report highest per endpoint',()=>{
 const job={id:7,status:'failed',completed_at:iso(5000)};
 const result=derive({system_drive_utilization_percent:95,memory_utilization_percent:94,update_pending_count:2,alert_jobs:[job,job]});
 expect(result.counts).toEqual({critical:1,attention:2,info:1});expect(result.total).toBe(4);expect(result.byDevice[1].highestSeverity).toBe('critical');
 expect(result.alerts.map(a=>a.severity)).toEqual(['critical','attention','attention','info']);
 expect(result.alerts[1].id).toBe('1:hardware:memory');
});
test.each(['critical','attention','info','offline','updates','hardware','stale','all'])('filter %s and hostname/asset search',(kind)=>{
 const devices=[{...base,status:'offline',system_drive_utilization_percent:95,update_pending_count:2,software_status:'failed',software_refreshed_at:iso(9*86400000)},{...base,id:2,hostname:'OTHER',asset_tag:'MBS-OTHER'}];
 const result=alerts.derive(devices,now),filtered=alerts.filter(result,devices,kind,'mbs-226');
 expect(filtered.devices.map(d=>d.id)).toEqual([1]);expect(filtered.alerts.length).toBeGreaterThan(0);
 expect(alerts.filter(result,devices,kind,'absent').devices).toEqual([]);
});
test('endpoints needing attention precede healthy ones',()=>{
 const devices=[base,{...base,id:2,system_drive_utilization_percent:95}];expect(alerts.filter(alerts.derive(devices,now),devices).devices.map(d=>d.id)).toEqual([2,1]);
});
