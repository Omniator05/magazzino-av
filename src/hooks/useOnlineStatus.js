import { useState, useEffect } from 'react'

// Stato di connessione del browser (navigator.onLine + eventi online/offline
// nativi). Non garantisce "internet davvero raggiungibile" al 100% (es. wifi
// collegato ma senza uscita reale) ma è il segnale standard, istantaneo e a
// costo zero — sufficiente per il caso reale di questa app (magazziniere
// senza campo in un furgone/magazzino interrato), non pensato come
// diagnostica di rete completa.
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine
  ))

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return isOnline
}
