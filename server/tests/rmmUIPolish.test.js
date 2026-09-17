const fs=require('fs'),path=require('path'),vm=require('vm');
const babel=require('@babel/core');
const ui=require('../public/rmmUI'),health=require('../public/rmmHealth');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
// Transform JSX to a small element tree so tests exercise real component rendering,
// without introducing React/browser dependencies into the existing Jest environment.
const plugin=({types:t})=>({visitor:{JSXElement:{exit(p){
 const el=p.node,tag=el.openingElement.name;
 const kind=/^[a-z]/.test(tag.name)?t.stringLiteral(tag.name):t.identifier(tag.name);
 const attrs=el.openingElement.attributes.map(a=>a.type==='JSXSpreadAttribute'?t.spreadElement(a.argument):t.objectProperty(t.stringLiteral(a.name.name),a.value==null?t.booleanLiteral(true):a.value.type==='JSXExpressionContainer'?a.value.expression:a.value));
 const children=el.children.flatMap(c=>c.type==='JSXText'?(c.value.trim()?[t.stringLiteral(c.value.replace(/\s+/g,' '))]:[]):c.type==='JSXExpressionContainer'?(c.expression.type==='JSXEmptyExpression'?[]:[c.expression]):[c]);
 p.replaceWith(t.callExpression(t.identifier('element'),[kind,t.objectExpression(attrs),...children]));
}},JSXFragment:{exit(p){p.replaceWith(t.arrayExpression(p.node.children.filter(c=>c.type!=='JSXText'||c.value.trim()).map(c=>c.type==='JSXExpressionContainer'?c.expression:c.type==='JSXText'?t.stringLiteral(c.value):c)));}}}});
const ast=babel.parseSync(html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1],{parserOpts:{plugins:['jsx']},configFile:false,babelrc:false});
const names=['RMMAlertOverviewPanel','RMMChip','RMMHardwareInventory','RMMEndpointSummary','RMMHealthMeter','RMMDeviceHealth','rmmUpdateState','rmmSoftwareState','RMMWindowsUpdates','RMMSoftwareInventory','filterRmmSoftware','rmmScanFeedback'];
const componentSource=ast.program.body.filter(node=>node.type==='FunctionDeclaration'&&names.includes(node.id.name)).map(node=>html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1].slice(node.start,node.end)).join('\n');
const code=babel.transformSync(componentSource,{plugins:[plugin],parserOpts:{plugins:['jsx']},configFile:false,babelrc:false}).code;
function render(name,props,mode='dark'){
 const T={surface:mode==='dark'?'#17202a':'#ffffff',surfaceAlt:mode==='dark'?'#222b35':'#f4f5f6',slate:mode==='dark'?'#eee':'#111',muted:'#888',border:'#777',warningText:'#f90',warningBg:'#321',warningBorder:'#f90'};
 function element(tag,props,...children){return typeof tag==='function'?tag({...props,children}):{tag,props,children};}
 return vm.runInNewContext(`${code};${name}(props)`,{RMMUI:ui,RMMHealth:health,RMMAlertOverview:require('../public/rmmAlertOverview'),T,props,element,useState:value=>[value,()=>{}],useRef:value=>({current:value}),useEffect:()=>{},getIBase:()=>({})});
}
function text(tree){if(tree==null||typeof tree==='boolean')return '';if(Array.isArray(tree))return tree.map(text).join(' ');if(typeof tree==='object')return text(tree.children);return String(tree);}
function nodes(tree,tag){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(v=>nodes(v,tag));return [...(tree.tag===tag?[tree]:[]),...nodes(tree.children,tag)];}
test('shared formatting handles bytes, uptime, age, zero, whitespace and unknown',()=>{
 expect(ui.bytes(16*1024**3)).toBe('16.0 GiB');expect(ui.bytes(2*1024**4)).toBe('2.00 TiB');
 expect(ui.duration(8*86400+3*3600)).toBe('8 days 3 hours');expect(ui.percent(0)).toBe('0%');
 expect(ui.text('  SK   hynix  ')).toBe('SK hynix');expect(ui.text(null)).toBe('Unknown');expect(ui.bytes(null)).toBe('Unknown');
 expect(ui.age('2026-01-01T00:00:00Z',Date.parse('2026-01-01T00:18:00Z'))).toBe('18 min ago');
});
const device={hostname:'PC',cpu_name:'Intel Core Ultra 5 125U',cpu_manufacturer:'GenuineIntel',processor_count:1,core_count:12,logical_processor_count:14,total_memory_bytes:16*1024**3,
 memory_modules:[{locator:'DIMM 1',bank:'BANK 0',capacity_bytes:8*1024**3,manufacturer:'  SK   hynix ',part_number:'HMCG66',configured_speed_mhz:5600,speed_mhz:5600},{locator:'DIMM 2',capacity_bytes:8*1024**3,manufacturer:null}],
 physical_disks:[{model:'Disk Model',manufacturer:'Disk Maker',serial_number:'DISK-1',capacity_bytes:512*1024**3,media_type:'Fixed hard disk media',bus_type:'SCSI'}]};
