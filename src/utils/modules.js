// Moduli attivabili/disattivabili per squadra (es. "loadLists"). Assente su
// team.modules = considerato attivo, per non rompere le squadre esistenti
// che non hanno mai avuto questo campo.
export const isModuleEnabled = (team, name) => team?.modules?.[name] !== false
