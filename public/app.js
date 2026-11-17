/* Avis de CFE : l'interface (sans bibliothèque), design « Porcelaine » (sol gris froid, cartes blanches, encre noire pour agir).
   Ce fichier : outils communs, coque (en-tête), connexion, Paramètres généraux, éditeur et fenêtres de mails.
   cfe.js : l'écran des avis ; comptazap.js : l'import de ComptaZap ; demarrage.js lance le tout. Règles : côté serveur (src/). */
"use strict";

// ---------- Outils ----------
const ICONES = {
  retour: '<path d="M15 6l-6 6 6 6"/>',
  // Tracés Lucide (lucide.dev, licence ISC)
  cfe: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  parametres: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  lune: '<path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1z"/>',
  soleil: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
  recherche: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.5 15.5l4.5 4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  points: '<circle cx="6" cy="12" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="18" cy="12" r="1.1"/>',
  ouvrir: '<path d="M8 16 16 8M9.5 8H16v6.5"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5"/>',
  chevron: '<path d="m10 7 5 5-5 5"/>',
  bas: '<path d="m7 10 5 5 5-5"/>',
  actualiser: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  trombone: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  telecharger: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  envoyer: '<path d="M14.5 21.5 22 2 2.5 9.5l8 3z"/><path d="M22 2 10.5 12.5"/>',
  copier: '<rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8"/>',
  fermer: '<path d="M6 6l12 12M18 6 6 18"/>',
  note: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 8h8M8 12h5"/>',
  pdf: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8M8 17h5"/>',
  coche: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  dossier: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.7l2 2h7.3a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  bouclier: '<path d="M12 21.5s7.5-3.6 7.5-9.5V5.6L12 2.8 4.5 5.6V12c0 5.9 7.5 9.5 7.5 9.5z"/>',
  bouclierOk: '<path d="M12 21.5s7.5-3.6 7.5-9.5V5.6L12 2.8 4.5 5.6V12c0 5.9 7.5 9.5 7.5 9.5z"/><path d="m8.8 11.9 2.2 2.2 4.3-4.4"/>',
};
const icone = (nom, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nom]}</svg>`;

function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
const echap = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, racine = document) => racine.querySelector(sel);
const $$ = (sel, racine = document) => [...racine.querySelectorAll(sel)];
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const MOUVEMENT = !matchMedia("(prefers-reduced-motion: reduce)").matches;
const pluriel = (n, mot, motPluriel = mot + "s") => `${n} ${n > 1 ? motPluriel : mot}`;

/** Montants en centimes (comme le serveur) : 76600 -> « 766 € », 7660 -> « 76,60 € ». */
function euros(centimes) {
  const v = (centimes || 0) / 100;
  return v.toLocaleString("fr-FR", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).replace(/\u202f/g, "\u00a0") + "\u00a0€";
}
/** « 2026-12-15 » ou « 15/12/2026 » -> « 15/12 » ; avec annee : « 15/12/2026 ». */
function dateFr(texte, annee = false) {
  if (!texte) return "";
  const m = String(texte).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const [j, mo, a] = m ? [m[3], m[2], m[1]] : String(texte).slice(0, 10).split("/");
  return annee && a ? `${j}/${mo}/${a}` : `${j}/${mo}`;
}
const heureFr = (iso) => (iso && iso.length > 11 ? iso.slice(11, 16) : "");
/** « 2026-11-03 14:20 » -> « 03/11 à 14:20 ». */
const quandFr = (iso) => (iso ? `${dateFr(iso)}${heureFr(iso) ? ` à ${heureFr(iso)}` : ""}` : "");

function initiales(nom) {
  const mots = (nom || "").replace(/-/g, " ").split(/\s+/).filter((m) => /[\p{L}\p{N}]/u.test(m[0] || ""));
  if (!mots.length) return "?";
  return (mots[0][0] + (mots[1] ? mots[1][0] : mots[0].slice(1, 2))).toUpperCase();
}
const TEINTES = [["#ECEBFF", "#4F4BD9"], ["#E2F2E9", "#1C7347"], ["#FCEFD9", "#9A5B00"], ["#E4EEFA", "#22599B"], ["#F8E6EE", "#A23462"], ["#EEF0F2", "#3A3D43"]];
const TEINTES_SOMBRE = [["#2A2850", "#B3B1FF"], ["#15302A", "#5CCB96"], ["#3A2A14", "#F2B154"], ["#16283F", "#8CB8EC"], ["#3A1D2B", "#F08DB6"], ["#2A2C31", "#C9CCD2"]];
function teinte(nom) {
  let h = 0; for (const c of (nom || "").toLowerCase()) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return (S.theme === "sombre" ? TEINTES_SOMBRE : TEINTES)[h % TEINTES.length];
}
function avatar(nom, cls = "", balise = "span") {
  const [fond, encre] = teinte(nom);
  return `<${balise} class="avatar ${cls}" style="background:${fond};color:${encre}" title="${echap(nom)}">${echap(initiales(nom))}</${balise}>`;
}

/** Fichier choisi -> base64 (sans l'en-tête « data:… »). */
function enBase64(fichier) {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = () => ko(new Error(`${fichier.name} illisible.`));
    r.readAsDataURL(fichier);
  });
}
async function copierTexte(texte, message = "Copié dans le presse-papiers.") {
  try { await navigator.clipboard.writeText(texte); toast(message); }
  catch {  // navigateur sans accès au presse-papiers : copie à l'ancienne
    const z = el("<textarea></textarea>"); z.value = texte; document.body.append(z); z.select();
    document.execCommand("copy"); z.remove(); toast(message);
  }
}
/** Après la frappe : f n'est appelée qu'une fois la saisie terminée (ms sans nouvelle touche). */
function apresFrappe(f, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; }

// ---------- Échanges avec le serveur ----------
let RELECTURE_AUTO = false;
/** Relectures automatiques (minuteurs) : le serveur ne les compte pas comme une activité (session fermée après 2 h sans rien faire). */
function relectureAuto(f) { RELECTURE_AUTO = true; try { return f(); } finally { RELECTURE_AUTO = false; } }
async function api(methode, url, corps) {
  let r;
  try {
    r = await fetch(url, { method: methode, credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Avis": "1", ...(RELECTURE_AUTO ? { "X-Avis-Auto": "1" } : {}) },
      body: corps === undefined ? undefined : JSON.stringify(corps) });
  } catch { throw new Error("Connexion au serveur impossible : vérifiez que l'application est lancée."); }  // serveur arrêté, réseau coupé
  if (r.status === 401 && url !== "/api/connexion") { pageConnexion(url === "/api/moi" ? "" : "Session expirée : reconnectez-vous."); throw new Error("401"); }
  const d = r.headers.get("content-type")?.includes("json") ? await r.json() : {};
  if (!r.ok) {
    const e = new Error(d.erreur || (d.champs ? Object.values(d.champs).join(" ") : "Erreur du serveur."));
    e.champs = d.champs; e.statut = r.status; e.action = d.action; e.connecter = d.connecter; throw e;
  }
  return d;
}

function toast(texte, options = {}) {
  const t = el(`<div class="toast ${options.erreur ? "erreur" : ""}"><span>${echap(texte)}</span></div>`);
  if (options.action) {
    const b = el(`<button>${echap(options.action)}</button>`); b.onclick = () => { options.auClic(); partir(); }; t.append(b);
  }
  $("#toasts").append(t);
  const partir = () => { t.classList.add("part"); setTimeout(() => t.remove(), 260); };
  setTimeout(partir, options.duree || 3600);
}
function signalerErreur(e) { if (e.message !== "401") toast(e.message, { erreur: true, duree: 6000 }); }

/** Nouveau mail pré-rempli dans la messagerie du PC (Outlook, Thunderbird, Mail…) : lien mailto, texte simple (la messagerie
 *  ajoute sa signature). Sans pièce jointe : un lien mailto ne peut pas en porter (le .eml, lui, joint l'avis). */
function ouvrirMessagerie({ a = "", cc = "", objet = "", texte = "" }) {
  const q = (s) => encodeURIComponent(s);  // espaces en %20 (jamais « + », que les applis mail laissent tels quels)
  const dest = (x) => (Array.isArray(x) ? x : String(x).split(/[;,]/)).map((s) => s.trim()).filter(Boolean).join(";");
  const params = [cc && dest(cc) ? `cc=${q(dest(cc))}` : "", `subject=${q(objet)}`, `body=${q(texte.replace(/\r?\n/g, "\r\n"))}`].filter(Boolean).join("&");
  const lien = `mailto:${dest(a).split(";").map(encodeURIComponent).join(";")}?${params}`;
  const cadre = el('<a style="display:none"></a>'); cadre.href = lien; document.body.append(cadre); cadre.click(); cadre.remove();
}

/** Lien Outlook (brouillon) : l'onglet est ouvert au clic, avant la réponse du serveur, sinon le navigateur le bloque. */
async function ouvrirDansOutlook(promesse) {
  const onglet = window.open("about:blank", "_blank");
  try {
    const r = await promesse;
    if (r.lien) { if (onglet) onglet.location.href = r.lien; else window.open(r.lien, "_blank", "noopener"); }
    else onglet?.close();
    return r;
  } catch (e) { onglet?.close(); throw e; }
}

// ---------- État ----------
const S = {
  moi: null, page: "cfe",  // on arrive toujours sur les avis
  ongletParametres: "general", outlook: null, signature: null,
  theme: (() => { try { return localStorage.getItem("avis-cfe-theme") || "clair"; } catch { return "clair"; } })(),
};
document.documentElement.dataset.theme = S.theme;

// ---------- Connexion : compte Microsoft du cabinet, mot de passe de secours ; choix du nom sur ce PC seulement (réglage) ----------
const LOGO_MICROSOFT = `<svg class="logo-ms" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/>
  <rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>`;
const MESSAGES_MICROSOFT = {
  refuse: "Connexion annulée sur la page Microsoft.",
  inconnu: "Ce compte Microsoft n'a pas de compte ici. Utilisez votre adresse du cabinet.",
  mfa: "Double authentification exigée : validez la connexion dans Microsoft Authenticator. Si Microsoft ne vous la demande pas, un administrateur doit l'activer pour le cabinet (Microsoft Entra).",
  expire: "Connexion trop ancienne, ou commencée dans un autre navigateur : recommencez.",
  indisponible: "La connexion Microsoft n'est pas encore activée pour cette adresse (application déclarée dans Microsoft Entra, HTTPS ou localhost).",
  personnel: "Utilisez votre compte Microsoft du cabinet, pas un compte personnel.",
  deja: "Ce compte Microsoft est déjà lié à un autre compte.",
  organisation: "Ce compte Microsoft n'appartient pas à l'organisation du cabinet.",
  consentement: "Le cabinet doit d'abord autoriser l'application dans Microsoft Entra (un administrateur Microsoft, une seule fois).",
  erreur: "Microsoft n'a pas pu confirmer la connexion : réessayez.",
};
let RETOUR_CONNEXION = (() => {  // /?microsoft=… : résultat de la page Microsoft (connexion, liaison du compte), puis adresse nettoyée
  const q = new URLSearchParams(location.search);
  const r = q.get("microsoft");
  if (!r) return null;
  history.replaceState(null, "", "/");
  return r;
})();

function pageConnexion(message = "") {
  if (S.moi) S.moiAvant = S.moi;  // une autre personne qui se connecte : page rechargée (rien de la session d'avant ne reste)
  S.moi = null;
  clearInterval(S.minuteur); S.minuteur = null;  // relectures et suivis arrêtés : l'écran de connexion n'est plus redessiné
  arreterSuivis(); C.suivi = null;
  const deja = $("#racine .connexion");
  if (deja) { if (message) $(".msg-erreur", deja).textContent = message; return; }  // déjà affichée : la saisie en cours reste
  $("#couche-modales").innerHTML = "";
  $("#racine").innerHTML = "";
  if (!message && RETOUR_CONNEXION) { message = MESSAGES_MICROSOFT[RETOUR_CONNEXION] || ""; RETOUR_CONNEXION = null; }  // affiché une fois
  const f = el(`<div class="connexion"><form autocomplete="on">
      <div class="logo"><img src="logo.svg" alt=""></div>
      <div><h1>Avis de CFE</h1><div class="sous nom-cabinet"></div></div>
      <div class="bandeau-demo cache"><b>Mode démo</b> · données fictives, aucun service externe appelé.<br>
        Identifiant <code>demo</code> · mot de passe <code>demo</code></div>
      <a class="btn principal btn-microsoft cache" href="/api/microsoft/connexion">${LOGO_MICROSOFT}Se connecter avec Microsoft</a>
      <div class="separateur-ou cache"><span>ou</span></div>
      <div class="par-nom cache"></div>
      <div class="par-mdp cache">
        <div class="champ"><label for="id">Identifiant</label><input id="id" class="saisie" name="username" autocomplete="username"></div>
        <div class="champ"><label for="mdp">Mot de passe</label><input id="mdp" class="saisie" type="password" name="password" autocomplete="current-password"></div>
        <button class="btn principal" type="submit">Se connecter</button>
      </div>
      <div class="msg-erreur">${echap(message)}</div>
      <div class="pied-connexion">Connexion chiffrée · session fermée après 2 h sans activité</div>
    </form></div>`);
  $("#racine").append(f);
  const entrer = async (corps) => {
    try {
      const moi = await api("POST", "/api/connexion", corps);
      if (S.moiAvant && S.moiAvant.identifiant !== moi.identifiant) return location.replace("/");
      S.moi = moi; await demarrer();
    }
    catch (e) { $(".msg-erreur", f).textContent = e.message; }
  };
  $("form", f).onsubmit = (ev) => { ev.preventDefault(); entrer({ identifiant: $("#id", f).value, mot_de_passe: $("#mdp", f).value }); };
  fetch("/api/connexion/options", { credentials: "same-origin" }).then((r) => r.json()).then((o) => {
    const autre = o.choix_du_nom || o.mot_de_passe;
    $(".btn-microsoft", f).classList.toggle("cache", !o.microsoft);
    $(".separateur-ou", f).classList.toggle("cache", !(o.microsoft && autre));
    $(".par-mdp", f).classList.toggle("cache", !o.mot_de_passe);
    if (o.choix_du_nom) {  // sur ce PC seulement : simple choix du nom
      const z = $(".par-nom", f);
      z.innerHTML = o.comptes.map((c, i) => `<button class="btn ${!o.microsoft && i === 0 ? "principal" : ""}" type="button" data-id="${echap(c.identifiant)}">${echap(c.nom)}</button>`).join("");
      z.classList.remove("cache");
      $$("[data-id]", z).forEach((b) => b.onclick = () => entrer({ identifiant: b.dataset.id }));
    }
    $(".nom-cabinet", f).textContent = o.cabinet || "";
    if (o.demo) {  // démo : identifiants affichés et pré-remplis
      $(".bandeau-demo", f).classList.remove("cache");
      if (!$("#id", f).value) { $("#id", f).value = "demo"; $("#mdp", f).value = "demo"; }
    }
    if (o.microsoft) $(".btn-microsoft", f).focus(); else if (o.mot_de_passe) $("#id", f).focus();
    if (!o.microsoft && !autre && !message) $(".msg-erreur", f).textContent = MESSAGES_MICROSOFT.indisponible;
  }).catch(() => { $(".par-mdp", f).classList.remove("cache"); });  // options illisibles : mot de passe seul
}

// ---------- Coque : en-tête, pages ----------
// [code, nom, icône, page, onglet de Paramètres du module]
const PAGES = [
  ["cfe", "Avis de CFE", "cfe", () => pageCfe, "cfe"],
  ["parametres", "Paramètres", "parametres", () => pageParametres, null],
];
const page = (code) => PAGES.find((p) => p[0] === code) || PAGES[0];

/** Coque : en-tête avec bouton Retour (depuis les Paramètres), titre, chiffres clés ; on arrive sur les avis. */
function construireCoque() {
  $("#racine").innerHTML = "";
  const c = el(`<div id="coque" class="sans-rail">
    <main id="droite">
      <header class="entete">
        <button class="rond retour cache" id="retour" title="Retour">${icone("retour")}</button>
        <span class="logo logo-entete"><img src="logo.svg" alt=""></span>
        <div style="min-width:0"><h1 id="titre"></h1><div class="sous" id="sous"></div></div>
        <div class="outils">
          <button class="rond cache" id="params-module">${icone("parametres")}</button>
          <button class="rond bouton-theme" title="Changer de thème">${icone(S.theme === "sombre" ? "soleil" : "lune")}</button>
          ${avatar(S.moi.nom, "", "button").replace("<button", '<button id="moi"')}
        </div>
      </header>
      <section id="page"></section>
    </main>
  </div>`);
  $("#racine").append(c);
  // Retour : page précédente de l'application, jamais une page d'avant le site (sinon on quitterait l'application)
  $("#retour", c).onclick = () => (history.state?.interne ? history.back() : aller("cfe"));
  $(".bouton-theme", c).onclick = basculerTheme;
  $("#params-module", c).onclick = () => { S.ongletParametres = page(S.page)[4] || "general"; aller("parametres"); };
  $("#moi", c).onclick = async (ev) => {
    const ancre = ev.currentTarget;
    let boite = "";
    try { boite = (await etatOutlook()).adresse; } catch { /* menu sans la messagerie */ }
    menu(ancre, [
      [`Connecté : ${S.moi.nom}`, null],
      ["Paramètres", () => { S.ongletParametres = "general"; aller("parametres"); }],
      ["Ma signature des mails", async () => { if (await fenetreSignatureOutlook()) toast("Signature Outlook reprise : elle sera dans tous vos mails."); }],
      "-",
      ...(boite ? [[`Outlook : ${boite}`, null], ["Déconnecter ma boîte Outlook", () => deconnecterOutlook()]]
        : S.microsoft !== false ? [["Connecter ma boîte Outlook", () => connecterOutlook()]] : [["Outlook : non configuré (facultatif)", null]]),
      "-",
      [S.moi.methode === "choix" ? "Changer de personne" : "Se déconnecter", async () => {
        try { await api("POST", "/api/deconnexion"); } catch (e) { if (e.message !== "401") return signalerErreur(e); }
        location.replace("/");  // page rechargée : rien de la personne précédente ne reste (signature, boîte, tableaux…)
      }],
    ]);
  };
  // Retour du navigateur (ou de la souris) : page précédente ; écouteur posé une seule fois (la coque est refaite à chaque connexion)
  if (!construireCoque.retour) {
    construireCoque.retour = true;
    addEventListener("popstate", (ev) => { if (ev.state?.page && S.moi) aller(ev.state.page, true, false); });
  }
  history.replaceState({ page: S.page }, "");
}

/** Bouton Retour (depuis les Paramètres) et bouton Paramètres de l'écran. */
function majRail() {
  $("#retour").classList.toggle("cache", S.page === "cfe");
  $(".logo-entete").classList.toggle("cache", S.page !== "cfe");
  const onglet = page(S.page)[4];
  $("#params-module").classList.toggle("cache", !onglet);
  $("#params-module").title = onglet ? `Paramètres · ${page(S.page)[1]}` : "Paramètres";
}

function basculerTheme() {
  S.theme = S.theme === "sombre" ? "clair" : "sombre";
  try { localStorage.setItem("avis-cfe-theme", S.theme); } catch { /* navigateur privé : thème non retenu */ }
  document.documentElement.dataset.theme = S.theme;
  $(".bouton-theme").innerHTML = icone(S.theme === "sombre" ? "soleil" : "lune");
  const moi = $("#moi"), [fond, encre] = teinte(S.moi.nom);
  moi.style.background = fond; moi.style.color = encre;
}

/** Changement de page : l'ancienne s'efface, PUIS la nouvelle arrive en remontant (jamais les deux l'une sur l'autre). */
async function aller(code, avecTransition = true, historique = true) {
  fermerMenus();
  // Fenêtres de la page quittée fermées (bouton Retour du navigateur), sauf un envoi en cours (fenêtre bloquée)
  const fenetres = $$("#couche-modales .voile:not(.part) .fenetre");
  if (!fenetres.some((f) => f.bloquee)) fenetres.forEach((f) => f.fermer?.());
  const change = code !== S.page;
  if (change && code === "parametres") S.precedente = S.page;
  if (change && historique) history.pushState({ page: code, interne: true }, "");  // le bouton Retour du navigateur revient ici
  S.page = code;
  majRail();
  const zone = $("#page");
  if (change && avecTransition && MOUVEMENT) {
    zone.classList.remove("entree"); zone.classList.add("sortie");
    await attendre(140);
  }
  rendre();
  if (MOUVEMENT) { zone.classList.remove("sortie", "entree"); void zone.offsetWidth; zone.classList.add("entree"); }
}

function rendre() {
  const [, nom, , fabrique] = page(S.page);
  $("#titre").textContent = nom;
  entete("");
  const zone = $("#page");
  clearInterval(S.minuteur); S.minuteur = null;  // relectures périodiques de la page précédente arrêtées
  zone.innerHTML = "";
  fabrique()(zone);
}
/** Sous le titre : les chiffres clés de la page (jamais de texte de remplissage). */
function entete(html) { $("#sous").innerHTML = html; }
const chiffre = (n, legende, couleur = "") => `<span class="chiffre ${couleur}"><b>${n}</b> ${echap(legende)}</span>`;

// ---------- Pilule glissante ----------
function segmentsReplacer(conteneur) {
  const b = $("button.actif", conteneur), pilule = $(".pilule", conteneur);
  if (b && pilule) { pilule.style.left = b.offsetLeft + "px"; pilule.style.width = b.offsetWidth + "px"; }
}
function segments(conteneur, valeur, auChoix) {
  const pilule = $(".pilule", conteneur);
  const placer = (b, anime) => {
    if (!anime) pilule.style.transition = "none";
    pilule.style.left = b.offsetLeft + "px"; pilule.style.width = b.offsetWidth + "px";
    if (!anime) { void pilule.offsetWidth; pilule.style.transition = ""; }
    $$("button", conteneur).forEach((x) => x.classList.toggle("actif", x === b));
  };
  const boutons = $$("button", conteneur);
  requestAnimationFrame(() => placer(boutons.find((b) => b.dataset.v === valeur) || boutons[0], false));
  boutons.forEach((b) => b.onclick = () => { placer(b, true); auChoix(b.dataset.v); });
  return { placer };
}

// ---------- Menus ----------
function fermerMenus() { $$(".menu-flottant").forEach((m) => m.remove()); }
/** items : [libellé, fonction] ; [libellé, null] = titre ; "-" = séparateur ; [libellé, fonction, { coche, inactif }]. */
function menu(ancre, items, position = null) {
  fermerMenus();
  const m = el(`<div class="menu-flottant" role="menu"></div>`);
  for (const it of items) {
    if (it === "-") { m.append(el("<hr>")); continue; }
    const [libelle, fn, o = {}] = it;
    if (!fn) { m.append(el(`<div class="titre-menu">${echap(libelle)}</div>`)); continue; }
    const b = el(`<button role="menuitem" ${o.inactif ? "disabled" : ""}>${"coche" in o ? `<span class="coche-menu">${o.coche ? icone("coche") : ""}</span>` : ""}${echap(libelle)}</button>`);
    b.onclick = () => { fermerMenus(); fn(); };
    m.append(b);
  }
  document.body.append(m);
  const r = position ? { left: position.x, right: position.x, top: position.y, bottom: position.y } : ancre.getBoundingClientRect(), mr = m.getBoundingClientRect();
  m.style.left = Math.max(10, Math.min(r.left, innerWidth - mr.width - 10)) + "px";
  m.style.top = Math.max(10, r.bottom + mr.height + 6 > innerHeight ? r.top - mr.height - 6 : r.bottom + 6) + "px";
  setTimeout(() => addEventListener("pointerdown", function dehors(e) {
    if (!m.contains(e.target)) { m.remove(); removeEventListener("pointerdown", dehors); }
  }), 0);
}
/** Petit choix (Vous / Tu, M. / Mme, règlement…) : bouton compact qui ouvre un menu coché. */
function choixMini(options, valeur, auChoix, { courts = null, titre = "", inactif = false } = {}) {
  const textes = courts || options;
  const b = el(`<button class="choix-mini ${valeur === "" ? "vide" : ""}" title="${echap(titre)}" ${inactif ? "disabled" : ""}>
    <span>${echap(textes[valeur] ?? valeur)}</span>${icone("bas")}</button>`);
  b.onclick = (ev) => {
    ev.stopPropagation();
    menu(b, Object.entries(options).map(([k, l]) => [l, () => {
      if (k === valeur) return;
      valeur = k; $("span", b).textContent = textes[k] ?? k; b.classList.toggle("vide", k === ""); auChoix(k);
    }, { coche: k === valeur }]));
  };
  return b;
}

// ---------- Fenêtres ----------
function fenetre({ titre, sous = "", corps = "", pied = "", classe = "" }) {
  const v = el(`<div class="voile"><div class="fenetre ${classe}" role="dialog" aria-modal="true">
      <div class="f-tete"><div style="min-width:0"><h2>${titre}</h2>${sous ? `<div class="sous">${sous}</div>` : ""}</div>
        <button class="rond fermer" title="Fermer (Échap)">${icone("fermer")}</button></div>
      <div class="f-corps">${corps}</div>${pied ? `<div class="f-pied">${pied}</div>` : ""}</div></div>`);
  const f = $(".fenetre", v);
  const fermer = () => {
    if (!v.isConnected || f.bloquee) return;
    removeEventListener("keydown", echap_);
    v.classList.add("part"); setTimeout(() => v.remove(), MOUVEMENT ? 180 : 0);
    f.aLaFermeture?.();
  };
  const echap_ = (e) => { if (e.key === "Escape" && $("#couche-modales").lastElementChild === v) fermer(); };
  addEventListener("keydown", echap_);
  $(".fermer", f).onclick = fermer;
  v.addEventListener("pointerdown", (e) => { if (e.target === v) v.dataset.dehors = "1"; });
  v.addEventListener("pointerup", (e) => { if (e.target === v && v.dataset.dehors) fermer(); delete v.dataset.dehors; });
  $("#couche-modales").append(v);
  f.fermer = fermer;
  setTimeout(() => $("input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea", f)?.focus(), 60);
  return f;
}
/** Question oui / non dans une fenêtre du site (jamais la boîte grise du navigateur). */
function confirmer({ titre, texte = "", oui = "Oui", non = "Annuler", danger = false }) {
  return new Promise((ok) => {
    const f = fenetre({ titre, classe: "petite", corps: texte ? `<div>${texte}</div>` : "",
      pied: `<button class="btn" data-a="non">${echap(non)}</button><button class="btn principal ${danger ? "danger-plein" : ""}" data-a="oui">${echap(oui)}</button>` });
    let reponse = false;
    f.aLaFermeture = () => ok(reponse);
    $('[data-a="non"]', f).onclick = () => f.fermer();
    $('[data-a="oui"]', f).onclick = () => { reponse = true; f.fermer(); };
    setTimeout(() => $('[data-a="oui"]', f).focus(), 80);
  });
}
/** Saisie d'un texte (commentaire…) ; null si annulé. */
function demanderTexte({ titre, sous = "", libelle, valeur = "", indication = "", ok = "Enregistrer", long = true }) {
  return new Promise((rep) => {
    const f = fenetre({ titre, sous, classe: "petite",
      corps: champ("texte", libelle, long ? zoneTexte("texte", valeur, `placeholder="${echap(indication)}" style="min-height:120px"`)
        : saisie("texte", valeur, `placeholder="${echap(indication)}"`)),
      pied: `<button class="btn" data-a="non">Annuler</button><button class="btn principal" data-a="oui">${echap(ok)}</button>` });
    let r = null;
    f.aLaFermeture = () => rep(r);
    $('[data-a="non"]', f).onclick = () => f.fermer();
    $('[data-a="oui"]', f).onclick = () => { r = $('[name="texte"]', f).value.trim(); f.fermer(); };
  });
}

function erreursChamps(f, champs = {}) {
  $$(".msg-erreur[data-pour]", f).forEach((m) => m.remove());
  $$(".saisie.erreur", f).forEach((x) => x.classList.remove("erreur"));
  for (const [cle, msg] of Object.entries(champs)) {
    const c = $(`[name="${cle}"]`, f);
    if (c) { c.classList.add("erreur"); c.closest(".champ")?.append(el(`<div class="msg-erreur" data-pour="${cle}">${echap(msg)}</div>`)); }
    else toast(msg, { erreur: true });
  }
}

const champ = (nom, libelle, controle, aide = "") =>
  `<div class="champ"><label for="c-${nom}">${libelle}</label>${controle}${aide ? `<small class="aide">${aide}</small>` : ""}</div>`;
const saisie = (nom, valeur = "", attrs = "") => `<input id="c-${nom}" name="${nom}" class="saisie" value="${echap(valeur)}" ${attrs}>`;
const liste = (nom, options, valeur = "") => `<select id="c-${nom}" name="${nom}" class="saisie">${Object.entries(options)
  .map(([k, l]) => `<option value="${echap(k)}" ${String(k) === String(valeur) ? "selected" : ""}>${echap(l)}</option>`).join("")}</select>`;
const zoneTexte = (nom, valeur = "", attrs = "") => `<textarea id="c-${nom}" name="${nom}" class="saisie" ${attrs}>${echap(valeur)}</textarea>`;
const caseACocher = (nom, libelle, coche, attrs = "") => `<label class="case"><input type="checkbox" name="${nom}" ${coche ? "checked" : ""} ${attrs}>${libelle}</label>`;
const revele = (html, ouvert) => `<div class="revele ${ouvert ? "ouvert" : ""}" ${ouvert ? "" : "inert"}><div>${html}</div></div>`;
const valeurs = (f) => Object.fromEntries($$("[name]", f).map((x) => [x.name, x.type === "checkbox" ? x.checked : x.value]));

// ---------- Aperçu d'un mail (signature de la personne comprise, comme il partira) ----------
/** Signature enregistrée { html, personnalisee } (sans signature enregistrée : la signature simple du serveur). */
async function signature() {
  if (!S.signatureEtat) S.signatureEtat = await api("GET", "/api/signature").catch(() => ({ html: "", personnalisee: false }));
  return S.signatureEtat;
}
/** Sous l'aperçu d'un mail : quelle signature partira, et le bouton pour reprendre celle d'Outlook (ou en changer). */
async function ligneSignature() {
  const s = await signature();
  return `<div class="ligne-signature ${s.personnalisee ? "" : "simple"}">${icone("mail")}<span>${s.personnalisee ? "Signature : la vôtre"
    : "Signature simple : votre signature Outlook (avec le logo) n'est pas encore reprise"}</span>
    <button class="btn petit ${s.personnalisee ? "fantome" : "principal"}" data-a="sig-changer">${s.personnalisee ? "Changer de signature" : "Reprendre ma signature Outlook"}</button></div>`;
}
/** Fenêtre d'un mail préparé rendue modifiable : objet en champ, texte dans l'éditeur (signature dessous,
 *  ajoutée à l'envoi). Bouton « Texte d'origine » dans le pied. Retourne { modifie(), champs() (à joindre à l'envoi), objet(), texte() }. */
function mailModifiable(f, m, pied) {
  const objet = el(`<input class="saisie objet-mail" name="objet-mail" maxlength="250">`);
  objet.value = m.objet;
  $(".mail-entete b", f)?.replaceWith(objet);
  const apercu = $(".apercu-mail", f), sig = $(".signature-apercu", apercu);
  sig?.remove();
  const ed = editeurTexte(m.html, "Texte du mail…");
  apercu.innerHTML = ""; apercu.classList.add("apercu-modifiable"); apercu.append(ed.el);
  if (sig) apercu.append(sig);
  const origine = ed.html();
  const modifie = () => ed.html() !== origine || objet.value.trim() !== m.objet;
  const bouton = el(`<button class="btn fantome cache" data-a="origine" title="Remettre l'objet et le texte préparés par l'application">Texte d'origine</button>`);
  $(".btn.principal", pied)?.before(bouton);
  const maj = () => bouton.classList.toggle("cache", !modifie());
  ed.zone.addEventListener("input", maj); objet.addEventListener("input", maj);
  bouton.onclick = () => { ed.zone.innerHTML = origine; objet.value = m.objet; maj(); };
  return { modifie, champs: () => (modifie() ? { html: ed.html(), objet: objet.value } : {}),
    objet: () => objet.value.trim() || m.objet, texte: () => (modifie() ? ed.texte() : m.texte), vide: () => modifie() && !ed.texte() };
}

