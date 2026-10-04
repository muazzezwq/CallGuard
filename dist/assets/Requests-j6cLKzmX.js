import{a as p,r as x,j as e,f as u}from"./index-CLcOyANk.js";import{u as h}from"./useSubgraph-jMEuY9K6.js";const f={STARTED:"var(--amber)",COMPLETED:"var(--accent)",SLASHED:"var(--red)",REFUNDED:"var(--text-dim)"};function b(){const{address:l}=p(),[a,o]=x.useState("all"),d=`{
    calls(
      where: { caller: "${(l==null?void 0:l.toLowerCase())??"0x0"}" }
      orderBy: createdAt orderDirection: desc first: 50
    ) {
      id providerId caller amount status createdAt completedAt
      requestHash responseHash refunded slashed
    }
  }`,{data:i,loading:c,refetch:m}=h(l?d:"",{skip:!l,pollInterval:15e3}),t=(i==null?void 0:i.calls)??[],n=a==="all"?t:a==="open"?t.filter(s=>s.status==="STARTED"):a==="completed"?t.filter(s=>s.status==="COMPLETED"):t.filter(s=>s.status==="SLASHED");return e.jsxs("div",{className:"cg-panel",children:[e.jsxs("div",{className:"panel-head",children:[e.jsxs("div",{children:[e.jsx("h2",{children:"My Requests"}),e.jsx("p",{className:"text-dim",children:"Your call history on Arc Testnet"})]}),e.jsx("button",{className:"btn btn-sm",onClick:m,children:"Refresh"})]}),e.jsx("div",{className:"cg-tabs mb-4",children:["all","open","completed","slashed"].map(s=>e.jsxs("button",{className:`cg-tab${a===s?" active":""}`,onClick:()=>o(s),children:[s.charAt(0).toUpperCase()+s.slice(1),s==="open"&&t.filter(r=>r.status==="STARTED").length>0&&e.jsx("span",{className:"badge-dot ml-1",children:t.filter(r=>r.status==="STARTED").length})]},s))}),c&&e.jsx("div",{className:"skeleton-list",children:[...Array(4)].map((s,r)=>e.jsx("div",{className:"skeleton-row"},r))}),!c&&n.length===0&&e.jsxs("div",{className:"empty-state",children:[e.jsxs("p",{children:["No ",a==="all"?"":a," requests yet."]}),a==="all"&&e.jsx("button",{className:"btn btn-primary mt-3",onClick:()=>window.dispatchEvent(new CustomEvent("cg:nav","callbuilder")),children:"Make your first call →"})]}),e.jsx("div",{className:"call-list",children:n.map(s=>e.jsxs("div",{className:"call-row",children:[e.jsxs("div",{className:"call-row-left",children:[e.jsxs("span",{className:"call-id mono",children:[s.id.slice(0,10),"..."]}),e.jsxs("span",{className:"call-provider text-dim",children:["Provider #",s.providerId]})]}),e.jsxs("div",{className:"call-row-mid",children:[e.jsxs("span",{className:"call-amount",children:[u(BigInt(s.amount??0),6)," USDC"]}),e.jsx("span",{className:"call-time text-dim text-xs",children:new Date(Number(s.createdAt)*1e3).toLocaleString()})]}),e.jsx("div",{className:"call-row-right",children:e.jsx("span",{className:"status-badge",style:{color:f[s.status]??"var(--text-dim)"},children:s.status})})]},s.id))}),e.jsx("style",{children:`
        .call-list { display:flex; flex-direction:column; gap:8px; }
        .call-row { display:flex; align-items:center; justify-content:space-between;
          padding:12px 16px; background:var(--bg-2); border-radius:var(--radius);
          border:1px solid var(--border); gap:12px; flex-wrap:wrap; }
        .call-row-left { display:flex; flex-direction:column; gap:2px; min-width:120px; }
        .call-row-mid { display:flex; flex-direction:column; gap:2px; }
        .call-row-right { margin-left:auto; }
        .call-id { font-family:var(--font-mono); font-size:13px; }
        .status-badge { font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; }
        .badge-dot { background:var(--accent); color:#000; border-radius:99px;
          font-size:10px; padding:1px 5px; font-weight:700; }
        .skeleton-list { display:flex; flex-direction:column; gap:8px; }
        .skeleton-row { height:56px; border-radius:var(--radius); background:var(--bg-2);
          animation:shimmer 1.4s infinite; }
        @keyframes shimmer { 0%{opacity:.5} 50%{opacity:1} 100%{opacity:.5} }
        @media(max-width:480px){ .call-row{ flex-direction:column; align-items:flex-start; } .call-row-right{margin-left:0;} }
      `})]})}export{b as default};
