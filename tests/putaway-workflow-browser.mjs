// Actual putaway components with isolated synthetic transport; never contacts the project API.
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><aside style="padding:12px;background:#fef3c7"><strong>DỮ LIỆU KIỂM THỬ — không thay đổi kho thực tế</strong>
<form><label>Vai trò <select name="role"><option>WAREHOUSE_MANAGER</option><option>WAREHOUSE_STAFF</option></select></label>
<label>Trạng thái <select name="scenario"><option>capacity</option><option>ready</option><option>assigned</option><option>paginated</option><option>revoked</option><option>scan-conflict</option><option>scan-validation</option><option>stale-confirmation</option><option>revoked-confirmation</option><option>lost-confirmation</option></select></label><button>Xem</button></form>
<output aria-label="Fixture commands">Chưa gửi thao tác</output></aside><main style="max-width:1300px;margin:auto;padding:24px"><div id="root"></div></main><script type="module">
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { useAuthStore } from '/src/stores/authStore.ts';
import { PutawayWorkspace } from '/src/features/inbound/components/PutawayWorkspace.tsx';
import messages from '/messages/vi.json';
import '/src/styles/globals.css';
const query=new URLSearchParams(location.search),role=query.get('role')||'WAREHOUSE_MANAGER',scenario=query.get('scenario')||'capacity';
document.querySelector('[name=role]').value=role;document.querySelector('[name=scenario]').value=scenario;
const uuid=n=>'10260000-0000-4000-8000-'+String(n).padStart(12,'0');
const warehouseId=uuid(1),workerId=uuid(9),zoneId=uuid(3),stamp='2026-10-16T03:00:00.000Z';
const user={userId:role==='WAREHOUSE_STAFF'?workerId:uuid(8),tenantId:null,actorScope:'PLATFORM',roles:[role],permissions:[],warehouseIds:[warehouseId],email:'fixture@example.test',fullName:'Nhân viên kiểm thử',phone:null,avatarUrl:null};
useAuthStore.getState().setSession({user,accessToken:'synthetic-local-token',expiresIn:900});
let ready=['ready','assigned','scan-conflict','scan-validation','stale-confirmation','revoked-confirmation','lost-confirmation'].includes(scenario);
const assigned=ready&&scenario!=='ready';let confirmationCount=0,lastConfirmation=null,accessRevoked=false;
const warehouse={id:warehouseId,tenantId:null,region:'CENTRAL',timeZone:'Asia/Ho_Chi_Minh',cutoffMinute:840,operatingStartMinute:480,operatingEndMinute:1080,version:1,code:'WH-TEST',name:'Kho kiểm thử',address:'Kho kiểm thử',provinceCode:'48',districtCode:null,wardCode:'20194',latitude:16,longitude:108,dailyCapacity:100,priority:1,status:'ACTIVE',contactName:null,contactPhone:null,contactEmail:null,createdAt:stamp,updatedAt:stamp};
let zones=[{id:uuid(2),warehouseId,code:'NHAN',zoneType:'RECEIVING',isActive:true,updatedAt:stamp},{id:zoneId,warehouseId,code:'LUU-TRU',zoneType:'STORAGE',isActive:true,updatedAt:stamp}];
let bins=[{id:uuid(4),warehouseId,zoneId,code:'KE-A01',barcode:'KE-A01',maxWeightG:'100000',maxVolumeM3:ready?'10':'1',isActive:true,version:1}];
let task={id:uuid(5),version:1,status:assigned?'ASSIGNED':'OPEN',qty:10,confirmedQty:0,assigneeId:assigned?workerId:null,fromBinCode:'NHAN-01',toBinCode:'KE-A01',sku:'Tivi',productName:'Tivi xiaomi',lotCode:'RCV-TEST'};
const waiting={receivingRecordId:uuid(6),asnCode:'ASN-TEST',sku:'Tivi',productName:'Tivi xiaomi',lotCode:'RCV-TEST',quantity:10,weightG:'50000',volumeM3:'8.640000',fromBinCode:'NHAN-01',reason:'CAPACITY_REQUIRED'};
const page={limit:100,hasNext:false,nextCursor:null};
const ok=(data,pagination)=>Response.json({success:true,data,meta:{timestamp:stamp,requestId:'local-fixture',...(pagination?{pagination}:{})}});
const fail=(status,message)=>Response.json({success:false,error:{statusCode:status,code:'LOCAL.FIXTURE',message},meta:{}},{status});
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.origin),p=url.pathname,method=init.method||'GET';
 if(method!=='GET')document.querySelector('output').textContent=method+' '+p+' — chỉ dữ liệu kiểm thử';
 if(accessRevoked)return fail(403,'Đã thu hồi phân công kho.');
 if(p.endsWith('/confirmation')&&method==='POST'){
  const body=JSON.parse(init.body);confirmationCount++;
  document.querySelector('output').textContent=JSON.stringify({confirmationCount,body,replayMatches:lastConfirmation!==null&&JSON.stringify(body)===JSON.stringify(lastConfirmation)});
  if(scenario==='revoked-confirmation'){accessRevoked=true;return fail(403,'Đã thu hồi phân công kho.');}
  if(scenario==='stale-confirmation'){task={...task,version:task.version+1,assigneeId:uuid(10)};return fail(409,'Công việc đã được phân công lại.');}
  if(body.fromBinScan!=='NHAN-01'||body.toBinScan!=='KE-A01'||body.skuScan!=='Tivi'||body.lotScan!=='RCV-TEST')return fail(scenario==='scan-validation'?422:409,'Mã quét không khớp công việc.');
  if(scenario==='lost-confirmation'&&confirmationCount===1){lastConfirmation=body;throw new TypeError('Synthetic lost reply');}
  if(lastConfirmation!==null&&JSON.stringify(body)!==JSON.stringify(lastConfirmation))return fail(409,'Lần thử lại đã đổi thao tác.');
  task={...task,status:'COMPLETED',confirmedQty:10,version:body.expectedVersion+1};
  return ok({taskId:task.id,version:task.version,status:task.status,confirmedQty:task.confirmedQty,assigneeId:workerId});
 }
 if(p.endsWith('/warehouses')){
  if(scenario==='revoked')return fail(403,'Đã thu hồi phân công kho.');
  if(scenario==='paginated'&&!url.searchParams.has('cursor'))return ok([{...warehouse,id:uuid(20),code:'WH-TEST-OTHER'}],{limit:50,hasNext:true,nextCursor:uuid(20)});
  return ok([warehouse],{limit:50,hasNext:false,nextCursor:null});
 }
 if(p.endsWith('/putaway/waiting'))return ok({items:ready?[]:[waiting],nextCursor:null});
 if(p.endsWith('/putaway/staff'))return ok([{id:workerId,fullName:'Nhân viên kho kiểm thử'}]);
 if(p.endsWith('/putaway'))return ok({items:ready?[task]:[],moreTasks:false,nextCursor:null});
 if(p.endsWith('/relocation'))return ok({items:[],nextCursor:null});
 if(p.endsWith('/zones')){
  if(method==='POST'){const body=JSON.parse(init.body);const zone={...body,id:uuid(21),warehouseId,updatedAt:stamp};zones.push(zone);return ok(zone);}
  return ok(zones,page);
 }
 if(p.endsWith('/bins'))return ok(bins.filter(b=>b.zoneId===url.searchParams.get('zoneId')),page);
 if(p.includes('/bins/')&&method==='PATCH'){
  const body=JSON.parse(init.body);bins=bins.map(b=>({...b,...body,version:b.version+1}));
  ready=Number(bins[0].maxWeightG)>=50000&&Number(bins[0].maxVolumeM3)>=8.64;
  return ok(bins[0]);
 }
 if(p.endsWith('/bin-options'))return ok({taskId:task.id,version:task.version,items:[],moreBins:false});
 if(p.endsWith('/bin-overrides'))return ok([]);
 if(p.endsWith('/assignment')&&method==='POST'){
  const body=JSON.parse(init.body);
  if(!ready||body.expectedVersion!==task.version||body.assigneeId!==workerId)return fail(409,'Dữ liệu phân công đã đổi.');
  task={...task,status:'ASSIGNED',assigneeId:workerId,version:task.version+1};
  return ok({taskId:task.id,version:task.version,status:task.status,confirmedQty:0,assigneeId:task.assigneeId});
 }
 return fail(403,'Local fixture: endpoint not enabled');
};
createRoot(document.getElementById('root')).render(createElement(NextIntlClientProvider,{locale:'vi',timeZone:'Asia/Ho_Chi_Minh',messages},createElement(PutawayWorkspace,{warehouse:{id:warehouseId,code:warehouse.code,name:warehouse.name},onNavigationLockChange:locked=>{document.querySelector('aside').dataset.locked=String(locked)}})));
</script></body></html>`;
const server = await createServer({
  root,
  configFile: false,
  envFile: false,
  resolve: { alias: { '@': `${root}/src`, '@messages': `${root}/messages` } },
  plugins: [
    react(),
    {
      name: 'putaway-local-workflow',
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.headers.accept?.includes('text/html')) {
            res.setHeader('Content-Type', 'text/html');
            res.end(await vite.transformIndexHtml(req.url, html));
          } else next();
        });
      },
    },
  ],
  server: { host: '127.0.0.1', port: 24374, strictPort: true },
});
await server.listen();
console.log('Putaway workflow fixture: http://127.0.0.1:24374/');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
