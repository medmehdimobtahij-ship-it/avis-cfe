/* Avis de CFE · l'écran des avis : un client par ligne, avec son avis de l'année et celui de l'année précédente.
   Filtre « Année » en haut : tout l'écran suit l'année choisie (avis, montants CFE N / N-1 / Var., mails envoyés, échanges).
   Un dossier n'est proposé que si impots.gouv le donne encore à payer (ou en prélèvement). Un avis à payer est réglé par le
   cabinet (télérèglement) ; case « Envoyé » cochée toute seule à l'envoi ou trouvée dans les Éléments envoyés, cochable à la
   main ; un mail déjà parti ou un échange en cours n'empêche jamais l'envoi (signalé). Avis rangés dans OneDrive.
   Chaque service est facultatif : sans Outlook, le mail se télécharge (.eml) ou s'ouvre dans la messagerie du PC ; sans
   SharePoint, les PDF se téléchargent ; sans ComptaZap, les avis viennent d'un fichier ou d'une saisie. */
"use strict";

const CFE_A_ENVOYER = ["à payer", "prélèvement", "rien à payer"];  // avis à 0 € compris : le client est informé
const PASTILLES_CFE = { "à payer": ["À payer", "violet"], "prélèvement": ["Prélèvement auto.", "orange"], "payé": ["Déjà payé", "vert"],
  "rien à payer": ["Rien à payer", "gris"], "à vérifier": ["À vérifier", "rouge"] };
const CIVILITES_CFE = { M: "M.", Mme: "Mme", "": "Non précisé" };
const C = {
  d: null, echanges: null, filtre: "envoyer", recherche: "", coches: new Set(),
  annee: null,  // filtre « Année » (null : celle des Paramètres)
  masquerPrec: (() => { try { return localStorage.getItem("avis-cfe-prec") === "1"; } catch { return false; } })(),
  montant: (() => { try { return localStorage.getItem("avis-cfe-montant") || ""; } catch { return ""; } })(),  // tranche de montant
  tri: "",  // "" (par société), "desc" ou "asc" (par montant) : clic sur l'en-tête « CFE N »
};
/** Montant affiché dans la colonne « CFE N » (centimes) : le reste dû, sinon le total des avis. */
const montantCfe = (l) => (["à payer", "prélèvement", "à vérifier"].includes(l.statut) ? l.montant : l.total_avis) || 0;
const TRANCHES_CFE = { "": ["Tous les montants", () => true], zero: ["0 €", (c) => c === 0], "moins100": ["Moins de 100 €", (c) => c > 0 && c < 10000],
  "100-500": ["100 à 500 €", (c) => c >= 10000 && c < 50000], "500-1000": ["500 à 1 000 €", (c) => c >= 50000 && c < 100000],
  "plus1000": ["1 000 € et plus", (c) => c >= 100000] };
const aEnvoyer = (l) => CFE_A_ENVOYER.includes(l.statut);

/** PDF des avis récupérés sur le réseau (SharePoint › sauvegarde ComptaZap › NOM-SIREN › CFE) : rien à choisir. Quelques avis
 *  par requête, avec la progression ; une seule fois par avis, communs à tout le cabinet. */
async function recupererPdfsCfe(manquants = C.d?.pdfs_manquants || []) {
  if (C.pdfs || !manquants.length) return;
  C.pdfs = { fait: 0, total: manquants.length };
  if (S.page === "cfe") remplirCfe();
  let ok = 0, absents = 0, erreur = null;
  for (let i = 0; i < manquants.length; i += 40) {
    try {
      const r = await api("POST", "/api/cfe/pdf/reseau", { cles: manquants.slice(i, i + 40).map((m) => m.cle) });
      ok += r.ok.length; absents += r.absents.length;
    } catch (e) { erreur = e; break; }
    C.pdfs.fait = Math.min(i + 40, manquants.length);
    const t = $(".progression-pdf-cfe");
    if (t) { $(".progression-barre i", t).style.width = (100 * C.pdfs.fait / C.pdfs.total).toFixed(1) + "%"; $(".progression-texte", t).textContent = `${C.pdfs.fait} / ${C.pdfs.total}`; }
  }
  C.pdfs = null;
  if (erreur) erreurAction(erreur);
  else toast(`${pluriel(ok, "PDF", "PDF")} d'avis récupéré${ok > 1 ? "s" : ""} sur le réseau`
    + (absents ? ` · ${absents} pas encore dans la sauvegarde ComptaZap du SharePoint` : "") + ".", { erreur: !ok && !!absents, duree: absents ? 9000 : 4500 });
  if (S.page === "cfe") { await chargerCfe().catch(() => {}); remplirCfe(); }
}

/** Secours : PDF choisis dans un dossier du PC (export de ComptaZap, ou copie OneDrive de la sauvegarde). Avis repérés par leur
 *  référence (fin du nom de fichier « …-<référence>.pdf ») et leur SIREN dans le chemin. */
function fenetrePdfCfe() {
  const manquants = C.d?.pdfs_manquants || [];
  if (!manquants.length) return toast("Tous les PDF des avis sont déjà sur le site.");
  const dossier = C.d.export_comptazap || "";
  const f = fenetre({ titre: "PDF des avis depuis un dossier du PC", sous: `Secours · ${pluriel(manquants.length, "avis", "avis")} pas trouvé${manquants.length > 1 ? "s" : ""} sur le réseau`, classe: "moyenne",
    corps: `<ol class="etapes-action">
        <li>« Choisir le dossier », puis dans la fenêtre Windows, collez dans la barre d'adresse${dossier ? ` : <code>${echap(dossier)}</code>` : " le dossier d'export de ComptaZap (Bureau › COMPTAZAP)"} et Entrée.</li>
        <li>« Sélectionner un dossier » (et « Importer » si le navigateur le demande) : l'outil prend seulement les avis de CFE attendus.</li></ol>
      <div class="ligne-boutons"><button class="btn principal" data-a="dossier">${icone("dossier")} Choisir le dossier</button>
        ${dossier ? `<button class="btn" data-a="copier">${icone("copier")} Copier l'adresse du dossier</button>` : ""}</div>
      <div class="aide etat-import"></div>
      <input type="file" webkitdirectory class="cache" name="dossier-pdf">` });
  const etat = $(".etat-import", f), bouton = $('[data-a="dossier"]', f), champ = $('[name="dossier-pdf"]', f);
  $('[data-a="copier"]', f)?.addEventListener("click", () => copierTexte(dossier, "Adresse copiée : collez-la dans la fenêtre du navigateur."));
  bouton.onclick = () => champ.click();
  champ.onchange = async () => {
    const fichiers = [...champ.files]; champ.value = "";
    if (!fichiers.length) return;
    const parRef = {};
    for (const m of manquants) if (m.reference) (parRef[m.reference.toLowerCase()] ??= []).push(m);
    const trouves = new Map();
    for (const fi of fichiers) {
      const ref = fi.name.toLowerCase().match(/-([a-z0-9]+)\.pdf$/)?.[1];
      const candidats = ref && parRef[ref];
      if (!candidats) continue;
      const chemin = (fi.webkitRelativePath || fi.name).replace(/\\/g, "/");
      // le bon client (SIREN dans le chemin), ou le seul avis de cette référence
      const m = candidats.find((x) => chemin.includes(x.siren)) || (candidats.length === 1 ? candidats[0] : null);
      if (m && !trouves.has(m.cle)) trouves.set(m.cle, fi);
    }
    if (!trouves.size) { etat.textContent = ""; return toast("Aucun avis attendu dans ce dossier : choisissez le dossier d'export de ComptaZap (Bureau › COMPTAZAP).", { erreur: true, duree: 8000 }); }
    bouton.disabled = true;
    let n = 0, echecs = 0;
    for (const [cle, fi] of trouves) {
      etat.textContent = `Envoi des avis : ${n + echecs + 1} / ${trouves.size}…`;
      try { await api("POST", "/api/cfe/pdf", { cle, contenu: await enBase64(fi) }); n++; }
      catch (e) { echecs++; if (e.message === "401") return; }
    }
    const reste = manquants.length - n;
    toast(`${pluriel(n, "PDF", "PDF")} d'avis ajouté${n > 1 ? "s" : ""}${reste ? ` · ${reste} introuvable${reste > 1 ? "s" : ""} dans ce dossier (ComptaZap ne les a pas encore téléchargés ?)` : ""}.`,
      { erreur: !n, duree: reste ? 9000 : 4500 });
    f.fermer();
    if (S.page === "cfe") { await chargerCfe().catch(() => {}); remplirCfe(); }
  };
}

async function chargerCfe(frais = false) {
  const q = [C.annee ? `annee=${C.annee}` : "", frais ? "frais=1" : ""].filter(Boolean).join("&");
  C.d = await api("GET", "/api/cfe" + (q ? `?${q}` : ""));
  S.microsoft = C.d.microsoft;  // menu de la personne : « Connecter ma boîte » seulement si Microsoft est configuré
  return C.d;
}

