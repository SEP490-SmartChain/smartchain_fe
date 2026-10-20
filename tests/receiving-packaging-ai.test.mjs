import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
let server,mod,api,policy;
const originalFetch=globalThis.fetch;
const id=n=>`10950000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const warehouse=id(1),asn=id(2),input={operationKey:id(3),expectedVersion:4,inboundLineId:id(4),evidenceId:id(5)};
const scope={receiptId:id(6),receiptVersion:4,receivingRound:1,inboundLineId:input.inboundLineId};
const suggestion={id:input.operationKey,...scope,evidenceId:input.evidenceId,state:'READY',model:'claude-test-pinned',confidence:0.8,lotText:'LOT-TEST',expiryText:'02/03/27',reason:null,accepted:null};
const acceptance={confirmed:true,lotCode:'LOT-TEST',manufacturedOn:'2026-10-01',expiresOn:'2027-01-09'};
const accepted={...suggestion,state:'ACCEPTED',accepted:{lotCode:acceptance.lotCode,manufacturedOn:acceptance.manufacturedOn,expiresOn:acceptance.expiresOn,requiresQuarantine:false}};
const ok=data=>Response.json({success:true,data,meta:{}});
before(async()=>{
 server=await createServer({configFile:false,envFile:false,optimizeDeps:{noDiscovery:true,include:[]},root:fileURLToPath(new URL('..',import.meta.url)),resolve:{alias:{'@':fileURLToPath(new URL('../src',import.meta.url))}},server:{middlewareMode:true,watch:null,ws:false}});
 mod=await server.ssrLoadModule('/src/features/inbound/api/packagingAiApi.ts');api=mod.packagingAiApi;
 policy=await server.ssrLoadModule('/src/lib/accessPolicy.ts');
 const {useAuthStore}=await server.ssrLoadModule('/src/stores/authStore.ts');
 useAuthStore.getState().setSession({accessToken:'synthetic-ai-test',expiresIn:900,user:{userId:id(9),tenantId:null,email:'synthetic@example.test',fullName:'Test',actorScope:'PLATFORM',roles:['WAREHOUSE_STAFF'],permissions:[]}});
});
after(async()=>{globalThis.fetch=originalFetch;await server?.close();});
test('uses stable operation identity and only the selected verified image',async()=>{
 const commands=[];globalThis.fetch=async(url,options)=>{assert.match(String(url),new RegExp(`/warehouses/${warehouse}/asns/${asn}/receiving/packaging-suggestions$`));commands.push(JSON.parse(options.body));if(commands.length===1)throw new TypeError('Synthetic lost response');return ok({outcome:'SUGGESTION',suggestion});};
 await assert.rejects(api.request(warehouse,asn,input,scope));
 assert.deepEqual(await api.request(warehouse,asn,input,scope),{outcome:'SUGGESTION',suggestion});assert.deepEqual(commands,[input,input]);
});
test('disabled and terminal failure keep manual entry without invented acceptance',async()=>{
 globalThis.fetch=async()=>ok({outcome:'DISABLED',manualEntryAvailable:true});assert.deepEqual(await api.request(warehouse,asn,input,scope),{outcome:'DISABLED',manualEntryAvailable:true});
 for(const reason of ['DISABLED','QUOTA_EXCEEDED','UNAVAILABLE']) {
  const fallback={...suggestion,state:'FALLBACK',model:null,confidence:null,lotText:null,expiryText:null,reason};
  globalThis.fetch=async()=>ok(fallback);assert.equal((await api.get(warehouse,asn,input,scope)).state,'FALLBACK');
 }
});
test('raw ambiguous OCR date is retained as text, not parsed into a calendar date',async()=>{
 globalThis.fetch=async()=>ok(suggestion);const value=await api.get(warehouse,asn,input,scope);assert.equal(value.expiryText,'02/03/27');assert.equal(value.accepted,null);
 assert.equal(mod.packagingAcceptanceSchema.safeParse({...acceptance,expiresOn:value.expiryText}).success,false);
});
test('acceptance sends only explicitly confirmed values and validates matching server evidence',async()=>{
 let sent;globalThis.fetch=async(url,options)=>{assert.match(String(url),new RegExp(`/${input.operationKey}/accept$`));sent=JSON.parse(options.body);return ok(accepted);};
 assert.deepEqual(await api.accept(warehouse,asn,input,scope,acceptance),accepted);assert.deepEqual(sent,acceptance);
});
test('lost acceptance can be resolved by GET without another inference or count',async()=>{
 let calls=0;globalThis.fetch=async(_,options)=>{calls++;if(options.method==='POST')throw new TypeError('lost');return ok(accepted);};
 await assert.rejects(api.accept(warehouse,asn,input,scope,acceptance));const value=await api.get(warehouse,asn,input,scope);mod.assertAcceptedPackaging(value,acceptance);assert.equal(calls,2);
});
for(const [name,change] of Object.entries({receiptId:id(10),inboundLineId:id(11),evidenceId:id(12),id:id(13),receiptVersion:5,receivingRound:2,confidence:1.1,model:null,tenantId:id(14),stockQty:10,objectKey:'secret',accepted:{lotCode:'AUTO'},state:'APPLIED'}))test(`rejects foreign or malformed suggestion: ${name}`,async()=>{
 globalThis.fetch=async()=>ok({...suggestion,[name]:change});await assert.rejects(api.get(warehouse,asn,input,scope));
});
for(const changes of [{confirmed:false},{confirmed:true},{...acceptance,tenantId:id(1)},{...acceptance,expiresOn:'2026-02-30'},{...acceptance,lotCode:'a\nlot'}])test(`rejects unconfirmed or invalid values ${JSON.stringify(changes)}`,()=>{
 assert.equal(mod.packagingAcceptanceSchema.safeParse(changes).success,false);
});
test('rejects changed or financially expanded acceptance',async()=>{
 for(const changes of [{lotCode:'OTHER'},{requiresQuarantine:false,chargeVnd:100}]) {
  globalThis.fetch=async()=>ok({...accepted,accepted:{...accepted.accepted,...changes}});await assert.rejects(api.accept(warehouse,asn,input,scope,acceptance));
 }
});
test('availability exposes only unique allowlisted image metadata',async()=>{
 const image={id:input.evidenceId,createdAt:'2026-10-20T00:00:00.000Z',note:null};
 globalThis.fetch=async()=>ok({enabled:true,images:[image]});assert.deepEqual(await api.availability(warehouse,asn),{enabled:true,images:[image]});
 for(const images of [[image,image],[{...image,objectKey:'secret'}]]) {globalThis.fetch=async()=>ok({enabled:true,images});await assert.rejects(api.availability(warehouse,asn));}
});
for(const role of ['ORCA_ADMIN','OPS_DISPATCHER','WAREHOUSE_MANAGER','WAREHOUSE_STAFF','ORCA_ACCOUNTANT','SELLER_OWNER','SELLER_STAFF'])test(`UC158 capability is Staff only: ${role}`,()=>{
 const scope=role.startsWith('SELLER')?'TENANT':'PLATFORM';assert.equal(policy.can(policy.getEffectiveRoles([role],scope),'warehouse.asn.packagingAssist'),role==='WAREHOUSE_STAFF');
});
