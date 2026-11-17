"""Connexion et sécurité, par HTTP, contre le vrai serveur PHP.

Données dans un dossier temporaire (variable AVIS_DATA, jamais data/). Microsoft est remplacé par un faux serveur local
(jetons d'identité RS256 signés ici) : aucun appel au vrai Microsoft. « En ligne » est simulé par l'en-tête Host (et
X-Forwarded-Proto: https) : le serveur décide « sur ce PC » d'après le serveur intégré de PHP, l'hôte demandé et l'adresse IP.
Le serveur des tests permet la connexion par choix du nom sur ce PC (réglage « connexion_par_nom_en_local »).
"""
import json
import os
import re
import time
from urllib.parse import parse_qs, unquote, urlparse

from cryptography.hazmat.primitives.asymmetric import rsa

from commun import (CLAIMS, CLIENT_ID, DOSSIER, H, MS, TENANT_CABINET, code_pour, comptes, journal, page_microsoft, regler,
                    retour_microsoft)

CLAIRE = "claire.moreau@cabinet-exemple.fr"
PAUL = "paul.bernard@cabinet-exemple.fr"
SITE = "https://cfe.cabinet-exemple.fr"


# ---------- Sur ce PC / en ligne ----------
def test_choix_du_nom_seulement_sur_ce_pc(app):
    c = app["local"]()
    o = c.get("/api/connexion/options").json()
    assert o["choix_du_nom"] is True and o["microsoft"] is True and [x["identifiant"] for x in o["comptes"]] == ["claire", "paul"]
    r = c.post("/api/connexion", headers=H, json={"identifiant": "claire"})
    assert r.status_code == 200 and r.json()["methode"] == "choix"
    assert c.get("/api/moi").json()["methode"] == "choix"

    e = app["en_ligne"]()
    assert e.get("/api/connexion/options").json() == {"microsoft": True, "mot_de_passe": False, "choix_du_nom": False, "comptes": [],
                                                      "demo": False, "cabinet": "Cabinet Exemple"}
    r = e.post("/api/connexion", headers=H, json={"identifiant": "claire"})
    assert r.status_code == 403 and r.json()["microsoft"] is True and e.get("/api/moi").status_code == 401
    lan = app["local"]()  # autre PC du réseau (adresse du PC) : jamais « sur ce PC » ; mot de passe (Microsoft exige HTTPS)
    lan.headers["Host"] = "192.168.1.20:8090"
    o = lan.get("/api/connexion/options").json()
    assert o["mot_de_passe"] is True and o["choix_du_nom"] is False and o["comptes"] == []
    assert lan.post("/api/connexion", headers=H, json={"identifiant": "paul"}).status_code == 401  # sans mot de passe : refusé
    r = lan.post("/api/connexion", headers=H, json={"identifiant": "paul", "mot_de_passe": app["mdp"]["paul"]})
    assert r.status_code == 200 and r.json()["methode"] == "mot_de_passe"
    vole = app["local"]()  # session ouverte par choix du nom, présentée depuis un autre PC du réseau : refusée
    vole.headers["Host"] = "192.168.1.20:8090"
    vole.cookies.update(c.cookies)
    assert vole.get("/api/moi").status_code == 401

    regler(ModeConnexion="")  # même en « Microsoft ou mot de passe », en ligne il faut le mot de passe
    e = app["en_ligne"]()
    assert e.get("/api/connexion/options").json()["choix_du_nom"] is False
    assert e.post("/api/connexion", headers=H, json={"identifiant": "claire"}).status_code == 401
    assert e.post("/api/connexion", headers=H, json={"identifiant": "claire", "mot_de_passe": app["mdp"]["claire"]}).json()["methode"] == "mot_de_passe"


