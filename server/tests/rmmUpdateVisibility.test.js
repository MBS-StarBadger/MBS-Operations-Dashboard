const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { validateInventory } = require('../validation/rmmInventory');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const source = html.slice(html.indexOf('function rmmUpdateState('), html.indexOf('function RMMWindowsUpdates('));
const state = vm.runInNewContext(`${source}; rmmUpdateState`);

test('update fleet state distinguishes unknown, zero, failed, stale and reboot', () => {
  const snapshot = {update_refreshed_at:new Date().toISOString(),update_pending_count:0};
  expect(state({status:'online'})).toBe('Update status unknown');
  expect(state(snapshot)).toBe('No applicable updates');
  expect(state({...snapshot,update_pending_count:4})).toBe('4 updates pending');
  expect(state({...snapshot,update_scan_status:'failed'})).toContain('scan failed / unavailable');
  expect(state({...snapshot,update_refreshed_at:'2020-01-01T00:00:00Z'})).toContain('Update data stale');
  expect(state({...snapshot,update_reboot_required:true})).toContain('Reboot required');
});
test.each(['__proto__','constructor','toString'])('rejects inherited object keys in update metadata: %s', key => {
  expect(()=>validateInventory(JSON.parse(`{"pending_updates":[{"${key}":null}]}`))).toThrow();
});

test('weekly snapshot is fresh through eight days and stale after eight days', () => {
  const clock = {now:()=>Date.parse('2026-09-16T12:00:00Z'),parse:Date.parse};
  const status = vm.runInNewContext(`${source}; rmmUpdateState`, {Date:clock});
  const snapshot = {update_pending_count:0};
  for (const timestamp of ['2026-09-09T12:00:00Z','2026-09-08T12:00:00Z']) {
    expect(status({...snapshot,update_refreshed_at:timestamp})).not.toContain('stale');
  }
  expect(status({...snapshot,update_refreshed_at:'2026-09-08T11:59:59Z'})).toContain('stale');
});

const feedbackSource = html.slice(html.indexOf('function rmmScanFeedback('), html.indexOf('function RMMWindowsUpdates('));
const scanFeedback = vm.runInNewContext(`${feedbackSource}; rmmScanFeedback`);
const queued = {jobId:'42',status:'queued',success:true,text:'Windows Update scan queued (job #42). Waiting for the agent.'};
const scanJob = status => ({id:42,job_type:'windows_update_scan',status});
test('tracked scan follows polled queued, claimed, started and completed lifecycle', () => {
  let feedback = scanFeedback(queued,[scanJob('queued')]);
  expect(feedback).toBe(queued);
  for (const status of ['claimed','started']) {
    feedback = scanFeedback(feedback,[scanJob(status)]);
    expect(feedback.text).toBe('Windows Update scan in progress (job #42).');
    expect(feedback.status).toBe(status);
  }
  feedback = scanFeedback(feedback,[scanJob('completed')]);
  expect(feedback.text).toBe('Windows Update scan completed successfully.');
  expect(feedback.success).toBe(true);
  // The 25-job history window or an older poll must not revert terminal feedback.
  expect(scanFeedback(feedback,[])).toBe(feedback);
  expect(scanFeedback(feedback,[scanJob('queued')])).toBe(feedback);
});
test.each([
  [{result_error:'Scan unavailable',result_output:'other'},'Scan unavailable'],
  [{result_output:'Query failed'},'Query failed'],
  [{result_code:1},'Result code: 1'],
  [{},'No further details were reported.'],
])('failed scan displays existing safe job result information %j', (result,detail) => {
  const feedback = scanFeedback(queued,[{...scanJob('failed'),...result}]);
  expect(feedback).toMatchObject({jobId:'42',status:'failed',success:false,text:`Windows Update scan failed. ${detail}`});
});
test('unrelated jobs and missing results do not change tracked scan or queue errors', () => {
  expect(scanFeedback(queued,[{...scanJob('completed'),id:43}])).toBe(queued);
  expect(scanFeedback(queued,[{...scanJob('completed'),job_type:'inventory_refresh'}])).toBe(queued);
  expect(scanFeedback(queued,[])).toBe(queued);
  const error = {success:false,text:'Unable to queue'};
  expect(scanFeedback(error,[scanJob('completed')])).toBe(error);
  expect(scanFeedback(null,[scanJob('completed')])).toBeNull();
});

test('scan component stores queued ID and consumes only its device polling snapshot', async () => {
  // Exercise the component's actual hooks/handler without its JSX presentation.
  const start = html.indexOf('function RMMWindowsUpdates(');
  const logic = html.slice(start,html.indexOf('  const date =',start)) + ' return {scanUpdates,feedback}; }';
  const values=[]; let cursor=0; let effects=[];
  const post=jest.fn().mockResolvedValue({job:{id:42}});
  const Component=vm.runInNewContext(`${feedbackSource}; ${logic}; RMMWindowsUpdates`,{
    window:{api:{post}},
    useState(initial) {
      const i=cursor++;
      if (!(i in values)) values[i]=initial;
      return [values[i],value=>{values[i]=typeof value==='function'?value(values[i]):value;}];
    },
    useRef(initial) {
      const i=cursor++;
      if (!(i in values)) values[i]={current:initial};
      return values[i];
    },
    useEffect(effect) {effects.push(effect);},
  });
  const render = snapshot => {
    cursor=0; effects=[];
    const result=Component({device:{id:10},jobSnapshot:snapshot});
    effects.forEach(effect=>effect());
    return result;
  };
  await render(null).scanUpdates();
  expect(post).toHaveBeenCalledWith('/api/rmm/devices/10/jobs',{job_type:'windows_update_scan'});
  expect(render(null).feedback.jobId).toBe(42);
  render({deviceId:11,jobs:[scanJob('completed')]});
  expect(render(null).feedback.status).toBe('queued');
  render({deviceId:10,jobs:[scanJob('started')]});
  expect(render(null).feedback.text).toContain('in progress');
  render({deviceId:10,jobs:[scanJob('completed')]});
  expect(render(null).feedback.text).toBe('Windows Update scan completed successfully.');
});
