/* Avis de CFE · import depuis ComptaZap : le navigateur lit la base fiscale de ComptaZap sur le PC (sql.js, rien d'installé) et
   le site ne reçoit que l'utile (avis, paiements, dettes de CFE). Facultatif : sans ComptaZap, les avis viennent d'un fichier
   CSV / Excel ou sont saisis à la main (cfe.js). */
"use strict";

const DOSSIER_COMPTAZAP = "%APPDATA%\\comptazap\\data";
let SQLJS = null;
function chargerSqlJs() {
  SQLJS ??= new Promise((ok, ko) => {
    const sc = document.createElement("script");
    sc.src = "/vendor/sqljs/sql-wasm.js";
    sc.onload = () => window.initSqlJs({ locateFile: (f) => "/vendor/sqljs/" + f }).then(ok, ko);
    sc.onerror = () => ko(new Error("Lecteur de bases introuvable sur le site."));
    document.head.append(sc);
  });
  return SQLJS;
}

/** Base SQLite + son journal (-wal : modifications récentes de ComptaZap pas encore recopiées) -> base complète. */
function appliquerWal(base, wal) {
  if (!wal || wal.length < 32) return base;
  const v = new DataView(wal.buffer, wal.byteOffset, wal.byteLength);
  const magie = v.getUint32(0);
  if (magie !== 0x377f0682 && magie !== 0x377f0683) return base;
  const taille = v.getUint32(8), sel1 = v.getUint32(16), sel2 = v.getUint32(20);
  const pages = new Map();
  let attente = new Map(), total = Math.ceil(base.length / taille);
  for (let o = 32; o + 24 + taille <= wal.length; o += 24 + taille) {
    if (v.getUint32(o + 8) !== sel1 || v.getUint32(o + 12) !== sel2) break;  // fin du cycle courant du journal
    attente.set(v.getUint32(o), wal.subarray(o + 24, o + 24 + taille));
    const apres = v.getUint32(o + 4);
    if (apres) { for (const [n, pg] of attente) pages.set(n, pg); attente = new Map(); total = apres; }  // transaction validée
  }
  const sortie = new Uint8Array(total * taille);
  sortie.set(base.subarray(0, Math.min(base.length, sortie.length)));
  for (const [n, pg] of pages) if (n <= total) sortie.set(pg, (n - 1) * taille);
  sortie[18] = 1; sortie[19] = 1;  // la copie se lit seule (plus en mode journal)
  new DataView(sortie.buffer).setUint32(28, total);
  return sortie;
}

/** Fichiers choisis (fiscal.db et son -wal) -> avis, paiements et dettes de CFE des 5 dernières années. Le PDF de chaque avis
 *  est repéré par son chemin dans le dossier d'export de ComptaZap. */
async function lireComptaZap(fichiers) {
  const utiles = ["fiscal.db", "fiscal.db-wal"], par = {};
  for (const f of fichiers) {
    const n = f.name.toLowerCase(), chemin = (f.webkitRelativePath || f.name).toLowerCase().replace(/\\/g, "/");
    if (!utiles.includes(n)) continue;
    // Dossier choisi en entier : la base du sous-dossier « data » l'emporte sur une copie rangée ailleurs
    if (!par[n] || chemin.endsWith("data/" + n)) par[n] = f;
  }
  if (!par["fiscal.db"]) throw new Error(`« fiscal.db » introuvable : choisissez le dossier ${DOSSIER_COMPTAZAP} (ou ce fichier).`);
  const SQL = await chargerSqlJs();
  const octets = async (n) => (par[n] ? new Uint8Array(await par[n].arrayBuffer()) : null);
  const fiscal = new SQL.Database(appliquerWal(await octets("fiscal.db"), await octets("fiscal.db-wal")));
  const lignes = (sql) => {
    try { const r = fiscal.exec(sql)[0]; return r ? r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]]))) : []; }
    catch { return []; }  // table absente dans cette version de ComptaZap
  };
  if (!lignes("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cfe_documents'").length) {
    fiscal.close();
    throw new Error("Aucun avis de CFE dans cette base ComptaZap (table cfe_documents absente).");
  }
  const depuis = new Date().getFullYear() - 5;
  const d = {
    documents: lignes("SELECT siren, client_name, annee_imposition, commune, reference_avis, montant_du, date_limite_paiement, mode_paiement, "
      + `date_prelevement, pdf_path, pdf_downloaded_at FROM cfe_documents WHERE annee_imposition >= ${depuis}`),
    paiements: lignes(`SELECT annee, reference, payment_state, payment_method, paiement_date, synced_at FROM cfe_paiements WHERE annee >= ${depuis}`),
    dettes: lignes(`SELECT annee, impot, reference_dette, status, solde FROM df_debts WHERE impot = 'CFE' AND annee >= ${depuis}`),
    maj_comptazap: (lignes("SELECT MAX(synced_at) AS m FROM cfe_paiements")[0] || {}).m || "",
  };
  fiscal.close();
  return d;
}

// Import : Chrome interdit de mémoriser un dossier d'AppData (« fichiers système ») ; on passe donc par le sélecteur classique,
// ouvert directement par « Importer » après le premier import (Windows rouvre le dernier dossier choisi).
const CLE_CZ_DEJA = "avis-cfe-cz-deja-importe";
const czDejaImporte = () => { try { return localStorage.getItem(CLE_CZ_DEJA) === "1"; } catch { return false; } };
const noterCzImporte = () => { try { localStorage.setItem(CLE_CZ_DEJA, "1"); } catch { /* navigation privée */ } };

