<?php
/**
 * Mise en forme des mails : montants, dates, noms, rapprochement des noms de sociétés, civilités, lecture des CSV.
 * Montants en CENTIMES (entiers) : aucun arrondi flottant.
 */
declare(strict_types=1);

const NBSP = "\u{a0}";
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « - 7 940,13 », « 22735 », « 1.234,5 », « 891 € » -> centimes ; vide ou illisible -> null. */
function lire_montant($texte): ?int
{
    $s = str_replace(['€', NBSP, "\u{202f}", ' '], '', trim((string)($texte ?? '')));
    if ($s === '') {
        return null;
    }
    if (str_contains($s, ',') && str_contains($s, '.')) {
        // 1.234,56 (milliers à la française) ; 1,234.56 (export à l'anglaise : la virgule vient avant le point)
        $s = strrpos($s, ',') < strrpos($s, '.') ? str_replace(',', '', $s) : str_replace('.', '', $s);
    }
    $s = str_replace(',', '.', $s);
    if (!preg_match('/^[+-]?(\d+(\.\d*)?|\.\d+)$/', $s)) {
        return null;
    }
    $negatif = str_starts_with($s, '-');
    $s = ltrim($s, '+-');
    [$e, $d] = array_pad(explode('.', $s, 2), 2, '');
    $c = (int)($e === '' ? '0' : $e) * 100 + (int)str_pad(substr($d . '00', 0, 2), 2, '0');
    if (strlen($d) > 2 && (int)$d[2] >= 5) {  // arrondi au centime le plus proche
        $c++;
    }
    return $negatif ? -$c : $c;
}

/** Centimes -> « 22 735 € », « - 7 940,13 € » (espaces insécables). $signe = false : valeur absolue. */
function euros(int $c, bool $signe = true): string
{
    $m = $signe ? $c : abs($c);
    $negatif = $m < 0;
    $m = abs($m);
    $entier = (string)intdiv($m, 100);
    $dec = str_pad((string)($m % 100), 2, '0', STR_PAD_LEFT);
    $groupes = [];
    while ($entier !== '') {
        array_unshift($groupes, substr($entier, -3));
        $entier = strlen($entier) > 3 ? substr($entier, 0, -3) : '';
    }
    $txt = implode(NBSP, $groupes) . ($dec === '00' ? '' : ',' . $dec);
    return ($negatif ? '-' . NBSP : '') . $txt . NBSP . '€';
}

/** « 2026-06-30 » -> « 30 juin 2026 » (« 1er » pour le premier du mois). */
function date_longue(?string $iso): string
{
    $d = lire_date($iso);
    if (!$d) {
        return '';
    }
    [$a, $m, $j] = array_map('intval', explode('-', $d));
    return ($j === 1 ? '1er' : $j) . ' ' . MOIS[$m - 1] . ' ' . $a;
}

/** « 15/12/2026 » -> « 2026-12-15 » ; sinon null. */
function iso_depuis_fr(?string $texte): ?string
{
    if (!preg_match('#^(\d{1,2})/(\d{1,2})/(\d{4})$#', trim((string)$texte), $m)) {
        return lire_date($texte);
    }
    return checkdate((int)$m[2], (int)$m[1], (int)$m[3]) ? sprintf('%04d-%02d-%02d', $m[3], $m[2], $m[1]) : null;
}

/** MARTIN -> Martin, DE VILLIERS -> de Villiers (les noms saisis en capitales ne restent pas en capitales). */
function nom_propre(string $nom): string
{
    if ($nom === '' || mb_strtoupper($nom) !== $nom || mb_strtolower($nom) === $nom) {
        return $nom;
    }
    $mots = array_map(fn($m) => majuscule_initiale(mb_strtolower($m)), explode(' ', $nom));
    if (count($mots) > 1) {
        $mots = array_map(fn($m) => in_array(mb_strtolower($m), ['de', 'du', 'des', "d'"], true) ? mb_strtolower($m) : $m, $mots);
    }
    return implode(' ', $mots);
}

/** ["A"] -> "A" ; ["A", "B", "C"] -> "A, B et C". */
function enumerer(array $noms): string
{
    $noms = array_values($noms);
    if (count($noms) <= 1) {
        return $noms[0] ?? '';
    }
    return implode(', ', array_slice($noms, 0, -1)) . ' et ' . end($noms);
}

