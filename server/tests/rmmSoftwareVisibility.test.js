const fs=require('fs');const vm=require('vm');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const stateSource=html.slice(html.indexOf('function rmmSoftwareState('),html.indexOf('function RMMSoftwareInventory('));
const feedbackSource=html.slice(html.indexOf('function rmmScanFeedback('),html.indexOf('function RMMWindowsUpdates('));
const {state,filter,feedback}=vm.runInNewContext(`${stateSource};${feedbackSource};({state:rmmSoftwareState,filter:filterRmmSoftware,feedback:rmmScanFeedback})`);
const now=Date.parse('2026-09-16T12:00:00Z');
test('software current/stale/never-scanned/failed presentation uses snapshot age',()=>{
 expect(state({},now)).toBe('Software never scanned');
 const d={software_count:0,software_refreshed_at:'2026-09-08T12:00:00Z'};
 expect(state(d,now)).toBe('Software inventory current');
 expect(state(d,now+1)).toBe('Software inventory stale');
 expect(state({...d,software_status:'failed'},now)).toBe('Software last attempt failed · Software inventory current');
 expect(state({software_status:'failed'},now)).toContain('Software never scanned');
});
test('software filters tolerate missing fields and search name/version/publisher with registry view',()=>{
 const rows=[{display_name:'Editor',display_version:'1.0',publisher:'Example',source_views:['registry64']},{display_name:'Tool',display_version:null,publisher:null,source_views:['registry32']}];
 expect(filter(rows,'EXAMPLE','')).toEqual([rows[0]]);
 expect(filter(rows,'1.0','registry64')).toEqual([rows[0]]);
 expect(filter(rows,'editor','registry32')).toEqual([]);
 expect(filter(rows,'','registry32')).toEqual([rows[1]]);
 expect(filter(null,'','')).toEqual([]);
});
test('software feedback tracks its exact job through polling and safely reports failures',()=>{
 const queued={jobId:5,status:'queued',success:true,text:'Waiting for the agent'};
 const update=(f,jobs)=>feedback(f,jobs,'software_inventory_refresh','Software inventory');
 const job=status=>({id:'5',job_type:'software_inventory_refresh',status});
 expect(update(queued,[{...job('completed'),id:6}])).toBe(queued);
 expect(update(queued,[{...job('completed'),job_type:'windows_update_scan'}])).toBe(queued);
 expect(update(queued,[job('queued')])).toBe(queued);
 for(const status of ['claimed','started']) expect(update(queued,[job(status)]).text).toBe('Software inventory in progress (job #5).');
 const completed=update(queued,[job('completed')]);
 expect(completed.text).toBe('Software inventory completed successfully.');
 expect(update(completed,[])).toBe(completed);
 expect(update(queued,[{...job('failed'),result_error:'Registry unavailable'}])).toMatchObject({success:false,text:'Software inventory failed. Registry unavailable'});
});
test('software refresh component queues and consumes only matching device polling results',async()=>{
 const start=html.indexOf('function RMMSoftwareInventory(');
 const logic=html.slice(start,html.indexOf('  const rows=',start))+' return {refreshSoftware,feedback}; }';
 const values=[];let cursor=0;let effects=[];
 const post=jest.fn().mockResolvedValue({job:{id:5}});
 const Component=vm.runInNewContext(`${feedbackSource};${logic};RMMSoftwareInventory`,{
  window:{api:{post}},
  useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},
  useRef(initial){const i=cursor++;if(!(i in values))values[i]={current:initial};return values[i];},
  useEffect(effect){effects.push(effect);},
 });
 const render=snapshot=>{cursor=0;effects=[];const result=Component({device:{id:10},jobSnapshot:snapshot});effects.forEach(f=>f());return result;};
 await render(null).refreshSoftware();
 expect(post).toHaveBeenCalledWith('/api/rmm/devices/10/jobs',{job_type:'software_inventory_refresh'});
 expect(render(null).feedback.jobId).toBe(5);
 const jobs=[{id:5,job_type:'software_inventory_refresh',status:'completed'}];
 render({deviceId:11,jobs});expect(render(null).feedback.status).toBe('queued');
 render({deviceId:10,jobs});expect(render(null).feedback.text).toBe('Software inventory completed successfully.');
});
