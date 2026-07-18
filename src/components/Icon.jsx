/**
 * Set di icone SVG coerenti (stile Lucide, stroke currentColor).
 * Sostituiscono le emoji usate come icone nell'interfaccia.
 * Uso: <Pin size={14} />  — il colore si eredita da `color`.
 */
const base = (size = 16, extra = {}) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
  style: { flexShrink: 0, ...extra },
})

export const Pin = ({ size }) => (
  <svg {...base(size)}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
)
export const Cart = ({ size }) => (
  <svg {...base(size)}><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
)
export const Box = ({ size }) => (
  <svg {...base(size)}><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
)
export const Kit = ({ size }) => (
  <svg {...base(size)}><path d="M10 2h4a2 2 0 0 1 2 2v2h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3V4a2 2 0 0 1 2-2Z"/><path d="M8 6h8"/><path d="M1 12h22"/></svg>
)
export const Wrench = ({ size }) => (
  <svg {...base(size)}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5Z"/></svg>
)
export const Recurring = ({ size }) => (
  <svg {...base(size)}><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
)
export const Unload = ({ size }) => (
  <svg {...base(size)}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M21 21H3"/></svg>
)
export const Check = ({ size }) => (
  <svg {...base(size)}><path d="M20 6 9 17l-5-5"/></svg>
)
export const Warn = ({ size }) => (
  <svg {...base(size)}><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
)
export const Save = ({ size }) => (
  <svg {...base(size)}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>
)
export const Calendar = ({ size }) => (
  <svg {...base(size)}><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>
)
export const Trash = ({ size }) => (
  <svg {...base(size)}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
)
export const Edit = ({ size }) => (
  <svg {...base(size)}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
)
export const List = ({ size }) => (
  <svg {...base(size)}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
)
export const User = ({ size }) => (
  <svg {...base(size)}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
)
export const LogOut = ({ size }) => (
  <svg {...base(size)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
)
export const Truck = ({ size }) => (
  <svg {...base(size)}><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8Z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
)

/* Pallino colorato pieno (sostituisce 🟠🔴🟢🔵): passa `color` */
export const Dot = ({ size = 9, color = 'currentColor', glow = false }) => (
  <span style={{ display:'inline-block', width:size, height:size, borderRadius:'50%', background:color, flexShrink:0, boxShadow: glow ? `0 0 8px ${color}` : 'none' }} />
)
