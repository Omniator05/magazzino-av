import { lazy } from 'react'

// Pagine caricate "lazy" da più posti. Devono essere UNA sola istanza di lazy(): due lazy() diversi sullo stesso file
// sono due caricamenti separati, e il secondo (quello della rotta) sospendeva comunque mostrando lo spinner, anche se il
// file era già stato scaricato dall'altro (es. dettaglio evento nella colonna di Eventi → "a pagina intera").
export const EventDetailPage = lazy(() => import('../pages/EventDetail'))
