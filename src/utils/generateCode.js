export function generateItemCode(id) {
  return `WAV-${id.slice(0, 8).toUpperCase()}`
}

export async function generateQRDataURL(text) {
  const QRCode = (await import('qrcode')).default
  return QRCode.toDataURL(text, {
    width: 256, margin: 2,
    color: { dark: '#000000', light: '#ffffff' }
  })
}

export function generateBarcodeSVG(code, elementId) {
  if (typeof window !== 'undefined') {
    import('jsbarcode').then(({ default: JsBarcode }) => {
      const el = document.getElementById(elementId)
      if (el) JsBarcode(el, code, { format: 'CODE128', width: 2, height: 60, displayValue: true, fontSize: 14, margin: 10 })
    })
  }
}
