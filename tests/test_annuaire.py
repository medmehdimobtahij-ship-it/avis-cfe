"""Annuaire des interlocuteurs repris de Pennylane (faux serveur MCP) : connexion OAuth une fois pour le cabinet (PKCE,
enregistrement dynamique), reprise par lots, puis rapprochement avec les avis par le nom de la société."""
import base64
import hashlib
import json
import os
from urllib.parse import parse_qs, urlparse

from commun import DOSSIER, H, PL


def test_pennylane_connexion_et_reprise_des_interlocuteurs(app):
    os.makedirs(os.path.join(DOSSIER, "cfe"), exist_ok=True)
    json.dump({"recu_le": "2026-11-06T10:00", "documents": [
        {"siren": "111111111", "client_name": "SAS ALPHA", "annee_imposition": 2026, "commune": "LYON", "reference_avis": "0000260000031",
         "montant_du": "100", "date_limite_paiement": "15/12/2026", "mode_paiement": "PAIEMENT_EN_LIGNE", "pdf": {"sha256": "", "nom": ""}, "dossier_export": ""}],
        "paiements": [], "dettes": [{"annee": 2026, "impot": "CFE", "reference_dette": "0000260000031", "status": "ACTIVE", "solde": "100"}]},
        open(os.path.join(DOSSIER, "cfe", "comptazap-claire.json"), "w", encoding="utf-8"))
    c = app["local"]()
    assert c.post("/api/connexion", headers=H, json={"identifiant": "claire", "mot_de_passe": app["mdp"]["claire"]}).status_code == 200
    assert c.post("/api/cfe/annuaire/synchro/debut", headers=H).json()["connecter"] is True  # pas encore connecté : on le dit

    r = c.get("/api/pennylane/connecter", allow_redirects=False)
    q = parse_qs(urlparse(r.headers["Location"]).query)
    assert r.status_code == 302 and q["code_challenge_method"] == ["S256"] and PL["inscription"]["client_name"] == "Avis de CFE"
    PL["retour"] = q["redirect_uri"][0]
    PL["defi"] = q["code_challenge"][0]
    r = c.get("/api/pennylane/retour", params={"code": "plc", "state": q["state"][0]})
    assert "pennylane=ok" in r.text
    etat = c.get("/api/cfe/annuaire").json()
    assert etat["pennylane"]["connecte"] is True and etat["pennylane"]["compte"].startswith("Claire Moreau")
    assert "pla1" not in open(os.path.join(DOSSIER, "pennylane-mcp.json"), encoding="utf-8").read()  # jetons chiffrés

    d = c.post("/api/cfe/annuaire/synchro/debut", headers=H).json()
    assert d["total"] == 3
    r = c.post("/api/cfe/annuaire/synchro/lot", json={"id": d["id"]}, headers=H).json()
    assert r["fini"] is True and r["contacts"] == 2  # le dossier sans interlocuteur n'est pas gardé
    assert ("list_companies", {"firm_id": 4242, "page": 1}) in PL["appels"]
    [l] = c.get("/api/cfe?annee=2026").json()["lignes"]
    assert (l["societe"], l["contact"]["email"], l["contact"]["civilite"], l["contact"]["source"]) == ("SAS ALPHA", "jean@alpha.example.com", "M", "Pennylane")
    # Saisie sur la ligne : passe avant l'annuaire ; « reprendre celle de l'annuaire » l'efface
    c.post("/api/cfe/contact", json={"siren": "111111111", "email": "autre@example.com"}, headers=H)
    assert c.get("/api/cfe?annee=2026").json()["lignes"][0]["contact"]["email"] == "autre@example.com"
    c.post("/api/cfe/contact", json={"siren": "111111111", "annuaire": True}, headers=H)
    assert c.get("/api/cfe?annee=2026").json()["lignes"][0]["contact"]["email"] == "jean@alpha.example.com"
    assert c.post("/api/pennylane/deconnecter", headers=H).json()["connecte"] is False and PL["revoque"] == "plr1"
