<?php
/**
 * Mode démo (DEMO=1, demo.bat / demo.sh) : l'outil tourne hors ligne avec des données FICTIVES.
 *
 *   - data-demo/ est rempli au premier lancement : compte « demo » / « demo », avis de CFE de l'année et de l'année d'avant
 *     (à payer, payés, prélevés, en forte hausse, à contester…), PDF d'avis fictifs, annuaire des interlocuteurs ;
 *   - Microsoft 365 (connexion, SharePoint) et Pennylane ne sont jamais appelés : les routes concernées répondent par un
 *     message clair, et toute sortie réseau est refusée (exiger_reseau, plmcp_poignee) ;
 *   - la boîte Outlook est simulée (data-demo/demo/boite.json) : envois, brouillons, suivi « Envoyé » et échanges marchent,
 *     mais aucun mail ne part.
 * Toutes les personnes, sociétés, numéros (SIREN à préfixe 000, références d'avis) et adresses ci-dessous sont inventés.
 */
declare(strict_types=1);

const DEMO_IDENTIFIANT = 'demo';
const DEMO_NOM = 'Camille Martin';
const DEMO_BOITE = 'camille.martin@example.com';
const DEMO_MESSAGE = 'Mode démo : cette fonction appelle Microsoft 365 (Outlook, OneDrive / SharePoint) ou Pennylane, elle est désactivée ici. '
    . 'Le code complet est dans src/outlook.php, src/sharepoint.php, src/cfe_onedrive.php et src/pennylane_mcp.php.';

/** SIREN fictif mais valide (clé de Luhn) : préfixe 000, jamais attribué par l'INSEE. */
function demo_siren(int $n): string
{
    $base = sprintf('000%05d', $n);
    for ($cle = 0; $cle < 10; $cle++) {
        $s = $base . $cle;
        $somme = 0;
        foreach (str_split(strrev($s)) as $i => $c) {
            $v = (int)$c * ($i % 2 ? 2 : 1);
            $somme += $v > 9 ? $v - 9 : $v;
        }
        if ($somme % 10 === 0) {
            return $s;
        }
    }
    return $base . '0';
}

/** Petit PDF d'une page (texte seul, Helvetica), marqué « fictif » : remplace le vrai avis dans la démo. */
function demo_pdf(string $titre, array $lignes): string
{
    $txt = fn(string $s) => str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], (string)mb_convert_encoding($s, 'Windows-1252', 'UTF-8'));
    $flux = "BT /F1 18 Tf 60 780 Td (" . $txt($titre) . ") Tj ET\n";
    $flux .= "BT /F1 10 Tf 60 760 Td (" . $txt('DOCUMENT FICTIF - données de démonstration, sans valeur fiscale') . ") Tj ET\n";
    $y = 720;
    foreach ($lignes as $l) {
        $flux .= "BT /F1 12 Tf 60 $y Td (" . $txt($l) . ") Tj ET\n";
        $y -= 22;
    }
    $objets = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        '<< /Length ' . strlen($flux) . " >>\nstream\n$flux\nendstream",
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
    $pdf = "%PDF-1.4\n";
    $positions = [];
    foreach ($objets as $i => $o) {
        $positions[] = strlen($pdf);
        $pdf .= ($i + 1) . " 0 obj\n$o\nendobj\n";
    }
    $xref = strlen($pdf);
    $pdf .= "xref\n0 " . (count($objets) + 1) . "\n0000000000 65535 f \n";
    foreach ($positions as $p) {
        $pdf .= sprintf("%010d 00000 n \n", $p);
    }
    return $pdf . "trailer\n<< /Size " . (count($objets) + 1) . " /Root 1 0 R >>\nstartxref\n$xref\n%%EOF\n";
}

/** Année des avis de la démo : l'année en cours à partir de septembre (avis reçus à l'automne), sinon la précédente. */
function demo_annee(): int
{
    return (int)date('Y') - ((int)date('n') < 9 ? 1 : 0);
}

/** Supprime le contenu d'un dossier de données de démo (jamais un autre dossier). */
function demo_vider(string $dossier): void
{
    if (!is_dir($dossier) || !str_contains(basename($dossier), 'demo')) {
        return;
    }
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dossier, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $f) {
        $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
    }
}

