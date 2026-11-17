<?php
/**
 * SharePoint du cabinet (bibliothèque de documents, synchronisée par OneDrive sur les postes), lu par Microsoft Graph avec le
 * compte Microsoft de la personne connectée : rien à installer sur les PC.
 * Sert au rangement des avis dans les dossiers clients (cfe_onedrive.php) et à la récupération des PDF des avis dans la
 * sauvegarde de ComptaZap (cfe.php). Adresse de la bibliothèque et dossiers : réglages (config.exemple.json).
 */
declare(strict_types=1);

// Vide : pas de SharePoint (le rangement est remplacé par le téléchargement des PDF)
define('SP_BIBLIOTHEQUE', rtrim(reglage('sharepoint'), '/'));
define('SP_CLIENTS', trim(reglage('dossier_clients', 'Dossiers/Comptabilite'), '/'));  // un sous-dossier par client
const SP_REFUS = "Votre compte Microsoft n'a pas accès aux fichiers du cabinet : reconnectez votre boîte (Paramètres › Messagerie Outlook) "
    . "avec votre adresse du cabinet et acceptez l'accès aux fichiers.";

/** Compte qui peut ouvrir le SharePoint du cabinet : sinon un message qui dit quoi faire. */
function sp_verifier_compte(Boite $b): void
{
    if (MODE_DEMO) {
        throw new ErreurOutlook(DEMO_MESSAGE);
    }
    if (SP_BIBLIOTHEQUE === '') {
        throw new ErreurOutlook("OneDrive / SharePoint n'est pas configuré : adresse de la bibliothèque du cabinet dans config.json (réglage "
            . '« sharepoint »). En attendant, téléchargez les avis (bouton « Télécharger les PDF »).');
    }
    if ($b->adresse() === '') {
        throw new ErreurOutlook('Connectez votre boîte Microsoft du cabinet (Paramètres › Messagerie Outlook) : les fichiers du '
            . 'cabinet (SharePoint) se lisent par elle.', ['type' => 'reconnecter']);
    }
    if ($b->personnel()) {
        throw new ErreurOutlook("La boîte connectée ({$b->adresse()}) est un compte Microsoft personnel : il n'a pas accès au SharePoint du cabinet. "
            . 'Dans Paramètres › Messagerie Outlook, déconnectez-la puis connectez votre adresse @' . DOMAINE_CABINET . '.', ['type' => 'reconnecter']);
    }
}

/** Adresse web d'un dossier de la bibliothèque (espaces encodés, comme dans le navigateur). */
function sp_adresse(string $chemin): string
{
    return str_replace('%3A', ':', implode('/', array_map('rawurlencode', explode('/', SP_BIBLIOTHEQUE . '/' . $chemin))));
}

/** Dossier SharePoint [drive, id] retrouvé par son adresse (API « shares »), gardé en mémoire dans data/sharepoint.json. */
function sp_dossier(Boite $b, string $chemin, bool $rafraichir = false): array
{
    $cache = lire_json(chemin_data('sharepoint.json'), []);
    if (!$rafraichir && isset($cache[$chemin]['drive'], $cache[$chemin]['id'])) {
        return $cache[$chemin];
    }
    foreach ([sp_adresse($chemin), SP_BIBLIOTHEQUE . '/' . $chemin] as $adresse) {
        $code = 'u!' . rtrim(strtr(base64_encode($adresse), '+/', '-_'), '=');
        $r = $b->appel('GET', "/shares/$code/driveItem", ['params' => ['$select' => 'id,name,folder,parentReference'], 'refus' => SP_REFUS,
            'service' => 'SharePoint']);
        if ($r && isset($r['folder'], $r['parentReference']['driveId'])) {
            $cache[$chemin] = ['drive' => $r['parentReference']['driveId'], 'id' => $r['id']];
            ecrire_json(chemin_data('sharepoint.json'), $cache);
            return $cache[$chemin];
        }
    }
    throw new ErreurOutlook('Dossier introuvable dans SharePoint : ' . str_replace('/', ' › ', $chemin)
        . '. Votre compte Microsoft y a-t-il accès ? (réglages « sharepoint » et « dossier_clients »)');
}

/** Contenu d'un dossier : [[nom, id, dossier?]]. null si le dossier n'existe plus. */
function sp_enfants(Boite $b, array $d): ?array
{
    $url = "/drives/{$d['drive']}/items/{$d['id']}/children";
    if ($b->appel('GET', "/drives/{$d['drive']}/items/{$d['id']}", ['params' => ['$select' => 'id'], 'refus' => SP_REFUS, 'service' => 'SharePoint']) === null) {
        return null;
    }
    return array_map(fn($x) => ['nom' => $x['name'], 'id' => $x['id'], 'dossier' => isset($x['folder'])],
        $b->pages($url, ['$select' => 'id,name,folder', '$top' => '999'], 20000, ['refus' => SP_REFUS, 'service' => 'SharePoint']));
}

/** Contenu d'un dossier de la bibliothèque, en retrouvant son adresse si le dossier a été déplacé depuis. */
function sp_dossier_et_enfants(Boite $b, string $chemin): array
{
    $d = sp_dossier($b, $chemin);
    $enfants = sp_enfants($b, $d);
    if ($enfants === null) {
        $d = sp_dossier($b, $chemin, true);
        $enfants = sp_enfants($b, $d) ?? [];
    }
    return [$d, $enfants];
}
