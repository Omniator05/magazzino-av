// Il "creatore" della squadra è chi l'ha registrata (campo `createdByUid` del documento squadra, scritto da
// Signup.jsx): è l'admin supremo. Solo lui vede e gestisce l'abbonamento e crea o toglie altri admin; gli altri
// admin lavorano normalmente su eventi, magazzino e magazzinieri. Le squadre senza `createdByUid` (create
// prima che esistesse) non hanno un creatore: tutti i loro admin restano come sempre, nessuno viene escluso.
export const isTeamOwner = (team, profile, uid) =>
  profile?.superAdmin === true || (profile?.role === 'admin' && (!team?.createdByUid || team.createdByUid === uid))

// Questo profilo (di una persona della squadra) è il creatore?
export const isOwnerProfile = (team, uid) => !!team?.createdByUid && team.createdByUid === uid