test.each(['light','dark'])('hardware cards render every DIMM, CPU, physical disk and unknowns with %s theme',mode=>{
 const tree=render('RMMHardwareInventory',{device},mode),output=text(tree);
 for(const value of ['Intel Core Ultra 5 125U','1 processor · 12 cores · 14 logical processors','DIMM 1','DIMM 2','SK hynix','8.0 GiB','HMCG66','5600 MHz','Unknown','Disk Model','Disk Maker','DISK-1','512.0 GiB','System & firmware'])expect(output).toContain(value);
 expect(device.memory_modules[0].manufacturer).toBe('  SK   hynix ');
 expect(nodes(tree,'article')).toHaveLength(6);
 expect(tree.props.style.background).toBe(mode==='dark'?'#17202a':'#ffffff');
});
test('health meters retain numerical values, warning messages and unknown handling',()=>{
 const tree=render('RMMDeviceHealth',{device:{health_snapshot_at:new Date().toISOString(),cpu_utilization_percent:96,memory_utilization_percent:null},now:Date.now()});
 expect(text(tree)).toContain('96%');expect(text(tree)).toContain('High CPU');expect(text(tree)).toContain('Utilization unknown');
 const bars=nodes(tree,'div').filter(node=>node.props.role==='progressbar');expect(bars).toHaveLength(1);expect(bars[0].props['aria-valuenow']).toBe(96);
});
test.each([[{categories:['Drivers']},'Driver'],[{categories:['Firmware']},'Firmware'],[{category_ids:['0fa1201d-4330-4fa8-8ae9-b877473b6441']},'Security'],[{},'Unclassified']])('update classification %j remains textual', (update,label)=>expect(ui.updateKind(update)).toBe(label));
test('job names/statuses remain distinct and readable',()=>{
 expect(ui.jobName('inventory_refresh')).toBe('Hardware Inventory Refresh');expect(ui.jobName('windows_update_scan')).toBe('Windows Update Scan');expect(ui.jobName('software_inventory_refresh')).toBe('Software Inventory Refresh');
 expect(new Set(['queued','claimed','started','completed','failed'].map(ui.jobStatus)).size).toBe(5);
});

test('endpoint summary reports identity, linked asset and truthful hardware timestamp context',()=>{
 const output=text(render('RMMEndpointSummary',{device:{...device,asset_tag:'MBS-226',serial_number:'SERIAL',health_status:'online',os_name:'Windows 11',os_build:'26100',logged_in_user:'User'},now:Date.now()}));
 for(const value of ['PC','MBS-226','SERIAL','Windows 11','Build 26100','User','online','Hardware has no separate scan timestamp'])expect(output).toContain(value);
});
test('update cards render category, KB, severity, download and reboot text',()=>{
 const tree=render('RMMWindowsUpdates',{device:{pending_updates:[{title:'Driver package',categories:['Drivers'],kb_ids:['123'],severity:null,downloaded:false,reboot_may_be_required:true}],update_pending_count:1}});
 const output=text(tree);for(const value of ['Driver package','Driver','KB123','Severity:','Unknown','Downloaded:','No','May require reboot:','Yes'])expect(output).toContain(value);
});
test('software summary and table render versions and normalized publishers without actions',()=>{
 const output=text(render('RMMSoftwareInventory',{device:{software_count:1,installed_software:[{display_name:'App',display_version:'1.2',publisher:'  Publisher   Inc ',source_views:['registry64']}]}}));
 for(const value of ['1 installed applications','Last scanned','App','1.2','Publisher Inc','Install location:','Unknown'])expect(output.replace(/\s+/g,' ')).toContain(value);
 expect(output).not.toContain('Uninstall');
});
test('current hardware alerts appear in summary, health and hardware cards with values',()=>{
 const d={...device,health_snapshot_at:new Date().toISOString(),health_status:'online',memory_utilization_percent:94,memory_available_bytes:1024**3,cpu_utilization_percent:96,system_drive:'C:',system_drive_utilization_percent:99,system_drive_free_bytes:1.4*1024**3,system_drive_total_bytes:100*1024**3,uptime_seconds:37*86400};
 for(const name of ['RMMEndpointSummary','RMMDeviceHealth','RMMHardwareInventory']){
  const output=text(render(name,{device:d,now:Date.now()}));
  for(const label of ['High Memory Usage','94%','1.0 GiB','High CPU','Drive Full'])expect(output).toContain(label);
 }
 const output=text(render('RMMEndpointSummary',{device:d,now:Date.now()}));expect(output).toContain('Critical / current');expect(output).toContain('online');
 const stale=text(render('RMMEndpointSummary',{device:{...d,health_snapshot_at:'2020-01-01T00:00:00Z'},now:Date.now()}));expect(stale).toContain('Health stale');expect(stale).not.toContain('Drive Full');
});