async function envoyerCz(fichiers, etat = () => {}) {
  etat("Lecture de la base de ComptaZap…");
  const cfe = await lireComptaZap(fichiers);
  etat(`Envoi : ${pluriel(cfe.documents.length, "avis", "avis")} de CFE…`);
  const c = await api("POST", "/api/cfe/import", cfe);
  noterCzImporte();
  const pdfs = c.pdfs_manquants?.length || 0;
  const reseau = pdfs && C.d?.sharepoint;
  toast(`ComptaZap importé : ${pluriel(c.avis, "avis", "avis")} de CFE.`
    + (reseau ? ` Récupération de ${pluriel(pdfs, "PDF", "PDF")} d'avis sur le réseau…` : pdfs ? ` ${pluriel(pdfs, "PDF", "PDF")} d'avis à ajouter.` : ""),
    { duree: pdfs ? 7000 : 4500 });
  if (S.page === "cfe") { await chargerCfe(); remplirCfe(true); }
  if (reseau) recupererPdfsCfe(c.pdfs_manquants);  // PDF des avis pris dans la sauvegarde ComptaZap du SharePoint, tout seuls
}

/** Bouton « Importer » : après le premier import, ouvre tout de suite le choix du dossier (sinon la fenêtre d'explications). */
function importerComptaZap() {
  if (!czDejaImporte()) return fenetreImportCz();
  let champ = $("#cz-direct");
  if (!champ) {
    champ = el('<input type="file" webkitdirectory class="cache" id="cz-direct">');
    document.body.append(champ);
    champ.onchange = () => {
      const fichiers = [...champ.files]; champ.value = "";
      if (fichiers.length) importerAvecSuivi(fichiers);
    };
  }
  champ.click();  // tout de suite, sans attente : sinon le navigateur bloque l'ouverture
}

/** Import des fichiers choisis ; plus de 10 secondes : la fenêtre d'import s'ouvre pour montrer où on en est. */
async function importerAvecSuivi(fichiers) {
  const b = $('[data-a="importer"]'); if (b) b.disabled = true;
  let fen = null, texte = "Lecture de la base de ComptaZap…";
  const montrer = (t) => { texte = t; const z = fen && $(".etat-import", fen); if (z) z.textContent = t; };
  const minuteur = setTimeout(() => { fen = fenetreImportCz(); montrer(texte); }, 10000);
  try { await envoyerCz(fichiers, montrer); fen?.fermer(); } catch (e) { montrer(""); signalerErreur(e); }
  clearTimeout(minuteur);
  if (b) b.disabled = false;
}

function fenetreImportCz() {
  const f = fenetre({ titre: "Importer depuis ComptaZap", sous: "La base de ComptaZap est lue ici, dans le navigateur : rien n'est installé", classe: "moyenne",
    corps: `<ol class="etapes-action">
        <li>« Choisir le dossier », puis dans la fenêtre Windows, collez dans la barre d'adresse : <code>${DOSSIER_COMPTAZAP}</code> et Entrée.</li>
        <li>Cliquez « Sélectionner un dossier » (et « Importer » si le navigateur le demande) : l'outil trouve tout seul la base utile.</li>
        <li>Les fois suivantes, « Importer depuis ComptaZap » ouvre directement ce choix, en principe déjà dans le bon dossier : « Sélectionner un dossier » suffit.</li></ol>
      <div class="ligne-boutons"><button class="btn principal" data-a="dossier">${icone("dossier")} Choisir le dossier</button>
        <button class="btn" data-a="copier">${icone("copier")} Copier l'adresse du dossier</button></div>
      <details class="avance"><summary>Si le navigateur refuse le dossier</summary>
        <div class="aide">Choisir les fichiers à la place : <b>fiscal.db</b> et <b>fiscal.db-wal</b> (Ctrl + clic), puis « Ouvrir ».</div>
        <div class="ligne-boutons"><button class="btn" data-a="choisir">Choisir les fichiers</button></div></details>
      <div class="aide">Pas de ComptaZap ? « Importer un fichier » (CSV ou Excel) ou « Saisir un avis », dans la barre de l'écran.</div>
      <div class="aide etat-import"></div>
      <input type="file" webkitdirectory class="cache" name="dossier-bases">
      <input type="file" multiple class="cache" name="bases">` });
  const etat = $(".etat-import", f), bouton = $('[data-a="dossier"]', f);
  $('[data-a="copier"]', f).onclick = () => copierTexte(DOSSIER_COMPTAZAP, "Adresse copiée : collez-la dans la fenêtre du navigateur.");
  bouton.onclick = () => $('[name="dossier-bases"]', f).click();
  $('[data-a="choisir"]', f).onclick = () => $('[name="bases"]', f).click();
  for (const nom of ["dossier-bases", "bases"]) {
    const champ = $(`[name="${nom}"]`, f);
    champ.onchange = async () => {
      if (!champ.files.length) return;
      bouton.disabled = true;
      try { await envoyerCz([...champ.files], (t) => { etat.textContent = t; }); f.fermer(); }
      catch (e) { etat.textContent = ""; signalerErreur(e); }
      bouton.disabled = false; champ.value = "";
    };
  }
  return f;
}
