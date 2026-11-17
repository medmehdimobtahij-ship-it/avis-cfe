<?php
/**
 * Rangement des avis de CFE dans les dossiers clients du cabinet (bibliothèque SharePoint, synchronisée par OneDrive) :
 * <dossier_clients> › <CLIENT> › <année> › <sous_dossier_cfe> › <CLIENT> AVIS CFE <année>.pdf, par Microsoft Graph avec la
 * boîte de la personne connectée. Dossiers : réglages « dossier_clients » et « sous_dossier_cfe » (par défaut FISCAL/07-CFE).
 *
 * - Le dossier du client est retrouvé par son nom (les dossiers n'ont pas de SIREN) : nom ComptaZap sans la forme juridique,
 *   mots dans n'importe quel ordre. Choix à la main possible, gardé dans data/cfe/dossiers-onedrive.json.
 * - Copie seulement : rien n'est jamais remplacé ni supprimé. Un avis déjà présent (même contenu, quel que soit son nom)
 *   est laissé tel quel ; un autre fichier du même nom est signalé, pas écrasé.
 * - Seuls les sous-dossiers <année> › … manquants sont créés, jamais le dossier du client.
 */
declare(strict_types=1);

const OD_COPIER = 'à copier', OD_DEJA = 'déjà rangé', OD_CONFLIT = 'autre fichier du même nom', OD_SANS_DOSSIER = 'pas de dossier OneDrive',
    OD_SANS_PDF = 'PDF de l\'avis pas encore sur le site';
define('OD_SOUS', array_values(array_filter(explode('/', reglage('sous_dossier_cfe', 'FISCAL/07-CFE')), fn($x) => trim($x) !== '')));
const OD_IGNORES = ['LMNP'];  // préfixe des dossiers des loueurs meublés, absent des noms ComptaZap

function od_mots(string $t): array
{
    $t = preg_replace(CFE_FORMES, '', sans_accents_majuscules(trim($t)));
    preg_match_all('/[A-Z0-9]+/', $t, $m);
    return array_values(array_diff(array_unique($m[0]), OD_IGNORES));
}

function od_compact(string $t): string
{
    return preg_replace('/[^A-Z0-9]/', '', preg_replace(CFE_FORMES, '', sans_accents_majuscules(trim($t))));
}

/** Dossier du client parmi $existants d'après ses noms (ComptaZap, export) ; null si absent ou ambigu (à choisir à la main). */
function od_trouver(array $noms, array $existants): ?string
{
    $noms = array_filter($noms);
    $inclus = fn(array $a, array $b) => !array_diff($a, $b);
    $tests = [
        fn($e, $n) => od_compact($e) !== '' && od_compact($e) === od_compact($n),          // « BON GOUT » / « BONGOUT »
        fn($e, $n) => od_mots($e) && sort_mots(od_mots($e)) === sort_mots(od_mots($n)),    // « PAUL DURAND » / « M DURAND PAUL »
        fn($e, $n) => od_mots($e) && od_mots($n) && ($inclus(od_mots($e), od_mots($n)) || $inclus(od_mots($n), od_mots($e))),
    ];
    foreach ($tests as $test) {
        $trouves = [];
        foreach ($existants as $e) {
            foreach ($noms as $n) {
                if ($test($e, $n)) {
                    $trouves[$e] = true;
                }
            }
        }
        if (count($trouves) === 1) {
            return array_key_first($trouves);
        }
        if ($trouves) {
            return null;
        }
    }
    return null;
}

function sort_mots(array $m): array
{
    sort($m);
    return $m;
}

function od_manuels(): array
{
    return lire_json(cfe_chemin('dossiers-onedrive.json'), []);
}

/** [racine {drive, id}, {nom du dossier client: id}] : dossiers clients (sauf les modèles, « 0. Modèle »…). */
function od_clients(Boite $b): array
{
    static $memo = null;
    if ($memo === null) {
        [$racine, $enfants] = sp_dossier_et_enfants($b, SP_CLIENTS);
        $clients = [];
        foreach ($enfants as $x) {
            if ($x['dossier'] && !str_starts_with($x['nom'], '0.')) {
                $clients[$x['nom']] = $x['id'];
            }
        }
        $memo = [$racine, $clients];
    }
    return $memo;
}

function od_dossier_du_client(array $d, array $clients): ?string
{
    $choisi = od_manuels()[$d['siren']] ?? null;
    return $choisi !== null && isset($clients[$choisi]) ? $choisi : od_trouver($d['noms'], array_keys($clients));
}

function od_nom_fichier(string $client, int $annee, array $avis, bool $plusieurs): string
{
    $suffixe = $plusieurs && $avis['commune'] !== '' ? ' - ' . commune_propre($avis['commune']) : '';
    return preg_replace('/[<>:"\/\\\\|?*]/', ' ', "$client AVIS CFE $annee$suffixe.pdf");
}