function pageCfe(zone) {
  zone.classList.add("page-outil");
  zone.innerHTML = `<div class="barre">
      <button class="btn principal" data-a="importer" title="Lit les avis, paiements et dettes de CFE dans ComptaZap, ici dans le navigateur">${icone("actualiser")} Importer depuis ComptaZap</button>
      <button class="rond petit-rond" data-a="changer-cz" title="Explications de l'import ComptaZap (premier import, autre dossier)">${icone("dossier")}</button>
      <button class="btn" data-a="fichier" title="Avis listés dans un fichier CSV ou Excel (sans ComptaZap) : colonnes société, SIREN, montant…">Importer un fichier</button>
      <button class="btn" data-a="saisir" title="Saisir un avis à la main (société, SIREN, montant, date limite…)">${icone("plus")} Saisir un avis</button>
      <select class="saisie choix-annee" name="annee-cfe" title="Année des avis de CFE affichée : avis, montants N / N-1, mails envoyés et échanges de cette année"></select>
      <button class="btn cache" data-a="onedrive" title="Copie les avis de l'année dans le dossier de chaque client (rien n'est remplacé ni supprimé)">Ranger dans OneDrive</button>
      <button class="btn cache" data-a="zip" title="Tous les PDF des avis de l'année, dans une archive, pour les ranger vous-même">${icone("telecharger")} PDF de l'année</button>
      <label class="recherche">${icone("recherche")}<input class="saisie" placeholder="Société, interlocuteur, SIREN…" value="${echap(C.recherche)}"></label>
      <div class="segments" id="filtre-cfe"><span class="pilule"></span>
        <button data-v="envoyer" title="Avis à payer ou prélevés, dont la case « Envoyé » n'est pas cochée">À envoyer <span class="compte" data-n="envoyer"></span></button><button data-v="tous">Tous <span class="compte" data-n="tous"></span></button></div>
      <select class="saisie choix-montant" name="montant-cfe" title="N'afficher que les avis de CFE dans cette tranche de montant (colonne CFE de l'année)">
        ${Object.entries(TRANCHES_CFE).map(([k, [t]]) => `<option value="${k}" ${C.montant === k ? "selected" : ""}>${t}</option>`).join("")}</select>
      <label class="case" title="Cache les colonnes de l'année précédente et de l'écart (Var.)"><input type="checkbox" name="masquer-prec" ${C.masquerPrec ? "checked" : ""}><span class="libelle-prec">Masquer N-1 et Var.</span></label>
      <span class="espace"></span><span class="info" id="info-cfe"></span>
    </div>
    <div class="zone-bandeaux"></div>
    <div class="tableau outil" id="tableau-cfe"><div class="chargement">Lecture des avis…</div></div>
    <div class="pied-page">
      <button class="btn petit" data-a="tout">Tout cocher / décocher</button>
      <button class="btn petit" data-a="brouillons" disabled title="Un brouillon par mail coché dans votre boîte Outlook (texte, avis joint) : rien n'est envoyé. Sans Outlook : un fichier .eml par mail">Créer les brouillons</button>
      <button class="btn petit principal" data-a="envoyer" disabled>${icone("envoyer")} Envoyer les cochés</button>
      <label class="case" title="Les mails partent (ou sont créés en brouillon) avec l'importance haute : point d'exclamation rouge chez le client"><input type="checkbox" name="importance-cfe">Importance haute</label>
      <span class="espace"></span>
      <span class="legende"><i class="pt violet"></i>À payer<i class="pt orange"></i>Prélèvement auto.<i class="pt vert"></i>Payé / envoyé<i class="pt rouge"></i>À vérifier<i class="pt gris"></i>Rien à payer</span>
    </div>`;
  const champRecherche = $(".recherche input", zone);
  champRecherche.oninput = apresFrappe(() => { C.recherche = champRecherche.value; remplirCfe(); });
  segments($("#filtre-cfe", zone), C.filtre, (v) => { C.filtre = v; remplirCfe(true); });
  $('[name="masquer-prec"]', zone).onchange = (ev) => {
    C.masquerPrec = ev.target.checked;
    try { localStorage.setItem("avis-cfe-prec", C.masquerPrec ? "1" : "0"); } catch { /* sans mémoire */ }
    remplirCfe();
  };
  $('[name="annee-cfe"]', zone).onchange = (ev) => changerAnneeCfe(+ev.target.value);
  $('[name="montant-cfe"]', zone).onchange = (ev) => {
    C.montant = ev.target.value;
    try { localStorage.setItem("avis-cfe-montant", C.montant); } catch { /* sans mémoire */ }
    remplirCfe(true);
  };
  $('[name="importance-cfe"]', zone).onchange = async (ev) => {
    try { await api("POST", "/api/cfe/parametres", { IMPORTANCE_CFE: ev.target.checked ? "oui" : "non" }); C.d.importance = ev.target.checked; }
    catch (e) { ev.target.checked = !ev.target.checked; signalerErreur(e); }
  };
  $('[data-a="tout"]', zone).onclick = () => {  // un mail déjà envoyé ne se coche qu'à la main (pas de renvoi en masse par mégarde)
    const cases = $$('#tableau-cfe input[data-col="sel"]');
    const etat = !cases.some((c) => c.checked);
    const parCle = Object.fromEntries(C.d.lignes.map((l) => [l.cle, l]));
    cases.forEach((c) => {
      const cle = c.closest("tr").dataset.cle;
      if (etat && parCle[cle]?.envoye) return;
      c.checked = etat; etat ? C.coches.add(cle) : C.coches.delete(cle);
    });
    majSelectionCfe();
  };
  $('[data-a="importer"]', zone).onclick = () => importerComptaZap();
  $('[data-a="changer-cz"]', zone).onclick = () => fenetreImportCz();
  $('[data-a="onedrive"]', zone).onclick = () => rangerOneDrive();
  $('[data-a="zip"]', zone).onclick = () => { location.href = `/api/cfe/avis.zip?annee=${C.d.annee}`; };
  $('[data-a="fichier"]', zone).onclick = () => fenetreImportFichier();
  $('[data-a="saisir"]', zone).onclick = () => fenetreSaisieAvis();
  $('[data-a="envoyer"]', zone).onclick = () => envoiGroupeCfe();
  $('[data-a="brouillons"]', zone).onclick = () => brouillonsCfe();
  signature().then((s) => { C.signature = !!s.personnalisee; if (C.d) remplirCfe(); }).catch(() => {});
  chargerCfe().then(() => { remplirCfe(); chargerEchanges(); }).catch((e) => {
    const t = $("#tableau-cfe");  // page quittée entre-temps, ou session fermée : plus de tableau
    if (t) t.innerHTML = `<div class="vide-tableau"><b>Lecture impossible</b><span>${echap(e.message)}</span></div>`;
  });
  S.minuteur = setInterval(() => relectureAuto(() => { if (S.page === "cfe" && !$(".voile")) chargerCfe().then(remplirCfeAuFond).catch(() => {}); chargerEchanges(); }), 120000);
}

/** Tout l'écran passe à cette année ; la boîte mail est relue plus loin dans le passé si l'année l'exige. */
async function changerAnneeCfe(annee) {
  C.annee = annee; C.coches.clear(); C.echanges = null;
  $("#tableau-cfe").innerHTML = '<div class="chargement">Lecture des avis…</div>';
  try { await chargerCfe(); } catch (e) { return signalerErreur(e); }
  remplirCfe(); chargerEchanges();
}

/** Redessin venu d'une relecture de fond (toutes les 2 min, échanges) : attend qu'aucun e-mail ne soit en cours de saisie
 *  dans le tableau, sinon la saisie disparaîtrait. */
function remplirCfeAuFond() {
  if ($("#tableau-cfe .saisie-cellule")) return;
  remplirCfe();
}

function lignesCfe() {
  const q = C.recherche.trim().toLowerCase(), tranche = (TRANCHES_CFE[C.montant] || TRANCHES_CFE[""])[1];
  const out = C.d.lignes.filter((l) => (C.filtre !== "envoyer" || (aEnvoyer(l) && !l.envoye)) && tranche(montantCfe(l))
    && (!q || `${l.societe} ${l.nom_comptazap} ${l.siren} ${l.annee} ${l.contact.prenom} ${l.contact.nom} ${l.contact.email}`.toLowerCase().includes(q)));
  if (C.tri) out.sort((a, b) => (C.tri === "desc" ? -1 : 1) * (montantCfe(a) - montantCfe(b)));
  return out;
}

function chiffresCfe() {
  const toutes = C.d.lignes, du = toutes.filter(aEnvoyer);
  entete([
    chiffre(du.filter((l) => !l.envoye).length, "mails à envoyer", "violet"),
    chiffre(euros(toutes.filter((l) => l.statut === "à payer").reduce((s, l) => s + l.montant, 0)), "à régler par le cabinet"),
    chiffre(du.filter((l) => l.envoye).length, "envoyés", "vert"),
    chiffre(du.filter((l) => !l.contact.civilite && l.contact.formule !== "Tu" && !l.envoye).length, "civilités à choisir", "orange"),  // tutoiement : « Bonjour Prénom »
  ].join(""));
  $('[data-n="envoyer"]').textContent = du.filter((l) => !l.envoye).length;
  $('[data-n="tous"]').textContent = toutes.length;
  segmentsReplacer($("#filtre-cfe"));
}

/** jj/mm/aaaa du mail d'avis noté pour cette ligne (Éléments envoyés, sinon date cochée à la main) ; "" s'il n'est pas envoyé. */
function dateEnvoyee(l) {
  if (l.envoi_outlook && !l.refuse) return dateFr(l.envoi_outlook, true);
  return l.envoi_manuel ? dateFr(l.envoi_manuel, true) : "";
}

