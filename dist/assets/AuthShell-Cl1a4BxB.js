import{j as t,A as m}from"./index-De0jX0CM.js";import{r as e}from"./react-vendor-Dh0zGrRV.js";function j({children:c,heroTitle:r="Bentornato!",heroText:i="",heroSide:p="right"}){const[n,u]=e.useState(!1),o=e.useRef(null),[s,x]=e.useState(null);return e.useEffect(()=>{const a=setTimeout(()=>u(!0),60);return()=>clearTimeout(a)},[]),e.useEffect(()=>{const a=o.current;if(!a)return;const l=new ResizeObserver(f=>{var d;const h=(d=f[0])==null?void 0:d.contentRect.height;h&&x(h)});return l.observe(a),()=>l.disconnect()},[]),t.jsxs(t.Fragment,{children:[t.jsx("style",{children:`
        /* .auth-input/.auth-btn/.auth-btn-secondary/.auth-card (stile base)
           vivono in AuthBackground.jsx, condivisi anche da chi lo usa senza
           questo guscio (es. Landing.jsx). Qui resta solo l'override che
           serve unicamente dentro la card divisa. */

        /* Card divisa: dentro il guscio la vecchia .auth-card diventa
           trasparente (il contenitore esterno fa già da card) — così le
           pagine esistenti non vanno toccate. */
        .auth-split .auth-card {
          background:transparent;
          border:none;
          border-radius:0;
          padding:0;
          backdrop-filter:none;
          -webkit-backdrop-filter:none;
          box-shadow:none;
        }
        @keyframes authFadeIn {
          from { opacity:0; transform:translateY(10px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .auth-split {
          position:relative;
          width:100%;
          max-width:880px;
          display:grid;
          background:rgba(12,14,22,0.82);
          border:1px solid rgba(230,57,70,0.35);
          border-radius:26px;
          overflow:hidden;
          backdrop-filter:blur(28px);
          -webkit-backdrop-filter:blur(28px);
          box-shadow:0 0 44px rgba(230,57,70,0.16), 0 32px 80px rgba(0,0,0,0.55);
          box-sizing:border-box;
        }
        .auth-split-form {
          grid-area:1/1;
          width:55%;
          min-width:0;
          z-index:1;
          justify-self:start;
          padding:44px 40px;
          display:flex;
          flex-direction:column;
          justify-content:center;
          box-sizing:border-box;
        }
        .auth-split.hero-left .auth-split-form { justify-self:end; }
        .auth-form-fade { animation:authFadeIn 0.4s ease 0.25s both; }
        .auth-split-hero {
          grid-area:1/1;
          width:45%;
          min-width:0;
          height:100%;
          z-index:2;
          justify-self:start;
          background:linear-gradient(160deg, #ff5c69 0%, #e63946 40%, #8f0f1c 100%);
          /* Posizione destra: 55% card = 122.3% della propria larghezza (45%) */
          transform:translateX(122.3%);
          clip-path:polygon(0 0, 100% 0, 100% 100%, 34% 100%);
          transition:transform 0.65s cubic-bezier(0.76,0,0.24,1), clip-path 0.65s cubic-bezier(0.76,0,0.24,1);
          display:flex;
          flex-direction:column;
          align-items:flex-end;
          justify-content:center;
          text-align:right;
          padding:44px 36px 44px 130px;
          box-sizing:border-box;
        }
        .auth-split.hero-left .auth-split-hero {
          transform:translateX(0);
          clip-path:polygon(0 0, 100% 0, 66% 100%, 0 100%);
          align-items:flex-start;
          text-align:left;
          padding:44px 130px 44px 36px;
        }
        .auth-hero-content {
          display:flex;
          flex-direction:column;
          align-items:inherit;
          text-align:inherit;
          animation:authFadeIn 0.45s ease 0.3s both;
        }
        .auth-hero-brand {
          display:flex;
          align-items:center;
          gap:7px;
          margin-bottom:14px;
        }
        .auth-hero-brand img { display:block; }
        .auth-hero-brand span {
          font-size:10px;
          letter-spacing:3px;
          text-transform:uppercase;
          font-weight:700;
        }
        .auth-hero-brand .auth-hero-brand-road { color:rgba(255,255,255,0.7); }
        .auth-hero-brand .auth-hero-brand-case { color:#1a1a1a; }
        .auth-hero-title {
          color:white;
          font-size:clamp(30px, 4vw, 40px);
          font-weight:800;
          line-height:1.08;
          letter-spacing:-0.5px;
          text-transform:uppercase;
          margin:0 0 12px;
        }
        .auth-hero-text {
          color:rgba(255,255,255,0.85);
          font-size:14px;
          line-height:1.55;
          max-width:250px;
          margin:0;
        }
        @media (max-width:700px) {
          .auth-split { display:flex; flex-direction:column; max-width:430px; }
          .auth-split-hero,
          .auth-split.hero-left .auth-split-hero {
            order:-1;
            flex:none;
            width:auto;
            height:auto;
            transform:none;
            transition:none;
            clip-path:polygon(0 0, 100% 0, 100% 100%, 0 82%);
            align-items:flex-start;
            text-align:left;
            padding:30px 28px 52px;
          }
          .auth-hero-title { font-size:28px; }
          .auth-split-form,
          .auth-split.hero-left .auth-split-form { width:auto; padding:14px 26px 32px; }
        }
        @media (prefers-reduced-motion:reduce) {
          *,*::before,*::after { animation:none!important; transition:none!important; }
        }
      `}),t.jsx(m,{children:t.jsxs("div",{className:`auth-split${p==="left"?" hero-left":""}`,style:{zIndex:1,opacity:n?1:0,transform:n?"translateY(0) scale(1)":"translateY(28px) scale(0.97)",transition:"opacity 0.7s ease, transform 0.7s cubic-bezier(0.34,1.56,0.64,1)"},children:[t.jsx("div",{className:"auth-split-form",children:t.jsx("div",{className:"auth-form-animated-height",style:{height:s?`${s}px`:"auto",overflow:"hidden",transition:"height 0.35s cubic-bezier(0.4,0,0.2,1)"},children:t.jsx("div",{ref:o,children:c})})}),t.jsx("div",{className:"auth-split-hero",children:t.jsxs("div",{className:"auth-hero-content",children:[t.jsxs("p",{className:"auth-hero-brand",children:[t.jsx("img",{src:"/logo-mark-black.png",alt:"",width:13,height:12}),t.jsxs("span",{children:[t.jsx("span",{className:"auth-hero-brand-road",children:"ROAD"}),t.jsx("span",{className:"auth-hero-brand-case",children:"CASE"})]})]}),t.jsx("h1",{className:"auth-hero-title",children:r}),i&&t.jsx("p",{className:"auth-hero-text",children:i})]},r)})]})})]})}export{j as A};
