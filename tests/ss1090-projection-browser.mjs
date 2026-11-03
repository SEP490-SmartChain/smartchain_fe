// Actual React simulator with labelled synthetic transport. No .env, DB or provider calls.
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
const root = fileURLToPath(new URL('..', import.meta.url));
const html = `<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ORCA · SS-1090 synthetic UI acceptance</title><body><aside style="padding:12px;background:#fef3c7">Synthetic UI acceptance transport · no live inventory/tariff/booking. <a href="/?kind=ALLOCATION">Allocation</a> · <a href="/?kind=CARRIER">Carrier</a> · <a href="/?kind=ALLOCATION&role=ORCA_ADMIN">Admin allocation denial</a></aside><main id="root" style="padding:24px;max-width:1200px;margin:auto"></main><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';
import {RuleSimulator} from '/src/features/rules/components/RuleSimulator.tsx';import {useAuthStore} from '/src/stores/authStore.ts';import messages from '/messages/en.json';
import '/src/styles/globals.css';import '/node_modules/@fontsource/archivo/400.css';import '/node_modules/@fontsource/archivo/600.css';
const q=new URLSearchParams(location.search),kind=q.get('kind')==='CARRIER'?'CARRIER':'ALLOCATION',role=q.get('role')||'OPS_DISPATCHER';
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');const id=uuid(10),s1=uuid(40),s2=uuid(41);
const rule={id,version:1,publishedVersion:1,isEnabled:true,name:'Synthetic '+kind.toLowerCase()+' policy',kind,warehouseId:null,exceptionTenantId:null,priority:1,condition:{kind:'ALL',conditions:[]},action:kind==='ALLOCATION'?{strategy:'NEAREST_WAREHOUSE'}:{carrierServiceId:s1,fallbackServiceIds:[s2]},createdAt:'2026-10-26T00:00:00Z',updatedAt:'2026-10-26T00:00:00Z'};
useAuthStore.getState().setSession({accessToken:'synthetic-ui-token',expiresIn:900,user:{userId:uuid(1),tenantId:null,actorScope:'PLATFORM',roles:[role],permissions:[],email:'synthetic@example.test',fullName:'Synthetic reviewer'}});
const match={ruleId:id,ruleVersion:1,name:rule.name,priority:1,scope:'GLOBAL',action:rule.action};
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.origin);
 if(!url.pathname.endsWith('/rules/simulate'))throw new Error('Unexpected synthetic fixture request');
 const request=JSON.parse(init.body),p=request.projection;
 const data={kind,mode:request.candidate?'SAVED_VERSION':'PUBLISHED',match,trace:[{ruleId:id,ruleVersion:1,name:rule.name,priority:1,scope:'GLOBAL',outcome:'SELECTED',missingFields:[]}],carrierServices:kind==='CARRIER'?[{id:s1,name:'Synthetic primary',role:'PRIMARY'},{id:s2,name:'Synthetic fallback',role:'FALLBACK'}]:[],pending:p?[]:[kind==='ALLOCATION'?'ALLOCATION_PREVIEW':'CARRIER_QUOTE']};
 if(p&&kind==='ALLOCATION'){
  // Explicit fixed UI fixtures, not a second planning implementation.
  const shortage=p.stock[1]?.availableQty===3;
  data.allocation={basis:'SIMULATED_INPUT',strategy:'NEAREST_WAREHOUSE',status:shortage?'BACKORDER':'PLANNED',reason:shortage?'INSUFFICIENT_ELIGIBLE_STOCK':'NEAREST_WAREHOUSE',candidates:[{warehouseId:'WH-HN',proximity:0,eligible:true,stock:{'SKU-DEMO':6}},{warehouseId:'WH-DN',proximity:2,eligible:true,stock:{'SKU-DEMO':shortage?3:4}}],lots:[{stockId:'STOCK-HN',warehouseId:'WH-HN',lotId:'LOT-HN',eligible:true},{stockId:'STOCK-DN',warehouseId:'WH-DN',lotId:'LOT-DN',eligible:true}],parcels:shortage?[]:[{warehouseId:'WH-HN',codVnd:'80000',lines:[{productId:'SKU-DEMO',qty:6,lots:[{stockId:'STOCK-HN',lotId:'LOT-HN',binId:'HN-A01',qty:6}]}]},{warehouseId:'WH-DN',codVnd:'40000',lines:[{productId:'SKU-DEMO',qty:4,lots:[{stockId:'STOCK-DN',lotId:'LOT-DN',binId:'DN-A01',qty:4}]}]}],estimatedTotalVnd:null,globalOptimum:false};
 }
 if(p&&kind==='CARRIER'){
  const unavailable=p.tariffs[0]?.eligible===false;
  data.carrierQuote={basis:'SIMULATED_INPUT',selectedServiceId:unavailable?s2:s1,candidates:[{serviceId:s1,status:unavailable?'UNAVAILABLE':'QUOTED',reason:unavailable?'SIMULATED_SERVICE_UNAVAILABLE':null,tariffVersion:'sample-v1',roundedWeightG:unavailable?null:1500,totalVnd:unavailable?null:'25000'},{serviceId:s2,status:'QUOTED',reason:null,tariffVersion:'sample-v1',roundedWeightG:1500,totalVnd:'25000'}]};
 }
 return Response.json({success:true,data,meta:{timestamp:'2026-10-26T00:00:00Z',requestId:'synthetic-ui-only'}});
};
createRoot(document.getElementById('root')).render(React.createElement(NextIntlClientProvider,{locale:'en',messages},React.createElement(RuleSimulator,{kind,rules:[rule]})));
</script></body></html>`;
const server = await createServer({
  root,
  configFile: false,
  envFile: false,
  cacheDir: 'node_modules/.vite-ss1090-projection-preview',
  resolve: { alias: { '@': root + '/src', '@messages': root + '/messages' } },
  optimizeDeps: { include: ['react', 'react-dom/client', 'next-intl'] },
  plugins: [
    react(),
    {
      name: 'synthetic-projection-ui',
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
  server: {
    host: '127.0.0.1',
    port: 24391,
    strictPort: true,
    fs: {
      // Worktree dependencies can be symlinked; permit only the public font assets.
      allow: [root, realpathSync(new URL('../node_modules/@fontsource/archivo', import.meta.url))],
    },
  },
});
await server.listen();
console.log('Synthetic UI acceptance: http://127.0.0.1:24391/');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