/** Contenu d'un dossier avec la taille des fichiers : [{nom, id, dossier, taille}]. */
function od_enfants(Boite $b, string $drive, string $id): array
{
    return array_map(fn($x) => ['nom' => $x['name'], 'id' => $x['id'], 'dossier' => isset($x['folder']), 'taille' => (int)($x['size'] ?? 0)],
        $b->pages("/drives/$drive/items/$id/children", ['$select' => 'id,name,folder,size', '$top' => '999'], 5000,
            ['refus' => SP_REFUS, 'service' => 'SharePoint']));
}

/** Dossier <année> › <sous_dossier_cfe> du client : {drive, id} ; null s'il manque (et $creer faux). Jamais le dossier client. */
function od_dossier_cfe(Boite $b, string $drive, string $id_client, int $annee, bool $creer): ?array
{
    $id = $id_client;
    foreach (array_merge([(string)$annee], OD_SOUS) as $nom) {
        $suivant = null;
        foreach (od_enfants($b, $drive, $id) as $x) {
            if ($x['dossier'] && mb_strtoupper($x['nom']) === mb_strtoupper($nom)) {
                $suivant = $x['id'];
                break;
            }
        }
        if ($suivant === null) {
            if (!$creer) {
                return null;
            }
            [$cree] = sp_sous_dossier_creer($b, ['drive' => $drive, 'id' => $id], $nom);
            $suivant = $cree['id'];
        }
        $id = $suivant;
    }
    return ['drive' => $drive, 'id' => $id];
}

/** Crée un sous-dossier (ou reprend celui qu'un collègue vient de créer). */
function sp_sous_dossier_creer(Boite $b, array $parent, string $nom): array
{
    $r = $b->appel('POST', "/drives/{$parent['drive']}/items/{$parent['id']}/children", ['json' => ['name' => $nom, 'folder' => new stdClass(),
        '@microsoft.graph.conflictBehavior' => 'fail'], 'conflit' => true, 'refus' => SP_REFUS, 'service' => 'SharePoint']);
    if ($r === false) {
        foreach (od_enfants($b, $parent['drive'], $parent['id']) as $x) {
            if ($x['dossier'] && mb_strtoupper($x['nom']) === mb_strtoupper($nom)) {
                return [['drive' => $parent['drive'], 'id' => $x['id']], false];
            }
        }
        throw new ErreurOutlook("Le dossier $nom n'a pas pu être créé dans SharePoint.");
    }
    return [['drive' => $parent['drive'], 'id' => $r['id']], true];
}

/** Contenu d'un fichier SharePoint (comparaison avec l'avis à ranger). */
function od_contenu(Boite $b, string $drive, string $id): ?string
{
    $r = $b->appel('GET', "/drives/$drive/items/$id/content", ['brut' => true, 'suivre' => true, 'refus' => SP_REFUS, 'service' => 'SharePoint']);
    return $r === null ? null : $r[0];
}

/**
 * Une ligne par avis : {cle, siren, societe, client, commune, nom, etat, a_creer}. Rien n'est écrit.
 * $dossiers : dossiers de l'année (cfe_dossiers).
 */
function od_plan(Boite $b, array $dossiers, int $annee, ?string $seulement = null): array
{
    [$racine, $clients] = od_clients($b);
    uasort($dossiers, fn($x, $y) => strcmp(mb_strtoupper($x['nom_comptazap']), mb_strtoupper($y['nom_comptazap'])));
    $trouves = array_map(fn($d) => od_dossier_du_client($d, $clients), $dossiers);
    $a_lire = [];
    foreach (array_filter($trouves) as $client) {
        $a_lire[$client] = $clients[$client];
    }
    $contenus = od_presents($b, $racine['drive'], $a_lire, $annee);
    $lignes = [];
    foreach ($dossiers as $k => $d) {
        $client = $trouves[$k];
        $presents = $client !== null ? $contenus[$client] ?? null : null;
        $cfe = $presents !== null ? ['drive' => $racine['drive'], 'id' => null, 'client' => $clients[$client]] : null;
        foreach ($d['avis'] as $a) {
            $cle = $d['siren'] . ':' . $a['reference'];
            if ($seulement !== null && $cle !== $seulement) {
                continue;
            }
            $l = ['cle' => $cle, 'siren' => $d['siren'], 'societe' => $d['nom_comptazap'], 'client' => $client, 'commune' => $a['commune'],
                'nom' => '', 'etat' => OD_COPIER, 'a_creer' => $cfe === null];
            $pdf = $a['pdf'] !== '' ? cfe_chemin('avis', $a['pdf'] . '.pdf') : '';
            if ($client === null) {
                $l['etat'] = OD_SANS_DOSSIER;
            } elseif ($pdf === '' || !is_file($pdf)) {
                $l['etat'] = OD_SANS_PDF;
            } else {
                $l['nom'] = od_nom_fichier($client, $annee, $a, count($d['avis']) > 1);
                $taille = filesize($pdf);
                // Déjà rangé : même nom et même taille, ou même contenu sous un autre nom (téléchargé seulement dans ce cas)
                $memes = array_filter($presents ?? [], fn($x) => !$x['dossier'] && $x['taille'] === $taille);
                usort($memes, fn($x, $y) => (mb_strtolower($y['nom']) === mb_strtolower($l['nom'])) <=> (mb_strtolower($x['nom']) === mb_strtolower($l['nom'])));
                foreach ($memes as $x) {
                    if (mb_strtolower($x['nom']) === mb_strtolower($l['nom']) || od_contenu($b, $racine['drive'], $x['id']) === file_get_contents($pdf)) {
                        [$l['etat'], $l['nom']] = [OD_DEJA, $x['nom']];
                        break;
                    }
                }
                if ($l['etat'] === OD_COPIER) {
                    foreach ($presents ?? [] as $x) {
                        if (mb_strtolower($x['nom']) === mb_strtolower($l['nom'])) {
                            $l['etat'] = OD_CONFLIT;
                        }
                    }
                }
            }
            $lignes[] = $l + ['pdf' => $pdf];
        }
    }
    return $lignes;
}

