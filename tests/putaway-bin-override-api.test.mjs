import assert from 'node:assert/strict';
import { after,before,test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
let server,api,schemas,auth,policy;
const originalFetch=globalThis.fetch;
const id='00000000-0000-4000-8000-000000000001',warehouse='00000000-0000-4000-8000-000000000002',bin='00000000-0000-4000-8000-000000000003';
const input={operationKey:id,expectedVersion:2,toBinId:bin,reason:'Safe handling aisle'};
const task={id,version:2,status:'ASSIGNED',qty:7,confirmedQty:0,assigneeId:id,fromBinCode:'RC-01',toBinCode:'ST-01',sku:'SKU-01',productName:'Test product',lotCode:'LOT-01'};
const result={id,taskId:id,version:3,fromBinId:warehouse,toBinId:bin,fromBinCode:'ST-01',toBinCode:'ST-02',reason:input.reason,actorId:id,createdAt:'2026-10-14T10:00:00.000Z'};
const state={taskId:id,version:2,items:[{id:bin,code:'ST-02'}],moreBins:false};
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
  schemas = await server.ssrLoadModule('/src/features/inbound/api/putawayBinOverrideApi.ts');
  api = schemas.putawayBinOverrideApi;
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


test('reads only compatible bin identity and current task revision',async()=>{globalThis.fetch=async(url,opts)=>{assert.equal(new URL(url,'https://example.test').pathname,`/api/v1/warehouses/${warehouse}/putaway/${id}/bin-options`);assert.equal(new URL(url,'https://example.test').searchParams.get('search'),'ST %');assert.ok(opts.signal);return ok(state);};assert.deepEqual(await api.options(warehouse,task,'ST %',new AbortController().signal),state);});
for(const [name,change]of Object.entries({task:{taskId:warehouse},revision:{version:1},privacy:{tenantId:id},duplicates:{items:[state.items[0],state.items[0]]},currentBin:{items:[{id:bin,code:'ST-01'}]},truncation:{moreBins:true}}))test(`rejects invalid ${name} bin options`,async()=>{globalThis.fetch=async()=>ok({...state,...change});await assert.rejects(api.options(warehouse,task));});
test('posts only exact intent and binds actor, task, revision and bin result',async()=>{globalThis.fetch=async(url,opts)=>{assert.equal(new URL(url,'https://example.test').pathname,`/api/v1/warehouses/${warehouse}/putaway/${id}/bin-override`);assert.deepEqual(JSON.parse(opts.body),input);return ok(result);};assert.deepEqual(await api.overrideBin(warehouse,task,id,input),result);});
for(const [name,change] of Object.entries({task:{taskId:warehouse},actor:{actorId:warehouse},revision:{version:2},destination:{toBinId:id},source:{fromBinCode:'OTHER'},reason:{reason:'Different reason'},privacy:{tenantId:id},sameBin:{fromBinId:bin},date:{createdAt:'not-date'}}))test(`rejects mismatched ${name} decision result`,async()=>{globalThis.fetch=async()=>ok({...result,...change});await assert.rejects(api.overrideBin(warehouse,task,id,input));});
test('keeps the exact operation after lost response',async()=>{const commands=[];globalThis.fetch=async(url,opts)=>{commands.push(JSON.parse(opts.body));if(commands.length===1)throw new TypeError('Lost reply');return ok(result);};await assert.rejects(api.overrideBin(warehouse,task,id,input));assert.deepEqual(await api.overrideBin(warehouse,task,id,input),result);assert.deepEqual(commands,[input,input]);});
test('rejects unsafe/forged input before sending a mutation',async()=>{let calls=0;globalThis.fetch=async()=>{calls++;return ok(result);};for(const change of[{tenantId:id},{actorId:id},{expectedVersion:1},{expectedVersion:0},{expectedVersion:2147483647},{toBinId:'bad'},{reason:'ab'},{reason:' abc'},{reason:'x'.repeat(501)}])await assert.rejects(api.overrideBin(warehouse,task,id,{...input,...change}));assert.equal(calls,0);});
test('reads newest-first immutable task audit and rejects foreign or duplicate history',async()=>{globalThis.fetch=async()=>ok([result]);assert.deepEqual(await api.history(warehouse,id),[result]);for(const rows of [[result,result],[{...result,taskId:warehouse}],[{...result,requestHash:'private'}],[result,{...result,id:bin,version:4}]]){globalThis.fetch=async()=>ok(rows);await assert.rejects(api.history(warehouse,id));}});
test('rejects oversized bin search before transport',async()=>{let calls=0;globalThis.fetch=async()=>{calls++;return ok(state);};await assert.rejects(api.options(warehouse,task,'x'.repeat(65)));assert.equal(calls,0);});
test('only Manager receives the override capability',()=>{for(const role of policy.ORCA_ROLES){const roles=policy.getEffectiveRoles([role],role.startsWith('SELLER')?'TENANT':'PLATFORM');assert.equal(policy.can(roles,'warehouse.putaway.overrideBin'),role==='WAREHOUSE_MANAGER');}assert.equal(policy.can(policy.getEffectiveRoles(['WAREHOUSE_MANAGER','SELLER_OWNER'],'PLATFORM'),'warehouse.putaway.overrideBin'),false);});
