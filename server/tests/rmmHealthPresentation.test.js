const health=require('../public/rmmHealth');
const fs=require('fs'),path=require('path'),vm=require('vm');
const now=Date.parse('2026-09-16T12:00:00Z');
const good={health_snapshot_at:new Date(now).toISOString(),cpu_utilization_percent:10,memory_utilization_percent:20,
 system_drive_utilization_percent:40,system_drive_free_bytes:10*1024**3,uptime_seconds:100};
test('freshness distinguishes current at 15 minutes, stale beyond, never reported, incomplete and offline health',()=>{
 expect(health.evaluate(good,now).state).toBe('healthy');
 expect(health.evaluate(good,now+900000).freshness).toBe('current');
 expect(health.evaluate(good,now+900001).state).toBe('stale');
 expect(health.evaluate({...good,health_snapshot_at:null},now).state).toBe('unknown');
 expect(health.evaluate({...good,cpu_utilization_percent:null},now)).toMatchObject({state:'unknown',freshness:'current',unknown:['cpu']});
 expect(health.evaluate({...good,status:'offline'},now).state).toBe('healthy');
 expect(health.evaluate(good,now-1).state).toBe('unknown');
});
test.each([
 ['cpu_utilization_percent',89.99,'cpu',false],['cpu_utilization_percent',90,'cpu',true],
 ['memory_utilization_percent',89.99,'memory',false],['memory_utilization_percent',90,'memory',true],
 ['system_drive_utilization_percent',89.99,'disk',false],['system_drive_utilization_percent',90,'disk',true],
 ['system_drive_free_bytes',10*1024**3,'disk',false],['system_drive_free_bytes',10*1024**3-1,'disk',true],
 ['uptime_seconds',30*86400-1,'uptime',false],['uptime_seconds',30*86400,'uptime',true],
])('%s threshold at %s flags %s=%s',(field,value,key,expected)=>{
 const result=health.evaluate({...good,[field]:value},now);
 expect(result.flags[key]).toBe(expected);expect(result.state).toBe(expected?'warning':'healthy');
});
test('unknown disk inputs are not treated as healthy; either known violation suffices',()=>{
 expect(health.evaluate({...good,system_drive_free_bytes:null},now).flags.disk).toBeNull();
 expect(health.evaluate({...good,system_drive_free_bytes:null,system_drive_utilization_percent:95},now).flags.disk).toBe(true);
 expect(health.evaluate({...good,system_drive_free_bytes:0,system_drive_utilization_percent:null},now).flags.disk).toBe(true);
});
test('bigint database strings and zero values format correctly',()=>{
 expect(health.bytes('1073741824')).toBe('1.0 GiB');expect(health.percent(0)).toBe('0%');
 expect(health.bytes(null)).toBe('Unknown');expect(health.uptime(null)).toBe('Unknown');
 expect(health.used('100','25')).toBe(75);expect(health.used(null,25)).toBeNull();
});
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
function presentation(name,returnValue){
 const start=html.indexOf(`function ${name}(`);
 const code=html.slice(start,html.indexOf('  return <',start))+` return ${returnValue}; }`;
 return vm.runInNewContext(`${code};${name}`,{RMMHealth:health});
}
test('fleet exposes all warning causes and stale state separately from device connectivity',()=>{
 const fleet=presentation('RMMFleetHealth','{h,title}');
 const result=fleet({device:{...good,cpu_utilization_percent:96,memory_utilization_percent:92,uptime_seconds:37*86400},now});
 expect(result.title).toContain('Warning / current');expect(result.title).toContain('CPU 96%');expect(result.title).toContain('Memory 92%');expect(result.title).toContain('Uptime 37d');
 expect(fleet({device:good,now:now+900001}).h.label).toBe('Health stale');
});
test('detail presents actual capacities, utilization, uptime and clean unknown fields',()=>{
 const detail=presentation('RMMDeviceHealth','{h,metrics}');
 const {metrics}=detail({device:{...good,total_memory_bytes:16*1024**3,memory_available_bytes:4*1024**3,system_drive:'C:',system_drive_total_bytes:100*1024**3},now});
 expect(metrics.find(row=>row[0]==='Memory')[1]).toContain('4.0 GiB available / 16.0 GiB total');
 expect(metrics.find(row=>row[0]==='System Drive C:')[1]).toContain('10.0 GiB free / 100.0 GiB total');
 expect(detail({device:{},now}).metrics.find(row=>row[0]==='CPU')[1]).toBe('Unknown');
});

test('partial snapshot does not make omitted retained metrics appear current or healthy',()=>{
 const d={...good,health_sample_fields:['cpu_utilization_percent']};
 expect(health.evaluate(d,now)).toMatchObject({state:'unknown',unknown:['memory','disk','uptime']});
 expect(health.currentValue(d,'uptime_seconds')).toBeNull();
});

test('unavailable CPU never becomes current/healthy through coverage or retained values',()=>{
 expect(health.evaluate({...good,cpu_utilization_percent:null,health_sample_fields:Object.keys(good)},now)).toMatchObject({state:'unknown',flags:{cpu:null}});
 expect(health.evaluate({...good,health_sample_fields:Object.keys(good).filter(key=>key!=='cpu_utilization_percent')},now)).toMatchObject({state:'unknown',flags:{cpu:null}});
});