test.each([
 ['Samsung','Samsung'],['SK hynix','SK hynix'],['80AD','SK hynix'],['0x80ad','SK hynix'],
 ['802C','Micron'],['2C00','Micron'],['80CE','Samsung'],['CE00','Samsung'],['AD00','SK hynix'],['8551','Qimonda'],['5105','Qimonda'],
 ['FFFF','FFFF'],['80AD000080AD','80AD000080AD'],['0xZZZZ','0xZZZZ'],['80 AD','80 AD'],['prefix80AD','prefix80AD'],
 [null,'Unknown'],[undefined,'Unknown'],['','Unknown'],['  ','Unknown'],[123,'Unknown'],[{},'Unknown'],[[],'Unknown']
])('memory manufacturer %j maps only exact documented identifiers', (raw,expected)=>expect(ui.memoryManufacturer(raw)).toBe(expected));
const volume={health_snapshot_at:new Date().toISOString(),system_drive:'C:',system_drive_total_bytes:100*1024**3,system_drive_free_bytes:25*1024**3,system_drive_utilization_percent:75};
const volumeText=d=>text(nodes(render('RMMHardwareInventory',{device:d}),'article')[2]).replace(/\s+/g,' ');
test('system volume displays drive, utilization, derived used bytes, free and total',()=>{
 const output=volumeText(volume);
 for(const value of ['C:','75% used','75.0 GiB used space','25.0 GiB free','100.0 GiB total','Storage Normal'])expect(output).toContain(value);
 expect(output).not.toContain('Last reported');
});
test('stale volume retains covered last-reported values without current health assertions',()=>{
 const output=volumeText({...volume,health_snapshot_at:'2020-01-01T00:00:00Z'});
 for(const value of ['Last reported','Stale telemetry','75% used','75.0 GiB used space'])expect(output).toContain(value);
 expect(output).not.toContain('Storage Normal');
});
test.each([null,'invalid','2999-01-01T00:00:00Z'])('unusable snapshot %j remains unknown',stamp=>{
 const output=volumeText({...volume,health_snapshot_at:stamp});expect(output).toContain('Unknown');expect(output).not.toContain('75%');expect(output).not.toContain('100.0 GiB');
});
test.each([new Date().toISOString(),'2020-01-01T00:00:00Z'])('volume respects partial sample coverage at %s',stamp=>{
 const output=volumeText({...volume,health_snapshot_at:stamp,health_sample_fields:['system_drive','system_drive_free_bytes']});
 expect(output).toContain('25.0 GiB free');expect(output).not.toContain('75%');expect(output).not.toContain('used space');expect(output).not.toContain('100.0 GiB');
});
test('DIMM raw ID stays inspectable and part/model strings never supply manufacturers',()=>{
 const tree=render('RMMHardwareInventory',{device:{memory_modules:[{manufacturer:'80AD',part_number:'Samsung'}, {manufacturer:null,part_number:'Micron'}],physical_disks:[{model:'Samsung SSD',manufacturer:null}]}});
 const cards=nodes(tree,'article');expect(text(cards[3])).toContain('SK hynix');
 expect(nodes(cards[3],'p')[0].props.title).toBe('Reported manufacturer: 80AD');
 expect(text(cards[4])).not.toContain('SK hynix');
 expect(text(cards[5]).match(/Samsung/g)).toHaveLength(1);
 expect(text(tree)).not.toContain('Unknown · Unknown');
});

