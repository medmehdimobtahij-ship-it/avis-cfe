<?php
/**
 * L'API JSON de l'application (interface : public/app.js, public/cfe.js, public/comptazap.js). Toute l'API exige une session,
 * sauf la connexion et les retours des pages Microsoft et Pennylane.
 *
 * Les mails partent de la boîte Microsoft de la personne connectée : brouillon (ouvert dans Outlook) ou envoi direct, un mail
 * par requête (l'interface enchaîne : jamais de requête trop longue pour l'hébergement). Sans Outlook, chaque mail se
 * télécharge en .eml (avis joint) ou s'ouvre dans la messagerie du PC, et la case « Envoyé » se coche à la main.
 * Chaque service est facultatif (Microsoft 365, SharePoint, Pennylane, ComptaZap) : /api/integrations dit ce qui est en place.
 */
declare(strict_types=1);

const CACHE_ENVOYES = 90;  // secondes : Éléments envoyés relus au plus toutes les 90 s (suivi « Envoyé le »)

final class Api
{
    private array $moi = [];

    public function traiter(string $methode, string $chemin): void
    {
        if ($chemin === '/api/connexion/options' && $methode === 'GET') {
            $nom = choix_du_nom_permis();
            json_reponse(200, ['microsoft' => connexion_microsoft_disponible(), 'mot_de_passe' => mode_connexion() === '' && !$nom,
                'choix_du_nom' => $nom, 'comptes' => $nom ? comptes_liste() : [], 'demo' => MODE_DEMO, 'cabinet' => cabinet_nom()]);
        }
        if (in_array($chemin, ['/api/connexion', '/api/deconnexion'], true) && ($_SERVER['HTTP_X_AVIS'] ?? '') !== '1') {
            arret(403, 'Requête refusée.');  // seulement depuis l'interface (aucun autre site ne peut connecter ou déconnecter)
        }
        if ($chemin === '/api/connexion' && $methode === 'POST') {
            json_reponse(...$this->connexion());
        }
        if ($chemin === '/api/microsoft/connexion' && $methode === 'GET') {
            connexion_microsoft_disponible() ? redirection(microsoft_flux_demarrer('connexion')) : page_redirection('/?microsoft=indisponible');
        }
        if ($chemin === '/api/deconnexion' && $methode === 'POST') {
            session_demarrer();
            if (!empty($_SESSION['identifiant'])) {
                journal_securite('deconnexion', $_SESSION['identifiant']);
            }
            $_SESSION = [];
            session_destroy();
            json_reponse(200, ['ok' => true]);
        }
        if ($chemin === '/api/pennylane/retour' && $methode === 'GET') {  // retour de la page Pennylane (cookie de session absent : Strict)
            try {
                plmcp_terminer($_GET);
                page_redirection('/?pennylane=ok');
            } catch (ErreurPennylane $e) {
                error_log('Avis de CFE, connexion Pennylane : ' . $e->getMessage());
                page_redirection('/?pennylane=' . ($e instanceof ErreurMcp ? $e->code_retour : 'erreur'));
            }
        }
        $this->moi = exiger_connexion(($_SERVER['HTTP_X_AVIS_AUTO'] ?? '') !== '1');  // relectures automatiques : pas une activité
        cfe_personne($this->moi['identifiant']);  // chacun ne voit que les données de SON ComptaZap
        if (MODE_DEMO && $this->hors_demo($methode, $chemin)) {  // démo hors ligne : Microsoft 365 et Pennylane jamais appelés
            json_reponse(409, ['erreur' => DEMO_MESSAGE, 'demo' => true]);
        }
        $routes = [
            ['GET', '/api/moi', 'moi'], ['POST', '/api/mot-de-passe', 'mot_de_passe'], ['GET', '/api/integrations', 'integrations'],
            ['POST', '/api/parametres/cabinet', 'parametres_cabinet'],
            ['GET', '/api/microsoft/lier', 'microsoft_lier'], ['GET', '/api/securite', 'securite'],
            ['POST', '/api/securite/mode', 'securite_mode'], ['POST', '/api/securite/delier', 'securite_delier'],
            ['POST', '/api/securite/fermer-sessions', 'securite_fermer_sessions'],
            ['GET', '/api/outlook', 'outlook_etat'], ['POST', '/api/outlook/verifier', 'outlook_verifier'],
            ['POST', '/api/outlook/connexion', 'outlook_connexion'], ['POST', '/api/outlook/connexion/retour', 'outlook_retour'],
            ['POST', '/api/outlook/deconnexion', 'outlook_deconnexion'], ['POST', '/api/outlook/reglages', 'outlook_reglages'],
            ['GET', '/api/signature', 'signature'], ['POST', '/api/signature', 'signature_enregistrer'], ['POST', '/api/signature/effacer', 'signature_effacer'],
            ['POST', '/api/signature/outlook', 'signature_outlook'], ['GET', '/api/signature/outlook-locales', 'signatures_locales'],
            ['POST', '/api/signature/apercu', 'signature_apercu'],
            // Avis de CFE
            ['GET', '/api/cfe', 'cfe'], ['POST', '/api/cfe/contact', 'cfe_contact'], ['POST', '/api/cfe/envoye', 'cfe_envoye'],
            ['POST', '/api/cfe/contestation', 'cfe_contestation'], ['POST', '/api/cfe/apercu', 'cfe_apercu'], ['POST', '/api/cfe/brouillon', 'cfe_brouillon'],
            ['POST', '/api/cfe/envoyer', 'cfe_envoyer'], ['POST', '/api/cfe/eml', 'cfe_eml'], ['POST', '/api/cfe/parametres', 'cfe_parametres_ecrire'],
            ['GET', '#^/api/cfe/avis/([0-9a-f]{64})$#', 'cfe_pdf'], ['GET', '/api/cfe/avis.zip', 'cfe_pdfs_zip'],
            ['POST', '/api/cfe/avis', 'cfe_avis_saisir'], ['POST', '/api/cfe/avis/supprimer', 'cfe_avis_supprimer'],
            ['POST', '/api/cfe/avis/fichier', 'cfe_avis_fichier'], ['GET', '#^/api/exemples/([a-z0-9-]+\.csv)$#', 'exemple'],
            ['GET', '/api/cfe/annuaire', 'cfe_annuaire'], ['POST', '/api/cfe/annuaire/fichier', 'cfe_annuaire_fichier'],
            ['POST', '/api/cfe/annuaire/synchro/debut', 'cfe_annuaire_debut'], ['POST', '/api/cfe/annuaire/synchro/lot', 'cfe_annuaire_lot'],
            ['GET', '/api/pennylane/connecter', 'pennylane_connecter'], ['POST', '/api/pennylane/deconnecter', 'pennylane_deconnecter'],
            ['POST', '/api/cfe/onedrive/plan', 'cfe_od_plan'], ['POST', '/api/cfe/onedrive/copier', 'cfe_od_copier'],
            ['GET', '/api/cfe/onedrive/clients', 'cfe_od_clients'], ['POST', '/api/cfe/onedrive/choisir', 'cfe_od_choisir'],
            ['POST', '/api/cfe/onedrive/lien', 'cfe_od_lien'], ['POST', '/api/cfe/import', 'cfe_import'], ['POST', '/api/cfe/pdf', 'cfe_pdf_recevoir'],
            ['POST', '/api/cfe/pdf/reseau', 'cfe_pdf_reseau'],
            ['GET', '/api/cfe/echanges', 'cfe_echanges'], ['GET', '#^/api/mail/([^/]+)$#', 'mail_detail'],
            ['GET', '#^/api/mail/([^/]+)/pj/([^/]+)$#', 'mail_pj'], ['POST', '/api/mail/repondre', 'mail_envoyer'], ['POST', '/api/mail/envoyer', 'mail_envoyer'],
        ];
        $connue = false;
        foreach ($routes as [$verbe, $motif, $nom]) {
            $ok = $motif[0] === '#' ? preg_match($motif, $chemin, $m) : $motif === $chemin;
            if ($ok) {
                $connue = true;
                if ($verbe === $methode) {
                    $r = $this->$nom(...array_map('rawurldecode', array_slice($m ?? [], 1)));
                    json_reponse(...(is_array($r) && isset($r[0], $r[1]) && is_int($r[0]) && count($r) === 2 ? $r : [200, $r]));
                }
            }
            $m = [];
        }
        arret($connue ? 405 : 404, $connue ? 'Méthode non permise.' : 'Introuvable.');
    }

