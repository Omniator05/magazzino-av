export default function ExportButton({ onClick }) {
  return (
    <button className="export-btn" onClick={onClick}>
      <svg className="export-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M11 16V7.85l-2.6 2.6L7 9l5-5 5 5-1.4 1.45-2.6-2.6V16h-2zm-5 4q-.825 0-1.412-.587T4 18v-3h2v3h12v-3h2v3q0 .825-.587 1.413T18 20H6z"/>
      </svg>
      <div className="export-icon2"></div>
      <span className="export-tooltip">Esporta</span>
    </button>
  )
}
