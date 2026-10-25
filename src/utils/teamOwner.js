// Il "creatore" della squadra è chi l'ha registrata (campo `createdByUid` del documento squadra, scritto da
// Signup.jsx): è l'admin supremo. Può nominare altri admin "creatori" come lui (campo `ownerIds`, scritto solo
// dal server: vedi user-set-owner in api/_users.js). Solo i creatori vedono l'abbonamento e creano o gestiscono
// gli altri admin; gli altri admin lavorano normalmente su eventi, magazzino e magazzinieri. Le squadre senza
// `createdByUid` (create prima che esistesse) non hanno un creatore: lì tutti i loro admin restano come sempre.
// Il super admin vale sempre come un creatore.
export const isOwnerProfile = (team, uid) =>
  !!uid && (team?.createdByUid === uid || (team?.ownerIds || []).includes(uid))

export const isTeamOwner = (team, profile, uid) =>
  profile?.superAdmin === true || (profile?.role === 'admin' && (!team?.createdByUid || isOwnerProfile(team, uid)))