/** Bouton « Reprendre ma signature Outlook » où qu'il soit (aperçus, bandeaux) : signature gardée, aperçus et pages mis à jour. */
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest('[data-a="sig-changer"]');
  if (!b) return;
  ev.stopPropagation();
  if (!await fenetreSignatureOutlook()) return;
  toast("Signature Outlook reprise : elle sera dans tous vos mails.");
  for (const x of $$(".signature-apercu")) x.innerHTML = S.signature;
  for (const x of $$(".ligne-signature")) x.outerHTML = await ligneSignature();
  if (S.page === "cfe") { C.signature = true; remplirCfe(); }
}, true);
async function htmlApercu(html) {
  const sig = (await signature()).html || "";
  return `${html}${sig ? `<br><div class="signature-apercu" style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${sig}</div>` : ""}`;
}
/** Bloc d'aperçu : À / Cc / Objet / corps / pièces jointes. */
async function blocApercu(m) {
  return `<div class="mail-entete">
      ${m.de ? `<div><span>De</span>${echap(m.de)}</div>` : ""}
      <div><span>À</span>${m.a ? echap(m.a) : '<b class="rouge">pas d\'e-mail</b>'}</div>
      ${m.cc ? `<div><span>Cc</span>${echap(m.cc)}</div>` : ""}
      <div><span>Objet</span><b>${echap(m.objet)}</b></div></div>
    <div class="apercu-mail">${await htmlApercu(m.html)}</div>
    ${await ligneSignature()}
    ${m.pj?.length ? `<div class="pieces">${icone("trombone")}${m.pj.map((p) => `<a href="${echap(p.lien)}" target="_blank" rel="noopener">${echap(p.nom)}</a>`).join("")}</div>`
      : m.pieces?.length ? `<div class="pieces">${icone("trombone")}${m.pieces.map((p) => `<span>${echap(p)}</span>`).join("")}</div>` : ""}`;
}

