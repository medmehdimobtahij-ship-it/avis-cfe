<?php
/**
 * Avis de CFE à envoyer aux clients : données de ComptaZap lues par le navigateur (bouton « Importer depuis ComptaZap » ; PDF
 * des avis pris dans la sauvegarde ComptaZap du SharePoint, ou dans le dossier d'export du PC), avec l'interlocuteur du client
 * et le mail du cabinet.
 *
 * ComptaZap range, pour chaque client, les avis de CFE (cfe_documents), l'état de leur paiement (cfe_paiements :
 * A_PAYER / PAYE) et les dettes encore ouvertes du compte fiscal (df_debts). Un avis, sa ligne de paiement et sa dette se
 * retrouvent par le numéro de référence de l'avis. montant_du = « MONTANT A PAYER » du PDF.
 *
 * data/cfe/comptazap-<identifiant>.json : dernières données importées par chacun (son portefeuille, son ComptaZap) ;
 * data/cfe/avis/<sha256>.pdf : les PDF des avis (communs) ; communs au cabinet aussi, car rangés par SIREN :
 * contacts-cfe.json (saisies à la main), envois-cfe.json (case « Envoyé » : date, ou « non » si décochée à la main alors qu'un
 * mail est dans les Éléments envoyés), contestations-cfe.json, annuaire.json (cfe_annuaire.php), parametres.json.
 */
declare(strict_types=1);

const CFE_A_PAYER = 'à payer', CFE_PRELEVEMENT = 'prélèvement', CFE_PAYE = 'payé', CFE_RIEN = 'rien à payer', CFE_A_VERIFIER = 'à vérifier';
const CFE_A_ENVOYER = [CFE_A_PAYER, CFE_PRELEVEMENT, CFE_RIEN];  // reçoivent un mail (avis à 0 € compris : le client est informé)
const CFE_DUS = [CFE_A_PAYER, CFE_PRELEVEMENT];  // restent à régler
const CFE_PRELEVEMENTS = ['PRELEVEMENT_ECHEANCE', 'PRELEVEMENT_MENSUEL'];
const CFE_FORMES = '/^(SAS|SASU|SARL|SARLU|SLRL|SELARL|SELARLU|SELAS|SELASU|EURL|SCI|SNC|SA|INDI|EI|M|MME|MLLE)\s+/i';
const CFE_DELAI_BUTOIR = 14;  // jours laissés au client pour payer avant que le cabinet ne prélève le compte de la société
const CFE_NON_ENVOYE = 'non';  // case « Envoyé » décochée alors que le mail est dans les Éléments envoyés