    /** Routes qui appellent Microsoft 365 ou Pennylane : refusées en mode démo, avec un message clair (la boîte, elle, est
     *  simulée : aperçus, envois, suivi « Envoyé » et échanges marchent sur des données fictives). */
    private function hors_demo(string $methode, string $chemin): bool
    {
        $exactes = ['GET /api/microsoft/lier', 'POST /api/outlook/connexion', 'POST /api/outlook/connexion/retour', 'POST /api/outlook/verifier',
            'POST /api/outlook/deconnexion', 'POST /api/outlook/reglages', 'POST /api/securite/mode', 'POST /api/securite/delier',
            'POST /api/signature/outlook', 'GET /api/pennylane/connecter', 'POST /api/pennylane/deconnecter', 'POST /api/cfe/annuaire/synchro/debut',
            'POST /api/cfe/annuaire/synchro/lot', 'POST /api/cfe/pdf/reseau', 'POST /api/cfe/onedrive/plan', 'POST /api/cfe/onedrive/copier',
            'GET /api/cfe/onedrive/clients', 'POST /api/cfe/onedrive/choisir', 'POST /api/cfe/onedrive/lien'];
        return in_array("$methode $chemin", $exactes, true) || ($methode === 'GET' && preg_match('#^/api/mail/[^/]+/pj/#', $chemin) === 1);
    }

    // ---------- Connexion et compte ----------

