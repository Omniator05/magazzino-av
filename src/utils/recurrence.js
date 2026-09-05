function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}
function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}
function addYears(dateStr, years) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().split('T')[0]
}

export function generateDates(startDate, recurrence, endDate) {
  if (recurrence === 'never' || !endDate || endDate <= startDate) return []
  const dates = []
  let current = startDate
  let count = 0
  while (count < 500) {
    let next
    if      (recurrence === 'daily')   next = addDays(current, 1)
    else if (recurrence === 'weekly')  next = addDays(current, 7)
    else if (recurrence === 'monthly') next = addMonths(current, 1)
    else if (recurrence === 'yearly')  next = addYears(current, 1)
    else break
    if (next > endDate) break
    dates.push(next)
    current = next
    count++
  }
  return dates
}
