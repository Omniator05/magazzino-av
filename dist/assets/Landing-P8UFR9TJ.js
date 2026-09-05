import{j as e,A as l,B as d,C as c,T as g,c as p}from"./index-De0jX0CM.js";import{u as m}from"./react-vendor-Dh0zGrRV.js";import"./firebase-DJpK_lQR.js";const i=[{icon:d,title:"Magazzino",desc:"Inventario attrezzatura audio/video/luci, disponibilità in tempo reale."},{icon:c,title:"Eventi",desc:"Calendario eventi, liste di carico, assegnazione del personale."},{icon:g,title:"Furgoni",desc:"Assegna ogni oggetto al furgone giusto per ogni evento."},{icon:p,title:"Scanner",desc:"Carico/scarico attrezzatura da smartphone via QR/barcode."}],n=70,t=160;function f(){const r=m();return e.jsxs(l,{children:[e.jsx("style",{children:`
        @keyframes landingReveal {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .landing-reveal {
          opacity: 0;
          animation: landingReveal 0.55s cubic-bezier(0.22,1,0.36,1) forwards;
        }
        .landing-feature-card {
          transition: border-color 0.2s ease, background 0.2s ease;
        }
        @media (hover: hover) and (pointer: fine) {
          .landing-feature-card:hover {
            border-color: rgba(230,57,70,0.35);
            background: rgba(255,255,255,0.09);
          }
          .landing-feature-card:hover .landing-feature-icon {
            transform: scale(1.08);
          }
        }
        .landing-feature-icon { transition: transform 0.2s ease; }
        @media (prefers-reduced-motion: reduce) {
          .landing-reveal { animation: none; opacity: 1; }
          .landing-feature-icon { transition: none; }
        }
      `}),e.jsxs("div",{style:{maxWidth:480,width:"100%",textAlign:"center"},children:[e.jsxs("div",{className:"landing-reveal",style:{display:"inline-flex",alignItems:"center",gap:12,marginBottom:10,animationDelay:"0ms"},children:[e.jsx("img",{src:"/pwa-512x512.png",alt:"",width:44,height:44,style:{borderRadius:10,display:"block"}}),e.jsxs("h1",{style:{fontSize:34,fontWeight:800,letterSpacing:"-0.5px",margin:0},children:[e.jsx("span",{style:{color:"white"},children:"ROAD"}),e.jsx("span",{style:{color:"#e63946"},children:"CASE"})]})]}),e.jsx("p",{className:"landing-reveal",style:{color:"rgba(255,255,255,0.72)",fontSize:15,lineHeight:1.6,marginBottom:30,animationDelay:"70ms"},children:"Il gestionale per aziende di noleggio audio/video/luci: magazzino, calendario eventi e personale in un'unica app."}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:30,textAlign:"left"},children:i.map((a,o)=>{const s=a.icon;return e.jsxs("div",{className:"landing-reveal landing-feature-card",style:{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:16,padding:"16px",animationDelay:`${t+o*n}ms`},children:[e.jsx("div",{className:"landing-feature-icon",style:{width:34,height:34,borderRadius:10,marginBottom:10,background:"rgba(230,57,70,0.16)",color:"#ff6b76",display:"flex",alignItems:"center",justifyContent:"center"},children:e.jsx(s,{size:17})}),e.jsx("p",{style:{color:"white",fontWeight:700,fontSize:13.5,marginBottom:3},children:a.title}),e.jsx("p",{style:{color:"rgba(255,255,255,0.6)",fontSize:12,lineHeight:1.5},children:a.desc})]},a.title)})}),e.jsxs("div",{className:"landing-reveal",style:{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:16,padding:"16px 20px",marginBottom:24,animationDelay:`${t+i.length*n}ms`},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:2},children:[e.jsx("p",{style:{color:"white",fontWeight:800,fontSize:20},children:"30 giorni di prova gratuita"}),e.jsx("span",{style:{background:"rgba(230,57,70,0.18)",color:"#ff6b76",border:"1px solid rgba(230,57,70,0.4)",borderRadius:6,padding:"2px 8px",fontSize:10.5,fontWeight:800,letterSpacing:"0.4px",textTransform:"uppercase"},children:"Prezzo beta"})]}),e.jsx("p",{style:{color:"rgba(255,255,255,0.6)",fontSize:13,marginTop:4},children:"Nessuna carta richiesta all'attivazione. Poi 35€/mese, per azienda — prezzo speciale finché l'app è in sviluppo. Disdici quando vuoi."})]}),e.jsx("button",{onClick:()=>r("/signup"),className:"auth-btn landing-reveal",style:{animationDelay:`${t+i.length*n+70}ms`},children:"Inizia l'esperienza"}),e.jsx("p",{className:"landing-reveal",style:{color:"rgba(255,255,255,0.35)",fontSize:12,marginTop:30,animationDelay:`${t+i.length*n+140}ms`},children:"Contatti: appmagazzinoav@gmail.com"})]})]})}export{f as default};