/** Remplit data-demo/ au premier lancement (ou à nouveau avec $forcer). Ne fait rien hors du mode démo. */
function demo_initialiser(bool $forcer = false): bool
{
    if (!MODE_DEMO || (!$forcer && is_file(chemin_data('comptes.json')))) {
        return false;
    }
    if ($forcer) {
        demo_vider(DATA);
    }
    sous_verrou(function () {
        $an = demo_annee();
        $prec = $an - 1;
        ecrire_json(chemin_data('comptes.json'), [DEMO_IDENTIFIANT => ['nom' => DEMO_NOM, 'hash' => password_hash('demo', PASSWORD_DEFAULT)]]);
        cle_secrete();
        ecrire_json(chemin_data('parametres.json'), ['CabinetNom' => 'Cabinet Exemple']);
        ecrire_json(cfe_chemin('parametres.json'), ['ANNEE_CFE' => (string)$an]);
        ecrire_fichier(chemin_data('signatures', DEMO_IDENTIFIANT . '.html'), '<p style="margin:0"><b>' . DEMO_NOM . '</b><br>Cabinet Exemple · '
            . 'expertise comptable<br><a href="mailto:' . DEMO_BOITE . '">' . DEMO_BOITE . '</a></p>');

        // Avis : [n, nom ComptaZap, commune, montant N, état N, montant N-1 (null : pas d'avis), mode, reste N]
        $clients = [
            [1, 'SAS ATELIER DES EXEMPLES', 'VILLE DE PARIS', 612, 'a_payer', 590, 'PAIEMENT_EN_LIGNE', null],
            [2, 'SARL BOULANGERIE DU PONT', 'LYON', 845, 'a_payer', 801, 'PRELEVEMENT_ECHEANCE', null],
            [3, 'SASU STUDIO PIXEL DEMO', 'BORDEAUX', 234, 'paye', 228, 'PAIEMENT_EN_LIGNE', null],
            [4, 'M DURAND PAUL', 'LILLE', 0, 'rien', 0, 'PAIEMENT_EN_LIGNE', null],
            [5, 'SAS LES SAVEURS IMAGINAIRES', 'MARSEILLE', 1980, 'a_payer', 640, 'PAIEMENT_EN_LIGNE', null],
            [6, 'SARL TRANSPORTS FILANTS', 'NANTES', 410, 'a_payer', 395, 'PAIEMENT_EN_LIGNE', null],
            [6, 'SARL TRANSPORTS FILANTS', 'SAINT-HERBLAIN', 275, 'a_payer', null, 'PAIEMENT_EN_LIGNE', null],
            [7, 'SCI VERGER DES TROIS POMMES', 'ANGERS', 312, 'inconnu', 305, 'PAIEMENT_EN_LIGNE', null],
            [8, 'SAS NOVA CONSEIL EXEMPLE', 'TOULOUSE', 520, 'a_payer', 498, 'PAIEMENT_EN_LIGNE', null],
            [9, 'EURL MENUISERIE BOIS FICTIF', 'RENNES', 500, 'a_payer', 470, 'PAIEMENT_EN_LIGNE', 200],
            [10, 'MME LEROY CLAIRE', 'TOURS', 380, 'a_payer', 366, 'PRELEVEMENT_MENSUEL', null],
            [11, 'SAS GREEN LOGISTIQUE DEMO', 'STRASBOURG', 690, 'a_payer', 655, 'PAIEMENT_EN_LIGNE', null],
            [13, 'SCI IMMO PATRIMOINE DEMO', 'MONTPELLIER', 470, 'a_payer', 455, 'PAIEMENT_EN_LIGNE', null],
            [14, 'SELARL CABINET KINE EXEMPLE', 'DIJON', 298, 'a_payer', 287, 'PAIEMENT_EN_LIGNE', null],
        ];
        $docs = $paiements = $dettes = [];
        $numero = 0;
        $ajouter = function (int $n, string $nom, string $commune, int $annee, int $euros, string $etat, string $mode, ?int $reste, bool $pdf = true)
            use (&$docs, &$paiements, &$dettes, &$numero) {
            $siren = demo_siren($n);
            $ref = sprintf('0000%02d%07d', $annee % 100, ++$numero);  // référence fictive (préfixe 0000)
            $sha = hash('sha256', "$siren|$ref|demo");
            $prelevement = $mode === 'PRELEVEMENT_ECHEANCE' ? "15/12/$annee" : ($mode === 'PRELEVEMENT_MENSUEL' ? "15/11/$annee" : null);
            $docs[] = ['siren' => $siren, 'client_name' => $nom, 'annee_imposition' => $annee, 'commune' => $commune, 'reference_avis' => $ref,
                'montant_du' => number_format($euros, 2, '.', ''), 'date_limite_paiement' => "15/12/$annee", 'mode_paiement' => $mode,
                'date_prelevement' => $prelevement, 'dossier_export' => "$nom - $siren",
                'pdf' => ['sha256' => $sha, 'nom' => "CFE-$annee-$commune-$ref.pdf"]];
            if ($etat === 'paye') {
                $paiements[] = ['annee' => $annee, 'reference' => "Facture n°$ref", 'payment_state' => 'PAYE', 'payment_method' => 'TELEREGLEMENT',
                    'paiement_date' => "10/11/$annee"];
            } elseif ($etat === 'a_payer' && $euros > 0) {
                $paiements[] = ['annee' => $annee, 'reference' => "Facture n°$ref", 'payment_state' => 'A_PAYER', 'payment_method' => '', 'paiement_date' => null];
                $dettes[] = ['annee' => $annee, 'impot' => 'CFE', 'reference_dette' => "Facture n°$ref", 'status' => 'ACTIVE',
                    'solde' => number_format($reste ?? $euros, 2, '.', '')];
            }
            if ($pdf) {
                ecrire_fichier(cfe_chemin('avis', "$sha.pdf"), demo_pdf("Avis de CFE $annee (exemple)", [
                    "Redevable : $nom", "SIREN : $siren", "Commune : $commune", "Référence de l'avis : $ref",
                    'Montant à payer : ' . number_format($euros, 0, ',', ' ') . ' EUR', "Date limite de paiement : 15/12/$annee"]));
            }
        };
        foreach ($clients as [$n, $nom, $commune, $euros, $etat, $avant, $mode, $reste]) {
            $ajouter($n, $nom, $commune, $an, $euros, $etat, $mode, $reste, $n !== 11);  // n° 11 : PDF pas encore reçu (à ajouter)
            if ($avant !== null) {
                $ajouter($n, $nom, $commune, $prec, $avant, $n === 13 ? 'a_payer' : ($avant ? 'paye' : 'rien'), $mode, null);  // n° 13 : N-1 encore dû
            }
        }
        ecrire_json(cfe_chemin('comptazap-' . DEMO_IDENTIFIANT . '.json'), ['recu_le' => date('Y-m-d\TH:i', strtotime('-2 days')),
            'maj_comptazap' => date('Y-m-d\TH:i', strtotime('-3 days')), 'export_comptazap' => 'C:\\Exemple\\COMPTAZAP',
            'documents' => $docs, 'paiements' => $paiements, 'dettes' => $dettes]);

        // Société créée l'an dernier, sans ComptaZap : avis saisi à la main (pas d'avis N-1)
        $saisi = saisie_avis(['societe' => 'SASU HORIZON SOFTWARE FICTIF', 'siren' => demo_siren(12), 'annee' => $an, 'commune' => 'NICE',
            'reference' => sprintf('0000%02d9000001', $an % 100), 'montant' => '227', 'date_limite' => "15/12/$an", 'paiement' => 'en ligne'], $an);
        saisie_enregistrer([$saisi]);
        ecrire_fichier(cfe_chemin('avis', $saisi[0]['pdf']['sha256'] . '.pdf'), demo_pdf("Avis de CFE $an (exemple)", [
            'Redevable : SASU HORIZON SOFTWARE FICTIF', 'SIREN : ' . demo_siren(12), 'Commune : NICE', 'Montant à payer : 227 EUR']));

        // Annuaire des interlocuteurs (comme repris de Pennylane) ; Green Logistique n'y est pas : interlocuteur à saisir
        $c = fn(string $e, string $p, string $n, string $civ, string $f = 'Vous') => ['entreprise' => $e, 'prenom' => $p, 'nom' => $n,
            'email' => strtolower(sans_accents($p)) . '.' . strtolower(sans_accents($n)) . '@example.com', 'cc' => '', 'civilite' => $civ,
            'formule' => $f, 'source' => 'Pennylane'];
        annuaire_ecrire([
            $c('Atelier des Exemples', 'Paul', 'Lemaire', 'M'), $c('Boulangerie du Pont', 'Lucie', 'Morel', 'Mme'),
            $c('Studio Pixel Demo', 'Hugo', 'Petit', 'M'), $c('Paul Durand', 'Paul', 'Durand', 'M', 'Tu'),
            $c('Les Saveurs Imaginaires', 'Inès', 'Garnier', 'Mme'), $c('Transports Filants', 'Nadia', 'Roux', 'Mme'),
            $c('Verger des Trois Pommes', 'Rémi', 'Poirier', ''), $c('Nova Conseil Exemple', 'Sarah', 'Benoit', 'Mme'),
            $c('Menuiserie Bois Fictif', 'Yves', 'Martin', 'M'), $c('Claire Leroy', 'Claire', 'Leroy', 'Mme', 'Tu'),
            $c('Horizon Software Fictif', 'Karim', 'Mercier', 'M'), $c('Immo Patrimoine Demo', 'Louis', 'Fontaine', 'M'),
        ], 'Pennylane', DEMO_NOM);
        // Interlocuteur saisi à la main (avec une copie), avis à contester, avis noté envoyé à la main
        ecrire_json(cfe_chemin('contacts-cfe.json'), [demo_siren(14) => ['prenom' => 'Aline', 'nom' => 'Masson', 'email' => 'aline.masson@example.com',
            'cc' => 'secretariat@example.com', 'civilite' => 'Mme', 'formule' => 'Vous', 'source' => 'saisi à la main']]);
        ecrire_json(cfe_chemin('contestations-cfe.json'), [(string)$an => [demo_siren(5) => ['date' => date('Y-m-d', strtotime('-1 day')),
            'commentaire' => 'Hausse de 209 % : local fermé six mois pour travaux, base à vérifier.', 'par' => DEMO_NOM]]]);
        ecrire_json(cfe_chemin('envois-cfe.json'), [(string)$an => [demo_siren(3) => date('Y-m-d', strtotime('-5 days'))]]);

        // Boîte simulée : l'avis de Nova Conseil est parti il y a 4 jours, la cliente a répondu (pas encore lu)
        $envoi = gmdate('Y-m-d\TH:i:s\Z', strtotime('-4 days 10:12'));
        $reponse = gmdate('Y-m-d\TH:i:s\Z', strtotime('-3 days 16:40'));
        $objet = "NOVA CONSEIL EXEMPLE - Avis de CFE $an";
        $sarah = ['emailAddress' => ['address' => 'sarah.benoit@example.com', 'name' => 'Sarah Benoit']];
        $moi = ['emailAddress' => ['address' => DEMO_BOITE, 'name' => DEMO_NOM]];
        ecrire_json(chemin_data('demo', 'boite.json'), ['messages' => [
            ['id' => 'demo-1', 'conversationId' => 'fil-nova', 'subject' => $objet, 'from' => $moi, 'toRecipients' => [$sarah], 'ccRecipients' => [],
                'receivedDateTime' => $envoi, 'isRead' => true, 'hasAttachments' => true, 'webLink' => '',
                'bodyPreview' => "Bonjour Madame Benoit, Vous trouverez ci-joint l'avis de cotisation foncière des entreprises (CFE) $an…",
                'texte' => "Bonjour Madame Benoit,\n\nVous trouverez ci-joint l'avis de cotisation foncière des entreprises (CFE) $an de NOVA CONSEIL EXEMPLE, d'un montant de 520 €, à régler au plus tard le 15 décembre $an.\n\nBien cordialement,\n" . DEMO_NOM],
            ['id' => 'demo-2', 'conversationId' => 'fil-nova', 'subject' => "RE: $objet", 'from' => $sarah, 'toRecipients' => [$moi], 'ccRecipients' => [],
                'receivedDateTime' => $reponse, 'isRead' => false, 'hasAttachments' => false, 'webLink' => '',
                'bodyPreview' => 'Bonjour, bien reçu, merci. Pouvez-vous me confirmer que le prélèvement se fera sur le compte pro ?',
                'texte' => "Bonjour,\n\nBien reçu, merci. Pouvez-vous me confirmer que le prélèvement se fera sur le compte professionnel ?\n\nSarah Benoit"],
        ]]);
    });
    return true;
}

