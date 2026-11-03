// Real React/Three.js UI with labelled synthetic HTTP fixtures only. No .env or shared DB.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ORCA · Warehouse 3D acceptance</title></head>
<body><aside style="padding:8px"><strong>SS-1057 · Synthetic local acceptance data</strong>
<form><label>Role <select name="role"><option>WAREHOUSE_MANAGER</option><option>ORCA_ADMIN</option></select></label>
<label>Scenario <select name="scenario"><option>ready</option><option>lost</option><option>stale</option><option>empty</option><option>error</option><option>large</option><option>unplaced</option></select></label><button>Load fixture</button></form>
<output aria-label="Fixture save evidence">No saves</output></aside><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { WarehouseLayoutPanel } from '/src/features/catalog/components/WarehouseLayoutPanel.tsx';
import { useAuthStore } from '/src/stores/authStore.ts';
import messages from '/messages/vi.json';
import '/src/styles/globals.css';
import '/node_modules/@fontsource/archivo/400.css';
import '/node_modules/@fontsource/archivo/600.css';
const query=new URLSearchParams(location.search),role=query.get('role')||'WAREHOUSE_MANAGER',scenario=query.get('scenario')||'ready';
document.querySelector('[name=role]').value=role;document.querySelector('[name=scenario]').value=scenario;
const uuid=(n)=>'10570000-0000-4000-8000-'+String(n).padStart(12,'0'),stamp='2026-10-21T02:00:00Z';
const warehouse={id:uuid(1),tenantId:null,code:'HCM-01',name:'Kho demo ORCA',address:'Synthetic test street',provinceCode:'79',wardCode:'001',districtCode:null,latitude:0,longitude:0,dailyCapacity:100,priority:1,status:'ACTIVE',contactName:null,contactPhone:null,contactEmail:null,createdAt:stamp,updatedAt:stamp,version:1,region:'SOUTH',timeZone:'Asia/Ho_Chi_Minh',cutoffMinute:840,operatingStartMinute:480,operatingEndMinute:1080};
const zones=scenario==='empty'?[]:['RECEIVING','STORAGE','PACKING','QUARANTINE'].map((zoneType,i)=>({id:uuid(10+i),warehouseId:warehouse.id,code:['RCV','STORE-A','PACK','QC'][i],zoneType,isActive:true,updatedAt:stamp}));
const bins=zones.flatMap((zone,i)=>Array.from({length:scenario==='large'?250:[6,24,6,4][i]},(_,j)=>({id:uuid(1000+i*300+j),warehouseId:warehouse.id,zoneId:zone.id,code:zone.code+'-'+String(j+1).padStart(3,'0'),barcode:zone.code+'-'+String(j+1).padStart(3,'0'),maxWeightG:'100000',maxVolumeM3:'1.5',isActive:j!==3,version:1})));
const user={userId:uuid(2),tenantId:null,actorScope:'PLATFORM',roles:[role],permissions:[],warehouseIds:[warehouse.id],email:'synthetic@example.test',fullName:'Synthetic 3D reviewer'};
useAuthStore.getState().setSession({accessToken:'synthetic-layout-acceptance',expiresIn:900,user});
let saved=scenario==='unplaced'?{revision:1,savedAt:stamp,plan:{schemaVersion:1,width:32,depth:32,zones:[{zoneId:zones[0].id,x:2,z:2,width:8,depth:8}],bins:[{binId:bins[0].id,x:1,z:1}]}}:{revision:0,plan:null,savedAt:null},lost=false,calls=0;
const ok=(data,pagination)=>Response.json({success:true,data,meta:{timestamp:stamp,requestId:'synthetic-only',...(pagination?{pagination}:{})}});
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.origin),p=url.pathname;
 if(scenario==='error')return Response.json({error:{code:'TEST.UNAVAILABLE',message:'Synthetic service unavailable'}},{status:503});
 if(p.endsWith('/visual-layout')){
  if(init.method==='POST'){
   const command=JSON.parse(init.body);calls++;
   if(scenario==='stale')return Response.json({error:{code:'WAREHOUSE.LAYOUT_STALE',message:'Synthetic concurrent editor'}},{status:409});
   if(saved.revision===command.expectedRevision)saved={revision:saved.revision+1,plan:command.plan,savedAt:new Date().toISOString()};
   document.querySelector('output').textContent='Save calls: '+calls+'; stored revisions: '+saved.revision+'; stock writes: 0';
   if(scenario==='lost'&&!lost){lost=true;throw new TypeError('Synthetic committed response lost');}
  }
  return ok(saved);
 }
 const items=p.endsWith('/zones')?zones:p.endsWith('/bins')?bins.filter(b=>b.zoneId===url.searchParams.get('zoneId')&&(!url.searchParams.get('search')||b.code.includes(url.searchParams.get('search')))):[];
 const start=url.searchParams.has('cursor')?items.findIndex(i=>i.id===url.searchParams.get('cursor'))+1:0;
 const page=items.slice(start,start+100),hasNext=start+100<items.length;
 return ok(page,{limit:100,hasNext,nextCursor:hasNext?page.at(-1).id:null});
};
createRoot(document.getElementById('root')).render(React.createElement(NextIntlClientProvider,{locale:'vi',messages},React.createElement(WarehouseLayoutPanel,{warehouse})));
</script></body></html>`;
const server = await createServer({ root, configFile: false, envFile: false, cacheDir: 'node_modules/.vite-visual-preview', resolve: { alias: { '@': root + '/src', '@messages': root + '/messages' } }, optimizeDeps: { include: ['react', 'react-dom/client', 'next-intl'] }, plugins: [react(), { name: 'warehouse-visual-fixture', configureServer(vite) { vite.middlewares.use(async (req, res, next) => { if (req.headers.accept?.includes('text/html')) { res.setHeader('Content-Type','text/html'); res.end(await vite.transformIndexHtml(req.url, html)); } else next(); }); } }], server: { host: '127.0.0.1', port: 24357, strictPort: true } });
await server.listen(); console.log('Warehouse 3D fixture http://127.0.0.1:24357/');
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
