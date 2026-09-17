const {aggregate}=require('../public/rmmAlertOverview');
const devices=[{id:1,hostname:'LT226',asset_tag:'MBS-226'},{id:2,hostname:'PC2'},{id:3,hostname:'Quiet'}];
const alerts=[
 ['job',1,'attention','jobs','Inventory job stuck'],['update',1,'info','updates','1 update'],['reboot',1,'info','updates','Reboot may be required'],
 ['disk',2,'critical','hardware','Storage Critical'],['offline',2,'info','offline','Offline'],['stale',2,'info','stale','Update scan stale'],['software',2,'attention','software','Software scan failed']
].map(([id,deviceId,severity,category,title])=>({id,deviceId,severity,category,title}));
test('individual totals, unique endpoints, severity/category counts, highest severity and concise reasons',()=>{
 const result=aggregate({alerts:[...alerts,alerts[0]]},[...devices,devices[0]]);
 expect(result.total).toBe(7);expect(result.affected).toBe(2);expect(result.rows).toHaveLength(2);
 expect(result.counts).toEqual({critical:1,attention:2,info:4});
 expect(result.categoryCounts).toEqual({hardware:1,updates:2,offline:1,stale:2,jobs:1});
 expect(result.rows.map(r=>[r.device.id,r.total,r.highestSeverity])).toEqual([[2,4,'critical'],[1,3,'attention']]);
 expect(result.rows[1].summary).toBe('Inventory job stuck · Reboot may be required · 1 update');
 expect(result.rows[0].summary).toContain('+1 more reasons');
});
test.each([['all',[2,1]],['critical',[2]],['attention',[2,1]],['info',[2,1]],['hardware',[2]],['updates',[1]],['offline',[2]],['stale',[2]],['jobs',[1]]])('%s filters endpoints, retaining fleet totals',(filter,ids)=>{
 const result=aggregate({alerts},devices,filter);expect(result.rows.map(r=>r.device.id)).toEqual(ids);expect(result.total).toBe(7);expect(result.affected).toBe(2);
});
test('search combines with filters and empty results are supported',()=>{
 expect(aggregate({alerts},devices,'jobs',' mbs-226 ').rows).toHaveLength(1);
 expect(aggregate({alerts},devices,'critical','lt226').rows).toHaveLength(0);
 expect(aggregate({alerts},devices,'all','pc2').rows[0].highestSeverity).toBe('critical');
 expect(aggregate({alerts:[]},devices)).toMatchObject({total:0,affected:0,rows:[]});
});
test('stale summaries preserve context without mutating alerts',()=>{
 const alert=Object.freeze({...alerts[1],detail:'Last reported: 1 pending update'});
 expect(aggregate({alerts:[alert]},devices).rows[0].summary).toBe('Last reported: 1 update');
});