const CFE_DEFAUTS = [
    'ANNEE_CFE' => '',  // vide : année en cours (avis de l'année N reçus en novembre N) ; année affichée à l'ouverture
    'DATE_ORDRE_CFE' => '',  // jusqu'à quand le client peut réagir avant le télérèglement ; vide : calculée (cfe_date_ordre_defaut)
    'COPIE_CFE' => '',
    'IMPORTANCE_CFE' => 'non',     // « oui » : mails en importance haute (case « Importance haute »)
    'DOSSIERS_TEST_CFE' => 'non',  // « oui » : ajoute les dossiers de test de dossiers-test.json (essais d'envoi, jamais en production)
    'OBJET_CFE' => '{societe} - Avis de CFE {annee}',
    'CORPS_CFE' => "Bonjour {civilite} {nom},\n\n"
        . "Vous trouverez ci-joint {avis} de cotisation foncière des entreprises (CFE) {annee} de {societe}. "
        . "Il prévoit un règlement de {montant}, à effectuer au plus tard le {date_limite}.\n\n"
        . "Vous pouvez le régler en ligne depuis l'espace professionnel de la société sur impots.gouv.fr. "
        . "Si le paiement n'est pas effectué d'ici le {date_butoir}, nous procéderons nous-mêmes au règlement "
        . "par prélèvement sur le compte bancaire de la société.\n\n"
        . "N'hésitez pas à revenir vers nous pour toute question.\n\nBien cordialement,",
    'CORPS_CFE_PRELEVEMENT' => "Bonjour {civilite} {nom},\n\n"
        . "Vous trouverez ci-joint {avis} de cotisation foncière des entreprises (CFE) {annee} de {societe}, "
        . "d'un montant de {montant}.\n\n"
        . "Cette cotisation étant réglée par prélèvement automatique, elle sera débitée {periode_prelevement}. "
        . "Vous n'avez aucune démarche à effectuer : nous vous invitons simplement à vous assurer que le compte "
        . "bancaire de votre entreprise est suffisamment approvisionné d'ici là.\n\n"
        . "Je reste à votre disposition pour toute information complémentaire.\n\n"
        . "Bien cordialement,",
    // Avis à payer : le cabinet règle lui-même, par télérèglement débité à l'échéance ({date_ordre} : dernier jour pour réagir)
    'CORPS_CFE_VIREMENT' => "Bonjour {civilite} {nom},\n\n"
        . "Vous trouverez ci-joint {avis} de cotisation foncière des entreprises (CFE) {annee} de {societe}, "
        . "d'un montant de {montant}, à régler au plus tard le {date_limite}.\n\n"
        . "Afin de vous éviter toute démarche, le cabinet procédera au télérèglement de cette cotisation pour le compte "
        . "de votre entreprise. Sauf instruction contraire de votre part d'ici le {date_ordre}, nous ordonnerons ce "
        . "télérèglement, qui sera débité à l'échéance du {date_limite}.\n\n"
        . "Votre entreprise n'a pas adhéré au prélèvement automatique de cet impôt auprès des services fiscaux. "
        . "Nous pouvons effectuer cette démarche pour vous : la cotisation serait alors prélevée automatiquement chaque année, soit par acomptes "
        . "mensuels, soit à l'échéance. Si cette solution vous intéresse, n'hésitez pas à me le faire savoir.\n\n"
        . "Je reste à votre disposition pour toute information complémentaire.\n\n"
        . "Bien cordialement,",
    // Case « À contester » cochée : l'avis est transmis, mais le mail annonce une demande de précisions aux impôts
    'CORPS_CFE_CONTESTATION' => "Bonjour {civilite} {nom},\n\n"
        . "Vous trouverez ci-joint {avis} de cotisation foncière des entreprises (CFE) {annee} de {societe}, "
        . "d'un montant de {montant}.\n\n"
        . "Après analyse, nous pensons qu'il y a une erreur dans le calcul de cette cotisation. Nous demandons donc "
        . "des précisions à l'administration fiscale via la messagerie de l'espace professionnel de votre entreprise.\n\n"
        . "Nous vous tiendrons au courant de sa réponse, ainsi que du règlement éventuel à prévoir avant l'échéance "
        . "du {date_limite}.\n\n"
        . "Je reste à votre disposition pour toute information complémentaire.\n\n"
        . "Bien cordialement,",
    // Tutoiement (« Tu » sur la ligne du client) : « Bonjour {prenom}, »
    'CORPS_CFE_TU' => "Bonjour {prenom},\n\n"
        . "Tu trouveras ci-joint {avis} de cotisation foncière des entreprises (CFE) {annee} de {societe}. "
        . "Il prévoit un règlement de {montant}, à effectuer au plus tard le {date_limite}.\n\n"
        . "Tu peux le régler en ligne depuis l'espace professionnel de la société sur impots.gouv.fr. "
        . "Si le paiement n'est pas effectué d'ici le {date_butoir}, nous procéderons nous-mêmes au règlement "
        . "par prélèvement sur le compte bancaire de la société.\n\n"
        . "N'hésite pas à revenir vers nous pour toute question.\n\nBien cordialement,",
    'CORPS_CFE_PRELEVEMENT_TU' => "Bonjour {prenom},\n\n"
        . "Tu trouveras ci-joint {avis} de cotisation foncière des entreprises (CFE) {annee} de {societe}, "
        . "d'un montant de {montant}.\n\n"
        . "Cette cotisation étant réglée par prélèvement automatique, elle sera débitée {periode_prelevement}. "
        . "Tu n'as aucune démarche à effectuer : pense simplement à vérifier que le compte bancaire de ton "
        . "entreprise est suffisamment approvisionné d'ici là.\n\n"
        . "Je reste à ta disposition pour toute information complémentaire.\n\n"
        . "Bien cordialement,",
    'CORPS_CFE_RIEN' => "Bonjour {civilite} {nom},\n\n"
        . "Vous trouverez ci-joint {avis} de cotisation foncière des entreprises (CFE) {annee} de {societe}.\n\n"
        . "Le montant à payer est de 0 € : vous n'avez aucun règlement à prévoir ni aucune démarche à effectuer.\n\n"
        . "Je reste à votre disposition pour toute information complémentaire.\n\n"
        . "Bien cordialement,",
    'CORPS_CFE_RIEN_TU' => "Bonjour {prenom},\n\n"
        . "Tu trouveras ci-joint {avis} de cotisation foncière des entreprises (CFE) {annee} de {societe}.\n\n"
        . "Le montant à payer est de 0 € : tu n'as aucun règlement à prévoir ni aucune démarche à effectuer.\n\n"
        . "Je reste à ta disposition pour toute information complémentaire.\n\n"
        . "Bien cordialement,",
    'CORPS_CFE_CONTESTATION_TU' => "Bonjour {prenom},\n\n"
        . "Tu trouveras ci-joint {avis} de cotisation foncière des entreprises (CFE) {annee} de {societe}, "
        . "d'un montant de {montant}.\n\n"
        . "Après analyse, nous pensons qu'il y a une erreur dans le calcul de cette cotisation. Nous demandons donc "
        . "des précisions à l'administration fiscale via la messagerie de l'espace professionnel de ton entreprise.\n\n"
        . "Nous te tiendrons au courant de sa réponse, ainsi que du règlement éventuel à prévoir avant l'échéance "
        . "du {date_limite}.\n\n"
        . "Je reste à ta disposition pour toute information complémentaire.\n\n"
        . "Bien cordialement,",
    'CORPS_CFE_VIREMENT_TU' => "Bonjour {prenom},\n\n"
        . "Tu trouveras ci-joint {avis} de cotisation foncière des entreprises (CFE) {annee} de {societe}, "
        . "d'un montant de {montant}, à régler au plus tard le {date_limite}.\n\n"
        . "Afin de t'éviter toute démarche, le cabinet procédera au télérèglement de cette cotisation pour le compte "
        . "de ton entreprise. Sauf instruction contraire de ta part d'ici le {date_ordre}, nous ordonnerons ce "
        . "télérèglement, qui sera débité à l'échéance du {date_limite}.\n\n"
        . "Ton entreprise n'a pas adhéré au prélèvement automatique de cet impôt auprès des services fiscaux. "
        . "Nous pouvons effectuer cette démarche pour toi : la cotisation serait alors prélevée automatiquement chaque année, soit par acomptes "
        . "mensuels, soit à l'échéance. Si cela t'intéresse, n'hésite pas à me le dire.\n\n"
        . "Je reste à ta disposition pour toute information complémentaire.\n\n"
        . "Bien cordialement,",
];
// Modèles de mail (Paramètres › CFE), vouvoiement puis tutoiement. Un avis à payer est toujours réglé par le cabinet
// (télérèglement) : CORPS_CFE / CORPS_CFE_TU (« le client paie ») ne servent plus.
const CFE_MODELES = [
    'CORPS_CFE_PRELEVEMENT' => 'Prélèvement automatique (vous)', 'CORPS_CFE_VIREMENT' => 'À payer : télérèglement par le cabinet (vous)',
    'CORPS_CFE_PRELEVEMENT_TU' => 'Prélèvement automatique (tu)', 'CORPS_CFE_VIREMENT_TU' => 'À payer : télérèglement par le cabinet (tu)',
    'CORPS_CFE_RIEN' => 'Avis à 0 € (vous)', 'CORPS_CFE_RIEN_TU' => 'Avis à 0 € (tu)',
    'CORPS_CFE_CONTESTATION' => 'Avis à contester (vous)', 'CORPS_CFE_CONTESTATION_TU' => 'Avis à contester (tu)',
];
const CFE_FORMULES = ['Vous' => 'Vous', 'Tu' => 'Tu'];
const CFE_REGLEMENTS = ['client' => 'Le client paie', 'cabinet' => 'Virement cabinet'];

function cfe_chemin(string ...$p): string
{
    return chemin_data('cfe', ...$p);
}

function cfe_parametres(): array
{
    $p = lire_json(cfe_chemin('parametres.json'), []);
    $out = [];
    foreach (CFE_DEFAUTS as $k => $v) {
        $out[$k] = (string)(($p[$k] ?? '') !== '' || $k === 'COPIE_CFE' ? ($p[$k] ?? $v) : $v);
    }
    return $out;
}

function cfe_annee(?array $p = null): int
{
    $a = ($p ?? cfe_parametres())['ANNEE_CFE'];
    return ctype_digit($a) ? (int)$a : (int)date('Y');
}