/** Erreur de la boîte Microsoft : message + ce qu'il faut faire (reconnecter, autoriser…). */
function fenetreErreurOutlook(e) {
  const f = fenetre({ titre: "Outlook", classe: "moyenne", corps: `<div class="alerte">${echap(e.message)}</div>${htmlAction(e.action)}
      ${e.action?.type === "reconnecter" || /connect/i.test(e.message) ? '<div><button class="btn principal" data-a="cx">Connecter ma boîte Outlook</button></div>' : ""}` });
  $('[data-a="cx"]', f)?.addEventListener("click", () => { f.fermer(); connecterOutlook(); });
}
function erreurAction(e) { if (e.message === "401") return; if (e.action) fenetreErreurOutlook(e); else signalerErreur(e); }

/**
 * Envoi en nombre, un mail par requête (jamais de requête trop longue pour l'hébergement) avec suivi ligne par ligne.
 * elements : [{ cle, libelle, detail }] ; faire(element) -> promesse ; exclus : lignes non envoyées (raison) ;
 * mode « envoi » : confirmation rouge (on ne rattrape pas un mail parti) ; « brouillon » : liens pour ouvrir chaque brouillon.
 */
function traitementGroupe({ titre, elements, exclus = [], cc = "", mode, faire, apres }) {
  const envoi = mode === "envoi";
  if (!elements.length) {
    fenetre({ titre, classe: "moyenne", corps: `<div>Aucun mail à ${envoi ? "envoyer" : "préparer"} :</div>
      <ul class="liste-raisons">${exclus.map((x) => `<li>${echap(x)}</li>`).join("")}</ul>` });
    return;
  }
  const f = fenetre({ titre, classe: "moyenne",
    sous: envoi ? `${pluriel(elements.length, "mail va", "mails vont")} partir tout de suite, depuis votre boîte` : `${pluriel(elements.length, "brouillon")} dans votre boîte Outlook`,
    corps: `${envoi ? '<div class="alerte rouge">Envoyés directement, sans brouillon : on ne peut pas les rattraper. Vérifiez la liste.</div>' : ""}
      <div class="groupe-liste">${elements.map((x, i) => `<div class="ligne-envoi" data-i="${i}"><span class="etat-envoi"></span>
        <div><b>${echap(x.libelle)}</b>${x.detail ? `<small>${x.detail}</small>` : ""}</div><span class="resultat-envoi"></span></div>`).join("")}</div>
      ${exclus.length ? `<details class="avance"><summary>${pluriel(exclus.length, "non retenu")}</summary><ul class="liste-raisons">${exclus.map((x) => `<li>${echap(x)}</li>`).join("")}</ul></details>` : ""}
      ${cc ? `<div class="aide">Copie (Cc) : ${echap(cc)}</div>` : ""}
      <div class="progression cache"><span></span></div>`,
    pied: `<button class="btn" data-a="annuler">Annuler</button>
      <button class="btn principal" data-a="go">${envoi ? `${icone("envoyer")} Envoyer les ${pluriel(elements.length, "mail")} maintenant` : `Créer les ${pluriel(elements.length, "brouillon")}`}</button>` });
  const go = $('[data-a="go"]', f), annuler = $('[data-a="annuler"]', f);
  annuler.onclick = () => (f.enCours ? (f.arret = true, annuler.disabled = true, annuler.textContent = "Arrêt après ce mail…") : f.fermer());
  go.onclick = async () => {
    f.enCours = true; f.bloquee = true;
    go.disabled = true; annuler.textContent = "Arrêter";
    const barre = $(".progression", f); barre.classList.remove("cache");
    let faits = 0, rates = 0;
    for (const [i, x] of elements.entries()) {
      if (f.arret) break;
      const ligne = $(`.ligne-envoi[data-i="${i}"]`, f);
      ligne.classList.add("encours"); ligne.scrollIntoView({ block: "nearest" });
      try {
        const r = await faire(x);
        faits++;
        ligne.classList.replace("encours", "ok");
        $(".resultat-envoi", ligne).innerHTML = r?.lien ? `<a class="btn petit" href="${echap(r.lien)}" target="_blank" rel="noopener">Ouvrir ${icone("ouvrir")}</a>` : (envoi ? "Envoyé" : "Prêt");
      } catch (e) {
        rates++;
        ligne.classList.replace("encours", "rate");
        $(".resultat-envoi", ligne).textContent = e.message === "401" ? "Session expirée" : e.message;
        if (e.action || e.message === "401") { f.arret = true; if (e.action) { f.bloquee = false; fenetreErreurOutlook(e); } }
      }
      $("span", barre).style.width = `${Math.round(((i + 1) / elements.length) * 100)}%`;
    }
    f.enCours = false; f.bloquee = false;
    annuler.textContent = "Fermer"; annuler.disabled = false; go.remove();
    annuler.onclick = () => f.fermer();
    $(".f-tete .sous", f).textContent = `${envoi ? pluriel(faits, "mail envoyé", "mails envoyés") : pluriel(faits, "brouillon créé", "brouillons créés")}`
      + (rates ? ` · ${pluriel(rates, "échec")}` : "") + (f.arret && faits + rates < elements.length ? " · arrêté" : "");
    apres?.();
  };
}

