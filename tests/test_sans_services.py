"""Un cabinet sans ComptaZap, sans Microsoft 365, sans SharePoint ni Pennylane : tout le travail se fait quand même.
Avis importés d'un fichier (CSV ou Excel) ou saisis, PDF ajoutés à la main, interlocuteurs d'un fichier ou saisis, mail en .eml
(avis joint) ou dans la messagerie du PC, case « Envoyé » cochée à la main, PDF téléchargés au lieu du rangement OneDrive."""
import base64
import email
import io
import os
import zipfile
from email import policy

from commun import GRAPH, H, PL, RACINE

PDF = b"%PDF-1.4\n% avis\n%%EOF\n"
b64 = lambda o: base64.b64encode(o).decode()


def exemple(nom):
    return open(os.path.join(RACINE, "exemples", nom), "rb").read()


def lignes(c, annee=2026):
    return {l["siren"]: l for l in c.get(f"/api/cfe?annee={annee}").json()["lignes"]}


def test_services_non_configures(nu):
    s = nu.get("/api/integrations").json()
    assert s["microsoft"]["configure"] is False and s["sharepoint"]["configure"] is False and s["pennylane"]["connecte"] is False
    assert s["comptazap"]["recu_le"] == "" and s["annuaire"]["contacts"] == 0 and s["cabinet"] == "Cabinet Exemple"
    d = nu.get("/api/cfe").json()
    assert d["lignes"] == [] and d["microsoft"] is False and d["sharepoint"] is False and d["boite"] == ""
    assert nu.get("/api/cfe/echanges").json() == {"connecte": False, "mails": []}  # sans Outlook : rien à lire, pas d'erreur
    r = nu.post("/api/cfe/onedrive/plan", json={"annee": 2026}, headers=H)
    assert r.status_code == 409 and "pas configuré" in r.json()["erreur"]
    assert nu.get("/api/connexion/options").json()["microsoft"] is False
    assert nu.post("/api/parametres/cabinet", json={"nom": "Fiduciaire Exemple"}, headers=H).json() == {"cabinet": "Fiduciaire Exemple"}
    assert "Fiduciaire Exemple" in nu.get("/api/signature").json()["html"]
    assert not GRAPH and not PL["appels"]  # aucun appel aux services


def test_import_csv_des_avis_et_des_interlocuteurs(nu):
    r = nu.post("/api/cfe/avis/fichier", json={"contenu": b64(exemple("avis-cfe-exemple.csv"))}, headers=H).json()
    assert r["avis"] == 5 and r["erreurs"] == [] and len(r["pdfs_manquants"]) == 5
    l = lignes(nu)
    assert {s: x["statut"] for s, x in l.items()} == {"000000018": "à payer", "000000026": "prélèvement", "000000034": "payé",
                                                      "000000042": "rien à payer", "000000091": "à payer"}
    assert l["000000091"]["montant"] == 20000 and l["000000091"]["total_avis"] == 50000 and l["000000018"]["saisi"] is True
    r = nu.post("/api/cfe/annuaire/fichier", json={"contenu": b64(exemple("interlocuteurs-exemple.csv"))}, headers=H).json()
    assert r == {"contacts": 5, "ignores": 0}
    l = lignes(nu)
    c = l["000000026"]["contact"]
    assert (c["email"], c["cc"], c["civilite"], c["source"]) == ("lucie.morel@example.com", "compta@example.com", "Mme", "fichier")
    assert l["000000034"]["contact"]["formule"] == "Tu" and l["000000018"]["societe"] == "Atelier des Exemples"
    # Fichier faux : une ligne erronée n'empêche pas les autres ; colonne obligatoire absente : refusé
    csv = "societe;siren;montant\nSAS BONNE;000000059;120\nSAS FAUSSE;12;abc\n".encode()
    r = nu.post("/api/cfe/avis/fichier", json={"contenu": b64(csv)}, headers=H).json()
    assert r["avis"] == 1 and len(r["erreurs"]) == 1 and r["erreurs"][0].startswith("ligne 3")
    r = nu.post("/api/cfe/avis/fichier", json={"contenu": b64(b"nom;prix\nX;1\n")}, headers=H)
    assert r.status_code == 422