def test_connexion_microsoft_avec_et_sans_double_authentification(app):
    c = app["en_ligne"]()
    MS.update(adresse=CLAIRE, nom="Claire Moreau", mfa=False)
    url = page_microsoft(c)
    q = parse_qs(urlparse(url).query)
    assert q["code_challenge_method"] == ["S256"] and len(q["nonce"][0]) == 32 and "prompt" not in q and "claims" not in q
    assert q["redirect_uri"] == [SITE] and q["client_id"] == [CLIENT_ID]
    assert retour_microsoft(c, url) == "/?microsoft=mfa" and c.get("/api/moi").status_code == 401  # mode par défaut en ligne
    assert MS["redirect_uri"] == SITE

    MS["mfa"] = True
    r = c.get("/api/microsoft/connexion", allow_redirects=False)
    assert "__Host-avis_flux=" in r.headers["Set-Cookie"] and "secure" in r.headers["Set-Cookie"].lower()
    assert retour_microsoft(c, r.headers["Location"]) == "/"
    assert c.get("/api/moi").json() == {"identifiant": "claire", "nom": "Claire Moreau", "methode": "microsoft", "mfa": True}
    assert any(k.name == "__Host-avis_cfe" for k in c.cookies)
    assert c.get("/api/outlook").json()["adresse"] == CLAIRE  # boîte Outlook connectée du même coup
    assert comptes()["claire"]["microsoft"]["adresse"] == CLAIRE  # lié tout seul
    s = c.get("/api/securite").json()
    assert s["mode"] == "microsoft_mfa" and s["session"] == {"methode": "microsoft", "mfa": True}

    MS.update(adresse=PAUL, nom="Paul BERNARD")
    p = app["en_ligne"]()
    assert retour_microsoft(p, page_microsoft(p)) == "/" and p.get("/api/moi").json()["identifiant"] == "paul"
    MS["nom"] = "Autre Nom"  # ensuite, reconnu par son identifiant Microsoft, quel que soit le nom
    p = app["en_ligne"]()
    assert retour_microsoft(p, page_microsoft(p)) == "/"


def test_compte_non_lie_ou_etranger_refuse(app):
    MS["mfa"] = True
    for adresse, nom in (("accueil@cabinet-exemple.fr", "Accueil"),  # cabinet, mais sans compte ici
                         ("paul.bernard@autre.example.com", "Paul Bernard"),  # pas le domaine du cabinet
                         ("quelquun@hotmail.fr", "Claire Moreau")):  # compte personnel
        MS.update(adresse=adresse, nom=nom)
        c = app["en_ligne"]()
        assert retour_microsoft(c, page_microsoft(c)) == "/?microsoft=inconnu", adresse
        assert c.get("/api/moi").status_code == 401
    MS.update(adresse=CLAIRE, nom="Claire Moreau")
    m = app["en_ligne"]()
    assert retour_microsoft(m, page_microsoft(m)) == "/"
    MS.update(adresse=PAUL, nom="Paul Bernard", tid="99999999-0000-0000-0000-000000000000")
    c = app["en_ligne"]()  # bonne adresse, mais une autre organisation Microsoft que celle du cabinet
    assert retour_microsoft(c, page_microsoft(c)) == "/?microsoft=inconnu"
    assert "microsoft" not in comptes()["paul"]
    p = app["local"]()  # Paul ne peut pas lier le compte Microsoft de Claire
    p.post("/api/connexion", headers=H, json={"identifiant": "paul"})
    MS.update(adresse=CLAIRE, tid=TENANT_CABINET)
    assert retour_microsoft(p, page_microsoft(p, "/api/microsoft/lier")) == "/?microsoft=deja"


