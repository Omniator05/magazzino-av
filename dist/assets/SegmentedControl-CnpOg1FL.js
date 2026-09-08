import{j as t}from"./index-BmG1DxOH.js";function l({options:a,value:r,onChange:n,disabled:s}){const i=Math.max(0,a.findIndex(e=>e.value===r));return t.jsxs("div",{className:"seg-track",style:{"--seg-count":a.length,"--seg-index":i,opacity:s?.6:1},children:[t.jsx("span",{className:"seg-glider"}),a.map(e=>t.jsxs("button",{type:"button",className:"seg-btn",onClick:()=>n(e.value),disabled:s,"aria-pressed":r===e.value,style:{color:r===e.value?"var(--text)":"var(--text2)"},children:[e.icon," ",e.label]},e.value)),t.jsx("style",{children:`
        .seg-track { position:relative; display:flex; background:var(--card2); border-radius:12px; padding:4px; }
        .seg-glider {
          position:absolute; top:4px; left:4px; bottom:4px;
          width:calc((100% - 8px) / var(--seg-count));
          border-radius:9px; background:var(--card);
          box-shadow:0 1px 4px rgba(0,0,0,0.12);
          transform:translateX(calc(var(--seg-index) * 100%));
          transition:transform 0.28s cubic-bezier(0.34,1.2,0.64,1);
        }
        .seg-btn {
          position:relative; z-index:1; flex:1;
          padding:9px 4px; border-radius:9px; font-weight:700; font-size:12.5px;
          display:flex; align-items:center; justify-content:center; gap:5px;
          background:transparent; border:none; transition:color 0.15s;
        }
      `})]})}export{l as S};
