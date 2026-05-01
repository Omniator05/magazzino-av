import { useState, useEffect } from 'react'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, serverTimestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

export function useItems() {
  const [items, setItems] = useState([])
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'items'), orderBy('name'))
    return onSnapshot(q, snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [user])

  const addItem = async data => {
    const qty = parseInt(data.qty) || 1
    return addDoc(collection(db, 'users', user.uid, 'items'), { ...data, createdAt: serverTimestamp(), totalQty: qty, availableQty: qty })
  }

  const updateItem = (id, data) => updateDoc(doc(db, 'users', user.uid, 'items', id), data)
  const deleteItem = id => deleteDoc(doc(db, 'users', user.uid, 'items', id))

  return { items, addItem, updateItem, deleteItem }
}

export function useEvents() {
  const [events, setEvents] = useState([])
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'events'), orderBy('date'))
    return onSnapshot(q, snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [user])

  const addEvent = data => addDoc(collection(db, 'users', user.uid, 'events'), { ...data, createdAt: serverTimestamp(), items: [] })
  const updateEvent = (id, data) => updateDoc(doc(db, 'users', user.uid, 'events', id), data)
  const deleteEvent = id => deleteDoc(doc(db, 'users', user.uid, 'events', id))

  return { events, addEvent, updateEvent, deleteEvent }
}
