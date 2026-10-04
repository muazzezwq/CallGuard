const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/Overview-DFV03qX5.js","assets/index-CLcOyANk.js","assets/index-D_415SEt.css","assets/useSubgraph-jMEuY9K6.js","assets/useReadContract-BOiP2cQs.js","assets/CallBuilder-D-BbF3hT.js","assets/useWriteContract-DRfQsZxk.js","assets/sendRawTransaction-B68lU2lm.js","assets/useWaitForTransactionReceipt-yTSRhLvn.js","assets/waitForTransactionReceipt-ZcDpkzTu.js","assets/Marketplace-BGLYKeaG.js","assets/Requests-j6cLKzmX.js","assets/Providers-BjkQ7k4E.js","assets/Receipts-XsZHXIkI.js","assets/Payments-CU-c1Efd.js","assets/parseUnits-BXefFEmG.js","assets/Disputes-FeydrJ4H.js","assets/History-BGcLGBK9.js","assets/Quality-DlpO1rRY.js","assets/Agent-YfE3ICGV.js","assets/Lending-Doe49QIp.js","assets/Futures-C0u5xldA.js","assets/Attestation-CHlrUIpf.js","assets/Subscriptions-D9Y_eAJG.js","assets/Mcp-Bv8885Nb.js","assets/Webhooks-v0jlU5jJ.js","assets/Leaderboard-BJ0PNST0.js","assets/ApiDocs-DLQLk8JH.js","assets/Verify-BCsUuvA1.js","assets/ProviderProfile-B4HzpKgU.js","assets/Analytics-C-uufWzt.js","assets/Notifications-Nn6O74cj.js","assets/SettingsPanel-DtyDpbDf.js","assets/Jobs-DAnP67A-.js","assets/BulkCall-BSPIytw6.js","assets/Register-DHMIvSXm.js"])))=>i.map(i=>d[i]);
import{R as j,r as s,j as e,u as T,C as D,a as V,f as q,b as H,_ as d}from"./index-CLcOyANk.js";const M=t=>{let r;const n=new Set,i=(u,x)=>{const v=typeof u=="function"?u(r):u;if(!Object.is(v,r)){const z=r;r=x??(typeof v!="object"||v===null)?v:Object.assign({},r,v),n.forEach(g=>g(r,z))}},l=()=>r,h={setState:i,getState:l,getInitialState:()=>a,subscribe:u=>(n.add(u),()=>n.delete(u))},a=r=t(i,l,h);return h},B=t=>t?M(t):M,F=t=>t;function W(t,r=F){const n=j.useSyncExternalStore(t.subscribe,j.useCallback(()=>r(t.getState()),[t,r]),j.useCallback(()=>r(t.getInitialState()),[t,r]));return j.useDebugValue(n),n}const C=t=>{const r=B(t),n=i=>W(r,i);return Object.assign(n,r),n},N=t=>t?C(t):C;function U(t,r){let n;try{n=t()}catch{return}return{getItem:l=>{var o;const y=a=>a===null?null:JSON.parse(a,void 0),h=(o=n.getItem(l))!=null?o:null;return h instanceof Promise?h.then(y):y(h)},setItem:(l,o)=>n.setItem(l,JSON.stringify(o,void 0)),removeItem:l=>n.removeItem(l)}}const A=t=>r=>{try{const n=t(r);return n instanceof Promise?n:{then(i){return A(i)(n)},catch(i){return this}}}catch(n){return{then(i){return this},catch(i){return A(i)(n)}}}},$=(t,r)=>(n,i,l)=>{let o={storage:U(()=>window.localStorage),partialize:p=>p,version:0,merge:(p,_)=>({..._,...p}),...r},y=!1,h=0;const a=new Set,u=new Set;let x=o.storage;if(!x)return t((...p)=>{console.warn(`[zustand persist middleware] Unable to update item '${o.name}', the given storage is currently unavailable.`),n(...p)},i,l);const v=()=>{const p=o.partialize({...i()});return x.setItem(o.name,{state:p,version:o.version})},z=l.setState;l.setState=(p,_)=>(z(p,_),v());const g=t((...p)=>(n(...p),v()),i,l);l.getInitialState=()=>g;let k;const w=()=>{var p,_;if(!x)return;const S=++h;y=!1,a.forEach(m=>{var f;return m((f=i())!=null?f:g)});const b=((_=o.onRehydrateStorage)==null?void 0:_.call(o,(p=i())!=null?p:g))||void 0;return A(x.getItem.bind(x))(o.name).then(m=>{if(m)if(typeof m.version=="number"&&m.version!==o.version){if(o.migrate){const f=o.migrate(m.state,m.version);return f instanceof Promise?f.then(E=>[!0,E]):[!0,f]}console.error("State loaded from storage couldn't be migrated since no migrate function was provided")}else return[!1,m.state];return[!1,void 0]}).then(m=>{var f;if(S!==h)return;const[E,P]=m;if(k=o.merge(P,(f=i())!=null?f:g),n(k,!0),E)return v()}).then(()=>{S===h&&(b==null||b(i(),void 0),k=i(),y=!0,u.forEach(m=>m(k)))}).catch(m=>{S===h&&(b==null||b(void 0,m))})};return l.persist={setOptions:p=>{o={...o,...p},p.storage&&(x=p.storage)},clearStorage:()=>{++h,x==null||x.removeItem(o.name)},getOptions:()=>o,rehydrate:()=>w(),hasHydrated:()=>y,onHydrate:p=>(a.add(p),()=>{a.delete(p)}),onFinishHydration:p=>(u.add(p),()=>{u.delete(p)})},o.skipHydration||w(),k||g},Z=$,I=N()(Z(t=>({activePanel:"overview",mode:"simple",theme:"dark",advancedOpen:!1,setPanel:r=>t({activePanel:r}),setMode:r=>t({mode:r,advancedOpen:r==="pro"}),setTheme:r=>t({theme:r}),toggleAdvanced:()=>t(r=>({advancedOpen:!r.advancedOpen}))}),{name:"cg-app-state",partialize:t=>({mode:t.mode,theme:t.theme,advancedOpen:t.advancedOpen})}));/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const G=t=>t.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),L=(...t)=>t.filter((r,n,i)=>!!r&&r.trim()!==""&&i.indexOf(r)===n).join(" ").trim();/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var Y={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const J=s.forwardRef(({color:t="currentColor",size:r=24,strokeWidth:n=2,absoluteStrokeWidth:i,className:l="",children:o,iconNode:y,...h},a)=>s.createElement("svg",{ref:a,...Y,width:r,height:r,stroke:t,strokeWidth:i?Number(n)*24/Number(r):n,className:L("lucide",l),...h},[...y.map(([u,x])=>s.createElement(u,x)),...Array.isArray(o)?o:[o]]));/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const c=(t,r)=>{const n=s.forwardRef(({className:i,...l},o)=>s.createElement(J,{ref:o,iconNode:r,className:L(`lucide-${G(t)}`,i),...l}));return n.displayName=`${t}`,n};/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const K=c("Bell",[["path",{d:"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9",key:"1qo2s2"}],["path",{d:"M10.3 21a1.94 1.94 0 0 0 3.4 0",key:"qgo35s"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Q=c("BookOpen",[["path",{d:"M12 7v14",key:"1akyts"}],["path",{d:"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",key:"ruj8y"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const X=c("ChartNoAxesColumn",[["line",{x1:"18",x2:"18",y1:"20",y2:"10",key:"1xfpm4"}],["line",{x1:"12",x2:"12",y1:"20",y2:"4",key:"be30l9"}],["line",{x1:"6",x2:"6",y1:"20",y2:"14",key:"1r4le6"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ee=c("ChevronDown",[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const te=c("ChevronRight",[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const re=c("Cpu",[["rect",{width:"16",height:"16",x:"4",y:"4",rx:"2",key:"14l7u7"}],["rect",{width:"6",height:"6",x:"9",y:"9",rx:"1",key:"5aljv4"}],["path",{d:"M15 2v2",key:"13l42r"}],["path",{d:"M15 20v2",key:"15mkzm"}],["path",{d:"M2 15h2",key:"1gxd5l"}],["path",{d:"M2 9h2",key:"1bbxkp"}],["path",{d:"M20 15h2",key:"19e6y8"}],["path",{d:"M20 9h2",key:"19tzq7"}],["path",{d:"M9 2v2",key:"165o2o"}],["path",{d:"M9 20v2",key:"i2bqo8"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ne=c("CreditCard",[["rect",{width:"20",height:"14",x:"2",y:"5",rx:"2",key:"ynyp8z"}],["line",{x1:"2",x2:"22",y1:"10",y2:"10",key:"1b3vmo"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ae=c("FileText",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ie=c("History",[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}],["path",{d:"M12 7v5l4 2",key:"1fdv2h"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const oe=c("House",[["path",{d:"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",key:"5wwlr5"}],["path",{d:"M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",key:"1d0kgt"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const se=c("Link2",[["path",{d:"M9 17H7A5 5 0 0 1 7 7h2",key:"8i5ue5"}],["path",{d:"M15 7h2a5 5 0 1 1 0 10h-2",key:"1b9ql8"}],["line",{x1:"8",x2:"16",y1:"12",y2:"12",key:"1jonct"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const le=c("List",[["path",{d:"M3 12h.01",key:"nlz23k"}],["path",{d:"M3 18h.01",key:"1tta3j"}],["path",{d:"M3 6h.01",key:"1rqtza"}],["path",{d:"M8 12h13",key:"1za7za"}],["path",{d:"M8 18h13",key:"1lx6n3"}],["path",{d:"M8 6h13",key:"ik3vkj"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const de=c("Menu",[["line",{x1:"4",x2:"20",y1:"12",y2:"12",key:"1e0a9i"}],["line",{x1:"4",x2:"20",y1:"6",y2:"6",key:"1owob3"}],["line",{x1:"4",x2:"20",y1:"18",y2:"18",key:"yk5zj1"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ce=c("Moon",[["path",{d:"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",key:"a7tn18"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const pe=c("Package",[["path",{d:"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",key:"1a0edw"}],["path",{d:"M12 22V12",key:"d0xqtd"}],["path",{d:"m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7",key:"yx3hmr"}],["path",{d:"m7.5 4.27 9 5.15",key:"1c824w"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const he=c("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ye=c("Server",[["rect",{width:"20",height:"8",x:"2",y:"2",rx:"2",ry:"2",key:"ngkwjq"}],["rect",{width:"20",height:"8",x:"2",y:"14",rx:"2",ry:"2",key:"iecqi9"}],["line",{x1:"6",x2:"6.01",y1:"6",y2:"6",key:"16zg32"}],["line",{x1:"6",x2:"6.01",y1:"18",y2:"18",key:"nzw8ys"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ue=c("Settings",[["path",{d:"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",key:"1qme2f"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const me=c("ShieldCheck",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const xe=c("Shield",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ve=c("Store",[["path",{d:"m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7",key:"ztvudi"}],["path",{d:"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8",key:"1b2hhj"}],["path",{d:"M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4",key:"2ebpfo"}],["path",{d:"M2 7h20",key:"1fcdvo"}],["path",{d:"M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7",key:"6c3vgh"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const fe=c("Sun",[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=c("Terminal",[["polyline",{points:"4 17 10 11 4 5",key:"akl6gq"}],["line",{x1:"12",x2:"20",y1:"19",y2:"19",key:"q2wloq"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ge=c("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _e=c("Zap",[["path",{d:"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",key:"1xq2db"}]]),ke=[{id:"overview",label:"Overview",icon:e.jsx(oe,{size:16}),modes:["simple","pro"]},{id:"calls",label:"Call Builder",icon:e.jsx(O,{size:16}),modes:["simple","pro"]},{id:"marketplace",label:"Browse Services",icon:e.jsx(ve,{size:16}),modes:["simple","pro"]},{id:"requests",label:"My Requests",icon:e.jsx(le,{size:16}),modes:["simple","pro"]},{id:"providers",label:"Providers",icon:e.jsx(ye,{size:16}),modes:["simple","pro"]},{id:"receipts",label:"Receipts",icon:e.jsx(ae,{size:16}),modes:["simple","pro"]}],be=[{id:"payments",label:"Payments",icon:e.jsx(ne,{size:16}),modes:["simple","pro"]},{id:"disputes",label:"Disputes",icon:e.jsx(xe,{size:16}),modes:["simple","pro"]},{id:"history",label:"History",icon:e.jsx(ie,{size:16}),modes:["simple","pro"]}],je=[{id:"quality",label:"Quality Disputes",icon:e.jsx(me,{size:16}),modes:["pro"]},{id:"agent",label:"Agent Loop",icon:e.jsx(re,{size:16}),modes:["pro"]},{id:"lending",label:"RepFi Lending",icon:e.jsx(ge,{size:16}),modes:["pro"]},{id:"futures",label:"SLA Futures",icon:e.jsx(pe,{size:16}),modes:["pro"]},{id:"attestation",label:"SLA Bridge",icon:e.jsx(se,{size:16}),modes:["pro"]},{id:"subscriptions",label:"Subscriptions",icon:e.jsx(he,{size:16}),modes:["pro"]},{id:"mcp",label:"API / MCP",icon:e.jsx(O,{size:16}),modes:["pro"]},{id:"webhooks",label:"Webhooks",icon:e.jsx(_e,{size:16}),modes:["pro"]},{id:"leaderboard",label:"Leaderboard",icon:e.jsx(X,{size:16}),modes:["pro"]},{id:"apidocs",label:"API Docs",icon:e.jsx(Q,{size:16}),modes:["pro"]}],ze=[{id:"notifications",label:"Notifications",icon:e.jsx(K,{size:16}),modes:["simple","pro"]},{id:"settings",label:"Settings",icon:e.jsx(ue,{size:16}),modes:["simple","pro"]}];function Se({onNav:t}){const{activePanel:r,setPanel:n,mode:i,advancedOpen:l,toggleAdvanced:o}=I(),y=({item:a})=>{if(!a.modes.includes(i))return null;const u=r===a.id;return e.jsxs("button",{onClick:()=>{n(a.id),t==null||t()},style:{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 12px",borderRadius:8,border:"none",background:u?"rgba(16,185,129,0.1)":"transparent",color:u?"var(--accent)":"var(--text-dim)",fontWeight:u?500:400,fontSize:13,cursor:"pointer",textAlign:"left",borderLeft:u?"2px solid var(--accent)":"2px solid transparent",transition:"all 0.15s"},children:[e.jsx("span",{style:{opacity:.8,display:"flex"},children:a.icon}),e.jsx("span",{children:a.label})]})},h=({label:a})=>e.jsx("div",{style:{padding:"8px 12px 4px",fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--text-faint)",fontWeight:600},children:a});return e.jsxs("aside",{style:{display:"flex",flexDirection:"column",gap:1,padding:"12px 8px",overflowY:"auto",height:"100%",width:"100%"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8,padding:"8px 12px 12px"},children:[e.jsx("div",{style:{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#10b981,#0ea5e9)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:11,fontWeight:700},children:"CG"}),e.jsxs("div",{children:[e.jsx("div",{style:{fontSize:13,fontWeight:600,color:"var(--text)"},children:"CallGuard"}),e.jsx("div",{style:{fontSize:11,color:"var(--text-faint)"},children:"Arc Testnet"})]})]}),e.jsx(h,{label:"Workspace"}),ke.map(a=>e.jsx(y,{item:a},a.id)),e.jsx(h,{label:"Settlement"}),be.map(a=>e.jsx(y,{item:a},a.id)),i==="pro"&&e.jsxs(e.Fragment,{children:[e.jsxs("button",{onClick:o,style:{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"8px 12px 4px",border:"none",background:"transparent",cursor:"pointer",fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--text-faint)",fontWeight:600},children:[e.jsx("span",{children:"Advanced"}),l?e.jsx(ee,{size:11}):e.jsx(te,{size:11})]}),l&&je.map(a=>e.jsx(y,{item:a},a.id))]}),e.jsx(h,{label:"System"}),ze.map(a=>e.jsx(y,{item:a},a.id))]})}function Ee(t){return T({address:t,token:D.usdc})}function Ae({onMenuClick:t}){const{address:r}=V(),{mode:n,setMode:i,theme:l,setTheme:o}=I(),{data:y}=Ee(r),h=y?parseFloat(q(y.value,y.decimals)).toFixed(2):null;return e.jsxs("header",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",height:48,borderBottom:"1px solid var(--border)",position:"sticky",top:0,zIndex:50,background:"rgba(7,11,18,0.85)",backdropFilter:"blur(16px)",flexShrink:0},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:10},children:[e.jsx("button",{onClick:t,style:{display:"flex",alignItems:"center",justifyContent:"center",width:32,height:32,borderRadius:8,border:"none",background:"transparent",color:"var(--text-dim)",cursor:"pointer"},children:e.jsx(de,{size:16})}),e.jsx("div",{style:{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#10b981,#0ea5e9)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:11,fontWeight:700},children:"CG"}),e.jsxs("span",{style:{display:"flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:999,background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.2)",color:"var(--accent)",fontSize:11,fontWeight:500},children:[e.jsx("span",{style:{width:6,height:6,borderRadius:"50%",background:"var(--accent)",animation:"pulse 2s infinite"}}),"Arc Testnet"]})]}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8},children:[h&&e.jsxs("span",{style:{fontSize:11,color:"var(--text-dim)",fontFamily:"var(--font-mono)"},children:[h," USDC"]}),e.jsx("div",{style:{display:"flex",borderRadius:8,overflow:"hidden",border:"1px solid var(--border)",fontSize:11},children:["simple","pro"].map(a=>e.jsx("button",{onClick:()=>i(a),style:{padding:"3px 8px",border:"none",background:n===a?"rgba(16,185,129,0.15)":"transparent",color:n===a?"var(--accent)":"var(--text-dim)",fontWeight:n===a?600:400,cursor:"pointer",textTransform:"capitalize"},children:a.charAt(0).toUpperCase()+a.slice(1)},a))}),e.jsx("button",{onClick:()=>o(l==="dark"?"light":"dark"),style:{padding:6,borderRadius:8,border:"none",background:"transparent",color:"var(--text-dim)",cursor:"pointer"},children:l==="dark"?e.jsx(fe,{size:14}):e.jsx(ce,{size:14})}),e.jsx(H,{})]})]})}const Ie={overview:s.lazy(()=>d(()=>import("./Overview-DFV03qX5.js"),__vite__mapDeps([0,1,2,3,4]))),calls:s.lazy(()=>d(()=>import("./CallBuilder-D-BbF3hT.js"),__vite__mapDeps([5,1,2,4,6,7,8,9]))),marketplace:s.lazy(()=>d(()=>import("./Marketplace-BGLYKeaG.js"),__vite__mapDeps([10,1,2,3]))),requests:s.lazy(()=>d(()=>import("./Requests-j6cLKzmX.js"),__vite__mapDeps([11,1,2,3]))),providers:s.lazy(()=>d(()=>import("./Providers-BjkQ7k4E.js"),__vite__mapDeps([12,1,2,3]))),receipts:s.lazy(()=>d(()=>import("./Receipts-XsZHXIkI.js"),__vite__mapDeps([13,1,2,3]))),payments:s.lazy(()=>d(()=>import("./Payments-CU-c1Efd.js"),__vite__mapDeps([14,1,2,3,4,6,7,15]))),disputes:s.lazy(()=>d(()=>import("./Disputes-FeydrJ4H.js"),__vite__mapDeps([16,1,2,4,6,7]))),history:s.lazy(()=>d(()=>import("./History-BGcLGBK9.js"),__vite__mapDeps([17,1,2,3]))),quality:s.lazy(()=>d(()=>import("./Quality-DlpO1rRY.js"),__vite__mapDeps([18,1,2,6,7,8,9]))),agent:s.lazy(()=>d(()=>import("./Agent-YfE3ICGV.js"),__vite__mapDeps([19,1,2,6,7,4,15]))),lending:s.lazy(()=>d(()=>import("./Lending-Doe49QIp.js"),__vite__mapDeps([20,1,2,6,7,8,9,4,15]))),futures:s.lazy(()=>d(()=>import("./Futures-C0u5xldA.js"),__vite__mapDeps([21,1,2,6,7,8,9,4,15]))),attestation:s.lazy(()=>d(()=>import("./Attestation-CHlrUIpf.js"),__vite__mapDeps([22,1,2,6,7,8,9]))),subscriptions:s.lazy(()=>d(()=>import("./Subscriptions-D9Y_eAJG.js"),__vite__mapDeps([23,1,2,3,6,7,15]))),mcp:s.lazy(()=>d(()=>import("./Mcp-Bv8885Nb.js"),__vite__mapDeps([24,1,2,3]))),webhooks:s.lazy(()=>d(()=>import("./Webhooks-v0jlU5jJ.js"),__vite__mapDeps([25,1,2]))),leaderboard:s.lazy(()=>d(()=>import("./Leaderboard-BJ0PNST0.js"),__vite__mapDeps([26,1,2,3]))),apidocs:s.lazy(()=>d(()=>import("./ApiDocs-DLQLk8JH.js"),__vite__mapDeps([27,1,2]))),verify:s.lazy(()=>d(()=>import("./Verify-BCsUuvA1.js"),__vite__mapDeps([28,1,2]))),provprofile:s.lazy(()=>d(()=>import("./ProviderProfile-B4HzpKgU.js"),__vite__mapDeps([29,1,2,4]))),analytics:s.lazy(()=>d(()=>import("./Analytics-C-uufWzt.js"),__vite__mapDeps([30,1,2,3]))),notifications:s.lazy(()=>d(()=>import("./Notifications-Nn6O74cj.js"),__vite__mapDeps([31,1,2]))),settings:s.lazy(()=>d(()=>import("./SettingsPanel-DtyDpbDf.js"),__vite__mapDeps([32,1,2]))),jobs:s.lazy(()=>d(()=>import("./Jobs-DAnP67A-.js"),__vite__mapDeps([33,1,2,6,7]))),bulkcall:s.lazy(()=>d(()=>import("./BulkCall-BSPIytw6.js"),__vite__mapDeps([34,1,2,6,7]))),register:s.lazy(()=>d(()=>import("./Register-DHMIvSXm.js"),__vite__mapDeps([35,1,2,6,7,8,9,15])))};function R(){return e.jsx("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:200,color:"var(--text-faint)",fontSize:13},children:e.jsx("span",{children:"Loading…"})})}function we(){const{activePanel:t,theme:r}=I(),[n,i]=s.useState(!1),l=Ie[t];return e.jsxs("div",{style:{minHeight:"100vh",display:"flex",flexDirection:"column",background:"var(--bg-0)",color:"var(--text)",fontFamily:"var(--font-sans)"},"data-theme":r,children:[e.jsx(Ae,{onMenuClick:()=>i(o=>!o)}),e.jsxs("div",{style:{display:"flex",flex:1,overflow:"hidden",position:"relative"},children:[n&&e.jsx("div",{onClick:()=>i(!1),style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:40}}),e.jsx("div",{style:{width:220,flexShrink:0,borderRight:"1px solid var(--border)",background:"var(--bg-1)",overflowY:"auto",position:"sticky",top:0,height:"calc(100vh - 48px)",...typeof window<"u"&&window.innerWidth<768?{position:"fixed",top:48,left:n?0:-220,height:"calc(100vh - 48px)",zIndex:50,transition:"left 0.25s ease"}:{}},children:e.jsx(Se,{onNav:()=>i(!1)})}),e.jsx("main",{style:{flex:1,overflowY:"auto",background:"var(--bg-0)",minWidth:0},children:e.jsx(s.Suspense,{fallback:e.jsx(R,{}),children:l?e.jsx(l,{}):e.jsx(R,{})})})]})]})}const Ce=Object.freeze(Object.defineProperty({__proto__:null,default:we},Symbol.toStringTag,{value:"Module"}));export{Ce as A,c,I as u};
