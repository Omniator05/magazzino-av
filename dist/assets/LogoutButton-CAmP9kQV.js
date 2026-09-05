import{a as u,j as o,a1 as h}from"./index-De0jX0CM.js";import{u as y,r as n,a as l}from"./react-vendor-Dh0zGrRV.js";function j({style:c,className:d,name:p}){const{logout:f,team:e}=u(),x=y(),[i,a]=n.useState(!1),[g,m]=n.useState(!1),s=(p||"").split(" ")[0],t=(e==null?void 0:e.logoUrl)||"/pwa-512x512.png";n.useEffect(()=>{if(!i)return;const r=new Image;r.src=t},[i,t]);const b=()=>{a(!1),m(!0),setTimeout(()=>{f().then(()=>x("/signup"))},1500)};return o.jsxs(o.Fragment,{children:[o.jsx("button",{className:d,style:c,onClick:()=>a(!0),children:"Esci"}),i&&l.createPortal(o.jsx("div",{className:"lo-confirm-bg",onClick:()=>a(!1),children:o.jsxs("div",{className:"lo-confirm",onClick:r=>r.stopPropagation(),role:"dialog","aria-modal":"true",children:[o.jsx("div",{className:"lo-confirm-icon",children:o.jsx(h,{size:26})}),o.jsx("h3",{style:{fontSize:19,fontWeight:800,color:"#111827",margin:"0 0 6px",letterSpacing:"-0.3px"},children:"Vuoi uscire?"}),o.jsx("p",{style:{fontSize:14,color:"#6b7280",margin:0,lineHeight:1.45},children:"Dovrai effettuare di nuovo l'accesso per rientrare."}),o.jsxs("div",{style:{display:"flex",gap:10,marginTop:20},children:[o.jsx("button",{className:"lo-btn lo-cancel",onClick:()=>a(!1),children:"Annulla"}),o.jsx("button",{className:"lo-btn lo-go",onClick:b,children:"Esci"})]})]})}),document.body),g&&l.createPortal(o.jsxs("div",{className:"lo-overlay",children:[o.jsx("div",{className:"lo-orb lo-orb-a"}),o.jsx("div",{className:"lo-orb lo-orb-b"}),o.jsxs("div",{className:"lo-logo-wrap",children:[o.jsx("div",{className:"lo-logo-halo"}),o.jsx("div",{className:"lo-logo-card",children:o.jsx("img",{src:t,alt:(e==null?void 0:e.name)||"Gestione Magazzino",className:"lo-logo"})})]}),o.jsxs("p",{className:"lo-bye",children:["A presto",s?`, ${s}`:"","!"]}),o.jsx("div",{className:"lo-spinner"})]}),document.body),o.jsx("style",{children:`
        @keyframes loFade { from{opacity:0} to{opacity:1} }
        @keyframes loPop  { from{opacity:0; transform:scale(0.9) translateY(10px)} to{opacity:1; transform:scale(1) translateY(0)} }
        @keyframes loSpin { to { transform: rotate(360deg); } }
        @keyframes loByeIn { from{opacity:0; transform:translateY(10px)} to{opacity:1; transform:translateY(0)} }
        @keyframes loOrbA { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(28px,-40px) scale(1.08)} }
        @keyframes loOrbB { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-30px,26px) scale(0.92)} }
        @keyframes loGradientShift {
          0%   { background-position: 15% 20%; }
          50%  { background-position: 85% 80%; }
          100% { background-position: 15% 20%; }
        }

        .lo-confirm-bg {
          position: fixed; inset: 0; z-index: 10000;
          background: rgba(10,12,18,0.5);
          backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center; padding: 24px;
          animation: loFade 0.18s ease both;
        }
        .lo-confirm {
          background: #fff; border-radius: 24px; padding: 28px 24px 22px;
          width: 100%; max-width: 320px; text-align: center;
          box-shadow: 0 24px 70px rgba(0,0,0,0.35);
          animation: loPop 0.28s cubic-bezier(0.34,1.4,0.64,1) both;
        }
        .lo-confirm-icon {
          width: 56px; height: 56px; border-radius: 50%; margin: 0 auto 16px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(230,57,70,0.12); color: #e63946;
        }
        .lo-btn {
          flex: 1; padding: 12px; border-radius: 13px; font-size: 14px; font-weight: 700;
          border: none; cursor: pointer;
        }
        .lo-cancel { background: #f3f4f6; color: #374151; }
        .lo-go { background: #e63946; color: #fff; box-shadow: 0 4px 16px rgba(230,57,70,0.35); }

        .lo-overlay {
          /* Niente fade in entrata: opaca dal primissimo frame, per lo
             stesso motivo della schermata di benvenuto — evita di
             intravedere per un attimo la pagina sotto mentre sparisce. */
          position: fixed; inset: 0; z-index: 10000; overflow: hidden;
          background-image: linear-gradient(120deg, #ffffff 0%, #ffd9d6 15%, #f28b86 32%, #ffffff 48%, #b9d2f5 64%, #6f9fe6 80%, #ffffff 100%);
          background-size: 280% 280%;
          animation: loGradientShift 15s ease-in-out infinite;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
        }
        .lo-orb { position: absolute; border-radius: 50%; pointer-events: none; }
        .lo-orb-a { top:-15%; left:-8%; width:60vmax; height:60vmax; background: radial-gradient(circle, rgba(230,57,70,.26) 0%, transparent 65%); animation: loOrbA 13s ease-in-out infinite; }
        .lo-orb-b { bottom:-18%; right:-10%; width:65vmax; height:65vmax; background: radial-gradient(circle, rgba(37,99,235,.22) 0%, transparent 65%); animation: loOrbB 17s ease-in-out infinite; }
        .lo-logo-wrap { position: relative; width: 120px; max-width: 34vw; height: 120px; z-index: 1;
          animation: loPop 0.6s cubic-bezier(0.34,1.4,0.64,1) both;
        }
        .lo-logo-halo { position: absolute; inset: -24px; border-radius: 50%;
          background: radial-gradient(circle, rgba(230,57,70,0.18) 0%, transparent 70%);
        }
        .lo-logo-card { position: relative; width: 100%; height: 100%; border-radius: 28px;
          background: #fff; border: 1px solid rgba(17,24,39,0.06);
          box-shadow: 0 20px 46px rgba(230,57,70,0.14), 0 4px 14px rgba(17,24,39,0.06);
          display: flex; align-items: center; justify-content: center; padding: 18px;
        }
        .lo-logo { width: 100%; height: 100%; object-fit: contain; }
        .lo-bye { z-index: 1; margin-top: 26px; color: #111827; font-size: 24px; font-weight: 800;
          letter-spacing: -0.4px; animation: loByeIn 0.5s ease 0.25s both;
        }
        .lo-spinner { z-index: 1; margin-top: 30px; width: 24px; height: 24px;
          border: 2px solid rgba(230,57,70,0.16); border-top: 2px solid #e63946;
          border-radius: 50%; animation: loSpin 0.9s linear infinite;
        }
        @media (prefers-reduced-motion:reduce){
          .lo-orb{animation:none!important}
          .lo-overlay{animation:none!important}
        }
      `})]})}export{j as L};
