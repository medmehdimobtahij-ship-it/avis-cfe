<?php
/**
 * Annuaire des interlocuteurs des clients : à qui écrire pour chaque société (prénom, nom, e-mail, civilité, vous / tu).
 * Deux sources, au choix du cabinet, rapprochées des avis par le nom de la société (cles_nom) :
 *   - Pennylane (pennylane_mcp.php) : l'interlocuteur principal de chaque dossier du cabinet, lu par petits lots ;
 *   - un fichier CSV ou Excel (colonnes : société, prénom, nom, e-mail, copie, civilité, formule ; exemples/), exporté de
 *     n'importe quel logiciel.
 * Chaque import remplace l'annuaire (data/cfe/annuaire.json). Une saisie à la main sur une ligne du tableau (contacts-cfe.json)
 * passe toujours avant l'annuaire et n'est jamais écrasée.
 */
declare(strict_types=1);

const ANNUAIRE_LOT = 16;  // dossiers Pennylane par requête : quelques secondes chacune, jamais trop longue pour l'hébergement
const ANNUAIRE_COLONNES = [
    'entreprise' => ['societe', 'société', 'entreprise', 'client', 'raison sociale', 'denomination', 'dossier'],
    'prenom' => ['prenom', 'prénom', 'first name', 'firstname'],
    'nom' => ['nom', 'nom de famille', 'last name', 'lastname', 'interlocuteur', 'contact'],
    'email' => ['email', 'e mail', 'mail', 'adresse mail', 'adresse e mail', 'courriel'],
    'cc' => ['cc', 'copie', 'en copie', 'copie a', 'e mail en copie'],
    'civilite' => ['civilite', 'civilité', 'titre', 'genre'],
    'formule' => ['formule', 'vous tu', 'tutoiement'],
];
define('CABINET_PENNYLANE', reglage('cabinet_pennylane'));  // identifiant du cabinet dans Pennylane (firm_id)

function annuaire_chemin(string $f = 'annuaire.json'): string
{
    return cfe_chemin($f);
}

/** {contacts: [{entreprise, prenom, nom, email, civilite, formule, source}], source, maj, par} */
function annuaire_lire(): array
{
    $a = lire_json(annuaire_chemin(), []);
    return ['contacts' => $a['contacts'] ?? [], 'source' => (string)($a['source'] ?? ''), 'maj' => (string)($a['maj'] ?? ''),
        'par' => (string)($a['par'] ?? '')];
}

function annuaire_ecrire(array $contacts, string $source, string $par): void
{
    ecrire_json(annuaire_chemin(), ['contacts' => array_values($contacts), 'source' => $source, 'maj' => maintenant_minutes(), 'par' => $par]);
}

/** Pour l'interface : nombre de contacts, source, date, et l'état de la connexion Pennylane. */
function annuaire_etat(): array
{
    $a = annuaire_lire();
    return ['contacts' => count($a['contacts']), 'source' => $a['source'], 'maj' => $a['maj'], 'par' => $a['par'],
        'pennylane' => plmcp_etat() + ['cabinet' => CABINET_PENNYLANE !== '']];
}

/** Fichier d'interlocuteurs (CSV ou Excel) : remplace l'annuaire. {contacts, ignores}. */
function annuaire_importer(string $octets, string $par): array
{
    [$lignes, $trouvees] = lignes_par_colonnes(lire_tableau($octets), ANNUAIRE_COLONNES);
    if (!in_array('entreprise', $trouvees, true) || !array_intersect(['email', 'nom'], $trouvees)) {
        throw new ErreurSaisie(['fichier' => 'Colonnes attendues : société, et e-mail ou nom (en-têtes en première ligne).']);
    }
    $contacts = [];
    $ignores = 0;
    foreach ($lignes as $l) {
        $email = mb_strtolower(trim($l['email'] ?? ''));
        if (($l['entreprise'] ?? '') === '' || ($email === '' && ($l['nom'] ?? '') === '') || ($email !== '' && !str_contains($email, '@'))) {
            $ignores++;
            continue;
        }
        $formule = entete_simple($l['formule'] ?? '');
        $contacts[] = ['entreprise' => mb_substr($l['entreprise'], 0, 120), 'prenom' => mb_substr($l['prenom'] ?? '', 0, 60),
            'nom' => mb_substr($l['nom'] ?? '', 0, 60), 'email' => mb_substr($email, 0, 120), 'cc' => mb_substr(mb_strtolower($l['cc'] ?? ''), 0, 250), 'civilite' => civilite_normalisee($l['civilite'] ?? ''),
            'formule' => in_array($formule, ['tu', 'tutoiement', 'oui'], true) ? 'Tu' : 'Vous', 'source' => 'fichier'];
    }
    sous_verrou(fn() => annuaire_ecrire($contacts, 'fichier', $par));
    return ['contacts' => count($contacts), 'ignores' => $ignores];
}