// ---------- Paramètres ----------
const ONGLETS_PARAMETRES = [["general", "Général"], ["cfe", "CFE"]];
function pageParametres(zone) {
  const z = el(`<div class="page-scroll"><div class="parametres">
      <div class="segments" id="onglets-param"><span class="pilule"></span>${ONGLETS_PARAMETRES.map(([k, l]) => `<button data-v="${k}">${l}</button>`).join("")}</div>
      <div id="contenu-param" class="contenu-param"></div></div></div>`);
  zone.append(z);
  const afficher = (o) => {
    S.ongletParametres = o;
    const c = $("#contenu-param", z);
    c.innerHTML = "";
    ({ general: parametresGeneraux, cfe: parametresCfe })[o](c);
    if (MOUVEMENT) c.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.33,1,.68,1)" });
  };
  segments($("#onglets-param", z), S.ongletParametres, afficher);
  afficher(S.ongletParametres);
}

async function parametresGeneraux(c) {
  c.classList.add("parametres");
  c.innerHTML = `<div class="groupe" id="bloc-cabinet"></div>
    <div class="groupe" id="bloc-outlook"></div>
    <div class="groupe" id="bloc-securite"></div>`;
  sectionCabinet($("#bloc-cabinet", c));
  sectionOutlook($("#bloc-outlook", c));
  sectionSecurite($("#bloc-securite", c));
}