/** Personne dont on lit les données ComptaZap : la personne connectée (Api). */
function cfe_personne(?string $identifiant = null): string
{
    static $p = '';
    if ($identifiant !== null) {
        $p = $identifiant;
    }
    return $p;
}

/** Données ComptaZap d'une personne : SON ComptaZap, sur SON PC (data/cfe/comptazap-<identifiant>.json). */
function cfe_chemin_comptazap(?string $identifiant = null): ?string
{
    $id = $identifiant ?? cfe_personne();
    return preg_match('/^[a-z0-9_-]{1,40}$/', $id) ? cfe_chemin("comptazap-$id.json") : null;
}

function cfe_comptazap(?string $identifiant = null): array
{
    $chemin = cfe_chemin_comptazap($identifiant);
    return $chemin ? lire_json($chemin, []) : [];
}

/** Avis du tableau : ceux du ComptaZap de la personne, plus les avis saisis ou importés d'un fichier (communs au cabinet,
 *  cfe_saisie.php). Un avis saisi qui existe aussi dans ComptaZap (même SIREN, même référence) : celui de ComptaZap l'emporte. */
function cfe_donnees(?string $identifiant = null): array
{
    $cz = cfe_comptazap($identifiant);
    $saisis = saisie_lire();
    $connus = [];
    foreach ($cz['documents'] ?? [] as $d) {
        $connus[$d['siren'] . '|' . chiffres((string)($d['reference_avis'] ?? ''))] = true;
    }
    foreach ($saisis['documents'] as $d) {
        if (!isset($connus[$d['siren'] . '|' . chiffres((string)$d['reference_avis'])])) {
            $cz['documents'][] = $d;
        }
    }
    $cz['paiements'] = array_merge($cz['paiements'] ?? [], $saisis['paiements']);
    $cz['dettes'] = array_merge($cz['dettes'] ?? [], $saisis['dettes']);
    return $cz;
}

// ---------- Import depuis ComptaZap : le navigateur lit fiscal.db du PC (public/comptazap.js), les PDF viennent à part ----------
const CFE_RE_EXPORT = '#[\\\\/]([^\\\\/]+? - \d{9})[\\\\/]Fiscal[\\\\/]#u';  // « …\COMPTAZAP\ATELIER EXEMPLE - 000000017\Fiscal\Avis CFE\… »

/** Avis, paiements et dettes CFE lus par le navigateur dans la base de ComptaZap de la personne $id. Le PDF de chaque avis est
 *  ensuite récupéré sur le réseau (sauvegarde ComptaZap dans SharePoint), ou à défaut choisi dans le dossier d'export du PC. */
function cfe_recevoir(string $id, array $d): array
{
    $texte = fn($v, int $max = 200) => mb_substr(trim((string)($v ?? '')), 0, $max);
    $propre = fn($lignes, $champs) => array_values(array_map(fn($l) => array_map(fn($v) => is_float($v) || is_int($v) ? $v : $texte($v),
        array_intersect_key(is_array($l) ? $l : [], array_flip($champs))), is_array($lignes) ? $lignes : []));
    $docs = [];
    $racines = [];
    foreach (is_array($d['documents'] ?? null) ? $d['documents'] : [] as $doc) {
        if (!is_array($doc) || !preg_match('/^\d{9}$/', preg_replace('/\D/', '', (string)($doc['siren'] ?? '')))) {
            continue;
        }
        $chemin = $texte($doc['pdf_path'] ?? '', 500);
        $dossier = '';
        if (preg_match(CFE_RE_EXPORT, $chemin, $m, PREG_OFFSET_CAPTURE)) {
            $dossier = $m[1][0];
            $racines[] = substr($chemin, 0, $m[0][1]);  // dossier d'export de ComptaZap (Bureau\COMPTAZAP)
        }
        $siren = preg_replace('/\D/', '', (string)$doc['siren']);
        $ref = preg_replace('/[^A-Za-z0-9]/', '', (string)($doc['reference_avis'] ?? ''));
        $nom = basename(str_replace('\\', '/', $chemin));
        if (!str_ends_with(mb_strtolower($nom), '.pdf')) {  // pas téléchargé sur ce PC : le PDF peut être sur le réseau
            $nom = 'CFE-' . (int)($doc['annee_imposition'] ?? 0) . '-' . $texte($doc['commune'] ?? '', 60) . "-$ref.pdf";
        }
        // Un avis = son SIREN et sa référence (+ date de téléchargement : un avis retéléchargé est redemandé)
        $docs[] = $propre([$doc], ['siren', 'client_name', 'annee_imposition', 'commune', 'reference_avis', 'montant_du', 'date_limite_paiement',
            'mode_paiement', 'date_prelevement'])[0] + ['siren' => $siren, 'dossier_export' => $dossier,
            'pdf' => $ref !== '' ? ['sha256' => hash('sha256', "$siren|$ref|" . $texte($doc['pdf_downloaded_at'] ?? '')), 'nom' => mb_substr($nom, 0, 160)]
                : ['sha256' => '', 'nom' => '']];
    }
    $racines = array_count_values(array_filter($racines));
    arsort($racines);
    $donnees = ['recu_le' => maintenant_minutes(), 'maj_comptazap' => $texte($d['maj_comptazap'] ?? '', 40),
        'export_comptazap' => (string)(array_key_first($racines) ?? ''), 'documents' => $docs,
        'paiements' => $propre($d['paiements'] ?? [], ['annee', 'reference', 'payment_state', 'payment_method', 'paiement_date', 'synced_at']),
        'dettes' => $propre($d['dettes'] ?? [], ['annee', 'impot', 'reference_dette', 'status', 'solde'])];
    $chemin = cfe_chemin_comptazap($id) ?? arret(400, 'Personne inconnue.');
    sous_verrou(fn() => ecrire_json($chemin, $donnees, false));
    return ['avis' => count($docs), 'pdfs_manquants' => cfe_pdfs_manquants($donnees)];
}