test('overview consolidates rows and wires endpoint, asset and filter actions',()=>{
 const onOpen=jest.fn(),onFilter=jest.fn(),onViewAsset=jest.fn(),device={id:226,hostname:'LT226',asset_tag:'MBS-226',asset_id:42,status:'online'};
 const overview=require('../public/rmmAlertOverview').aggregate({alerts:[{id:'disk',deviceId:226,severity:'critical',category:'hardware',title:'Storage Critical'},{id:'update',deviceId:226,severity:'info',category:'updates',title:'1 update'}]},[device]);
 const tree=render('RMMAlertOverviewPanel',{overview,filter:'all',onFilter,onOpen,onViewAsset});
 for(const value of ['critical','LT226','MBS-226','Storage Critical','1 update','2 active alerts','1 affected endpoints'])expect(text(tree).replace(/\s+/g,' ')).toContain(value);
 expect(nodes(tree,'tr')).toHaveLength(2);
 const buttons=nodes(tree,'button');
 buttons.find(b=>text(b)==='View Endpoint').props.onClick();expect(onOpen).toHaveBeenCalledWith(device);
 buttons.find(b=>text(b)==='MBS-226').props.onClick();expect(onViewAsset).toHaveBeenCalledWith(42);
 for(const key of ['Hardware','Critical'])buttons.find(b=>text(b).includes(key)).props.onClick();
 expect(onFilter.mock.calls).toEqual([['hardware'],['critical']]);
 expect(buttons[0].props['aria-pressed']).toBe(true);
});
test('overview bounds DOM for 200 endpoints and 1000 alerts',()=>{
 const devices=Array.from({length:200},(_,id)=>({id,hostname:`PC-${id}`}));
 const alerts=devices.flatMap(d=>Array.from({length:5},(_,i)=>({id:`${d.id}:${i}`,deviceId:d.id,severity:'info',category:'jobs',title:'Job issue'})));
 const overview=require('../public/rmmAlertOverview').aggregate({alerts},devices);
 const tree=render('RMMAlertOverviewPanel',{overview,filter:'all'});
 expect(nodes(tree,'tr')).toHaveLength(26);expect(nodes(tree,'article')).toHaveLength(0);
 expect(text(tree).replace(/\s+/g,' ')).toContain('1000 active alerts');expect(text(tree).replace(/\s+/g,' ')).toContain('200 affected endpoints');expect(text(tree).replace(/\s+/g,' ')).toContain('Page 1 of 8');
});

test('fleet refresh uses existing timer, prevents overlap and ignores responses after unmount',async()=>{
 const tab=ast.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='RMMTab');
 const effect=tab.body.body.find(n=>n.type==='ExpressionStatement'&&n.expression.callee?.name==='useEffect').expression.arguments[0];
 const source=html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1].slice(effect.start,effect.end);
 let tick,resolve;const setDevices=jest.fn(),setFleetRefreshError=jest.fn(),clearInterval=jest.fn();
 const get=jest.fn(()=>new Promise(r=>{resolve=r;}));
 const cleanup=vm.runInNewContext(`(${source})()`,{window:{api:{get}},setHealthNow:jest.fn(),setDevices,setFleetRefreshError,clearInterval,setInterval:(fn,ms)=>{expect(ms).toBe(30000);tick=fn;return 9;}});
 const first=tick();await tick();expect(get).toHaveBeenCalledTimes(1);resolve([{id:1}]);await first;expect(setDevices).toHaveBeenCalledWith([{id:1}]);
 get.mockRejectedValueOnce(new Error('network'));await tick();expect(setFleetRefreshError).toHaveBeenLastCalledWith('Fleet refresh failed; showing last loaded data.');
 const pending=tick();cleanup();resolve([{id:2}]);await pending;expect(setDevices).toHaveBeenCalledTimes(1);expect(clearInterval).toHaveBeenCalledWith(9);
});
