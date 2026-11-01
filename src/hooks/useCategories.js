import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { resolveCategories, iconFor, FALLBACK_CATEGORY } from '../utils/categories'

// Categorie della squadra corrente, pronte da usare nelle pagine del magazzino.
//   categories: [{ name, icon }] nell'ordine scelto, "Altro" per ultima
//   names:      solo i nomi (per picker, filtri, import CSV)
//   iconOf(n):  icona di una categoria (anche per Kit, Extra e nomi storici)
//   groupOf(n): il nome sotto cui raggruppare — una categoria che non esiste più va in "Altro"
export function useCategories() {
  const { team } = useAuth()
  return useMemo(() => {
    const categories = resolveCategories(team)
    const names = categories.map(c => c.name)
    return {
      categories,
      names,
      iconOf: name => iconFor(categories, name),
      groupOf: name => (names.includes(name) ? name : FALLBACK_CATEGORY),
    }
  }, [team?.categories])
}