/** PDF d'avis pas encore sur le site (années affichée et précédente : celles des mails et de la comparaison). */
function cfe_pdfs_manquants(?array $cz = null): array
{
    $cz ??= cfe_donnees();
    $depuis = min(cfe_annee(), (int)date('Y')) - 1;
    $out = [];
    foreach ($cz['documents'] ?? [] as $doc) {
        $cle = (string)($doc['pdf']['sha256'] ?? '');
        if ($cle !== '' && (int)($doc['annee_imposition'] ?? 0) >= $depuis && !isset($out[$cle]) && !is_file(cfe_chemin('avis', "$cle.pdf"))) {
            $out[$cle] = ['cle' => $cle, 'nom' => (string)$doc['pdf']['nom'], 'dossier' => (string)($doc['dossier_export'] ?? ''),
                'societe' => (string)($doc['client_name'] ?? ''), 'siren' => (string)($doc['siren'] ?? ''),
                'reference' => preg_replace('/[^A-Za-z0-9]/', '', (string)($doc['reference_avis'] ?? ''))];
        }
    }
    return array_values($out);
}

// Sauvegarde réseau de ComptaZap (SharePoint du cabinet) : « <sauvegarde> › NOM-SIREN › CFE › …-<référence>.pdf »
define('CFE_SP_SAUVEGARDE', trim(reglage('sauvegarde_comptazap', 'SAUVEGARDE COMPTAZAP'), '/'));
const CFE_SP_SOUS = ['CFE', 'Fiscal/Avis CFE'];

const CFE_PDFS_PAR_REQUETE = 40;

/** Plusieurs lectures Graph en un seul appel ($batch, 20 par appel) : [clé => liste « value »] ([] si absent ou refusé). */
function cfe_sp_lister(Boite $b, array $demandes): array
{
    $out = [];
    foreach (array_chunk($demandes, 20, true) as $lot) {
        $requetes = $ids = [];
        foreach ($lot as $k => $url) {
            $ids[(string)count($requetes)] = $k;
            $requetes[] = ['id' => (string)count($requetes), 'method' => 'GET', 'url' => $url];
        }
        $r = $b->appel('POST', '/$batch', ['json' => ['requests' => $requetes], 'refus' => SP_REFUS, 'service' => 'SharePoint']) ?? [];
        foreach ($r['responses'] ?? [] as $x) {
            $k = $ids[(string)($x['id'] ?? '')] ?? null;
            if ($k === null) {
                continue;
            }
            $statut = (int)($x['status'] ?? 0);
            $out[$k] = $statut === 200 ? ($x['body']['value'] ?? []) : [];
            if ($statut === 429 || $statut >= 500) {  // saturation passagère : relu seul
                $out[$k] = $b->pages($lot[$k], [], 3000, ['refus' => SP_REFUS, 'service' => 'SharePoint']);
            }
        }
    }
    return $out;
}

/** Dossiers de la sauvegarde ComptaZap : {SIREN: [id…]} d'après la fin du nom (« NOM - 123456789 »), gardés une heure. */
function cfe_dossiers_sauvegarde(Boite $b, bool $rafraichir = false): array
{
    $chemin = cfe_chemin('sharepoint-sauvegarde.json');
    $c = lire_json($chemin, []);
    if (!$rafraichir && isset($c['le'], $c['drive'], $c['dossiers']) && time() - (int)$c['le'] < 3600) {
        return $c + ['neuf' => false];
    }
    [$d, $enfants] = sp_dossier_et_enfants($b, CFE_SP_SAUVEGARDE);
    $dossiers = [];
    foreach ($enfants as $e) {
        if ($e['dossier'] && preg_match('/(\d{3}\s?\d{3}\s?\d{3})\s*$/', $e['nom'], $m)) {
            $dossiers[str_replace(' ', '', $m[1])][] = $e['id'];
        }
    }
    $c = ['le' => time(), 'drive' => $d['drive'], 'dossiers' => $dossiers];
    ecrire_json($chemin, $c);
    return $c + ['neuf' => true];
}

/** Téléchargements en parallèle (adresses de téléchargement directes de SharePoint, valables quelques minutes) : [clé => octets]. */
function cfe_telecharger(array $urls, int $parallele = 10): array
{
    exiger_reseau();
    $out = [];
    foreach (array_chunk($urls, $parallele, true) as $lot) {
        $multi = curl_multi_init();
        $poignees = [];
        foreach ($lot as $k => $url) {
            $c = curl_init($url);
            curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 60, CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_USERAGENT => 'AvisCFE/1.0']);
            curl_multi_add_handle($multi, $c);
            $poignees[$k] = $c;
        }
        do {
            $statut = curl_multi_exec($multi, $actifs);
            if ($actifs) {
                curl_multi_select($multi, 1.0);
            }
        } while ($actifs && $statut === CURLM_OK);
        foreach ($poignees as $k => $c) {
            $out[$k] = (int)curl_getinfo($c, CURLINFO_HTTP_CODE) === 200 ? (string)curl_multi_getcontent($c) : '';
            curl_multi_remove_handle($multi, $c);
            curl_close($c);
        }
        curl_multi_close($multi);
    }
    return $out;
}

/** PDF d'avis manquants ($cles, CFE_PDFS_PAR_REQUETE au plus par requête) récupérés sur le réseau : SharePoint › sauvegarde
 *  ComptaZap › NOM-SIREN › CFE, lu avec le compte Microsoft de la personne. Dossiers listés par lots ($batch), PDF téléchargés
 *  en parallèle. {ok: [clés], absents: [clés pas (encore) sauvegardées sur le réseau]} */