/** Avis de l'année précédente sans équivalent (même commune) cette année : le mail ne joindra qu'une partie des avis. */
function avisManquants(l) {
  const p = l.prec;
  if (!p || l.annee !== C.d.annee || l.avis.length >= p.avis.length) return [];
  const cle = (commune) => (commune || "").toUpperCase().replace(/[^A-Z]/g, "");
  const presentes = l.avis.map((a) => cle(a.commune)), manquants = [];
  for (const a of p.avis) {  // un avis de cette année couvre un seul avis de l'année précédente (même commune)
    const i = presentes.indexOf(cle(a.commune));
    if (i >= 0) presentes.splice(i, 1); else manquants.push(communePropre(a.commune));
  }
  return [...new Set(manquants)].map((c) => { const n = manquants.filter((x) => x === c).length; return n > 1 ? `${c} ×${n}` : c; });
}
const communePropre = (c) => (c || "").toLowerCase().split(/([ '\-])/).map((m, i) =>
  i && ["de", "du", "des", "la", "le", "les", "sur", "sous", "en", "et", "d", "l", "aux"].includes(m) ? m : m.charAt(0).toUpperCase() + m.slice(1)).join("");

/** Alertes sur le contenu du mail : avis absent de ComptaZap, avis à contester. */
function alertesAvis(l) {
  const a = [], manquants = avisManquants(l);
  if (manquants.length) a.push(`${l.prec.avis.length} avis en ${l.prec.annee} mais ${l.avis.length} seulement en ${l.annee} dans ComptaZap (manque : ${manquants.join(", ")}) : le mail ne joindra pas l'avis manquant`);
  if (l.contestation) a.push("à contester : le mail annonce une demande de précisions aux impôts");
  return a;
}

/** Ce qui existe déjà pour ce client cette année (mail d'avis envoyé, échanges) : signalé avant l'envoi, jamais bloquant. */
function precedentsCfe(l) {
  const notes = [];
  if (l.envoye) notes.push(`mail CFE déjà envoyé le ${dateEnvoyee(l)}`);
  const n = filsClient(l).reduce((s, f) => s + f.mails.length, 0);
  if (n) notes.push(`${pluriel(n, "mail déjà échangé", "mails déjà échangés")} sur la CFE ${l.annee}`);
  return notes;
}

function remplirCfe(doux = false) {
  if (S.page !== "cfe" || !C.d || !$("#tableau-cfe")) return;
  const d = C.d, prec = d.annee - 1;
  chiffresCfe();
  const choix = $('[name="annee-cfe"]');
  if (choix && choix.dataset.annees !== d.annees.join(",")) {
    choix.innerHTML = d.annees.map((a) => `<option value="${a}">CFE ${a}</option>`).join("");
    choix.dataset.annees = d.annees.join(",");
  }
  if (choix) choix.value = String(d.annee);
  const imp = $('[name="importance-cfe"]'); if (imp) imp.checked = !!d.importance;
  $(".libelle-prec").textContent = `Masquer ${prec} et Var.`;
  $("#info-cfe").innerHTML = [d.maj_comptazap && `Données ComptaZap du ${quandFr(d.maj_comptazap)}`, d.saisis && pluriel(d.saisis, "avis saisi", "avis saisis"),
    !d.outlook && d.boite && "Boîte Microsoft illisible : « Envoyé » et échanges non lus", d.demo && "Mode démo : aucun mail ne part"].filter(Boolean).map(echap).join(" · ");
  $('#page [data-a="onedrive"]')?.classList.toggle("cache", !d.sharepoint);
  $('#page [data-a="zip"]')?.classList.toggle("cache", !!d.sharepoint);
  const bandeaux = $(".zone-bandeaux"); bandeaux.innerHTML = "";
  const b = d.microsoft ? bandeauBoite(d.boite) : null; if (b) bandeaux.append(b);  // Outlook pas configuré : rien à signaler, le .eml suffit
  if (C.signature === false) bandeaux.append(bandeauSignature());
  if (C.pdfs) {  // récupération des PDF sur le réseau en cours
    bandeaux.append(el(`<div class="bandeau synchro progression-synchro progression-pdf-cfe"><span class="point-attente"></span>
      <div class="progression-corps"><div><b>PDF des avis</b> : récupération sur le réseau (sauvegarde ComptaZap) · <span class="progression-texte">${C.pdfs.fait} / ${C.pdfs.total}</span></div>
        <div class="progression-barre"><i style="width:${Math.max(2, 100 * C.pdfs.fait / C.pdfs.total).toFixed(1)}%"></i></div></div></div>`));
  } else if (d.pdfs_manquants?.length) {  // avis importés dont le PDF n'est pas encore sur le site
    const n = d.pdfs_manquants.length;
    const x = el(`<div class="bandeau"><span>${icone("pdf")}</span><div><b>${pluriel(n, "PDF", "PDF")} d'avis pas encore sur le site</b> :
      ${d.sharepoint ? "à récupérer sur le réseau (sauvegarde ComptaZap)" : "à prendre dans un dossier du PC, ou un par un (colonne Avis)"}. Sans eux, les mails partent sans l'avis joint.</div>
      ${d.sharepoint ? `<button class="btn petit principal" data-a="pdfs">${icone("actualiser")} Récupérer sur le réseau</button>` : ""}
      <button class="btn petit ${d.sharepoint ? "fantome" : "principal"}" data-a="pdfs-pc" title="Choisir un dossier du PC (export de ComptaZap, ou dossier où sont les avis)">Depuis le PC</button></div>`);
    $('[data-a="pdfs"]', x)?.addEventListener("click", () => recupererPdfsCfe());
    $('[data-a="pdfs-pc"]', x).onclick = () => fenetrePdfCfe();
    bandeaux.append(x);
  }
  const lignes = lignesCfe();
  const zone = $("#tableau-cfe"), defilement = $(".corps-tableau", zone)?.scrollTop || 0;
  if (!lignes.length) {
    if (!d.recu_le && !d.saisis) {  // premier lancement : les trois façons d'avoir les avis
      zone.innerHTML = `<div class="vide-tableau"><b>Aucun avis de CFE</b><span>Importez-les depuis ComptaZap (lus ici, dans le navigateur), depuis un fichier
        CSV / Excel, ou saisissez-les à la main.</span><div class="ligne-boutons"><button class="btn principal" data-a="v-cz">Importer depuis ComptaZap</button>
        <button class="btn" data-a="v-fichier">Importer un fichier</button><button class="btn" data-a="v-saisir">Saisir un avis</button></div></div>`;
      $('[data-a="v-cz"]', zone).onclick = () => importerComptaZap();
      $('[data-a="v-fichier"]', zone).onclick = () => fenetreImportFichier();
      $('[data-a="v-saisir"]', zone).onclick = () => fenetreSaisieAvis();
      majSelectionCfe();
      return;
    }
    const [t, x, bouton] = !d.lignes.length && !d.recu_le ? [`Aucun avis de CFE ${d.annee}`, "Aucun avis saisi ou importé pour cette année.", ["Saisir un avis", () => fenetreSaisieAvis()]]
      : !d.lignes.length ? [`Aucun avis de CFE ${d.annee}`, "ComptaZap n'a pas encore récupéré d'avis pour cette année : lancer une synchro dans ComptaZap.", null]
      : C.montant ? ["Aucun dossier", `Aucun avis dans la tranche « ${TRANCHES_CFE[C.montant]?.[0] || ""} ».`, ["Tous les montants", () => { C.montant = ""; try { localStorage.setItem("avis-cfe-montant", ""); } catch { /* */ } const s = $('[name="montant-cfe"]'); if (s) s.value = ""; remplirCfe(true); }]]
      : C.filtre === "envoyer" && !C.recherche ? ["Tout est envoyé", "", ["Tout voir", () => { C.filtre = "tous"; aller("cfe", false); }]]
      : ["Aucun dossier", "Aucun dossier ne correspond à la recherche.", null];
    zone.innerHTML = `<div class="vide-tableau"><b>${echap(t)}</b>${x ? `<span>${echap(x)}</span>` : ""}${bouton ? `<button class="btn">${echap(bouton[0])}</button>` : ""}</div>`;
    if (bouton) $("button", zone).onclick = bouton[1];
    majSelectionCfe();
    return;
  }
  zone.innerHTML = `<div class="corps-tableau"><table class="${C.masquerPrec ? "sans-prec" : ""} ${d.boite ? "" : "sans-echanges"}"><thead><tr>
      <th class="col-sel"></th><th>Société</th><th>Interlocuteur</th><th>E-mail</th>
      <th class="droite"><button class="tri-cfe" data-a="tri" title="Montant de l'avis de CFE ${d.annee} (reste à payer). Cliquer : trier par montant">CFE ${d.annee} ${C.tri === "desc" ? "↓" : C.tri === "asc" ? "↑" : "↕"}</button></th>
      <th class="col-prec droite" title="Avis de CFE ${prec} du même client">CFE ${prec}</th>
      <th class="col-prec droite" title="Écart entre ${d.annee} et ${prec}, en euros et en pourcentage">Var.</th>
      <th>À contester</th><th title="État du paiement sur impots.gouv, lu par ComptaZap">Paiement</th>
      <th>Avis</th><th>Mail</th><th class="centre" title="Mail envoyé au client : cochée toute seule quand le mail part d'ici ou qu'il est trouvé dans les Éléments envoyés.&#10;À cocher ou décocher à la main (par exemple si le mail trouvé n'était qu'un échange).">Envoyé</th><th class="col-echanges">Échanges</th>
    </tr></thead><tbody>${lignes.map(ligneCfe).join("")}</tbody></table></div>`;
  const corps = $(".corps-tableau", zone);
  corps.scrollTop = defilement;
  $('[data-a="tri"]', zone).onclick = () => { C.tri = C.tri === "" ? "desc" : C.tri === "desc" ? "asc" : ""; remplirCfe(); };
  if (doux && MOUVEMENT) corps.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 240, easing: "cubic-bezier(.33,1,.68,1)" });
  brancherCfe($("tbody", zone), lignes);
  majSelectionCfe();
}

function ligneCfe(l) {
  const c = l.contact, d = C.d, du = ["à payer", "prélèvement", "à vérifier"].includes(l.statut);
  const [texte, famille] = PASTILLES_CFE[l.statut] || [l.statut, "gris"];
  const avisDus = l.avis.filter((a) => a.statut === l.statut);
  let pastille = texte;
  if (l.statut === "à payer" && avisDus[0]?.date_limite) pastille += ` · ${dateFr(avisDus[0].date_limite)}`;
  if (l.statut === "prélèvement" && avisDus[0]?.date_prelevement) pastille = `Prélevé le ${dateFr(avisDus[0].date_prelevement)}`;
  const qui = `${c.prenom} ${c.nom}`.trim();
  const pdfs = l.avis.filter((a) => a.pdf && a.pdf_present), sansPdf = l.avis.filter((a) => a.pdf && !a.pdf_present);
  const contestation = l.contestation, manquants = avisManquants(l);
  const detailAvis = l.avis.map((a) => `${a.commune}, ${a.montant_texte} : ${a.detail}`).join("\n");
  return `<tr data-cle="${echap(l.cle)}" class="${l.envoye && aEnvoyer(l) ? "envoyee" : ""}">
    <td class="col-sel">${aEnvoyer(l) ? `<label class="case"><input type="checkbox" data-col="sel" ${C.coches.has(l.cle) ? "checked" : ""}></label>` : ""}</td>
    <td class="nom" title="${echap(`${l.nom_comptazap} (ComptaZap)\nSIREN ${l.siren}`)}">${echap(l.societe)}${l.annee !== d.annee ? ` <span class="pastille p-gris">CFE ${l.annee}</span>` : ""}${l.test ? ' <span class="pastille p-orange" title="Faux client à vos adresses, pour essayer l\'envoi et les échanges">test</span>' : ""}${l.saisi ? ' <span class="pastille p-gris" title="Avis saisi à la main ou importé d\'un fichier (menu ⋯ pour le supprimer)">saisi</span>' : ""}<small>${echap(l.siren)}</small></td>
    <td class="interlocuteur"><span data-choix="formule"></span><span data-choix="civilite"></span>
      <button class="lien-nom ${qui ? "" : "rouge"}" data-a="contact" title="Source : ${echap(c.source || "aucune")}&#10;Cliquer pour modifier">${echap(qui || "Interlocuteur inconnu")}</button></td>
    <td class="email ${c.email ? "" : "rouge"}" title="${c.email ? "Cliquer pour corriger l'e-mail" : "E-mail inconnu : cliquer pour le saisir"}${c.cc ? `&#10;Copie : ${echap(c.cc)}` : ""}">${c.email ? echap(c.email) : "à saisir"}</td>
    <td class="droite montant ${du ? "fort" : "doux"}" title="${echap(manquants.length ? alertesAvis(l)[0] + "." : detailAvis)}">${manquants.length ? '<span class="orange">⚠</span> ' : ""}${echap(du ? l.montant_texte : euros(l.total_avis))}</td>
    ${cellulesCfePrec(l)}
    <td class="contester"><label class="case" title="Avis à contester : un commentaire est demandé ; le mail (ou le brouillon) transmet l'avis en annonçant une demande de précisions aux impôts, au lieu du mail habituel">
      <input type="checkbox" data-a="contester" ${contestation ? "checked" : ""}></label>
      ${contestation ? `<button class="commentaire" data-a="commenter" title="${echap(`${contestation.commentaire || "(sans commentaire)"}\n\nNoté le ${dateFr(contestation.date)}${contestation.par ? ` par ${contestation.par}` : ""}.\nCliquer pour modifier`)}">${echap(contestation.commentaire || "(sans commentaire)")}</button>` : ""}</td>
    <td class="paiement"><span class="pastille p-${famille}" title="${echap(detailAvis
      + (l.statut === "à payer" ? "\nRéglé par le cabinet : le mail annonce le télérèglement." : ""))}">${echap(pastille)}</span>