    /** Mot de passe (mode « Microsoft ou mot de passe »), ou simple choix du nom sur ce PC (choix_du_nom_permis). */
    private function connexion(): array
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '?';
        $d = corps();
        $id = strtolower(trim((string)($d['identifiant'] ?? '')));
        if (mode_connexion() !== '') {
            return [403, ['erreur' => MESSAGES_MICROSOFT['mot_de_passe'], 'microsoft' => true]];
        }
        if (choix_du_nom_permis()) {  // sur ce PC, si le réglage le permet : rien à deviner
            $compte = comptes_choisir($id);
            if (!$compte) {
                return [401, ['erreur' => 'Compte inconnu.']];
            }
            ouvrir_session($compte, 'choix');
            journal_securite('connexion', $compte['identifiant'], ['methode' => 'choix', 'mfa' => false]);
            return [200, $compte + ['methode' => 'choix', 'mfa' => null]];
        }
        if (essais_trop_nombreux($ip, $id)) {
            journal_securite('connexion_bloquee', isset(comptes_lire()[$id]) ? $id : null);
            return [429, ['erreur' => 'Trop d\'essais : réessayez dans 15 minutes.']];
        }
        $compte = comptes_verifier($id, $d['mot_de_passe'] ?? null);
        if (!$compte) {
            noter_essai_rate($ip, $id);
            journal_securite('connexion_refusee', isset(comptes_lire()[$id]) ? $id : null, ['methode' => 'mot_de_passe']);
            return [401, ['erreur' => 'Identifiant ou mot de passe incorrect.']];
        }
        ouvrir_session($compte, 'mot_de_passe');
        journal_securite('connexion', $compte['identifiant'], ['methode' => 'mot_de_passe', 'mfa' => false]);
        return [200, $compte + ['methode' => 'mot_de_passe', 'mfa' => false]];
    }

    /** Retour de la page Microsoft (connexion, ou liaison du compte) : jamais d'erreur brute, toujours un retour au site. */
    public function retour_microsoft(): never
    {
        try {
            [$flux, $r, $infos, $mfa] = microsoft_flux_terminer($_GET);
            $ms = ['oid' => (string)($infos['oid'] ?? ''), 'tid' => (string)$infos['tid'],
                'adresse' => strtolower((string)($infos['preferred_username'] ?? $infos['email'] ?? ''))];
            if ($flux['but'] === 'lier') {
                if ($refus = comptes_lier_microsoft((string)$flux['identifiant'], $ms)) {
                    journal_securite('liaison_refusee', $flux['identifiant'], ['adresse' => $ms['adresse'], 'motif' => $refus]);
                    page_redirection("/?microsoft=$refus");
                }
                (new Boite((string)$flux['identifiant'], outlook_client_id()))->adopter($r, $infos);
                journal_securite('microsoft_lie', $flux['identifiant'], ['adresse' => $ms['adresse'], 'mfa' => $mfa]);
                page_redirection('/?microsoft=lie');
            }
            $compte = compte_par_microsoft($ms['oid'], $ms['tid']);
            if (!$compte && ($compte = compte_a_lier($infos))) {  // première connexion : lié tout seul
                if ($refus = comptes_lier_microsoft($compte['identifiant'], $ms)) {
                    page_redirection("/?microsoft=$refus");
                }
                journal_securite('microsoft_lie', $compte['identifiant'], ['adresse' => $ms['adresse'], 'motif' => 'première connexion']);
            }
            if (!$compte) {
                journal_securite('connexion_refusee', null, ['methode' => 'microsoft', 'adresse' => $ms['adresse'], 'motif' => 'compte non lié']);
                page_redirection('/?microsoft=inconnu');
            }
            if (mode_connexion() === 'microsoft_mfa' && $mfa !== true) {
                journal_securite('connexion_refusee', $compte['identifiant'], ['methode' => 'microsoft', 'motif' => 'sans double authentification']);
                page_redirection('/?microsoft=mfa');
            }
            (new Boite($compte['identifiant'], outlook_client_id()))->adopter($r, $infos);  // la boîte Outlook est connectée du même coup
            ouvrir_session($compte, 'microsoft', $mfa);
            journal_securite('connexion', $compte['identifiant'], ['methode' => 'microsoft', 'mfa' => $mfa, 'adresse' => $ms['adresse']]);
            page_redirection('/');
        } catch (ErreurOutlook $e) {
            $cle = array_key_exists($e->getMessage(), MESSAGES_MICROSOFT) ? $e->getMessage() : 'erreur';
            journal_securite('connexion_refusee', null, ['methode' => 'microsoft', 'motif' => $cle]);
            page_redirection("/?microsoft=$cle");
        } catch (Throwable $e) {
            error_log('Avis de CFE : ' . $e);
            page_redirection('/?microsoft=erreur');
        }
    }

    private function moi(): array
    {
        return $this->moi;
    }

    /** Nouvelle génération de sessions (mot de passe changé, sessions fermées) : celle-ci reste ouverte. */
    private function garder_cette_session(int $generation): void
    {
        session_demarrer();
        $_SESSION['generation'] = $generation;
        session_write_close();
    }

    private function mot_de_passe(): array
    {
        $d = corps();
        if (!comptes_verifier($this->moi['identifiant'], $d['ancien'] ?? null)) {
            throw new ErreurSaisie(['ancien' => 'Mot de passe actuel incorrect.']);
        }
        try {
            sous_verrou(fn() => comptes_changer($this->moi['identifiant'], $d['nouveau'] ?? null));
        } catch (InvalidArgumentException $e) {
            throw new ErreurSaisie(['nouveau' => $e->getMessage()]);
        }
        $this->garder_cette_session(comptes_lire()[$this->moi['identifiant']]['generation']);
        journal_securite('mot_de_passe_change', $this->moi['identifiant']);
        return ['ok' => true];
    }

    /** Nom du cabinet (signature simple des mails, page de connexion) : Paramètres › Général, sinon config.json. */
    private function parametres_cabinet(): array
    {
        $nom = mb_substr(trim((string)(corps()['nom'] ?? '')), 0, 120);
        sous_verrou(function () use ($nom) {
            $p = lire_json(chemin_data('parametres.json'), []);
            if ($nom === '') {
                unset($p['CabinetNom']);
            } else {
                $p['CabinetNom'] = $nom;
            }
            ecrire_json(chemin_data('parametres.json'), $p);
        });
        return ['cabinet' => cabinet_nom()];
    }

    /** Chaque service facultatif : en place, à connecter, ou pas configuré (et pourquoi). L'outil marche sans aucun d'eux. */
    private function integrations(): array
    {
        $b = $this->boite();
        $cz = cfe_comptazap();
        $s = saisie_lire();
        return ['cabinet' => cabinet_nom(), 'demo' => MODE_DEMO,
            'microsoft' => ['configure' => outlook_client_id() !== '', 'boite' => $b->adresse(), 'connexion' => connexion_microsoft_disponible()],
            'sharepoint' => ['configure' => SP_BIBLIOTHEQUE !== '', 'bibliotheque' => SP_BIBLIOTHEQUE, 'clients' => SP_CLIENTS,
                'sous_dossier' => implode(' › ', OD_SOUS), 'sauvegarde' => CFE_SP_SAUVEGARDE],
            'pennylane' => plmcp_etat() + ['cabinet' => CABINET_PENNYLANE !== ''],
            'comptazap' => ['recu_le' => (string)($cz['recu_le'] ?? ''), 'avis' => count($cz['documents'] ?? [])],
            'saisis' => count($s['documents']), 'annuaire' => annuaire_etat()];
    }

    // ---------- Sécurité : compte Microsoft, mode de connexion, journal ----------

    private function microsoft_lier(): never
    {
        connexion_microsoft_disponible() ? redirection(microsoft_flux_demarrer('lier', $this->moi['identifiant']))
            : page_redirection('/?microsoft=indisponible');
    }

    private function securite(): array
    {
        $comptes = comptes_lire();
        $ms = $comptes[$this->moi['identifiant']]['microsoft'] ?? null;
        $modes = MODES_CONNEXION;
        if (sans_mot_de_passe_local() && en_local()) {
            $modes[''] = 'Microsoft ou choix du nom (sur ce PC)';
        }
        return [
            'session' => ['methode' => $this->moi['methode'], 'mfa' => $this->moi['mfa']],
            'microsoft' => $ms ? ['adresse' => $ms['adresse'], 'lie_le' => $ms['lie_le']] : null,
            'comptes' => array_map(fn($id, $c) => ['identifiant' => $id, 'nom' => $c['nom'], 'lie' => !empty($c['microsoft'])], array_keys($comptes), $comptes),
            'mode' => mode_connexion(), 'modes' => $modes, 'disponible' => connexion_microsoft_disponible(),
            'mot_de_passe' => !empty($comptes[$this->moi['identifiant']]['hash']) && mode_connexion() === '' && !choix_du_nom_permis(),
            'journal' => journal_du_compte($this->moi['identifiant']),
            'duree' => ['inactivite' => SESSION_INACTIVITE, 'max' => SESSION_DUREE_MAX],
        ];
    }

    /** Mode de connexion du cabinet. Jamais de blocage : Microsoft seulement si l'on est soi-même lié ; double
     *  authentification exigée seulement si on vient soi-même de se connecter ainsi. */
    private function securite_mode(): array
    {
        $mode = (string)(corps()['mode'] ?? '');
        if (!array_key_exists($mode, MODES_CONNEXION)) {
            throw new ErreurSaisie(['mode' => 'Mode inconnu.']);
        }
        if ($mode !== '') {  // les comptes pas encore liés le seront à leur première connexion Microsoft (compte_a_lier)
            if (empty(comptes_lire()[$this->moi['identifiant']]['microsoft'])) {
                throw new ErreurSaisie(['mode' => 'Liez d\'abord votre compte Microsoft (bouton ci-dessus) : sinon vous ne pourriez plus vous connecter.']);
            }
            if (!connexion_microsoft_disponible()) {
                throw new ErreurSaisie(['mode' => MESSAGES_MICROSOFT['indisponible']]);
            }
        }
        if ($mode === 'microsoft_mfa' && $this->moi['mfa'] !== true) {
            throw new ErreurSaisie(['mode' => 'Connectez-vous d\'abord avec Microsoft et Microsoft Authenticator : l\'application vérifie ainsi que la double authentification marche.']);
        }
        sous_verrou(function () use ($mode) {
            $p = lire_json(chemin_data('parametres.json'), []);
            $p['ModeConnexion'] = $mode;
            ecrire_json(chemin_data('parametres.json'), $p);
        });
        journal_securite('mode_connexion', $this->moi['identifiant'], ['mode' => $mode]);
        return $this->securite();
    }

    private function securite_delier(): array
    {
        if (mode_connexion() !== '') {
            throw new ErreurSaisie(['microsoft' => 'Repassez d\'abord en « Microsoft ou mot de passe » : sinon vous ne pourriez plus vous connecter.']);
        }
        comptes_delier_microsoft($this->moi['identifiant']);
        journal_securite('microsoft_delie', $this->moi['identifiant']);
        return $this->securite();
    }

    private function securite_fermer_sessions(): array
    {
        $this->garder_cette_session(comptes_fermer_sessions($this->moi['identifiant']));
        journal_securite('sessions_fermees', $this->moi['identifiant']);
        return ['ok' => true];
    }

    // ---------- Boîte Microsoft ----------

    private function boite(): Boite
    {
        return new Boite($this->moi['identifiant']);
    }

    private function erreur_outlook(ErreurOutlook $e, int $statut = 409): array
    {
        return [$statut, ['erreur' => $e->getMessage(), 'action' => $e->action]];
    }

    private function outlook_etat(): array
    {
        $b = $this->boite();
        $f = $b->flux();
        $cx = $f && ($f['expire'] ?? 0) > time() - 3600
            ? ['etat' => $f['statut'] ?? 'attente', 'code' => '', 'url' => '', 'message' => $f['message'] ?? null, 'action' => $f['action'] ?? null] : null;
        $p = lire_json(chemin_data('parametres.json'), []);
        return ['adresse' => $b->adresse(), 'client_id' => $b->client_id, 'connexion' => $cx, 'retour_auto' => retour_declare(),
            'adresse_site' => origine(), 'client_id_reglage' => (string)($p['MessagerieClientId'] ?? ''), 'secret' => microsoft_secret() !== ''];
    }

    /** Microsoft 365 facultatif : sans application déclarée (config.json), rien n'est demandé à Microsoft. */
    private function exiger_microsoft(): void
    {
        if (outlook_client_id() === '') {
            arret(409, "Microsoft 365 n'est pas configuré (réglage « microsoft_client_id » de config.json, ou Paramètres › Réglages avancés). "
                . "Sans lui, les mails se téléchargent (.eml) ou s'ouvrent dans votre messagerie.");
        }
    }

    private function outlook_verifier(): array
    {
        $this->exiger_microsoft();
        try {
            $this->boite()->verifier_application();
        } catch (ErreurOutlook $e) {
            return $this->erreur_outlook($e, 200);
        }
        return ['ok' => true, 'mode' => 'navigateur'];
    }

    private function outlook_connexion(): array
    {
        $this->exiger_microsoft();
        $retour = adresse_retour_microsoft();  // securite.php
        $cx = $this->boite()->demarrer($retour);
        return ['etat' => 'attente', 'mode' => 'navigateur', 'code' => '', 'url' => $cx['url'], 'automatique' => $retour !== RETOUR_MICROSOFT];
    }

    /** Connexion terminée : retour Microsoft sur le site, ou adresse collée par la personne (page de retour Microsoft). */
    private function outlook_retour(): array
    {
        $b = $this->boite();
        try {
            $a = $b->terminer((string)(corps()['adresse'] ?? ''));
        } catch (ErreurOutlook $e) {
            return $this->erreur_outlook($e);
        }
        if (empty(comptes_lire()[$this->moi['identifiant']]['microsoft']) && !$b->personnel()  // compte Microsoft lié du même coup
            && comptes_lier_microsoft($this->moi['identifiant'], $b->identite()) === null) {
            journal_securite('microsoft_lie', $this->moi['identifiant'], ['adresse' => $a]);
        }
        return ['ok' => true, 'adresse' => $a];
    }

    private function outlook_deconnexion(): array
    {
        $this->boite()->deconnecter();
        $this->vider_envoyes();
        return ['ok' => true];
    }

    private function outlook_reglages(): array
    {
        $d = corps();
        sous_verrou(function () use ($d) {
            $p = lire_json(chemin_data('parametres.json'), []);
            if (array_key_exists('client_id', $d)) {
                $v = trim((string)$d['client_id']);
                if ($v === '') {
                    unset($p['MessagerieClientId']);
                } else {
                    $p['MessagerieClientId'] = $v;
                }
            }
            if (array_key_exists('retour_auto', $d)) {
                $p['MessagerieRetourAuto'] = !empty($d['retour_auto']) ? '1' : '';
            }
            if (array_key_exists('secret', $d)) {  // jamais en clair dans les fichiers ; vide = retiré
                $s = trim((string)$d['secret']);
                if ($s === '') {
                    unset($p['MessagerieSecret']);
                } else {
                    $p['MessagerieSecret'] = chiffrer($s, 'microsoft-secret');
                }
            }
            ecrire_json(chemin_data('parametres.json'), $p);
        });
        return $this->outlook_etat();
    }

    // --- Signature des mails (chacun la sienne) : Microsoft n'ajoute pas celle d'Outlook ---

    /** Signature enregistrée de la personne connectée ; sinon une signature simple (nom, cabinet, adresse mail). L'interface propose
     *  alors celle d'Outlook (signatures_locales) et demande avant de la garder. */
    private function signature(): array
    {
        $html = signature_enregistree($this->moi['identifiant']);
        return ['html' => $html ?? signature_html($this->moi['identifiant'], $this->moi['nom'], $this->boite()->adresse()), 'personnalisee' => $html !== null];
    }

    /** Signature relue dans le dernier mail envoyé (site en ligne, sans accès à l'Outlook du PC). Pas gardée : l'interface demande. */
    private function signature_outlook(): array
    {
        $b = $this->boite();
        try {
            $sig = $b->adresse() === '' ? null : $b->signature_outlook();
        } catch (ErreurOutlook) {
            $sig = null;
        }
        if ($sig === null) {
            return [409, ['erreur' => 'Aucune signature trouvée dans vos derniers mails envoyés : importez le fichier de votre signature Outlook.']];
        }
        return ['html' => $sig, 'source' => 'outlook'];
    }

    /** Signatures enregistrées dans Outlook, sur ce PC : seulement quand le navigateur est sur le PC où tourne l'application
     *  (sinon ce seraient celles d'un autre poste). La signature par défaut d'Outlook en premier. */
    private function signatures_locales(): array
    {
        $adresse = $this->boite()->adresse();
        return ['signatures' => en_local() && $adresse !== '' ? signatures_outlook_locales($adresse) : []];
    }

    /** Fichier de signature importé (.htm d'Outlook) : nettoyé pour l'aperçu, pas encore gardé. */
    private function signature_apercu(): array
    {
        $brut = mb_substr((string)(corps()['html'] ?? ''), 0, 3000000);
        if (preg_match('#<body[^>]*>(.*)</body>#is', $brut, $m)) {
            $brut = $m[1];
        }
        return ['html' => nettoyer_html($brut)];
    }

    private function signature_enregistrer(): array
    {
        $html = nettoyer_html(mb_substr((string)(corps()['html'] ?? ''), 0, 1500000));  // avec le logo intégré
        ecrire_fichier(chemin_data('signatures', $this->moi['identifiant'] . '.html'), $html);
        return ['html' => $html, 'personnalisee' => true];
    }

    private function signature_effacer(): array
    {
        @unlink(chemin_data('signatures', $this->moi['identifiant'] . '.html'));
        @unlink(chemin_data('signatures', $this->moi['identifiant'] . '.json'));
        return $this->signature();
    }

    private function envoyes(string $motif, bool $frais = false, int $jours = 420): ?array
    {
        $b = $this->boite();
        if ($b->adresse() === '') {
            return null;
        }
        $fichier = chemin_data('cache-envoyes', $this->moi['identifiant'] . '-' . md5($motif . ($jours !== 420 ? ":$jours" : '')) . '.json');
        $cache = lire_json($fichier, null);
        if ($frais || !is_array($cache) || time() - ($cache['t'] ?? 0) > CACHE_ENVOYES) {
            // Relecture incrémentale : seuls les mails envoyés depuis la dernière lecture (marge de 2 h) sont redemandés à Microsoft,
            // les anciens restent en cache. Une série d'envois ne relit donc plus jamais toute la boîte à chaque mail.
            $increment = is_array($cache) && isset($cache['jusqu_a'], $cache['mails']) && time() - $cache['jusqu_a'] < 86400;
            try {
                $debut = time();
                $nouveaux = $increment ? $b->envoyes($motif, $jours, 2000, (int)$cache['jusqu_a'] - 7200) : $b->envoyes($motif, $jours, 6000);
            } catch (ErreurOutlook $e) {
                return is_array($cache) ? ($cache['mails'] ?? null) : null;  // Microsoft indisponible : dernier état connu
            }
            $mails = [];
            $limite = date('Y-m-d\TH:i', time() - $jours * 86400);
            foreach (array_merge($nouveaux, $increment ? $cache['mails'] : []) as $m) {
                $cle = $m['id'] !== '' ? $m['id'] : $m['date'] . $m['objet'];
                if (!isset($mails[$cle]) && $m['date'] >= $limite) {
                    $mails[$cle] = $m;
                }
            }
            $mails = array_values($mails);
            usort($mails, fn($x, $y) => strcmp($y['date'], $x['date']));  // du plus récent, comme Microsoft
            $cache = ['t' => time(), 'jusqu_a' => $debut, 'mails' => $mails];
            ecrire_json($fichier, $cache, false);
        }
        return $cache['mails'];
    }

    /** Après un envoi : suivi et échanges relus au prochain affichage (relecture incrémentale, donc rapide). */
    private function vider_envoyes(): void
    {
        foreach (glob(chemin_data('cache-envoyes', $this->moi['identifiant'] . '-*.json')) ?: [] as $f) {
            $c = lire_json($f, null);
            if (is_array($c) && isset($c['jusqu_a'])) {
                $c['t'] = 0;  // périmé, mais gardé : seuls les nouveaux mails seront relus
                ecrire_json($f, $c, false);
            } else {
                @unlink($f);  // échanges : relus entièrement
            }
        }
    }

    // ---------- Avis de CFE ----------

    /** Année affichée : le filtre « Année » de l'écran (?annee=), sinon celle des Paramètres. */
    private function cfe_annee_affichee(array $p): int
    {
        $a = (int)($_GET['annee'] ?? corps()['annee_affichee'] ?? 0);
        return $a >= 2000 && $a <= 2100 ? $a : cfe_annee($p);
    }

    /** Lignes de l'année $annee (une par client, avec son avis N-1 pour comparer) et avis N-1 encore dus. */
    private function cfe_lignes(array $p, bool $frais = false, ?int $annee = null): array
    {
        $annee ??= $this->cfe_annee_affichee($p);
        $cz = cfe_donnees();
        $dossiers = [];
        foreach ([$annee, $annee - 1] as $a) {
            foreach (cfe_dossiers($a, $cz, $a === $annee) as $s => $d) {
                $dossiers["$a:$s"] = $d;
            }
        }
        $manuels = lire_json(cfe_chemin('contacts-cfe.json'), []) + (cfe_tests_actifs($p) ? cfe_dossiers_test($annee)[1] : []);  // test : interlocuteur fourni
        $envois = lire_json(cfe_chemin('envois-cfe.json'), []);
        $contestations = lire_json(cfe_chemin('contestations-cfe.json'), []);
        $contacts = annuaire_lire()['contacts'];
        $index = cfe_index_contacts($contacts);
        $genres = cfe_civilites_connues($contacts);
        $mails = $this->envoyes('CFE', $frais, cfe_jours_depuis($annee - 1, 9));  // avis N et N-1, envoyés à partir de septembre
        $lignes = $interlocuteurs = $par_email = [];
        foreach ($dossiers as $cle => $d) {
            if ($d['annee'] !== $annee && !in_array($d['statut'], CFE_DUS, true)) {
                continue;  // année précédente : seulement en référence, sauf avis encore dû
            }
            $interlocuteurs[$cle] = cfe_interlocuteur($d, $manuels, $index, $genres);
            $e = mb_strtolower(trim((string)$interlocuteurs[$cle]['email']));
            if ($e !== '') {
                $par_email[$d['annee']][$e][$d['siren']] = true;
            }
        }
        foreach ($dossiers as $cle => $d) {
            if (!isset($interlocuteurs[$cle])) {
                continue;
            }
            $contact = $interlocuteurs[$cle];
            $societe = cfe_nom_societe($d, $contact);
            $partage = count($par_email[$d['annee']][mb_strtolower(trim((string)$contact['email']))] ?? []) > 1;
            $envoi = $mails !== null ? cfe_date_envoi($mails, $d['annee'], $contact['email'], $societe, $partage) : null;
            $manuel = $envois[(string)$d['annee']][$d['siren']] ?? null;
            if (!empty($d['test'])) {  // dossier de test : jamais « envoyé », pour l'envoyer autant de fois qu'on veut
                $envoi = $manuel = null;
            }
            $refuse = $manuel === CFE_NON_ENVOYE;  // case décochée à la main : le mail trouvé dans Outlook n'était pas l'avis
            $manuel = $refuse ? null : $manuel;
            $prec = $d['annee'] === $annee ? ($dossiers[($annee - 1) . ':' . $d['siren']] ?? null) : null;
            $lignes[] = ['cle' => $cle, 'siren' => $d['siren'], 'annee' => $d['annee'], 'societe' => $societe, 'nom_comptazap' => $d['nom_comptazap'],
                'statut' => $d['statut'], 'montant' => $d['montant'], 'montant_texte' => euros($d['montant']),
                'total_avis' => array_sum(array_column($d['avis'], 'montant')),
                'avis' => array_map(fn($a) => $a + ['montant_texte' => euros($a['montant'])], $d['avis']),
                'contact' => $contact, 'envoi_outlook' => $envoi, 'envoi_manuel' => $manuel, 'refuse' => $refuse,
                'envoye' => (bool)($manuel || ($envoi && !$refuse)),
                'contestation' => $contestations[(string)$d['annee']][$d['siren']] ?? null,
                'prec' => $prec ? ['annee' => $prec['annee'], 'total' => array_sum(array_column($prec['avis'], 'montant')),
                    'avis' => array_map(fn($a) => ['commune' => $a['commune'], 'montant' => euros($a['montant']), 'detail' => $a['detail'], 'pdf' => $a['pdf'],
                        'pdf_nom' => $a['pdf_nom']], $prec['avis'])] : null,
                'dossier_export' => $d['avis'][0]['dossier_export'] ?? '', 'test' => !empty($d['test']),
                'saisi' => (bool)array_filter($d['avis'], fn($a) => !empty($a['saisi']))];
        }
        usort($lignes, fn($a, $b) => [mb_strtoupper($a['societe']), -$a['annee']] <=> [mb_strtoupper($b['societe']), -$b['annee']]);
        return [$lignes, $mails !== null];
    }

    private function cfe(): array
    {
        $p = cfe_parametres();
        $annee = $this->cfe_annee_affichee($p);
        [$lignes, $outlook] = $this->cfe_lignes($p, !empty($_GET['frais']), $annee);
        $cz = cfe_donnees();
        $brut = cfe_comptazap();
        $annees = array_values(array_unique(array_merge(cfe_annees_disponibles($cz), [$annee, cfe_annee($p), (int)date('Y')])));
        rsort($annees);
        return ['annee' => $annee, 'annees' => $annees, 'annee_parametres' => cfe_annee($p), 'importance' => cfe_importance_haute($p),
            'lignes' => $lignes, 'outlook' => $outlook, 'recu_le' => $brut['recu_le'] ?? '', 'saisis' => count(saisie_lire()['documents']),
            'maj_comptazap' => $brut['maj_comptazap'] ?? '', 'export_comptazap' => $brut['export_comptazap'] ?? '', 'parametres' => $p,
            'pdfs_manquants' => cfe_pdfs_manquants($cz),
            'modeles' => CFE_MODELES, 'formules' => CFE_FORMULES, 'reglements' => CFE_REGLEMENTS,
            'boite' => $this->boite()->adresse(), 'microsoft' => outlook_client_id() !== '' || MODE_DEMO, 'demo' => MODE_DEMO,
            'sharepoint' => SP_BIBLIOTHEQUE !== '' && !MODE_DEMO, 'sous_dossier' => implode(' › ', OD_SOUS),
            'annuaire' => annuaire_etat()];
    }

    /** Ligne d'une clé « année:SIREN » : affichée avec son année, ou (avis N-1 encore dû) avec l'année suivante. */
    private function cfe_ligne(string $cle, ?array $p = null): array
    {
        $a = (int)explode(':', $cle)[0];
        foreach ([$a, $a + 1] as $annee) {
            [$lignes] = $this->cfe_lignes($p ?? cfe_parametres(), false, $annee);
            foreach ($lignes as $l) {
                if ($l['cle'] === $cle) {
                    return $l;
                }
            }
        }
        arret(404, 'Avis introuvable (avis réimportés entre-temps ?).');
    }

    /** Dossier complet (avis à joindre) d'une clé « année:SIREN ». */
    private function cfe_dossier(string $cle): array
    {
        [$a, $s] = array_pad(explode(':', $cle, 2), 2, '');
        $d = cfe_dossiers((int)$a, null, true)[$s] ?? null;
        if (!$d) {
            arret(404, 'Avis introuvable.');
        }
        return $d;
    }

    /** Saisie à la main (prioritaire sur l'annuaire) : civilité, formule, règlement, e-mail, copie, prénom, nom ; « annuaire » efface.
     *  SIREN : lettres gardées (dossiers de test « TEST00001 »). */
    private function cfe_contact(): array
    {
        $d = corps();
        $siren = preg_replace('/[^\w]/', '', (string)($d['siren'] ?? ''));
        if ($siren === '') {
            return [422, ['erreur' => 'Société sans SIREN : rien enregistré.']];
        }
        sous_verrou(function () use ($d, $siren) {
            $m = lire_json(cfe_chemin('contacts-cfe.json'), []);
            if (!empty($d['annuaire']) || !empty($d['pennylane'])) {
                unset($m[$siren]);
            } else {
                $fiche = $m[$siren] ?? [];
                foreach (['civilite' => ['M', 'Mme', ''], 'formule' => ['Vous', 'Tu'], 'reglement' => ['client', 'cabinet']] as $k => $permis) {
                    if (array_key_exists($k, $d) && in_array($d[$k], $permis, true)) {
                        $fiche[$k] = $d[$k];
                    }
                }
                foreach (['email', 'cc', 'prenom', 'nom'] as $k) {
                    if (array_key_exists($k, $d)) {
                        $fiche[$k] = trim((string)$d[$k]);
                    }
                }
                $fiche['source'] = 'saisi à la main';
                $m[$siren] = $fiche;
            }
            ecrire_json(cfe_chemin('contacts-cfe.json'), $m);
        });
        return ['ok' => true];
    }

    private function cfe_envoye(): array
    {
        $d = corps();
        sous_verrou(function () use ($d) {
            $e = lire_json(cfe_chemin('envois-cfe.json'), []);
            $a = (string)(int)($d['annee'] ?? 0);
            $s = preg_replace('/[^\w]/', '', (string)($d['siren'] ?? ''));
            if (!empty($d['etat'])) {
                $e[$a][$s] = aujourdhui();
            } elseif (!empty($d['trouve'])) {  // mail CFE dans les Éléments envoyés, mais ce n'était pas l'avis : plus compté
                $e[$a][$s] = CFE_NON_ENVOYE;
            } else {
                unset($e[$a][$s]);
            }
            ecrire_json(cfe_chemin('envois-cfe.json'), $e);
        });
        return ['ok' => true];
    }

    private function cfe_contestation(): array
    {
        $d = corps();
        sous_verrou(function () use ($d) {
            $c = lire_json(cfe_chemin('contestations-cfe.json'), []);
            $a = (string)(int)($d['annee'] ?? 0);
            $s = preg_replace('/[^\w]/', '', (string)($d['siren'] ?? ''));
            if (!array_key_exists('commentaire', $d) || $d['commentaire'] === null) {
                unset($c[$a][$s]);
            } else {
                $c[$a][$s] = ['date' => ($c[$a][$s]['date'] ?? '') ?: aujourdhui(), 'commentaire' => trim((string)$d['commentaire']), 'par' => $this->moi['nom']];
            }
            ecrire_json(cfe_chemin('contestations-cfe.json'), $c);
        });
        return ['ok' => true];
    }

    /** Mail d'une ligne ; $d['parametres'] : modèles en cours de saisie (aperçu des Paramètres) ; $d['modele'] force tu/vous et règlement. */
    private function cfe_mail(array $d): array
    {
        $p = cfe_parametres();
        foreach ((array)($d['parametres'] ?? []) as $k => $v) {
            if (isset(CFE_DEFAUTS[$k]) && trim((string)$v) !== '') {
                $p[$k] = (string)$v;
            }
        }
        $l = $this->cfe_ligne((string)($d['cle'] ?? ''));
        $dossier = $this->cfe_dossier($l['cle']);
        $contact = $l['contact'];
        $contestation = !empty($l['contestation']);
        if (isset(CFE_MODELES[$d['modele'] ?? ''])) {  // aperçu des Paramètres : le modèle choisi, sur un vrai dossier
            $contact['formule'] = str_ends_with($d['modele'], '_TU') ? 'Tu' : 'Vous';
            $contestation = str_contains($d['modele'], 'CONTESTATION');
            if (!$contestation) {
                $dossier['statut'] = str_contains($d['modele'], 'PRELEVEMENT') ? CFE_PRELEVEMENT
                    : (str_contains($d['modele'], 'RIEN') ? CFE_RIEN : CFE_A_PAYER);
            }
        }
        [$objet, $texte, $html, $pieces, $modele] = cfe_construire_mail($dossier, $contact, $p, $dossier['annee'], null, $contestation);
        return ['ligne' => $l, 'objet' => $objet, 'texte' => $texte, 'html' => $html, 'pieces' => $pieces, 'modele' => $modele,
            'a' => $contact['email'], 'cc' => implode(', ', array_unique(array_filter(array_map('trim', preg_split('/[;,]/', $p['COPIE_CFE'] . ',' . ($contact['cc'] ?? '')) ?: [])))),
            'haute' => cfe_importance_haute($p)];
    }

    private function cfe_apercu(): array
    {
        $m = $this->cfe_mail(corps());
        return ['objet' => $m['objet'], 'texte' => $m['texte'], 'html' => $m['html'], 'pieces' => array_column($m['pieces'], 1), 'a' => $m['a'],
            'cc' => $m['cc'], 'pj' => array_map(fn($x) => ['nom' => $x[1], 'lien' => "/api/cfe/avis/{$x[0]}"], $m['pieces']),
            'societe' => $m['ligne']['societe'], 'modele' => $m['modele'], 'haute' => $m['haute']];
    }

    private function pieces_cfe(array $pieces): array
    {
        $out = [];
        foreach ($pieces as [$sha, $nom]) {
            $f = cfe_chemin('avis', "$sha.pdf");
            if (!is_file($f)) {
                throw new ErreurOutlook("PDF de l'avis $nom pas encore sur le site : ajoutez-le (colonne Avis), puis réessayez.");
            }
            $out[] = [$nom, (string)file_get_contents($f), 'application/pdf'];
        }
        return $out;
    }

    /** Brouillon dans la boîte de la personne (avis joint) : lien pour l'ouvrir dans Outlook. Rien n'est envoyé. */
    private function cfe_brouillon(): array
    {
        $m = $this->cfe_mail(corps());
        try {
            $b = $this->boite()->brouillon([$m['a']], $m['objet'], $m['html'], array_filter(preg_split('/[;,]/', $m['cc']) ?: []), $this->pieces_cfe($m['pieces']),
                $m['haute']);
        } catch (ErreurOutlook $e) {
            return $this->erreur_outlook($e);
        }
        return ['ok' => true, 'lien' => $b['lien'], 'societe' => $m['ligne']['societe']];
    }

    /** Envoi direct d'UN mail (l'interface enchaîne les mails cochés). test : à sa propre adresse, objet « [TEST] ». */
    private function cfe_envoyer(): array
    {
        $d = corps();
        $m = $this->cfe_mail($d);
        $this->mail_modifie($d, $m['objet'], $m['html']);
        $b = $this->boite();
        $test = !empty($d['test']);
        if (!$test) {
            if ($m['a'] === '') {
                return [422, ['erreur' => "{$m['ligne']['societe']} : pas d'e-mail."]];
            }
        }
        try {
            $a = $test ? [$b->adresse()] : [$m['a']];
            $b->envoyer_html($a, ($test ? '[TEST] ' : '') . $m['objet'], $m['html'], $test ? [] : array_filter(preg_split('/[;,]/', $m['cc']) ?: []),
                $this->pieces_cfe($m['pieces']), $m['haute']);
        } catch (ErreurOutlook $e) {
            return $this->erreur_outlook($e);
        }
        if (!$test) {
            sous_verrou(function () use ($m) {  // case « Envoyé » cochée toute seule
                $e = lire_json(cfe_chemin('envois-cfe.json'), []);
                $e[(string)$m['ligne']['annee']][$m['ligne']['siren']] = aujourdhui();
                ecrire_json(cfe_chemin('envois-cfe.json'), $e);
            });
            $this->vider_envoyes();
        }
        return ['ok' => true, 'a' => $a[0], 'societe' => $m['ligne']['societe'], 'demo' => MODE_DEMO];
    }

    /** Sans Outlook : le mail tel qu'il partirait, en fichier .eml (avis joint, signature comprise), à ouvrir dans la messagerie
     *  du PC. Rien n'est noté comme envoyé : la case « Envoyé » se coche ensuite à la main. */
    private function cfe_eml(): array
    {
        $d = corps();
        $m = $this->cfe_mail($d);
        $this->mail_modifie($d, $m['objet'], $m['html']);
        if ($m['a'] === '') {
            return [422, ['erreur' => "{$m['ligne']['societe']} : pas d'e-mail."]];
        }
        try {
            $pieces = $this->pieces_cfe($m['pieces']);
        } catch (ErreurOutlook $e) {
            return [409, ['erreur' => $e->getMessage()]];
        }
        $eml = mail_eml($this->boite()->adresse(), [$m['a']], array_filter(preg_split('/[;,]/', $m['cc']) ?: []), $m['objet'],
            avec_signature($m['html'], $this->moi['identifiant']), $pieces, $m['haute']);
        envoyer_fichier($eml, sans_accents_majuscules($m['ligne']['societe']) . " - Avis CFE {$m['ligne']['annee']}.eml", 'message/rfc822', true, true);
    }

    private function cfe_parametres_ecrire(): array
    {
        $d = corps();
        sous_verrou(function () use ($d) {
            $p = lire_json(cfe_chemin('parametres.json'), []);
            foreach (CFE_DEFAUTS as $k => $defaut) {
                if (!array_key_exists($k, $d)) {
                    continue;
                }
                $v = trim((string)$d[$k]);
                if ($k === 'ANNEE_CFE' && $v !== '' && !ctype_digit($v)) {
                    throw new ErreurSaisie(['ANNEE_CFE' => 'Année sur 4 chiffres (vide : année en cours).']);
                }
                if ($v === '' || str_replace("\r\n", "\n", $v) === $defaut) {
                    unset($p[$k]);  // vide : le texte par défaut (les mises à jour du modèle restent prises en compte)
                } else {
                    $p[$k] = $v;
                }
            }
            ecrire_json(cfe_chemin('parametres.json'), $p);
        });
        return cfe_parametres();
    }

    /** Import depuis ComptaZap (lu par le navigateur, public/comptazap.js) : avis, paiements et dettes de SON ComptaZap. */
    private function cfe_import(): array
    {
        return cfe_recevoir($this->moi['identifiant'], corps());
    }

    // --- Avis sans ComptaZap : saisis à la main ou importés d'un fichier (cfe_saisie.php) ---
    private function cfe_avis_saisir(): array
    {
        $avis = saisie_avis(corps(), cfe_annee(cfe_parametres()));
        saisie_enregistrer([$avis]);
        return ['ok' => true, 'cle' => $avis[0]['annee_imposition'] . ':' . $avis[0]['siren'], 'pdf' => $avis[0]['pdf']['sha256']];
    }

    private function cfe_avis_supprimer(): array
    {
        $d = corps();
        $ok = saisie_supprimer((int)($d['annee'] ?? 0), preg_replace('/\D/', '', (string)($d['siren'] ?? '')), (string)($d['reference'] ?? ''));
        return $ok ? ['ok' => true] : [404, ['erreur' => 'Avis introuvable parmi les avis saisis (ceux de ComptaZap se corrigent dans ComptaZap).']];
    }

    /** Fichier d'avis (CSV ou Excel), envoyé en base64 par l'interface. */
    private function cfe_avis_fichier(): array
    {
        $contenu = base64_decode((string)(corps()['contenu'] ?? ''), true);
        if ($contenu === false || $contenu === '') {
            arret(422, 'Fichier illisible.');
        }
        return saisie_importer($contenu, cfe_annee(cfe_parametres()));
    }

    /** Fichiers d'exemple (exemples/) : les colonnes attendues, à ouvrir dans Excel. */
    private function exemple(string $nom): array
    {
        $f = RACINE . '/exemples/' . basename($nom);
        if (!is_file($f)) {
            arret(404, 'Introuvable.');
        }
        envoyer_fichier($f, $nom, 'text/csv; charset=utf-8', true);
    }

    // --- Annuaire des interlocuteurs (cfe_annuaire.php) : Pennylane ou fichier ---
    private function cfe_annuaire(): array
    {
        return annuaire_etat();
    }

    private function cfe_annuaire_fichier(): array
    {
        $contenu = base64_decode((string)(corps()['contenu'] ?? ''), true);
        if ($contenu === false || $contenu === '') {
            arret(422, 'Fichier illisible.');
        }
        return annuaire_importer($contenu, $this->moi['nom']);
    }

    private function cfe_annuaire_debut(): array
    {
        return $this->synchro_pennylane(fn() => annuaire_synchro_debut($this->moi['nom']));
    }

    private function cfe_annuaire_lot(): array
    {
        $id = (string)(corps()['id'] ?? '');
        return $this->synchro_pennylane(fn() => annuaire_synchro_lot(preg_match('/^[0-9a-f]{32}$/', $id) ? $id : ''));
    }

    private function pennylane_connecter(): never
    {
        try {
            redirection(plmcp_demarrer($this->moi['identifiant'], $this->moi['nom']));
        } catch (ErreurPennylane $e) {
            error_log('Avis de CFE, connexion Pennylane : ' . $e->getMessage());
            page_redirection('/?pennylane=' . ($e instanceof ErreurMcp ? $e->code_retour : 'erreur'));
        }
    }

    private function pennylane_deconnecter(): array
    {
        plmcp_deconnecter();
        return plmcp_etat();
    }

    /** Erreur Pennylane -> 409 lisible ; « connecter » : l'interface propose de connecter Pennylane. */
    private function synchro_pennylane(callable $faire): array
    {
        @set_time_limit(170);
        try {
            return $faire();
        } catch (ErreurMcp $e) {
            return [409, ['erreur' => $e->getMessage(), 'connecter' => $e->code_retour === 'connecter']];
        } catch (ErreurPennylane $e) {
            return [409, ['erreur' => $e->getMessage()]];
        }
    }

    /** PDF des avis récupérés sur le réseau (SharePoint › sauvegarde ComptaZap), quelques-uns par requête. */
    private function cfe_pdf_reseau(): array
    {
        @set_time_limit(150);
        $cles = array_values(array_filter(array_map('strval', (array)(corps()['cles'] ?? [])), fn($c) => preg_match('/^[0-9a-f]{64}$/', $c) === 1));
        try {
            return cfe_pdfs_reseau($this->boite(), $cles);
        } catch (ErreurOutlook $e) {
            return $this->erreur_outlook($e);
        }
    }

    private function cfe_pdf_recevoir(): array
    {
        $d = corps();
        $contenu = base64_decode((string)($d['contenu'] ?? ''), true);
        if ($contenu === false) {
            arret(422, 'Fichier illisible.');
        }
        return cfe_recevoir_pdf((string)($d['cle'] ?? ''), $contenu);
    }

    private function cfe_pdf(string $sha): array
    {
        $f = cfe_chemin('avis', "$sha.pdf");
        if (!is_file($f)) {
            arret(404, 'PDF de cet avis pas encore sur le site : ajoutez-le (colonne Avis).');
        }
        $nom = 'Avis CFE.pdf';
        foreach (cfe_donnees()['documents'] ?? [] as $doc) {
            if (($doc['pdf']['sha256'] ?? '') === $sha) {
                $nom = $doc['pdf']['nom'] ?: $nom;
            }
        }
        envoyer_fichier($f, $nom, 'application/pdf', ($_GET['telecharger'] ?? '') === '1', false, "default-src 'none'; style-src 'unsafe-inline'; img-src data:; object-src 'self'");
    }

    /** Tous les PDF des avis de l'année, dans une archive (sans OneDrive : à ranger soi-même). */
    private function cfe_pdfs_zip(): array
    {
        $annee = $this->cfe_annee_affichee(cfe_parametres());
        if (!class_exists('ZipArchive')) {
            arret(409, 'Archive impossible ici (extension PHP zip absente) : ouvrez les avis un par un (colonne Avis).');
        }
        $tmp = tempnam(sys_get_temp_dir(), 'avis');
        $z = new ZipArchive();
        $z->open($tmp, ZipArchive::OVERWRITE);
        $n = 0;
        foreach (cfe_dossiers($annee) as $d) {
            foreach ($d['avis'] as $a) {
                $f = cfe_chemin('avis', $a['pdf'] . '.pdf');
                if ($a['pdf'] !== '' && is_file($f)) {
                    $nom = od_nom_fichier(sans_accents_majuscules($d['nom_comptazap']), $annee, $a, count($d['avis']) > 1);
                    $z->addFile($f, $nom);
                    $n++;
                }
            }
        }
        $z->close();
        if (!$n) {
            @unlink($tmp);
            arret(404, "Aucun PDF d'avis $annee sur le site.");
        }
        $octets = (string)file_get_contents($tmp);
        @unlink($tmp);
        envoyer_fichier($octets, "Avis CFE $annee.zip", 'application/zip', true, true);
    }

    // --- Rangement des avis dans OneDrive / SharePoint (cfe_onedrive.php) ---

    private function od_boite(): Boite
    {
        @set_time_limit(240);
        $b = $this->boite();
        sp_verifier_compte($b);
        return $b;
    }

    /** Année des avis à ranger : celle du filtre « Année » de l'écran (corps « annee »), sinon celle des Paramètres. */
    private function cfe_od_annee(): int
    {
        $a = (int)(corps()['annee'] ?? 0);
        return $a >= 2000 && $a <= 2100 ? $a : cfe_annee(cfe_parametres());
    }

    private function cfe_od_plan(): array
    {
        $annee = $this->cfe_od_annee();
        try {
            $lignes = od_plan($this->od_boite(), cfe_dossiers($annee), $annee);
        } catch (ErreurOutlook $e) {
            return $this->erreur_outlook($e);
        }
        return ['annee' => $annee, 'lignes' => array_map(fn($l) => array_diff_key($l, ['pdf' => 1]), $lignes)];
    }

    /** Un avis par requête (l'interface enchaîne) : la ligne est recalculée juste avant, jamais d'écrasement. */
    private function cfe_od_copier(): array
    {
        $cle = (string)(corps()['cle'] ?? '');
        $annee = $this->cfe_od_annee();
        try {
            $b = $this->od_boite();
            $l = od_plan($b, array_filter(cfe_dossiers($annee), fn($d) => str_starts_with($cle, $d['siren'] . ':')), $annee, $cle)[0] ?? null;
            if (!$l) {
                arret(404, 'Avis introuvable.');
            }
            od_copier($b, $l, $annee);
        } catch (ErreurOutlook $e) {
            return $this->erreur_outlook($e);
        }
        return ['ok' => true, 'nom' => $l['nom']];
    }

    private function cfe_od_clients(): array
    {
        try {
            [, $clients] = od_clients($this->od_boite());
        } catch (ErreurOutlook $e) {
            return $this->erreur_outlook($e);
        }
        $noms = array_keys($clients);
        sort($noms);
        return ['clients' => $noms, 'manuels' => od_manuels()];
    }

    private function cfe_od_choisir(): array
    {
        $d = corps();
        $siren = preg_replace('/[^\w]/', '', (string)($d['siren'] ?? ''));
        if ($siren === '') {
            return [422, ['erreur' => 'Société sans SIREN : rien enregistré.']];
        }
        sous_verrou(function () use ($d, $siren) {
            $m = od_manuels();
            if (trim((string)($d['client'] ?? '')) === '') {
                unset($m[$siren]);
            } else {
                $m[$siren] = trim((string)$d['client']);
            }
            ecrire_json(cfe_chemin('dossiers-onedrive.json'), $m);
        });
        return ['ok' => true];
    }

    private function cfe_od_lien(): array
    {
        $annee = $this->cfe_od_annee();
        $d = cfe_dossiers($annee)[(string)(corps()['siren'] ?? '')] ?? null;
        if (!$d) {
            arret(404, 'Dossier introuvable.');
        }
        try {
            $lien = od_lien($this->od_boite(), $d, $annee);
        } catch (ErreurOutlook $e) {
            return $this->erreur_outlook($e);
        }
        return $lien ? ['lien' => $lien] : [404, ['erreur' => 'Pas de dossier OneDrive trouvé pour ce client : « Choisir le dossier OneDrive du client ».']];
    }

    // --- Échanges : mails CFE envoyés et reçus, regroupés par fil ---

    private function cfe_echanges(): array
    {
        return $this->echanges('CFE', cfe_jours_depuis($this->cfe_annee_affichee(cfe_parametres()), 1));
    }

    private function echanges(string $motif, int $jours = 420): array
    {
        $b = $this->boite();
        $moi = $b->adresse();
        if ($moi === '') {
            return ['connecte' => false, 'mails' => []];
        }
        $fichier = chemin_data('cache-envoyes', $this->moi['identifiant'] . '-echanges-' . strtolower($motif) . ($jours !== 420 ? "-$jours" : '') . '.json');
        $cache = lire_json($fichier, null);
        if (!empty($_GET['frais']) || !is_array($cache) || time() - ($cache['t'] ?? 0) > CACHE_ENVOYES) {
            try {
                $mails = array_map(fn($e) => resume_mail($e, $moi), $b->mails_motif($motif, $jours));
                $mails = array_values(array_filter($mails, fn($m) => !$m['entrant']  // jamais les notifications automatiques
                    || !preg_match('/^(no-?reply|noreply|notifications?)@/i', (string)($m['de']['adresse'] ?? ''))));
                $cache = ['t' => time(), 'mails' => $mails];
            } catch (ErreurOutlook $e) {
                if (!is_array($cache)) {
                    return $this->erreur_outlook($e);
                }
            }
            ecrire_json($fichier, $cache, false);
        }
        return ['connecte' => true, 'moi' => $moi, 'mails' => $cache['mails']];
    }

    private function mail_detail(string $mid): array
    {
        $b = $this->boite();
        try {
            [$nouveau, $complet, $lu] = $b->contenu($mid);
            $pj = $b->pieces_jointes($mid);
            if (!$lu) {
                $b->marquer_lu($mid);
                foreach (glob(chemin_data('cache-envoyes', $this->moi['identifiant'] . '-echanges-*.json')) ?: [] as $f) {
                    $c = lire_json($f, null);
                    foreach ($c['mails'] ?? [] as $i => $m) {
                        if ($m['id'] === $mid) {
                            $c['mails'][$i]['lu'] = true;
                            ecrire_json($f, $c, false);
                        }
                    }
                }
            }
        } catch (ErreurOutlook $e) {
            return $this->erreur_outlook($e);
        }
        return ['texte' => trim($nouveau) ?: trim($complet), 'complet' => $complet, 'pj' => $pj];
    }

    private function mail_pj(string $mid, string $aid): array
    {
        try {
            $r = $this->boite()->telecharger($mid, $aid);
        } catch (ErreurOutlook $e) {
            return $this->erreur_outlook($e);
        }
        if ($r === null) {
            arret(404, 'Pièce jointe introuvable.');
        }
        [$contenu, $nom, $type] = $r;
        // « Ouvrir » dans le navigateur : seulement les types sans danger (PDF, images, texte) ; le reste est téléchargé
        $sur = in_array(strtolower(trim(explode(';', $type)[0])), ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain'], true);
        envoyer_fichier($contenu, $nom, $type, !(($_GET['voir'] ?? '') === '1' && $sur), true,
            "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'self'");
    }

    /** Mail écrit dans l'éditeur (fenêtre de rédaction) : réponse dans le fil (repondre_a) ou nouveau mail, depuis la
     *  boîte de la personne. La signature est dans le texte (éditeur) ; un simple texte reçoit la signature enregistrée. */
    private function mail_envoyer(): array
    {
        $d = corps();
        $liste = fn($x) => array_values(array_map('trim', array_filter(is_array($x) ? $x : [], fn($a) => is_string($a) && str_contains($a, '@'))));
        $a = $liste($d['a'] ?? []);
        $objet = trim((string)($d['objet'] ?? ''));
        $repondre = is_string($d['repondre_a'] ?? null) && $d['repondre_a'] !== '' ? $d['repondre_a'] : null;
        $champs = [];
        if (!$a) {
            $champs['a'] = 'Au moins un destinataire.';
        }
        if ($objet === '' && !$repondre) {
            $champs['objet'] = 'L\'objet est obligatoire.';
        }
        if (trim(strip_tags((string)($d['html'] ?? ''), '<img>')) === '' && trim((string)($d['texte'] ?? '')) === '') {
            $champs['texte'] = 'Le message est vide.';
        }
        if ($champs) {
            throw new ErreurSaisie($champs);
        }
        $pieces = [];
        foreach (is_array($d['pieces'] ?? null) ? $d['pieces'] : [] as $p) {
            $c = base64_decode((string)($p['contenu'] ?? ''), true);
            if ($c !== false) {
                $pieces[] = [basename((string)($p['nom'] ?? 'piece')), $c];
            }
        }
        $b = $this->boite();
        $corps = trim((string)($d['html'] ?? '')) !== '' ? corps_mail($d) : avec_signature(corps_mail($d), $this->moi['identifiant']);
        try {
            $b->envoyer($a, $objet, $corps, $liste($d['cc'] ?? []), $pieces, $repondre);
        } catch (ErreurOutlook $e) {
            return $this->erreur_outlook($e);
        }
        $this->vider_envoyes();  // échanges compris : relus au prochain affichage
        return ['ok' => true];
    }

    /** Mail modifié dans la fenêtre avant l'envoi : objet et texte de la personne, nettoyés. Destinataire,
     *  copie et pièces jointes restent ceux du dossier ; la signature est ajoutée comme d'habitude. Sans modification : rien ne change. */
    private function mail_modifie(array $d, string &$objet, string &$html): void
    {
        if (trim(strip_tags((string)($d['html'] ?? ''), '<img>')) !== '') {
            $html = corps_mail(['html' => (string)$d['html']]);
        }
        $saisi = trim(preg_replace('/\s+/u', ' ', (string)($d['objet'] ?? '')) ?? '');
        if ($saisi !== '') {
            $objet = mb_substr($saisi, 0, 250);
        }
    }
}