/** Nom du cabinet et services facultatifs : ce qui est en place, ce qui ne l'est pas (et ce que l'outil fait sans). */
async function sectionCabinet(bloc) {
  let s;
  try { s = await api("GET", "/api/integrations"); } catch (e) { bloc.innerHTML = `<div class="alerte">${echap(e.message)}</div>`; return; }
  const ligne = (nom, ok, etat, sans) => `<div class="ligne-integration"><span class="pastille p-${ok ? "vert" : "gris"}">${ok ? "en place" : "non configuré"}</span>
    <div><b>${echap(nom)}</b> · ${echap(etat)}<br><span class="aide">${echap(sans)}</span></div></div>`;
  const ms = s.microsoft, sp = s.sharepoint, pl = s.pennylane, an = s.annuaire;
  bloc.innerHTML = `<div class="groupe-titre">CABINET ET SERVICES</div>
    ${champ("cabinet", "Nom du cabinet (signature simple des mails)", `<div class="montant-unite">${saisie("cabinet", s.cabinet)}<button class="btn" data-a="cabinet">Enregistrer</button></div>`)}
    <div class="champ"><label>Services reliés (tous facultatifs)</label>
    ${ligne("Microsoft 365 (Outlook)", ms.configure && !!ms.boite, ms.boite ? `boîte connectée : ${ms.boite}` : ms.configure ? "application déclarée, boîte à connecter (ci-dessous)" : "réglage « microsoft_client_id » vide (config.json)",
      "Sans Outlook : chaque mail se télécharge (.eml, avis joint) ou s'ouvre dans votre messagerie ; la case « Envoyé » se coche à la main.")}
    ${ligne("OneDrive / SharePoint", sp.configure, sp.configure ? `${sp.clients} › client › année › ${sp.sous_dossier}` : "réglage « sharepoint » vide (config.json)",
      "Sans SharePoint : les PDF des avis se téléchargent (un par un, ou tous en une archive) pour les ranger vous-même.")}
    ${ligne("Pennylane", pl.connecte, pl.connecte ? `connecté${pl.compte ? ` (${pl.compte})` : ""}${pl.cabinet ? "" : " · réglage « cabinet_pennylane » à renseigner"}` : "non connecté (Paramètres › CFE)",
      "Sans Pennylane : les interlocuteurs viennent d'un fichier CSV / Excel, ou se saisissent sur chaque ligne.")}
    ${ligne("ComptaZap", !!s.comptazap.recu_le, s.comptazap.recu_le ? `dernier import le ${quandFr(s.comptazap.recu_le)} (${pluriel(s.comptazap.avis, "avis", "avis")})` : "jamais importé",
      `Sans ComptaZap : avis importés d'un fichier CSV / Excel ou saisis à la main (${pluriel(s.saisis, "avis saisi", "avis saisis")}).`)}
    ${ligne("Annuaire des interlocuteurs", an.contacts > 0, an.contacts ? `${pluriel(an.contacts, "contact")} (${an.source}, ${quandFr(an.maj)})` : "vide",
      "Rapproché des avis par le nom de la société ; une saisie sur la ligne passe toujours avant.")}</div>`;
  $('[data-a="cabinet"]', bloc).onclick = async () => {
    try { await api("POST", "/api/parametres/cabinet", { nom: $('[name="cabinet"]', bloc).value }); toast("Nom du cabinet enregistré."); S.signatureEtat = null; }
    catch (e) { signalerErreur(e); }
  };
}

// ---------- Sécurité : compte Microsoft (Entra ID, Authenticator), mode de connexion, dernières connexions ----------
const LIBELLES_SECURITE = {
  connexion: "Connexion", connexion_refusee: "Connexion refusée", connexion_bloquee: "Trop d'essais : bloqué", deconnexion: "Déconnexion",
  mot_de_passe_change: "Mot de passe changé", microsoft_lie: "Compte Microsoft lié", microsoft_delie: "Compte Microsoft délié",
  liaison_refusee: "Liaison refusée", mode_connexion: "Mode de connexion changé", sessions_fermees: "Autres sessions fermées",
};
const dateHeure = (iso) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

async function sectionSecurite(bloc) {
  const titre = `<div class="groupe-titre">SÉCURITÉ DE LA CONNEXION · ${echap(S.moi.nom.toUpperCase())}</div>`;
  bloc.innerHTML = `${titre}<div class="aide">Chargement…</div>`;
  let s;
  try { s = await api("GET", "/api/securite"); } catch (e) { bloc.innerHTML = `${titre}<div class="alerte">${echap(e.message)}</div>`; return; }
  const ses = s.session;
  const sansLien = s.comptes.filter((c) => !c.lie).map((c) => c.nom);
  const moyen = (l) => l.methode === "microsoft" ? `Microsoft${l.mfa === true ? " + Authenticator" : l.mfa === false ? " (sans double auth.)" : ""}`
    : l.methode === "mot_de_passe" ? "Mot de passe" : l.methode === "choix" ? "Choix du nom (ce PC)" : "";
  bloc.innerHTML = `${titre}
    <div class="ligne-outlook ${s.microsoft ? "ok" : ""}">${LOGO_MICROSOFT}<div>
      ${s.microsoft ? `<b>Compte Microsoft lié : ${echap(s.microsoft.adresse)}</b><br><span>Connexion avec Microsoft ; votre boîte Outlook est connectée du même coup.</span>`
        : `<b>Compte Microsoft non lié</b><br><span>Lié tout seul à votre première connexion avec votre adresse du cabinet.</span>`}</div>
      ${s.microsoft ? `<button class="btn petit fantome danger" data-a="delier">Délier</button>`
        : s.disponible ? `<a class="btn principal petit" href="/api/microsoft/lier">Lier mon compte Microsoft</a>` : ""}</div>
    ${!s.disponible ? `<div class="alerte">${echap(MESSAGES_MICROSOFT.indisponible)}</div>` : ""}
    <div class="session-actuelle">${icone(ses.mfa ? "bouclierOk" : "bouclier")}<span>Cette session : <b>${echap(moyen(ses) || "Mot de passe")}</b>.
      Fermée après ${Math.round(s.duree.inactivite / 3600)} h sans activité, et au plus après ${Math.round(s.duree.max / 3600)} h.</span></div>
    <div class="champ"><label>Mode de connexion du cabinet (tous les comptes)</label>
      <div class="choix-mode">${Object.entries(s.modes).map(([k, l]) => `<label class="case"><input type="radio" name="mode" value="${k}" ${s.mode === k ? "checked" : ""}>
        <span><b>${echap(l)}</b>${k === "microsoft_mfa" ? " · recommandé" : ""}</span></label>`).join("")}</div>
      <small class="aide">${sansLien.length ? `${echap(sansLien.join(" et "))} : lié tout seul à sa première connexion avec son adresse du cabinet.`
        : "Tous les comptes sont liés."} En cas de souci avec Microsoft : data/parametres.json › « ModeConnexion » : "".</small>
      <div class="msg-erreur" data-err="mode"></div></div>
    ${s.mot_de_passe ? `<div class="champ"><label>Mot de passe de secours</label>
      <div class="grille2">${champ("ancien", "Mot de passe actuel", saisie("ancien", "", 'type="password" autocomplete="current-password"'))}
        ${champ("nouveau", "Nouveau mot de passe (12 caractères, majuscule, minuscule, chiffre, caractère spécial)", saisie("nouveau", "", 'type="password" autocomplete="new-password"'))}</div>
      <div><button class="btn petit" data-a="mdp">Changer mon mot de passe</button></div></div>` : ""}
    <div class="champ"><label>Dernières connexions à votre compte</label>
      ${s.journal.length ? `<table class="journal-securite"><thead><tr><th>Date</th><th>Événement</th><th>Moyen</th><th>Navigateur</th><th>Adresse IP</th></tr></thead><tbody>
        ${s.journal.map((l) => `<tr class="${l.evt.includes("refus") || l.evt.includes("bloq") ? "refus" : ""}"><td>${dateHeure(l.t)}</td>
          <td>${echap(LIBELLES_SECURITE[l.evt] || l.evt)}${l.motif ? ` <span class="muted">(${echap(l.motif)})</span>` : ""}</td>
          <td>${echap(moyen(l))}</td><td>${echap(l.nav || "")}</td><td>${echap(l.ip || "")}</td></tr>`).join("")}</tbody></table>`
        : `<div class="aide">Rien pour l'instant.</div>`}
      <small class="aide">Journal gardé 12 mois.</small>
      <div><button class="btn petit" data-a="fermer">Fermer mes sessions sur les autres navigateurs</button></div></div>`;
  $('[data-a="delier"]', bloc)?.addEventListener("click", async () => {
    if (!await confirmer({ titre: "Délier votre compte Microsoft ?", texte: "Il sera lié de nouveau à votre prochaine connexion avec Microsoft.", oui: "Délier", danger: true })) return;
    try { await api("POST", "/api/securite/delier"); toast("Compte Microsoft délié."); sectionSecurite(bloc); }
    catch (e) { if (e.champs?.microsoft) toast(e.champs.microsoft, { erreur: true, duree: 7000 }); else signalerErreur(e); }
  });
  $$('[name="mode"]', bloc).forEach((r) => r.addEventListener("change", async () => {
    try { await api("POST", "/api/securite/mode", { mode: r.value }); toast("Mode de connexion enregistré."); sectionSecurite(bloc); }
    catch (e) { $('[data-err="mode"]', bloc).textContent = e.champs?.mode || e.message; $$('[name="mode"]', bloc).forEach((x) => { x.checked = x.value === s.mode; }); }
  }));
  $('[data-a="mdp"]', bloc)?.addEventListener("click", async () => {
    const g = $('[data-a="mdp"]', bloc).closest(".champ");
    try {
      await api("POST", "/api/mot-de-passe", { ancien: $('[name="ancien"]', bloc).value, nouveau: $('[name="nouveau"]', bloc).value });
      $('[name="ancien"]', bloc).value = $('[name="nouveau"]', bloc).value = ""; erreursChamps(g, {}); toast("Mot de passe changé.");
    } catch (e) { if (e.champs) erreursChamps(g, e.champs); else signalerErreur(e); }
  });
  $('[data-a="fermer"]', bloc).onclick = async () => {
    try { await api("POST", "/api/securite/fermer-sessions"); toast("Vos autres sessions sont fermées."); sectionSecurite(bloc); } catch (e) { signalerErreur(e); }
  };
}

// ---------- Éditeur de texte des mails : gras, italique, souligné, couleur, taille, listes, liens (comme Outlook) ----------
const TAILLES_PT = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];  // comme Outlook ; 11 par défaut (Calibri 11)
// Couleurs proposées (celles d'Outlook), puis quelques teintes sobres ; « Autre couleur… » pour le reste
const COULEURS_TEXTE = [["#000000", "Noir"], ["#404040", "Gris foncé"], ["#7F7F7F", "Gris"], ["#C00000", "Rouge foncé"], ["#FF0000", "Rouge"],
  ["#ED7D31", "Orange"], ["#FFC000", "Or"], ["#00B050", "Vert"], ["#375623", "Vert foncé"], ["#00B0F0", "Bleu clair"], ["#0070C0", "Bleu"],
  ["#002060", "Bleu foncé"], ["#7030A0", "Violet"]];
const COULEURS_CABINET = [["#4F4BD9", "Violet"], ["#1F2A44", "Marine"], ["#2E3344", "Ardoise"]];
function editeurTexte(html = "", indication = "") {
  const e = el(`<div class="editeur">
      <div class="ed-barre" role="toolbar" aria-label="Mise en forme">
        <select class="ed-taille" title="Taille du texte (points)">${TAILLES_PT.map((t) => `<option value="${t}" ${t === 11 ? "selected" : ""}>${t}</option>`).join("")}</select>
        <span class="ed-sep"></span>
        <button type="button" data-c="bold" title="Gras (Ctrl+B)"><b>G</b></button>
        <button type="button" data-c="italic" title="Italique (Ctrl+I)"><i>I</i></button>
        <button type="button" data-c="underline" title="Souligné (Ctrl+U)"><u>S</u></button>
        <button type="button" data-c="strikeThrough" title="Barré"><s>ab</s></button>
        <span class="ed-couleurs"><button type="button" class="ed-couleur" data-a="couleur" title="Couleur du texte"><span>A</span><i></i></button><button type="button"
          class="ed-couleur-fleche" data-a="palette" title="Choisir la couleur" aria-haspopup="true">▾</button>
          <div class="ed-palette cache" role="menu">
            <div class="ed-palette-titre">Couleurs</div>
            <div class="ed-nuancier">${COULEURS_TEXTE.map(([c, nom]) => `<button type="button" data-couleur="${c}" title="${nom}" style="background:${c}"></button>`).join("")}</div>
            <div class="ed-palette-titre">Sobres</div>
            <div class="ed-nuancier">${COULEURS_CABINET.map(([c, nom]) => `<button type="button" data-couleur="${c}" title="${nom}" style="background:${c}"></button>`).join("")}</div>
            <label class="ed-autre">Autre couleur…<input type="color" value="#c00000"></label></div></span>
        <span class="ed-sep"></span>
        <button type="button" data-c="insertUnorderedList" title="Liste à puces"><svg viewBox="0 0 24 24"><circle cx="5" cy="7" r="1.4"/><circle cx="5" cy="12" r="1.4"/><circle cx="5" cy="17" r="1.4"/><path d="M9 7h11M9 12h11M9 17h11"/></svg></button>
        <button type="button" data-c="insertOrderedList" title="Liste numérotée"><svg viewBox="0 0 24 24"><path d="M10 7h10M10 12h10M10 17h10"/><text x="2.5" y="9" font-size="6.5">1</text><text x="2.5" y="14.5" font-size="6.5">2</text><text x="2.5" y="20" font-size="6.5">3</text></svg></button>
        <button type="button" data-c="outdent" title="Diminuer le retrait"><svg viewBox="0 0 24 24"><path d="M4 6h16M10 10h10M10 14h10M4 18h16M7 9.5 4 12l3 2.5"/></svg></button>
        <button type="button" data-c="indent" title="Augmenter le retrait"><svg viewBox="0 0 24 24"><path d="M4 6h16M10 10h10M10 14h10M4 18h16M4 9.5 7 12l-3 2.5"/></svg></button>
        <span class="ed-sep"></span>
        <button type="button" data-a="lien" title="Insérer un lien"><svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg></button>
        <button type="button" data-c="removeFormat" title="Effacer la mise en forme"><span class="ed-tx">T<sub>x</sub></span></button>
      </div>
      <div class="ed-zone" contenteditable="true" role="textbox" aria-multiline="true" data-indication="${echap(indication)}">${html}</div></div>`);
  const zone = $(".ed-zone", e);
  let plage = null;  // sélection gardée quand on clique dans la barre (couleur, taille)
  const garder = () => { const s = getSelection(); if (s.rangeCount && zone.contains(s.anchorNode)) plage = s.getRangeAt(0).cloneRange(); };
  const remettre = () => { zone.focus(); if (plage) { const s = getSelection(); s.removeAllRanges(); s.addRange(plage); } };
  const faire = (c, v = null) => { remettre(); document.execCommand("styleWithCSS", false, false); document.execCommand(c, false, v); garder(); etat(); };
  const etat = () => {
    $$("[data-c]", e).forEach((b) => { try { b.classList.toggle("actif", document.queryCommandState(b.dataset.c)); } catch { /* commande sans état */ } });
    const n = getSelection().anchorNode, x = n && (n.nodeType === 1 ? n : n.parentElement);  // taille du texte là où est le curseur
    if (x && zone.contains(x)) { const pt = Math.round(parseFloat(getComputedStyle(x).fontSize) * 0.75); if (TAILLES_PT.includes(pt)) $(".ed-taille", e).value = String(pt); }
  };
  /** Taille précise en points : le navigateur ne connaît que 7 tailles, on pose la 7 puis on la remplace par la taille choisie. */
  const taille = (pt) => {
    faire("fontSize", "7");
    $$('font[size="7"]', zone).forEach((f) => {
      const s = document.createElement("span"); s.style.fontSize = `${pt}pt`;
      while (f.firstChild) s.appendChild(f.firstChild);
      f.replaceWith(s);
    });
    garder(); etat();
  };
  $$(".ed-barre button, .ed-barre label, .ed-barre select", e).forEach((b) => b.addEventListener("mousedown", (ev) => { garder(); if (b.tagName === "BUTTON") ev.preventDefault(); }));
  $$("[data-c]", e).forEach((b) => b.onclick = () => faire(b.dataset.c));
  $(".ed-taille", e).onchange = (ev) => taille(ev.target.value);
  let couleur = "#C00000";  // la dernière choisie : « A » la remet d'un clic
  const palette = $(".ed-palette", e);
  const fermerPalette = () => palette.classList.add("cache");
  const appliquerCouleur = (c) => { couleur = c; $(".ed-couleur i", e).style.background = c; fermerPalette(); faire("foreColor", c); };
  $('[data-a="couleur"]', e).onclick = () => faire("foreColor", couleur);
  $('[data-a="palette"]', e).onclick = () => palette.classList.toggle("cache");
  $$("[data-couleur]", e).forEach((b) => b.onclick = () => appliquerCouleur(b.dataset.couleur));
  $(".ed-autre input", e).addEventListener("input", (ev) => appliquerCouleur(ev.target.value));
  document.addEventListener("mousedown", (ev) => { if (!ev.target.closest(".ed-couleurs") || !e.contains(ev.target)) fermerPalette(); });
  $('[data-a="lien"]', e).onclick = () => {
    const url = prompt("Adresse du lien (https://…)", "https://");
    if (url && /^(https?:\/\/|mailto:)/i.test(url.trim())) faire("createLink", url.trim());
  };
  zone.addEventListener("keyup", () => { garder(); etat(); });
  zone.addEventListener("mouseup", () => { garder(); etat(); });
  zone.addEventListener("paste", () => { const avant = new Set($$("img", zone)); setTimeout(() => $$("img", zone).forEach((i) => { if (!avant.has(i)) i.remove(); }), 0); });
  return { el: e, zone, html: () => zone.innerHTML, texte: () => zone.innerText.trim(), focus: () => zone.focus(),
    debut: (html) => {  // remplace le texte au-dessus de la signature (texte de relance)
      const sig = $(".signature-crm", zone);
      while (sig && zone.firstChild !== sig) zone.removeChild(zone.firstChild);
      if (!sig) zone.innerHTML = "";
      zone.insertAdjacentHTML("afterbegin", html + (sig ? "<p><br></p>" : ""));
    } };
}
/** Paragraphes séparés d'une ligne vide, comme quand on tape dans Outlook (le mail envoyé a le même espacement). */
const paragraphes = (...blocs) => blocs.map((b) => `<p>${b}</p>`).join("<p><br></p>");
const enParagraphes = (texte) => paragraphes(...String(texte || "").trim().split(/\n\s*\n/).map((b) => echap(b).replace(/\n/g, "<br>")));
/** Signature des mails : celle gardée dans l'application ; sinon, la première fois, celle d'Outlook (au choix s'il y en a plusieurs), en
 *  demandant s'il faut la garder par défaut. */
async function maSignature() {
  if (S.signature != null) return S.signature;
  let s = { html: "", personnalisee: true };
  try { s = await api("GET", "/api/signature"); } catch { /* sans signature */ }
  S.signature = s.html;
  if (!s.personnalisee) {
    const outlook = await signatureOutlook();
    if (outlook) S.signature = outlook;
  }
  return S.signature;
}

/** Fichiers de signature d'Outlook choisis dans le navigateur (dossier %APPDATA%\Microsoft\Signatures, ou des .htm) : chaque
 *  signature nettoyée par le serveur, avec ses images (dossier « …_fichiers ») remises dedans. */
async function signaturesDesFichiers(fichiers) {
  const tous = [...fichiers];
  const relatif = (f) => (f.webkitRelativePath || f.name).split("/").slice(f.webkitRelativePath ? 1 : 0).join("/").toLowerCase();
  const parChemin = new Map(tous.map((f) => [relatif(f), f]));
  const base64 = (f) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.readAsDataURL(f); });
  const liste = [];
  // Signatures : les .htm du dossier choisi, ou de son sous-dossier \u00ab Signatures \u00bb (dossier Microsoft choisi par erreur) ;
  // jamais ceux rang\u00e9s dans un \u00ab \u2026_fichiers \u00bb (pi\u00e8ces de la signature)
  const estSignature = (x) => /\.html?$/i.test(x.name) && (!relatif(x).includes("/") || /^signatures\/[^/]+$/.test(relatif(x)));
  for (const f of tous.filter(estSignature)) {
    const dossier = relatif(f).includes("/") ? relatif(f).replace(/[^/]+$/, "") : "";
    const octets = await f.arrayBuffer();
    let texte = new TextDecoder("utf-8").decode(octets);
    if (texte.includes("\ufffd") || /charset=windows-1252/i.test(texte)) texte = new TextDecoder("windows-1252").decode(octets);  // Outlook classique
    if (octets.byteLength > 1 && new Uint8Array(octets)[0] === 0xff && new Uint8Array(octets)[1] === 0xfe) texte = new TextDecoder("utf-16le").decode(octets);
    for (const src of new Set([...texte.matchAll(/src="([^"]+)"/gi)].map((m) => m[1]).filter((s) => !/^(data:|https?:|cid:)/i.test(s)))) {
      let chemin = src; try { chemin = decodeURIComponent(src); } catch { /* tel quel */ }
      const img = parChemin.get(dossier + chemin.replace(/\\/g, "/").replace(/&amp;/g, "&").toLowerCase());
      if (img && img.size < 700000) texte = texte.split(`src="${src}"`).join(`src="data:${img.type || "image/png"};base64,${await base64(img)}"`);
    }
    try {
      const html = (await api("POST", "/api/signature/apercu", { html: texte })).html;
      if (html.replace(/<[^>]+>/g, "").trim() || html.includes("<img")) liste.push({ nom: f.name.replace(/\.html?$/i, ""), html, defaut: false });
    } catch { /* fichier illisible : ignoré */ }
  }
  const moi = (S.outlook?.adresse || "").toLowerCase();  // Outlook nomme souvent la signature « … (adresse) »
  liste.forEach((s) => { s.defaut = !!moi && s.nom.toLowerCase().includes(moi); });
  return liste.sort((a, b) => b.defaut - a.defaut || a.nom.localeCompare(b.nom));
}


/** Sélecteur de dossier : la personne choisit son dossier de signatures Outlook (le navigateur demande la confirmation). */
function choisirDossierSignatures() {
  return new Promise((fin) => {
    const i = el('<input type="file" webkitdirectory multiple hidden>');
    i.onchange = async () => { const l = await signaturesDesFichiers(i.files); i.remove(); fin(l); };
    i.addEventListener("cancel", () => { i.remove(); fin([]); });
    document.body.append(i); i.click();
  });
}

// ---------- Reprendre la signature d'Outlook : ses fichiers sont sur le PC (%APPDATA%\Microsoft\Signatures), comme les bases de
// ComptaZap : on montre le dossier à coller dans la fenêtre Windows, puis la personne le choisit ----------
const DOSSIER_SIGNATURES = "%APPDATA%\\Microsoft\\Signatures";

/** Fenêtre « Reprendre ma signature Outlook » : dossier des signatures (adresse à coller), fichier .htm, ou derniers mails envoyés.
 *  La signature choisie est gardée par défaut pour tous les mails de l'application. HTML gardé, ou null. */
function fenetreSignatureOutlook() {
  return new Promise((fin) => {
    const f = fenetre({ titre: "Reprendre ma signature Outlook", sous: "Elle sera mise en bas de tous vos mails envoyés depuis l'application", classe: "moyenne",
      corps: `<ol class="etapes-action">
          <li>« Choisir le dossier », puis dans la fenêtre Windows, collez dans la barre d'adresse : <code>${DOSSIER_SIGNATURES}</code> et Entrée.</li>
          <li>Cliquez « Sélectionner un dossier » (et « Importer » si le navigateur le demande), puis choisissez votre signature.</li></ol>
        <div class="ligne-boutons"><button class="btn principal" data-a="dossier">${icone("dossier")} Choisir le dossier</button>
          <button class="btn" data-a="copier">${icone("copier")} Copier l'adresse du dossier</button></div>
        <details class="avance"><summary>Autres moyens</summary>
          <div class="aide">Fichier de la signature (.htm) choisi à la main, ou signature reprise de vos derniers mails envoyés (nouvel Outlook, qui ne garde pas de fichier sur le PC).</div>
          <div class="ligne-boutons"><label class="btn">Choisir le fichier .htm<input type="file" accept=".htm,.html" multiple class="cache" name="sig-fichier"></label>
            <button class="btn" data-a="envoyes">${icone("mail")} Depuis mes mails envoyés</button></div></details>
        <div class="aide etat-import"></div>` });
    let rendu = false;
    const finir = (html) => { if (rendu) return; rendu = true; f.fermer(); fin(html); };
    const garder = async (liste) => {
      if (!liste.length) return toast("Aucune signature dans ce dossier : choisissez " + DOSSIER_SIGNATURES + ".", { erreur: true, duree: 8000 });
      const choisie = liste.length === 1 ? liste[0] : await choisirSignature(liste);
      if (!choisie) return;
      if (await proposerSignature(choisie.html)) finir(S.signature);
    };
    $('[data-a="copier"]', f).onclick = () => copierTexte(DOSSIER_SIGNATURES, "Adresse copiée : collez-la dans la fenêtre du navigateur.");
    $('[data-a="dossier"]', f).onclick = async () => garder(await choisirDossierSignatures());
    $('[name="sig-fichier"]', f).onchange = async (ev) => { const l = await signaturesDesFichiers(ev.target.files); ev.target.value = ""; garder(l); };
    $('[data-a="envoyes"]', f).onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      $(".etat-import", f).textContent = "Lecture de vos derniers mails envoyés…";
      try { const r = await api("POST", "/api/signature/outlook"); await garder([{ nom: "Signature de vos mails envoyés", html: r.html, defaut: true }]); }
      catch (e) { erreurAction(e); }
      $(".etat-import", f).textContent = ""; b.disabled = false;
    };
    const obs = new MutationObserver(() => { if (!f.isConnected) { obs.disconnect(); if (!rendu) { rendu = true; fin(null); } } });
    obs.observe($("#couche-modales"), { childList: true });
  });
}

/** Signatures d'Outlook de ce PC : une seule → elle ; plusieurs → la personne choisit. Puis : « la garder par défaut ? ». */
async function signatureOutlook(demander = true) {
  let liste = [];
  try { liste = (await api("GET", "/api/signature/outlook-locales")).signatures; } catch { return null; }
  if (!liste.length) {  // autre PC, ou site en ligne : proposé une fois, la personne choisit son dossier de signatures
    if (demander && !S.signatureProposee) {
      S.signatureProposee = true;
      toast("Mettre votre signature Outlook dans les mails de l'application ?", { duree: 12000, action: "Reprendre ma signature",
        auClic: async () => { const h = await fenetreSignatureOutlook(); if (h) S.signature = h; } });
    }
    return null;
  }
  const choisie = liste.length === 1 ? liste[0] : await choisirSignature(liste);
  if (!choisie) return null;
  if (demander) await proposerSignature(choisie.html);
  return choisie.html;
}

function choisirSignature(liste) {
  return new Promise((fin) => {
    const f = fenetre({ titre: "Quelle signature Outlook ?", sous: "Vous en avez plusieurs dans Outlook : choisissez celle des mails envoyés depuis l'application.", classe: "moyenne",
      corps: `<div class="choix-signatures">${liste.map((s, i) => `<button class="choix-signature" data-i="${i}"><span class="cs-nom">${echap(s.nom)}${s.defaut
        ? ' <span class="pastille p-vert">par défaut dans Outlook</span>' : ""}</span><div class="cs-apercu">${s.html}</div></button>`).join("")}</div>` });
    let rendu = false;
    $$("[data-i]", f).forEach((b) => b.onclick = () => { rendu = true; f.fermer(); fin(liste[+b.dataset.i]); });
    const obs = new MutationObserver(() => { if (!f.isConnected) { obs.disconnect(); if (!rendu) fin(null); } });
    obs.observe($("#couche-modales"), { childList: true });
  });
}

/** « Garder cette signature et en faire celle par défaut ? » : oui → enregistrée ; non → seulement pour cette fois. */
function proposerSignature(html) {
  return new Promise((fin) => {
    const f = fenetre({ titre: "Garder cette signature ?", sous: "Elle sera mise en bas de tous vos mails envoyés depuis l'application. Modifiable dans Paramètres.", classe: "moyenne",
      corps: `<div class="cs-apercu grand">${html}</div>`,
      pied: '<button class="btn fantome" data-a="non">Seulement pour ce mail</button><button class="btn principal" data-a="oui">Oui, en faire ma signature par défaut</button>' });
    let rendu = false;
    $('[data-a="non"]', f).onclick = () => { rendu = true; f.fermer(); fin(false); };
    $('[data-a="oui"]', f).onclick = async () => {
      rendu = true;
      let ok = false;
      try { S.signature = (await api("POST", "/api/signature", { html })).html; S.signatureEtat = null; toast("Signature enregistrée par défaut."); ok = true; }
      catch (e) { signalerErreur(e); }
      f.fermer(); fin(ok);  // échec : pas enregistrée
    };
    const obs = new MutationObserver(() => { if (!f.isConnected) { obs.disconnect(); if (!rendu) fin(false); } });
    obs.observe($("#couche-modales"), { childList: true });
  });
}

/** Fenêtre de rédaction : nouveau mail, ou réponse dans un fil ; signature de la personne dans l'éditeur.
 *  o : { titre, sous, a: [adresses proposées], aCoches, cc, objet, html, repondre_a, url (défaut /api/mail/envoyer), apres(r) }. */
async function composer(o = {}) {
  const signature = await maSignature();
  const adresses = [...new Set(o.a || [])], coches = o.aCoches || adresses.slice(0, 1);
  const f = fenetre({ titre: o.titre || (o.repondre_a ? "Répondre" : "Nouveau mail"), sous: o.sous || "", classe: "large",
    corps: `<div class="mx-composer plein composer-fenetre">
      <div class="mx-champs">
        <div class="mx-ligne"><span>À</span><div class="mx-pastilles">${adresses.map((x) => `<button class="mx-pastille ${coches.includes(x) ? "on" : ""}" data-dest="${echap(x)}">${echap(x)}</button>`).join("")}</div>
          <input name="autres" placeholder="${adresses.length ? "Autre adresse" : "Adresse e-mail"}"></div>
        <div class="mx-ligne"><span>Cc</span><input name="cc" value="${echap(o.cc || "")}" placeholder="Facultatif"></div>
        ${o.repondre_a ? "" : `<div class="mx-ligne"><span>Objet</span><input name="objet" placeholder="Objet du mail" value="${echap(o.objet || "")}"></div>`}
      </div>
      <div class="mx-editeur"></div>
      <div class="mx-joindre"><label class="btn petit fantome">${icone("trombone")} Joindre<input type="file" multiple class="cache" name="pj"></label><span class="pieces-choisies aide"></span></div>
      <footer class="mx-pied"><span class="espace"></span><button class="btn fantome petit" data-a="annuler">Annuler</button>
        <button class="btn principal" data-a="envoyer">Envoyer <kbd>Ctrl ↵</kbd></button></footer></div>` });
  const ed = editeurTexte(`${o.html || "<p><br></p>"}<p><br></p>${signature ? `<div class="signature-crm">${signature}</div>` : ""}`,
    o.repondre_a ? "Votre réponse…" : "Votre message…");
  $(".mx-editeur", f).append(ed.el);
  (o.repondre_a || o.objet ? ed.zone : $('[name="objet"]', f)).focus();
  let pieces = [];
  $$(".mx-pastille", f).forEach((b) => b.onclick = () => b.classList.toggle("on"));
  $('[name="pj"]', f).onchange = async (ev) => {
    pieces = await Promise.all([...ev.target.files].map(async (x) => ({ nom: x.name, contenu: await enBase64(x) })));
    $(".pieces-choisies", f).textContent = pieces.map((p) => p.nom).join(", ");
  };
  $('[data-a="annuler"]', f).onclick = () => f.fermer();
  const liste = (v) => v.split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  const envoyer = async () => {
    const b = $('[data-a="envoyer"]', f);
    const corps = { a: [...$$("[data-dest].on", f).map((x) => x.dataset.dest), ...liste($('[name="autres"]', f).value)], cc: liste($('[name="cc"]', f).value),
      objet: $('[name="objet"]', f)?.value || "", html: ed.html(), texte: ed.texte(), repondre_a: o.repondre_a || "", pieces };
    if (!corps.a.length) return toast("Choisissez au moins un destinataire.", { erreur: true });
    if (!corps.texte) return ed.focus();
    try {
      b.disabled = true; b.textContent = "Envoi…";
      const r = await api("POST", o.url || "/api/mail/envoyer", corps);
      toast("Mail envoyé."); f.fermer(); o.apres?.(r);
    } catch (e) {
      b.disabled = false; b.innerHTML = "Envoyer <kbd>Ctrl ↵</kbd>";
      if (e.action) erreurAction(e); else if (e.champs) toast(Object.values(e.champs)[0], { erreur: true }); else signalerErreur(e);
    }
  };
  $('[data-a="envoyer"]', f).onclick = envoyer;
  f.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); envoyer(); } });
  return f;
}

/** Boucles de suivi en cours (connexion de la boîte Outlook) : toutes arrêtées quand la session se ferme. */
const SUIVIS = new Set();
function arreterSuivis() { [...SUIVIS].forEach((arret) => arret()); }

// ---------- Messagerie Outlook (chacun connecte SA boîte Microsoft) ----------
async function etatOutlook() {
  S.outlook = await api("GET", "/api/outlook");
  return S.outlook;
}

/** Ce qu'il faut faire pour régler un souci de mise en place (lien direct + étapes), affiché tel quel à l'écran. */
function htmlAction(action) {
  if (!action || !action.etapes) return "";
  return `<ol class="etapes-action">${action.etapes.map((e) => `<li>${echap(e)}</li>`).join("")}</ol>
    ${action.lien ? `<a class="btn principal petit" href="${echap(action.lien)}" target="_blank" rel="noopener">${action.type === "entra" ? "Ouvrir le réglage Microsoft" : "Ouvrir la page d'autorisation"} ↗</a>` : ""}`;
}

async function deconnecterOutlook(apres) {
  if (!await confirmer({ titre: "Déconnecter votre boîte Outlook ?", texte: "Vos mails restent dans Outlook ; vous pourrez la reconnecter quand vous voulez.", oui: "Déconnecter", danger: true })) return false;
  try { await api("POST", "/api/outlook/deconnexion"); } catch (e) { signalerErreur(e); return false; }
  S.outlook = null;
  toast("Boîte Outlook déconnectée.");
  apres?.();
  return true;
}

async function connecterOutlook(apres) {
  let r;
  try { r = await api("POST", "/api/outlook/connexion"); }
  catch (e) {
    if (e.message === "401") return null;
    let action = e.action;
    if (!action) try { action = (await api("POST", "/api/outlook/verifier")).action; } catch { /* sans les étapes */ }
    return fenetre({ titre: "Connexion Outlook impossible pour l'instant", classe: "moyenne",
      corps: `<div class="alerte">${echap(e.message)}</div>${htmlAction(action)}` });
  }
  const f = fenetre({ titre: "Connecter ma boîte Outlook", classe: "moyenne",
    corps: `<div class="code-outlook">
        <ol class="etapes-action"><li>« Se connecter chez Microsoft » : la page s'ouvre dans un nouvel onglet.</li>
          <li>Choisissez votre compte du cabinet, puis acceptez : l'application pourra préparer et envoyer vos mails, et ranger les avis dans les dossiers clients.</li>
          ${r.automatique ? "<li>Vous revenez automatiquement dans l'application.</li>" : `<li>La page de retour affiche « Ce site est inaccessible » : c'est normal.
            Copiez son adresse (elle commence par http://localhost) et collez-la ci-dessous.</li>`}</ol>
        <div style="display:flex;justify-content:center"><a class="btn principal" href="${echap(r.url)}" target="_blank" rel="noopener">Se connecter chez Microsoft ↗</a></div>
        <div class="montant-unite coller ${r.automatique ? "cache" : ""}"><input class="saisie" name="retour" placeholder="Collez ici l'adresse http://localhost/?code=…"><button class="btn" data-a="valider">Valider</button></div>
        <div class="attente"><span class="point-attente"></span> En attente de votre connexion sur la page Microsoft…</div></div>` });
  const valider = async () => {
    const adresse = $('[name="retour"]', f).value.trim();
    if (!adresse) return;
    try { await api("POST", "/api/outlook/connexion/retour", { adresse }); }
    catch (e) { signalerErreur(e); }
  };
  $('[data-a="valider"]', f).onclick = valider;
  $('[name="retour"]', f).addEventListener("paste", () => setTimeout(valider, 50));  // collé : validé aussitôt
  const suivre = setInterval(async () => {
    if (!f.isConnected) return arret();
    let e;
    try { e = await relectureAuto(etatOutlook); } catch (err) { if (err.message === "401") arret(); return; }
    const cx = e.connexion || {};
    if (cx.etat === "connecte") {  // pas l'adresse seule : elle reste connue quand le jeton a expiré
      arret();
      $(".f-corps", f).innerHTML = `<div class="succes-outlook">${icone("mail")}<b>Boîte connectée</b><span>${echap(e.adresse)}</span></div>`;
      setTimeout(() => { f.fermer(); apres?.(); }, 1400);
    } else if (cx.etat === "erreur") {
      arret();
      $(".attente", f).outerHTML = `<div class="alerte">${echap(cx.message)}</div>${htmlAction(cx.action)}
        <div><button class="btn" data-a="encore">Recommencer</button></div>`;
      $('[data-a="encore"]', f).onclick = () => { f.fermer(); connecterOutlook(apres); };
    }
  }, 2500);
  const arret = () => { clearInterval(suivre); SUIVIS.delete(arret); };
  SUIVIS.add(arret);
  return f;
}

/** Paramètres › Messagerie Outlook : état de la boîte, vérification de la configuration Microsoft, connexion. */
async function sectionOutlook(bloc) {
  bloc.innerHTML = `<div class="groupe-titre">MESSAGERIE OUTLOOK · ${echap(S.moi.nom.toUpperCase())}</div><div class="aide">Vérification…</div>`;
  let e;
  try { e = await etatOutlook(); } catch (err) { $(".aide", bloc).outerHTML = `<div class="alerte">${echap(err.message)}</div>`; return; }
  const corps = e.adresse
    ? `<div class="ligne-outlook ok">${icone("mail")}<div><b>Connectée : ${echap(e.adresse)}</b><br><span>Les mails partent de cette boîte et arrivent dans ses Éléments envoyés.</span></div>
        <button class="btn petit fantome danger" data-a="deconnecter">Déconnecter</button></div>`
    : !e.client_id ? `<div class="ligne-outlook">${icone("mail")}<div><b>Microsoft 365 non configuré (facultatif)</b><br><span>Sans lui, chaque mail se télécharge
        (.eml, avis joint) ou s'ouvre dans votre messagerie. Pour l'activer : identifiant de l'application Microsoft du cabinet dans config.json, ou ci-dessous.</span></div></div>`
    : `<div class="ligne-outlook">${icone("mail")}<div><b>Boîte non connectée</b><br><span>Nécessaire pour les brouillons, les envois et le suivi « Envoyé le ».</span></div>
        <button class="btn principal petit" data-a="connecter">Connecter ma boîte</button></div>`;
  bloc.innerHTML = `<div class="groupe-titre">MESSAGERIE OUTLOOK · ${echap(S.moi.nom.toUpperCase())}</div>${corps}
    <div class="champ"><label>Ma signature, en bas de mes mails envoyés depuis l'application</label>
      <div class="sig-editeur"></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn petit" data-a="signature">Enregistrer ma signature</button>
        <button class="btn petit fantome" data-a="sig-dossier">${icone("dossier")} Reprendre ma signature Outlook</button>
        <label class="btn petit fantome">Importer un fichier (.htm)<input type="file" accept=".htm,.html" multiple data-a="sig-fichier" hidden></label></div></div>
    <div class="verif"></div>
    <details class="avance"><summary>Réglages avancés</summary>
      <div class="champ"><label>Identifiant de l'application Microsoft du cabinet (Microsoft Entra)</label>
        <div class="montant-unite"><input class="saisie" name="client_id" value="${echap(e.client_id)}"><button class="btn" data-a="verifier">Vérifier</button></div>
        <small class="aide">Vide : celui de config.json (« microsoft_client_id »). Entra › Inscriptions d'applications › ID d'application (client).</small></div>
      <div class="champ"><label>Secret de l'application (adresse du site sous « Web » dans Microsoft Entra)</label>
        <div class="montant-unite"><input class="saisie" type="password" autocomplete="off" name="secret" placeholder="${e.secret ? "Enregistré" : "Valeur du secret client"}"><button class="btn" data-a="secret">Enregistrer</button></div>
        <small class="aide">Entra › votre application › Certificats et secrets : collez la « Valeur ». Vide + Enregistrer : retiré.</small></div>
      <label class="case"><input type="checkbox" name="retour_auto" ${e.retour_auto ? "checked" : ""}>Retour automatique dans l'application après la connexion Microsoft</label>
      <small class="aide">À cocher une fois l'adresse <b>${echap(e.adresse_site)}</b> ajoutée dans Microsoft Entra :
        votre application › Authentification › Applications mobiles et de bureau › URI de redirection. Sans elle, on colle l'adresse de retour.
        En local (localhost), le retour est toujours automatique.</small></details>`;
  S.signature = null; S.signatureEtat = null;
  let actuelle = { html: "" };
  try { actuelle = await api("GET", "/api/signature"); } catch { /* sans signature */ }
  S.signature = actuelle.personnalisee ? actuelle.html : null;
  const sig = editeurTexte(actuelle.html, "Votre signature…");
  $(".sig-editeur", bloc).append(sig.el);
  $('[data-a="signature"]', bloc).onclick = async () => {
    try { S.signature = (await api("POST", "/api/signature", { html: sig.html() })).html; S.signatureEtat = null; toast("Signature enregistrée."); } catch (err) { signalerErreur(err); }
  };
  const reprise = async (html) => { sig.zone.innerHTML = html; if (await proposerSignature(html)) sig.zone.innerHTML = S.signature; };
  const depuisFichiers = async (liste) => {
    if (!liste.length) return toast("Aucune signature trouvée dans ces fichiers.", { erreur: true });
    const choisie = liste.length === 1 ? liste[0] : await choisirSignature(liste);
    if (choisie) await reprise(choisie.html);
  };
  $('[data-a="sig-dossier"]', bloc).onclick = async () => { const h = await fenetreSignatureOutlook(); if (h) sig.zone.innerHTML = h; };
  $('[data-a="sig-fichier"]', bloc).onchange = async (ev) => { await depuisFichiers(await signaturesDesFichiers(ev.target.files)); ev.target.value = ""; };
  const verif = $(".verif", bloc);
  const verifier = async () => {
    verif.innerHTML = '<div class="aide">Vérification de la configuration Microsoft…</div>';
    try {
      const v = await api("POST", "/api/outlook/verifier");
      verif.innerHTML = v.ok ? "" : `<div class="alerte"><b>${echap(v.erreur)}</b></div>${htmlAction(v.action)}`;
    } catch (err) { verif.innerHTML = `<div class="alerte">Vérification impossible : ${echap(err.message)}</div>`; }
  };
  $('[data-a="connecter"]', bloc)?.addEventListener("click", () => connecterOutlook(() => sectionOutlook(bloc)));
  $('[data-a="deconnecter"]', bloc)?.addEventListener("click", () => deconnecterOutlook(() => sectionOutlook(bloc)));
  $('[name="retour_auto"]', bloc).onchange = (ev) => api("POST", "/api/outlook/reglages", { retour_auto: ev.target.checked })
    .then(() => toast(ev.target.checked ? "Retour automatique activé." : "Retour automatique désactivé.")).catch(signalerErreur);
  $('[data-a="secret"]', bloc).onclick = async () => {
    const champ = $('[name="secret"]', bloc);
    try {
      await api("POST", "/api/outlook/reglages", { secret: champ.value });
      toast(champ.value.trim() ? "Secret enregistré (chiffré)." : "Secret retiré.");
      sectionOutlook(bloc);
    } catch (err) { signalerErreur(err); }
  };
  $('[data-a="verifier"]', bloc).onclick = async () => {
    await api("POST", "/api/outlook/reglages", { client_id: $('[name="client_id"]', bloc).value }).catch(signalerErreur);
    verifier();
  };
  if (!e.adresse && e.client_id) verifier();
}