function cfe_pdfs_reseau(Boite $b, array $cles): array
{
    sp_verifier_compte($b);
    $voulus = array_slice(array_values(array_filter(cfe_pdfs_manquants(), fn($m) => in_array($m['cle'], $cles, true))), 0, CFE_PDFS_PAR_REQUETE);
    $c = cfe_dossiers_sauvegarde($b);
    if (!$c['neuf'] && array_filter($voulus, fn($m) => !isset($c['dossiers'][$m['siren']]))) {
        $c = cfe_dossiers_sauvegarde($b, true);  // dossier créé depuis la dernière lecture
    }
    $trouves = [];  // clé de l'avis => fichier SharePoint
    foreach (CFE_SP_SOUS as $sous) {  // « CFE », puis l'autre rangement seulement pour les avis pas encore trouvés
        $chemin = implode('/', array_map('rawurlencode', explode('/', $sous)));
        $demandes = [];
        foreach ($voulus as $m) {
            foreach (isset($trouves[$m['cle']]) ? [] : ($c['dossiers'][$m['siren']] ?? []) as $n => $id) {
                $demandes["{$m['siren']}#$n"] ??= "/drives/{$c['drive']}/items/$id:/$chemin:/children?\$top=999";
            }
        }
        $listes = $demandes ? cfe_sp_lister($b, $demandes) : [];
        foreach ($voulus as $m) {
            $fin = '-' . mb_strtolower($m['reference']) . '.pdf';
            foreach ($listes as $k => $liste) {
                if ($m['reference'] === '' || isset($trouves[$m['cle']]) || !str_starts_with((string)$k, $m['siren'] . '#')) {
                    continue;
                }
                foreach ($liste as $f) {
                    if (isset($f['file']) && str_ends_with(mb_strtolower((string)($f['name'] ?? '')), $fin)) {
                        $trouves[$m['cle']] = $f;
                    }
                }
            }
        }
    }
    $directs = array_filter(array_map(fn($f) => (string)($f['@microsoft.graph.downloadUrl'] ?? ''), $trouves));
    $contenus = cfe_telecharger($directs);
    $ok = $absents = [];
    foreach ($voulus as $m) {
        $contenu = $contenus[$m['cle']] ?? '';
        if (!str_starts_with($contenu, '%PDF') && isset($trouves[$m['cle']])) {  // sans adresse directe : lu par Graph
            $contenu = (string)($b->appel('GET', "/drives/{$c['drive']}/items/{$trouves[$m['cle']]['id']}/content", ['brut' => true, 'suivre' => true,
                'refus' => SP_REFUS, 'service' => 'SharePoint'])[0] ?? '');
        }
        if (!str_starts_with($contenu, '%PDF')) {
            $absents[] = $m['cle'];
            continue;
        }
        ecrire_fichier(cfe_chemin('avis', "{$m['cle']}.pdf"), $contenu);
        $ok[] = $m['cle'];
    }
    return ['ok' => $ok, 'absents' => $absents];
}

/** PDF d'un avis choisi dans le dossier d'export de ComptaZap : seulement un avis attendu, et un vrai PDF. Commun au cabinet. */
function cfe_recevoir_pdf(string $cle, string $contenu): array
{
    $attendus = [];
    $sources = array_merge(array_map(fn($f) => lire_json($f, []), glob(cfe_chemin('comptazap-*.json')) ?: []), [saisie_lire()]);
    foreach ($sources as $s) {  // l'avis peut venir du ComptaZap de n'importe quel collaborateur, ou avoir été saisi
        foreach ($s['documents'] ?? [] as $doc) {
            $attendus[(string)($doc['pdf']['sha256'] ?? '')] = true;
        }
    }
    if (!preg_match('/^[0-9a-f]{64}$/', $cle) || empty($attendus[$cle])) {
        arret(404, 'Avis inconnu : refaire l\'import des avis.');
    }
    if (strlen($contenu) > 8 * 1024 * 1024 || !str_starts_with($contenu, '%PDF')) {
        arret(422, 'Ce fichier n\'est pas un PDF d\'avis.');
    }
    ecrire_fichier(cfe_chemin('avis', "$cle.pdf"), $contenu);
    return ['ok' => true];
}

/** Années d'imposition des avis de CFE reçus de ComptaZap, de la plus ancienne à la plus récente. */
function cfe_annees_disponibles(?array $cz = null): array
{
    $a = array_values(array_unique(array_filter(array_map(fn($d) => (int)($d['annee_imposition'] ?? 0), ($cz ?? cfe_donnees())['documents'] ?? []))));
    sort($a);
    return $a;
}

/** Dossiers de test (faux clients pour essayer l'envoi) seulement si DOSSIERS_TEST_CFE = oui. */
function cfe_tests_actifs(?array $p = null): bool
{
    return strtolower(trim(($p ?? cfe_parametres())['DOSSIERS_TEST_CFE'])) === 'oui';
}

function cfe_importance_haute(?array $p = null): bool
{
    return in_array(strtolower(trim(($p ?? cfe_parametres())['IMPORTANCE_CFE'])), ['oui', 'true', '1'], true);
}

/** Jours écoulés depuis le 1er du mois (420 au moins) : durée de boîte mail à lire pour couvrir l'année affichée. */
function cfe_jours_depuis(int $annee, int $mois): int
{
    return max(420, jours_entre(sprintf('%04d-%02d-01', $annee, $mois), aujourdhui()) + 1);
}

function chiffres(string $t): string
{
    return preg_replace('/\D/', '', $t) ?? '';
}

/** [statut, reste dû (centimes), explication] d'un avis d'après sa ligne de paiement et sa dette sur impots.gouv. */
function cfe_statut_avis(array $doc, array $paiements, ?array $dette): array
{
    $montant = lire_montant((string)($doc['montant_du'] ?? 0)) ?? 0;
    if (!$montant) {
        return [CFE_RIEN, 0, 'Avis à 0 € : rien à payer.'];
    }
    $payes = array_values(array_filter($paiements, fn($p) => ($p['payment_state'] ?? '') === 'PAYE'));
    if ($dette !== null && (($dette['status'] ?? '') !== 'ACTIVE' || !(lire_montant((string)($dette['solde'] ?? 0)) ?? 0))) {
        return [CFE_PAYE, 0, 'Plus aucune dette pour cet avis sur impots.gouv.'];
    }
    if ($payes && $dette === null) {
        $p = end($payes);
        $moyen = strtolower(str_replace('_', ' ', (string)($p['payment_method'] ?? '')));
        $moyen = in_array($moyen, ['', 'inconnu', 'unknown'], true) ? '' : " ($moyen)";
        return [CFE_PAYE, 0, 'Payé' . (($p['paiement_date'] ?? '') ? ' le ' . $p['paiement_date'] : '') . "$moyen."];
    }
    $reste = $dette !== null ? (lire_montant((string)$dette['solde']) ?? $montant) : $montant;
    if (in_array($doc['mode_paiement'] ?? '', CFE_PRELEVEMENTS, true)) {
        $quand = ($doc['date_prelevement'] ?? '') ? ' le ' . $doc['date_prelevement'] : '';
        return [CFE_PRELEVEMENT, $reste, "Prélèvement automatique$quand (mention de l'avis) : le client n'a rien à faire."];
    }
    if ($dette !== null || array_filter($paiements, fn($p) => ($p['payment_state'] ?? '') === 'A_PAYER')) {
        $partiel = $reste < $montant ? ' (déjà payé : ' . euros($montant - $reste) . ')' : '';
        return [CFE_A_PAYER, $reste, 'À payer d\'après impots.gouv : reste ' . euros($reste) . $partiel . '.'];
    }
    return [CFE_A_VERIFIER, $montant, 'Ni paiement ni dette trouvés sur impots.gouv : vérifier dans ComptaZap.'];
}

