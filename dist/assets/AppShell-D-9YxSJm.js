const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/Overview-DW0Di-wK.js","assets/index-CDUx5Xxm.js","assets/index-D_415SEt.css","assets/useSubgraph-C7naBW2b.js","assets/useInfiniteQuery-BA6xQSKz.js","assets/config-DxD5wJE7.js","assets/index.es-BH4KM1oz.js","assets/useSwitchChain-DKk3u10t.js","assets/useAccount-CnZr950D.js","assets/index-BbP3371Q.js","assets/useReadContract-DRJuNDNg.js","assets/CallBuilder-b6IjZya0.js","assets/useWriteContract-DXAnJDTw.js","assets/sendTransaction-CRdNipIq.js","assets/useWaitForTransactionReceipt-BxA3E0bJ.js","assets/waitForTransactionReceipt-SiBx7M8z.js","assets/Marketplace-CDbwBdPj.js","assets/Requests-ChRp6ZT5.js","assets/Providers-Cy68O_IW.js","assets/Receipts-DBD0nUce.js","assets/Payments-BVLng2g2.js","assets/parseUnits-DfNz2Y3C.js","assets/Quality-Bd4ibEdQ.js","assets/History-BVLyUSJu.js","assets/Agent-CkdqCvkO.js","assets/Lending-CCmPIetV.js","assets/Futures-DRzu5T7J.js","assets/Attestation-BJVXJSrJ.js","assets/Subscriptions-CJrsqDpk.js","assets/Mcp-DO7_dUG8.js","assets/Webhooks-D6kg5Kaa.js","assets/Leaderboard-5gEVSJ75.js","assets/ApiDocs-RTvO4guf.js","assets/Verify-DQyzPs42.js","assets/ProviderProfile-D0cC1mZv.js","assets/Analytics-DLERydWA.js","assets/Notifications-B0ODUnD3.js","assets/SettingsPanel-C2llTPlh.js","assets/Jobs-ZRkpfk-G.js"])))=>i.map(i=>d[i]);
import{R as z,r,j as t,_ as d}from"./index-CDUx5Xxm.js";import{C as q}from"./index.es-BH4KM1oz.js";import{CONFIG as g}from"./config-DxD5wJE7.js";import{ax as H,f as B}from"./useSwitchChain-DKk3u10t.js";import{u as w}from"./useReadContract-DRJuNDNg.js";import{u as F}from"./useAccount-CnZr950D.js";const L=e=>{let s;const a=new Set,n=(y,h)=>{const v=typeof y=="function"?y(s):y;if(!Object.is(v,s)){const C=s;s=h??(typeof v!="object"||v===null)?v:Object.assign({},s,v),a.forEach(b=>b(s,C))}},l=()=>s,u={setState:n,getState:l,getInitialState:()=>x,subscribe:y=>(a.add(y),()=>a.delete(y))},x=s=e(n,l,u);return u},$=e=>e?L(e):L,U=e=>e;function G(e,s=U){const a=z.useSyncExternalStore(e.subscribe,z.useCallback(()=>s(e.getState()),[e,s]),z.useCallback(()=>s(e.getInitialState()),[e,s]));return z.useDebugValue(a),a}const R=e=>{const s=$(e),a=n=>G(s,n);return Object.assign(a,s),a},Z=e=>e?R(e):R;function J(e,s){let a;try{a=e()}catch{return}return{getItem:l=>{var i;const o=x=>x===null?null:JSON.parse(x,void 0),u=(i=a.getItem(l))!=null?i:null;return u instanceof Promise?u.then(o):o(u)},setItem:(l,i)=>a.setItem(l,JSON.stringify(i,void 0)),removeItem:l=>a.removeItem(l)}}const A=e=>s=>{try{const a=e(s);return a instanceof Promise?a:{then(n){return A(n)(a)},catch(n){return this}}}catch(a){return{then(n){return this},catch(n){return A(n)(a)}}}},W=(e,s)=>(a,n,l)=>{let i={storage:J(()=>window.localStorage),partialize:c=>c,version:0,merge:(c,_)=>({..._,...c}),...s},o=!1,u=0;const x=new Set,y=new Set;let h=i.storage;if(!h)return e((...c)=>{console.warn(`[zustand persist middleware] Unable to update item '${i.name}', the given storage is currently unavailable.`),a(...c)},n,l);const v=()=>{const c=i.partialize({...n()});return h.setItem(i.name,{state:c,version:i.version})},C=l.setState;l.setState=(c,_)=>(C(c,_),v());const b=e((...c)=>(a(...c),v()),n,l);l.getInitialState=()=>b;let k;const I=()=>{var c,_;if(!h)return;const E=++u;o=!1,x.forEach(m=>{var f;return m((f=n())!=null?f:b)});const j=((_=i.onRehydrateStorage)==null?void 0:_.call(i,(c=n())!=null?c:b))||void 0;return A(h.getItem.bind(h))(i.name).then(m=>{if(m)if(typeof m.version=="number"&&m.version!==i.version){if(i.migrate){const f=i.migrate(m.state,m.version);return f instanceof Promise?f.then(M=>[!0,M]):[!0,f]}console.error("State loaded from storage couldn't be migrated since no migrate function was provided")}else return[!1,m.state];return[!1,void 0]}).then(m=>{var f;if(E!==u)return;const[M,V]=m;if(k=i.merge(V,(f=n())!=null?f:b),a(k,!0),M)return v()}).then(()=>{E===u&&(j==null||j(n(),void 0),k=n(),o=!0,y.forEach(m=>m(k)))}).catch(m=>{E===u&&(j==null||j(void 0,m))})};return l.persist={setOptions:c=>{i={...i,...c},c.storage&&(h=c.storage)},clearStorage:()=>{++u,h==null||h.removeItem(i.name)},getOptions:()=>i,rehydrate:()=>I(),hasHydrated:()=>o,onHydrate:c=>(x.add(c),()=>{x.delete(c)}),onFinishHydration:c=>(y.add(c),()=>{y.delete(c)})},i.skipHydration||I(),k||b},K=W,S=Z()(K(e=>({activePanel:"overview",mode:"simple",theme:"dark",advancedOpen:!1,setPanel:s=>e({activePanel:s}),setMode:s=>e({mode:s,advancedOpen:s==="pro"}),setTheme:s=>e({theme:s}),toggleAdvanced:()=>e(s=>({advancedOpen:!s.advancedOpen}))}),{name:"cg-app-state",partialize:e=>({mode:e.mode,theme:e.theme,advancedOpen:e.advancedOpen})}));/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Q=e=>e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),O=(...e)=>e.filter((s,a,n)=>!!s&&s.trim()!==""&&n.indexOf(s)===a).join(" ").trim();/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var Y={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const X=r.forwardRef(({color:e="currentColor",size:s=24,strokeWidth:a=2,absoluteStrokeWidth:n,className:l="",children:i,iconNode:o,...u},x)=>r.createElement("svg",{ref:x,...Y,width:s,height:s,stroke:e,strokeWidth:n?Number(a)*24/Number(s):a,className:O("lucide",l),...u},[...o.map(([y,h])=>r.createElement(y,h)),...Array.isArray(i)?i:[i]]));/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=(e,s)=>{const a=r.forwardRef(({className:n,...l},i)=>r.createElement(X,{ref:i,iconNode:s,className:O(`lucide-${Q(e)}`,n),...l}));return a.displayName=`${e}`,a};/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ee=p("Bell",[["path",{d:"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9",key:"1qo2s2"}],["path",{d:"M10.3 21a1.94 1.94 0 0 0 3.4 0",key:"qgo35s"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const te=p("BookOpen",[["path",{d:"M12 7v14",key:"1akyts"}],["path",{d:"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",key:"ruj8y"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const se=p("ChartNoAxesColumn",[["line",{x1:"18",x2:"18",y1:"20",y2:"10",key:"1xfpm4"}],["line",{x1:"12",x2:"12",y1:"20",y2:"4",key:"be30l9"}],["line",{x1:"6",x2:"6",y1:"20",y2:"14",key:"1r4le6"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ae=p("ChevronDown",[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ne=p("ChevronRight",[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ie=p("Cpu",[["rect",{width:"16",height:"16",x:"4",y:"4",rx:"2",key:"14l7u7"}],["rect",{width:"6",height:"6",x:"9",y:"9",rx:"1",key:"5aljv4"}],["path",{d:"M15 2v2",key:"13l42r"}],["path",{d:"M15 20v2",key:"15mkzm"}],["path",{d:"M2 15h2",key:"1gxd5l"}],["path",{d:"M2 9h2",key:"1bbxkp"}],["path",{d:"M20 15h2",key:"19e6y8"}],["path",{d:"M20 9h2",key:"19tzq7"}],["path",{d:"M9 2v2",key:"165o2o"}],["path",{d:"M9 20v2",key:"i2bqo8"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const re=p("CreditCard",[["rect",{width:"20",height:"14",x:"2",y:"5",rx:"2",key:"ynyp8z"}],["line",{x1:"2",x2:"22",y1:"10",y2:"10",key:"1b3vmo"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const oe=p("FileText",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const le=p("History",[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}],["path",{d:"M12 7v5l4 2",key:"1fdv2h"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const de=p("House",[["path",{d:"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",key:"5wwlr5"}],["path",{d:"M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",key:"1d0kgt"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ce=p("Link2",[["path",{d:"M9 17H7A5 5 0 0 1 7 7h2",key:"8i5ue5"}],["path",{d:"M15 7h2a5 5 0 1 1 0 10h-2",key:"1b9ql8"}],["line",{x1:"8",x2:"16",y1:"12",y2:"12",key:"1jonct"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const pe=p("List",[["path",{d:"M3 12h.01",key:"nlz23k"}],["path",{d:"M3 18h.01",key:"1tta3j"}],["path",{d:"M3 6h.01",key:"1rqtza"}],["path",{d:"M8 12h13",key:"1za7za"}],["path",{d:"M8 18h13",key:"1lx6n3"}],["path",{d:"M8 6h13",key:"ik3vkj"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ue=p("Moon",[["path",{d:"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",key:"a7tn18"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const me=p("Package",[["path",{d:"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",key:"1a0edw"}],["path",{d:"M12 22V12",key:"d0xqtd"}],["path",{d:"m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7",key:"yx3hmr"}],["path",{d:"m7.5 4.27 9 5.15",key:"1c824w"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const he=p("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ye=p("Server",[["rect",{width:"20",height:"8",x:"2",y:"2",rx:"2",ry:"2",key:"ngkwjq"}],["rect",{width:"20",height:"8",x:"2",y:"14",rx:"2",ry:"2",key:"iecqi9"}],["line",{x1:"6",x2:"6.01",y1:"6",y2:"6",key:"16zg32"}],["line",{x1:"6",x2:"6.01",y1:"18",y2:"18",key:"nzw8ys"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const xe=p("Settings",[["path",{d:"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",key:"1qme2f"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ve=p("ShieldCheck",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const fe=p("Shield",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const be=p("Store",[["path",{d:"m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7",key:"ztvudi"}],["path",{d:"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8",key:"1b2hhj"}],["path",{d:"M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4",key:"2ebpfo"}],["path",{d:"M2 7h20",key:"1fcdvo"}],["path",{d:"M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7",key:"6c3vgh"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _e=p("Sun",[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=p("Terminal",[["polyline",{points:"4 17 10 11 4 5",key:"akl6gq"}],["line",{x1:"12",x2:"20",y1:"19",y2:"19",key:"q2wloq"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ke=p("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ge=p("Zap",[["path",{d:"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",key:"1xq2db"}]]);function T(e){var s,a,n="";if(typeof e=="string"||typeof e=="number")n+=e;else if(typeof e=="object")if(Array.isArray(e)){var l=e.length;for(s=0;s<l;s++)e[s]&&(a=T(e[s]))&&(n&&(n+=" "),n+=a)}else for(a in e)e[a]&&(n&&(n+=" "),n+=a);return n}function D(){for(var e,s,a=0,n="",l=arguments.length;a<l;a++)(e=arguments[a])&&(s=T(e))&&(n&&(n+=" "),n+=s);return n}const je=[{id:"overview",label:"Overview",icon:t.jsx(de,{size:16}),modes:["simple","pro"]},{id:"calls",label:"Call Builder",icon:t.jsx(N,{size:16}),modes:["simple","pro"]},{id:"marketplace",label:"Browse Services",icon:t.jsx(be,{size:16}),modes:["simple","pro"]},{id:"requests",label:"My Requests",icon:t.jsx(pe,{size:16}),modes:["simple","pro"]},{id:"providers",label:"Providers",icon:t.jsx(ye,{size:16}),modes:["simple","pro"]},{id:"receipts",label:"Receipts",icon:t.jsx(oe,{size:16}),modes:["simple","pro"]}],ze=[{id:"payments",label:"Payments",icon:t.jsx(re,{size:16}),modes:["simple","pro"]},{id:"disputes",label:"Disputes",icon:t.jsx(fe,{size:16}),modes:["simple","pro"]},{id:"history",label:"History",icon:t.jsx(le,{size:16}),modes:["simple","pro"]}],we=[{id:"quality",label:"Quality Disputes",icon:t.jsx(ve,{size:16}),modes:["pro"]},{id:"agent",label:"Agent Loop",icon:t.jsx(ie,{size:16}),modes:["pro"]},{id:"lending",label:"RepFi Lending",icon:t.jsx(ke,{size:16}),modes:["pro"]},{id:"futures",label:"SLA Futures",icon:t.jsx(me,{size:16}),modes:["pro"]},{id:"attestation",label:"SLA Bridge",icon:t.jsx(ce,{size:16}),modes:["pro"]},{id:"subscriptions",label:"Subscriptions",icon:t.jsx(he,{size:16}),modes:["pro"]},{id:"mcp",label:"API / MCP",icon:t.jsx(N,{size:16}),modes:["pro"]},{id:"webhooks",label:"Webhooks",icon:t.jsx(ge,{size:16}),modes:["pro"]},{id:"leaderboard",label:"Leaderboard",icon:t.jsx(se,{size:16}),modes:["pro"]},{id:"apidocs",label:"API Docs",icon:t.jsx(te,{size:16}),modes:["pro"]}],Ce=[{id:"notifications",label:"Notifications",icon:t.jsx(ee,{size:16}),modes:["simple","pro"]},{id:"settings",label:"Settings",icon:t.jsx(xe,{size:16}),modes:["simple","pro"]}];function Ee(){const{activePanel:e,setPanel:s,mode:a,advancedOpen:n,toggleAdvanced:l}=S(),i=({item:o})=>{if(!o.modes.includes(a))return null;const u=e===o.id;return t.jsxs("button",{onClick:()=>s(o.id),className:D("sb-item w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all",u?"bg-accent/10 text-accent font-medium border-l-2 border-accent":"text-text-dim hover:text-text hover:bg-bg-3"),children:[t.jsx("span",{className:"sb-icon opacity-70",children:o.icon}),t.jsx("span",{children:o.label})]})};return t.jsxs("aside",{className:"app-sidebar flex flex-col gap-1 py-3 px-2 overflow-y-auto",children:[t.jsxs("div",{className:"flex items-center gap-2 px-3 py-2 mb-2",children:[t.jsx("div",{className:"w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center text-white text-xs font-bold shadow-glow-green",children:"CG"}),t.jsxs("div",{children:[t.jsx("div",{className:"text-sm font-semibold text-text font-display",children:"CallGuard"}),t.jsx("div",{className:"text-xs text-text-faint",children:"Arc Testnet"})]})]}),t.jsx("div",{className:"sb-section-label px-3 py-1 text-xs uppercase tracking-widest text-text-faint",children:"Workspace"}),je.map(o=>t.jsx(i,{item:o},o.id)),t.jsx("div",{className:"sb-section-label px-3 py-1 mt-2 text-xs uppercase tracking-widest text-text-faint",children:"Settlement"}),ze.map(o=>t.jsx(i,{item:o},o.id)),a==="pro"&&t.jsxs(t.Fragment,{children:[t.jsxs("button",{onClick:l,className:"flex items-center justify-between w-full px-3 py-1 mt-2 text-xs uppercase tracking-widest text-text-faint hover:text-text-dim transition-colors",children:[t.jsx("span",{children:"Advanced"}),n?t.jsx(ae,{size:12}):t.jsx(ne,{size:12})]}),n&&we.map(o=>t.jsx(i,{item:o},o.id))]}),t.jsx("div",{className:"sb-section-label px-3 py-1 mt-2 text-xs uppercase tracking-widest text-text-faint",children:"System"}),Ce.map(o=>t.jsx(i,{item:o},o.id))]})}const Me=[{name:"providerCount",type:"function",stateMutability:"view",inputs:[],outputs:[{type:"uint256"}]},{name:"getProvider",type:"function",stateMutability:"view",inputs:[{name:"id",type:"uint256"}],outputs:[{type:"address"},{type:"address"},{type:"uint256"},{type:"uint256"},{type:"uint32"},{type:"uint32"},{type:"bool"}]},{name:"getReputationScore",type:"function",stateMutability:"view",inputs:[{name:"id",type:"uint256"}],outputs:[{type:"uint256"}]},{name:"completedCalls",type:"function",stateMutability:"view",inputs:[{name:"id",type:"uint256"}],outputs:[{type:"uint256"}]},{name:"slashedCalls",type:"function",stateMutability:"view",inputs:[{name:"id",type:"uint256"}],outputs:[{type:"uint256"}]}],P=[{name:"callCount",type:"function",stateMutability:"view",inputs:[],outputs:[{type:"uint256"}]},{name:"slashCount",type:"function",stateMutability:"view",inputs:[],outputs:[{type:"uint256"}]},{name:"receiptCount",type:"function",stateMutability:"view",inputs:[],outputs:[{type:"uint256"}]}];function qe(){return w({address:g.registry,abi:Me,functionName:"providerCount"})}function He(){return w({address:g.payPerCall,abi:P,functionName:"callCount"})}function Be(){return w({address:g.payPerCall,abi:P,functionName:"slashCount"})}function Fe(){return w({address:g.payPerCall,abi:P,functionName:"receiptCount"})}function Ae(e){return H({address:e,token:g.usdc})}function Se(){const{address:e}=F(),{mode:s,setMode:a,theme:n,setTheme:l}=S(),{data:i}=Ae(e),o=i?parseFloat(B(i.value,i.decimals)).toFixed(2):null;return t.jsxs("header",{className:"topbar flex items-center justify-between px-4 h-12 border-b border-border sticky top-0 z-50 bg-bg-0/80 backdrop-blur-xl",children:[t.jsxs("div",{className:"flex items-center gap-3",children:[t.jsx("div",{className:"w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center text-white text-xs font-bold",children:"CG"}),t.jsxs("span",{className:"hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-medium",children:[t.jsx("span",{className:"w-1.5 h-1.5 rounded-full bg-accent animate-pulse"}),"Arc Testnet"]})]}),t.jsxs("div",{className:"flex items-center gap-2",children:[o&&t.jsxs("span",{className:"hidden sm:block text-xs text-text-dim font-mono",children:[o," USDC"]}),t.jsxs("div",{className:"flex items-center rounded-lg overflow-hidden border border-border text-xs",children:[t.jsx("button",{onClick:()=>a("simple"),className:`px-2 py-1 transition-colors ${s==="simple"?"bg-accent/20 text-accent font-semibold":"text-text-dim hover:text-text"}`,children:"Simple"}),t.jsx("button",{onClick:()=>a("pro"),className:`px-2 py-1 transition-colors ${s==="pro"?"bg-accent/20 text-accent font-semibold":"text-text-dim hover:text-text"}`,children:"Pro"})]}),t.jsx("button",{onClick:()=>l(n==="dark"?"light":"dark"),className:"p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-bg-3 transition-colors",children:n==="dark"?t.jsx(_e,{size:14}):t.jsx(ue,{size:14})}),t.jsx(q,{})]})]})}const Pe={overview:r.lazy(()=>d(()=>import("./Overview-DW0Di-wK.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10]))),calls:r.lazy(()=>d(()=>import("./CallBuilder-b6IjZya0.js"),__vite__mapDeps([11,1,2,5,6,7,8,4,9,10,12,13,14,15]))),marketplace:r.lazy(()=>d(()=>import("./Marketplace-CDbwBdPj.js"),__vite__mapDeps([16,1,2,3,4,5,6,7,8,9,10]))),requests:r.lazy(()=>d(()=>import("./Requests-ChRp6ZT5.js"),__vite__mapDeps([17,1,2,3,4,5,6,7,8,9]))),providers:r.lazy(()=>d(()=>import("./Providers-Cy68O_IW.js"),__vite__mapDeps([18,1,2,3,4,5,6,7,8,9,10]))),receipts:r.lazy(()=>d(()=>import("./Receipts-DBD0nUce.js"),__vite__mapDeps([19,1,2,3,4,5,6,7,8,9]))),payments:r.lazy(()=>d(()=>import("./Payments-BVLng2g2.js"),__vite__mapDeps([20,1,2,3,4,5,6,7,8,9,10,12,13,21]))),disputes:r.lazy(()=>d(()=>import("./Quality-Bd4ibEdQ.js").then(e=>e.D),__vite__mapDeps([22,6,1,2,7,8,4,9,5,10,12,13]))),history:r.lazy(()=>d(()=>import("./History-BVLyUSJu.js"),__vite__mapDeps([23,1,2,3,4,5,6,7,8,9]))),quality:r.lazy(()=>d(()=>import("./Quality-Bd4ibEdQ.js").then(e=>e.Q),__vite__mapDeps([22,6,1,2,7,8,4,9,5,10,12,13]))),agent:r.lazy(()=>d(()=>import("./Agent-CkdqCvkO.js"),__vite__mapDeps([24,1,2]))),lending:r.lazy(()=>d(()=>import("./Lending-CCmPIetV.js"),__vite__mapDeps([25,1,2]))),futures:r.lazy(()=>d(()=>import("./Futures-DRzu5T7J.js"),__vite__mapDeps([26,1,2]))),attestation:r.lazy(()=>d(()=>import("./Attestation-BJVXJSrJ.js"),__vite__mapDeps([27,1,2]))),subscriptions:r.lazy(()=>d(()=>import("./Subscriptions-CJrsqDpk.js"),__vite__mapDeps([28,1,2]))),mcp:r.lazy(()=>d(()=>import("./Mcp-DO7_dUG8.js"),__vite__mapDeps([29,1,2]))),webhooks:r.lazy(()=>d(()=>import("./Webhooks-D6kg5Kaa.js"),__vite__mapDeps([30,1,2]))),leaderboard:r.lazy(()=>d(()=>import("./Leaderboard-5gEVSJ75.js"),__vite__mapDeps([31,1,2]))),apidocs:r.lazy(()=>d(()=>import("./ApiDocs-RTvO4guf.js"),__vite__mapDeps([32,1,2]))),verify:r.lazy(()=>d(()=>import("./Verify-DQyzPs42.js"),__vite__mapDeps([33,1,2]))),provprofile:r.lazy(()=>d(()=>import("./ProviderProfile-D0cC1mZv.js"),__vite__mapDeps([34,1,2]))),analytics:r.lazy(()=>d(()=>import("./Analytics-DLERydWA.js"),__vite__mapDeps([35,1,2]))),notifications:r.lazy(()=>d(()=>import("./Notifications-B0ODUnD3.js"),__vite__mapDeps([36,1,2]))),settings:r.lazy(()=>d(()=>import("./SettingsPanel-C2llTPlh.js"),__vite__mapDeps([37,1,2,5,6,7,8,4,9,10]))),jobs:r.lazy(()=>d(()=>import("./Jobs-ZRkpfk-G.js"),__vite__mapDeps([38,1,2])))};function Ie(){return t.jsx("div",{className:"flex items-center justify-center h-64 text-text-faint text-sm",children:t.jsx("span",{className:"animate-pulse",children:"Loading…"})})}function Le(){const{activePanel:e,theme:s}=S(),a=Pe[e];return t.jsxs("div",{className:D("app-root min-h-screen flex flex-col",s==="light"&&"light-mode"),children:[t.jsx(Se,{}),t.jsxs("div",{className:"flex flex-1 overflow-hidden",children:[t.jsx("div",{className:"hidden md:flex w-52 flex-shrink-0 border-r border-border bg-bg-1 overflow-y-auto",children:t.jsx(Ee,{})}),t.jsx("main",{className:"flex-1 overflow-y-auto bg-bg-0",children:t.jsx(r.Suspense,{fallback:t.jsx(Ie,{}),children:t.jsx(a,{})})})]})]})}const $e=Object.freeze(Object.defineProperty({__proto__:null,default:Le},Symbol.toStringTag,{value:"Module"}));export{$e as A,He as a,Be as b,Fe as c,S as d,qe as u};
