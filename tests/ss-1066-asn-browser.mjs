// Actual app with synthetic local transport. No .env, shared DB or provider calls.
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><aside style="padding:8px;background:#e0f2fe"><strong>SS-1066 — synthetic local transport</strong>
<form><label>Role <select name="role"><option>SELLER_OWNER</option><option>SELLER_STAFF</option><option>ORCA_ADMIN</option></select></label>
<label>Scenario <select name="scenario"><option>valid</option><option>bad-sku</option><option>bad-quantity</option><option>bad-expiry</option><option>bad-total</option><option>empty</option><option>expired</option><option>error</option></select></label><button>Review screen</button></form>
<output aria-label="Fixture command evidence">No commands</output></aside><div id="root"></div><script type="module">
import { useAuthStore } from '/src/stores/authStore.ts';
import { useLocaleStore } from '/src/stores/localeStore.ts';
const query=new URLSearchParams(location.search),role=query.get('role')||'SELLER_OWNER',scenario=query.get('scenario')||'valid';
document.querySelector('[name=role]').value=role;document.querySelector('[name=scenario]').value=scenario;
useLocaleStore.getState().setLocale('vi');
const uuid=n=>'10660000-0000-4000-8000-'+String(n).padStart(12,'0'),stamp='2026-10-23T03:00:00.000Z';
const user={userId:uuid(1),tenantId:role==='ORCA_ADMIN'?null:uuid(2),actorScope:role==='ORCA_ADMIN'?'PLATFORM':'TENANT',roles:[role],permissions:[],warehouseIds:[],serviceStatus:'ACTIVE',email:'synthetic@example.test',fullName:'Synthetic '+role,phone:null,avatarUrl:null};
const session={user,accessToken:'synthetic-local-token',expiresIn:900};useAuthStore.getState().setSession(session);
const warehouse=(n,code,name)=>({id:uuid(n),tenantId:null,region:'NORTH',timeZone:'Asia/Ho_Chi_Minh',cutoffMinute:1020,operatingStartMinute:480,operatingEndMinute:1080,version:1,code,name,address:'Synthetic address',provinceCode:'01',districtCode:null,wardCode:'00001',latitude:21,longitude:105,dailyCapacity:1000,priority:1,status:'ACTIVE',contactName:null,contactPhone:null,contactEmail:null,createdAt:stamp,updatedAt:stamp});
const warehouses=[warehouse(10,'WH-HN','Kho Hà Nội'),warehouse(11,'WH-HCM','Kho Hồ Chí Minh')];
const products=[{id:uuid(20),sku:'SKU-CAFE',name:'Cà phê mẫu',trackLot:true,trackExpiry:true},{id:uuid(21),sku:'SKU-BOX',name:'Hộp mẫu',trackLot:false,trackExpiry:false}];
let items=[],commands=[];
const ok=(data,pagination)=>Response.json({success:true,data,meta:{timestamp:stamp,requestId:'local-fixture',...(pagination?{pagination}:{})}});
const fail=(status,code,message)=>Response.json({success:false,error:{statusCode:status,code,message},meta:{}},{status});
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.origin),p=url.pathname,method=init.method||'GET',page={limit:100,hasNext:false,nextCursor:null};
 if(p.endsWith('/auth/refresh'))return ok(session);if(p.endsWith('/auth/me'))return ok(user);
 if(p.endsWith('/asns/sku-options'))return ok(products,page);
 if(p.endsWith('/warehouses'))return ok(warehouses,page);
 if(p.endsWith('/asns/allocation-suggestion')){
  if(scenario==='error')return fail(503,'INVENTORY.UNAVAILABLE','Không tải được gợi ý. Hãy thử lại.');
  const quantity=Number(url.searchParams.get('totalQuantity')),productId=url.searchParams.get('productId'),expiry=url.searchParams.get('declaredExpiryOn');
  const expired=scenario==='expired',empty=scenario==='empty',first=Math.floor(quantity*.6),remaining=expired||empty?quantity:0;
  const result={productId,sku:'SKU-CAFE',productName:'Cà phê mẫu',totalQuantity:quantity,declaredExpiryOn:expiry,daysUntilExpiry:expiry?(expired?0:30):null,hasSufficientHistory:true,basis:'HISTORICAL_VELOCITY_30D',warnings:remaining?['UNALLOCATED_EXPIRY_CAPACITY']:[],unallocatedQuantity:remaining,allocations:empty?[]:warehouses.map((w,i)=>({warehouseId:w.id,warehouseCode:w.code,warehouseName:w.name,region:w.region,dailyVelocity:10,sharePercent:i?40:60,suggestedQty:expired?0:i?quantity-first:first,cappedByExpiry:expired,maxSellableBeforeExpiry:expiry?(expired?0:quantity):null,redistributedQty:0}))};
  if(scenario==='bad-sku')result.productId=uuid(21);
  if(scenario==='bad-quantity'){result.totalQuantity++;result.unallocatedQuantity++;}
  if(scenario==='bad-expiry')result.declaredExpiryOn='2027-01-01';
  if(scenario==='bad-total')result.unallocatedQuantity++;
  return ok(result);
 }
 if(p.endsWith('/asns')){
  if(method==='GET')return ok(items,page);
  const command=JSON.parse(init.body);commands.push(command);document.querySelector('output').textContent='Created drafts='+commands.length+'; warehouse='+command.warehouseId+'; quantities='+command.lines.map(l=>l.declaredQty).join(',');
  const asn={id:uuid(30+items.length),tenantId:user.tenantId,warehouseId:command.warehouseId,asnCode:'ASN-LOCAL-'+(items.length+1),externalReference:command.externalReference||null,status:'DRAFT',expectedArrivalAt:command.expectedArrivalAt||null,arrivedAt:null,submittedAt:null,cartonLabelRefs:[],cartonCount:command.cartonCount,cancellationReason:null,cancelledAt:null,receiptIds:[],discrepancyIds:[],createdByUserId:user.userId,version:1,createdAt:stamp,updatedAt:stamp,lines:command.lines.map((line,i)=>({...line,id:uuid(50+i),lineNo:i+1,sku:products.find(p=>p.id===line.productId).sku,productName:products.find(p=>p.id===line.productId).name,receivedQty:0,acceptedQty:0,quarantinedQty:0,rejectedQty:0,declaredLotCode:line.declaredLotCode||null,declaredExpiryOn:line.declaredExpiryOn?line.declaredExpiryOn+'T00:00:00.000Z':null}))};
  items.push(asn);return ok(asn);
 }
 const asn=items.find(a=>p.includes('/asns/'+a.id));
 if(asn){
  if(method==='POST'){const command=JSON.parse(init.body);asn.version++;if(p.endsWith('/submit')){asn.status='SUBMITTED';asn.submittedAt=stamp;asn.cartonLabelRefs=['ASN-LOCAL-CARTON-1'];}else if(p.endsWith('/cancel')){asn.status='CANCELLED';asn.cancellationReason=command.reason;asn.cancelledAt=stamp;}}
  return ok(asn);
 }
 return fail(403,'AUTH.FORBIDDEN','Local fixture: endpoint not enabled');
};
history.replaceState(null,'','/asns?'+query.toString());
await import('/src/main.tsx');
</script></body></html>`;

const server = await createServer({
  root,
  configFile: false,
  cacheDir: '/private/tmp/orca-ss1066-vite-cache',
  envFile: false,
  resolve: { alias: { '@': `${root}/src`, '@messages': `${root}/messages` } },
  plugins: [
    react(),
    {
      name: 'ss1066-asn-fixture',
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
  server: { host: '127.0.0.1', port: 24366, strictPort: true },
});
await server.listen();
console.log('SS-1066 actual-app UI fixture http://127.0.0.1:24366/');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