/** {SIREN: dossier} des clients ayant un avis de CFE $annee. Dossier : {siren, nom_comptazap, noms, annee, avis[], statut,
 *  montant, a_envoyer[]}. Avis : {reference, commune, montant, reste, date_limite, mode, date_prelevement, pdf, dossier_export,
 *  statut, detail} (montants en centimes). */
function cfe_dossiers(int $annee, ?array $cz = null, bool $avec_tests = false): array
{
    $cz ??= cfe_donnees();
    $paiements = $dettes = [];
    foreach ($cz['paiements'] ?? [] as $p) {
        if ((int)($p['annee'] ?? 0) === $annee) {
            $paiements[chiffres((string)($p['reference'] ?? ''))][] = $p;
        }
    }
    foreach ($cz['dettes'] ?? [] as $d) {
        if ((int)($d['annee'] ?? 0) === $annee && ($d['impot'] ?? '') === 'CFE') {
            $dettes[chiffres((string)($d['reference_dette'] ?? ''))] = $d;
        }
    }
    $docs = array_values(array_filter($cz['documents'] ?? [], fn($d) => (int)($d['annee_imposition'] ?? 0) === $annee));
    usort($docs, fn($a, $b) => [$a['client_name'] ?? '', $a['commune'] ?? ''] <=> [$b['client_name'] ?? '', $b['commune'] ?? '']);
    $dossiers = [];
    foreach ($docs as $d) {
        $ref = (string)($d['reference_avis'] ?? '');
        [$statut, $reste, $detail] = cfe_statut_avis($d, $paiements[chiffres($ref)] ?? [], $dettes[chiffres($ref)] ?? null);
        $s = (string)$d['siren'];
        $dossiers[$s] ??= ['siren' => $s, 'nom_comptazap' => (string)($d['client_name'] ?? ''), 'annee' => $annee, 'avis' => [], 'noms' => []];
        $dossiers[$s]['avis'][] = ['reference' => $ref, 'commune' => (string)($d['commune'] ?? ''), 'montant' => lire_montant((string)($d['montant_du'] ?? 0)) ?? 0,
            'reste' => $reste, 'date_limite' => (string)($d['date_limite_paiement'] ?? ''), 'mode' => (string)($d['mode_paiement'] ?? ''),
            'date_prelevement' => (string)($d['date_prelevement'] ?? ''), 'pdf' => (string)($d['pdf']['sha256'] ?? ''),
            'pdf_nom' => (string)($d['pdf']['nom'] ?? ''), 'dossier_export' => (string)($d['dossier_export'] ?? ''), 'statut' => $statut, 'detail' => $detail,
            'pdf_present' => ($d['pdf']['sha256'] ?? '') !== '' && is_file(cfe_chemin('avis', $d['pdf']['sha256'] . '.pdf')),
            'saisi' => ($d['source'] ?? '') === 'saisie'];
    }
    foreach ($dossiers as &$dos) {
        foreach ([CFE_A_VERIFIER, CFE_A_PAYER, CFE_PRELEVEMENT, CFE_PAYE, CFE_RIEN] as $s) {  // le plus urgent des avis
            if (array_filter($dos['avis'], fn($a) => $a['statut'] === $s)) {
                $dos['statut'] = $s;
                break;
            }
        }
        $dos['a_envoyer'] = array_values(array_filter($dos['avis'], fn($a) => $a['statut'] === $dos['statut']));
        $dos['montant'] = array_sum(array_column($dos['a_envoyer'], 'reste'));
        // Nom ComptaZap et nom du dossier d'export (« SELARL Exemple Avocat », « SELARL EXEMPLE AVOCAT »)
        $dos['noms'] = array_values(array_unique(array_merge([$dos['nom_comptazap']],
            array_map(fn($a) => preg_replace('/ - \d{9}$/', '', $a['dossier_export']), array_filter($dos['avis'], fn($a) => $a['dossier_export'] !== '')))));
    }
    if ($avec_tests && cfe_tests_actifs()) {  // dossiers de test : rattachés à l'année affichée
        $dossiers += cfe_dossiers_test($annee)[0];
    }
    return $dossiers;
}

/**
 * Dossiers de test (data/cfe/dossiers-test.json et data/cfe/test/*.pdf) : faux avis adressés à vos propres adresses, pour
 * essayer l'envoi et les échanges sans écrire à un vrai client. Jamais
 * « envoyés », jamais rangés dans OneDrive. [dossiers, interlocuteurs] ; vides si le fichier n'existe pas.
 */
function cfe_dossiers_test(int $annee): array
{
    $dossiers = $contacts = [];
    foreach (lire_json(cfe_chemin('dossiers-test.json'), []) as $t) {
        $a = $t['avis'] ?? [];
        $pdf = cfe_chemin('test', basename((string)($a['pdf'] ?? '')));
        $sha = is_file($pdf) ? hash_file('sha256', $pdf) : '';
        if ($sha !== '' && !is_file(cfe_chemin('avis', "$sha.pdf"))) {  // servi et joint comme un vrai avis
            @mkdir(cfe_chemin('avis'), 0775, true);
            copy($pdf, cfe_chemin('avis', "$sha.pdf"));
        }
        $montant = (int)round(((float)($a['montant'] ?? 0)) * 100);
        $statut = (string)($a['statut'] ?? CFE_A_PAYER);
        $avis = ['reference' => (string)($a['reference'] ?? ''), 'commune' => (string)($a['commune'] ?? ''), 'montant' => $montant,
            'reste' => $statut === CFE_PAYE ? 0 : $montant, 'date_limite' => (string)($a['date_limite'] ?? ''), 'mode' => (string)($a['mode'] ?? ''),
            'date_prelevement' => (string)($a['date_prelevement'] ?? ''), 'pdf' => $sha, 'pdf_nom' => basename($pdf), 'dossier_export' => '',
            'statut' => $statut, 'detail' => 'Dossier de test (faux avis)'];
        $s = (string)$t['siren'];
        $dossiers[$s] = ['siren' => $s, 'nom_comptazap' => (string)$t['nom'], 'annee' => $annee, 'avis' => [$avis], 'noms' => [(string)$t['nom']],
            'statut' => $statut, 'a_envoyer' => [$avis], 'montant' => $avis['reste'], 'test' => true];
        $contacts[$s] = ($t['contact'] ?? []) + ['source' => 'dossier de test'];
    }
    return [$dossiers, $contacts];
}

// ---------- Interlocuteur du client ----------