def test_import_excel(nu):
    """Classeur .xlsx minimal (chaînes partagées, nombre, date Excel) : lu sans bibliothèque."""
    partages = ["Société", "SIREN", "Montant", "Date limite", "SAS TABLEUR", "000000067"]
    feuille = ('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
               '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>'
               '<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2"><v>731.5</v></c><c r="D2"><v>46371</v></c></row>'
               '</sheetData></worksheet>')
    sst = ('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
           + "".join(f"<si><t>{x}</t></si>" for x in partages) + "</sst>")
    f = io.BytesIO()
    with zipfile.ZipFile(f, "w") as z:
        z.writestr("xl/sharedStrings.xml", sst)
        z.writestr("xl/worksheets/sheet1.xml", feuille)
    r = nu.post("/api/cfe/avis/fichier", json={"contenu": b64(f.getvalue())}, headers=H).json()
    assert r["avis"] == 1, r
    [a] = lignes(nu)["000000067"]["avis"]
    assert a["montant"] == 73150 and a["date_limite"] == "15/12/2026"


def test_saisie_pdf_eml_et_envoye_a_la_main(nu):
    r = nu.post("/api/cfe/avis", json={"societe": "SASU SAISIE EXEMPLE", "siren": "000 000 075", "annee": "2026", "commune": "Nice",
                                       "montant": "1 234,50", "date_limite": "15/12/2026", "paiement": "en ligne"}, headers=H)
    assert r.status_code == 200, r.text
    pdf = r.json()["pdf"]
    r = nu.post("/api/cfe/avis", json={"societe": "", "siren": "12", "montant": ""}, headers=H)
    assert r.status_code == 422 and set(r.json()["champs"]) == {"societe", "siren", "montant"}
    l = lignes(nu)["000000075"]
    assert l["statut"] == "à payer" and l["montant"] == 123450 and l["avis"][0]["pdf_present"] is False
    assert nu.post("/api/cfe/pdf", json={"cle": pdf, "contenu": b64(PDF)}, headers=H).json() == {"ok": True}
    assert lignes(nu)["000000075"]["avis"][0]["pdf_present"] is True
    assert nu.post("/api/cfe/contact", json={"siren": "000000075", "prenom": "Inès", "nom": "Exemple", "email": "ines@example.com",
                                             "cc": "associe@example.com", "civilite": "Mme"}, headers=H).status_code == 200
    # Sans Outlook : envoi et brouillon impossibles (message), mais le .eml contient tout, avis joint
    assert nu.post("/api/cfe/envoyer", json={"cle": "2026:000000075"}, headers=H).status_code == 409
    r = nu.post("/api/cfe/eml", json={"cle": "2026:000000075"}, headers=H)
    assert r.status_code == 200 and r.headers["Content-Type"].startswith("message/rfc822") and "attachment" in r.headers["Content-Disposition"]
    m = email.message_from_bytes(r.content, policy=policy.default)
    assert m["X-Unsent"] == "1" and m["To"] == "ines@example.com" and m["Cc"] == "associe@example.com"
    assert m["Subject"] == "SAISIE EXEMPLE - Avis de CFE 2026"
    html = m.get_body(("html",)).get_content()
    assert "Bonjour Madame Exemple" in html and "télérèglement" in html and "Cabinet Exemple" in html  # signature simple
    [pj] = list(m.iter_attachments())
    assert pj.get_content_type() == "application/pdf" and pj.get_content() == PDF
    r = nu.post("/api/cfe/eml", json={"cle": "2026:000000075", "objet": "Objet corrigé", "html": "<p>Texte corrigé</p>"}, headers=H)
    m = email.message_from_bytes(r.content, policy=policy.default)
    assert m["Subject"] == "Objet corrigé" and "Texte corrigé" in m.get_body(("html",)).get_content()
    assert lignes(nu)["000000075"]["envoye"] is False  # un .eml n'est pas un envoi : coché à la main ensuite
    nu.post("/api/cfe/envoye", json={"annee": 2026, "siren": "000000075", "etat": True}, headers=H)
    assert lignes(nu)["000000075"]["envoye"] is True
    # PDF de l'année en une archive (au lieu du rangement OneDrive), et suppression de l'avis saisi
    z = zipfile.ZipFile(io.BytesIO(nu.get("/api/cfe/avis.zip?annee=2026").content))
    assert z.namelist() == ["SASU SAISIE EXEMPLE AVIS CFE 2026.pdf"] and z.read(z.namelist()[0]) == PDF
    ref = lignes(nu)["000000075"]["avis"][0]["reference"]
    assert nu.post("/api/cfe/avis/supprimer", json={"annee": 2026, "siren": "000000075", "reference": ref}, headers=H).json() == {"ok": True}
    assert "000000075" not in lignes(nu)
    assert not GRAPH  # rien n'est allé vers Microsoft


def test_fichiers_exemple_servis(nu):
    r = nu.get("/api/exemples/avis-cfe-exemple.csv")
    assert r.status_code == 200 and r.content.startswith("Société;SIREN".encode())
    assert nu.get("/api/exemples/..%2Fconfig.exemple.json").status_code == 404