</td>
    <td>${pdfs.length ? `<button class="btn petit" data-a="voir" title="${echap(pdfs.map((a) => a.pdf_nom || a.commune).join("\n"))}">Voir${pdfs.length > 1 ? ` ×${pdfs.length}` : ""}</button>` : ""}${sansPdf.length
      ? `<button class="btn petit fantome" data-a="ajouter-pdf" title="PDF de l'avis pas encore sur le site : le choisir sur le PC (${echap(sansPdf.map((a) => a.commune || a.reference).join(", "))})">${icone("plus")} PDF</button>` : ""}${!pdfs.length && !sansPdf.length ? '<span class="doux">-</span>' : ""}</td>
    <td class="col-mail">${aEnvoyer(l) ? `<button class="btn petit ${l.envoye ? "" : "principal"}" data-a="mail" title="Aperçu du mail type avec l'avis en pièce jointe, puis envoi (boîte Microsoft, ou .eml / messagerie du PC).${l.envoye ? `&#10;Un mail est déjà parti le ${dateEnvoyee(l)} : l'envoi reste possible.` : ""}">${l.envoye ? "Renvoyer" : d.boite ? "Envoyer" : "Préparer"}</button>` : ""}<button class="rond petit-rond" data-a="menu" title="Actions (ou clic droit sur la ligne)">${icone("points")}</button></td>
    <td class="centre">${aEnvoyer(l) ? caseEnvoyeCfe(l) : ""}</td>
    <td class="col-echanges">${celluleEchanges(l)}</td></tr>`;
}

/** Case « Envoyé » : cochée si le mail est parti d'ici, est dans les Éléments envoyés ou a été coché à la main (date à côté). */
function caseEnvoyeCfe(l) {
  const titre = l.envoi_outlook && l.envoye ? `Trouvé dans les Éléments envoyés (${dateFr(l.envoi_outlook, true)} ${heureFr(l.envoi_outlook)}).\nDécocher si ce n'était pas l'avis (un simple échange par exemple).`
    : l.envoye ? `Noté comme envoyé le ${dateEnvoyee(l)} (envoyé d'ici ou coché à la main).`
    : l.envoi_outlook ? `Un mail CFE est dans les Éléments envoyés (${dateFr(l.envoi_outlook, true)}), mais il n'est pas compté comme l'avis (décoché à la main). Cocher pour le compter.`
    : "Pas encore envoyé. Cocher si le mail est parti autrement.";
  return `<label class="case case-envoye" title="${echap(titre)}"><input type="checkbox" data-a="envoye" ${l.envoye ? "checked" : ""}>${l.envoye ? `<span class="doux">${dateEnvoyee(l).slice(0, 5)}</span>` : ""}</label>`;
}

/** Colonnes « CFE N-1 » (montant de l'avis de l'année précédente, bouton pour l'ouvrir) et « Var. » (écart, en euros puis en %). */
function cellulesCfePrec(l) {
  if (l.annee !== C.d.annee) return '<td class="col-prec"></td><td class="col-prec"></td>';
  const p = l.prec;
  if (!p) return `<td class="col-prec droite"><span class="doux" title="Aucun avis de CFE ${C.d.annee - 1} dans ComptaZap (société créée depuis, ou pas d'accès)">Pas d'avis</span></td><td class="col-prec"></td>`;
  const ecart = l.total_avis - p.total;
  const pdfs = p.avis.filter((a) => a.pdf);
  const pourcent = ecart && p.total ? `${ecart > 0 ? "+" : ""}${Math.round((ecart / p.total) * 100)} %` : "";  // sans objet si l'avis précédent était à 0 €
  return `<td class="col-prec droite"><span class="prec" title="${echap(`CFE ${p.annee} : ` + p.avis.map((a) => `${a.commune} ${a.montant} : ${a.detail}`).join(" ; "))}">
      <span class="doux">${euros(p.total)}</span>
      ${pdfs.length ? `<button class="btn petit" data-a="voir-prec" title="Ouvrir l'avis de CFE ${p.annee}">Voir${pdfs.length > 1 ? ` ×${pdfs.length}` : ""}</button>` : ""}</span></td>
    <td class="col-prec droite" title="Écart entre l'avis ${C.d.annee} (${euros(l.total_avis)}) et l'avis ${p.annee} (${euros(p.total)})${pourcent ? ` : ${pourcent}` : ""}">
      <span class="ecart ${ecart > 0 ? "hausse" : ecart < 0 ? "baisse" : ""}">${ecart ? `${ecart > 0 ? "+" : "-"}${euros(Math.abs(ecart))}` : "="}</span>${pourcent ? ` <span class="doux petit-texte">${pourcent}</span>` : ""}</td>`;
}

const lienAvis = (sha) => `/api/cfe/avis/${sha}`;
function ouvrirAvis(ancre, avis) {
  if (avis.length === 1) return window.open(lienAvis(avis[0].pdf), "_blank", "noopener");
  menu(ancre, avis.map((a) => [`${a.commune || "Avis"} · ${a.montant_texte || a.montant}`, () => window.open(lienAvis(a.pdf), "_blank", "noopener")]));
}

function brancherCfe(tbody, lignes) {
  const parCle = Object.fromEntries(lignes.map((l) => [l.cle, l]));
  for (const tr of $$("tr", tbody)) {
    const l = parCle[tr.dataset.cle], c = l.contact;
    $('[data-choix="formule"]', tr).replaceWith(choixMini(C.d.formules, c.formule, (v) => changerContactCfe(l, { formule: v }),
      { titre: "Vous / Tu dans le mail (modèles réglés dans Paramètres › CFE)" }));
    $('[data-choix="civilite"]', tr).replaceWith(choixMini(CIVILITES_CFE, c.civilite, (v) => changerContactCfe(l, { civilite: v }),
      { courts: { M: "M.", Mme: "Mme", "": "?" }, titre: "Civilité du mail : « Bonjour Monsieur / Madame Nom »" + (c.civilite ? "" : " (à choisir)") }));
    emailModifiable($("td.email", tr), c.email, (v) => changerContactCfe(l, { email: v }));
    tr.addEventListener("contextmenu", (ev) => { ev.preventDefault(); menuLigneCfe(null, l, { x: ev.clientX, y: ev.clientY }); });
  }
  tbody.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-a]");
    if (!b) return;
    const l = parCle[b.closest("tr").dataset.cle];
    const a = b.dataset.a;
    if (a === "contact") modifierInterlocuteurCfe(l);
    else if (a === "voir") ouvrirAvis(b, l.avis.filter((x) => x.pdf && x.pdf_present));
    else if (a === "ajouter-pdf") ajouterPdfAvis(b, l);
    else if (a === "voir-prec") ouvrirAvis(b, l.prec.avis.filter((x) => x.pdf));
    else if (a === "mail") fenetreMailCfe(l);
    else if (a === "echanges") fenetreEchanges(l);
    else if (a === "menu") menuLigneCfe(b, l);
    else if (a === "commenter") commenterCfe(l);
    else if (a === "contester") {
      if (!b.checked) return enregistrerContestation(l, null);
      const t = await demanderTexte({ titre: "À contester", sous: `${echap(l.societe)} (CFE ${l.annee})`, libelle: "Pourquoi contester cet avis ?",
        indication: "Ex. : activité exercée au domicile, local en sous-location, montant en forte hausse…" });
      if (t === null) { b.checked = false; return; }
      enregistrerContestation(l, t);
    } else if (a === "envoye") {
      // Cochée : envoyé aujourd'hui. Décochée alors qu'un mail CFE est dans les Éléments envoyés : ce n'était pas l'avis
      await api("POST", "/api/cfe/envoye", { annee: l.annee, siren: l.siren, etat: b.checked, trouve: !!l.envoi_outlook }).catch(signalerErreur);
      await chargerCfe().catch(() => {}); remplirCfe();
    }
  });
  selectionTableur(tbody, (cases, etat) => {
    for (const x of cases) { const cle = x.closest("tr").dataset.cle; etat ? C.coches.add(cle) : C.coches.delete(cle); }
    majSelectionCfe();
  });
}

function majSelectionCfe() {
  const visibles = new Set($$("#tableau-cfe tbody tr").map((tr) => tr.dataset.cle));
  for (const cle of [...C.coches]) if (!visibles.has(cle)) C.coches.delete(cle);
  const n = C.coches.size;
  const en = $('#page .pied-page [data-a="envoyer"]'), br = $('#page .pied-page [data-a="brouillons"]');
  if (!en) return;
  en.disabled = br.disabled = !n;
  const boite = !!C.d?.boite;  // sans boîte Microsoft : un .eml par mail coché, envoyé ensuite depuis la messagerie du PC
  en.innerHTML = boite ? `${icone("envoyer")} Envoyer les mails cochés${n ? ` (${n})` : ""}` : `${icone("telecharger")} Mails cochés en .eml${n ? ` (${n})` : ""}`;
  br.textContent = `Créer les brouillons${n ? ` (${n})` : ""}`;
  br.classList.toggle("cache", !boite);
}

/** Saisie à la main (prioritaire sur l'annuaire), gardée côté serveur ; la ligne est redessinée tout de suite. */
async function changerContactCfe(l, champs) {
  Object.assign(l.contact, champs, { source: "saisi à la main" });
  for (const x of C.d.lignes) if (x.siren === l.siren) Object.assign(x.contact, champs, { source: "saisi à la main" });
  remplirCfe();
  try { await api("POST", "/api/cfe/contact", { siren: l.siren, ...champs }); await chargerCfe(); remplirCfe(); }
  catch (e) { signalerErreur(e); await chargerCfe().catch(() => {}); remplirCfe(); }  // échec : la ligne reprend ce qui est enregistré
}

/** Saisie à la main de l'interlocuteur (prénom, nom, e-mail, copie, civilité, vous / tu). Résout la ligne mise à jour, ou null si
 *  la fenêtre est fermée sans enregistrer. motif : ce qui manque, rappelé en haut de la fenêtre. */
function modifierInterlocuteurCfe(l, motif = "") {
  const c = l.contact;
  return new Promise((fin) => {
    const f = fenetre({ titre: "Interlocuteur", sous: echap(l.societe), classe: "petite",
      corps: `${motif ? `<div class="alerte">${echap(motif)}</div>` : ""}
        <div class="grille2">${champ("prenom", "Prénom", saisie("prenom", c.prenom))}${champ("nom", "Nom", saisie("nom", c.nom))}</div>
        ${champ("email", "E-mail", saisie("email", c.email, 'type="email"'))}
        ${champ("cc", "Copie (Cc) pour ce client", saisie("cc", c.cc || "", 'placeholder="Facultatif : adresses séparées par une virgule"'))}
        <div class="grille2">${champ("civilite", "Civilité", liste("civilite", CIVILITES_CFE, c.civilite))}${champ("formule", "Vous / Tu", liste("formule", C.d.formules, c.formule))}</div>
        <small class="aide">Source actuelle : ${echap(c.source || "aucune")}</small>`,
      pied: `${c.source === "saisi à la main" ? '<button class="btn fantome gauche" data-a="annuaire">Reprendre celui de l\'annuaire</button>' : ""}
        <button class="btn" data-a="non">Annuler</button><button class="btn principal" data-a="ok">Enregistrer</button>` });
    let rendu = false;
    f.aLaFermeture = () => { if (!rendu) fin(null); };
    $('[data-a="non"]', f).onclick = () => f.fermer();
    $('[data-a="ok"]', f).onclick = async () => {
      const v = valeurs(f); rendu = true; f.fermer();
      await changerContactCfe(l, { prenom: v.prenom.trim(), nom: v.nom.trim(), email: v.email.trim(), cc: v.cc.trim(), civilite: v.civilite, formule: v.formule });
      fin(C.d.lignes.find((x) => x.cle === l.cle) || l);
    };
    $('[data-a="annuaire"]', f)?.addEventListener("click", () => { f.fermer(); reprendreAnnuaireCfe(l); });
  });
}

/** Ce qui manque pour écrire le mail : « e-mail », « prénom et nom », ou "". */
const manqueContact = (l) => (!l.contact.email ? "e-mail" : !(l.contact.prenom || l.contact.nom) ? "prénom et nom" : "");

/** Avant un envoi ou des brouillons : propose de saisir ce qui manque (e-mail, interlocuteur) ; résout les lignes à jour. */
async function completerContactsCfe(lignes) {
  const aFaire = lignes.filter(manqueContact);
  if (!aFaire.length) return lignes;
  if (!await confirmer({ titre: "Informations manquantes", oui: "Les saisir maintenant", non: "Continuer sans",
    texte: `${pluriel(aFaire.length, "client")} sans e-mail ou sans interlocuteur :<ul class="liste-raisons">${aFaire.map((l) => `<li>${echap(l.societe)} (${manqueContact(l)})</li>`).join("")}</ul>` })) return lignes;
  const out = [];
  for (const l of lignes) out.push(manqueContact(l) ? (await modifierInterlocuteurCfe(l, `Il manque : ${manqueContact(l)}.`)) || l : l);
  return out;
}

async function reprendreAnnuaireCfe(l) {
  try { await api("POST", "/api/cfe/contact", { siren: l.siren, annuaire: true }); await chargerCfe(); remplirCfe(); toast("Interlocuteur repris de l'annuaire."); }
  catch (e) { signalerErreur(e); }
}

async function enregistrerContestation(l, commentaire) {
  try {
    await api("POST", "/api/cfe/contestation", { annee: l.annee, siren: l.siren, commentaire });
    l.contestation = commentaire === null ? null : { date: l.contestation?.date || new Date().toISOString().slice(0, 10), commentaire, par: S.moi.nom };
    remplirCfe();
  } catch (e) { signalerErreur(e); await chargerCfe().catch(() => {}); remplirCfe(); }  // case « À contester » remise comme enregistrée
}
async function commenterCfe(l) {
  const t = await demanderTexte({ titre: "À contester", sous: `${echap(l.societe)} (CFE ${l.annee})`, libelle: "Pourquoi contester cet avis ?",
    valeur: l.contestation?.commentaire || "", indication: "Ex. : activité exercée au domicile, local en sous-location, montant en forte hausse…" });
  if (t !== null) enregistrerContestation(l, t);
}

