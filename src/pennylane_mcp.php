<?php
/**
 * Pennylane lu directement par le site, par le serveur MCP officiel de Pennylane (mcp.pennylane.com) : sert ici à reprendre
 * l'interlocuteur principal de chaque dossier client (annuaire des interlocuteurs, cfe_annuaire.php).
 *
 * - Connexion une seule fois pour le cabinet (« Connecter Pennylane ») : OAuth avec PKCE ; le site s'enregistre lui-même
 *   auprès de Pennylane (enregistrement dynamique). Jetons chiffrés dans data/pennylane-mcp.json, renouvelés tout seuls.
 * - Appels JSON-RPC (« streamable HTTP ») ; plusieurs dossiers lus en parallèle (curl_multi).
 * AVIS_PL_MCP : autre adresse (tests, faux Pennylane local).
 */
declare(strict_types=1);

define('PL_MCP', rtrim(getenv('AVIS_PL_MCP') ?: 'https://mcp.pennylane.com', '/'));
const PL_MCP_PORTEE = 'openid mcp:companies:read mcp:private_api';
const PL_MCP_PARALLELE = 8;       // appels simultanés vers Pennylane
const PL_MCP_PROTOCOLE = '2025-06-18';
const PL_MCP_MESSAGES = [
    'refuse' => 'Accès refusé dans Pennylane : rien n\'a changé.',
    'expire' => 'La connexion à Pennylane a expiré : recommencez (Paramètres › CFE › Connecter Pennylane).',
    'inscription' => 'Pennylane n\'a pas accepté d\'enregistrer l\'application : importez les interlocuteurs par un fichier CSV en attendant.',
    'erreur' => 'Pennylane n\'a pas pu confirmer la connexion : réessayez.',
];

class ErreurPennylane extends Exception
{
}

final class ErreurMcp extends ErreurPennylane
{
    public function __construct(string $message, public string $code_retour = 'erreur')
    {
        parent::__construct($message);
    }
}

function plmcp_b64url(string $octets): string
{
    return rtrim(strtr(base64_encode($octets), '+/', '-_'), '=');
}

// ---------- Jetons (chiffrés sur disque) ----------
/** {clients: {adresse de retour: {id, secret}}, client, access, refresh, expire, compte, par, le} */
function plmcp_lire(): array
{
    $p = lire_json(chemin_data('pennylane-mcp.json'), []);
    foreach (['access', 'refresh'] as $k) {
        $p[$k] = isset($p[$k]) ? (dechiffrer((string)$p[$k], 'pennylane-mcp') ?? '') : '';
    }
    foreach ($p['clients'] ?? [] as $r => $c) {
        $p['clients'][$r]['secret'] = dechiffrer((string)($c['secret'] ?? ''), 'pennylane-mcp') ?? '';
    }
    return $p;
}

function plmcp_ecrire(array $p): void
{
    foreach (['access', 'refresh'] as $k) {
        if (($p[$k] ?? '') !== '') {
            $p[$k] = chiffrer($p[$k], 'pennylane-mcp');
        } else {
            unset($p[$k]);
        }
    }
    foreach ($p['clients'] ?? [] as $r => $c) {
        $p['clients'][$r]['secret'] = chiffrer((string)($c['secret'] ?? ''), 'pennylane-mcp');
    }
    ecrire_json(chemin_data('pennylane-mcp.json'), $p);
}

/** Pour l'interface : jamais de jeton, seulement qui est connecté et depuis quand. */
function plmcp_etat(): array
{
    $p = plmcp_lire();
    return ['connecte' => ($p['refresh'] ?? '') !== '' || (($p['access'] ?? '') !== '' && ($p['expire'] ?? 0) > time()),
        'compte' => (string)($p['compte'] ?? ''), 'par' => (string)($p['par'] ?? ''), 'le' => (string)($p['le'] ?? ''),
        'perdu' => (string)($p['perdu'] ?? '')];
}

// ---------- HTTP ----------
function plmcp_poignee(string $methode, string $url, array $entetes, ?string $corps, int $delai)
{
    if (MODE_DEMO) {  // démo hors ligne : aucune requête ne sort, quoi qu'il arrive
        throw new ErreurPennylane(DEMO_MESSAGE);
    }
    if (!function_exists('curl_init')) {
        throw new ErreurPennylane('Extension PHP curl manquante : activez-la (php.ini : extension=curl) pour Pennylane.');
    }
    $c = curl_init($url);
    curl_setopt_array($c, [CURLOPT_CUSTOMREQUEST => $methode, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $delai,
        CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_HTTPHEADER => $entetes, CURLOPT_USERAGENT => 'AvisCFE/1.0', CURLOPT_HEADER => true]);
    if ($corps !== null) {
        curl_setopt($c, CURLOPT_POSTFIELDS, $corps);
    }
    return $c;
}

