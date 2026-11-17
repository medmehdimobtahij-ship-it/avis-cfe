/* Avis de CFE · démarrage : session, coque, page, retours des pages Microsoft (connexion, boîte Outlook) et Pennylane. Chargé en dernier. */
"use strict";

const RETOUR_MICROSOFT = (() => {  // retour de « Connecter ma boîte » sur le site : gardé, puis l'adresse est nettoyée
  const q = new URLSearchParams(location.search);
  if (!q.get("state") || !(q.get("code") || q.get("error"))) return null;
  const adresse = location.href;
  history.replaceState(null, "", "/");
  return adresse;
})();

const RETOUR_PENNYLANE = (() => {  // /?pennylane=ok|refuse|expire|inscription|erreur : retour de « Connecter Pennylane »
  const r = new URLSearchParams(location.search).get("pennylane");
  if (!r) return null;
  history.replaceState(null, "", "/");
  return r;
})();
const MESSAGES_PENNYLANE = {
  refuse: "Accès refusé dans Pennylane : rien n'a changé.",
  expire: "La connexion à Pennylane a expiré : recommencez (Paramètres › CFE › Connecter Pennylane).",
  inscription: "Pennylane n'a pas accepté d'enregistrer l'application : importez les interlocuteurs par un fichier en attendant.",
  erreur: "Pennylane n'a pas pu confirmer la connexion : réessayez.",
};

/** Retour de la page Pennylane : Paramètres › CFE, puis première reprise des interlocuteurs lancée tout de suite. */
async function terminerRetourPennylane(r) {
  S.ongletParametres = "cfe";
  await aller("parametres");
  if (r !== "ok") return toast(MESSAGES_PENNYLANE[r] || MESSAGES_PENNYLANE.erreur, { erreur: true, duree: 9000 });
  toast("Pennylane connecté : reprise des interlocuteurs lancée.");
  synchroAnnuaire();
}

async function terminerRetourMicrosoft() {
  try {
    const r = await api("POST", "/api/outlook/connexion/retour", { adresse: RETOUR_MICROSOFT });
    toast(`Boîte connectée : ${r.adresse}`);
  } catch (e) { if (e.message !== "401") toast(e.message, { erreur: true, duree: 9000 }); }
  S.ongletParametres = "general";
  aller("parametres");
}

async function demarrer() {
  if (!PAGES.some((p) => p[0] === S.page)) S.page = "cfe";
  construireCoque();
  majRail();
  rendre();
  if (RETOUR_MICROSOFT && !demarrer.retourFait) { demarrer.retourFait = true; terminerRetourMicrosoft(); }
  else if (RETOUR_PENNYLANE && !demarrer.retourPl) { demarrer.retourPl = true; terminerRetourPennylane(RETOUR_PENNYLANE); }
  else if (RETOUR_CONNEXION) {  // liaison du compte Microsoft (Paramètres › Sécurité)
    const r = RETOUR_CONNEXION;
    RETOUR_CONNEXION = null;
    if (r === "lie") toast("Compte Microsoft lié.");
    else toast(MESSAGES_MICROSOFT[r] || MESSAGES_MICROSOFT.erreur, { erreur: true, duree: 9000 });
    S.ongletParametres = "general";
    aller("parametres");
  }
}

(async () => {
  try { S.moi = await api("GET", "/api/moi"); } catch (e) { if (e.message !== "401") pageConnexion(); return; }
  await demarrer();
})();
