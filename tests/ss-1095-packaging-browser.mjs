// Local-only visual acceptance harness: real application and synthetic transport.
// No .env, external service, shared database, upload or stock/billing write.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><aside style="padding:8px;background:#e0f2fe"><strong>SS-1095 — local synthetic transport</strong>
<form><label>Role <select name="role"><option>WAREHOUSE_STAFF</option><option>WAREHOUSE_MANAGER</option></select></label>
<label>Scenario <select name="scenario"><option>ai-ready</option><option>ai-disabled</option><option>ai-quota</option><option>ai-lost</option><option>ai-accept-lost</option><option>ai-running</option><option>ready</option><option>approved</option><option>carton-lost</option><option>carton-conflict</option><option>returned</option><option>uncounted</option><option>expiry</option><option>derived-expiry</option><option>manufacture-only</option><option>untracked</option><option>blockers</option><option>waiting</option><option>multiple</option><option>empty</option><option>error</option><option>conflict</option><option>lost-reply</option></select></label><button>Review screen</button></form>
<output aria-label="Fixture command evidence">No commands</output></aside><div id="root"></div><script type="module">
import { useAuthStore } from '/src/stores/authStore.ts';
import { useLocaleStore } from '/src/stores/localeStore.ts';
useLocaleStore.getState().setLocale('vi');
const query=new URLSearchParams(location.search),role=query.get('role')||'WAREHOUSE_STAFF',scenario=query.get('scenario')||'ai-ready';
document.querySelector('[name=role]').value=role;document.querySelector('[name=scenario]').value=scenario;
const uuid=(n)=>'10710000-0000-4000-8000-'+String(n).padStart(12,'0');
const id=uuid(1),warehouse=uuid(2),line=uuid(3),record=uuid(4),inspection=uuid(5),receipt=uuid(6),report=uuid(7);
const trackExpiry=scenario.startsWith('ai-')||['expiry','derived-expiry'].includes(scenario),manufactureRequired=scenario==='manufacture-only',trackLot=scenario!=='untracked',shelfLifeDays=scenario==='derived-expiry'?100:null;
const approved=['approved','carton-lost','carton-conflict'].includes(scenario),asnCode=approved?'ASN-20261014-878000E2AF7240828773F745F91E56AE':'ASN-LOCAL-01';
const stamp='2026-10-15T03:00:00.000Z';
const user={userId:uuid(9),tenantId:null,actorScope:'PLATFORM',roles:[role],permissions:[],warehouseIds:[warehouse,uuid(20)],email:'synthetic@example.test',fullName:'Synthetic '+role,phone:null,avatarUrl:null};
const session={user,accessToken:'synthetic-local-token',expiresIn:900};useAuthStore.getState().setSession(session);
let receivingRound=scenario==='returned'?2:1;
let version=approved||scenario==='returned'?5:4,asnStatus=scenario==='waiting'?'SUBMITTED':approved?'READY_FOR_PUTAWAY':'RECEIVING',receiptStatus=approved?'APPROVED':'RECEIVING';
let count=scenario.startsWith('ai-')?null:['returned','uncounted','waiting','expiry','derived-expiry','manufacture-only','untracked'].includes(scenario)?null:{id:uuid(8),receiptId:receipt,inboundLineId:line,receivedQty:7,receiptVersion:2,countedAt:stamp,lots:[{recordId:record,lotId:uuid(10),lotCode:'LOT-LOCAL-01',receivedQty:7,quarantinedQty:0,qcState:scenario==='blockers'?'PENDING':approved?'APPROVED':'REVIEW_REQUIRED',manufacturedOn:null,expiresOn:null,lotStatus:'SELLABLE'}]};
let qc=scenario==='blockers'||!count?null:{id:inspection,acceptedQty:7,quarantinedQty:0,rejectedQty:0,reasonCode:'NONE',reason:'',photoIds:[]};
let reports=qc&&!approved?[{id:report,inboundLineId:line,receivingRecordId:null,discrepancyType:'SHORT',qty:3,reason:'Thiếu 3 sản phẩm khi đếm thực tế',photoIds:[],receiptVersion:4,status:'OPEN',reportedAt:stamp}]:[];
let reviews=scenario==='returned'?[{id:uuid(30),receiptId:receipt,receivingRound:1,receiptVersion:5,decision:'RETURN',reason:'Kiểm lại kiện niêm phong và đếm lại toàn bộ hàng. Số đếm cũ cần xác minh.',inspectionIds:[],discrepancyIds:[report],reviewedAt:stamp,notificationState:'PENDING'}]:approved?[{receivingRound:1,id:uuid(30),receiptId:receipt,receiptVersion:5,decision:'APPROVE',reason:'Đã kiểm đủ số lượng, đúng mã hàng và lô, không có bất thường.',inspectionIds:[inspection],discrepancyIds:[],reviewedAt:stamp,notificationState:'PENDING'}]:[],calls=0,savedOperation=null,photos=[];
let cartonConfirmation=null,cartonCommands=[],aiCommands=[],aiAccepts=[],aiRequest=null,aiSuggestion=null,aiLost=false,acceptLost=false;
photos=scenario.startsWith('ai-')?[{id:uuid(40),receiptId:receipt,receivingRecordId:null,note:'Ảnh bao bì mẫu',contentType:'image/png',fileSizeBytes:100,createdAt:stamp,verifiedAt:stamp}]:[];
const ok=(data,pagination)=>Response.json({success:true,data,meta:{timestamp:stamp,requestId:'local-fixture',...(pagination?{pagination}:{})}});
const fail=(status,code,message)=>Response.json({success:false,error:{statusCode:status,code,message},meta:{}},{status});
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.origin),p=url.pathname,method=init.method||'GET';
 const page={limit:20,hasNext:false,nextCursor:null};
 if(p.endsWith('/auth/refresh'))return ok(session);if(p.endsWith('/auth/me'))return ok(user);
 if(p.endsWith('/warehouses'))return scenario==='error'?fail(503,'SERVICE.UNAVAILABLE','Không tải được danh sách kho. Hãy thử lại.'):ok(scenario==='empty'?[]:[{id:warehouse,code:'HN',name:'Kho Hà Nội'},...(scenario==='multiple'?[{id:uuid(20),code:'HCM',name:'Kho Hồ Chí Minh'}]:[])],page);
 if(p.endsWith('/asns'))return ok([{id,warehouseId:warehouse,asnCode,reinspectionRequired:receivingRound>1&&reviews.at(-1)?.decision==='RETURN',status:asnStatus,arrivedAt:scenario==='waiting'?null:stamp,expectedArrivalAt:'2026-10-16T02:00:00.000Z',receiptIds:scenario==='waiting'?[]:[receipt],version,lines:[{id:line,lineNo:1,sku:'SKU-LOCAL',productName:trackExpiry?'Hàng mẫu có hạn sử dụng':manufactureRequired?'Hàng mẫu yêu cầu NSX':'Hàng mẫu không có hạn sử dụng',receivedQty:count?.receivedQty??0}]}],page);
 if(p.endsWith('/receiving'))return ok({receiptId:receipt,cartonCount:20,version,receivingRound,lastReview:reviews.length?(({id,decision,reason,receiptVersion,reviewedAt})=>({id,decision,reason,receiptVersion,reviewedAt}))(reviews.at(-1)):null,status:receiptStatus,asnId:id,asnCode,asnStatus,lines:[{id:line,lineNo:1,sku:'SKU-LOCAL',productName:trackExpiry?'Hàng mẫu có hạn sử dụng':manufactureRequired?'Hàng mẫu yêu cầu NSX':'Hàng mẫu không có hạn sử dụng',declaredQty:10,trackLot,manufactureRequired,trackExpiry,shelfLifeDays,minInboundShelfLifePct:0,count}]});
 if(p.endsWith('/packaging-suggestions/availability'))return ok({enabled:scenario!=='ai-disabled',images:scenario==='ai-disabled'?[]:[{id:uuid(40),createdAt:stamp,note:'Ảnh bao bì mẫu'}]});
 if(p.endsWith('/packaging-suggestions')&&method==='POST'){
   const command=JSON.parse(init.body);aiCommands.push(command);
   if(!aiRequest){aiRequest=command;aiSuggestion={id:command.operationKey,receiptId:receipt,inboundLineId:line,evidenceId:command.evidenceId,receiptVersion:version,receivingRound,state:scenario==='ai-running'?'RUNNING':scenario==='ai-quota'?'FALLBACK':'READY',model:scenario==='ai-quota'||scenario==='ai-running'?null:'claude-synthetic-test',confidence:scenario==='ai-quota'||scenario==='ai-running'?null:0.81,lotText:scenario==='ai-quota'||scenario==='ai-running'?null:'LOT-PHOTO-01',expiryText:scenario==='ai-quota'||scenario==='ai-running'?null:'02/03/27',reason:scenario==='ai-quota'?'QUOTA_EXCEEDED':null,accepted:null};}
   document.querySelector('output').textContent='AI requests: '+aiCommands.length+'; distinct operations: '+new Set(aiCommands.map(x=>x.operationKey)).size+'; accepts: '+aiAccepts.length+'; physical count: '+Boolean(count);
   if(scenario==='ai-lost'&&!aiLost){aiLost=true;throw new TypeError('Synthetic lost inference response');}
   return ok({outcome:'SUGGESTION',suggestion:aiSuggestion});
 }
 if(p.includes('/packaging-suggestions/')&&p.endsWith('/accept')){
   const command=JSON.parse(init.body);aiAccepts.push(command);
   aiSuggestion={...aiSuggestion,state:'ACCEPTED',accepted:{lotCode:command.lotCode??null,manufacturedOn:command.manufacturedOn??null,expiresOn:command.expiresOn??null,requiresQuarantine:false}};
   document.querySelector('output').textContent='AI requests: '+aiCommands.length+'; distinct operations: '+new Set(aiCommands.map(x=>x.operationKey)).size+'; accepts: '+aiAccepts.length+'; physical count: '+Boolean(count);
   if(scenario==='ai-accept-lost'&&!acceptLost){acceptLost=true;throw new TypeError('Synthetic lost acceptance response');}
   return ok(aiSuggestion);
 }
 if(p.includes('/packaging-suggestions/'))return aiSuggestion?ok(aiSuggestion):fail(404,'INBOUND.PACKAGING_NOT_FOUND','Chưa lưu gợi ý');
 if(p.endsWith('/counts')&&method==='POST'){
  const command=JSON.parse(init.body);version++;
  document.querySelector('output').textContent='Count saved — dates submitted: '+command.lots.map(l=>JSON.stringify({manufacturedOn:l.manufacturedOn,expiresOn:l.expiresOn})).join(', ');
  const incomingLots=command.lots.length?command.lots:command.receivedQty?[{lotCode:'RCV-LOCAL',receivedQty:command.receivedQty}]:[];
  count={id:uuid(8),receiptId:receipt,inboundLineId:line,receivedQty:command.receivedQty,receiptVersion:version,countedAt:stamp,lots:incomingLots.map((lot,i)=>({recordId:uuid(40+i),lotId:uuid(50+i),lotCode:lot.lotCode,receivedQty:lot.receivedQty,quarantinedQty:0,qcState:'PENDING',manufacturedOn:lot.manufacturedOn??null,expiresOn:lot.expiresOn??null,lotStatus:'SELLABLE'}))};
  return ok(count);
 }
 if(p.endsWith('/cartons')){
  if(method==='POST'){
   const command=JSON.parse(init.body);cartonCommands.push(command);
   document.querySelector('output').textContent='Carton calls='+cartonCommands.length+'; same operation='+cartonCommands.every(c=>c.operationKey===cartonCommands[0].operationKey)+'; actual cartons='+command.actualCartonCount+'; declared cartons=20';
   if(scenario==='carton-conflict')return fail(409,'INBOUND.CARTONS_CONFLICT','Phiếu nhận đã thay đổi. Vui lòng tải lại.');
   cartonConfirmation??={id:uuid(80),reviewId:uuid(30),actualCartonCount:command.actualCartonCount,reason:command.reason,confirmedAt:stamp};
   if(scenario==='carton-lost'&&cartonCommands.length===1)throw new TypeError('Synthetic committed response lost');
   return ok(cartonConfirmation);
  }
  return ok({receiptId:receipt,receiptVersion:version,canConfirm:approved&&!cartonConfirmation,confirmation:cartonConfirmation});
 }
 if(p.endsWith('/reviews')){
  if(method==='POST'){
   const command=JSON.parse(init.body);calls++;
   document.querySelector('output').textContent='Review calls='+calls+'; same operation='+(savedOperation===null||savedOperation===command.operationKey)+'; decision='+command.decision;
   savedOperation=command.operationKey;
   if(scenario==='conflict')return fail(409,'INVENTORY.CONFLICT','Evidence changed');
   if(scenario==='lost-reply'&&calls===1)throw new TypeError('Synthetic lost response');
   version++;const item={receivingRound,id:uuid(30),receiptId:receipt,receiptVersion:version,decision:command.decision,reason:command.reason,inspectionIds:command.inspectionIds,discrepancyIds:command.discrepancyIds,reviewedAt:stamp,notificationState:'PENDING'};
   reviews.push(item);receiptStatus=command.decision==='APPROVE'?'APPROVED':'RECEIVING';asnStatus=command.decision==='APPROVE'?'READY_FOR_PUTAWAY':'RECEIVING';
   if(command.decision==='RETURN'){receivingRound++;count=null;qc=null;reports=[];photos=[];}else if(count?.lots[0])count.lots[0].qcState='APPROVED';return ok(item);
  }
  const ready=Boolean(qc&&count&&receiptStatus==='RECEIVING'&&(!reviews.length||reviews.at(-1).decision!=='RETURN'));
  const blockers=!count?[{code:'COUNT_REQUIRED',inboundLineId:line,receivingRecordId:null}]:!qc?[{code:'INSPECTION_REQUIRED',inboundLineId:line,receivingRecordId:record},{code:'DISCREPANCY_REPORT_REQUIRED',inboundLineId:line,receivingRecordId:null}]:[];
  return ok({receiptId:receipt,receivingRound,receiptVersion:version,asnId:id,asnStatus,status:receiptStatus,ready,canApprove:ready&&reports.length>0,unreportedDiscrepancies:count&&!reports.length&&!approved?1:0,blockers,inspectionIds:qc?[inspection]:[],discrepancyIds:reports.map(r=>r.id),records:count?[{receivingRecordId:record,lotCode:'LOT-LOCAL-01',receivedQty:count.receivedQty,qcState:count.lots[0].qcState,inspection:qc}]:[],items:reviews});
 }
 if(p.endsWith('/discrepancies'))return ok({receiptId:receipt,receiptVersion:version,asnId:id,asnStatus,ready:!approved&&Boolean(count&&qc),lines:[{inboundLineId:line,lineNo:1,declaredQty:null,variance:qc&&!approved?{discrepancyType:'SHORT',qty:3}:null,receivedQty:count?.receivedQty??null,exceptions:[]}],items:reports});
 if(p.endsWith('/inspections'))return ok({receivingRecordId:record,receivedQty:7,receiptVersion:version,qcState:count.lots[0].qcState,lastDecision:reviews.at(-1)?.decision??null,items:qc?[{...qc,receivingRecordId:record,inspectionVersion:1,receiptVersion:3,inspectedAt:stamp,status:'PROPOSED'}]:[]});
 if(p.endsWith('/evidence/presign')){
  const command=JSON.parse(init.body);
  const evidence={id:uuid(40),receivingRecordId:record,contentType:command.contentType,fileSizeBytes:command.fileSizeBytes,createdAt:stamp,verifiedAt:null};
  photos=[evidence];
  return ok({evidence,upload:{method:'PUT',uploadUrl:location.origin+'/synthetic-photo',expiresInSeconds:60,headers:{'Content-Type':command.contentType,'x-amz-checksum-sha256':btoa(String.fromCharCode(...command.sha256.match(/.{2}/g).map(n=>parseInt(n,16))))}}});
 }
 if(p==='/synthetic-photo'&&method==='PUT')return new Response(null,{status:200});
 if(p.endsWith('/confirm')){photos[0].verifiedAt=stamp;return ok(photos[0]);}
 if(p.endsWith('/evidence'))return ok({items:photos});
 if(p.endsWith('/stock'))return ok({receivingRecordId:record,receiptId:receipt,receiptVersion:version,recognizedQty:0,items:[],receivedQty:7,qcState:count.lots[0].qcState,acceptedQty:qc?.acceptedQty??0,quarantinedQty:0,rejectedQty:0,canPost:false,moreBins:false,bins:[]});
 return fail(403,'AUTH.FORBIDDEN','Local fixture: endpoint not enabled');
};
history.replaceState(null,'',(scenario==='waiting'?'/warehouse/inbound':'/warehouse/receiving')+'?'+query.toString());
await import('/src/main.tsx');
</script></body></html>`;
const server = await createServer({
  root,
  configFile: false,
  cacheDir: 'node_modules/.vite-receiving-preview',
  envFile: false,
  resolve: { alias: { '@': `${root}/src`, '@messages': `${root}/messages` } },
  plugins: [
    react(),
    {
      name: 'ss1095-packaging-fixture',
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
  server: { host: '127.0.0.1', port: 24395, strictPort: true },
});
await server.listen();
console.log('SS-1095 UI fixture http://127.0.0.1:24395/');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