function menuLigneCfe(ancre, l, position = null) {
  const items = [[l.societe, null]];
  if (aEnvoyer(l)) items.push(["Aperçu et envoi du mail…", () => fenetreMailCfe(l)]);
  items.push(["Modifier l'interlocuteur…", () => modifierInterlocuteurCfe(l)],
    ["Commentaire de contestation…", () => commenterCfe(l)],
    ["Reprendre l'interlocuteur de l'annuaire", () => reprendreAnnuaireCfe(l), { inactif: l.contact.source !== "saisi à la main" }]);
  const pdfs = l.avis.filter((a) => a.pdf && a.pdf_present);
  if (pdfs.length) items.push(["Télécharger le PDF de l'avis", () => pdfs.forEach((a) => window.open(`${lienAvis(a.pdf)}?telecharger=1`, "_blank", "noopener"))]);
  if (l.avis.some((a) => a.pdf && !a.pdf_present)) items.push(["Ajouter le PDF de l'avis…", () => ajouterPdfAvis(ancre, l)]);
  if (l.saisi) items.push(["Supprimer l'avis saisi…", () => supprimerAvisSaisi(l)]);
  if (filsClient(l).length) items.push(["Échanges avec le client…", () => fenetreEchanges(l)]);
  if (l.dossier_export) items.push("-", [`Copier le dossier ComptaZap : ${l.dossier_export}`, () => copierTexte(l.dossier_export, "Nom du dossier ComptaZap copié.")]);
  if (!l.test && C.d.sharepoint) items.push("-", ["Ouvrir le dossier OneDrive du client", () => ouvrirOneDriveCfe(l)], ["Choisir le dossier OneDrive du client…", () => choisirOneDriveCfe(l)]);
  menu(ancre, items, position);
}

/** Ce qui mérite un coup d'œil avant d'envoyer (jamais bloquant). */
function alertesCfe(l) {
  const c = l.contact, a = [];
  if (!c.civilite && c.formule !== "Tu") a.push("civilité non choisie (le mail commencera par « Bonjour Prénom Nom, »)");
  if (!(c.prenom || c.nom)) a.push("interlocuteur inconnu");
  return [...a, ...precedentsCfe(l), ...alertesAvis(l)];
}

/** Aperçu du mail tel qu'il partira (De, À, Cc, objet, texte, signature, avis joint), puis envoi depuis la boîte ; sans
 *  boîte Microsoft : .eml à ouvrir dans la messagerie du PC, lien mailto ou texte copié, et « Envoyé » coché à la main.
 *  Un mail déjà envoyé ou un échange en cours n'empêche pas l'envoi : l'aperçu le signale. */
async function fenetreMailCfe(l) {
  if (!l.contact.email) {  // saisie sur place : le mail peut alors être généré
    l = await modifierInterlocuteurCfe(l, "Pas d'e-mail : saisissez-le pour générer le mail.");
    if (!l || !l.contact.email) return;
  }
  const f = fenetre({ titre: `Mail · ${echap(l.societe)}`, sous: `CFE ${l.annee} · ${echap(l.montant_texte)}`, classe: "large",
    corps: '<div class="chargement">Préparation du mail…</div>' });
  let m;
  try { m = await api("POST", "/api/cfe/apercu", { cle: l.cle }); }
  catch (e) { $(".f-corps", f).innerHTML = `<div class="alerte">${echap(e.message)}</div>`; return; }
  const alertes = alertesCfe(l);
  $(".f-corps", f).innerHTML = `${alertes.length ? `<div class="alerte orange">${alertes.map((x) => `⚠ ${echap(x.charAt(0).toUpperCase() + x.slice(1))}.`).join("<br>")}${l.envoye || precedentsCfe(l).length ? "<br>Le mail partira quand même." : ""}</div>` : ""}
    <div class="aide">Modèle : ${echap(C.d.modeles[m.modele] || m.modele)}${m.haute ? " · importance haute" : ""} · <b>objet et texte modifiables ici avant l'envoi</b> (pour ce mail seulement)</div>
    ${await blocApercu({ ...m, de: C.d.boite })}`;
  const sans = !C.d.boite;  // sans boîte Microsoft : le mail part de la messagerie du PC
  const pied = el(`<div class="f-pied"><button class="btn gauche" data-a="contact">Modifier l'interlocuteur</button>
    ${sans ? `${C.d.microsoft ? '<button class="btn fantome" data-a="cx">Connecter Outlook</button>' : ""}
      <button class="btn" data-a="copier" title="Copie le texte du mail (à coller dans votre messagerie, avec l'avis en pièce jointe)">${icone("copier")} Copier</button>
      <button class="btn" data-a="mailto" title="Nouveau mail dans la messagerie du PC (sans la pièce jointe : ajoutez l'avis vous-même)">${icone("mail")} Ma messagerie</button>
      <button class="btn" data-a="eml" title="Le mail complet, avis joint, à ouvrir dans Outlook, Thunderbird ou Mail">${icone("telecharger")} Télécharger (.eml)</button>
      <button class="btn principal" data-a="fait">${icone("coche")} Marquer envoyé</button>`
      : `<button class="btn principal" data-a="envoyer">${icone("envoyer")} Envoyer</button>`}</div>`);
  f.append(pied);
  // Objet et texte modifiables directement dans la fenêtre ; la signature et l'avis joint restent ajoutés à l'envoi
  const mm = mailModifiable(f, m, pied);
  $('[data-a="contact"]', pied).onclick = () => { f.fermer(); modifierInterlocuteurCfe(l); };
  if (sans) return brancherSansOutlook(f, pied, l, m, mm);
  $('[data-a="envoyer"]', pied).onclick = async (ev) => {
    const b = ev.currentTarget;  // le bouton, pas son icône (et toujours là après l'attente)
    if (mm.vide()) return toast("Le texte du mail est vide.", { erreur: true });
    b.disabled = true;
    try {
      const r = await api("POST", "/api/cfe/envoyer", { cle: l.cle, ...mm.champs() });
      toast(`Mail envoyé à ${r.a}.${r.demo ? " (démo : envoi simulé, rien n'est parti)" : ""}`, { duree: r.demo ? 6000 : 3600 }); f.fermer(); C.coches.delete(l.cle);
      await chargerCfe(true); remplirCfe();
    } catch (e) { b.disabled = false; erreurAction(e); }
  };
}

function cochees() { return C.d.lignes.filter((l) => C.coches.has(l.cle)); }

/** Un brouillon par mail coché dans la boîte Outlook (texte, avis joint) : rien n'est envoyé ; lien pour ouvrir chacun. */
async function brouillonsCfe() {
  if (!C.d.boite) return emlGroupeCfe();
  const lignes = await completerContactsCfe(cochees());
  const exclus = lignes.filter((l) => !l.contact.email).map((l) => `${l.societe} : pas d'e-mail`);
  traitementGroupe({ titre: "Brouillons des avis de CFE", mode: "brouillon", cc: C.d.parametres.COPIE_CFE, exclus,
    elements: lignes.filter((l) => l.contact.email).map((l) => ({ cle: l.cle, libelle: l.societe,
      detail: [echap(l.contact.email), echap(l.montant_texte), ...[...precedentsCfe(l), ...alertesAvis(l)].map((x) => `<span class="orange">⚠ ${echap(x)}</span>`)].join(" · ") })),
    faire: (x) => api("POST", "/api/cfe/brouillon", { cle: x.cle }),
    apres: () => { C.coches.clear(); remplirCfe(); } });
}

/**
 * Envoi groupé : revue de TOUS les mails avant le départ. Frise des mails à gauche (un point par mail, état en direct
 * pendant l'envoi), aperçu complet à droite tel qu'il partira (De, À, Cc, objet, texte, signature, avis joint cliquable).
 * Un mail déjà envoyé ou un échange en cours ne retient pas un client coché : il est signalé (⚠).
 */
