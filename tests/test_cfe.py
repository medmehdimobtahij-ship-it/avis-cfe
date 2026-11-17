"""Avis de CFE : statuts d'après impots.gouv (paiements, dettes), les quatre mails types (prélèvement, télérèglement par le cabinet,
avis à 0 €, à contester), vous / tu, filtre « Année » et colonnes N / N-1, case « Envoyé » (Éléments envoyés ou à la main),
importance haute, brouillons, dossiers de test. Données ComptaZap telles que l'import du navigateur les envoie."""
import hashlib
import json
import os
import re

import pytest

from commun import DOSSIER, GRAPH, H, MS, connecter_boite

NBSP = " "
PDF = b"%PDF-1.4 avis"
SHA = hashlib.sha256(PDF).hexdigest()
# siren, client, commune, référence, montant, mode, date de prélèvement (sociétés et numéros inventés)
AVIS = [
    ("111111111", "SAS ALPHA", "VILLE DE PARIS", "0000260000001", "487.0", "PAIEMENT_EN_LIGNE", None),
    ("222222222", "SAS KAPPA", "VILLE DE PARIS", "0000260000002", "487.0", "PRELEVEMENT_ECHEANCE", "28/12/2026"),
    ("333333333", "SAS PAYEE", "LILLE", "0000260000003", "83.0", "PAIEMENT_EN_LIGNE", None),
    ("444444444", "SAS ZERO", "LILLE", "0000260000004", "0.0", "PAIEMENT_EN_LIGNE", None),
    ("555555555", "M DUPONT LEON", "VILLE DE PARIS", "0000260000005", "456.0", "PAIEMENT_EN_LIGNE", None),
    ("555555555", "M DUPONT LEON", "LEVALLOIS-PERRET", "0000260000006", "310.0", "PAIEMENT_EN_LIGNE", None),
    ("666666666", "SAS MYSTERE", "NICE", "0000260000007", "262.0", "PAIEMENT_EN_LIGNE", None),
    ("777777777", "SAS PARTIEL", "NICE", "0000260000008", "500.0", "PAIEMENT_EN_LIGNE", None),
    ("888888888", "SAS REGUL", "NICE", "0000260000009", "100.0", "PAIEMENT_EN_LIGNE", None),
]
PAIEMENTS = {"0000260000001": ("A_PAYER", None), "0000260000002": ("A_PAYER", None), "0000260000003": ("PAYE", "20/11/2026"),
             "0000260000005": ("A_PAYER", None), "0000260000006": ("A_PAYER", None), "0000260000008": ("A_PAYER", None),
             "0000260000009": ("PAYE", "20/11/2026")}
DETTES = {"0000260000001": ("ACTIVE", "487.0"), "0000260000002": ("ACTIVE", "487.0"), "0000260000005": ("ACTIVE", "456.0"),
          "0000260000006": ("ACTIVE", "310.0"), "0000260000008": ("ACTIVE", "200.0"), "0000260000009": ("REGULARISEE", "0.0")}
ANNUAIRE = [{"entreprise": "ALPHA", "prenom": "Jean", "nom": "DUPONT", "email": "jean@alpha.example.com", "civilite": "M", "formule": "Vous", "source": "Pennylane"},
            {"entreprise": "LEON DUPONT [LMNP]", "prenom": "Léon", "nom": "Dupont", "email": "leon@example.com", "civilite": "M", "formule": "Vous", "source": "Pennylane"},
            {"entreprise": "KAPPA", "prenom": "Nora", "nom": "BLANC", "email": "nora@kappa.example.com", "civilite": "", "formule": "Vous", "source": "Pennylane"}]


def ecrire(chemin, valeur):
    chemin = os.path.join(DOSSIER, *chemin.split("/"))
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    json.dump(valeur, open(chemin, "w", encoding="utf-8"))


