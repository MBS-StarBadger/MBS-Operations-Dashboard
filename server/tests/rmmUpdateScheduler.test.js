const pool = require('../db/pool');
const jobs = require('../repositories/rmmJobRepository');
const audit = require('../repositories/rmmAuditRepository');
const scheduler = require('../services/rmmUpdateScheduler');
jest.mock('../db/pool', () => ({query:jest.fn()}));
jest.mock('../repositories/rmmJobRepository', () => ({createForDevice:jest.fn()}));
jest.mock('../repositories/rmmAuditRepository', () => ({insert:jest.fn()}));
const now = Date.parse('2026-09-16T12:00:00Z');
const ago = days => new Date(now-days*86400000).toISOString();
beforeEach(()=>jest.clearAllMocks());
test.each([
  [{},true], [{update_refreshed_at:ago(7)},true], [{update_refreshed_at:ago(6.999)},false],
  [{update_refreshed_at:ago(20),update_attempted_at:ago(1)},false],
  [{update_refreshed_at:ago(1),update_attempted_at:ago(20)},false],
  [{last_scan_job_at:ago(1)},false], [{last_scan_job_at:ago(7)},true],
  [{active_scan:true,update_refreshed_at:ago(20)},false],
  [{update_attempted_at:ago(-1)},false],
])('weekly eligibility %j is %s', (device,expected)=>expect(scheduler.isDue(device,now)).toBe(expected));
test('only eligible devices queue an allowlisted job with system audit', async()=>{
  pool.query.mockResolvedValue({rows:[{id:1},{id:2,update_attempted_at:ago(1)},{id:3,active_scan:true}]});
  jobs.createForDevice.mockResolvedValue({id:40});
  await scheduler.run(now);
  expect(jobs.createForDevice).toHaveBeenCalledTimes(1);
  expect(jobs.createForDevice).toHaveBeenCalledWith(1,'windows_update_scan',null);
  expect(audit.insert).toHaveBeenCalledWith(expect.objectContaining({deviceId:1,action:'RMM_JOB_CREATED',details:'Automatically queued windows_update_scan job 40'}));
  const sql=pool.query.mock.calls[0][0];
  expect(sql).toContain("d.os_name ILIKE '%Windows%'");
  expect(sql).toContain("d.asset_id IS NULL OR a.type IN ('Desktop', 'Laptop', 'Server')");
  expect(sql).toContain("j.status IN ('queued', 'claimed', 'started')");
});
test('concurrent duplicate skipped without a false creation audit', async()=>{
  pool.query.mockResolvedValue({rows:[{id:1}]});
  jobs.createForDevice.mockResolvedValue(undefined);
  await scheduler.run(now);
  expect(audit.insert).not.toHaveBeenCalled();
});
test('starts independently of browser activity and repeats hourly without overlapping', async()=>{
  jest.useFakeTimers();
  let finish;
  pool.query.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const timer=scheduler.start();
  expect(pool.query).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(3600000);
  expect(pool.query).toHaveBeenCalledTimes(1);
  finish({rows:[]});
  await jest.advanceTimersByTimeAsync(3600000);
  expect(pool.query).toHaveBeenCalledTimes(2);
  clearInterval(timer); jest.useRealTimers();
});
