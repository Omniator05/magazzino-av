import { useState, useEffect } from 'react'
import { collection, onSnapshot, addDoc, query, orderBy, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, ChevronRight, Mic2, Lightbulb, Cable, Box, Layers, Cpu } from 'lucide-react'
import AddItemModal from '../components/AddItemModal'

const CATEGORIES = [
  { id: 'all', label: 'Tutti', icon: Layers },
  { id: 'audio', label: 'Audio', icon: Mic2 },
  { id: 'luci', label: 'Luci', icon: Lightbulb },
  { id: 'cavi', label: 'Cavi', icon: Cable },
  { id: 'strutture', label: 'Strutture', icon: Box },
  { id: 'effetti', label: 'Effetti', icon: Celebration },
  { id: 'kit', label: 'Kit', icon: Package },
  { id: 'corrente', label: 'Corrente', icon: Zap },
  { id: 'controllo', label: 'Controllo', icon: Cpu },
]

export default function InventoryPage() {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const q = query(
      collection(db, 'items'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    )
    return onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [user])

  const filtered = items.filter(item => {
    const matchCat = category === 'all' || item.category === category
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const inCount = items.filter(i => i.status === 'in' || !i.status).length
  const outCount = items.filter(i => i.status === 'out').length
  const missingCount = items.filter(i => i.status === 'missing').length

  return (
    <div>
      <div className="page-header">
        <span className="page-title">Magazzino</span>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Aggiungi
        </button>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--success)' }}>{inCount}</div>
          <div className="stat-label">In magazzino</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{outCount}</div>
          <div className="stat-label">Fuori</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
        <input className="input" placeholder="Cerca attrezzatura..."
          style={{ paddingLeft: 38 }} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Category chips */}
      <div className="chips-row" style={{ marginBottom: 16 }}>
        {CATEGORIES.map(cat => {
          const Icon = cat.icon
          return (
            <button key={cat.id} className={`chip ${category === cat.id ? 'active' : ''}`}
              onClick={() => setCategory(cat.id)}>
              <Icon size={13} /> {cat.label}
            </button>
          )
        })}
      </div>

      {/* Items list */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-text">
            {items.length === 0 ? 'Nessun item. Aggiungi il tuo primo!' : 'Nessun risultato.'}
          </div>
        </div>
      ) : (
        filtered.map(item => <ItemRow key={item.id} item={item} onClick={() => navigate(`/inventory/${item.id}`)} />)
      )}

      {showAdd && <AddItemModal onClose={() => setShowAdd(false)} userId={user.uid} />}
    </div>
  )
}

function ItemRow({ item, onClick }) {
  const status = item.status || 'in'
  const total = item.quantity || 1
  const available = item.quantityIn ?? total

  const statusConfig = {
    in: { class: 'badge-in', label: 'In magaz.' },
    out: { class: 'badge-out', label: 'Fuori' },
    missing: { class: 'badge-missing', label: 'Mancante' },
    partial: { class: 'badge-partial', label: 'Parziale' },
  }
  const sc = statusConfig[status] || statusConfig.in
  const pct = Math.round((available / total) * 100)

  return (
    <div className="item-row" onClick={onClick}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          {item.category} · {available}/{total} pz
        </div>
        {total > 1 && (
          <div className="progress-bar" style={{ marginTop: 6 }}>
            <div className="progress-fill" style={{
              width: `${pct}%`,
              background: pct > 60 ? 'var(--success)' : pct > 30 ? 'var(--warning)' : 'var(--danger)'
            }} />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={`badge ${sc.class}`}>{sc.label}</span>
        <ChevronRight size={16} style={{ color: 'var(--text3)' }} />
      </div>
    </div>
  )
}
