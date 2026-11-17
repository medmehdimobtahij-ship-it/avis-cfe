<?php
/**
 * Avis de CFE sans ComptaZap : saisis à la main, ou importés d'un fichier (CSV ou Excel, voir exemples/avis-cfe-exemple.csv).
 * Ils sont rangés dans data/cfe/avis-saisis.json, communs au cabinet, sous la même forme que les données de ComptaZap
 * (documents, paiements, dettes) : le reste de l'outil (statut, mails, rangement) ne voit pas la différence.
 *
 * Colonnes reconnues (en-têtes souples, accents et majuscules ignorés) : société, SIREN, année, commune, référence, montant,
 * date limite, paiement (« en ligne », « prélèvement », « prélèvement mensuel »), date de prélèvement, statut (« à payer »,
 * « payé »), reste à payer. Seuls société, SIREN et montant sont obligatoires.
 */
declare(strict_types=1);

const SAISIE_COLONNES = [
    'societe' => ['societe', 'société', 'client', 'entreprise', 'raison sociale', 'denomination', 'nom'],
    'siren' => ['siren', 'siret', 'n siren'],
    'annee' => ['annee', 'année', 'annee d imposition', 'année d imposition', 'exercice'],
    'commune' => ['commune', 'ville', 'lieu d imposition'],
    'reference' => ['reference', 'référence', 'reference avis', 'référence de l avis', 'reference de l avis', 'numero avis', 'n avis'],
    'montant' => ['montant', 'montant du', 'montant dû', 'montant a payer', 'montant à payer', 'cfe', 'total'],
    'date_limite' => ['date limite', 'date limite de paiement', 'echeance', 'échéance', 'a payer avant le'],
    'paiement' => ['paiement', 'mode de paiement', 'mode paiement', 'mode'],
    'date_prelevement' => ['date de prelevement', 'date de prélèvement', 'prelevement le', 'date prelevement'],
    'statut' => ['statut', 'etat', 'état', 'statut paiement', 'etat du paiement'],
    'reste' => ['reste', 'reste du', 'reste dû', 'reste a payer', 'reste à payer', 'solde'],
];

function saisie_chemin(): string
{
    return cfe_chemin('avis-saisis.json');
}

/** {documents, paiements, dettes} des avis saisis ou importés d'un fichier. */
function saisie_lire(): array
{
    $d = lire_json(saisie_chemin(), []);
    return ['documents' => $d['documents'] ?? [], 'paiements' => $d['paiements'] ?? [], 'dettes' => $d['dettes'] ?? []];
}

/** Date d'un fichier : « 15/12/2026 », « 2026-12-15 » ou nombre de jours d'Excel (46371) -> « 15/12/2026 » ; '' si illisible. */
function saisie_date(string $v): string
{
    $v = trim($v);
    if (preg_match('/^\d{5}(\.\d+)?$/', $v)) {  // date Excel : jours depuis le 30/12/1899
        return date('d/m/Y', strtotime('1899-12-30 12:00 +' . (int)$v . ' days'));
    }
    $iso = iso_depuis_fr($v);
    return $iso ? date('d/m/Y', strtotime($iso)) : '';
}

/**
 * Un avis saisi -> [document, paiement ou null, dette ou null] au format de ComptaZap ; lève ErreurSaisie si un champ manque.
 * Statut : « payé » -> paiement PAYE ; sinon une dette ouverte (reste à payer, ou le montant) ; montant à 0 : rien à payer.
 */
function saisie_avis(array $x, int $annee_defaut): array
{
    $champs = [];
    $societe = mb_substr(trim((string)($x['societe'] ?? '')), 0, 120);
    $siren = substr(preg_replace('/\D/', '', (string)($x['siren'] ?? '')) ?? '', 0, 9);
    $montant = lire_montant((string)($x['montant'] ?? ''));
    $annee = (int)(preg_replace('/\D/', '', (string)($x['annee'] ?? '')) ?: $annee_defaut);
    if ($societe === '') {
        $champs['societe'] = 'Société obligatoire.';
    }
    if (strlen($siren) !== 9) {
        $champs['siren'] = 'SIREN sur 9 chiffres.';
    }
    if ($montant === null || $montant < 0) {
        $champs['montant'] = 'Montant de l\'avis obligatoire (0 si rien à payer).';
    }
    if ($annee < 2000 || $annee > 2100) {
        $champs['annee'] = 'Année sur 4 chiffres.';
    }
    if ($champs) {
        throw new ErreurSaisie($champs);
    }
    $commune = mb_strtoupper(mb_substr(trim((string)($x['commune'] ?? '')), 0, 80));
    $ref = preg_replace('/[^A-Za-z0-9]/', '', (string)($x['reference'] ?? '')) ?: sprintf('%u', crc32("$siren|$annee|$commune"));
    if (chiffres($ref) === '') {  // paiement et dette se retrouvent par les chiffres de la référence
        $ref .= sprintf('%u', crc32($ref));
    }
    $mode = entete_simple((string)($x['paiement'] ?? ''));
    $mode = str_contains($mode, 'prelev') ? (str_contains($mode, 'mens') ? 'PRELEVEMENT_MENSUEL' : 'PRELEVEMENT_ECHEANCE') : 'PAIEMENT_EN_LIGNE';
    $limite = saisie_date((string)($x['date_limite'] ?? '')) ?: "15/12/$annee";
    $prelevement = saisie_date((string)($x['date_prelevement'] ?? ''));
    $doc = ['siren' => $siren, 'client_name' => $societe, 'annee_imposition' => $annee, 'commune' => $commune, 'reference_avis' => $ref,
        'montant_du' => number_format($montant / 100, 2, '.', ''), 'date_limite_paiement' => $limite, 'mode_paiement' => $mode,
        'date_prelevement' => $prelevement ?: null, 'dossier_export' => '', 'source' => 'saisie',
        'pdf' => ['sha256' => hash('sha256', "$siren|$ref|saisie"), 'nom' => "CFE-$annee" . ($commune !== '' ? "-$commune" : '') . "-$ref.pdf"]];
    $statut = entete_simple((string)($x['statut'] ?? ''));
    $reste = lire_montant((string)($x['reste'] ?? ''));
    if (!$montant) {
        return [$doc, null, null];
    }
    if (str_starts_with($statut, 'paye') || str_starts_with($statut, 'regle') || $reste === 0) {
        return [$doc, ['annee' => $annee, 'reference' => $ref, 'payment_state' => 'PAYE', 'payment_method' => '', 'paiement_date' => null], null];
    }
    $solde = $reste !== null && $reste > 0 ? min($reste, $montant) : $montant;
    return [$doc, null, ['annee' => $annee, 'impot' => 'CFE', 'reference_dette' => $ref, 'status' => 'ACTIVE',
        'solde' => number_format($solde / 100, 2, '.', '')]];
}