def test_jetons_microsoft_falsifies_refuses(app):
    MS.update(adresse=CLAIRE, nom="Claire Moreau", mfa=True)
    essais = {
        "cle_pirate": rsa.generate_private_key(public_exponent=65537, key_size=2048),  # signé par quelqu'un d'autre que Microsoft
        "aud": "autre-application",  # jeton émis pour une autre application
    }
    for k, v in essais.items():
        MS[k] = v
        c = app["en_ligne"]()
        assert retour_microsoft(c, page_microsoft(c)) == "/?microsoft=erreur", k
        assert c.get("/api/moi").status_code == 401, k
        MS.pop(k)
    c = app["en_ligne"]()  # nonce d'une autre connexion (jeton rejoué)
    url = page_microsoft(c)
    MS["nonce"] = "0" * 32
    r = c.get("/", params={"code": "c1", "state": parse_qs(urlparse(url).query)["state"][0]})
    assert "microsoft=erreur" in r.text and c.get("/api/moi").status_code == 401
    pirate, victime = app["en_ligne"](), app["en_ligne"]()  # retour ouvert dans un autre navigateur (cookie de liaison absent)
    url = page_microsoft(pirate)
    assert retour_microsoft(victime, url) == "/?microsoft=expire" and victime.get("/api/moi").status_code == 401
    c = app["en_ligne"]()  # usage unique : le même retour ne sert pas deux fois
    url = page_microsoft(c)
    lien = dict(c.cookies)
    assert retour_microsoft(c, url) == "/"
    c2 = app["en_ligne"]()
    c2.cookies.update(lien)
    r = c2.get("/", params={"code": "c1", "state": parse_qs(urlparse(url).query)["state"][0]})
    assert "microsoft=" not in r.text and c2.get("/api/moi").status_code == 401  # plus attendu : simple page du site
    assert not comptes()["paul"].get("microsoft")


def test_double_authentification_exigee_par_microsoft_relance_une_fois(app):
    MS.update(adresse=CLAIRE, nom="Claire Moreau", mfa=True, exige_mfa=1)
    c = app["en_ligne"]()
    u = page_microsoft(c)
    r = c.get("/", params={"code": code_pour(u), "state": parse_qs(urlparse(u).query)["state"][0]}, allow_redirects=False)
    assert r.status_code == 302  # AADSTS50076 : retour sur la page Microsoft avec son défi
    q = parse_qs(urlparse(r.headers["Location"]).query)
    assert q["claims"] == [CLAIMS] and "amr_values" not in q and "prompt" not in q
    assert retour_microsoft(c, r.headers["Location"]) == "/" and c.get("/api/moi").json()["mfa"] is True

    MS["exige_mfa"] = 2  # même après l'avoir exigé : message clair, pas de boucle
    c = app["en_ligne"]()
    u = page_microsoft(c)
    relance = c.get("/", params={"code": code_pour(u), "state": parse_qs(urlparse(u).query)["state"][0]}, allow_redirects=False).headers["Location"]
    assert retour_microsoft(c, relance) == "/?microsoft=mfa" and c.get("/api/moi").status_code == 401


def test_mode_de_connexion_et_garde_fous(app):
    loc = app["local"]()
    loc.post("/api/connexion", headers=H, json={"identifiant": "claire"})
    assert loc.get("/api/securite").json()["mode"] == ""  # sur ce PC : « Microsoft ou mot de passe » par défaut
    assert loc.post("/api/securite/mode", json={"mode": "microsoft"}, headers=H).status_code == 422  # pas lié : se bloquerait
    assert loc.post("/api/securite/mode", json={"mode": "microsoft"}).status_code == 403  # POST sans en-tête X-Avis
    MS.update(adresse=CLAIRE, nom="Claire Moreau", mfa=False)
    assert retour_microsoft(loc, page_microsoft(loc, "/api/microsoft/lier")) == "/?microsoft=lie"
    r = loc.post("/api/securite/mode", json={"mode": "microsoft_mfa"}, headers=H)
    assert r.status_code == 422 and "Authenticator" in r.json()["champs"]["mode"]  # pas soi-même connecté avec la double auth.
    assert loc.post("/api/securite/mode", json={"mode": "microsoft"}, headers=H).json()["mode"] == "microsoft"
    assert app["local"]().post("/api/connexion", headers=H, json={"identifiant": "paul"}).status_code == 403  # plus de choix du nom
    assert loc.post("/api/securite/delier", headers=H).status_code == 422  # délier en mode Microsoft : se bloquerait
    MS["mfa"] = True
    m = app["local"]()
    assert retour_microsoft(m, page_microsoft(m)) == "/"
    assert m.post("/api/securite/mode", json={"mode": "microsoft_mfa"}, headers=H).json()["mode"] == "microsoft_mfa"
    assert m.post("/api/securite/mode", json={"mode": ""}, headers=H).json()["mode"] == ""
    assert app["local"]().get("/api/connexion/options").json()["choix_du_nom"] is True