/** {clé de nom: [contacts]} depuis l'annuaire des interlocuteurs (Pennylane ou fichier CSV, cfe_annuaire.php). */
function cfe_index_contacts(array $annuaire): array
{
    $index = [];
    foreach ($annuaire as $cle => $c) {
        if (is_array($c) && ($c['entreprise'] ?? '') !== '' && (($c['email'] ?? '') !== '' || ($c['nom'] ?? '') !== '')) {
            $c['_cle'] = (string)$cle;
            foreach (cles_nom($c['entreprise']) as $k) {
                $index[$k][] = $c;
            }
        }
    }
    return $index;
}

/** {« prénom|nom » en minuscules: "M" / "Mme"} : civilité de la même personne connue sur un autre dossier de l'annuaire. */
function cfe_civilites_connues(array $annuaire): array
{
    $g = [];
    foreach ($annuaire as $c) {
        $civ = is_array($c) ? civilite_normalisee($c['civilite'] ?? '') : '';
        if ($civ && (($c['prenom'] ?? '') !== '' || ($c['nom'] ?? '') !== '')) {
            $g[mb_strtolower(($c['prenom'] ?? '') . '|' . ($c['nom'] ?? ''))] = $civ;
        }
    }
    return $g;
}

/** {prenom, nom, email, cc, civilite, formule, reglement, entreprise, source} : saisie à la main, sinon contact de l'annuaire
 *  (Pennylane ou CSV) rapproché par le nom. Civilité : à la main, sinon l'annuaire, sinon « M » / « MME » du nom ComptaZap
 *  (entrepreneur individuel), sinon celle de la même personne connue sur un autre dossier. Jamais déduite du prénom. */
function cfe_interlocuteur(array $dossier, array $manuels, array $index, array $genres): array
{
    $trouves = [];
    foreach ($dossier['noms'] as $nom) {
        foreach (cles_nom($nom) as $k) {
            foreach ($index[$k] ?? [] as $c) {
                $trouves[$c['_cle']] = $c;
            }
        }
    }
    $pl = count($trouves) === 1 ? reset($trouves) : [];
    $m = $manuels[$dossier['siren']] ?? [];
    $formule = ($m['formule'] ?? '') ?: ($pl['formule'] ?? '') ?: 'Vous';
    $res = [];
    foreach (['prenom', 'nom', 'email', 'cc'] as $k) {
        $res[$k] = array_key_exists($k, $m) && $m[$k] !== null ? (string)$m[$k] : (string)($pl[$k] ?? '');
    }
    $res['entreprise'] = (string)($pl['entreprise'] ?? '');
    $res['source'] = $m ? (($m['source'] ?? '') ?: 'saisi à la main') : ($pl ? (($pl['source'] ?? '') ?: 'annuaire') : ($trouves ? 'plusieurs contacts possibles' : ''));
    $civ = array_key_exists('civilite', $m) && $m['civilite'] !== null ? (string)$m['civilite'] : null;
    if ($civ === null || $civ === '') {
        $civ = civilite_normalisee($pl['civilite'] ?? '');
    }
    if (!$civ) {
        $prefixe = strtoupper(explode(' ', $dossier['nom_comptazap'])[0] ?? '');
        $civ = ['M' => 'M', 'MME' => 'Mme', 'MLLE' => 'Mme'][$prefixe] ?? '';
    }
    if (!$civ) {
        $civ = $genres[mb_strtolower($res['prenom'] . '|' . $res['nom'])] ?? '';
    }
    $res['civilite'] = $civ;
    $res['formule'] = str_starts_with((string)$formule, 'Tu') ? 'Tu' : 'Vous';
    $res['reglement'] = isset(CFE_REGLEMENTS[$m['reglement'] ?? '']) ? $m['reglement'] : 'client';
    return $res;
}

/** Nom affiché dans le mail : celui de l'annuaire (sans les étiquettes comme « [LMNP] »), sinon celui de ComptaZap
 *  sans la forme juridique. */
function cfe_nom_societe(array $dossier, array $contact): string
{
    $nom = trim(preg_replace('/\s*\[[^\]]*\]/', '', (string)($contact['entreprise'] ?? '')) ?? '');
    return $nom !== '' ? $nom : trim(preg_replace(CFE_FORMES, '', $dossier['nom_comptazap']) ?? '');
}

// ---------- Mail ----------

/** Date d'ordre du télérèglement sans réglage : le premier vendredi à au moins 5 jours (le client a toujours le temps de
 *  réagir ; jamais une date passée dans un mail). */
function cfe_date_ordre_defaut(string $aujourdhui): string
{
    $j = plus_jours($aujourdhui, 5);
    while (date('N', strtotime("$j 12:00")) !== '5') {
        $j = plus_jours($j, 1);
    }
    [, $m, $d] = array_map('intval', explode('-', $j));
    return 'vendredi ' . ($d === 1 ? '1er' : $d) . ' ' . MOIS[$m - 1];
}

/** Date après laquelle le cabinet règle lui-même : dans deux semaines, au plus tard la date limite de l'avis (si elle n'est
 *  pas déjà passée, comme pour un avis de l'année précédente encore dû). */
function cfe_date_butoir(string $date_limite, ?string $aujourdhui = null): string
{
    $aujourdhui ??= aujourdhui();
    $butoir = plus_jours($aujourdhui, CFE_DELAI_BUTOIR);
    $limite = iso_depuis_fr($date_limite);
    if (!$limite) {
        return $butoir;
    }
    return $limite >= $aujourdhui ? min($butoir, $limite) : $butoir;
}

function cfe_date(string $jjmmaaaa): string
{
    $iso = iso_depuis_fr($jjmmaaaa);
    return $iso ? date_longue($iso) : $jjmmaaaa;
}

/** « courant décembre » : le mois du prélèvement sans le jour (il peut varier), ou la date de l'avis si elle est illisible. */
function cfe_periode(string $jjmmaaaa): string
{
    $iso = iso_depuis_fr($jjmmaaaa);
    return $iso ? 'courant ' . MOIS[(int)substr($iso, 5, 2) - 1] : "à la date indiquée sur l'avis";
}

/** Aucun tiret long dans un mail (consigne du cabinet) : un tiret simple entre deux espaces à la place. */
function sans_quadratin(string $texte): string
{
    return preg_replace('/[ \t\x{00A0}]*[\x{2013}\x{2014}][ \t\x{00A0}]*/u', ' - ', $texte) ?? $texte;
}

/** [objet, texte, html, pièces [[sha256, nom]], modèle utilisé] du mail d'envoi de l'avis.
 *  $contestation : case « À contester » cochée, le mail annonce une demande de précisions aux impôts. */
