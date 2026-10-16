import assert from 'node:assert/strict';
import { after,before,test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server,api,schemas,auth,policy;
const originalFetch=globalThis.fetch;
const id='00000000-0000-4000-8000-000000000001',warehouse='00000000-0000-4000-8000-000000000002',bin='00000000-0000-4000-8000-000000000003',zone='00000000-0000-4000-8000-000000000004';
const input={operationKey:id,expectedVersion:5,binId:bin};
const result={receivingRecordId:id,receiptId:id,recognizedQty:7,items:[{stockId:warehouse,binId:bin,quantity:7}]};
const load={unitWeightG:100,lengthCm:'10',widthCm:'10',heightCm:'10',unitVolumeM3:'0.001000',primaryQty:7,quarantineQty:0,primaryRequiresQuarantine:false};
const capacity={maxWeightG:'1000',maxVolumeM3:'1.000000',availableWeightG:'1000',availableVolumeM3:'1.000000',primaryBlocker:null,quarantineBlocker:'ZONE'};
const state={load,receivingRecordId:id,receiptId:id,recognizedQty:0,items:[],receiptVersion:5,qcState:'APPROVED',receivedQty:7,acceptedQty:7,quarantinedQty:0,rejectedQty:0,canPost:true,moreBins:false,zones:[{id:zone,code:'RECV-A',zoneType:'RECEIVING'}],bins:[{...capacity,id:bin,code:'RECV-01',zoneId:zone,zoneType:'RECEIVING'}]};
const ok=data=>Response.json({success:true,data,meta:{}});
before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  schemas = await server.ssrLoadModule('/src/features/inbound/api/receiptStockApi.ts');
  api = schemas.receiptStockApi;
  ({ useAuthStore: auth } = await server.ssrLoadModule('/src/stores/authStore.ts'));
  policy = await server.ssrLoadModule('/src/lib/accessPolicy.ts');
  auth.getState().setSession({
    accessToken: 'synthetic-discrepancy-token',
    expiresIn: 900,
    user: {
      userId: id,
      tenantId: null,
      email: 'staff@example.test',
      fullName: 'Test Staff',
      actorScope: 'PLATFORM',
      roles: ['WAREHOUSE_STAFF'],
      permissions: [],
    },
  });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test('reads only physical evidence and scoped receiving/quarantine choices',async()=>{globalThis.fetch=async(url,opts)=>{assert.equal(new URL(url,'https://example.test').pathname,`/api/v1/warehouses/${warehouse}/asns/${id}/receiving/records/${id}/stock`);assert.ok(opts.signal);return ok(state);};assert.deepEqual(await api.get(warehouse,id,id,id,new AbortController().signal),state);});
test('posts only operation/revision/bin references and validates actual quantity',async()=>{globalThis.fetch=async(url,opts)=>{assert.equal(opts.method,'POST');assert.deepEqual(JSON.parse(opts.body),input);return ok(result);};assert.deepEqual(await api.post(warehouse,id,id,id,7,input),result);});
test('reuses exact payload after a lost committed response',async()=>{const commands=[];globalThis.fetch=async(url,opts)=>{commands.push(JSON.parse(opts.body));if(commands.length===1)throw new TypeError('Synthetic lost reply');return ok(result);};await assert.rejects(api.post(warehouse,id,id,id,7,input));assert.deepEqual(await api.post(warehouse,id,id,id,7,input),result);assert.deepEqual(commands,[input,input]);});
for(const [name,changes]of Object.entries({record:{receivingRecordId:warehouse},receipt:{receiptId:warehouse},private:{tenantId:id},partition:{receivedQty:8},quantity:{recognizedQty:8},effects:{items:result.items},duplicateBins:{bins:[state.bins[0],state.bins[0]]},wrongZone:{bins:[{...state.bins[0],zoneType:'STORAGE'}]},eligibility:{acceptedQty:0,rejectedQty:7}}))test(`rejects ${name} receiving state`,async()=>{globalThis.fetch=async()=>ok({...state,...changes});await assert.rejects(api.get(warehouse,id,id,id));});
for(const[name,changes]of Object.entries({record:{receivingRecordId:warehouse},receipt:{receiptId:warehouse},quantity:{recognizedQty:8},bin:{items:[{...result.items[0],binId:warehouse}]},privacy:{actorId:id},ledger:{items:[{...result.items[0],onHandAfter:7}]},duplicate:{items:[result.items[0],result.items[0]],recognizedQty:14},zero:{recognizedQty:0,items:[]}}))test(`rejects mismatched ${name} post result`,async()=>{globalThis.fetch=async()=>ok({...result,...changes});await assert.rejects(api.post(warehouse,id,id,id,7,input));});
test('rejects forged quantities, malformed IDs, stale version format and repeated bins',()=>{for(const changes of[{acceptedQty:7},{expectedVersion:0},{expectedVersion:'5'},{binId:'bad'},{quarantineBinId:bin},{operationKey:'bad'},{tenantId:id}])assert.equal(schemas.receiptStockInputSchema.safeParse({...input,...changes}).success,false);});
test('permits split receiving/quarantine physical effects and excludes rejected units',()=>{const second={stockId:bin,binId:warehouse,quantity:2};assert.equal(schemas.receiptStockResultSchema.safeParse({...result,recognizedQty:7,items:[{...result.items[0],quantity:5},second]}).success,true);assert.equal(schemas.receiptStockStateSchema.safeParse({...state,load:{...load,primaryQty:5,quarantineQty:1},acceptedQty:5,quarantinedQty:1,rejectedQty:1,canPost:false,recognizedQty:6,items:[{...result.items[0],quantity:6}]}).success,true);});
test('only pure-platform Staff receives the physical stock capability',()=>{for(const role of['WAREHOUSE_STAFF','WAREHOUSE_MANAGER','ORCA_ADMIN','OPS_DISPATCHER','ORCA_ACCOUNTANT','SELLER_OWNER','SELLER_STAFF'])assert.equal(policy.can(policy.getEffectiveRoles([role],role.startsWith('SELLER')?'TENANT':'PLATFORM'),'warehouse.asn.postStock'),role==='WAREHOUSE_STAFF');assert.equal(policy.can(policy.getEffectiveRoles(['WAREHOUSE_STAFF','SELLER_OWNER'],'PLATFORM'),'warehouse.asn.postStock'),false);});

test('reads pending count evidence without inventing a full QC partition',()=>{assert.equal(schemas.receiptStockStateSchema.safeParse({...state,load:{...load,primaryQty:0},qcState:'PENDING',acceptedQty:0,canPost:false}).success,true);assert.equal(schemas.receiptStockStateSchema.safeParse({...state,qcState:'PENDING'}).success,false);});

test('encodes a scanned location search without changing scope',async()=>{globalThis.fetch=async(url)=>{assert.equal(new URL(url,'https://example.test').searchParams.get('binSearch'),'RECV-%_01');return ok(state);};assert.deepEqual(await api.get(warehouse,id,id,id,undefined,'RECV-%_01'),state);});

test('validates physical measurements and exact remaining bin capacity without exposing occupancy owners',()=>{
  for(const changes of [
    {load:{...load,unitWeightG:0}},
    {load:{...load,widthCm:'-1'}},
    {load:{...load,unitVolumeM3:'NaN'}},
    {load:{...load,primaryQty:8}},
    {load:{...load,declaredValue:'1000'}},
    {bins:[{...state.bins[0],availableWeightG:'1001'}]},
    {bins:[{...state.bins[0],availableVolumeM3:'1.000001'}]},
    {bins:[{...state.bins[0],sellerAllowed:true}]},
    {bins:[{...state.bins[0],primaryBlocker:'UNKNOWN'}]},
  ]) assert.equal(schemas.receiptStockStateSchema.safeParse({...state,...changes}).success,false);
  const large={...state.bins[0],maxWeightG:'9007199254740993',availableWeightG:'9007199254740994'};
  assert.equal(schemas.receiptStockStateSchema.safeParse({...state,bins:[large]}).success,false);
});
test('keeps insufficient bins visible with a typed blocker and accepts shelf-life quarantine partition',()=>{
  assert.equal(schemas.receiptStockStateSchema.safeParse({...state,bins:[{...state.bins[0],availableWeightG:'600',primaryBlocker:'WEIGHT'}]}).success,true);
  assert.equal(schemas.receiptStockStateSchema.safeParse({...state,load:{...load,primaryRequiresQuarantine:true}}).success,true);
});