/** Bandeau « boîte non connectée » en haut d'une page qui envoie des mails. */
function bandeauBoite(adresse) {
  if (adresse) return null;
  const b = el(`<div class="bandeau">${icone("mail")}<span><b>Boîte Outlook non connectée</b> : brouillons, envois et suivi « Envoyé le » indisponibles.</span>
    <button class="btn petit principal">Connecter ma boîte</button></div>`);
  $("button", b).onclick = () => connecterOutlook(() => rendre());
  return b;
}

// ---------- Tableaux : cases à cocher avec Maj (plage) et Ctrl (lignes sélectionnées) ----------
/**
 * Branche la sélection façon tableur sur un tbody : clic sur une ligne avec Ctrl = la sélectionne (surlignée) ;
 * case cochée avec Maj = toute la plage depuis la dernière case de la même colonne ; avec Ctrl = toutes les lignes surlignées.
 * auCocher(cases, etat) reçoit toutes les cases visées (colonne « nom »).
 */
function selectionTableur(tbody, auCocher) {
  const derniere = {};
  tbody.addEventListener("click", (ev) => {
    const tr = ev.target.closest("tr");
    if (!tr || ev.target.closest("button, input, a, .choix-mini, [contenteditable]")) return;
    if (ev.ctrlKey || ev.metaKey) tr.classList.toggle("selectionnee");
  });
  tbody.addEventListener("click", (ev) => {
    const c = ev.target.closest('input[type="checkbox"][data-col]');
    if (!c) return;
    const col = c.dataset.col, cases = $$(`input[type="checkbox"][data-col="${col}"]:not(:disabled)`, tbody);
    let visees = [c];
    if (ev.shiftKey && derniere[col] && cases.includes(derniere[col])) {
      const [a, b] = [cases.indexOf(derniere[col]), cases.indexOf(c)].sort((x, y) => x - y);
      visees = cases.slice(a, b + 1);
    } else if (ev.ctrlKey || ev.metaKey) {
      visees = [...new Set([c, ...$$("tr.selectionnee", tbody).map((tr) => $(`input[type="checkbox"][data-col="${col}"]:not(:disabled)`, tr)).filter(Boolean)])];
    }
    derniere[col] = c;
    visees.forEach((x) => { x.checked = c.checked; });
    auCocher(visees, c.checked, col);
  });
}