@pytest.fixture()
def cfe(app):
    docs = [{"siren": s, "client_name": n, "annee_imposition": 2026, "commune": c, "reference_avis": r, "montant_du": m,
             "date_limite_paiement": "15/12/2026", "mode_paiement": mode, "date_prelevement": prel, "pdf": {"sha256": SHA, "nom": f"CFE-2026-{c}.pdf"},
             "dossier_export": ""} for s, n, c, r, m, mode, prel in AVIS]
    docs.append({"siren": "111111111", "client_name": "SAS ALPHA", "annee_imposition": 2025, "commune": "VILLE DE PARIS", "reference_avis": "0000250000001",
                 "montant_du": "80", "date_limite_paiement": "15/12/2025", "mode_paiement": "PAIEMENT_EN_LIGNE", "date_prelevement": None,
                 "pdf": {"sha256": SHA, "nom": "CFE-2025.pdf"}, "dossier_export": ""})
    ecrire("cfe/comptazap-claire.json", {"recu_le": "2026-11-06T10:00", "maj_comptazap": "2026-11-02T14:52", "documents": docs,
                                         "paiements": [{"annee": 2026, "reference": f"Facture n°{r}", "payment_state": e, "payment_method": "TELEREGLEMENT" if q else "INCONNU",
                                                        "paiement_date": q} for r, (e, q) in PAIEMENTS.items()]
                                         + [{"annee": 2025, "reference": "Facture n°0000250000001", "payment_state": "PAYE", "payment_method": "TELEREGLEMENT", "paiement_date": "01/12/2025"}],
                                         "dettes": [{"annee": 2026, "impot": "CFE", "reference_dette": f"Facture n°{r}", "status": st, "solde": so}
                                                    for r, (st, so) in DETTES.items()]})
    os.makedirs(os.path.join(DOSSIER, "cfe", "avis"), exist_ok=True)
    open(os.path.join(DOSSIER, "cfe", "avis", f"{SHA}.pdf"), "wb").write(PDF)
    ecrire("cfe/annuaire.json", {"contacts": ANNUAIRE, "source": "Pennylane", "maj": "2026-11-01T09:00"})
    c = app["local"]()
    assert c.post("/api/connexion", headers=H, json={"identifiant": "claire", "mot_de_passe": app["mdp"]["claire"]}).status_code == 200
    return c


def lignes(c, annee=None):
    return {l["cle"]: l for l in c.get("/api/cfe" + (f"?annee={annee}" if annee else "")).json()["lignes"]}


def mail(c, cle, **plus):
    r = c.post("/api/cfe/apercu", json={"cle": cle, **plus}, headers=H)
    assert r.status_code == 200, r.text
    return r.json()


def contact(c, siren, **champs):
    assert c.post("/api/cfe/contact", json={"siren": siren, **champs}, headers=H).status_code == 200


def test_statuts_et_montants(cfe):
    l = lignes(cfe, 2026)
    statuts = {k.split(":")[1]: x["statut"] for k, x in l.items() if k.startswith("2026:")}
    assert statuts == {"111111111": "à payer", "222222222": "prélèvement", "333333333": "payé", "444444444": "rien à payer",
                       "555555555": "à payer", "666666666": "à vérifier", "777777777": "à payer", "888888888": "payé"}
    assert l["2026:555555555"]["montant"] == 76600 and l["2026:777777777"]["montant"] == 20000  # acompte déjà payé : reste dû
    assert l["2026:111111111"]["contact"]["source"] == "Pennylane" and l["2026:666666666"]["contact"]["email"] == ""


def test_mail_a_payer_telereglement_par_le_cabinet(cfe):
    m = mail(cfe, "2026:111111111")
    assert m["objet"] == "ALPHA - Avis de CFE 2026" and m["modele"] == "CORPS_CFE_VIREMENT"
    t = m["texte"]
    assert t.startswith("Bonjour Monsieur Dupont,\n\nVous trouverez ci-joint l'avis de cotisation foncière des entreprises (CFE) 2026 d'ALPHA, ")
    assert f"d'un montant de 487{NBSP}€, à régler au plus tard le 15 décembre 2026" in t
    assert "le cabinet procédera au télérèglement de cette cotisation" in t and re.search(r"d'ici le vendredi \d+(er)? \w+", t)  # date d'ordre : jamais passée
    assert "impots.gouv" not in t and "nous procéderons" not in t and "–" not in t and "—" not in t
    assert m["pieces"] == ["CFE-2026-VILLE DE PARIS.pdf"] and "<p" in m["html"]
    tu = mail(cfe, "2026:111111111", modele="CORPS_CFE_VIREMENT_TU")["texte"]
    assert tu.startswith("Bonjour Jean,\n\nTu trouveras ci-joint l'avis") and "Sauf instruction contraire de ta part" in tu
    assert cfe.post("/api/cfe/parametres", json={"DATE_ORDRE_CFE": "lundi 16 novembre"}, headers=H).status_code == 200
    assert "d'ici le lundi 16 novembre" in mail(cfe, "2026:111111111")["texte"]