def test_sessions_durcies_et_en_tetes(app):
    MS.update(adresse=CLAIRE, nom="Claire Moreau", mfa=True)
    c = app["en_ligne"]()
    assert retour_microsoft(c, page_microsoft(c)) == "/"
    autre = app["en_ligne"]()
    assert retour_microsoft(autre, page_microsoft(autre)) == "/"
    assert c.post("/api/securite/fermer-sessions", headers=H).json() == {"ok": True}
    assert c.get("/api/moi").status_code == 200 and autre.get("/api/moi").status_code == 401
    vole = app["en_ligne"]()  # cookie de session volé, utilisé par un autre navigateur (la session est alors fermée)
    vole.cookies.update(c.cookies)
    assert vole.get("/api/moi", headers={"User-Agent": "Pirate/1.0"}).status_code == 401

    c = app["en_ligne"]()
    assert retour_microsoft(c, page_microsoft(c)) == "/"
    sid = next(k.value for k in c.cookies if k.name == "__Host-avis_cfe")  # 2 h sans activité : session fermée
    chemin = os.path.join(DOSSIER, "sessions", "sess_" + unquote(sid))
    contenu = open(chemin, encoding="utf-8").read()
    assert re.search(r"\bvu\|i:\d+;", contenu)
    open(chemin, "w", encoding="utf-8").write(re.sub(r"\bvu\|i:\d+;", f"vu|i:{int(time.time()) - 2 * 3600 - 5};", contenu))
    assert c.get("/api/moi").status_code == 401

    page = app["en_ligne"]().get("/")
    for k in ("Permissions-Policy", "Cross-Origin-Opener-Policy", "Cross-Origin-Resource-Policy", "Strict-Transport-Security"):
        assert k in page.headers, k
    assert "base-uri 'none'" in page.headers["Content-Security-Policy"] and "frame-ancestors 'none'" in page.headers["Content-Security-Policy"]
    assert page.headers["X-Frame-Options"] == "DENY" and "X-Powered-By" not in page.headers


def test_essais_bloques_et_journal_de_securite(app):
    regler(ModeConnexion="")  # en ligne, mode « Microsoft ou mot de passe » : mot de passe de secours
    c = app["en_ligne"]()
    for _ in range(5):
        assert c.post("/api/connexion", headers=H, json={"identifiant": "paul", "mot_de_passe": "x"}).status_code == 401
    assert c.post("/api/connexion", headers=H, json={"identifiant": "paul", "mot_de_passe": app["mdp"]["paul"]}).status_code == 429
    json.dump({"compte:claire": [int(time.time())] * 10}, open(os.path.join(DOSSIER, "essais.json"), "w"))
    assert app["en_ligne"]().post("/api/connexion", headers=H, json={"identifiant": "claire", "mot_de_passe": app["mdp"]["claire"]}).status_code == 429
    os.remove(os.path.join(DOSSIER, "essais.json"))

    regler(ModeConnexion="microsoft_mfa")
    MS.update(adresse="intrus@cabinet-exemple.fr", nom="Intrus", mfa=True)
    i = app["en_ligne"]()
    retour_microsoft(i, page_microsoft(i))
    MS.update(adresse=CLAIRE, nom="Claire Moreau", mfa=False)
    m = app["en_ligne"]()
    assert retour_microsoft(m, page_microsoft(m)) == "/?microsoft=mfa"
    MS["mfa"] = True
    assert retour_microsoft(m, page_microsoft(m)) == "/"
    with open(os.path.join(DOSSIER, "journal-securite.jsonl"), "a", encoding="utf-8") as f:  # ligne de plus de 12 mois
        f.write(json.dumps({"t": "2024-01-01T10:00:00+01:00", "evt": "connexion", "compte": "claire", "ip": "1.2.3.4"}) + "\n")
    evts = [(l["evt"], l.get("compte"), l.get("motif")) for l in journal()]
    assert ("connexion_refusee", "paul", None) in evts and ("connexion_bloquee", "paul", None) in evts
    assert ("connexion_refusee", None, "compte non lié") in evts
    assert ("connexion_refusee", "claire", "sans double authentification") in evts
    assert ("microsoft_lie", "claire", "première connexion") in evts
    assert app["mdp"]["paul"] not in open(os.path.join(DOSSIER, "journal-securite.jsonl"), encoding="utf-8").read()
    j = m.get("/api/securite").json()["journal"]
    assert j[0]["evt"] == "connexion" and j[0]["methode"] == "microsoft" and j[0]["mfa"] is True and j[0]["ip"] == "127.0.0.1"
    assert not any(x["ip"] == "1.2.3.4" for x in j)  # plus de 12 mois : plus montré
    assert m.post("/api/deconnexion", headers=H).json() == {"ok": True} and journal()[-1]["evt"] == "deconnexion"