function cfe_construire_mail(array $dossier, array $contact, array $p, int $annee, ?string $aujourdhui = null, bool $contestation = false): array
{
    $avis = $dossier['a_envoyer'];
    // À contester, sinon prélèvement automatique, sinon télérèglement par le cabinet : un avis à payer est toujours réglé par
    // le cabinet ; CORPS_CFE / CORPS_CFE_TU (« le client paie ») ne servent plus
    $cle = $contestation ? 'CORPS_CFE_CONTESTATION' : match ($dossier['statut']) {
        CFE_PRELEVEMENT => 'CORPS_CFE_PRELEVEMENT', CFE_RIEN => 'CORPS_CFE_RIEN', default => 'CORPS_CFE_VIREMENT'};
    $modele = ($contact['formule'] ?? '') === 'Tu' ? $cle . '_TU' : $cle;
    $corps = ($p[$modele] ?? '') !== '' ? $p[$modele] : CFE_DEFAUTS[$modele];
    $civilite = CIVILITES[$contact['civilite'] ?? ''] ?? '';
    $nom = nom_propre((string)($contact['nom'] ?? ''));
    if (!$civilite) {  // « Bonjour Prénom Nom, » plutôt qu'un Monsieur / Madame au hasard
        $corps = str_replace('{civilite} {nom}', '{prenom} {nom}', $corps);
    }
    $societe = cfe_nom_societe($dossier, $contact);
    if (preg_match('/^(les|le) (.+)$/iu', $societe, $article)) {  // « des Saveurs du Sud », « du Grand Atelier »
        $corps = str_replace('de {societe}', (mb_strtolower($article[1]) === 'les' ? 'des ' : 'du ') . $article[2], $corps);
    } elseif (preg_match('/^[AEIOUYÀÂÉÈÊËÎÏÔÛÜH]/iu', $societe)) {  // « d'ATELIER DUPONT », « d'IMMO EXEMPLE »
        $corps = str_replace('de {societe}', "d'{societe}", $corps);
    }
    if (count($avis) > 1) {
        $corps = str_replace('Il prévoit', 'Ils prévoient', $corps);
    }
    $montant = euros($dossier['montant']);
    if (count($avis) > 1) {  // « 766 € (456 € pour Ville de Paris et 310 € pour Levallois-Perret) »
        $montant .= ' (' . enumerer(array_map(fn($a) => euros($a['reste']) . ' pour ' . commune_propre($a['commune']), $avis)) . ')';
    }
    $premier = $avis[0] ?? null;
    $prelevement = $premier && $premier['date_prelevement'] !== '';
    $valeurs = [
        'civilite' => $civilite, 'nom' => $nom, 'prenom' => (string)($contact['prenom'] ?? ''), 'societe' => $societe,
        'annee' => (string)$annee, 'avis' => count($avis) > 1 ? 'les avis' : "l'avis", 'montant' => $montant,
        'date_limite' => $premier ? cfe_date($premier['date_limite']) : '',
        'date_butoir' => date_longue(cfe_date_butoir($premier['date_limite'] ?? '', $aujourdhui)),
        'date_prelevement' => $prelevement ? cfe_date($premier['date_prelevement']) : "la date indiquée sur l'avis",
        'periode_prelevement' => $prelevement ? cfe_periode($premier['date_prelevement']) : "à la date indiquée sur l'avis",
        'date_ordre' => ($p['DATE_ORDRE_CFE'] ?? '') !== '' ? $p['DATE_ORDRE_CFE'] : cfe_date_ordre_defaut($aujourdhui ?? aujourdhui()),
    ];
    if (!$prelevement) {  // sans date : « débitée à la date indiquée sur l'avis », pas « le la date »
        $corps = str_replace('le {date_prelevement}', 'à {date_prelevement}', $corps);
    }
    $objet = $p['OBJET_CFE'] ?: CFE_DEFAUTS['OBJET_CFE'];
    $texte = $corps;
    foreach ($valeurs as $k => $v) {
        $objet = str_replace('{' . $k . '}', $v, $objet);
        $texte = str_replace('{' . $k . '}', $v, $texte);
    }
    [$objet, $texte] = [sans_quadratin($objet), sans_quadratin($texte)];
    $texte = preg_replace('/Bonjour +,/', 'Bonjour,', preg_replace('/ {2,}/', ' ', $texte) ?? $texte) ?? $texte;  // ni civilité ni nom
    $pieces = array_map(fn($a) => [$a['pdf'], $a['pdf_nom'] ?: 'Avis CFE ' . $annee . ' ' . $a['commune'] . '.pdf'], array_filter($avis, fn($a) => $a['pdf'] !== ''));
    return [$objet, trim($texte), paragraphes_html($texte), array_values($pieces), $modele];
}

// ---------- Mails envoyés ----------

function cfe_est_mail(string $objet, int $annee): bool
{
    $o = mb_strtolower(trim($objet));
    foreach (['re:', 're :', 'tr:', 'tr :', 'fw:', 'fwd:', '[test]'] as $debut) {
        if (str_starts_with($o, $debut)) {
            return false;
        }
    }
    return str_contains($o, 'cfe') && str_contains($o, (string)$annee);
}

/** Date du premier mail d'avis de CFE $annee envoyé à cet e-mail (ou dont l'objet cite la société : « Société - Avis de CFE
 *  2026 », d'anciens mails peuvent avoir un tiret long), sinon null.
 *  $email_partage : cet e-mail est l'interlocuteur de plusieurs sociétés ; seul l'objet (« Société - Avis de CFE ») dit alors
 *  quelle société a reçu son avis (sinon un seul mail cocherait « Envoyé » pour toutes ses sociétés). */
function cfe_date_envoi(array $mails, int $annee, string $email, string $societe, bool $email_partage = false): ?string
{
    $email = mb_strtolower(trim($email));
    $cles = $societe !== '' ? cles_nom($societe) : [];
    $dates = [];
    foreach ($mails as $m) {
        if (!cfe_est_mail($m['objet'], $annee)) {
            continue;
        }
        $par_nom = $cles && array_intersect($cles, cles_nom(preg_split('/[ \t\x{00A0}][\x{2013}\x{2014}\-][ \t\x{00A0}]/u', $m['objet'], 2)[0]));
        $par_email = $email !== '' && in_array($email, $m['destinataires'], true);
        if ($par_nom || ($par_email && !$email_partage)) {
            $dates[] = $m['date'];
        }
    }
    return $dates ? min($dates) : null;
}