// ---------- Boîte Outlook simulée (data-demo/demo/boite.json) : rien ne sort ----------
function demo_boite(): array
{
    return lire_json(chemin_data('demo', 'boite.json'), ['messages' => []]) + ['messages' => []];
}

/** Envoi (ou brouillon) simulé : un envoi est rangé dans la boîte fictive (suivi « Envoyé », échanges). */
function demo_noter_mail(array $a, string $objet, string $corps, array $cc, array $pieces, ?string $repondre_a, bool $envoye): array
{
    $id = 'demo-' . bin2hex(random_bytes(6));
    if (!$envoye) {
        return ['id' => $id, 'lien' => ''];  // brouillon : pas d'Outlook à ouvrir en démo
    }
    sous_verrou(function () use ($id, $a, $objet, $corps, $cc, $pieces, $repondre_a) {
        $b = demo_boite();
        $origine = null;
        foreach ($b['messages'] as $m) {
            if ($m['id'] === $repondre_a) {
                $origine = $m;
            }
        }
        $dest = fn(array $l) => array_map(fn($x) => ['emailAddress' => ['address' => strtolower(trim($x)), 'name' => '']], array_filter($l));
        $texte = trim(html_entity_decode(strip_tags(str_replace(['</p>', '<br>', '<br/>'], "\n", $corps)), ENT_QUOTES, 'UTF-8'));
        $b['messages'][] = ['id' => $id, 'conversationId' => $origine['conversationId'] ?? $id,
            'subject' => $origine ? 'RE: ' . preg_replace('/^(re\s*:\s*)+/i', '', $origine['subject']) : $objet,
            'from' => ['emailAddress' => ['address' => DEMO_BOITE, 'name' => DEMO_NOM]], 'toRecipients' => $dest($a), 'ccRecipients' => $dest($cc),
            'receivedDateTime' => gmdate('Y-m-d\TH:i:s\Z'), 'isRead' => true, 'hasAttachments' => (bool)$pieces, 'webLink' => '',
            'bodyPreview' => mb_substr(preg_replace('/\s+/', ' ', $texte), 0, 200), 'texte' => $texte];
        ecrire_json(chemin_data('demo', 'boite.json'), $b);
    });
    return ['id' => $id, 'lien' => ''];
}