async function envoiGroupeCfe() {
  if (!C.d.boite) return emlGroupeCfe();
  const lignes = await completerContactsCfe(cochees());
  const exclus = lignes.filter((l) => !l.contact.email).map((l) => `${l.societe} : pas d'e-mail`);
  const bons = lignes.filter((l) => l.contact.email);  // à contester : part avec le mail de demande de précisions
  if (!bons.length) {
    fenetre({ titre: "Aucun mail à envoyer", classe: "petite", corps: `<ul class="liste-raisons">${exclus.map((x) => `<li>${echap(x)}</li>`).join("")}</ul>` });
    return;
  }
  const notes = (l) => [...precedentsCfe(l), ...alertesAvis(l)];
  const deja = bons.filter((l) => precedentsCfe(l).length).length;
  const apercus = {};  // cle -> aperçu du serveur (promesse)
  const apercu = (l) => (apercus[l.cle] ||= api("POST", "/api/cfe/apercu", { cle: l.cle }));
  const f = fenetre({ titre: "Revue avant envoi", sous: `${pluriel(bons.length, "mail va", "mails vont")} partir depuis ${echap(C.d.boite)}${C.d.importance ? " · importance haute" : ""}`, classe: "large revue",
    corps: `${deja ? `<div class="alerte orange">⚠ ${pluriel(deja, "client")} de la liste ${deja > 1 ? "ont" : "a"} déjà reçu un mail ou échangé sur la CFE : repérés par ⚠, ils recevront quand même celui-ci. Annulez pour décocher ceux qui ne doivent pas le recevoir.</div>` : ""}
      <div class="revue-envoi">
      <div class="frise-envoi">${bons.map((l, i) => `<button class="etape-frise" data-i="${i}"><span class="point-frise"></span>
          <span class="txt-frise"><b>${notes(l).length ? '<span class="orange">⚠</span> ' : ""}${echap(l.societe)}</b><small>${echap(l.contact.email)} · ${echap(l.montant_texte)}${l.statut === "prélèvement" ? " · prélèvement" : ""}${l.contact.formule === "Tu" ? " · tu" : ""}</small>
          ${!l.contact.civilite && l.contact.formule !== "Tu" ? '<small class="orange">civilité non choisie</small>' : ""}${notes(l).map((x) => `<small class="orange">${echap(x)}</small>`).join("")}<small class="resultat-frise"></small></span></button>`).join("")}
        ${exclus.length ? `<div class="exclus-frise"><b>Non retenus</b>${exclus.map((x) => `<small>${echap(x)}</small>`).join("")}</div>` : ""}</div>
      <div class="revue-droite"><div class="revue-nav"><button class="rond" data-a="prec" title="Mail précédent">${icone("retour")}</button>
          <span class="revue-compteur"></span><button class="rond" data-a="suiv" title="Mail suivant">${icone("chevron")}</button></div>
        <div class="revue-mail"></div></div></div>
      <div class="progression cache"><span></span></div>`,
    pied: `<span class="alerte rouge gauche">Envoyés directement, sans brouillon : on ne peut pas les rattraper.</span>
      <button class="btn" data-a="annuler">Annuler</button>
      <button class="btn principal" data-a="go">${icone("envoyer")} Envoyer les ${pluriel(bons.length, "mail")}</button>` });
  let courant = 0, numero = 0;
  const montrer = async (i) => {
    courant = Math.max(0, Math.min(bons.length - 1, i));
    const n = ++numero, l = bons[courant];
    $$(".etape-frise", f).forEach((b) => b.classList.toggle("choisi", +b.dataset.i === courant));
    $(`.etape-frise[data-i="${courant}"]`, f).scrollIntoView({ block: "nearest" });
    $(".revue-compteur", f).textContent = `Mail ${courant + 1} sur ${bons.length}`;
    const zone = $(".revue-mail", f);
    zone.innerHTML = '<div class="chargement">Préparation du mail…</div>';
    try {
      const m = await apercu(l);
      if (n !== numero) return;
      zone.innerHTML = `<div class="aide">Modèle : ${echap(C.d.modeles[m.modele] || m.modele)}</div>${await blocApercu({ ...m, de: C.d.boite })}`;
    } catch (e) { if (n === numero) zone.innerHTML = `<div class="alerte">${echap(e.message)}</div>`; }
  };
  $(".frise-envoi", f).onclick = (ev) => { const b = ev.target.closest(".etape-frise"); if (b) montrer(+b.dataset.i); };
  $('[data-a="prec"]', f).onclick = () => montrer(courant - 1);
  $('[data-a="suiv"]', f).onclick = () => montrer(courant + 1);
  const clavier = (ev) => {
    if (!f.isConnected) return removeEventListener("keydown", clavier);
    if (ev.target.closest("input, textarea, select, [contenteditable]")) return;  // dans un texte : touches du texte
    if (ev.key === "ArrowDown" || ev.key === "ArrowRight") { ev.preventDefault(); montrer(courant + 1); }
    if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") { ev.preventDefault(); montrer(courant - 1); }
  };
  addEventListener("keydown", clavier);
  montrer(0);
  bons.slice(1, 6).forEach(apercu);  // les suivants se préparent en avance
  const go = $('[data-a="go"]', f), annuler = $('[data-a="annuler"]', f);
  annuler.onclick = () => (f.enCours ? (f.arret = true, annuler.disabled = true, annuler.textContent = "Arrêt après ce mail…") : f.fermer());
  go.onclick = async () => {
    f.enCours = true; f.bloquee = true; go.disabled = true; annuler.textContent = "Arrêter";
    const barre = $(".progression", f); barre.classList.remove("cache");
    let faits = 0, rates = 0;
    for (const [i, l] of bons.entries()) {
      if (f.arret) break;
      const etape = $(`.etape-frise[data-i="${i}"]`, f);
      etape.classList.add("encours"); montrer(i);
      try {
        await api("POST", "/api/cfe/envoyer", { cle: l.cle });
        faits++; C.coches.delete(l.cle);
        etape.classList.replace("encours", "ok"); $(".resultat-frise", etape).textContent = `Envoyé à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
      } catch (e) {
        rates++; etape.classList.replace("encours", "rate"); $(".resultat-frise", etape).textContent = e.message;
        if (e.action || e.message === "401") { f.arret = true; if (e.action) { f.bloquee = false; fenetreErreurOutlook(e); } }
      }
      $("span", barre).style.width = `${Math.round(((i + 1) / bons.length) * 100)}%`;
    }
    f.enCours = false; f.bloquee = false; go.remove();
    annuler.textContent = "Fermer"; annuler.disabled = false; annuler.onclick = () => f.fermer();
    $(".f-pied .alerte", f).className = "gauche succes-ligne";
    $(".f-pied .gauche", f).textContent = `${pluriel(faits, "mail envoyé", "mails envoyés")}${rates ? ` · ${pluriel(rates, "échec")}` : ""}`;
    if (C.d.demo) toast("Mode démo : envois simulés, aucun mail n'est parti.", { duree: 6000 });
    await chargerCfe(true).catch(() => {}); remplirCfe(); setTimeout(() => chargerEchanges(true), 5000);
  };
}

// ---------- Paramètres › CFE : mail type (aperçu en direct sur un vrai dossier), copie, année, date d'ordre ----------
const CHAMPS_CFE = [["OBJET_CFE", "Objet"], ["CORPS_CFE_PRELEVEMENT", "Prélèvement automatique"], ["CORPS_CFE_VIREMENT", "À payer : télérèglement par le cabinet"],
  ["CORPS_CFE_RIEN", "Avis à 0 €"], ["CORPS_CFE_CONTESTATION", "Avis à contester"], ["CORPS_CFE_PRELEVEMENT_TU", "Prélèvement automatique"],
  ["CORPS_CFE_VIREMENT_TU", "À payer : télérèglement par le cabinet"], ["CORPS_CFE_RIEN_TU", "Avis à 0 €"], ["CORPS_CFE_CONTESTATION_TU", "Avis à contester"],
  ["DATE_ORDRE_CFE", "Date d'ordre"]];

async function parametresCfe(c) {
  c.innerHTML = '<div class="chargement">Lecture…</div>';
  let d;
  try { d = C.d || await chargerCfe(); } catch (e) {
    c.innerHTML = `<div class="parametres"><div class="alerte">${echap(e.message)}</div></div>`;
    return;
  }
  const p = d.parametres;
  const zone = (k, h = 190) => zoneTexte(k, p[k], `style="min-height:${h}px" placeholder="Vide : texte par défaut"`);
  c.innerHTML = `<div class="param-apercu">
    <div class="parametres">
      <div class="groupe"><div class="groupe-titre">MAIL TYPE · VOUVOIEMENT</div>
        ${champ("OBJET_CFE", "Objet", saisie("OBJET_CFE", p.OBJET_CFE))}
        ${champ("CORPS_CFE_PRELEVEMENT", "Prélèvement automatique", zone("CORPS_CFE_PRELEVEMENT", 160))}
        ${champ("CORPS_CFE_VIREMENT", "À payer : télérèglement par le cabinet", zone("CORPS_CFE_VIREMENT", 220))}
        ${champ("CORPS_CFE_RIEN", "Avis à 0 €", zone("CORPS_CFE_RIEN", 140))}
        ${champ("CORPS_CFE_CONTESTATION", "Avis à contester", zone("CORPS_CFE_CONTESTATION", 190))}
        ${champ("COPIE_CFE", "Copie (Cc)", saisie("COPIE_CFE", p.COPIE_CFE, 'placeholder="Vide : personne"'), "Plusieurs adresses : séparer par une virgule.")}</div>
      <div class="groupe"><div class="groupe-titre">MAIL TYPE · TUTOIEMENT (« TU » SUR LA LIGNE DU CLIENT)</div>
        ${champ("CORPS_CFE_PRELEVEMENT_TU", "Prélèvement automatique", zone("CORPS_CFE_PRELEVEMENT_TU", 160))}
        ${champ("CORPS_CFE_VIREMENT_TU", "À payer : télérèglement par le cabinet", zone("CORPS_CFE_VIREMENT_TU", 220))}
        ${champ("CORPS_CFE_RIEN_TU", "Avis à 0 €", zone("CORPS_CFE_RIEN_TU", 140))}
        ${champ("CORPS_CFE_CONTESTATION_TU", "Avis à contester", zone("CORPS_CFE_CONTESTATION_TU", 190))}</div>
      <div class="groupe"><div class="groupe-titre">AVIS</div>
        ${champ("ANNEE_CFE", "Année affichée à l'ouverture (le filtre en haut de l'écran permet d'en changer)", saisie("ANNEE_CFE", p.ANNEE_CFE, `inputmode="numeric" placeholder="${new Date().getFullYear()} (année en cours)" style="max-width:220px"`))}
        ${champ("DATE_ORDRE_CFE", "Dernier jour avant le télérèglement par le cabinet, à changer chaque année (variable {date_ordre})", saisie("DATE_ORDRE_CFE", p.DATE_ORDRE_CFE, 'style="max-width:280px"'))}</div>
      <small class="aide">Variables : {civilite} {nom} {prenom} {societe} {annee} {avis} (« l'avis » / « les avis ») {montant} {date_limite}
        {date_butoir} (2 semaines, au plus tard la date limite) {date_ordre} (dernier jour avant le télérèglement par le cabinet)
        {date_prelevement} (date exacte) {periode_prelevement} (« courant décembre »). Un texte vidé reprend le texte par défaut. La signature s'ajoute en dessous.</small>
      <div><button class="btn principal" data-a="enreg">Enregistrer</button></div>
    </div>
    <div class="groupe colle"><div class="groupe-titre">APERÇU</div>
      ${liste("modele", d.modeles, "CORPS_CFE_VIREMENT")}
      <div class="aide" id="exemple-cfe"></div>
      <div id="apercu-cfe" class="apercu-colle"></div>
      <button class="btn" data-a="test" ${d.boite ? "" : 'disabled title="Boîte Outlook non connectée"'}>${icone("envoyer")} Envoyer cet exemple à mon adresse (test)</button>
    </div></div>
    <div class="parametres"><div class="groupe" id="bloc-annuaire"></div></div>`;
  sectionAnnuaire($("#bloc-annuaire", c));
  const choixModele = $('[name="modele"]', c);
  const exemple = () => {
    const base = choixModele.value.replace("_TU", "");
    const statut = base === "CORPS_CFE_PRELEVEMENT" ? "prélèvement" : base === "CORPS_CFE_RIEN" ? "rien à payer" : "à payer";
    return d.lignes.find((l) => l.statut === statut && l.annee === d.annee) || d.lignes.find((l) => aEnvoyer(l) && l.annee === d.annee);
  };
  const enCours = () => Object.fromEntries(CHAMPS_CFE.map(([k]) => [k, $(`[name="${k}"]`, c).value]));
  let numero = 0;
  const majApercu = async () => {
    const l = exemple(), n = ++numero;
    $('[data-a="test"]', c).disabled = !l || !d.boite;
    if (!l) { $("#exemple-cfe", c).textContent = "Aucun avis de ce type pour servir d'exemple."; $("#apercu-cfe", c).innerHTML = ""; return; }
    $("#exemple-cfe", c).textContent = `Exemple : ${l.societe}, à ${l.contact.email || "e-mail inconnu"}`;
    try {
      const m = await api("POST", "/api/cfe/apercu", { cle: l.cle, parametres: enCours(), modele: choixModele.value });
      if (n === numero) $("#apercu-cfe", c).innerHTML = await blocApercu({ ...m, cc: $('[name="COPIE_CFE"]', c).value });
    } catch (e) { if (n === numero) $("#apercu-cfe", c).innerHTML = `<div class="alerte">${echap(e.message)}</div>`; }
  };
  const plusTard = apresFrappe(majApercu, 350);
  choixModele.onchange = majApercu;
  for (const [k] of CHAMPS_CFE) {
    const z = $(`[name="${k}"]`, c);
    // Modifier un texte affiche son aperçu
    const voir = () => { if (k.startsWith("CORPS") && choixModele.value !== k) { choixModele.value = k; majApercu(); } };
    if (k === "DATE_ORDRE_CFE") { z.addEventListener("input", plusTard); continue; }
    z.addEventListener("focus", voir);
    z.addEventListener("input", () => { voir(); plusTard(); });
  }
  $('[name="COPIE_CFE"]', c).addEventListener("input", plusTard);
  majApercu();
  $('[data-a="test"]', c).onclick = async (ev) => {
    const l = exemple(), b = ev.currentTarget;
    b.disabled = true;
    try {
      const r = await api("POST", "/api/cfe/envoyer", { cle: l.cle, test: true, parametres: enCours(), modele: choixModele.value });
      toast(`Mail de test envoyé à ${r.a} (objet « [TEST] … »).`, { duree: 6000 });
    } catch (e) { erreurAction(e); }
    b.disabled = false;
  };
  $('[data-a="enreg"]', c).onclick = async () => {
    const corps = { ...enCours(), COPIE_CFE: $('[name="COPIE_CFE"]', c).value, ANNEE_CFE: $('[name="ANNEE_CFE"]', c).value };
    try {
      d.parametres = await api("POST", "/api/cfe/parametres", corps);
      erreursChamps(c, {}); toast("Paramètres CFE enregistrés.");
      if (String(d.parametres.ANNEE_CFE || "") !== String(p.ANNEE_CFE || "")) { C.d = null; C.annee = null; }  // l'année réglée ici s'affiche tout de suite
      for (const [k] of CHAMPS_CFE) $(`[name="${k}"]`, c).value = d.parametres[k];
    } catch (e) { if (e.champs) erreursChamps(c, e.champs); else signalerErreur(e); }
  };
}

// ---------- Échanges : mails CFE envoyés et reçus avec le client, en fils ----------
async function chargerEchanges(frais = false) {
  const q = [C.d?.annee ? `annee=${C.d.annee}` : "", frais ? "frais=1" : ""].filter(Boolean).join("&");
  if (C.d && !C.d.boite) { C.echanges = null; return; }  // sans boîte Microsoft : pas d'échanges à lire (colonne masquée)
  try { C.echanges = await api("GET", "/api/cfe/echanges" + (q ? `?${q}` : "")); } catch { C.echanges = null; }
  remplirCfeAuFond();
}
/** Année de CFE d'un fil : celle citée dans l'objet d'un de ses mails (« Avis de CFE 2026 »), à défaut celle de son premier mail. */
function anneeDuFil(fil) {
  for (const motif of [/cfe\D{0,25}?(20\d{2})(?!\d)/i, /(?<!\d)(20\d{2})(?!\d)/]) {
    for (const m of fil.mails) { const x = motif.exec(m.objet || ""); if (x) return +x[1]; }
  }
  return new Date(fil.mails[0].le).getFullYear();
}
/** Fils échangés avec ce client au sujet de la CFE de l'année de la ligne. */
const filsClient = (l) => filsAvec(C.echanges?.mails, l.contact.email).filter((f) => anneeDuFil(f) === l.annee);
const celluleEchanges = (l) => boutonFils(filsClient(l), `sur la CFE ${l.annee}`);
function fenetreEchanges(l) {
  fenetreFils({ titre: `Échanges · ${echap(l.societe)} · CFE ${l.annee}`, sujet: `sur la CFE ${l.annee}`, fils: filsClient(l), moi: C.echanges?.moi,
    aLaFermeture: () => chargerEchanges(), apresEnvoi: () => setTimeout(() => chargerEchanges(true), 4000) });
}

// ---------- Rangement des avis dans OneDrive (dossiers clients › CLIENT › année › sous-dossier des avis) ----------
async function rangerOneDrive() {
  const f = fenetre({ titre: "Ranger dans OneDrive", sous: `Avis de CFE ${C.d.annee} → CLIENT › ${C.d.annee} › ${echap(C.d.sous_dossier)}`, classe: "moyenne",
    corps: '<div class="chargement">Recherche des dossiers clients dans OneDrive…</div>' });
  let r;
  const annee = C.d.annee;  // celle du filtre « Année », même si on en change pendant la copie
  try { r = await api("POST", "/api/cfe/onedrive/plan", { annee }); }
  catch (e) { f.fermer(); return erreurAction(e); }
  const copier = r.lignes.filter((x) => x.etat === "à copier"), deja = r.lignes.filter((x) => x.etat === "déjà rangé");
  const autres = r.lignes.filter((x) => !["à copier", "déjà rangé"].includes(x.etat));
  const aCreer = new Set(copier.filter((x) => x.a_creer).map((x) => x.client)).size;
  $(".f-corps", f).innerHTML = `<div><b>${pluriel(copier.length, "avis à copier", "avis à copier")}</b>${aCreer ? ` (${pluriel(aCreer, "dossier à créer", "dossiers à créer")})` : ""}
      · ${pluriel(deja.length, "déjà rangé", "déjà rangés")} · ${autres.length} à voir. Rien n'est remplacé ni supprimé.</div>
    ${autres.length ? `<details class="avance" open><summary>Non copiés : ${autres.length} (menu ⋯ de la ligne › Choisir le dossier OneDrive du client)</summary>
      <ul class="liste-raisons">${autres.map((x) => `<li>${echap(x.societe)} : ${echap(x.etat)}${x.nom ? ` (${echap(x.nom)})` : ""}</li>`).join("")}</ul></details>` : ""}
    ${copier.length ? `<div class="groupe-liste">${copier.map((x, i) => `<div class="ligne-envoi" data-i="${i}"><span class="etat-envoi"></span>
        <div><b>${echap(x.client)}</b><small>${C.d.annee} › ${echap(C.d.sous_dossier)} › ${echap(x.nom)}${x.a_creer ? " (dossier créé)" : ""}</small></div><span class="resultat-envoi"></span></div>`).join("")}</div>
      <div class="progression cache"><span></span></div>` : '<div class="succes-ligne">Tous les avis sont déjà rangés.</div>'}`;
  const pied = el(`<div class="f-pied"><button class="btn" data-a="non">Annuler</button>
    <button class="btn principal" data-a="ok" ${copier.length ? "" : "disabled"}>Copier ${pluriel(copier.length, "avis", "avis")}</button></div>`);
  f.append(pied);
  $('[data-a="non"]', pied).onclick = () => f.fermer();
  $('[data-a="ok"]', pied).onclick = async (ev) => {
    ev.target.remove(); f.bloquee = true;
    const barre = $(".progression", f); barre.classList.remove("cache");
    let faits = 0;
    for (const [i, x] of copier.entries()) {
      const ligne = $(`.ligne-envoi[data-i="${i}"]`, f);
      ligne.classList.add("encours"); ligne.scrollIntoView({ block: "nearest" });
      try { await api("POST", "/api/cfe/onedrive/copier", { cle: x.cle, annee }); faits++; ligne.classList.replace("encours", "ok"); $(".resultat-envoi", ligne).textContent = "Copié"; }
      catch (e) { ligne.classList.replace("encours", "rate"); $(".resultat-envoi", ligne).textContent = e.message; if (e.action) { f.bloquee = false; fenetreErreurOutlook(e); break; } }
      $("span", barre).style.width = `${Math.round(((i + 1) / copier.length) * 100)}%`;
    }
    f.bloquee = false;
    $(".f-tete .sous", f).textContent = `${pluriel(faits, "avis copié", "avis copiés")} dans OneDrive`;
    $('[data-a="non"]', pied).textContent = "Fermer";
  };
}

async function ouvrirOneDriveCfe(l) {
  try { await ouvrirDansOutlook(api("POST", "/api/cfe/onedrive/lien", { siren: l.siren, annee: l.annee })); }
  catch (e) { erreurAction(e); }
}

async function choisirOneDriveCfe(l) {
  const f = fenetre({ titre: "Dossier OneDrive du client", sous: echap(l.societe), classe: "petite",
    corps: `<label class="recherche">${icone("recherche")}<input class="saisie" placeholder="Rechercher…" value="${echap(l.societe.split(" ")[0])}"></label>
      <div class="liste-etape courte"><div class="chargement">Lecture des dossiers clients…</div></div>`,
    pied: '<button class="btn fantome gauche" data-a="auto">Automatique</button><button class="btn" data-a="non">Annuler</button><button class="btn principal" data-a="ok" disabled>Choisir</button>' });
  $('[data-a="non"]', f).onclick = () => f.fermer();
  let r;
  try { r = await api("GET", "/api/cfe/onedrive/clients"); } catch (e) { f.fermer(); return erreurAction(e); }
  let choisi = r.manuels[l.siren] || null;
  const zone = $(".liste-etape", f), champRecherche = $("input", f);
  const remplir = () => {
    const q = champRecherche.value.trim().toLowerCase();
    zone.innerHTML = r.clients.filter((n) => !q || n.toLowerCase().includes(q)).map((n) =>
      `<button class="item-etape ${n === choisi ? "choisi" : ""}" data-n="${echap(n)}"><span>${echap(n)}</span></button>`).join("") || '<div class="aide">Aucun dossier.</div>';
  };
  remplir();
  champRecherche.oninput = remplir;
  const enregistrer = async (client) => {
    try { await api("POST", "/api/cfe/onedrive/choisir", { siren: l.siren, client }); f.fermer(); toast(client ? `Dossier OneDrive : ${client}.` : "Dossier OneDrive retrouvé automatiquement."); }
    catch (e) { signalerErreur(e); }
  };
  zone.onclick = (ev) => {
    const b = ev.target.closest(".item-etape"); if (!b) return;
    choisi = b.dataset.n; $$(".item-etape", zone).forEach((x) => x.classList.toggle("choisi", x === b)); $('[data-a="ok"]', f).disabled = false;
  };
  zone.ondblclick = (ev) => { const b = ev.target.closest(".item-etape"); if (b) enregistrer(b.dataset.n); };
  $('[data-a="ok"]', f).onclick = () => enregistrer(choisi);
  $('[data-a="auto"]', f).onclick = () => enregistrer("");
}

// ---------- Sans Outlook : le mail part de la messagerie du PC (.eml avis joint, lien mailto ou texte copié) ----------

/** Fichier renvoyé par une requête POST (le .eml d'un mail) : enregistré par le navigateur sous le nom donné par le serveur. */
async function telechargerPost(url, corps) {
  const r = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Avis": "1" }, body: JSON.stringify(corps) });
  if (!r.ok) {
    const d = r.headers.get("content-type")?.includes("json") ? await r.json() : {};
    throw new Error(d.erreur || (d.champs ? Object.values(d.champs).join(" ") : "Téléchargement impossible."));
  }
  const nom = decodeURIComponent((r.headers.get("content-disposition") || "").match(/filename\*=UTF-8''([^;]+)/)?.[1] || "mail.eml");
  const lien = el("<a hidden></a>");
  lien.href = URL.createObjectURL(await r.blob()); lien.download = nom;
  document.body.append(lien); lien.click(); lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 4000);
}

/** Pied de la fenêtre d'un mail sans boîte Microsoft : copier, ouvrir dans la messagerie, télécharger le .eml, marquer envoyé. */
function brancherSansOutlook(f, pied, l, m, mm) {
  const fait = $('[data-a="fait"]', pied);
  const proposer = () => fait.classList.add("a-faire");  // une fois le mail préparé, « Marquer envoyé » est mis en avant
  $('[data-a="cx"]', pied)?.addEventListener("click", () => { f.fermer(); connecterOutlook(() => chargerCfe().then(remplirCfe)); });
  $('[data-a="copier"]', pied).onclick = () => { copierTexte(`${mm.objet()}\n\n${mm.texte()}`, "Objet et texte copiés : collez-les dans votre messagerie, avec l'avis en pièce jointe."); proposer(); };
  $('[data-a="mailto"]', pied).onclick = () => { ouvrirMessagerie({ a: m.a, cc: m.cc, objet: mm.objet(), texte: mm.texte() }); proposer(); };
  $('[data-a="eml"]', pied).onclick = async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    try { await telechargerPost("/api/cfe/eml", { cle: l.cle, ...mm.champs() }); toast("Mail téléchargé : ouvrez-le, vérifiez et envoyez-le depuis votre messagerie."); proposer(); }
    catch (e) { signalerErreur(e); }
    b.disabled = false;
  };
  fait.onclick = async () => {
    try { await api("POST", "/api/cfe/envoye", { annee: l.annee, siren: l.siren, etat: true }); }
    catch (e) { return signalerErreur(e); }
    toast(`${l.societe} : noté comme envoyé.`); f.fermer(); C.coches.delete(l.cle);
    await chargerCfe().catch(() => {}); remplirCfe();
  };
}

/** Mails cochés, sans boîte Microsoft : un .eml par mail (avis joint), à ouvrir et envoyer depuis la messagerie du PC. */
async function emlGroupeCfe() {
  const lignes = await completerContactsCfe(cochees());
  const exclus = lignes.filter((l) => !l.contact.email).map((l) => `${l.societe} : pas d'e-mail`);
  traitementGroupe({ titre: "Mails des avis de CFE (.eml)", mode: "brouillon", cc: C.d.parametres.COPIE_CFE, exclus,
    elements: lignes.filter((l) => l.contact.email).map((l) => ({ cle: l.cle, libelle: l.societe, ligne: l,
      detail: [echap(l.contact.email), echap(l.montant_texte), ...[...precedentsCfe(l), ...alertesAvis(l)].map((x) => `<span class="orange">⚠ ${echap(x)}</span>`)].join(" · ") })),
    faire: async (x) => { await telechargerPost("/api/cfe/eml", { cle: x.cle }); return { prepare: true }; },
    apres: () => toast("Mails téléchargés : envoyez-les depuis votre messagerie, puis cochez « Envoyé » sur chaque ligne.", { duree: 8000 }) });
}

// ---------- Avis sans ComptaZap : PDF ajouté à la main, avis saisi, fichier CSV / Excel ----------

/** PDF d'un avis choisi sur le PC (avis saisi, ou PDF que ComptaZap n'a pas encore téléchargé). Plusieurs avis : menu. */
function ajouterPdfAvis(ancre, l) {
  const sans = l.avis.filter((a) => a.pdf && !a.pdf_present);
  const choisir = (a) => {
    const i = el('<input type="file" accept="application/pdf,.pdf" hidden>');
    i.onchange = async () => {
      const fi = i.files[0]; i.remove();
      if (!fi) return;
      try { await api("POST", "/api/cfe/pdf", { cle: a.pdf, contenu: await enBase64(fi) }); toast(`PDF de l'avis ajouté (${l.societe}).`); }
      catch (e) { return signalerErreur(e); }
      await chargerCfe().catch(() => {}); remplirCfe();
    };
    document.body.append(i); i.click();
  };
  if (sans.length === 1) return choisir(sans[0]);
  menu(ancre, sans.map((a) => [`${a.commune || "Avis"} · ${a.montant_texte}`, () => choisir(a)]));
}

async function supprimerAvisSaisi(l) {
  const saisis = l.avis.filter((a) => a.saisi);
  if (!await confirmer({ titre: "Supprimer l'avis saisi ?", texte: `${echap(l.societe)} · CFE ${l.annee} (${pluriel(saisis.length, "avis", "avis")}). Les avis venant de ComptaZap ne sont pas touchés.`,
    oui: "Supprimer", danger: true })) return;
  try { for (const a of saisis) await api("POST", "/api/cfe/avis/supprimer", { annee: l.annee, siren: l.siren, reference: a.reference }); toast("Avis supprimé."); }
  catch (e) { signalerErreur(e); }
  await chargerCfe().catch(() => {}); remplirCfe();
}

const PAIEMENTS_SAISIE = { "en ligne": "Paiement en ligne (le cabinet télérègle)", "prélèvement": "Prélèvement à l'échéance", "prélèvement mensuel": "Prélèvement mensuel" };
const ETATS_SAISIE = { "à payer": "À payer", "payé": "Déjà payé" };

/** Saisie d'un avis à la main (sans ComptaZap), PDF de l'avis en option. */
function fenetreSaisieAvis() {
  const annee = C.d?.annee || new Date().getFullYear();
  const f = fenetre({ titre: "Saisir un avis de CFE", sous: "Pour un client absent de ComptaZap, ou sans ComptaZap", classe: "moyenne",
    corps: `<div class="grille2">${champ("societe", "Société", saisie("societe", "", 'placeholder="Raison sociale"'))}${champ("siren", "SIREN", saisie("siren", "", 'inputmode="numeric" placeholder="9 chiffres"'))}</div>
      <div class="grille2">${champ("annee", "Année de l'avis", saisie("annee", annee, 'inputmode="numeric"'))}${champ("commune", "Commune", saisie("commune", "", 'placeholder="Facultatif"'))}</div>
      <div class="grille2">${champ("montant", "Montant de l'avis (€)", saisie("montant", "", 'inputmode="decimal" placeholder="0 si rien à payer"'))}${champ("date_limite", "Date limite de paiement", saisie("date_limite", `15/12/${annee}`))}</div>
      <div class="grille2">${champ("paiement", "Paiement", liste("paiement", PAIEMENTS_SAISIE, "en ligne"))}${champ("date_prelevement", "Date de prélèvement", saisie("date_prelevement", "", 'placeholder="Facultatif : jj/mm/aaaa"'))}</div>
      <div class="grille2">${champ("statut", "État", liste("statut", ETATS_SAISIE, "à payer"))}${champ("reste", "Reste à payer (€)", saisie("reste", "", 'inputmode="decimal" placeholder="Facultatif : si acompte déjà payé"'))}</div>
      <div class="grille2">${champ("reference", "Référence de l'avis", saisie("reference", "", 'placeholder="Facultatif"'))}
        ${champ("pdf", "PDF de l'avis", '<input type="file" name="pdf" accept="application/pdf,.pdf" class="saisie">', "Facultatif : joint au mail.")}</div>`,
    pied: '<button class="btn" data-a="non">Annuler</button><button class="btn principal" data-a="ok">Enregistrer</button>' });
  $('[data-a="non"]', f).onclick = () => f.fermer();
  $('[data-a="ok"]', f).onclick = async (ev) => {
    const b = ev.currentTarget, v = valeurs(f), fichier = $('[name="pdf"]', f).files[0];
    delete v.pdf;
    b.disabled = true;
    try {
      const r = await api("POST", "/api/cfe/avis", v);
      if (fichier) await api("POST", "/api/cfe/pdf", { cle: r.pdf, contenu: await enBase64(fichier) });
      toast(`Avis de ${v.societe} enregistré.`); f.fermer();
      C.annee = +v.annee || C.annee;
      await chargerCfe().catch(() => {}); remplirCfe();
    } catch (e) { b.disabled = false; if (e.champs) erreursChamps(f, e.champs); else signalerErreur(e); }
  };
}

/** Avis listés dans un fichier CSV ou Excel (exemple : exemples/avis-cfe-exemple.csv). */
function fenetreImportFichier() {
  const f = fenetre({ titre: "Importer des avis depuis un fichier", sous: "CSV ou Excel (.xlsx), une ligne par avis, en-têtes en première ligne", classe: "moyenne",
    corps: `<div class="aide">Colonnes reconnues (accents et majuscules sans importance) : <b>société</b>, <b>SIREN</b>, <b>montant</b> (obligatoires),
        année, commune, référence, date limite, paiement (« en ligne », « prélèvement », « prélèvement mensuel »), date de prélèvement,
        statut (« à payer », « payé »), reste à payer. Un avis déjà importé (même année, SIREN et référence) est remplacé.</div>
      <div class="ligne-boutons"><label class="btn principal">${icone("telecharger")} Choisir le fichier<input type="file" name="fichier" accept=".csv,.txt,.xlsx" class="cache"></label>
        <a class="btn" href="/api/exemples/avis-cfe-exemple.csv">Fichier d'exemple</a></div>
      <div class="aide etat-import"></div>` });
  $('[name="fichier"]', f).onchange = async (ev) => {
    const fi = ev.target.files[0]; ev.target.value = "";
    if (!fi) return;
    $(".etat-import", f).textContent = `Lecture de ${fi.name}…`;
    try {
      const r = await api("POST", "/api/cfe/avis/fichier", { contenu: await enBase64(fi) });
      $(".etat-import", f).innerHTML = `<b>${pluriel(r.avis, "avis importé", "avis importés")}</b>${r.erreurs.length
        ? `<ul class="liste-raisons">${r.erreurs.map((x) => `<li>${echap(x)}</li>`).join("")}</ul>` : ""}${r.pdfs_manquants.length
        ? `<div>Les PDF des avis s'ajoutent ensuite sur chaque ligne (colonne Avis), ou en une fois depuis un dossier du PC.</div>` : ""}`;
      await chargerCfe().catch(() => {}); remplirCfe(true);
    } catch (e) { $(".etat-import", f).textContent = ""; if (e.champs) toast(Object.values(e.champs)[0], { erreur: true, duree: 8000 }); else signalerErreur(e); }
  };
}

// ---------- Paramètres › CFE : annuaire des interlocuteurs (Pennylane ou fichier) ----------
async function sectionAnnuaire(bloc) {
  let a;
  try { a = await api("GET", "/api/cfe/annuaire"); } catch (e) { bloc.innerHTML = `<div class="alerte">${echap(e.message)}</div>`; return; }
  const pl = a.pennylane;
  bloc.innerHTML = `<div class="groupe-titre">INTERLOCUTEURS DES CLIENTS</div>
    <div class="aide">${a.contacts ? `<b>${pluriel(a.contacts, "contact")}</b> dans l'annuaire (${echap(a.source)}, ${quandFr(a.maj)}${a.par ? ` par ${echap(a.par)}` : ""}).`
      : "Annuaire vide : les interlocuteurs se saisissent sur chaque ligne, ou viennent de Pennylane ou d'un fichier."}
      Rapprochés des avis par le nom de la société ; une saisie sur la ligne passe toujours avant. Chaque import remplace l'annuaire.</div>
    <div class="champ"><label>Depuis un fichier (CSV ou Excel)</label>
      <small class="aide">Colonnes : société, prénom, nom, e-mail, copie (Cc), civilité (M / Mme), formule (vous / tu).</small>
      <div class="ligne-boutons"><label class="btn">Importer le fichier<input type="file" name="annuaire" accept=".csv,.txt,.xlsx" class="cache"></label>
        <a class="btn fantome" href="/api/exemples/interlocuteurs-exemple.csv">Fichier d'exemple</a></div></div>
    <div class="champ"><label>Depuis Pennylane (interlocuteur principal de chaque dossier)</label>
      ${pl.connecte ? `<div class="aide">Connecté${pl.compte ? ` : ${echap(pl.compte)}` : ""}${pl.par ? `, par ${echap(pl.par)}` : ""}.</div>` : `<div class="aide">${pl.perdu ? "Accès perdu : reconnectez Pennylane. " : ""}Une seule connexion pour tout le cabinet.</div>`}
      ${pl.cabinet ? "" : '<div class="alerte">Identifiant du cabinet dans Pennylane à renseigner (config.json › « cabinet_pennylane ») pour lire ses dossiers.</div>'}
      <div class="ligne-boutons">${pl.connecte ? `<button class="btn principal" data-a="pl-synchro" ${pl.cabinet ? "" : "disabled"}>${icone("actualiser")} Reprendre les interlocuteurs</button>
        <button class="btn fantome danger" data-a="pl-deco">Déconnecter Pennylane</button>` : '<a class="btn" href="/api/pennylane/connecter">Connecter Pennylane</a>'}</div></div>`;
  $('[name="annuaire"]', bloc).onchange = async (ev) => {
    const fi = ev.target.files[0]; ev.target.value = "";
    if (!fi) return;
    try {
      const r = await api("POST", "/api/cfe/annuaire/fichier", { contenu: await enBase64(fi) });
      toast(`${pluriel(r.contacts, "contact importé", "contacts importés")}${r.ignores ? ` · ${r.ignores} ligne(s) sans société ou sans e-mail ignorée(s)` : ""}.`, { duree: 6000 });
      C.d = null; sectionAnnuaire(bloc);
    } catch (e) { if (e.champs) toast(Object.values(e.champs)[0], { erreur: true, duree: 8000 }); else signalerErreur(e); }
  };
  $('[data-a="pl-synchro"]', bloc)?.addEventListener("click", async () => { await synchroAnnuaire(); sectionAnnuaire(bloc); });
  $('[data-a="pl-deco"]', bloc)?.addEventListener("click", async () => {
    if (!await confirmer({ titre: "Déconnecter Pennylane ?", texte: "L'annuaire déjà repris reste en place.", oui: "Déconnecter", danger: true })) return;
    try { await api("POST", "/api/pennylane/deconnecter"); toast("Pennylane déconnecté."); sectionAnnuaire(bloc); } catch (e) { signalerErreur(e); }
  });
}

/** Reprise des interlocuteurs depuis Pennylane, par petits lots (jamais de requête trop longue pour l'hébergement). */
async function synchroAnnuaire() {
  try {
    const d = await api("POST", "/api/cfe/annuaire/synchro/debut");
    let r = { fini: false };
    while (!r.fini) {
      r = await api("POST", "/api/cfe/annuaire/synchro/lot", { id: d.id });
      if (!r.fini) toast(`Pennylane : ${r.fait} / ${r.total} dossiers lus…`, { duree: 2500 });
    }
    toast(`Annuaire repris de Pennylane : ${pluriel(r.contacts, "contact")}${r.non_lus?.length ? ` · ${r.non_lus.length} dossier(s) non lu(s)` : ""}.`, { duree: 6000 });
    C.d = null;
  } catch (e) { if (e.connecter) toast(e.message, { erreur: true, duree: 8000 }); else signalerErreur(e); }
}
