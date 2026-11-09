// Actual relocation components with isolated synthetic transport. No env or shared DB.
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
<aside style="padding:10px"><strong>Relocation UX — synthetic transport</strong><form><label>Scenario <select name="scenario"><option>manual</option><option>one-unit</option><option>quarantine</option><option>load-error</option><option>validation</option><option>lost-reply</option></select></label><button>Open scenario</button></form>
<output aria-label="Movement evidence">No commands</output><p><output aria-label="Lookup evidence">No lookup</output></p></aside><div id="root"></div>
<script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';import messages from '/messages/vi.json';import '/src/styles/globals.css';
import {useAuthStore} from '/src/stores/authStore.ts';import {useLocaleStore} from '/src/stores/localeStore.ts';import {RelocationWorkspace} from '/src/features/inbound/components/RelocationWorkspace.tsx';
const scenario=new URLSearchParams(location.search).get('scenario')||'manual';document.querySelector('[name=scenario]').value=scenario;
const id=n=>'11060000-0000-4000-8000-'+String(n).padStart(12,'0');
const source={id:id(1),version:2,sku:'SKU-AOTHUN',productName:'Áo thun cotton trắng',lotCode:'LOT-TEST-A',fromBinId:id(2),fromBinCode:scenario==='quarantine'?'QC-1':'A-1',stockState:scenario==='quarantine'?'QUARANTINE':'SELLABLE',availableQty:scenario==='one-unit'?1:5};
const bins=[{id:id(3),code:'B-1'},{id:id(4),code:'C-1'}],commands=[];let moved=false,lookupFailures=scenario==='load-error'?1:0,validationFailures=scenario==='validation'?1:0;
useLocaleStore.getState().setLocale('vi');useAuthStore.getState().setSession({accessToken:'synthetic-local-token',expiresIn:900,user:{userId:id(9),tenantId:null,actorScope:'PLATFORM',roles:['WAREHOUSE_STAFF'],permissions:[],warehouseIds:[id(8)],email:'synthetic@example.test',fullName:'Synthetic Staff'}});
const ok=data=>Response.json({success:true,data,meta:{}}),fail=(status,message)=>Response.json({success:false,error:{code:'INBOUND.RELOCATION_INVALID',message,statusCode:status},meta:{}},{status});
window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.origin),p=url.pathname;
if(p.endsWith('/bins')){if(lookupFailures-->0)return fail(503,'Không tải được vị trí đích.');const search=url.searchParams.get('search')||'';document.querySelector('output[aria-label="Lookup evidence"]').textContent='Search='+search;return ok({bins:scenario==='quarantine'?[]:bins.filter(bin=>!search||bin.code.includes(search)||(search==='BARCODE-C'&&bin.code==='C-1')),moreBins:false});}
if(p.endsWith('/relocation'))return ok({items:moved?[]:[source],nextCursor:null});
if((init.method||'GET')==='POST'){const command=JSON.parse(init.body);commands.push(command);document.querySelector('output[aria-label="Movement evidence"]').textContent=JSON.stringify(commands);
if(validationFailures-->0)return fail(422,'Kiểm tra lại mã vị trí.');
if(command.fromBinScan!==source.fromBinCode||command.skuScan!==source.sku||command.lotScan!==source.lotCode||bins.find(bin=>bin.id===command.toBinId)?.code!==command.toBinScan)return fail(400,'Mã quét không khớp hàng đã chọn.');
if(scenario==='lost-reply'&&commands.length===1)throw new TypeError('Synthetic committed reply lost');
moved=true;return ok({id:id(7),sourceStockId:source.id,toBinId:command.toBinId,qty:command.qty,stockState:source.stockState,sourceVersion:3});}
throw new Error('Unconfigured synthetic endpoint');};
function App(){const [locked,setLocked]=React.useState(false);return React.createElement(NextIntlClientProvider,{messages,locale:'vi',timeZone:'Asia/Ho_Chi_Minh'},React.createElement('main',{style:{maxWidth:'1000px',margin:'30px auto',padding:'16px'}},React.createElement('p',null,locked?'Pending command locked':'No pending command'),React.createElement(RelocationWorkspace,{warehouse:id(8),disabled:false,onLock:setLocked})));}
createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`;
const server = await createServer({
  root,
  configFile: false,
  envFile: false,
  cacheDir: '/private/tmp/orca-relocation-ux-vite',
  resolve: { alias: { '@': root + '/src', '@messages': root + '/messages' } },
  plugins: [
    react(),
    {
      name: 'relocation-ux-fixture',
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
  server: { host: '127.0.0.1', port: 24607, strictPort: true },
});
await server.listen();
console.log('Relocation UX fixture http://127.0.0.1:24607/');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
