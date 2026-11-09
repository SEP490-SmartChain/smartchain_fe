// Real components with synthetic transport. No .env, shared DB or external calls.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
<aside style="padding:10px"><strong>Manual feedback — synthetic local transport</strong>
<a href="?view=product">Product</a> · <a href="?view=notices">Assignments</a> · <button id="grant">Simulate a new assignment</button>
<output aria-label="Fixture command evidence">No commands</output></aside><div id="root"></div>
<script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import {NextIntlClientProvider} from 'next-intl';
import messages from '/messages/vi.json';import '/src/styles/globals.css';
import {useAuthStore} from '/src/stores/authStore.ts';import {useLocaleStore} from '/src/stores/localeStore.ts';
import {ProductConfigurationModal} from '/src/features/catalog/components/ProductConfigurationModal.tsx';import Topbar from '/src/components/layout/Topbar.tsx';
const id=n=>'11050000-0000-4000-8000-'+String(n).padStart(12,'0'),stamp='2026-11-05T10:00:00Z';
const assignment=new URLSearchParams(location.search).get('view')==='notices';
let user={userId:id(assignment?2:1),tenantId:assignment?null:id(3),actorScope:assignment?'PLATFORM':'TENANT',roles:[assignment?'WAREHOUSE_MANAGER':'SELLER_OWNER'],permissions:[],warehouseIds:assignment?[id(4)]:[],serviceStatus:'ACTIVE',email:'fixture@example.test',fullName:'Synthetic feedback user'};
const product={id:id(10),sku:'FIXTURE-SHIRT',name:'Áo thun mẫu không hạn dùng',weightG:200,lengthCm:'30',widthCm:'20',heightCm:'3',declaredValue:'150000',isActive:true,trackLot:true,trackExpiry:false,manufactureRequired:false,shelfLifeDays:null,minInboundShelfLifePct:'50',minOutboundDays:30,nearExpiryDays:30,createdAt:stamp,updatedAt:stamp};
useLocaleStore.getState().setLocale('vi');useAuthStore.getState().setSession({accessToken:'synthetic-local-token',expiresIn:900,user});
window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.origin); const ok=data=>Response.json({success:true,data,meta:{}});
if(url.pathname.endsWith('/auth/me'))return ok(user);
if(url.pathname.endsWith('/configuration')){const payload=JSON.parse(init.body);document.querySelector('output').textContent=JSON.stringify(payload);return ok({...product,...payload,minInboundShelfLifePct:String(payload.minInboundShelfLifePct)});}
throw new Error('Synthetic fixture blocked unconfigured request');};
document.getElementById('grant').onclick=()=>{user={...user,warehouseIds:[id(4),id(5)]};window.dispatchEvent(new Event('focus'));};
function App(){const [open,setOpen]=React.useState(true);return React.createElement(BrowserRouter,null,React.createElement(NextIntlClientProvider,{messages,locale:'vi',timeZone:'Asia/Ho_Chi_Minh'},React.createElement(Topbar),!assignment&&open&&React.createElement(ProductConfigurationModal,{product,onClose:()=>setOpen(false),onChanged:()=>{}})));}
createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`;
const server = await createServer({
  root,
  configFile: false,
  envFile: false,
  cacheDir: '/private/tmp/orca-manual-feedback-vite',
  resolve: { alias: { '@': `${root}/src`, '@messages': `${root}/messages` } },
  plugins: [
    react(),
    {
      name: 'manual-feedback-fixture',
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
  server: { host: '127.0.0.1', port: 24606, strictPort: true },
});
await server.listen();
console.log('Manual feedback fixture http://127.0.0.1:24606/');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
