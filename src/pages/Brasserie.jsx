import { useState } from 'react'
import BrasserieHome from './BrasserieHome'
import BrasserieEditor from './BrasserieEditor'

export default function Brasserie() {
  const [selectedDate, setSelectedDate] = useState(null)

  return selectedDate
    ? <BrasserieEditor date={selectedDate} onBack={() => setSelectedDate(null)} />
    : <BrasserieHome onSelectDate={setSelectedDate} />
}
