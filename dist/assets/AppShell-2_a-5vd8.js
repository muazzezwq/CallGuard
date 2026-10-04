const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/Overview-CBrceU5L.js","assets/index-DbF71s6E.js","assets/index-D_415SEt.css","assets/useSubgraph-wEno3bFm.js","assets/CallBuilder-DHy8oMwu.js","assets/useWriteContract-DQWwa9CX.js","assets/sendRawTransaction-DkalMguH.js","assets/useWaitForTransactionReceipt-BSU3meSo.js","assets/waitForTransactionReceipt-CewcUlHp.js","assets/Marketplace-BdE1ZICZ.js","assets/Requests-BQMA9HPD.js","assets/Providers-BcrVrr-z.js","assets/Receipts-C8EU_zpK.js","assets/Payments-ZTIir584.js","assets/parseUnits-DGYUrQbJ.js","assets/Quality-034Py2rs.js","assets/History-Bf6058cz.js","assets/Agent-l4_n5h8w.js","assets/Lending-BTyDK8KB.js","assets/Futures-C2aTsiXX.js","assets/Attestation-DbFqiPNK.js","assets/Subscriptions-BtlSZy9w.js","assets/Mcp-DDhPch2Y.js","assets/Webhooks-B2Xwsjlo.js","assets/Leaderboard-35-4wXkg.js","assets/ApiDocs-ByYAsEiK.js","assets/Verify-Dz7R9_kG.js","assets/ProviderProfile-BOwNI0li.js","assets/Analytics-vqOVcaKN.js","assets/Notifications-Q9mT3P7r.js","assets/SettingsPanel-C6l4o1V1.js","assets/Jobs-05PQ1Iza.js","assets/BulkCall-DTDVkCJq.js","assets/Register-3isfzOue.js"])))=>i.map(i=>d[i]);
import{aP as q,E as H,F as B,G as F,I as N,aQ as W,aR as j,r as l,j as e,aS as Q,C as z,u as U,f as G,aT as $,au as d}from"./index-DbF71s6E.js";function Y(t,n={}){return{async queryFn({queryKey:a}){const r=n.abi;if(!r)throw new Error("abi is required");const{functionName:s,scopeKey:o,...u}=a[1],c=(()=>{const i=a[1];if(i.address)return{address:i.address};if(i.code)return{code:i.code};throw new Error("address or code is required")})();if(!s)throw new Error("functionName is required");return q(t,{abi:r,functionName:s,args:u.args,...c,...u})},queryKey:Z(n)}}function Z(t={}){const{abi:n,...a}=t;return["readContract",H(a)]}function I(t={}){const{abi:n,address:a,functionName:r,query:s={}}=t,o=t.code,u=B(t),c=F({config:u}),i=Y(u,{...t,chainId:t.chainId??c}),h=!!((a||o)&&n&&r&&(s.enabled??!0));return N({...s,...i,enabled:h,structuralSharing:s.structuralSharing??W})}const P=t=>{let n;const a=new Set,r=(h,x)=>{const v=typeof h=="function"?h(n):h;if(!Object.is(v,n)){const S=n;n=x??(typeof v!="object"||v===null)?v:Object.assign({},n,v),a.forEach(g=>g(n,S))}},s=()=>n,c={setState:r,getState:s,getInitialState:()=>i,subscribe:h=>(a.add(h),()=>a.delete(h))},i=n=t(r,s,c);return c},K=t=>t?P(t):P,J=t=>t;function X(t,n=J){const a=j.useSyncExternalStore(t.subscribe,j.useCallback(()=>n(t.getState()),[t,n]),j.useCallback(()=>n(t.getInitialState()),[t,n]));return j.useDebugValue(a),a}const R=t=>{const n=K(t),a=r=>X(n,r);return Object.assign(a,n),a},ee=t=>t?R(t):R;function te(t,n){let a;try{a=t()}catch{return}return{getItem:s=>{var o;const u=i=>i===null?null:JSON.parse(i,void 0),c=(o=a.getItem(s))!=null?o:null;return c instanceof Promise?c.then(u):u(c)},setItem:(s,o)=>a.setItem(s,JSON.stringify(o,void 0)),removeItem:s=>a.removeItem(s)}}const E=t=>n=>{try{const a=t(n);return a instanceof Promise?a:{then(r){return E(r)(a)},catch(r){return this}}}catch(a){return{then(r){return this},catch(r){return E(r)(a)}}}},ne=(t,n)=>(a,r,s)=>{let o={storage:te(()=>window.localStorage),partialize:y=>y,version:0,merge:(y,b)=>({...b,...y}),...n},u=!1,c=0;const i=new Set,h=new Set;let x=o.storage;if(!x)return t((...y)=>{console.warn(`[zustand persist middleware] Unable to update item '${o.name}', the given storage is currently unavailable.`),a(...y)},r,s);const v=()=>{const y=o.partialize({...r()});return x.setItem(o.name,{state:y,version:o.version})},S=s.setState;s.setState=(y,b)=>(S(y,b),v());const g=t((...y)=>(a(...y),v()),r,s);s.getInitialState=()=>g;let _;const A=()=>{var y,b;if(!x)return;const C=++c;u=!1,i.forEach(m=>{var f;return m((f=r())!=null?f:g)});const k=((b=o.onRehydrateStorage)==null?void 0:b.call(o,(y=r())!=null?y:g))||void 0;return E(x.getItem.bind(x))(o.name).then(m=>{if(m)if(typeof m.version=="number"&&m.version!==o.version){if(o.migrate){const f=o.migrate(m.state,m.version);return f instanceof Promise?f.then(w=>[!0,w]):[!0,f]}console.error("State loaded from storage couldn't be migrated since no migrate function was provided")}else return[!1,m.state];return[!1,void 0]}).then(m=>{var f;if(C!==c)return;const[w,V]=m;if(_=o.merge(V,(f=r())!=null?f:g),a(_,!0),w)return v()}).then(()=>{C===c&&(k==null||k(r(),void 0),_=r(),u=!0,h.forEach(m=>m(_)))}).catch(m=>{C===c&&(k==null||k(void 0,m))})};return s.persist={setOptions:y=>{o={...o,...y},y.storage&&(x=y.storage)},clearStorage:()=>{++c,x==null||x.removeItem(o.name)},getOptions:()=>o,rehydrate:()=>A(),hasHydrated:()=>u,onHydrate:y=>(i.add(y),()=>{i.delete(y)}),onFinishHydration:y=>(h.add(y),()=>{h.delete(y)})},o.skipHydration||A(),_||g},ae=ne,M=ee()(ae(t=>({activePanel:"overview",mode:"simple",theme:"dark",advancedOpen:!1,setPanel:n=>t({activePanel:n}),setMode:n=>t({mode:n,advancedOpen:n==="pro"}),setTheme:n=>t({theme:n}),toggleAdvanced:()=>t(n=>({advancedOpen:!n.advancedOpen}))}),{name:"cg-app-state",partialize:t=>({mode:t.mode,theme:t.theme,advancedOpen:t.advancedOpen})}));/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ie=t=>t.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),L=(...t)=>t.filter((n,a,r)=>!!n&&n.trim()!==""&&r.indexOf(n)===a).join(" ").trim();/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var re={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const oe=l.forwardRef(({color:t="currentColor",size:n=24,strokeWidth:a=2,absoluteStrokeWidth:r,className:s="",children:o,iconNode:u,...c},i)=>l.createElement("svg",{ref:i,...re,width:n,height:n,stroke:t,strokeWidth:r?Number(a)*24/Number(n):a,className:L("lucide",s),...c},[...u.map(([h,x])=>l.createElement(h,x)),...Array.isArray(o)?o:[o]]));/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=(t,n)=>{const a=l.forwardRef(({className:r,...s},o)=>l.createElement(oe,{ref:o,iconNode:n,className:L(`lucide-${ie(t)}`,r),...s}));return a.displayName=`${t}`,a};/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const se=p("Bell",[["path",{d:"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9",key:"1qo2s2"}],["path",{d:"M10.3 21a1.94 1.94 0 0 0 3.4 0",key:"qgo35s"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const le=p("BookOpen",[["path",{d:"M12 7v14",key:"1akyts"}],["path",{d:"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",key:"ruj8y"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const de=p("ChartNoAxesColumn",[["line",{x1:"18",x2:"18",y1:"20",y2:"10",key:"1xfpm4"}],["line",{x1:"12",x2:"12",y1:"20",y2:"4",key:"be30l9"}],["line",{x1:"6",x2:"6",y1:"20",y2:"14",key:"1r4le6"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ce=p("ChevronDown",[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const pe=p("ChevronRight",[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ue=p("Cpu",[["rect",{width:"16",height:"16",x:"4",y:"4",rx:"2",key:"14l7u7"}],["rect",{width:"6",height:"6",x:"9",y:"9",rx:"1",key:"5aljv4"}],["path",{d:"M15 2v2",key:"13l42r"}],["path",{d:"M15 20v2",key:"15mkzm"}],["path",{d:"M2 15h2",key:"1gxd5l"}],["path",{d:"M2 9h2",key:"1bbxkp"}],["path",{d:"M20 15h2",key:"19e6y8"}],["path",{d:"M20 9h2",key:"19tzq7"}],["path",{d:"M9 2v2",key:"165o2o"}],["path",{d:"M9 20v2",key:"i2bqo8"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ye=p("CreditCard",[["rect",{width:"20",height:"14",x:"2",y:"5",rx:"2",key:"ynyp8z"}],["line",{x1:"2",x2:"22",y1:"10",y2:"10",key:"1b3vmo"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const he=p("FileText",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const me=p("History",[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}],["path",{d:"M12 7v5l4 2",key:"1fdv2h"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const xe=p("House",[["path",{d:"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",key:"5wwlr5"}],["path",{d:"M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",key:"1d0kgt"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ve=p("Link2",[["path",{d:"M9 17H7A5 5 0 0 1 7 7h2",key:"8i5ue5"}],["path",{d:"M15 7h2a5 5 0 1 1 0 10h-2",key:"1b9ql8"}],["line",{x1:"8",x2:"16",y1:"12",y2:"12",key:"1jonct"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const fe=p("List",[["path",{d:"M3 12h.01",key:"nlz23k"}],["path",{d:"M3 18h.01",key:"1tta3j"}],["path",{d:"M3 6h.01",key:"1rqtza"}],["path",{d:"M8 12h13",key:"1za7za"}],["path",{d:"M8 18h13",key:"1lx6n3"}],["path",{d:"M8 6h13",key:"ik3vkj"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ge=p("Menu",[["line",{x1:"4",x2:"20",y1:"12",y2:"12",key:"1e0a9i"}],["line",{x1:"4",x2:"20",y1:"6",y2:"6",key:"1owob3"}],["line",{x1:"4",x2:"20",y1:"18",y2:"18",key:"yk5zj1"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const be=p("Moon",[["path",{d:"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",key:"a7tn18"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _e=p("Package",[["path",{d:"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",key:"1a0edw"}],["path",{d:"M12 22V12",key:"d0xqtd"}],["path",{d:"m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7",key:"yx3hmr"}],["path",{d:"m7.5 4.27 9 5.15",key:"1c824w"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ke=p("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const je=p("Server",[["rect",{width:"20",height:"8",x:"2",y:"2",rx:"2",ry:"2",key:"ngkwjq"}],["rect",{width:"20",height:"8",x:"2",y:"14",rx:"2",ry:"2",key:"iecqi9"}],["line",{x1:"6",x2:"6.01",y1:"6",y2:"6",key:"16zg32"}],["line",{x1:"6",x2:"6.01",y1:"18",y2:"18",key:"nzw8ys"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ze=p("Settings",[["path",{d:"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",key:"1qme2f"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Se=p("ShieldCheck",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ce=p("Shield",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const we=p("Store",[["path",{d:"m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7",key:"ztvudi"}],["path",{d:"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8",key:"1b2hhj"}],["path",{d:"M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4",key:"2ebpfo"}],["path",{d:"M2 7h20",key:"1fcdvo"}],["path",{d:"M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7",key:"6c3vgh"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ee=p("Sun",[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const T=p("Terminal",[["polyline",{points:"4 17 10 11 4 5",key:"akl6gq"}],["line",{x1:"12",x2:"20",y1:"19",y2:"19",key:"q2wloq"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ie=p("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Me=p("Zap",[["path",{d:"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",key:"1xq2db"}]]),Ae=[{id:"overview",label:"Overview",icon:e.jsx(xe,{size:16}),modes:["simple","pro"]},{id:"calls",label:"Call Builder",icon:e.jsx(T,{size:16}),modes:["simple","pro"]},{id:"marketplace",label:"Browse Services",icon:e.jsx(we,{size:16}),modes:["simple","pro"]},{id:"requests",label:"My Requests",icon:e.jsx(fe,{size:16}),modes:["simple","pro"]},{id:"providers",label:"Providers",icon:e.jsx(je,{size:16}),modes:["simple","pro"]},{id:"receipts",label:"Receipts",icon:e.jsx(he,{size:16}),modes:["simple","pro"]}],Pe=[{id:"payments",label:"Payments",icon:e.jsx(ye,{size:16}),modes:["simple","pro"]},{id:"disputes",label:"Disputes",icon:e.jsx(Ce,{size:16}),modes:["simple","pro"]},{id:"history",label:"History",icon:e.jsx(me,{size:16}),modes:["simple","pro"]}],Re=[{id:"quality",label:"Quality Disputes",icon:e.jsx(Se,{size:16}),modes:["pro"]},{id:"agent",label:"Agent Loop",icon:e.jsx(ue,{size:16}),modes:["pro"]},{id:"lending",label:"RepFi Lending",icon:e.jsx(Ie,{size:16}),modes:["pro"]},{id:"futures",label:"SLA Futures",icon:e.jsx(_e,{size:16}),modes:["pro"]},{id:"attestation",label:"SLA Bridge",icon:e.jsx(ve,{size:16}),modes:["pro"]},{id:"subscriptions",label:"Subscriptions",icon:e.jsx(ke,{size:16}),modes:["pro"]},{id:"mcp",label:"API / MCP",icon:e.jsx(T,{size:16}),modes:["pro"]},{id:"webhooks",label:"Webhooks",icon:e.jsx(Me,{size:16}),modes:["pro"]},{id:"leaderboard",label:"Leaderboard",icon:e.jsx(de,{size:16}),modes:["pro"]},{id:"apidocs",label:"API Docs",icon:e.jsx(le,{size:16}),modes:["pro"]}],Oe=[{id:"notifications",label:"Notifications",icon:e.jsx(se,{size:16}),modes:["simple","pro"]},{id:"settings",label:"Settings",icon:e.jsx(ze,{size:16}),modes:["simple","pro"]}];function Le({onNav:t}){const{activePanel:n,setPanel:a,mode:r,advancedOpen:s,toggleAdvanced:o}=M(),u=({item:i})=>{if(!i.modes.includes(r))return null;const h=n===i.id;return e.jsxs("button",{onClick:()=>{a(i.id),t==null||t()},style:{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 12px",borderRadius:8,border:"none",background:h?"rgba(16,185,129,0.1)":"transparent",color:h?"var(--accent)":"var(--text-dim)",fontWeight:h?500:400,fontSize:13,cursor:"pointer",textAlign:"left",borderLeft:h?"2px solid var(--accent)":"2px solid transparent",transition:"all 0.15s"},children:[e.jsx("span",{style:{opacity:.8,display:"flex"},children:i.icon}),e.jsx("span",{children:i.label})]})},c=({label:i})=>e.jsx("div",{style:{padding:"8px 12px 4px",fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--text-faint)",fontWeight:600},children:i});return e.jsxs("aside",{style:{display:"flex",flexDirection:"column",gap:1,padding:"12px 8px",overflowY:"auto",height:"100%",width:"100%"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8,padding:"8px 12px 12px"},children:[e.jsx("div",{style:{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#10b981,#0ea5e9)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:11,fontWeight:700},children:"CG"}),e.jsxs("div",{children:[e.jsx("div",{style:{fontSize:13,fontWeight:600,color:"var(--text)"},children:"CallGuard"}),e.jsx("div",{style:{fontSize:11,color:"var(--text-faint)"},children:"Arc Testnet"})]})]}),e.jsx(c,{label:"Workspace"}),Ae.map(i=>e.jsx(u,{item:i},i.id)),e.jsx(c,{label:"Settlement"}),Pe.map(i=>e.jsx(u,{item:i},i.id)),r==="pro"&&e.jsxs(e.Fragment,{children:[e.jsxs("button",{onClick:o,style:{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"8px 12px 4px",border:"none",background:"transparent",cursor:"pointer",fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--text-faint)",fontWeight:600},children:[e.jsx("span",{children:"Advanced"}),s?e.jsx(ce,{size:11}):e.jsx(pe,{size:11})]}),s&&Re.map(i=>e.jsx(u,{item:i},i.id))]}),e.jsx(c,{label:"System"}),Oe.map(i=>e.jsx(u,{item:i},i.id))]})}const Te=[{name:"nextProviderId",type:"function",stateMutability:"view",inputs:[],outputs:[{type:"uint256"}]},{name:"getProvider",type:"function",stateMutability:"view",inputs:[{name:"id",type:"uint256"}],outputs:[{type:"address"},{type:"address"},{type:"uint256"},{type:"uint256"},{type:"uint32"},{type:"uint32"},{type:"bool"}]},{name:"getReputationScore",type:"function",stateMutability:"view",inputs:[{name:"id",type:"uint256"}],outputs:[{type:"uint256"}]},{name:"completedCalls",type:"function",stateMutability:"view",inputs:[{name:"id",type:"uint256"}],outputs:[{type:"uint256"}]},{name:"slashedCalls",type:"function",stateMutability:"view",inputs:[{name:"id",type:"uint256"}],outputs:[{type:"uint256"}]}],D=[{name:"callCount",type:"function",stateMutability:"view",inputs:[],outputs:[{type:"uint256"}]},{name:"slashCount",type:"function",stateMutability:"view",inputs:[],outputs:[{type:"uint256"}]},{name:"receiptCount",type:"function",stateMutability:"view",inputs:[],outputs:[{type:"uint256"}]}];function Fe(){return I({address:z.registry,abi:Te,functionName:"nextProviderId"})}function Ne(){return I({address:z.payPerCall,abi:D,functionName:"callCount"})}function We(){return I({address:z.payPerCall,abi:D,functionName:"slashCount"})}function De(t){return Q({address:t,token:z.usdc})}function Ve({onMenuClick:t}){const{address:n}=U(),{mode:a,setMode:r,theme:s,setTheme:o}=M(),{data:u}=De(n),c=u?parseFloat(G(u.value,u.decimals)).toFixed(2):null;return e.jsxs("header",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",height:48,borderBottom:"1px solid var(--border)",position:"sticky",top:0,zIndex:50,background:"rgba(7,11,18,0.85)",backdropFilter:"blur(16px)",flexShrink:0},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:10},children:[e.jsx("button",{onClick:t,style:{display:"flex",alignItems:"center",justifyContent:"center",width:32,height:32,borderRadius:8,border:"none",background:"transparent",color:"var(--text-dim)",cursor:"pointer"},children:e.jsx(ge,{size:16})}),e.jsx("div",{style:{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#10b981,#0ea5e9)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:11,fontWeight:700},children:"CG"}),e.jsxs("span",{style:{display:"flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:999,background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.2)",color:"var(--accent)",fontSize:11,fontWeight:500},children:[e.jsx("span",{style:{width:6,height:6,borderRadius:"50%",background:"var(--accent)",animation:"pulse 2s infinite"}}),"Arc Testnet"]})]}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8},children:[c&&e.jsxs("span",{style:{fontSize:11,color:"var(--text-dim)",fontFamily:"var(--font-mono)"},children:[c," USDC"]}),e.jsx("div",{style:{display:"flex",borderRadius:8,overflow:"hidden",border:"1px solid var(--border)",fontSize:11},children:["simple","pro"].map(i=>e.jsx("button",{onClick:()=>r(i),style:{padding:"3px 8px",border:"none",background:a===i?"rgba(16,185,129,0.15)":"transparent",color:a===i?"var(--accent)":"var(--text-dim)",fontWeight:a===i?600:400,cursor:"pointer",textTransform:"capitalize"},children:i.charAt(0).toUpperCase()+i.slice(1)},i))}),e.jsx("button",{onClick:()=>o(s==="dark"?"light":"dark"),style:{padding:6,borderRadius:8,border:"none",background:"transparent",color:"var(--text-dim)",cursor:"pointer"},children:s==="dark"?e.jsx(Ee,{size:14}):e.jsx(be,{size:14})}),e.jsx($,{})]})]})}const qe={overview:l.lazy(()=>d(()=>import("./Overview-CBrceU5L.js"),__vite__mapDeps([0,1,2,3]))),calls:l.lazy(()=>d(()=>import("./CallBuilder-DHy8oMwu.js"),__vite__mapDeps([4,1,2,5,6,7,8]))),marketplace:l.lazy(()=>d(()=>import("./Marketplace-BdE1ZICZ.js"),__vite__mapDeps([9,1,2,3]))),requests:l.lazy(()=>d(()=>import("./Requests-BQMA9HPD.js"),__vite__mapDeps([10,1,2,3]))),providers:l.lazy(()=>d(()=>import("./Providers-BcrVrr-z.js"),__vite__mapDeps([11,1,2,3]))),receipts:l.lazy(()=>d(()=>import("./Receipts-C8EU_zpK.js"),__vite__mapDeps([12,1,2,3]))),payments:l.lazy(()=>d(()=>import("./Payments-ZTIir584.js"),__vite__mapDeps([13,1,2,3,5,6,14]))),disputes:l.lazy(()=>d(()=>import("./Quality-034Py2rs.js").then(t=>t.D),__vite__mapDeps([15,1,2,5,6]))),history:l.lazy(()=>d(()=>import("./History-Bf6058cz.js"),__vite__mapDeps([16,1,2,3]))),quality:l.lazy(()=>d(()=>import("./Quality-034Py2rs.js").then(t=>t.Q),__vite__mapDeps([15,1,2,5,6]))),agent:l.lazy(()=>d(()=>import("./Agent-l4_n5h8w.js"),__vite__mapDeps([17,1,2,5,6,7,8,14]))),lending:l.lazy(()=>d(()=>import("./Lending-BTyDK8KB.js"),__vite__mapDeps([18,1,2,5,6,14]))),futures:l.lazy(()=>d(()=>import("./Futures-C2aTsiXX.js"),__vite__mapDeps([19,1,2,5,6,14]))),attestation:l.lazy(()=>d(()=>import("./Attestation-DbFqiPNK.js"),__vite__mapDeps([20,1,2]))),subscriptions:l.lazy(()=>d(()=>import("./Subscriptions-BtlSZy9w.js"),__vite__mapDeps([21,1,2]))),mcp:l.lazy(()=>d(()=>import("./Mcp-DDhPch2Y.js"),__vite__mapDeps([22,1,2]))),webhooks:l.lazy(()=>d(()=>import("./Webhooks-B2Xwsjlo.js"),__vite__mapDeps([23,1,2]))),leaderboard:l.lazy(()=>d(()=>import("./Leaderboard-35-4wXkg.js"),__vite__mapDeps([24,1,2,3]))),apidocs:l.lazy(()=>d(()=>import("./ApiDocs-ByYAsEiK.js"),__vite__mapDeps([25,1,2]))),verify:l.lazy(()=>d(()=>import("./Verify-Dz7R9_kG.js"),__vite__mapDeps([26,1,2]))),provprofile:l.lazy(()=>d(()=>import("./ProviderProfile-BOwNI0li.js"),__vite__mapDeps([27,1,2]))),analytics:l.lazy(()=>d(()=>import("./Analytics-vqOVcaKN.js"),__vite__mapDeps([28,1,2]))),notifications:l.lazy(()=>d(()=>import("./Notifications-Q9mT3P7r.js"),__vite__mapDeps([29,1,2]))),settings:l.lazy(()=>d(()=>import("./SettingsPanel-C6l4o1V1.js"),__vite__mapDeps([30,1,2]))),jobs:l.lazy(()=>d(()=>import("./Jobs-05PQ1Iza.js"),__vite__mapDeps([31,1,2]))),bulkcall:l.lazy(()=>d(()=>import("./BulkCall-DTDVkCJq.js"),__vite__mapDeps([32,1,2]))),register:l.lazy(()=>d(()=>import("./Register-3isfzOue.js"),__vite__mapDeps([33,1,2,5,6,14])))};function O(){return e.jsx("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",height:200,color:"var(--text-faint)",fontSize:13},children:e.jsx("span",{children:"Loading…"})})}function He(){const{activePanel:t,theme:n}=M(),[a,r]=l.useState(!1),s=qe[t];return e.jsxs("div",{style:{minHeight:"100vh",display:"flex",flexDirection:"column",background:"var(--bg-0)",color:"var(--text)",fontFamily:"var(--font-sans)"},"data-theme":n,children:[e.jsx(Ve,{onMenuClick:()=>r(o=>!o)}),e.jsxs("div",{style:{display:"flex",flex:1,overflow:"hidden",position:"relative"},children:[a&&e.jsx("div",{onClick:()=>r(!1),style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:40}}),e.jsx("div",{style:{width:220,flexShrink:0,borderRight:"1px solid var(--border)",background:"var(--bg-1)",overflowY:"auto",position:"sticky",top:0,height:"calc(100vh - 48px)",...typeof window<"u"&&window.innerWidth<768?{position:"fixed",top:48,left:a?0:-220,height:"calc(100vh - 48px)",zIndex:50,transition:"left 0.25s ease"}:{}},children:e.jsx(Le,{onNav:()=>r(!1)})}),e.jsx("main",{style:{flex:1,overflowY:"auto",background:"var(--bg-0)",minWidth:0},children:e.jsx(l.Suspense,{fallback:e.jsx(O,{}),children:s?e.jsx(s,{}):e.jsx(O,{})})})]})]})}const Qe=Object.freeze(Object.defineProperty({__proto__:null,default:He},Symbol.toStringTag,{value:"Module"}));export{Qe as A,I as a,Fe as b,Ne as c,We as d,p as e,M as u};