// ---------- Pennylane : interlocuteur principal de chaque dossier, par petits lots pilotés par l'interface ----------

/** 1re étape : dossiers du cabinet dans Pennylane. {id, total} */
function annuaire_synchro_debut(string $par): array
{
    if (CABINET_PENNYLANE === '') {
        throw new ErreurPennylane('Identifiant du cabinet dans Pennylane absent : réglage « cabinet_pennylane » (config.json).');
    }
    $mcp = new McpPennylane();
    $dossiers = [];
    for ($page = 1; $page <= 50; $page++) {
        $r = $mcp->appeler('list_companies', ['firm_id' => (int)CABINET_PENNYLANE, 'page' => $page]);
        $liste = is_array($r) ? ($r['companies'] ?? []) : [];
        foreach ($liste as $d) {
            if (!empty($d['id'])) {
                $dossiers[(string)$d['id']] = ['id' => (string)$d['id'], 'nom' => trim((string)($d['name'] ?? ''))];
            }
        }
        if (count($liste) < 100) {
            break;
        }
    }
    if (!$dossiers) {
        throw new ErreurPennylane('Aucun dossier du cabinet lu dans Pennylane : le compte connecté a-t-il accès au cabinet ?');
    }
    $etat = ['id' => uuid_hex(), 'par' => $par, 'dossiers' => array_values($dossiers), 'fait' => 0, 'contacts' => [], 'non_lus' => []];
    sous_verrou(fn() => ecrire_json(annuaire_chemin('synchro-en-cours.json'), $etat, false));
    return ['id' => $etat['id'], 'total' => count($dossiers)];
}

/** Étape suivante : interlocuteur principal d'un lot de dossiers. Au dernier lot, l'annuaire est remplacé. */
function annuaire_synchro_lot(string $id): array
{
    $etat = lire_json(annuaire_chemin('synchro-en-cours.json'), null);
    if (!$etat || ($etat['id'] ?? '') !== $id) {
        arret(409, 'Une autre synchro a été lancée entre-temps : elle continue de son côté.');
    }
    $lot = array_slice($etat['dossiers'], $etat['fait'], ANNUAIRE_LOT);
    $fiches = (new McpPennylane())->plusieurs(array_map(fn($d) => ['run_operations', ['operation_id' => 'getDashboardFirmSidepanelsCompany',
        'path_params' => ['firm_id' => (int)CABINET_PENNYLANE, 'id' => (int)$d['id']]]], $lot));
    foreach ($lot as $i => $d) {
        $f = $fiches[$i] ?? null;
        $c = !($f instanceof Throwable) && is_array($f) ? ($f['main_contact'] ?? null) : null;
        if ($f instanceof Throwable) {
            $etat['non_lus'][] = $d['nom'];
        }
        if (is_array($c) && (trim((string)($c['email'] ?? '')) !== '' || trim((string)($c['last_name'] ?? '')) !== '')) {
            $etat['contacts'][] = ['entreprise' => $d['nom'], 'prenom' => trim((string)($c['first_name'] ?? '')), 'nom' => trim((string)($c['last_name'] ?? '')),
                'email' => mb_strtolower(trim((string)($c['email'] ?? ''))), 'civilite' => civilite_normalisee($c['civility'] ?? $c['gender'] ?? ''),
                'formule' => 'Vous', 'source' => 'Pennylane', 'pennylane' => $d['id']];
        }
    }
    $etat['fait'] += count($lot);
    $total = count($etat['dossiers']);
    return sous_verrou(function () use ($etat, $total) {
        $deja = lire_json(annuaire_chemin('synchro-en-cours.json'), null);
        if (($deja['id'] ?? '') !== $etat['id']) {
            arret(409, 'Une autre synchro a été lancée entre-temps : elle continue de son côté.');
        }
        if ($etat['fait'] < $total) {
            ecrire_json(annuaire_chemin('synchro-en-cours.json'), $etat, false);
            return ['fait' => $etat['fait'], 'total' => $total, 'fini' => false];
        }
        annuaire_ecrire($etat['contacts'], 'Pennylane', $etat['par']);
        @unlink(annuaire_chemin('synchro-en-cours.json'));
        return ['fait' => $total, 'total' => $total, 'fini' => true, 'contacts' => count($etat['contacts']), 'non_lus' => $etat['non_lus']];
    });
}
