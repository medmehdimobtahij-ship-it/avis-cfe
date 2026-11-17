"""Import depuis ComptaZap (lu par le navigateur) : avis, paiements et dettes de SON ComptaZap ; PDF des avis repérés par leur
chemin dans le dossier d'export, puis envoyés à part (seulement ceux attendus, seulement des PDF)."""
import base64
from datetime import date

from commun import H

AN = date.today().year
EXPORT = r"C:\Exemple\COMPTAZAP"
CHEMIN = EXPORT + rf"\ATELIER EXEMPLE - 000000018\Fiscal\Avis CFE\CFE-{AN}-VILLE DE PARIS-0000A00000017.pdf"
DONNEES = {
    "documents": [
        {"siren": "000000018", "client_name": "SAS atelier exemple", "annee_imposition": AN, "commune": "VILLE DE PARIS", "reference_avis": "0000A00000017",
         "montant_du": 416.0, "date_limite_paiement": f"15/12/{AN}", "mode_paiement": "PAIEMENT_EN_LIGNE", "date_prelevement": None,
         "pdf_path": CHEMIN, "pdf_downloaded_at": f"{AN}-11-16T08:36:45.984Z"},
        {"siren": "123456789", "client_name": "SAS SANS PDF", "annee_imposition": AN, "commune": "LYON", "reference_avis": "11",
         "montant_du": 0.0, "date_limite_paiement": f"15/12/{AN}", "mode_paiement": "", "pdf_path": None},
        {"siren": "pas un siren", "client_name": "X"},
    ],
    "paiements": [{"annee": AN, "reference": "0000A00000017", "payment_state": "A_PAYER", "payment_method": "", "paiement_date": None}],
    "dettes": [{"annee": AN, "impot": "CFE", "reference_dette": "0000A00000017", "status": "ACTIVE", "solde": 416.0}],
    "maj_comptazap": f"{AN}-11-16T08:36:46Z",
}
PDF = b"%PDF-1.4\n% avis de CFE\n%%EOF\n"


def connecter(app, identifiant):
    c = app["local"]()
    assert c.post("/api/connexion", headers=H, json={"identifiant": identifiant, "mot_de_passe": app["mdp"][identifiant]}).status_code == 200
    return c


def test_import_cfe_et_pdf(app):
    claire, paul = connecter(app, "claire"), connecter(app, "paul")
    r = claire.post("/api/cfe/import", headers=H, json=DONNEES)
    assert r.status_code == 200, r.text
    r = r.json()
    assert r["avis"] == 2  # la ligne sans SIREN est écartée
    assert {x["siren"] for x in r["pdfs_manquants"]} == {"000000018", "123456789"}  # même sans PDF sur ce PC : cherché sur le réseau
    [m] = [x for x in r["pdfs_manquants"] if x["siren"] == "000000018"]
    assert m["reference"] == "0000A00000017" and m["dossier"] == "ATELIER EXEMPLE - 000000018" and m["nom"] == f"CFE-{AN}-VILLE DE PARIS-0000A00000017.pdf"

    d = claire.get(f"/api/cfe?annee={AN}").json()
    assert d["export_comptazap"] == EXPORT and len(d["pdfs_manquants"]) == 2
    lignes = {l["siren"]: l for l in d["lignes"]}
    assert lignes["000000018"]["statut"] == "à payer" and lignes["123456789"]["statut"] == "rien à payer"
    assert paul.get(f"/api/cfe?annee={AN}").json()["lignes"] == []  # chacun son ComptaZap

    # PDF : seulement un avis attendu, et un vrai PDF ; ensuite servi et plus demandé
    envoi = lambda c, cle, contenu: c.post("/api/cfe/pdf", headers=H, json={"cle": cle, "contenu": base64.b64encode(contenu).decode()})
    assert envoi(claire, "0" * 64, PDF).status_code == 404
    assert envoi(claire, m["cle"], b"MZ pas un pdf").status_code == 422
    assert envoi(paul, m["cle"], PDF).json() == {"ok": True}  # PDF commun au cabinet (rangé par avis)
    assert [x["siren"] for x in claire.get(f"/api/cfe?annee={AN}").json()["pdfs_manquants"]] == ["123456789"]
    r = claire.get(f"/api/cfe/avis/{m['cle']}")
    assert r.status_code == 200 and r.content == PDF
    assert "attachment" in claire.get(f"/api/cfe/avis/{m['cle']}?telecharger=1").headers["Content-Disposition"]

    # Avis retéléchargé dans ComptaZap (nouvelle date) : son PDF est redemandé
    DONNEES["documents"][0]["pdf_downloaded_at"] = f"{AN}-11-20T10:00:00Z"
    assert len(claire.post("/api/cfe/import", headers=H, json=DONNEES).json()["pdfs_manquants"]) == 2
