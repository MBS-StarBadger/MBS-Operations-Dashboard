const request=require('supertest');
const pool=require('../db/pool');
const {validateInventory}=require('../validation/rmmInventory');
jest.mock('../db/pool',()=>({query:jest.fn()}));
jest.mock('../repositories/rmmCorrelationRepository',()=>({correlateDevice:jest.fn().mockResolvedValue(undefined)}));
const app=require('../index');
const token='health-test-only';
const snapshot={health_snapshot_at:'2026-09-16T12:00:00.0000000Z',cpu_utilization_percent:25.5,
 total_memory_bytes:16*1024**3,memory_available_bytes:4*1024**3,memory_utilization_percent:75,
 system_drive:'C:',system_drive_total_bytes:500*1024**3,system_drive_free_bytes:100*1024**3,system_drive_utilization_percent:80,
 last_boot_at:'2026-09-15T12:00:00Z',uptime_seconds:86400};
function authenticate(){pool.query.mockResolvedValueOnce({rows:[{id:10,hostname:'PC',agent_id:'health-agent',agent_token_hash:require('crypto').createHash('sha256').update(token).digest('hex')}]});}
function checkin(body){return request(app).post('/api/rmm/agent/checkin').set('x-rmm-agent-id','health-agent').set('x-rmm-agent-token',token).send(body);}
beforeEach(()=>jest.clearAllMocks());
test('stores health and reused hardware fields, preserves omitted metrics on partial/legacy check-ins, supports explicit null and zero',async()=>{
 let stored={};
 for(const body of [snapshot,{cpu_utilization_percent:90,health_snapshot_at:'2026-09-16T12:01:00Z'},
  {hostname:'PC'},{cpu_name:'New CPU'},{cpu_utilization_percent:null,memory_available_bytes:0,memory_utilization_percent:100}]){
  pool.query.mockReset();authenticate();pool.query.mockResolvedValueOnce({rows:[{id:10,status:'online'}]});
  const before={...stored};
  expect((await checkin(body)).status).toBe(200);
  const [sql,params]=pool.query.mock.calls[1];
  for(const field of Object.keys(snapshot)){
   const match=sql.match(new RegExp(field+' = \\$([0-9]+)'));
   if(!(field in body)){expect(match).toBeNull();expect(stored[field]).toEqual(before[field]);continue;}
   expect(params[Number(match[1])-1]).toEqual(body[field]);stored[field]=params[Number(match[1])-1];
  }
  expect(require('../repositories/rmmCorrelationRepository').correlateDevice).toHaveBeenCalledWith(10,{autoLink:true});
 }
});
const badPayloads=[
 ...['cpu_utilization_percent','memory_utilization_percent','system_drive_utilization_percent'].flatMap(field=>[-1,100.01,'90',true,{},[]].map(value=>({[field]:value}))),
 ...['memory_available_bytes','system_drive_total_bytes','system_drive_free_bytes'].flatMap(field=>[-1,1.5,Number.MAX_SAFE_INTEGER+1,'1024'].map(value=>({[field]:value}))),
 {health_snapshot_at:'yesterday'},{health_snapshot_at:'2026-02-30T12:00:00Z'},{health_snapshot_at:123},
 {health_snapshot_at:'2026-09-16T12:00:00'}, {system_drive:'C:\\'},{system_drive:'x'.repeat(101)}, {system_drive:{}},
 {total_memory_bytes:100,memory_available_bytes:101},{system_drive_total_bytes:100,system_drive_free_bytes:101},
];
test.each(badPayloads)('rejects malformed health payload %j',async payload=>{
 authenticate();expect((await checkin(payload)).status).toBe(400);expect(pool.query).toHaveBeenCalledTimes(1);
});
test.each([NaN,Infinity,-Infinity])('rejects non-finite percentage and capacity %s',value=>{
 for(const field of ['cpu_utilization_percent','memory_utilization_percent','system_drive_utilization_percent','memory_available_bytes','system_drive_total_bytes','system_drive_free_bytes']){
  expect(()=>validateInventory({[field]:value})).toThrow();
 }
});
test('valid boundaries and explicit null are retained',()=>{
 for(const value of [0,90,100,null])expect(validateInventory({cpu_utilization_percent:value})).toEqual({cpu_utilization_percent:value});
 expect(validateInventory({memory_available_bytes:Number.MAX_SAFE_INTEGER})).toEqual({memory_available_bytes:Number.MAX_SAFE_INTEGER});
 expect(validateInventory({system_drive:null,health_snapshot_at:null})).toEqual({system_drive:null,health_snapshot_at:null,health_sample_fields:[]});
});
test('health payload still requires valid agent authentication',async()=>{
 expect((await request(app).post('/api/rmm/agent/checkin').send(snapshot)).status).toBe(401);
 expect(pool.query).not.toHaveBeenCalled();
});

test('snapshot coverage is server generated and cannot be forged by an agent',()=>{
 const validated=validateInventory({health_snapshot_at:snapshot.health_snapshot_at,cpu_utilization_percent:5,health_sample_fields:['uptime_seconds']});
 expect(validated.health_sample_fields).toEqual(['cpu_utilization_percent']);
 expect(validateInventory({cpu_utilization_percent:10})).not.toHaveProperty('health_sample_fields');
});

test('sample coverage includes zero and excludes null, omitted, or forged sampled fields',()=>{
 const body={health_snapshot_at:snapshot.health_snapshot_at,cpu_utilization_percent:null,
  memory_available_bytes:0,memory_utilization_percent:100,system_drive:null,
  total_memory_bytes:null,last_boot_at:null,uptime_seconds:0,health_sample_fields:['cpu_utilization_percent']};
 const result=validateInventory(body);
 expect(result.cpu_utilization_percent).toBeNull();
 expect(result.health_sample_fields).toEqual(['memory_available_bytes','memory_utilization_percent','uptime_seconds']);
});
test('null CPU is explicitly cleared in SQL but is excluded from successful sample coverage',async()=>{
 authenticate();pool.query.mockResolvedValueOnce({rows:[{id:10,status:'online'}]});
 expect((await checkin({health_snapshot_at:snapshot.health_snapshot_at,cpu_utilization_percent:null,memory_utilization_percent:42.7})).status).toBe(200);
 const [sql,params]=pool.query.mock.calls[1];
 function bound(field){return params[Number(sql.match(new RegExp(field+' = \\$([0-9]+)'))[1])-1];}
 expect(bound('cpu_utilization_percent')).toBeNull();
 expect(JSON.parse(bound('health_sample_fields'))).toEqual(['memory_utilization_percent']);
 expect(sql).not.toContain('system_drive_free_bytes =');
});
