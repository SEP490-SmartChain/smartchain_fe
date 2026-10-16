// Local visual fixture: actual application, synthetic transport, no .env or external writes.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><aside style="padding:8px;background:#e0f2fe"><strong>Warehouse UI — local synthetic transport</strong>
<form><label>Role <select name="role"><option>WAREHOUSE_MANAGER</option><option>ORCA_ADMIN</option><option>OPS_DISPATCHER</option></select></label>
<label>Scenario <select name="scenario"><option>empty-bins</option><option>populated</option><option>blocked</option><option>capacity</option><option>after-cutoff</option><option>paginated</option><option>error</option></select></label><button>Review screen</button></form>
<output aria-label="Fixture commands">No commands</output></aside><div id="root"></div><script type="module">
import { useAuthStore } from '/src/stores/authStore.ts';
import { useLocaleStore } from '/src/stores/localeStore.ts';
useLocaleStore.getState().setLocale('vi');
const query=new URLSearchParams(location.search),role=query.get('role')||'WAREHOUSE_MANAGER',scenario=query.get('scenario')||'empty-bins';
document.querySelector('[name=role]').value=role;document.querySelector('[name=scenario]').value=scenario;
const uuid=(n)=>'10250000-0000-4000-8000-'+String(n).padStart(12,'0');
const id=uuid(1),zoneId=uuid(2),stamp='2026-10-15T03:00:00.000Z';
const user={userId:uuid(9),tenantId:null,actorScope:'PLATFORM',roles:[role],permissions:[],warehouseIds:[id,uuid(40),uuid(41),uuid(42)],email:'synthetic@example.test',fullName:'ORCA '+role,phone:null,avatarUrl:null};
const session={user,accessToken:'synthetic-local-token',expiresIn:900};useAuthStore.getState().setSession(session);
let warehouse={id,tenantId:null,region:'CENTRAL',timeZone:'Asia/Ho_Chi_Minh',cutoffMinute:840,operatingStartMinute:480,operatingEndMinute:1080,version:1,code:'WH-DN-01',name:'Kho Đà Nẵng',address:'128 Nguyễn Văn Linh, phường Hải Châu, Đà Nẵng',provinceCode:'48',districtCode:null,wardCode:'20194',latitude:16.012636,longitude:108.192912,dailyCapacity:100,priority:1,status:'ACTIVE',contactName:'Nguyễn Minh Tài',contactPhone:'0900000000',contactEmail:'warehouse@example.test',createdAt:stamp,updatedAt:stamp};
let workingDays=[1,2,3,4,5,6],closedDates=['2026-12-25'];
let zones=[{id:zoneId,warehouseId:id,code:'KE-A01',zoneType:'STORAGE',isActive:true,updatedAt:stamp},{id:uuid(3),warehouseId:id,code:'NHAN-HANG',zoneType:'RECEIVING',isActive:true,updatedAt:stamp}];
let bins=scenario==='populated'?[{id:uuid(4),warehouseId:id,zoneId,code:'DN-A-01-01-01',barcode:'DN-A-01-01-01',maxWeightG:'100000',maxVolumeM3:'2.500',isActive:true,version:1},{id:uuid(5),warehouseId:id,zoneId,code:'DN-A-01-01-02',barcode:'DN-A-01-01-02',maxWeightG:'100000',maxVolumeM3:'2.500',isActive:false,version:1}]:[];
let downtime=[];
const page={limit:100,hasNext:false,nextCursor:null};
const ok=(data,pagination)=>Response.json({success:true,data,meta:{timestamp:stamp,requestId:'local-fixture',...(pagination?{pagination}:{})}});
const fail=(status,message)=>Response.json({success:false,error:{statusCode:status,code:'LOCAL.FIXTURE',message},meta:{}},{status});
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.origin),p=url.pathname,method=init.method||'GET';
 if(p.endsWith('/auth/refresh'))return ok(session);if(p.endsWith('/auth/me'))return ok(user);
 if(method!=='GET')document.querySelector('output').textContent=method+' '+p+' — synthetic only';
 if(p.endsWith('/warehouses')){
  const directory=[warehouse,{...warehouse,id:uuid(40),code:'WH-HN-02',name:'Kho Hà Nội',region:'NORTH',address:'18 Phạm Hùng, Hà Nội',dailyCapacity:500},{...warehouse,id:uuid(41),code:'WH-HCM-03',name:'Kho Hồ Chí Minh',region:'SOUTH',address:'35 Nguyễn Hữu Cảnh, Hồ Chí Minh',dailyCapacity:300},{...warehouse,id:uuid(42),code:'WH-HUE-04',name:'Kho Huế',address:'42 Lê Lợi, Huế',status:'INACTIVE'}];
  const search=(url.searchParams.get('search')||'').toLowerCase(),status=url.searchParams.get('status');
  const filtered=directory.filter(w=>(!search||(w.code+' '+w.name).toLowerCase().includes(search))&&(!status||w.status===status));
  const offset=url.searchParams.get('cursor')==='page-2'?2:0;
  if(scenario==='paginated')return ok(filtered.slice(offset,offset+2),{limit:2,hasNext:offset===0&&filtered.length>2,nextCursor:offset===0&&filtered.length>2?'page-2':null});
  return ok(filtered,page);
 }
 if(p.endsWith('/zones')){
  if(scenario==='error')return fail(503,'Không tải được khu trong kho. Hãy thử lại.');
  if(method==='POST'){const body=JSON.parse(init.body);const item={...body,id:uuid(20),warehouseId:id,updatedAt:stamp};zones.push(item);return ok(item);}
  return ok(zones,page);
 }
 if(p.endsWith('/bins')){
  if(method==='POST'){const body=JSON.parse(init.body);const item={...body,id:uuid(21),warehouseId:id,barcode:body.code,isActive:true,version:1};bins.push(item);return ok(item);}
  const search=(url.searchParams.get('search')||'').toLowerCase();
  return ok(bins.filter(b=>b.zoneId===url.searchParams.get('zoneId')&&(!search||b.code.toLowerCase().includes(search)||b.barcode.toLowerCase().includes(search))),page);
 }
 if(p.endsWith('/calendar')){
  if(method==='PATCH'){const body=JSON.parse(init.body);workingDays=body.workingDays;closedDates=body.closedDates;warehouse={...warehouse,version:warehouse.version+1};}
  const checkedAt=url.searchParams.get('at')||(scenario==='blocked'?'2026-10-15T13:00:00.000Z':scenario==='after-cutoff'?'2026-10-15T08:00:00.000Z':stamp);
  const localStamp=new Date(new Date(checkedAt).getTime()+7*60*60*1000).toISOString();
  const localDate=localStamp.slice(0,10),localMinute=Number(localStamp.slice(11,13))*60+Number(localStamp.slice(14,16));
  const closed=!workingDays.includes(new Date(localStamp).getUTCDay()||7)||closedDates.includes(localDate);
  const blocked=closed||localMinute<480||localMinute>=1080,full=scenario==='capacity',afterCutoff=localMinute>=840;
  const reasons=[...(closed?['CLOSED_DAY']:[]),...(localMinute<480||localMinute>=1080?['OUTSIDE_HOURS']:[]),...(full?['CAPACITY_REACHED']:[]),...(afterCutoff?['AFTER_CUTOFF']:[])];
  return ok({warehouseId:id,version:warehouse.version,workingDays,closedDates,timeZone:warehouse.timeZone,operatingStartMinute:480,operatingEndMinute:1080,cutoffMinute:840,dailyCapacity:100,capacityUsed:full?100:36,capacityRemaining:full?0:64,checkedAt,localDate,localMinute,intakeEligible:!blocked,allocationEligible:!blocked&&!full,sameDayHandoverEligible:!blocked&&!full&&!afterCutoff,reasons});
 }
 if(p.endsWith('/outstanding'))return ok({stockUnits:240,openTasks:12,openWaves:3});
 if(p.endsWith('/downtime')){
  if(method==='POST'){const body=JSON.parse(init.body);const item={...body,id:uuid(30),warehouseId:id};downtime.push(item);warehouse={...warehouse,version:warehouse.version+1};return ok(item);}
  return ok(downtime);
 }
 return fail(403,'Local fixture: endpoint not enabled');
};
history.replaceState(null,'','/admin/warehouses?'+query.toString());
await import('/src/main.tsx');
</script></body></html>`;
const server = await createServer({
  root,
  configFile: false,
  envFile: false,
  resolve: { alias: { '@': `${root}/src`, '@messages': `${root}/messages` } },
  plugins: [
    react(),
    {
      name: 'warehouse-ui-local-fixture',
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
  server: { host: '127.0.0.1', port: 24372, strictPort: true },
});
await server.listen();
console.log('Warehouse UI fixture http://127.0.0.1:24372/');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