def test_mail_prelevement_et_civilite_inconnue(cfe):
    m = mail(cfe, "2026:222222222")
    assert m["modele"] == "CORPS_CFE_PRELEVEMENT" and m["texte"].startswith("Bonjour Nora Blanc,")
    assert "elle sera débitée courant décembre" in m["texte"] and "Vous n'avez aucune démarche à effectuer" in m["texte"]
    contact(cfe, "222222222", formule="Tu")
    assert "Tu n'as aucune démarche à effectuer" in mail(cfe, "2026:222222222")["texte"]
    contact(cfe, "222222222", formule="Vous", prenom="", nom="")
    assert mail(cfe, "2026:222222222")["texte"].startswith("Bonjour,\n")


def test_mail_deux_avis(cfe):
    m = mail(cfe, "2026:555555555")
    assert m["objet"] == "LEON DUPONT - Avis de CFE 2026"
    assert "ci-joint les avis" in m["texte"] and f"d'un montant de 766{NBSP}€ (" in m["texte"]
    assert f"456{NBSP}€ pour Ville de Paris" in m["texte"] and f"310{NBSP}€ pour Levallois-Perret" in m["texte"] and len(m["pieces"]) == 2


def test_copie_generale_et_copie_du_client(cfe):
    cfe.post("/api/cfe/parametres", json={"COPIE_CFE": "archives@cabinet-exemple.fr"}, headers=H)
    contact(cfe, "111111111", cc="associe@alpha.example.com")
    assert mail(cfe, "2026:111111111")["cc"] == "archives@cabinet-exemple.fr, associe@alpha.example.com"


def test_tutoiement_sans_prenom(cfe):
    contact(cfe, "111111111", formule="Tu", prenom="", nom="")
    assert mail(cfe, "2026:111111111")["texte"].startswith("Bonjour,\n")


def test_avis_a_contester(cfe):
    assert cfe.post("/api/cfe/contestation", json={"annee": 2026, "siren": "111111111", "commentaire": "Local en sous-location"}, headers=H).status_code == 200
    m = mail(cfe, "2026:111111111")
    assert m["modele"] == "CORPS_CFE_CONTESTATION" and "Après analyse, nous pensons qu'il y a une erreur" in m["texte"]
    assert "avant l'échéance du 15 décembre 2026" in m["texte"]
    contact(cfe, "111111111", formule="Tu")
    assert "Nous te tiendrons au courant" in mail(cfe, "2026:111111111")["texte"]


def test_jamais_de_tiret_long(cfe):
    assert cfe.post("/api/cfe/parametres", json={"OBJET_CFE": "{societe} – Avis de CFE {annee}"}, headers=H).status_code == 200
    assert mail(cfe, "2026:111111111")["objet"] == "ALPHA - Avis de CFE 2026"


def test_filtre_annee_et_colonnes_n_1(cfe):
    d = cfe.get("/api/cfe?annee=2026").json()
    assert d["annee"] == 2026 and 2025 in d["annees"] and 2026 in d["annees"]
    alpha = d["lignes"][[l["cle"] for l in d["lignes"]].index("2026:111111111")]
    assert alpha["prec"]["annee"] == 2025 and alpha["prec"]["total"] == 8000 and alpha["total_avis"] == 48700  # Var. : +407 €
    d = cfe.get("/api/cfe?annee=2025").json()
    assert d["annee"] == 2025 and [l["cle"] for l in d["lignes"]] == ["2025:111111111"] and d["lignes"][0]["statut"] == "payé"