/** Cellule e-mail modifiable : clic = champ de saisie ; Entrée ou sortie = enregistré ; Échap = annulé. */
function emailModifiable(td, valeur, enregistrer) {
  td.onclick = () => {
    if ($("input", td)) return;
    const champ = el(`<input class="saisie saisie-cellule" value="${echap(valeur)}" placeholder="adresse@client.fr">`);
    td.innerHTML = ""; td.append(champ); champ.focus(); champ.select();
    let fini = false;
    const finir = async (garder) => {
      if (fini) return; fini = true;
      const v = champ.value.trim();
      if (garder && v !== valeur) {
        if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { toast("Adresse e-mail invalide.", { erreur: true }); fini = false; champ.focus(); return; }
        await enregistrer(v);
      } else td.innerHTML = valeur ? echap(valeur) : '<span class="rouge">à saisir</span>';
    };
    champ.onkeydown = (e) => { if (e.key === "Enter") finir(true); if (e.key === "Escape") finir(false); };
    champ.onblur = () => finir(true);
  };
}

// ---------- Échanges par mail avec un client : fils, lecture, réponse dans le fil ----------
const participantsMail = (m) => [m.de, ...m.a, ...m.cc].map((x) => (x.adresse || "").toLowerCase()).filter(Boolean);
/** Fils échangés avec cette adresse, le plus récent d'abord : [{id, objet, mails, dernier, non_lus}]. */
function filsAvec(mails, email) {
  email = (email || "").trim().toLowerCase();
  if (!mails || !email) return [];
  const groupes = {};
  for (const m of mails) if (participantsMail(m).includes(email)) (groupes[m.conversation] ||= []).push(m);
  return Object.entries(groupes).map(([id, ms]) => {
    ms.sort((a, b) => a.le.localeCompare(b.le));
    return { id, objet: ms[0].objet.replace(/^((re|tr|fw|fwd)\s*:\s*)+/i, "") || ms[0].objet, mails: ms, dernier: ms[ms.length - 1],
      non_lus: ms.filter((m) => m.entrant && !m.lu).length };
  }).sort((a, b) => b.dernier.le.localeCompare(a.dernier.le));
}
/** Bouton « n mails » (point si une réponse n'est pas lue) ; vide s'il n'y a aucun échange. */
function boutonFils(fils, sujet) {
  if (!fils.length) return "";
  const n = fils.reduce((s, f) => s + f.mails.length, 0), nonLus = fils.reduce((s, f) => s + f.non_lus, 0);
  const recus = fils.reduce((s, f) => s + f.mails.filter((m) => m.entrant).length, 0);
  return `<button class="btn petit ${nonLus ? "a-lire" : ""}" data-a="echanges" title="${pluriel(n, "mail")} ${sujet} avec ce client, dont ${pluriel(recus, "reçu")}${nonLus ? ` (${pluriel(nonLus, "non lu")})` : ""}. Cliquer pour voir et répondre.">
    ${icone("mail")} ${n}${nonLus ? '<span class="point-message"></span>' : ""}</button>`;
}
/** Heure courte façon messagerie : « 14:20 » aujourd'hui, « hier », « 28 oct. », « 28/10/2025 » les autres années. */
function quandCourt(iso) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date(), jour = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const ecart = Math.round((jour(now) - jour(d)) / 864e5);
  if (ecart === 0) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (ecart === 1) return "hier";
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return d.toLocaleDateString("fr-FR");
}
function quandLong(iso) {
  return iso ? new Date(iso).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";
}
const nomDe = (m) => (m.entrant ? m.de.nom || m.de.adresse : "Vous");
const correspondant = (f) => { const m = [...f.mails].reverse().find((x) => x.entrant) || f.mails[0]; return m.entrant ? m.de.nom || m.de.adresse : (m.a[0] || {}).nom || (m.a[0] || {}).adresse || ""; };