/** Ajoute ou remplace des avis (même année, même SIREN, même référence : remplacé). $lignes : [[document, paiement, dette]]. */
function saisie_enregistrer(array $lignes): void
{
    sous_verrou(function () use ($lignes) {
        $s = saisie_lire();
        foreach ($lignes as [$doc, $paiement, $dette]) {
            $s = saisie_retirer($s, (int)$doc['annee_imposition'], $doc['siren'], $doc['reference_avis']);
            $s['documents'][] = $doc;
            if ($paiement) {
                $s['paiements'][] = $paiement;
            }
            if ($dette) {
                $s['dettes'][] = $dette;
            }
        }
        ecrire_json(saisie_chemin(), $s);
    });
}

/** $s sans l'avis (année, SIREN, référence), ni son paiement, ni sa dette. */
function saisie_retirer(array $s, int $annee, string $siren, string $ref): array
{
    $c = chiffres($ref);
    $s['documents'] = array_values(array_filter($s['documents'], fn($d) => !((int)$d['annee_imposition'] === $annee && $d['siren'] === $siren
        && chiffres((string)$d['reference_avis']) === $c)));
    $reste = array_filter($s['documents'], fn($d) => (int)$d['annee_imposition'] === $annee && chiffres((string)$d['reference_avis']) === $c);
    if (!$reste) {  // plus aucun avis de cette référence cette année : son paiement et sa dette partent aussi
        $s['paiements'] = array_values(array_filter($s['paiements'], fn($p) => !((int)$p['annee'] === $annee && chiffres((string)$p['reference']) === $c)));
        $s['dettes'] = array_values(array_filter($s['dettes'], fn($d) => !((int)$d['annee'] === $annee && chiffres((string)$d['reference_dette']) === $c)));
    }
    return $s;
}

function saisie_supprimer(int $annee, string $siren, string $ref): bool
{
    return sous_verrou(function () use ($annee, $siren, $ref) {
        $s = saisie_lire();
        $avant = count($s['documents']);
        $s = saisie_retirer($s, $annee, $siren, $ref);
        ecrire_json(saisie_chemin(), $s);
        return count($s['documents']) < $avant;
    });
}

/** Fichier d'avis (CSV ou Excel) : {avis, erreurs [« ligne n : … »], pdfs_manquants}. Une ligne fausse n'empêche pas les autres. */
function saisie_importer(string $octets, int $annee_defaut): array
{
    [$lignes, $trouvees] = lignes_par_colonnes(lire_tableau($octets), SAISIE_COLONNES);
    foreach (['societe', 'siren', 'montant'] as $obligatoire) {
        if (!in_array($obligatoire, $trouvees, true)) {
            throw new ErreurSaisie(['fichier' => "Colonne « $obligatoire » introuvable : voir le fichier d'exemple (en-têtes en première ligne)."]);
        }
    }
    $bons = $erreurs = [];
    foreach ($lignes as $i => $l) {
        if (implode('', $l) === '') {
            continue;
        }
        try {
            $bons[] = saisie_avis($l, $annee_defaut);
        } catch (ErreurSaisie $e) {
            $erreurs[] = 'ligne ' . ($i + 2) . ' : ' . implode(' ', $e->champs);
        }
    }
    if ($bons) {
        saisie_enregistrer($bons);
    }
    return ['avis' => count($bons), 'erreurs' => array_slice($erreurs, 0, 30), 'pdfs_manquants' => cfe_pdfs_manquants()];
}
