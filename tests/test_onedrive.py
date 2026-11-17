"""Rangement des avis dans les dossiers clients du SharePoint (faux SharePoint) : dossier du client retrouvé par son nom,
sous-dossiers créés si besoin, jamais rien de remplacé ; avis déjà rangé reconnu (même contenu, autre nom) ; choix à la main."""
import hashlib
import json
import os

from commun import DOSSIER, GRAPH, H, SP, connecter_boite, sp_ajouter, sp_enfant

PDF_A, PDF_B = b"%PDF-1.4 avis A", b"%PDF-1.4 avis B"


def ecrire(chemin, valeur):
    chemin = os.path.join(DOSSIER, *chemin.split("/"))
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    json.dump(valeur, open(chemin, "w", encoding="utf-8"))


def avis(siren, nom, ref, pdf):
    sha = hashlib.sha256(pdf).hexdigest()
    os.makedirs(os.path.join(DOSSIER, "cfe", "avis"), exist_ok=True)
    open(os.path.join(DOSSIER, "cfe", "avis", f"{sha}.pdf"), "wb").write(pdf)
    return {"siren": siren, "client_name": nom, "annee_imposition": 2026, "commune": "LYON", "reference_avis": ref, "montant_du": "100",
            "date_limite_paiement": "15/12/2026", "mode_paiement": "PAIEMENT_EN_LIGNE", "pdf": {"sha256": sha, "nom": f"{ref}.pdf"}, "dossier_export": ""}


def test_rangement_sans_ecrasement(app):
    ecrire("cfe/comptazap-claire.json", {"recu_le": "2026-11-06T10:00", "documents": [
        avis("111111111", "SAS BON GOUT", "0000260000011", PDF_A), avis("222222222", "M DURAND PAUL", "0000260000012", PDF_B),
        avis("333333333", "SAS INCONNUE", "0000260000013", PDF_A + b"x")], "paiements": [], "dettes": []})
    bon_gout = sp_ajouter("racine", "BONGOUT", dossier=True)  # « BON GOUT » / « BONGOUT » : même dossier
    durand = sp_ajouter("racine", "PAUL DURAND", dossier=True)  # mots dans le désordre, sans la civilité
    sp_ajouter("racine", "0. Modele", dossier=True)
    cfe_durand = sp_ajouter(sp_ajouter(sp_ajouter(durand, "2026", dossier=True), "FISCAL", dossier=True), "07-CFE", dossier=True)
    sp_ajouter(cfe_durand, "deja-la.pdf", contenu=PDF_B)  # même contenu sous un autre nom : déjà rangé
    c = app["local"]()
    assert c.post("/api/connexion", headers=H, json={"identifiant": "claire", "mot_de_passe": app["mdp"]["claire"]}).status_code == 200
    connecter_boite(c)
    plan = {l["siren"]: l for l in c.post("/api/cfe/onedrive/plan", json={"annee": 2026}, headers=H).json()["lignes"]}
    assert (plan["111111111"]["etat"], plan["111111111"]["client"], plan["111111111"]["a_creer"]) == ("à copier", "BONGOUT", True)
    assert plan["111111111"]["nom"] == "BONGOUT AVIS CFE 2026.pdf"
    assert (plan["222222222"]["etat"], plan["222222222"]["nom"]) == ("déjà rangé", "deja-la.pdf")
    assert plan["333333333"]["etat"] == "pas de dossier OneDrive"
    assert c.post("/api/cfe/onedrive/copier", json={"cle": "111111111:0000260000011", "annee": 2026}, headers=H).json()["ok"] is True
    rangee = sp_enfant(sp_enfant(sp_enfant(sp_enfant(bon_gout, "2026"), "FISCAL"), "07-CFE"), "BONGOUT AVIS CFE 2026.pdf")
    assert rangee and SP[rangee]["contenu"] == PDF_A  # sous-dossiers créés, avis copié
    # Recopie : déjà rangé ; un autre fichier du même nom n'est jamais remplacé
    assert c.post("/api/cfe/onedrive/copier", json={"cle": "111111111:0000260000011", "annee": 2026}, headers=H).status_code == 409
    SP[rangee]["contenu"] = b"%PDF autre version"
    plan = {l["siren"]: l for l in c.post("/api/cfe/onedrive/plan", json={"annee": 2026}, headers=H).json()["lignes"]}
    assert plan["111111111"]["etat"] == "autre fichier du même nom"
    assert sum(1 for m, _, _ in GRAPH if m == "PUT") == 1  # un seul fichier envoyé en tout, jamais de remplacement
    # Dossier choisi à la main pour la société inconnue
    assert "BONGOUT" in c.get("/api/cfe/onedrive/clients").json()["clients"]
    assert "0. Modele" not in c.get("/api/cfe/onedrive/clients").json()["clients"]
    c.post("/api/cfe/onedrive/choisir", json={"siren": "333333333", "client": "PAUL DURAND"}, headers=H)
    plan = {l["siren"]: l for l in c.post("/api/cfe/onedrive/plan", json={"annee": 2026}, headers=H).json()["lignes"]}
    assert plan["333333333"]["client"] == "PAUL DURAND" and plan["333333333"]["etat"] == "à copier"
    assert c.post("/api/cfe/onedrive/lien", json={"siren": "222222222", "annee": 2026}, headers=H).json()["lien"].startswith("https://exemple.sharepoint.com/")


def test_pdf_des_avis_recuperes_dans_la_sauvegarde(app):
    """PDF manquants pris dans la sauvegarde ComptaZap du SharePoint : « NOM - SIREN › CFE › …-<référence>.pdf »."""
    ecrire("cfe/comptazap-claire.json", {"recu_le": "2026-11-06T10:00", "documents": [
        {"siren": "111111111", "client_name": "SAS BON GOUT", "annee_imposition": 2026, "commune": "LYON", "reference_avis": "0000260000021",
         "montant_du": "100", "pdf": {"sha256": "a" * 64, "nom": "x.pdf"}, "dossier_export": ""}], "paiements": [], "dettes": []})
    client = sp_ajouter("racine", "BON GOUT - 111111111", dossier=True)  # la sauvegarde, à la racine du faux SharePoint
    sp_ajouter(sp_ajouter(client, "CFE", dossier=True), "CFE-2026-LYON-0000260000021.pdf", contenu=PDF_A)
    c = app["local"]()
    c.post("/api/connexion", headers=H, json={"identifiant": "claire", "mot_de_passe": app["mdp"]["claire"]})
    connecter_boite(c)
    r = c.post("/api/cfe/pdf/reseau", json={"cles": ["a" * 64]}, headers=H).json()
    assert r == {"ok": ["a" * 64], "absents": []}
    assert c.get(f"/api/cfe/avis/{'a' * 64}").content == PDF_A
