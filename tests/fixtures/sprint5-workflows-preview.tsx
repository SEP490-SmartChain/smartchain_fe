// Synthetic visual fixture only. No project environment files or live backend.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {NextIntlClientProvider} from 'next-intl';
import vi from '../../messages/vi.json';
import en from '../../messages/en.json';
import '../../src/styles/globals.css';
import {InventoryWorkflowWorkspace} from '../../src/features/inventory';
import {WebhookDeliveryWorkspace} from '../../src/features/analytics';
import {useAuthStore} from '../../src/stores/authStore';
const params=new URLSearchParams(location.search),role=params.get('role')??'WAREHOUSE_MANAGER',locale=params.get('locale')==='en'?'en':'vi';
const id=(n:number)=>`10250000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const tenant=role.startsWith('SELLER_');useAuthStore.getState().setSession({accessToken:'synthetic-local-sprint5',expiresIn:3600,user:{userId:id(9),tenantId:tenant?id(8):null,actorScope:tenant?'TENANT':'PLATFORM',roles:[role],permissions:[],warehouseIds:[id(1)],email:'synthetic@example.test',fullName:'Synthetic Sprint5',serviceStatus:'ACTIVE'}});
const ok=(data:unknown,pagination?:unknown)=>Response.json({success:true,data,meta:{timestamp:new Date().toISOString(),requestId:'synthetic-sprint5',path:'',...(pagination?{pagination}:{})}});
let count={id:id(2),version:2,status:'REVIEW',reviewReason:null as string|null,lines:[{id:id(3),sku:'CA-PHE-250',lotCode:'LOT-2026-08',binCode:'HN-A01',observedQty:8,reviewStatus:'PENDING',hasEvidence:true,...(role==='WAREHOUSE_MANAGER'?{expectedQty:10,varianceQty:-2}:{})}]};
window.fetch=async(input,init={})=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);if(u.pathname.endsWith('/warehouses'))return ok([{id:id(1),code:'HN-01',name:'Kho Hà Nội'}],{limit:50,hasNext:false,nextCursor:null});
 if(u.pathname.endsWith('/counts'))return ok({items:[count],nextCursor:null});
 if(u.pathname.endsWith('/putbacks'))return ok({items:[{id:id(4),version:1,status:'ASSIGNED',qty:2,sku:'TRA-XANH-100',lotCode:'LOT-2026-09',binCode:'HN-A02'}],nextCursor:null});
 if(u.pathname.endsWith('/disposals'))return ok({items:[{id:id(5),version:2,status:'APPROVED',qty:3,executedQty:0,reason:'Lô gần hết hạn, chủ nhà bán đồng ý tiêu hủy',reviewReason:'Đã kiểm tra lô và số lượng',authorizationMode:'CONSENT',policyExceptionCode:null,policyExpiresAt:null,sku:'SUA-YEN-MACH-1L',lotCode:'LOT-2026-07',binCode:'HN-Q01',hasEvidence:false}],nextCursor:null});
 if(u.pathname.endsWith('/review')&&init.method==='POST'){const body=JSON.parse(String(init.body));count={...count,status:body.decision==='APPROVE'?'APPROVED':'REVIEW',version:count.version+1,reviewReason:body.reason};return ok({id:count.id,status:count.status,version:count.version});}
 if(u.pathname.endsWith('/putback-options'))return ok({sources:[{id:id(6),sku:'CA-PHE-250',lotCode:'LOT-2026-08',qty:2}],bins:[{id:id(7),code:'HN-A02',zoneType:'STORAGE'},{id:id(8),code:'HN-Q01',zoneType:'QUARANTINE'}],staff:[{id:id(9),fullName:'Nguyễn Minh — nhân viên kho'}]});
 if(u.pathname.endsWith('/webhooks/summary'))return ok({from:u.searchParams.get('from'),to:u.searchParams.get('to'),total:'24',counts:{PENDING:'3',DELIVERED:'17',FAILED:'3',EXHAUSTED:'1'}});
 if(u.pathname.endsWith('/webhooks'))return ok([{id:id(6),eventId:id(7),endpointId:id(8),status:'FAILED',attempts:3,responseCode:503,nextAttemptAt:new Date().toISOString(),createdAt:new Date().toISOString()}],{limit:50,hasNext:false,nextCursor:null});
 return Response.json({success:false,error:{code:'SYNTHETIC.NOT_IMPLEMENTED',message:'Synthetic fixture only'},meta:{}},{status:404});};
createRoot(document.getElementById('root')!).render(<NextIntlClientProvider locale={locale} messages={locale==='vi'?vi:en}><BrowserRouter><main style={{maxWidth:1200,margin:'auto',padding:24}}>{params.get('view')==='webhooks'?<WebhookDeliveryWorkspace/>:<InventoryWorkflowWorkspace/>}</main></BrowserRouter></NextIntlClientProvider>);