def test_connecter_ma_boite_verifie_le_jeton_et_lie_le_compte(app):
    """« Connecter ma boîte » (adresse de retour collée) : jeton d'identité vérifié, compte Microsoft du cabinet lié du même coup."""
    c = app["local"]()
    c.post("/api/connexion", headers=H, json={"identifiant": "paul"})
    MS.update(adresse=PAUL, aud="autre-application")
    r = c.post("/api/outlook/connexion", headers=H).json()
    etat = parse_qs(urlparse(r["url"]).query)["state"][0]
    assert r["automatique"] is True and parse_qs(urlparse(r["url"]).query)["prompt"] == ["select_account"]
    assert c.post("/api/outlook/connexion/retour", json={"adresse": f"http://localhost/?code={code_pour(r['url'])}&state={etat}"}, headers=H).status_code == 409
    MS.pop("aud")
    r = c.post("/api/outlook/connexion", headers=H).json()
    etat = parse_qs(urlparse(r["url"]).query)["state"][0]
    assert c.post("/api/outlook/connexion/retour", json={"adresse": f"http://localhost/?code={code_pour(r['url'])}&state={etat}"},
                  headers=H).json() == {"ok": True, "adresse": PAUL}
    assert comptes()["paul"]["microsoft"]["adresse"] == PAUL
    assert "t" not in open(os.path.join(DOSSIER, "outlook", "paul.json"), encoding="utf-8").read().split('"chiffre"')[0]  # jetons chiffrés


def test_secret_application_web_en_ligne(app):
    """Adresse du site en plateforme « Web » : le serveur échange le code avec le secret de l'application, gardé chiffré."""
    loc = app["local"]()
    assert loc.post("/api/connexion", headers=H, json={"identifiant": "claire"}).status_code == 200
    assert loc.post("/api/outlook/reglages", json={"secret": " Abc8Q~secret-exemple_42 "}, headers=H).json()["secret"] is True
    assert "Abc8Q" not in open(os.path.join(DOSSIER, "parametres.json"), encoding="utf-8").read()  # jamais en clair
    MS.update(adresse=CLAIRE, nom="Claire Moreau", mfa=True, exige_secret="Abc8Q~secret-exemple_42")
    c = app["en_ligne"]()
    assert retour_microsoft(c, page_microsoft(c)) == "/" and c.get("/api/moi").json()["identifiant"] == "claire"
    assert loc.post("/api/outlook/reglages", json={"secret": ""}, headers=H).json()["secret"] is False  # retiré : Microsoft refuse
    c = app["en_ligne"]()
    assert retour_microsoft(c, page_microsoft(c)) == "/?microsoft=erreur" and c.get("/api/moi").status_code == 401
