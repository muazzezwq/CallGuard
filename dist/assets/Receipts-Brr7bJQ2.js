import{M as x,r as m,j as e,i as h}from"./index-C8HZumfu.js";import{u,a as f}from"./useAppStore-H3sawknq.js";function g(){const{address:i}=x(),[r,n]=m.useState(null),d=u(s=>s.openVerify),{data:a,loading:l,refetch:p}=f(i?`{
    calls(where:{caller:"${i.toLowerCase()}",status_in:["COMPLETED","SLASHED"]}
      orderBy:completedAt orderDirection:desc first:50){
      id providerId amount status completedAt responseHash requestHash
    }
  }`:"",{enabled:!!i,pollInterval:3e4}),c=(a==null?void 0:a.calls)??[],o=s=>{var t;(t=navigator.clipboard)==null||t.writeText(s).catch(()=>{}),n(s),setTimeout(()=>n(null),2e3)};return e.jsxs("div",{className:"cg-panel",children:[e.jsxs("div",{className:"panel-head",children:[e.jsxs("div",{children:[e.jsx("h2",{children:"Receipts"}),e.jsxs("p",{className:"text-dim",children:[c.length," on-chain receipts"]})]}),e.jsx("button",{className:"btn btn-sm",onClick:()=>void p(),children:"↻"})]}),l&&e.jsx("div",{className:"skeleton-list",children:[...Array(3)].map((s,t)=>e.jsx("div",{className:"skeleton-row",style:{height:100}},t))}),!l&&c.length===0&&e.jsxs("div",{className:"empty-state",children:[e.jsxs("svg",{width:"40",height:"40",viewBox:"0 0 24 24",fill:"none",stroke:"var(--text-faint)",strokeWidth:"1.5",children:[e.jsx("path",{d:"M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"}),e.jsx("rect",{x:"9",y:"3",width:"6",height:"4",rx:"1"}),e.jsx("path",{d:"m9 12 2 2 4-4"})]}),e.jsx("p",{className:"mt-2",children:"No receipts yet. Make a call to get started."})]}),e.jsx("div",{className:"receipt-list",children:c.map(s=>{var t;return e.jsxs("div",{className:"receipt-card",children:[e.jsxs("div",{className:"receipt-top",children:[e.jsxs("div",{children:[e.jsxs("span",{className:"receipt-id mono text-xs",children:[s.id.slice(0,12),"..."]}),e.jsx("span",{className:`receipt-status ml-2 ${s.status==="COMPLETED"?"green":"red"}`,children:s.status})]}),e.jsxs("span",{className:"receipt-amount",children:[h(BigInt(s.amount??0),6)," USDC"]})]}),e.jsxs("div",{className:"receipt-body",children:[e.jsxs("div",{className:"receipt-hash",children:[e.jsx("span",{className:"text-dim text-xs",children:"Response hash"}),e.jsxs("div",{className:"hash-row",children:[e.jsxs("span",{className:"mono text-xs",children:[(t=s.responseHash)==null?void 0:t.slice(0,20),"..."]}),e.jsx("button",{className:"btn-copy",onClick:()=>o(s.responseHash??""),children:r===s.responseHash?"✓":"⎘"})]})]}),e.jsxs("div",{className:"receipt-meta text-dim text-xs",children:["Provider #",s.providerId," · ",s.completedAt?new Date(Number(s.completedAt)*1e3).toLocaleString():"—"]})]}),e.jsxs("div",{className:"receipt-actions",children:[e.jsx("button",{className:"btn btn-sm",onClick:()=>o(s.id),title:"Copy call ID",children:r===s.id?"✓ Copied":"Copy call ID ⎘"}),e.jsx("button",{className:"btn btn-sm",onClick:()=>d(s.id),title:"Open in Verify Receipt panel",children:"Verify ↗"})]})]},s.id)})}),e.jsx("style",{children:`
        .receipt-list{display:flex;flex-direction:column;gap:12px;}
        .receipt-card{background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;display:flex;flex-direction:column;gap:10px;}
        .receipt-top{display:flex;justify-content:space-between;align-items:center;}
        .receipt-status{font-size:11px;font-weight:700;text-transform:uppercase;}
        .receipt-status.green{color:var(--accent);}
        .receipt-status.red{color:var(--red);}
        .receipt-amount{font-size:18px;font-weight:700;font-family:var(--font-display);}
        .receipt-body{display:flex;flex-direction:column;gap:6px;}
        .hash-row{display:flex;align-items:center;gap:8px;}
        .btn-copy{background:none;border:none;cursor:pointer;color:var(--accent);font-size:14px;padding:2px 6px;}
        .receipt-actions{display:flex;gap:8px;flex-wrap:wrap;}
        .skeleton-list{display:flex;flex-direction:column;gap:8px;}
        .skeleton-row{border-radius:var(--radius);background:var(--bg-2);animation:shimmer 1.4s infinite;}
        @keyframes shimmer{0%{opacity:.5}50%{opacity:1}100%{opacity:.5}}
      `})]})}export{g as default};