/**
 * Contenu du dossier <année> › <sous_dossier_cfe> de plusieurs clients en une fois (lots de 20 de l'API Graph, adressage par
 * chemin) : {nom du client: [{nom, id, dossier, taille}] ou null si le dossier n'existe pas encore}.
 */
function od_presents(Boite $b, string $drive, array $clients, int $annee): array
{
    $out = [];
    $chemin = implode('/', array_map('rawurlencode', array_merge([(string)$annee], OD_SOUS)));
    foreach (array_chunk($clients, 20, true) as $lot) {
        $requetes = [];
        $noms = array_keys($lot);
        foreach ($noms as $i => $nom) {
            $requetes[] = ['id' => (string)$i, 'method' => 'GET',
                'url' => "/drives/$drive/items/{$lot[$nom]}:/$chemin:/children?\$select=id,name,folder,size&\$top=999"];
        }
        $r = $b->appel('POST', '/$batch', ['json' => ['requests' => $requetes], 'refus' => SP_REFUS, 'service' => 'SharePoint']);
        foreach ($r['responses'] ?? [] as $rep) {
            $nom = $noms[(int)$rep['id']];
            $out[$nom] = ($rep['status'] ?? 0) === 200 ? array_map(fn($x) => ['nom' => $x['name'], 'id' => $x['id'], 'dossier' => isset($x['folder']),
                'taille' => (int)($x['size'] ?? 0)], $rep['body']['value'] ?? []) : null;
        }
    }
    return $out;
}

/** ID du dossier des avis d'un client (pour comparer les fichiers déjà présents) ; null s'il manque. */
function od_id_cfe(Boite $b, string $drive, string $id_client, int $annee): ?string
{
    $chemin = implode('/', array_map('rawurlencode', array_merge([(string)$annee], OD_SOUS)));
    $r = $b->appel('GET', "/drives/$drive/items/$id_client:/$chemin", ['params' => ['$select' => 'id'], 'refus' => SP_REFUS, 'service' => 'SharePoint']);
    return $r['id'] ?? null;
}

/** Copie un avis « à copier » (sous-dossiers créés si besoin) ; jamais de remplacement. */
function od_copier(Boite $b, array $l, int $annee): void
{
    if ($l['etat'] !== OD_COPIER) {
        throw new ErreurOutlook("{$l['societe']} : {$l['etat']}.");
    }
    [$racine, $clients] = od_clients($b);
    $cfe = od_dossier_cfe($b, $racine['drive'], $clients[$l['client']], $annee, true);
    $r = $b->appel('PUT', "/drives/{$cfe['drive']}/items/{$cfe['id']}:/" . rawurlencode($l['nom']) . ':/content', [
        'params' => ['@microsoft.graph.conflictBehavior' => 'fail'], 'binaire' => (string)file_get_contents($l['pdf']), 'conflit' => true,
        'refus' => SP_REFUS, 'service' => 'SharePoint']);
    if ($r === false) {
        throw new ErreurOutlook("{$l['nom']} : un fichier du même nom vient d'apparaître, rien n'a été remplacé.");
    }
}

/** Adresse web du dossier des avis du client (ou de son dossier, si l'année n'est pas encore créée). */
function od_lien(Boite $b, array $d, int $annee): ?string
{
    [$racine, $clients] = od_clients($b);
    $client = od_dossier_du_client($d, $clients);
    if ($client === null) {
        return null;
    }
    $id = od_id_cfe($b, $racine['drive'], $clients[$client], $annee) ?? $clients[$client];
    $r = $b->appel('GET', "/drives/{$racine['drive']}/items/$id", ['params' => ['$select' => 'webUrl'], 'refus' => SP_REFUS, 'service' => 'SharePoint']);
    return $r['webUrl'] ?? null;
}