def test_envoye_coche_seul_ou_a_la_main(cfe):
    connecter_boite(cfe)
    MS["envoyes"] = [{"id": "s1", "subject": "KAPPA – Avis de CFE 2026", "toRecipients": [{"emailAddress": {"address": "ancien@kappa.example.com"}}],
                      "ccRecipients": [], "sentDateTime": "2026-11-03T09:00:00Z", "webLink": ""}]  # ancien mail : tiret long, autre e-mail
    l = lignes(cfe, 2026)
    assert l["2026:222222222"]["envoye"] is True and l["2026:222222222"]["envoi_outlook"].startswith("2026-11-03")
    # décochée à la main : ce mail n'était pas l'avis, il n'est plus compté ; recochée : envoyée aujourd'hui
    assert cfe.post("/api/cfe/envoye", json={"annee": 2026, "siren": "222222222", "etat": False, "trouve": True}, headers=H).status_code == 200
    l = lignes(cfe, 2026)["2026:222222222"]
    assert l["envoye"] is False and l["refuse"] is True
    assert json.load(open(os.path.join(DOSSIER, "cfe", "envois-cfe.json"), encoding="utf-8"))["2026"]["222222222"] == "non"
    cfe.post("/api/cfe/envoye", json={"annee": 2026, "siren": "222222222", "etat": True}, headers=H)
    assert lignes(cfe, 2026)["2026:222222222"]["envoye"] is True
    # envoi d'ici : case cochée toute seule ; avis à contester : part quand même, avec le mail de demande de précisions
    cfe.post("/api/cfe/contestation", json={"annee": 2026, "siren": "111111111", "commentaire": "à vérifier"}, headers=H)
    cfe.post("/api/cfe/parametres", json={"IMPORTANCE_CFE": "oui"}, headers=H)
    GRAPH.clear()
    r = cfe.post("/api/cfe/envoyer", json={"cle": "2026:111111111"}, headers=H)
    assert r.json()["ok"] is True and r.json()["demo"] is False, r.text
    msg = [corps for m, ch, corps in GRAPH if m == "POST" and ch == "/me/messages"][0]
    assert msg["importance"] == "high" and msg["subject"] == "ALPHA - Avis de CFE 2026" and "Après analyse" in msg["body"]["content"]
    assert any(ch.endswith("/attachments") and x["name"] == "CFE-2026-VILLE DE PARIS.pdf" for m, ch, x in GRAPH if m == "POST")
    assert lignes(cfe, 2026)["2026:111111111"]["envoi_manuel"] is not None


def test_echanges_par_fil(cfe):
    connecter_boite(cfe)
    MS["messages"] = [{"id": "m1", "conversationId": "c1", "subject": "RE: ALPHA - Avis de CFE 2026", "isDraft": False, "parentFolderId": "inbox",
                       "from": {"emailAddress": {"address": "jean@alpha.example.com", "name": "Jean Dupont"}},
                       "toRecipients": [{"emailAddress": {"address": "claire.moreau@cabinet-exemple.fr"}}], "ccRecipients": [],
                       "receivedDateTime": "2026-11-05T08:00:00Z", "isRead": False, "bodyPreview": "Merci", "hasAttachments": False}]
    d = cfe.get("/api/cfe/echanges?annee=2026").json()
    assert d["connecte"] is True and d["mails"][0]["entrant"] is True and d["mails"][0]["lu"] is False


def test_brouillon_sans_envoi(cfe):
    connecter_boite(cfe)
    GRAPH.clear()
    r = cfe.post("/api/cfe/brouillon", json={"cle": "2026:555555555"}, headers=H).json()
    assert r["ok"] is True and r["lien"].startswith("https://outlook.office.com/brouillon/")
    assert sum(1 for m, ch, _ in GRAPH if m == "POST" and ch.endswith("/attachments")) == 2 and not any(ch.endswith("/send") for _, ch, _ in GRAPH)
    assert lignes(cfe, 2026)["2026:555555555"]["envoye"] is False  # un brouillon n'est pas un envoi


def test_dossiers_de_test_seulement_sur_demande(cfe):
    os.makedirs(os.path.join(DOSSIER, "cfe", "test"), exist_ok=True)
    open(os.path.join(DOSSIER, "cfe", "test", "faux.pdf"), "wb").write(b"%PDF faux")
    ecrire("cfe/dossiers-test.json", [{"siren": "999999999", "nom": "TEST CABINET", "avis": {"montant": 12, "statut": "à payer", "pdf": "faux.pdf",
                                       "date_limite": "15/12/2026", "commune": "PARIS"}, "contact": {"email": "claire.moreau@cabinet-exemple.fr"}}])
    assert "2026:999999999" not in lignes(cfe, 2026)
    cfe.post("/api/cfe/parametres", json={"DOSSIERS_TEST_CFE": "oui"}, headers=H)
    assert lignes(cfe, 2026)["2026:999999999"]["test"] is True


