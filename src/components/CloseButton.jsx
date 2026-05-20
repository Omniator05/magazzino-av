export default function CloseButton({ onClick, label = 'Chiudi', size = 'sm' }) {
  const w = size === 'sm' ? 100 : 130
  const h = size === 'sm' ? 34 : 44
  const iconSize = size === 'sm' ? 26 : 34

  return (
    <button onClick={onClick} className="close-slide-btn" style={{ width:w, height:h }}>
      <span className="close-slide-text">{label}</span>
      <span className="close-slide-icon" style={{ height:h-8, width:iconSize }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
          <path d="M24 20.188l-8.315-8.209 8.2-8.282-3.697-3.697-8.212 8.318-8.31-8.203-3.666 3.666 8.321 8.24-8.206 8.313 3.666 3.666 8.237-8.318 8.285 8.203z"/>
        </svg>
      </span>
    </button>
  )
}
