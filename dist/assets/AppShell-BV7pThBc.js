const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/Overview-tDmmIOpO.js","assets/index-CXjQ1YFV.js","assets/index-D_415SEt.css","assets/useSubgraph-CZ5n_Svj.js","assets/useWriteContract-hTV67_RC.js","assets/writeContract-YXceXWO1.js","assets/sendTransaction-sMf8P2IO.js","assets/watchContractEvent-cRbEd5fb.js","assets/parseEventLogs-krD9ZcQM.js","assets/chevron-up-JqB-CPLG.js","assets/external-link-uvPYXh4v.js","assets/CallBuilder-BYQtB75p.js","assets/useWalletClient-DaontP0O.js","assets/waitForCallsStatus-BPaN5KCq.js","assets/sendRawTransactionSync-DUR_ty4s.js","assets/parseUnits-DAD0pNPA.js","assets/waitForTransactionReceipt-BVNDWBxa.js","assets/typedData-zKeyuwqP.js","assets/useWaitForTransactionReceipt-CsfRpRFG.js","assets/Marketplace-dIfDaLv2.js","assets/Requests-3ETYHpKA.js","assets/Providers-DGmm_RS7.js","assets/Receipts-D5GEBM0x.js","assets/Payments-BK2ESfA1.js","assets/Disputes-C26ux_aG.js","assets/usePublicClient-DBP4Sh_7.js","assets/public-C95hsdTd.js","assets/secp256k1-_CVIctgW.js","assets/hashTypedData-BZhWtYM_.js","assets/History-CYf36fpa.js","assets/Quality-CbLJhMFL.js","assets/Agent-B1zcrMhO.js","assets/Lending-CppxXNAU.js","assets/Futures-BmhHTxG4.js","assets/Attestation-Ct2z_kuM.js","assets/Subscriptions-CTcVEsJS.js","assets/Mcp-DGlAf9t1.js","assets/Webhooks-CxnGWlBR.js","assets/Leaderboard-DkJksHJf.js","assets/ApiDocs-D2Z25oYZ.js","assets/Verify-zjQkTxHm.js","assets/circle-check-big-BkZGZKdW.js","assets/ProviderProfile-C1gAVdSi.js","assets/Analytics-BLTw2Zd3.js","assets/Notifications-BYENz2kQ.js","assets/SettingsPanel-CFf80_wG.js","assets/Jobs-B3vzzgSh.js","assets/BulkCall-CWrlCEQn.js","assets/Register-CXHN6r98.js","assets/Nano-CGiUQejq.js","assets/Privacy-DPkcRP4o.js","assets/Bridge-s7rV3Ryg.js"])))=>i.map(i=>d[i]);
import{a as H,f as W,u as N,b as U,c as $,s as Z,R as w,r as s,j as e,d as R,C,e as Q,g as G,h as T,i as Y,_ as d}from"./index-CXjQ1YFV.js";function K(t,a={}){return{async queryFn({queryKey:r}){const o=a.abi;if(!o)throw new Error("abi is required");const{functionName:i,scopeKey:l,...u}=r[1],y=(()=>{const n=r[1];if(n.address)return{address:n.address};if(n.code)return{code:n.code};throw new Error("address or code is required")})();if(!i)throw new Error("functionName is required");return H(t,{abi:o,functionName:i,args:u.args,...y,...u})},queryKey:J(a)}}function J(t={}){const{abi:a,...r}=t;return["readContract",W(r)]}function X(t={}){const{abi:a,address:r,functionName:o,query:i={}}=t,l=t.code,u=N(t),y=U({config:u}),n=K(u,{...t,chainId:t.chainId??y}),h=!!((r||l)&&a&&o&&(i.enabled??!0));return $({...i,...n,enabled:h,structuralSharing:i.structuralSharing??Z})}const L=t=>{let a;const r=new Set,o=(h,m)=>{const v=typeof h=="function"?h(a):h;if(!Object.is(v,a)){const j=a;a=m??(typeof v!="object"||v===null)?v:Object.assign({},a,v),r.forEach(g=>g(a,j))}},i=()=>a,y={setState:o,getState:i,getInitialState:()=>n,subscribe:h=>(r.add(h),()=>r.delete(h))},n=a=t(o,i,y);return y},ee=t=>t?L(t):L,te=t=>t;function ae(t,a=te){const r=w.useSyncExternalStore(t.subscribe,w.useCallback(()=>a(t.getState()),[t,a]),w.useCallback(()=>a(t.getInitialState()),[t,a]));return w.useDebugValue(r),r}const O=t=>{const a=ee(t),r=o=>ae(a,o);return Object.assign(r,a),r},re=t=>t?O(t):O;function ne(t,a){let r;try{r=t()}catch{return}return{getItem:i=>{var l;const u=n=>n===null?null:JSON.parse(n,void 0),y=(l=r.getItem(i))!=null?l:null;return y instanceof Promise?y.then(u):u(y)},setItem:(i,l)=>r.setItem(i,JSON.stringify(l,void 0)),removeItem:i=>r.removeItem(i)}}const A=t=>a=>{try{const r=t(a);return r instanceof Promise?r:{then(o){return A(o)(r)},catch(o){return this}}}catch(r){return{then(o){return this},catch(o){return A(o)(r)}}}},oe=(t,a)=>(r,o,i)=>{let l={storage:ne(()=>window.localStorage),partialize:p=>p,version:0,merge:(p,b)=>({...b,...p}),...a},u=!1,y=0;const n=new Set,h=new Set;let m=l.storage;if(!m)return t((...p)=>{console.warn(`[zustand persist middleware] Unable to update item '${l.name}', the given storage is currently unavailable.`),r(...p)},o,i);const v=()=>{const p=l.partialize({...o()});return m.setItem(l.name,{state:p,version:l.version})},j=i.setState;i.setState=(p,b)=>(j(p,b),v());const g=t((...p)=>(r(...p),v()),o,i);i.getInitialState=()=>g;let _;const z=()=>{var p,b;if(!m)return;const f=++y;u=!1,n.forEach(x=>{var k;return x((k=o())!=null?k:g)});const S=((b=l.onRehydrateStorage)==null?void 0:b.call(l,(p=o())!=null?p:g))||void 0;return A(m.getItem.bind(m))(l.name).then(x=>{if(x)if(typeof x.version=="number"&&x.version!==l.version){if(l.migrate){const k=l.migrate(x.state,x.version);return k instanceof Promise?k.then(E=>[!0,E]):[!0,k]}console.error("State loaded from storage couldn't be migrated since no migrate function was provided")}else return[!1,x.state];return[!1,void 0]}).then(x=>{var k;if(f!==y)return;const[E,F]=x;if(_=l.merge(F,(k=o())!=null?k:g),r(_,!0),E)return v()}).then(()=>{f===y&&(S==null||S(o(),void 0),_=o(),u=!0,h.forEach(x=>x(_)))}).catch(x=>{f===y&&(S==null||S(void 0,x))})};return i.persist={setOptions:p=>{l={...l,...p},p.storage&&(m=p.storage)},clearStorage:()=>{++y,m==null||m.removeItem(l.name)},getOptions:()=>l,rehydrate:()=>z(),hasHydrated:()=>u,onHydrate:p=>(n.add(p),()=>{n.delete(p)}),onFinishHydration:p=>(h.add(p),()=>{h.delete(p)})},l.skipHydration||z(),_||g},ie=oe,M=re()(ie(t=>({activePanel:"overview",mode:"simple",theme:"dark",advancedOpen:!1,setPanel:a=>t({activePanel:a}),setMode:a=>t({mode:a,advancedOpen:a==="pro"}),setTheme:a=>t({theme:a}),toggleAdvanced:()=>t(a=>({advancedOpen:!a.advancedOpen}))}),{name:"cg-app-state",partialize:t=>({mode:t.mode,theme:t.theme,advancedOpen:t.advancedOpen})}));/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const se=t=>t.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),D=(...t)=>t.filter((a,r,o)=>!!a&&a.trim()!==""&&o.indexOf(a)===r).join(" ").trim();/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var le={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const de=s.forwardRef(({color:t="currentColor",size:a=24,strokeWidth:r=2,absoluteStrokeWidth:o,className:i="",children:l,iconNode:u,...y},n)=>s.createElement("svg",{ref:n,...le,width:a,height:a,stroke:t,strokeWidth:o?Number(r)*24/Number(a):r,className:D("lucide",i),...y},[...u.map(([h,m])=>s.createElement(h,m)),...Array.isArray(l)?l:[l]]));/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const c=(t,a)=>{const r=s.forwardRef(({className:o,...i},l)=>s.createElement(de,{ref:l,iconNode:a,className:D(`lucide-${se(t)}`,o),...i}));return r.displayName=`${t}`,r};/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ce=c("Bell",[["path",{d:"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9",key:"1qo2s2"}],["path",{d:"M10.3 21a1.94 1.94 0 0 0 3.4 0",key:"qgo35s"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const pe=c("BookOpen",[["path",{d:"M12 7v14",key:"1akyts"}],["path",{d:"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",key:"ruj8y"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ue=c("ChartNoAxesColumn",[["line",{x1:"18",x2:"18",y1:"20",y2:"10",key:"1xfpm4"}],["line",{x1:"12",x2:"12",y1:"20",y2:"4",key:"be30l9"}],["line",{x1:"6",x2:"6",y1:"20",y2:"14",key:"1r4le6"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ye=c("Check",[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const he=c("ChevronDown",[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const me=c("ChevronRight",[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const xe=c("Copy",[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ve=c("Cpu",[["rect",{width:"16",height:"16",x:"4",y:"4",rx:"2",key:"14l7u7"}],["rect",{width:"6",height:"6",x:"9",y:"9",rx:"1",key:"5aljv4"}],["path",{d:"M15 2v2",key:"13l42r"}],["path",{d:"M15 20v2",key:"15mkzm"}],["path",{d:"M2 15h2",key:"1gxd5l"}],["path",{d:"M2 9h2",key:"1bbxkp"}],["path",{d:"M20 15h2",key:"19e6y8"}],["path",{d:"M20 9h2",key:"19tzq7"}],["path",{d:"M9 2v2",key:"165o2o"}],["path",{d:"M9 20v2",key:"i2bqo8"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const fe=c("CreditCard",[["rect",{width:"20",height:"14",x:"2",y:"5",rx:"2",key:"ynyp8z"}],["line",{x1:"2",x2:"22",y1:"10",y2:"10",key:"1b3vmo"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ge=c("FileText",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const be=c("History",[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}],["path",{d:"M12 7v5l4 2",key:"1fdv2h"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ke=c("House",[["path",{d:"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",key:"5wwlr5"}],["path",{d:"M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",key:"1d0kgt"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _e=c("Layers",[["path",{d:"m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z",key:"8b97xw"}],["path",{d:"m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65",key:"dd6zsq"}],["path",{d:"m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65",key:"ep9fru"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const je=c("Link2",[["path",{d:"M9 17H7A5 5 0 0 1 7 7h2",key:"8i5ue5"}],["path",{d:"M15 7h2a5 5 0 1 1 0 10h-2",key:"1b9ql8"}],["line",{x1:"8",x2:"16",y1:"12",y2:"12",key:"1jonct"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ze=c("List",[["path",{d:"M3 12h.01",key:"nlz23k"}],["path",{d:"M3 18h.01",key:"1tta3j"}],["path",{d:"M3 6h.01",key:"1rqtza"}],["path",{d:"M8 12h13",key:"1za7za"}],["path",{d:"M8 18h13",key:"1lx6n3"}],["path",{d:"M8 6h13",key:"ik3vkj"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Se=c("LogOut",[["path",{d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",key:"1uf3rs"}],["polyline",{points:"16 17 21 12 16 7",key:"1gabdz"}],["line",{x1:"21",x2:"9",y1:"12",y2:"12",key:"1uyos4"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const we=c("Menu",[["line",{x1:"4",x2:"20",y1:"12",y2:"12",key:"1e0a9i"}],["line",{x1:"4",x2:"20",y1:"6",y2:"6",key:"1owob3"}],["line",{x1:"4",x2:"20",y1:"18",y2:"18",key:"yk5zj1"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ce=c("Moon",[["path",{d:"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",key:"a7tn18"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ee=c("Package",[["path",{d:"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",key:"1a0edw"}],["path",{d:"M12 22V12",key:"d0xqtd"}],["path",{d:"m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7",key:"yx3hmr"}],["path",{d:"m7.5 4.27 9 5.15",key:"1c824w"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ie=c("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ae=c("Server",[["rect",{width:"20",height:"8",x:"2",y:"2",rx:"2",ry:"2",key:"ngkwjq"}],["rect",{width:"20",height:"8",x:"2",y:"14",rx:"2",ry:"2",key:"iecqi9"}],["line",{x1:"6",x2:"6.01",y1:"6",y2:"6",key:"16zg32"}],["line",{x1:"6",x2:"6.01",y1:"18",y2:"18",key:"nzw8ys"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Re=c("Settings",[["path",{d:"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",key:"1qme2f"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Me=c("ShieldCheck",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const V=c("Shield",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Le=c("Store",[["path",{d:"m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7",key:"ztvudi"}],["path",{d:"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8",key:"1b2hhj"}],["path",{d:"M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4",key:"2ebpfo"}],["path",{d:"M2 7h20",key:"1fcdvo"}],["path",{d:"M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7",key:"6c3vgh"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Oe=c("Sun",[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const q=c("Terminal",[["polyline",{points:"4 17 10 11 4 5",key:"akl6gq"}],["line",{x1:"12",x2:"20",y1:"19",y2:"19",key:"q2wloq"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Pe=c("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const B=c("Zap",[["path",{d:"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",key:"1xq2db"}]]),Te=[{id:"overview",label:"Overview",icon:e.jsx(ke,{size:16}),modes:["simple","pro"]},{id:"calls",label:"Call Builder",icon:e.jsx(q,{size:16}),modes:["simple","pro"]},{id:"marketplace",label:"Browse Services",icon:e.jsx(Le,{size:16}),modes:["simple","pro"]},{id:"requests",label:"My Requests",icon:e.jsx(ze,{size:16}),modes:["simple","pro"]},{id:"providers",label:"Providers",icon:e.jsx(Ae,{size:16}),modes:["simple","pro"]},{id:"receipts",label:"Receipts",icon:e.jsx(ge,{size:16}),modes:["simple","pro"]}],De=[{id:"payments",label:"Payments",icon:e.jsx(fe,{size:16}),modes:["simple","pro"]},{id:"disputes",label:"Disputes",icon:e.jsx(V,{size:16}),modes:["simple","pro"]},{id:"history",label:"History",icon:e.jsx(be,{size:16}),modes:["simple","pro"]},{id:"nano",label:"Nanopayment",icon:e.jsx(B,{size:16}),modes:["simple","pro"]}],Ve=[{id:"quality",label:"Quality Disputes",icon:e.jsx(Me,{size:16}),modes:["pro"]},{id:"agent",label:"Agent Loop",icon:e.jsx(ve,{size:16}),modes:["pro"]},{id:"lending",label:"RepFi Lending",icon:e.jsx(Pe,{size:16}),modes:["pro"]},{id:"futures",label:"SLA Futures",icon:e.jsx(Ee,{size:16}),modes:["pro"]},{id:"attestation",label:"SLA Bridge",icon:e.jsx(je,{size:16}),modes:["pro"]},{id:"bridge",label:"CCTP Bridge",icon:e.jsx(_e,{size:16}),modes:["simple","pro"]},{id:"subscriptions",label:"Subscriptions",icon:e.jsx(Ie,{size:16}),modes:["pro"]},{id:"mcp",label:"API / MCP",icon:e.jsx(q,{size:16}),modes:["pro"]},{id:"webhooks",label:"Webhooks",icon:e.jsx(B,{size:16}),modes:["pro"]},{id:"leaderboard",label:"Leaderboard",icon:e.jsx(ue,{size:16}),modes:["pro"]},{id:"apidocs",label:"API Docs",icon:e.jsx(pe,{size:16}),modes:["pro"]}],qe=[{id:"notifications",label:"Notifications",icon:e.jsx(ce,{size:16}),modes:["simple","pro"]},{id:"privacy",label:"Privacy",icon:e.jsx(V,{size:16}),modes:["simple","pro"]},{id:"settings",label:"Settings",icon:e.jsx(Re,{size:16}),modes:["simple","pro"]}];function Be({onNav:t}){const{activePanel:a,setPanel:r,mode:o,advancedOpen:i,toggleAdvanced:l}=M(),u=({item:n})=>{if(!n.modes.includes(o))return null;const h=a===n.id;return e.jsxs("button",{onClick:()=>{r(n.id),t==null||t()},style:{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 12px",borderRadius:8,border:"none",background:h?"rgba(16,185,129,0.1)":"transparent",color:h?"var(--accent)":"var(--text-dim)",fontWeight:h?500:400,fontSize:13,cursor:"pointer",textAlign:"left",borderLeft:h?"2px solid var(--accent)":"2px solid transparent",transition:"all 0.15s"},children:[e.jsx("span",{style:{opacity:.8,display:"flex"},children:n.icon}),e.jsx("span",{children:n.label})]})},y=({label:n})=>e.jsx("div",{style:{padding:"8px 12px 4px",fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--text-faint)",fontWeight:600},children:n});return e.jsxs("aside",{style:{display:"flex",flexDirection:"column",gap:1,padding:"12px 8px",overflowY:"auto",height:"100%",width:"100%"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8,padding:"8px 12px 12px"},children:[e.jsx("div",{style:{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#10b981,#0ea5e9)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:11,fontWeight:700},children:"CG"}),e.jsxs("div",{children:[e.jsx("div",{style:{fontSize:13,fontWeight:600,color:"var(--text)"},children:"CallGuard"}),e.jsx("div",{style:{fontSize:11,color:"var(--text-faint)"},children:"Arc Testnet"})]})]}),e.jsx(y,{label:"Workspace"}),Te.map(n=>e.jsx(u,{item:n},n.id)),e.jsx(y,{label:"Settlement"}),De.map(n=>e.jsx(u,{item:n},n.id)),o==="pro"&&e.jsxs(e.Fragment,{children:[e.jsxs("button",{onClick:l,style:{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"8px 12px 4px",border:"none",background:"transparent",cursor:"pointer",fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--text-faint)",fontWeight:600},children:[e.jsx("span",{children:"Advanced"}),i?e.jsx(he,{size:11}):e.jsx(me,{size:11})]}),i&&Ve.map(n=>e.jsx(u,{item:n},n.id))]}),e.jsx(y,{label:"System"}),qe.map(n=>e.jsx(u,{item:n},n.id))]})}function Fe(t){return R({address:t,token:C.usdc})}function He(t){return R({address:t,token:C.eurcAddress})}function We(t){return R({address:t,token:C.usycAddress})}const Ne=[{name:"getReferenceData",type:"function",stateMutability:"view",inputs:[{name:"base",type:"string"},{name:"quote",type:"string"}],outputs:[{name:"rate",type:"uint256"},{name:"lastUpdatedBase",type:"uint256"},{name:"lastUpdatedQuote",type:"uint256"}]}];function Ue(t=!1){return X({address:C.bandOracleAddress,abi:Ne,functionName:"getReferenceData",args:["USDC","USD"],query:{enabled:t}})}function I({symbol:t,value:a,decimals:r,color:o}){const i=parseFloat(T(a,r)).toFixed(2);return e.jsxs("span",{style:{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:6,background:"var(--bg-3)",border:"1px solid var(--border)",fontSize:11,fontFamily:"var(--font-mono)",color:"var(--text-dim)",whiteSpace:"nowrap"},children:[e.jsx("span",{style:{color:o,fontWeight:700},children:t}),e.jsx("span",{style:{color:"var(--text)"},children:i})]})}function $e({onMenuClick:t}){const{address:a,isConnected:r}=Q(),{disconnect:o}=G(),{mode:i,setMode:l,theme:u,setTheme:y}=M(),{data:n}=Fe(a),{data:h}=He(r?a:void 0),{data:m}=We(r?a:void 0),{data:v}=Ue(r),[j,g]=s.useState(!1),_=v?Number(v[0])/1e18:1,z=s.useCallback(async()=>{if(a)try{await navigator.clipboard.writeText(a),g(!0),setTimeout(()=>g(!1),2e3)}catch{}},[a]),p=f=>`${f.slice(0,6)}…${f.slice(-4)}`,b=n?(parseFloat(T(n.value,n.decimals))*_).toFixed(2):null;return e.jsxs("header",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",height:48,borderBottom:"1px solid var(--border)",position:"sticky",top:0,zIndex:50,background:"rgba(7,11,18,0.85)",backdropFilter:"blur(16px)",flexShrink:0,gap:8},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8,minWidth:0},children:[e.jsx("button",{onClick:t,style:{display:"flex",alignItems:"center",justifyContent:"center",width:32,height:32,borderRadius:8,border:"none",background:"transparent",color:"var(--text-dim)",cursor:"pointer",flexShrink:0},title:"Toggle sidebar",children:e.jsx(we,{size:16})}),e.jsx("div",{style:{width:26,height:26,borderRadius:7,background:"var(--gradient-brand)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:10,fontWeight:800,flexShrink:0,fontFamily:"var(--font-display)"},children:"CG"}),e.jsx("span",{style:{fontFamily:"var(--font-display)",fontWeight:700,fontSize:14,color:"var(--text)",display:"none"},className:"brand-name",children:"CallGuard"}),e.jsxs("span",{style:{display:"flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:999,background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.2)",color:"var(--accent)",fontSize:10,fontWeight:500,whiteSpace:"nowrap",flexShrink:0},children:[e.jsx("span",{style:{width:6,height:6,borderRadius:"50%",background:"var(--accent)",animation:"pulse 2s infinite"}}),"Arc Testnet"]})]}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"nowrap",overflow:"hidden"},children:[r&&n&&e.jsx(I,{symbol:"USDC",value:n.value,decimals:n.decimals,color:"var(--accent)"}),r&&h&&h.value>0n&&e.jsx(I,{symbol:"EURC",value:h.value,decimals:h.decimals,color:"#3b82f6"}),r&&m&&m.value>0n&&e.jsx(I,{symbol:"USYC",value:m.value,decimals:m.decimals,color:"#f59e0b"}),r&&b&&v&&e.jsxs("span",{style:{fontSize:10,color:"var(--text-faint)",fontFamily:"var(--font-mono)",whiteSpace:"nowrap"},children:["≈$",b]}),r&&a&&e.jsxs("button",{onClick:z,title:"Click to copy address",style:{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:6,background:"var(--bg-3)",border:"1px solid var(--border)",color:"var(--text-dim)",fontSize:11,cursor:"pointer",fontFamily:"var(--font-mono)",whiteSpace:"nowrap"},children:[j?e.jsx(ye,{size:10,color:"var(--accent)"}):e.jsx(xe,{size:10}),p(a)]}),e.jsx("div",{style:{display:"flex",borderRadius:8,overflow:"hidden",border:"1px solid var(--border)",fontSize:10,flexShrink:0},children:["simple","pro"].map(f=>e.jsx("button",{onClick:()=>l(f),style:{padding:"3px 7px",border:"none",background:i===f?"rgba(16,185,129,0.15)":"transparent",color:i===f?"var(--accent)":"var(--text-dim)",fontWeight:i===f?600:400,cursor:"pointer",textTransform:"capitalize",fontSize:10},children:f==="simple"?"S":"P"},f))}),e.jsx("button",{onClick:()=>y(u==="dark"?"light":"dark"),style:{padding:5,borderRadius:8,border:"none",background:"transparent",color:"var(--text-dim)",cursor:"pointer",flexShrink:0},title:`Switch to ${u==="dark"?"light":"dark"} theme`,children:u==="dark"?e.jsx(Oe,{size:13}):e.jsx(Ce,{size:13})}),r&&e.jsx("button",{onClick:()=>o(),title:"Disconnect wallet",style:{padding:5,borderRadius:8,border:"none",background:"transparent",color:"var(--danger)",cursor:"pointer",flexShrink:0,opacity:.7},children:e.jsx(Se,{size:13})}),e.jsx(Y,{})]})]})}const Ze={overview:s.lazy(()=>d(()=>import("./Overview-tDmmIOpO.js"),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10]))),calls:s.lazy(()=>d(()=>import("./CallBuilder-BYQtB75p.js"),__vite__mapDeps([11,1,2,12,6,13,14,15,16,17,5,8,4,18]))),marketplace:s.lazy(()=>d(()=>import("./Marketplace-dIfDaLv2.js"),__vite__mapDeps([19,1,2,3]))),requests:s.lazy(()=>d(()=>import("./Requests-3ETYHpKA.js"),__vite__mapDeps([20,1,2,3,4,5,6,18,16]))),providers:s.lazy(()=>d(()=>import("./Providers-DGmm_RS7.js"),__vite__mapDeps([21,1,2,10,9]))),receipts:s.lazy(()=>d(()=>import("./Receipts-D5GEBM0x.js"),__vite__mapDeps([22,1,2,3]))),payments:s.lazy(()=>d(()=>import("./Payments-BK2ESfA1.js"),__vite__mapDeps([23,1,2,3,4,5,6,15]))),disputes:s.lazy(()=>d(()=>import("./Disputes-C26ux_aG.js"),__vite__mapDeps([24,1,2,3,25,26,7,8,14,6,15,16,27,28,17,4,5,18]))),history:s.lazy(()=>d(()=>import("./History-CYf36fpa.js"),__vite__mapDeps([29,1,2,3]))),quality:s.lazy(()=>d(()=>import("./Quality-CbLJhMFL.js"),__vite__mapDeps([30,1,2,4,5,6,18,16]))),agent:s.lazy(()=>d(()=>import("./Agent-B1zcrMhO.js"),__vite__mapDeps([31,1,2,12,6,13,14,15,16,17,5,8,4]))),lending:s.lazy(()=>d(()=>import("./Lending-CppxXNAU.js"),__vite__mapDeps([32,1,2,4,5,6,15]))),futures:s.lazy(()=>d(()=>import("./Futures-BmhHTxG4.js"),__vite__mapDeps([33,1,2,4,5,6,15]))),attestation:s.lazy(()=>d(()=>import("./Attestation-Ct2z_kuM.js"),__vite__mapDeps([34,1,2,4,5,6,18,16]))),subscriptions:s.lazy(()=>d(()=>import("./Subscriptions-CTcVEsJS.js"),__vite__mapDeps([35,1,2,3,4,5,6,15]))),mcp:s.lazy(()=>d(()=>import("./Mcp-DGlAf9t1.js"),__vite__mapDeps([36,1,2,3]))),webhooks:s.lazy(()=>d(()=>import("./Webhooks-CxnGWlBR.js"),__vite__mapDeps([37,1,2]))),leaderboard:s.lazy(()=>d(()=>import("./Leaderboard-DkJksHJf.js"),__vite__mapDeps([38,1,2,3]))),apidocs:s.lazy(()=>d(()=>import("./ApiDocs-D2Z25oYZ.js"),__vite__mapDeps([39,1,2]))),verify:s.lazy(()=>d(()=>import("./Verify-zjQkTxHm.js"),__vite__mapDeps([40,1,2,25,26,7,8,14,6,15,16,27,28,17,12,13,5,4,18,41,10]))),provprofile:s.lazy(()=>d(()=>import("./ProviderProfile-C1gAVdSi.js"),__vite__mapDeps([42,1,2]))),analytics:s.lazy(()=>d(()=>import("./Analytics-BLTw2Zd3.js"),__vite__mapDeps([43,1,2]))),notifications:s.lazy(()=>d(()=>import("./Notifications-BYENz2kQ.js"),__vite__mapDeps([44,1,2]))),settings:s.lazy(()=>d(()=>import("./SettingsPanel-CFf80_wG.js"),__vite__mapDeps([45,1,2]))),jobs:s.lazy(()=>d(()=>import("./Jobs-B3vzzgSh.js"),__vite__mapDeps([46,1,2,12,6,13,14,15,16,17,5,8,25,26,7,27,28,41]))),bulkcall:s.lazy(()=>d(()=>import("./BulkCall-CWrlCEQn.js"),__vite__mapDeps([47,1,2,4,5,6]))),register:s.lazy(()=>d(()=>import("./Register-CXHN6r98.js"),__vite__mapDeps([48,1,2,12,6,13,14,15,16,17,5,8,25,26,7,27,28,4,18,41]))),nano:s.lazy(()=>d(()=>import("./Nano-CGiUQejq.js"),__vite__mapDeps([49,1,2]))),privacy:s.lazy(()=>d(()=>import("./Privacy-DPkcRP4o.js"),__vite__mapDeps([50,1,2]))),bridge:s.lazy(()=>d(()=>import("./Bridge-s7rV3Ryg.js"),__vite__mapDeps([51,1,2,12,6,13,14,15,16,17,5,8,25,26,7,27,28])))};function P(){return e.jsx("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:200,color:"var(--text-faint)",fontSize:13},children:e.jsx("span",{children:"Loading…"})})}function Qe(){const{activePanel:t,theme:a}=M(),[r,o]=s.useState(!1),i=Ze[t];return e.jsxs("div",{style:{minHeight:"100vh",display:"flex",flexDirection:"column",background:"var(--bg-0)",color:"var(--text)",fontFamily:"var(--font-sans)"},"data-theme":a,children:[e.jsx($e,{onMenuClick:()=>o(l=>!l)}),e.jsxs("div",{style:{display:"flex",flex:1,overflow:"hidden",position:"relative"},children:[r&&e.jsx("div",{onClick:()=>o(!1),style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:40}}),e.jsx("div",{style:{width:220,flexShrink:0,borderRight:"1px solid var(--border)",background:"var(--bg-1)",overflowY:"auto",position:"sticky",top:0,height:"calc(100vh - 48px)",...typeof window<"u"&&window.innerWidth<768?{position:"fixed",top:48,left:r?0:-220,height:"calc(100vh - 48px)",zIndex:50,transition:"left 0.25s ease"}:{}},children:e.jsx(Be,{onNav:()=>o(!1)})}),e.jsx("main",{style:{flex:1,overflowY:"auto",background:"var(--bg-0)",minWidth:0},children:e.jsx(s.Suspense,{fallback:e.jsx(P,{}),children:i?e.jsx(i,{}):e.jsx(P,{})})})]})]})}const Ye=Object.freeze(Object.defineProperty({__proto__:null,default:Qe},Symbol.toStringTag,{value:"Module"}));export{Ye as A,he as C,Ee as P,Ie as R,Pe as T,B as Z,X as a,ye as b,c,xe as d,M as u};
