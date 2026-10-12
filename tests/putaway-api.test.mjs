import assert from 'node:assert/strict';
import { after,before,test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server,api,schemas,auth,policy;
const originalFetch=globalThis.fetch;
const id='00000000-0000-4000-8000-000000000001',warehouse='00000000-0000-4000-8000-000000000002',bin='00000000-0000-4000-8000-000000000003';
const input={operationKey:id,expectedVersion:2,fromBinScan:'RC-01',toBinScan:'ST-01',skuScan:'SKU-01',lotScan:'LOT-01',qty:7};
const task={id,version:2,status:'ASSIGNED',qty:7,confirmedQty:0,assigneeId:id,fromBinCode:'RC-01',toBinCode:'ST-01',sku:'SKU-01',productName:'Test product',lotCode:'LOT-01'};
const result={taskId:id,version:3,status:'COMPLETED',confirmedQty:7,assigneeId:id};
const state={items:[task],moreTasks:false,nextCursor:null};
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
  schemas = await server.ssrLoadModule('/src/features/inbound/api/putawayApi.ts');
  api = schemas.putawayApi;
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


test('reads a minimal putaway task projection within the selected warehouse',async()=>{globalThis.fetch=async(url,opts)=>{assert.equal(new URL(url,'https://example.test').pathname,`/api/v1/warehouses/${warehouse}/putaway`);assert.ok(opts.signal);return ok(state);};assert.deepEqual(await api.list(warehouse,null,new AbortController().signal),state);});
test('posts actual scan intent only and verifies task/actor/version/quantity result',async()=>{globalThis.fetch=async(url,opts)=>{assert.equal(new URL(url,'https://example.test').pathname,`/api/v1/warehouses/${warehouse}/putaway/${id}/confirmation`);assert.deepEqual(JSON.parse(opts.body),input);return ok(result);};assert.deepEqual(await api.confirm(warehouse,task,id,input),result);});
test('preserves exact scans and operation after unknown transport failure',async()=>{const commands=[];globalThis.fetch=async(url,opts)=>{commands.push(JSON.parse(opts.body));if(commands.length===1)throw new TypeError('Lost reply');return ok(result);};await assert.rejects(api.confirm(warehouse,task,id,input));assert.deepEqual(await api.confirm(warehouse,task,id,input),result);assert.deepEqual(commands,[input,input]);});
for(const [name,change] of Object.entries({task:{taskId:warehouse},actor:{assigneeId:warehouse},version:{version:2},quantity:{confirmedQty:6},status:{status:'ASSIGNED'},privacy:{tenantId:id},balance:{onHandQty:7}}))test(`rejects mismatched ${name} confirmation result`,async()=>{globalThis.fetch=async()=>ok({...result,...change});await assert.rejects(api.confirm(warehouse,task,id,input));});
for(const [name,change] of Object.entries({privacy:{tenantId:id},price:{declaredValue:100},quantity:{confirmedQty:8},completed:{status:'COMPLETED'},open:{status:'OPEN'},assignment:{assigneeId:null}}))test(`rejects invalid ${name} task projection`,async()=>{globalThis.fetch=async()=>ok({...state,items:[{...task,...change}]});await assert.rejects(api.list(warehouse,null));});
test('rejects duplicate tasks and malformed pagination',async()=>{for(const change of[{items:[task,task]},{nextCursor:id},{moreTasks:true,nextCursor:id}]){globalThis.fetch=async()=>ok({...state,...change});await assert.rejects(api.list(warehouse,null));}});
test('rejects forged input, empty scans and unsafe quantities',()=>{for(const change of[{tenantId:id},{qty:0},{qty:1.5},{qty:2147483647},{expectedVersion:0},{fromBinScan:''},{lotScan:' LOT-01'},{operationKey:'bad'}])assert.equal(schemas.putawayConfirmationSchema.safeParse({...input,...change}).success,false);});
test('partial task quantity does not reach the physical API',async()=>{let calls=0;globalThis.fetch=async()=>{calls++;return ok(result);};await assert.rejects(api.confirm(warehouse,task,id,{...input,qty:6}));assert.equal(calls,0);});
test('assignment result binds the exact task and chosen Staff',async()=>{const assignment={operationKey:id,expectedVersion:2,assigneeId:bin};globalThis.fetch=async()=>ok({...result,status:'ASSIGNED',confirmedQty:0,assigneeId:bin});assert.equal((await api.assign(warehouse,task,assignment)).assigneeId,bin);globalThis.fetch=async()=>ok({...result,status:'ASSIGNED',confirmedQty:0,assigneeId:id});await assert.rejects(api.assign(warehouse,task,assignment));});
test('staff picker rejects credentials and duplicate people',async()=>{globalThis.fetch=async()=>ok([{id,fullName:'Test Staff'}]);assert.deepEqual(await api.staff(warehouse),[{id,fullName:'Test Staff'}]);for(const list of[[{id,fullName:'Staff',email:'private@example.test'}],[{id,fullName:'Staff'},{id,fullName:'Staff'}]]){globalThis.fetch=async()=>ok(list);await assert.rejects(api.staff(warehouse));}});
test('Manager assignment and Staff confirmation capabilities match RP3',()=>{for(const role of['WAREHOUSE_STAFF','WAREHOUSE_MANAGER','ORCA_ADMIN','OPS_DISPATCHER','ORCA_ACCOUNTANT','SELLER_OWNER','SELLER_STAFF']){const roles=policy.getEffectiveRoles([role],role.startsWith('SELLER')?'TENANT':'PLATFORM');assert.equal(policy.can(roles,'warehouse.putaway.confirm'),role==='WAREHOUSE_STAFF');assert.equal(policy.can(roles,'warehouse.putaway.assign'),['WAREHOUSE_STAFF','WAREHOUSE_MANAGER'].includes(role));}assert.equal(policy.can(policy.getEffectiveRoles(['WAREHOUSE_STAFF','SELLER_OWNER'],'PLATFORM'),'warehouse.putaway.confirm'),false);});