/** Éléments envoyés simulés : [{date, objet, destinataires, lien, id}], du plus récent. */
function demo_envoyes(string $motif): array
{
    $out = [];
    foreach (demo_boite()['messages'] as $m) {
        if (adresse_graph($m['from']) === DEMO_BOITE && ($motif === '' || mb_stripos($m['subject'], $motif) !== false)) {
            $out[] = ['date' => date('Y-m-d\TH:i', strtotime($m['receivedDateTime'])), 'objet' => $m['subject'],
                'destinataires' => array_values(array_map('adresse_graph', array_merge($m['toRecipients'], $m['ccRecipients']))), 'lien' => '', 'id' => $m['id']];
        }
    }
    usort($out, fn($x, $y) => strcmp($y['date'], $x['date']));
    return $out;
}

/** Mails simulés dont l'objet contient $motif (format de Microsoft Graph), du plus ancien. */
function demo_mails_motif(string $motif): array
{
    $out = array_values(array_filter(demo_boite()['messages'], fn($m) => mb_stripos($m['subject'], $motif) !== false));
    usort($out, fn($x, $y) => strcmp($x['receivedDateTime'], $y['receivedDateTime']));
    return $out;
}

/** [texte nouveau, texte complet, lu] d'un mail simulé. */
function demo_contenu(string $mid): array
{
    foreach (demo_boite()['messages'] as $m) {
        if ($m['id'] === $mid) {
            return [$m['texte'] ?? '', $m['texte'] ?? '', !empty($m['isRead'])];
        }
    }
    return ['', '', true];
}

function demo_marquer_lu(string $mid): void
{
    sous_verrou(function () use ($mid) {
        $b = demo_boite();
        foreach ($b['messages'] as $i => $m) {
            if ($m['id'] === $mid) {
                $b['messages'][$i]['isRead'] = true;
            }
        }
        ecrire_json(chemin_data('demo', 'boite.json'), $b);
    });
}