def test_dossier_de_test_garde_interlocuteur_et_contestation(cfe):
    """SIREN « TEST00001 » des dossiers de test : enregistré tel quel."""
    os.makedirs(os.path.join(DOSSIER, "cfe", "test"), exist_ok=True)
    open(os.path.join(DOSSIER, "cfe", "test", "faux.pdf"), "wb").write(b"%PDF faux")
    ecrire("cfe/dossiers-test.json", [{"siren": "TEST00001", "nom": "SAS TEST", "avis": {"montant": 12, "statut": "à payer", "pdf": "faux.pdf",
                                       "date_limite": "15/12/2026", "commune": "PARIS"}, "contact": {"email": "claire.moreau@cabinet-exemple.fr", "civilite": "M"}}])
    cfe.post("/api/cfe/parametres", json={"DOSSIERS_TEST_CFE": "oui"}, headers=H)
    contact(cfe, "TEST00001", civilite="Mme", prenom="Zoé")
    assert cfe.post("/api/cfe/contestation", json={"annee": 2026, "siren": "TEST00001", "commentaire": "essai"}, headers=H).status_code == 200
    l = lignes(cfe, 2026)["2026:TEST00001"]
    assert (l["contact"]["civilite"], l["contact"]["prenom"]) == ("Mme", "Zoé") and l["contestation"]["commentaire"] == "essai"


def test_avis_a_zero_euro_le_client_est_informe(cfe):
    m = mail(cfe, "2026:444444444")
    assert m["modele"] == "CORPS_CFE_RIEN" and m["objet"].endswith("- Avis de CFE 2026") and len(m["pieces"]) == 1
    assert "Le montant à payer est de 0 € : vous n'avez aucun règlement à prévoir" in m["texte"] and "télérèglement" not in m["texte"]
    contact(cfe, "444444444", formule="Tu", prenom="Paul")
    assert mail(cfe, "2026:444444444")["texte"].startswith("Bonjour Paul,\n\nTu trouveras ci-joint l'avis")


def test_mail_modifie_avant_envoi(cfe):
    """Objet et texte corrigés dans la fenêtre : c'est ce texte qui part (nettoyé), avec la signature et l'avis joint ; le
    destinataire reste celui du dossier. Sans modification : le mail préparé, inchangé."""
    connecter_boite(cfe)
    GRAPH.clear()
    r = cfe.post("/api/cfe/envoyer", headers=H, json={"cle": "2026:111111111", "objet": "  ALPHA -  CFE 2026\n(corrigé) ", "a": "pirate@example.com",
                                                     "html": "<p>Bonjour Jean, <b>texte corrigé</b>.</p><script>alert(1)</script><p onclick=\"x()\">Merci</p>"})
    assert r.json()["ok"] is True and r.json()["a"] == "jean@alpha.example.com", r.text
    msg = [corps for m, ch, corps in GRAPH if m == "POST" and ch == "/me/messages"][0]
    html = msg["body"]["content"]
    assert msg["subject"] == "ALPHA - CFE 2026 (corrigé)" and msg["toRecipients"] == [{"emailAddress": {"address": "jean@alpha.example.com"}}]
    assert "<b>texte corrigé</b>" in html and "script" not in html and "onclick" not in html and "Claire Moreau" in html  # signature ajoutée
    assert "Cabinet Exemple" in html  # nom du cabinet (réglage) dans la signature simple
    assert any(ch.endswith("/attachments") and x["name"] == "CFE-2026-VILLE DE PARIS.pdf" for m, ch, x in GRAPH if m == "POST")
    GRAPH.clear()  # texte vide (rien de modifié) : le mail préparé part tel quel
    cfe.post("/api/cfe/envoyer", headers=H, json={"cle": "2026:555555555", "html": "  ", "objet": ""})
    msg = [corps for m, ch, corps in GRAPH if m == "POST" and ch == "/me/messages"][0]
    assert msg["subject"] == mail(cfe, "2026:555555555")["objet"]