const PETITS_MOTS = ['de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'en', 'et', 'd', 'l', 'aux'];

/** « VILLE DE PARIS » -> « Ville de Paris », « LEVALLOIS-PERRET » -> « Levallois-Perret », « BOIS-D'ARCY » -> « Bois-d'Arcy ». */
function commune_propre(string $commune): string
{
    $morceaux = preg_split("/([ '\\-])/u", mb_strtolower(trim($commune)), -1, PREG_SPLIT_DELIM_CAPTURE) ?: [];
    $out = '';
    foreach ($morceaux as $i => $m) {
        $out .= ($i && in_array($m, PETITS_MOTS, true)) ? $m : majuscule_initiale($m);
    }
    return $out;
}

/** Texte CSV -> lignes (tableaux de cellules). Séparateur « ; » ou « , » deviné sur la 1re ligne ; un retour à la ligne
 *  entre guillemets reste dans sa cellule (jamais une fausse ligne). Lignes vides ignorées. */
function lire_csv(string $texte, ?string $sep = null): array
{
    $texte = trim($texte);
    if ($texte === '') {
        return [];
    }
    $premiere = strtok($texte, "\r\n") ?: '';
    $sep ??= substr_count($premiere, ';') >= substr_count($premiere, ',') && str_contains($premiere, ';') ? ';' : ',';
    $f = fopen('php://temp', 'r+');
    fwrite($f, $texte);
    rewind($f);
    $out = [];
    while (($v = fgetcsv($f, null, $sep, '"', '')) !== false) {
        if ($v !== [null] && implode('', array_map('strval', $v)) !== '') {
            $out[] = array_map(fn($x) => (string)$x, $v);
        }
    }
    fclose($f);
    return $out;
}

/** Fichier reçu (CSV, ou classeur Excel .xlsx : première feuille) -> lignes de cellules (texte). */
function lire_tableau(string $octets): array
{
    if (!str_starts_with($octets, "PK\x03\x04")) {  // pas un classeur : CSV (Excel en Windows-1252, BOM… acceptés)
        return lire_csv(en_utf8($octets));
    }
    if (!class_exists('ZipArchive')) {
        throw new ErreurSaisie(['fichier' => 'Classeur Excel illisible ici (extension PHP zip absente) : enregistrez-le en CSV.']);
    }
    $tmp = tempnam(sys_get_temp_dir(), 'xlsx');
    file_put_contents($tmp, $octets);
    $z = new ZipArchive();
    if ($z->open($tmp) !== true) {
        @unlink($tmp);
        throw new ErreurSaisie(['fichier' => 'Classeur Excel illisible.']);
    }
    $xml = function (string $nom) use ($z): ?SimpleXMLElement {
        $brut = $z->getFromName($nom);
        return $brut === false ? null : (@simplexml_load_string($brut, SimpleXMLElement::class, LIBXML_NONET) ?: null);
    };
    $partages = [];
    foreach ($xml('xl/sharedStrings.xml')?->si ?? [] as $si) {  // texte d'une cellule : simple, ou en plusieurs morceaux mis en forme
        $partages[] = isset($si->t) ? (string)$si->t : implode('', array_map(fn($r) => (string)$r->t, iterator_to_array($si->r, false)));
    }
    $feuilles = [];
    for ($i = 0; $i < $z->numFiles; $i++) {
        if (preg_match('#^xl/worksheets/sheet(\d+)\.xml$#', (string)$z->getNameIndex($i), $m)) {
            $feuilles[(int)$m[1]] = $m[0];
        }
    }
    ksort($feuilles);
    $feuille = $feuilles ? $xml(reset($feuilles)) : null;
    $z->close();
    @unlink($tmp);
    $out = [];
    foreach ($feuille?->sheetData->row ?? [] as $r) {
        $ligne = [];
        foreach ($r->c as $c) {
            $col = 0;
            foreach (str_split(preg_replace('/\d+/', '', (string)$c['r'])) as $lettre) {  // « C7 » -> colonne 2
                $col = $col * 26 + ord($lettre) - 64;
            }
            $type = (string)$c['t'];
            $v = $type === 's' ? ($partages[(int)$c->v] ?? '') : ($type === 'inlineStr' ? (string)$c->is->t : (string)$c->v);
            $ligne[max(0, $col - 1)] = trim($v);
        }
        if ($ligne && implode('', $ligne) !== '') {
            $plein = array_fill(0, max(array_keys($ligne)) + 1, '');
            $out[] = array_replace($plein, $ligne);
        }
    }
    return $out;
}

/** En-tête de colonne comparable : « Montant dû (€) » -> « montant du ». */
function entete_simple(string $t): string
{
    return trim(preg_replace('/[^a-z0-9]+/', ' ', strtolower(sans_accents($t))) ?? '');
}

/** Lignes d'un tableau avec en-têtes -> [{champ: valeur}], d'après $colonnes {champ: [en-têtes acceptés]}. */
function lignes_par_colonnes(array $lignes, array $colonnes): array
{
    $entetes = array_map(fn($e) => entete_simple((string)$e), array_shift($lignes) ?? []);
    $index = [];
    foreach ($colonnes as $champ => $noms) {
        foreach ($noms as $n) {
            $i = array_search(entete_simple($n), $entetes, true);
            if ($i !== false) {
                $index[$champ] = $i;
                break;
            }
        }
    }
    return [array_map(fn($v) => array_map(fn($i) => trim((string)($v[$i] ?? '')), $index), $lignes), array_keys($index)];
}

const CIVILITES = ['M' => 'Monsieur', 'Mme' => 'Madame'];

/** Valeur brute (Pennylane : civility, gender…) -> "M", "Mme" ou "". */
function civilite_normalisee($brut): string
{
    $v = rtrim(mb_strtolower(trim((string)($brut ?? ''))), '.');
    if (in_array($v, ['m', 'mr', 'monsieur', 'male', 'man', 'homme', 'masculin', 'sir', 'mister'], true)) {
        return 'M';
    }
    if (in_array($v, ['mme', 'mrs', 'ms', 'mlle', 'miss', 'madame', 'mademoiselle', 'female', 'woman', 'femme', 'féminin', 'feminin', 'madam'], true)) {
        return 'Mme';
    }
    return '';
}

// ---------- Rapprochement des noms de sociétés (annuaire des interlocuteurs, ComptaZap) ----------
const MOTS_IGNORES = ['SAS', 'SASU', 'SARL', 'EURL', 'SA', 'SCI', 'SELARL', 'SELARLU', 'SELAS', 'SELASU', 'SNC', 'EI', 'LMNP', 'LMP',
    'INDI', 'M', 'MME', 'MR', 'STE', 'SOCIETE'];

/** Variantes comparables d'un nom : sans accents ni ponctuation ni forme juridique, ordre des mots ignoré.
 *  « ATELIER DU CENTRE ( ADC PARIS ) » donne aussi la variante « ADC PARIS ». Clés : mots triés joints par espace. */
function cles_nom(string $nom): array
{
    $cle = function (string $texte): ?string {
        $t = strtoupper(sans_accents($texte));
        $mots = array_unique(preg_split('/\s+/', trim(preg_replace('/[^A-Z0-9]+/', ' ', $t) ?? ''), -1, PREG_SPLIT_NO_EMPTY));
        $mots = array_values(array_diff($mots, MOTS_IGNORES));
        if (!$mots) {
            return null;
        }
        sort($mots);
        return implode(' ', $mots);
    };
    $variantes = [$cle($nom), $cle(preg_replace('/\(.*?\)/', ' ', $nom) ?? $nom)];
    if (preg_match_all('/\((.*?)\)/', $nom, $m)) {
        foreach ($m[1] as $partie) {
            $variantes[] = $cle($partie);
        }
    }
    return array_values(array_unique(array_filter($variantes)));
}

/** Texte en paragraphes HTML (police d'Outlook). */
function paragraphes_html(string $texte): string
{
    $blocs = preg_split('/\n\s*\n/', trim(str_replace("\r\n", "\n", $texte))) ?: [];
    return '<div style="font-family: Aptos, Calibri, Arial, sans-serif; font-size: 11pt;">'
        . implode('', array_map(fn($p) => '<p style="margin: 0 0 11pt 0;">' . nl2br(htmlspecialchars($p, ENT_QUOTES, 'UTF-8'), false) . '</p>', $blocs))
        . '</div>';
}
