import{j as r,e}from"./index-BmG1DxOH.js";function s({message:t}){return t?r.jsxs(r.Fragment,{children:[r.jsx("style",{children:`
        @keyframes toastIn {
          from { opacity:0; transform:translate(-50%,-10px) scale(0.97); }
          to   { opacity:1; transform:translate(-50%,0) scale(1); }
        }
      `}),r.jsxs("div",{role:"status",style:{position:"fixed",top:16,left:"50%",transform:"translate(-50%,0)",zIndex:999,background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"10px 18px 10px 14px",boxShadow:"var(--shadow)",display:"flex",alignItems:"center",gap:8,fontSize:14,fontWeight:600,color:"var(--text)",whiteSpace:"nowrap",animation:"toastIn 0.32s cubic-bezier(0.16,1,0.3,1) both"},children:[r.jsx("span",{style:{color:"var(--green)",display:"flex",flexShrink:0},children:r.jsx(e,{size:16})}),t]})]}):null}export{s as T};