/** Fenêtre des échanges avec un client : une petite messagerie (fils à gauche, lecture à droite, réponse dans le fil). */
function fenetreFils({ titre, sujet, fils, moi = "", aLaFermeture = null, apresEnvoi = null }) {
  moi = (moi || "").toLowerCase();
  const f = fenetre({ titre, sous: `${pluriel(fils.length, "conversation")} ${sujet}`, classe: "large", corps: '<div class="mx-pop"></div>' });
  f.classList.add("fenetre-echanges");
  f.aLaFermeture = aLaFermeture;  // fils lus : le bouton n'est plus marqué « nouveau »
  const zone = $(".mx-pop", f);
  zone.dataset.moi = moi;
  zone.innerHTML = `<div class="mx">
      <aside class="mx-liste">
        <div class="mx-outils"><label class="mx-cherche">${icone("recherche")}<input placeholder="Rechercher"></label></div>
        <div class="mx-fils"></div>
      </aside>
      <section class="mx-lecture"></section></div>`;
  const liste = $(".mx-fils", zone), lecture = $(".mx-lecture", zone);
  const dessiner = (q = "") => {
    const ls = fils.filter((x) => !q || `${x.objet} ${correspondant(x)} ${x.mails.map((m) => m.apercu).join(" ")}`.toLowerCase().includes(q));
    liste.innerHTML = ls.map((x) => { const der = x.mails[x.mails.length - 1]; return `<button class="mx-fil ${x.non_lus ? "non-lu" : ""}" data-fil="${echap(x.id)}">
        ${avatar(correspondant(x), "mx-av")}
        <span class="mx-fil-txt"><span class="mx-l1"><b>${echap(correspondant(x))}</b>${x.mails.length > 1 ? `<em>${x.mails.length}</em>` : ""}${x.mails.some((m) => m.pj) ? icone("trombone", "mx-tr") : ""}<time>${quandCourt(x.dernier.le)}</time></span>
          <span class="mx-l2">${echap(x.objet)}</span>
          <span class="mx-l3">${der.entrant ? "" : "Vous : "}${echap(der.apercu)}</span></span>
        ${x.non_lus ? '<i class="mx-point"></i>' : ""}</button>`; }).join("")
      || `<div class="mx-rien">${q ? "Aucun résultat." : "Aucune conversation."}</div>`;
    $$("[data-fil]", liste).forEach((b) => b.onclick = () => {
      $$("[data-fil]", liste).forEach((x) => x.classList.toggle("choisi", x === b));
      lireFilOutils(zone, fils.find((x) => x.id === b.dataset.fil), b, apresEnvoi, f);
    });
  };
  dessiner();
  $(".mx-cherche input", zone).oninput = (e) => dessiner(e.target.value.trim().toLowerCase());
  const premier = $("[data-fil]", liste);
  if (premier) premier.click();
  else lecture.innerHTML = `<div class="mx-vide">${icone("mail")}<b>Aucun échange</b><span>avec ce client depuis un an.</span></div>`;
}

/** Lecture d'un fil : mails dépliables, le dernier et les non lus ouverts, pièces jointes, réponse dans le fil. */
function lireFilOutils(zone, fil, bouton, apresEnvoi, fenetreEchanges) {
  const lecture = $(".mx-lecture", zone);
  const moi = zone.dataset.moi || "";  // les participants, sans soi-même
  const gens = [...new Set(fil.mails.flatMap((m) => [m.de, ...m.a, ...m.cc]).filter((x) => x.adresse && x.adresse.toLowerCase() !== moi).map((x) => x.nom || x.adresse))];
  const avecPj = fil.mails.filter((m) => m.pj).length;
  const lien = [...fil.mails].reverse().find((m) => m.lien)?.lien;
  lecture.innerHTML = `<header class="mx-tete">
      <div class="mx-tete-l1"><h3>${echap(fil.objet)}</h3>
        <div class="mx-actions">${fil.mails.length > 1 ? '<button class="btn fantome petit" data-a="tout">Tout déplier</button>' : ""}
          ${lien ? `<a class="btn fantome petit" href="${echap(lien)}" target="_blank" rel="noopener">Ouvrir dans Outlook ↗</a>` : ""}</div></div>
      <div class="mx-gens">${gens.slice(0, 5).map((g) => `<span>${echap(g)}</span>`).join("")}${gens.length > 5 ? `<span>+${gens.length - 5}</span>` : ""}
        <span class="mx-compteur">${fil.mails.length} message${fil.mails.length > 1 ? "s" : ""}${avecPj ? ` · ${icone("trombone")} ${avecPj} avec pièce jointe` : ""}</span></div></header>
    <div class="mx-mails"></div>
    <div class="mx-reponse"><button class="mx-repondre">${avatar(S.moi.nom, "mx-av-p")}<span>Répondre à ${echap(correspondant(fil))}…</span></button></div>`;
  const liste = $(".mx-mails", lecture);
  const ouvertures = [];
  fil.mails.forEach((m, i) => {
    const dernier = i === fil.mails.length - 1;
    const bloc = el(`<article class="mx-mail ${m.entrant ? "" : "moi"}" tabindex="0">
        <div class="mx-mail-tete">${avatar(m.entrant ? m.de.nom || m.de.adresse : S.moi.nom, "mx-av")}
          <div class="mx-qui"><div class="mx-nom"><b>${echap(nomDe(m))}</b>${m.entrant ? `<small>${echap(m.de.adresse)}</small>` : ""}</div>
            <div class="mx-apercu-ligne">${echap(m.apercu)}</div>
            <div class="mx-dest">à ${echap(m.a.map((x) => x.nom || x.adresse).join(", "))}${m.cc.length ? ` · cc ${echap(m.cc.map((x) => x.nom || x.adresse).join(", "))}` : ""}</div></div>
          ${m.pj ? `<span class="mx-trombone" title="Pièce(s) jointe(s)">${icone("trombone")}</span>` : ""}
          <time title="${quandLong(m.le)}">${quandCourt(m.le)}</time></div>
        <div class="mx-corps"><div class="mx-texte"><div class="mx-squelette"><i></i><i></i><i></i></div></div><div class="mx-pj"></div></div></article>`);
    liste.append(bloc);
    let charge = false;
    const ouvrir = async () => {
      bloc.classList.add("ouvert");
      if (charge) return;
      charge = true;
      try {
        const c = await api("GET", `/api/mail/${encodeURIComponent(m.id)}`);
        m.lu = true;
        const texte = (c.texte || c.complet || "(message vide)").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
        $(".mx-texte", bloc).textContent = texte;
        $(".mx-pj", bloc).innerHTML = c.pj.length ? `<div class="mx-pj-titre">${icone("trombone")} ${c.pj.length} pièce${c.pj.length > 1 ? "s" : ""} jointe${c.pj.length > 1 ? "s" : ""}</div>
          <div class="mx-pj-liste">${c.pj.map((a) => { const ext = (a.nom.includes(".") ? a.nom.split(".").pop() : "").slice(0, 4).toUpperCase() || "FICH";
            const url = `/api/mail/${encodeURIComponent(m.id)}/pj/${encodeURIComponent(a.id)}`;
            return `<div class="mx-fichier"><span class="mx-ext e-${ext.toLowerCase()}">${echap(ext)}</span>
              <span class="mx-fichier-nom"><b title="${echap(a.nom)}">${echap(a.nom)}</b><small>${a.taille > 1048576 ? (a.taille / 1048576).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(a.taille / 1024)) + " Ko"}</small></span>
              <a class="mx-rond" href="${url}?voir=1" target="_blank" rel="noopener" title="Ouvrir">${icone("ouvrir")}</a>
              <a class="mx-rond" href="${url}" title="Télécharger">${icone("telecharger")}</a></div>`; }).join("")}</div>` : "";
      } catch (e) { $(".mx-texte", bloc).innerHTML = `<div class="alerte">${echap(e.message)}</div>`; }
      if (dernier) liste.scrollTo({ top: Math.max(0, bloc.offsetTop - 16), behavior: "auto" });  // on arrive sur le début du dernier mail
    };
    ouvertures.push(ouvrir);
    bloc.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return;
      if (!bloc.classList.contains("ouvert")) return ouvrir();
      if (e.target.closest(".mx-mail-tete") && !dernier) bloc.classList.remove("ouvert");  // replier : clic sur l'en-tête
    });
    bloc.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === bloc) ouvrir(); });
    if (dernier || (!m.lu && m.entrant)) ouvrir();  // le dernier et les non lus s'ouvrent d'office
  });
  $('[data-a="tout"]', lecture)?.addEventListener("click", (e) => {
    const tout = e.currentTarget.textContent === "Tout déplier";
    if (tout) ouvertures.forEach((o) => o()); else $$(".mx-mail", liste).forEach((b, i, ls) => i < ls.length - 1 && b.classList.remove("ouvert"));
    e.currentTarget.textContent = tout ? "Tout replier" : "Tout déplier";
  });
  bouton?.classList.remove("non-lu"); bouton?.querySelector(".mx-point")?.remove();
  // Réponse dans le fil : à l'expéditeur d'un mail reçu, ou aux destinataires de notre propre mail
  const m = fil.dernier;
  const a = [...new Set((m.entrant ? [m.de.adresse] : m.a.map((x) => x.adresse)).filter((x) => x && x.toLowerCase() !== moi))];
  const cc = [...new Set(m.cc.map((x) => x.adresse).filter((x) => x && x.toLowerCase() !== moi && !a.includes(x)))];
  $(".mx-repondre", lecture).onclick = () => composer({ titre: `Répondre · ${fil.objet}`, repondre_a: m.id, a, aCoches: a, cc: cc.join(", "),
    url: "/api/mail/repondre", apres: () => { fenetreEchanges.fermer(); apresEnvoi?.(); } });
}

/** Bandeau « vos mails partent avec une signature simple » + bouton pour reprendre celle d'Outlook (traité par le clic commun). */
function bandeauSignature() {
  const b = el(`<div class="bandeau">${icone("mail")}<div><b>Signature simple dans vos mails</b> : votre signature Outlook (avec le logo) n'est pas encore reprise dans l'application.</div>
    <button class="btn petit principal" data-a="sig-changer">${icone("dossier")} Reprendre ma signature Outlook</button></div>`);
  return b;
}