/** [code HTTP, en-têtes (dernier bloc), corps, erreur réseau] */
function plmcp_reponse($c, $brut): array
{
    $code = (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
    $taille = (int)curl_getinfo($c, CURLINFO_HEADER_SIZE);
    $err = curl_error($c);
    if (!is_string($brut)) {
        return [0, '', '', $err ?: 'pas de réponse'];
    }
    return [$code, substr($brut, 0, $taille), substr($brut, $taille), ''];
}

function plmcp_http(string $methode, string $url, array $entetes = [], ?string $corps = null, int $delai = 45): array
{
    $c = plmcp_poignee($methode, $url, $entetes, $corps, $delai);
    $r = plmcp_reponse($c, curl_exec($c));
    curl_close($c);
    return $r;
}

// ---------- Connexion OAuth ----------
function plmcp_retour(): string
{
    return origine() . '/api/pennylane/retour';
}

/** Client OAuth du site pour cette adresse de retour : enregistré une fois auprès de Pennylane, puis réutilisé. */
function plmcp_client(string $retour): array
{
    $p = plmcp_lire();
    if (!empty($p['clients'][$retour]['id'])) {
        return $p['clients'][$retour];
    }
    [$code, , $texte, $err] = plmcp_http('POST', PL_MCP . '/oauth/register', ['Content-Type: application/json', 'Accept: application/json'],
        json_encode(['client_name' => 'Avis de CFE', 'redirect_uris' => [$retour], 'grant_types' => ['authorization_code', 'refresh_token'],
            'response_types' => ['code'], 'token_endpoint_auth_method' => 'client_secret_post', 'scope' => PL_MCP_PORTEE], JSON_UNESCAPED_SLASHES));
    $r = json_decode($texte, true);
    if ($code < 200 || $code >= 300 || empty($r['client_id'])) {
        error_log("Avis de CFE, enregistrement Pennylane refusé ($code $err) : " . mb_substr($texte, 0, 300));
        throw new ErreurMcp(PL_MCP_MESSAGES['inscription'], 'inscription');
    }
    $c = ['id' => (string)$r['client_id'], 'secret' => (string)($r['client_secret'] ?? '')];
    sous_verrou(function () use ($retour, $c) {
        $p = plmcp_lire();
        $p['clients'][$retour] = $c;
        plmcp_ecrire($p);
    });
    return $c;
}

function nom_cookie_pennylane(): string
{
    return en_https() ? '__Host-avis_pl' : 'avis_pl';
}

/** Adresse de la page Pennylane où la personne autorise l'application. La connexion en cours est liée à ce navigateur (cookie). */
function plmcp_demarrer(string $identifiant, string $nom): string
{
    foreach (glob(chemin_data('connexions-pennylane', '*.json')) ?: [] as $f) {  // ménage : connexions abandonnées
        if (filemtime($f) < time() - 3600) {
            @unlink($f);
        }
    }
    $retour = plmcp_retour();
    $client = plmcp_client($retour);
    $etat = bin2hex(random_bytes(16));
    $lien = bin2hex(random_bytes(32));
    $verificateur = plmcp_b64url(random_bytes(32));
    ecrire_json(chemin_data('connexions-pennylane', "$etat.json"), ['identifiant' => $identifiant, 'nom' => $nom, 'retour' => $retour,
        'verificateur' => $verificateur, 'lien' => hash('sha256', $lien), 'expire' => time() + 900], false);
    setcookie(nom_cookie_pennylane(), $lien, ['expires' => time() + 900, 'path' => '/', 'secure' => en_https(), 'httponly' => true, 'samesite' => 'Lax']);
    return PL_MCP . '/oauth/authorize?' . http_build_query(['response_type' => 'code', 'client_id' => $client['id'], 'redirect_uri' => $retour,
        'scope' => PL_MCP_PORTEE, 'state' => $etat, 'code_challenge' => plmcp_b64url(hash('sha256', $verificateur, true)),
        'code_challenge_method' => 'S256', 'resource' => PL_MCP . '/mcp']);
}

/** Jetons demandés à Pennylane (code d'autorisation ou renouvellement). */
function plmcp_jetons(array $formulaire, array $client): array
{
    [$code, , $texte, $err] = plmcp_http('POST', PL_MCP . '/oauth/token', ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json'],
        http_build_query($formulaire + ['client_id' => $client['id'], 'client_secret' => $client['secret']]));
    $r = json_decode($texte, true);
    if ($code !== 200 || empty($r['access_token'])) {
        error_log("Avis de CFE, jetons Pennylane refusés ($code $err) : " . mb_substr($texte, 0, 300));
        $perdu = in_array($r['error'] ?? '', ['invalid_grant', 'invalid_client', 'unauthorized_client'], true);
        throw new ErreurMcp($perdu ? 'perdu' : ($code === 0 ? "Pennylane injoignable ($err)." : "Pennylane refuse la connexion ($code)."), $perdu ? 'perdu' : 'erreur');
    }
    return $r;
}

/** Retour de la page Pennylane : vérifie la connexion en cours, garde les jetons. Usage unique. */
function plmcp_terminer(array $q): void
{
    $etat = (string)($q['state'] ?? '');
    $fichier = chemin_data('connexions-pennylane', (preg_match('/^[0-9a-f]{32}$/', $etat) ? $etat : 'x') . '.json');
    $flux = lire_json($fichier, null);
    @unlink($fichier);
    $lien = (string)($_COOKIE[nom_cookie_pennylane()] ?? '');
    setcookie(nom_cookie_pennylane(), '', ['expires' => 1, 'path' => '/', 'secure' => en_https(), 'httponly' => true, 'samesite' => 'Lax']);
    if (!$flux || $flux['expire'] < time() || $lien === '' || !hash_equals($flux['lien'], hash('sha256', $lien))) {
        throw new ErreurMcp(PL_MCP_MESSAGES['expire'], 'expire');
    }
    if (isset($q['error'])) {
        throw new ErreurMcp(PL_MCP_MESSAGES['refuse'], $q['error'] === 'access_denied' ? 'refuse' : 'erreur');
    }
    $client = plmcp_client($flux['retour']);
    try {
        $r = plmcp_jetons(['grant_type' => 'authorization_code', 'code' => (string)($q['code'] ?? ''), 'redirect_uri' => $flux['retour'],
            'code_verifier' => $flux['verificateur']], $client);
    } catch (ErreurMcp $e) {
        throw new ErreurMcp(PL_MCP_MESSAGES['erreur'], 'erreur');
    }
    $compte = '';  // qui a autorisé l'accès (affiché dans Paramètres) : facultatif
    [$code, , $texte] = plmcp_http('GET', PL_MCP . '/oauth/userinfo', ['Authorization: Bearer ' . $r['access_token'], 'Accept: application/json'], null, 15);
    $u = $code === 200 ? json_decode($texte, true) : null;
    if (is_array($u)) {
        $compte = trim(trim(($u['first_name'] ?? '') . ' ' . ($u['last_name'] ?? '')) . (!empty($u['email']) ? " ({$u['email']})" : ''));
    }
    sous_verrou(function () use ($r, $flux, $compte) {
        $p = plmcp_lire();
        unset($p['perdu']);
        plmcp_ecrire(array_merge($p, ['client' => $flux['retour'], 'access' => (string)$r['access_token'], 'refresh' => (string)($r['refresh_token'] ?? ''),
            'expire' => time() + (int)($r['expires_in'] ?? 3600), 'compte' => $compte, 'par' => $flux['nom'], 'le' => maintenant_minutes()]));
    });
}

/** Jeton d'accès valable (renouvelé si besoin, une seule requête à la fois : Pennylane change aussi le jeton de renouvellement). */
function plmcp_jeton(bool $forcer = false): string
{
    $pas_connecte = 'Pennylane n\'est pas connecté au site : Paramètres › CFE › Connecter Pennylane (une seule fois pour le cabinet).';
    $p = plmcp_lire();
    if (!$forcer && ($p['access'] ?? '') !== '' && ($p['expire'] ?? 0) > time() + 60) {
        return $p['access'];
    }
    $ancien = $p['access'] ?? '';
    return sous_verrou(function () use ($forcer, $ancien, $pas_connecte) {
        $p = plmcp_lire();
        if ($p['access'] !== '' && $p['access'] !== $ancien && ($p['expire'] ?? 0) > time() + 60) {
            return $p['access'];  // renouvelé entre-temps par une autre requête
        }
        if (($p['refresh'] ?? '') === '' || empty($p['clients'][$p['client'] ?? ''])) {
            if (!$forcer && $p['access'] !== '' && ($p['expire'] ?? 0) > time()) {
                return $p['access'];
            }
            throw new ErreurMcp($pas_connecte, 'connecter');
        }
        try {
            $r = plmcp_jetons(['grant_type' => 'refresh_token', 'refresh_token' => $p['refresh']], $p['clients'][$p['client']]);
        } catch (ErreurMcp $e) {
            if ($e->code_retour !== 'perdu') {
                throw $e;
            }
            $p['access'] = $p['refresh'] = '';
            $p['perdu'] = maintenant_minutes();
            plmcp_ecrire($p);
            throw new ErreurMcp('L\'accès à Pennylane a expiré ou a été retiré : reconnectez Pennylane (Paramètres › CFE › Connecter Pennylane).', 'connecter');
        }
        $p['access'] = (string)$r['access_token'];
        $p['refresh'] = (string)($r['refresh_token'] ?? $p['refresh']);
        $p['expire'] = time() + (int)($r['expires_in'] ?? 3600);
        plmcp_ecrire($p);
        return $p['access'];
    });
}

function plmcp_deconnecter(): void
{
    $p = plmcp_lire();
    $client = $p['clients'][$p['client'] ?? ''] ?? null;
    if ($client && ($p['refresh'] ?? '') !== '') {  // l'accès est aussi retiré chez Pennylane (sans attendre : rien de bloquant)
        plmcp_http('POST', PL_MCP . '/oauth/revoke', ['Content-Type: application/x-www-form-urlencoded'],
            http_build_query(['token' => $p['refresh'], 'token_type_hint' => 'refresh_token', 'client_id' => $client['id'], 'client_secret' => $client['secret']]), 10);
    }
    sous_verrou(function () {
        $p = plmcp_lire();
        foreach (['access', 'refresh', 'expire', 'compte', 'par', 'le', 'perdu', 'client'] as $k) {
            unset($p[$k]);
        }
        plmcp_ecrire($p);  // le client OAuth est gardé : une reconnexion ne réenregistre rien
    });
}

// ---------- Appels MCP ----------
final class McpPennylane
{
    private ?string $session = null;
    private string $version = PL_MCP_PROTOCOLE;
    private bool $pret = false;
    private int $numero = 0;

    private function entetes(string $jeton): array
    {
        $e = ['Authorization: Bearer ' . $jeton, 'Content-Type: application/json', 'Accept: application/json, text/event-stream'];
        if ($this->pret) {
            $e[] = 'MCP-Protocol-Version: ' . $this->version;
        }
        if ($this->session !== null) {
            $e[] = 'Mcp-Session-Id: ' . $this->session;
        }
        return $e;
    }

    /** Réponse JSON-RPC, en JSON simple ou en flux SSE (« data: {…} »). */
    private static function lire(string $entetes, string $texte): ?array
    {
        if (preg_match('/^content-type:\s*text\/event-stream/im', $entetes)) {
            foreach (preg_split('/\r?\n\r?\n/', $texte) as $evenement) {
                $data = '';
                foreach (preg_split('/\r?\n/', $evenement) as $l) {
                    if (str_starts_with($l, 'data:')) {
                        $data .= ltrim(substr($l, 5));
                    }
                }
                $j = json_decode($data, true);
                if (is_array($j) && (isset($j['result']) || isset($j['error']))) {
                    return $j;
                }
            }
            return null;
        }
        $j = json_decode($texte, true);
        return is_array($j) ? $j : null;
    }

    /** Contenu d'un résultat d'outil : structuredContent, sinon le texte (JSON) renvoyé. */
    private static function contenu(array $j)
    {
        if (isset($j['error'])) {
            throw new ErreurPennylane('Pennylane : ' . ($j['error']['message'] ?? 'erreur'));
        }
        $r = $j['result'] ?? [];
        $texte = implode("\n", array_map(fn($c) => (string)($c['text'] ?? ''), array_filter($r['content'] ?? [], fn($c) => ($c['type'] ?? '') === 'text')));
        if (!empty($r['isError'])) {
            throw new ErreurPennylane('Pennylane : ' . mb_substr($texte, 0, 300));
        }
        if (isset($r['structuredContent']) && is_array($r['structuredContent'])) {
            return $r['structuredContent'];
        }
        return json_decode($texte, true) ?? $texte;
    }

    private function initialiser(): void
    {
        if ($this->pret) {
            return;
        }
        $this->session = null;
        $jeton = plmcp_jeton();
        $corps = json_encode(['jsonrpc' => '2.0', 'id' => 0, 'method' => 'initialize', 'params' => ['protocolVersion' => PL_MCP_PROTOCOLE,
            'capabilities' => new stdClass(), 'clientInfo' => ['name' => 'avis-cfe', 'version' => '1']]]);
        [$code, $entetes, $texte, $err] = plmcp_http('POST', PL_MCP . '/mcp', $this->entetes($jeton), $corps);
        if ($code === 401) {
            [$code, $entetes, $texte, $err] = plmcp_http('POST', PL_MCP . '/mcp', $this->entetes(plmcp_jeton(true)), $corps);
        }
        $j = self::lire($entetes, $texte);
        if ($code !== 200 || !isset($j['result'])) {
            error_log("Avis de CFE, MCP Pennylane initialize ($code $err) : " . mb_substr($texte, 0, 300));
            throw new ErreurPennylane($code === 401 ? 'Pennylane refuse l\'accès : reconnectez Pennylane (Paramètres › CFE).'
                : ($code === 0 ? "Pennylane injoignable ($err)." : "Pennylane ne répond pas correctement ($code)."));
        }
        if (preg_match('/^mcp-session-id:\s*(\S+)/im', $entetes, $m)) {
            $this->session = $m[1];
        }
        $this->version = (string)($j['result']['protocolVersion'] ?? PL_MCP_PROTOCOLE);
        $this->pret = true;
        plmcp_http('POST', PL_MCP . '/mcp', $this->entetes($jeton), json_encode(['jsonrpc' => '2.0', 'method' => 'notifications/initialized']), 15);
    }

    public function appeler(string $outil, array $arguments)
    {
        $r = $this->plusieurs([[$outil, $arguments]])[0];
        if ($r instanceof Throwable) {
            throw $r;
        }
        return $r;
    }

    /** Appels d'outils en parallèle (PL_MCP_PARALLELE à la fois), dans l'ordre donné : résultat, ou ErreurPennylane pour un appel
     *  qui échoue encore après les nouvelles tentatives (429, 5xx, réseau : jusqu'à 3 essais ; 401 : jeton renouvelé). */
    public function plusieurs(array $appels): array
    {
        $this->initialiser();
        $resultats = [];
        $restants = array_keys($appels);
        $renouvele = false;
        for ($essai = 0; $restants && $essai < 3; $essai++) {
            $jeton = plmcp_jeton();
            $a_refaire = [];
            $pause = 0;
            foreach (array_chunk($restants, PL_MCP_PARALLELE) as $groupe) {
                $multi = curl_multi_init();
                $poignees = [];
                foreach ($groupe as $i) {
                    [$outil, $args] = $appels[$i];
                    $corps = json_encode(['jsonrpc' => '2.0', 'id' => ++$this->numero, 'method' => 'tools/call',
                        'params' => ['name' => $outil, 'arguments' => (object)$args]], JSON_UNESCAPED_UNICODE);
                    $poignees[$i] = plmcp_poignee('POST', PL_MCP . '/mcp', $this->entetes($jeton), $corps, 60);
                    curl_multi_add_handle($multi, $poignees[$i]);
                }
                do {
                    $statut = curl_multi_exec($multi, $actifs);
                    if ($actifs) {
                        curl_multi_select($multi, 1.0);
                    }
                } while ($actifs && $statut === CURLM_OK);
                foreach ($poignees as $i => $c) {
                    [$code, $entetes, $texte, $err] = plmcp_reponse($c, curl_multi_getcontent($c));
                    curl_multi_remove_handle($multi, $c);
                    curl_close($c);
                    $j = $code === 200 ? self::lire($entetes, $texte) : null;
                    if ($j !== null) {
                        try {
                            $resultats[$i] = self::contenu($j);
                        } catch (ErreurPennylane $e) {
                            $resultats[$i] = $e;
                        }
                        continue;
                    }
                    if ($code === 401 || $code === 404 || $code === 0 || $code === 429 || $code >= 500) {
                        $a_refaire[] = $i;  // jeton périmé, session perdue, réseau, saturation : on recommence
                        if ($code === 429 && preg_match('/^retry-after:\s*(\d+)/im', $entetes, $m)) {
                            $pause = max($pause, min((int)$m[1], 20));
                        }
                        if ($code === 401 && !$renouvele) {
                            plmcp_jeton(true);
                            $renouvele = true;
                        }
                        if ($code === 404) {
                            $this->pret = false;
                        }
                    }
                    $resultats[$i] = new ErreurPennylane($code === 0 ? "Pennylane injoignable ($err)." : "Pennylane : erreur $code.");
                }
                curl_multi_close($multi);
            }
            $restants = $a_refaire;
            if ($restants) {
                sleep($pause ?: 2 ** $essai);
                $this->initialiser();
            }
        }
        ksort($resultats);
        return $resultats;
    }
}
