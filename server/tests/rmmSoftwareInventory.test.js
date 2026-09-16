const request=require('supertest');
const jwt=require('jsonwebtoken');
const pool=require('../db/pool');
const {validateInventory}=require('../validation/rmmInventory');
jest.mock('jsonwebtoken');
jest.mock('../db/pool',()=>({query:jest.fn()}));
jest.mock('../repositories/rmmCorrelationRepository',()=>({correlateDevice:jest.fn().mockResolvedValue(undefined)}));
const app=require('../index');
const sample={display_name:'Example App',display_version:'1.2',publisher:'Publisher',install_date:'2026-01-01',install_location:'C:\\Example',source_views:['registry64','registry32']};
const snapshot={software_attempted_at:'2026-09-16T12:00:00Z',software_refreshed_at:'2026-09-16T12:00:01Z',software_status:'success',software_count:1,installed_software:[sample]};
const token='software-test-only';
const fields=Object.keys(snapshot);
beforeEach(()=>{jest.resetAllMocks();require('../repositories/rmmCorrelationRepository').correlateDevice.mockResolvedValue(undefined);});
function authenticate(){pool.query.mockResolvedValueOnce({rows:[{id:10,hostname:'PC',agent_id:'software-agent',agent_token_hash:require('crypto').createHash('sha256').update(token).digest('hex')}]});}
function checkin(body){return request(app).post('/api/rmm/agent/checkin').set('x-rmm-agent-id','software-agent').set('x-rmm-agent-token',token).send(body);}
test('check-in replaces software snapshot, preserves omitted fields on legacy/hardware/update and failed check-ins, and accepts explicit null/zero',async()=>{
  let stored={};
  for(const body of [snapshot,{hostname:'PC'},{cpu_name:'CPU'},{update_scan_status:'success'},
    {software_attempted_at:'2026-09-17T12:00:00Z',software_status:'failed'},
    {...snapshot,installed_software:[{...sample,display_version:'2.0'}]},
    {software_count:0,installed_software:[]},
    {software_refreshed_at:null,software_count:null,installed_software:null}]){
    pool.query.mockReset();authenticate();
    pool.query.mockResolvedValueOnce({rows:[{id:10,status:'online'}]});
    const before={...stored};
    expect((await checkin(body)).status).toBe(200);
    const [sql,params]=pool.query.mock.calls[1];
    for(const field of fields){
      const match=sql.match(new RegExp(field+' = \\$([0-9]+)'));
      if(!(field in body)){expect(match).toBeNull();continue;}
      const value=params[Number(match[1])-1];
      expect(value).toEqual(Array.isArray(body[field])?JSON.stringify(body[field]):body[field]);
      stored[field]=field==='installed_software' && value!==null?JSON.parse(value):value;
    }
    if(body.software_status==='failed'){
      for(const field of ['software_count','installed_software','software_refreshed_at'])expect(stored[field]).toEqual(before[field]);
    }
    expect(require('../repositories/rmmCorrelationRepository').correlateDevice).toHaveBeenCalledWith(10,{autoLink:true});
  }
});
test.each([
 {software_attempted_at:'yesterday'},{software_refreshed_at:'2026-02-30T12:00:00Z'},{software_status:'ok'},
 {software_count:-1},{software_count:1.5},{software_count:'1'},{software_count:1001},
 {installed_software:{}},{installed_software:[null]},{installed_software:[{}]},
 {installed_software:[{display_name:'  '}]},{installed_software:[{display_name:4}]},
 ...['display_name','display_version','publisher','install_location'].map((field,i)=>({installed_software:[{...sample,[field]:'x'.repeat([301,101,201,501][i])}]})),
 {installed_software:[{...sample,install_date:'2026-02-30'}]},
 {installed_software:[{...sample,source_views:['arm64']}]},
 {installed_software:[{...sample,source_views:['registry32','registry32']}]},
 {installed_software:[{...sample,command:'bad'}]},
 {installed_software:Array(1001).fill(sample)},
 {software_count:0,installed_software:[sample]},
 {software_status:'failed',installed_software:null},
 {software_status:'failed',software_count:null},
 {software_status:'unavailable',software_refreshed_at:null},
])('rejects invalid software payload %j',async body=>{
 authenticate();expect((await checkin(body)).status).toBe(400);expect(pool.query).toHaveBeenCalledTimes(1);
});
test('accepts boundary limits and unknown optional metadata',()=>{
 const entry={display_name:'x'.repeat(300),display_version:'x'.repeat(100),publisher:'x'.repeat(200),install_location:'x'.repeat(500),install_date:null,source_views:['registry32','registry64']};
 expect(validateInventory({software_count:1000,installed_software:Array(1000).fill(entry)}).installed_software).toHaveLength(1000);
 expect(validateInventory({})).toEqual({});
});
test.each([true,false])('manual software job creation with duplicate=%s',async duplicate=>{
 jwt.verify.mockReturnValue({id:1,role:'admin'});
 pool.query.mockResolvedValueOnce({rows:[{id:10,software_refreshed_at:new Date().toISOString()}]})
  .mockResolvedValueOnce({rows:duplicate?[]:[{id:50,job_type:'software_inventory_refresh'}]})
  .mockResolvedValueOnce({rows:[{id:1}]});
 const response=await request(app).post('/api/rmm/devices/10/jobs').set('Authorization','Bearer test').send({job_type:'software_inventory_refresh',device_id:99,payload:{command:'ignored'}});
 expect(response.status).toBe(duplicate?409:201);
 expect(pool.query.mock.calls[1][1]).toEqual([10,'software_inventory_refresh',1]);
 expect(pool.query.mock.calls[1][0]).toContain("WHERE job_type = 'software_inventory_refresh'");
 expect(pool.query.mock.calls[1][0]).toContain("AND status IN ('queued', 'claimed', 'started') DO NOTHING");
 if(!duplicate)expect(pool.query.mock.calls[2][1]).toContain('Queued software_inventory_refresh job 50');
});
test.each(['missing','user','scope'])('manual software job retains %s protection',async protection=>{
 jwt.verify.mockReturnValue({id:1,role:protection==='user'?'user':'admin'});
 if(protection==='scope')pool.query.mockResolvedValueOnce({rows:[{id:10,asset_id:1,asset_type:'Truck'}]});
 const req=request(app).post('/api/rmm/devices/10/jobs');
 if(protection!=='missing')req.set('Authorization','Bearer test');
 expect((await req.send({job_type:'software_inventory_refresh'})).status).toBe(protection==='missing'?401:protection==='user'?403:400);
});
