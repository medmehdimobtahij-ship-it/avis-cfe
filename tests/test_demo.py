"""Mode démo (DEMO=1) : démarre sans rien configurer, crée ses données fictives, n'appelle aucun service (les adresses de
Microsoft et de Pennylane pointent vers un faux serveur qui note tout : il ne doit rien recevoir), simule les envois."""
import os
import re
import shutil
import tempfile

import pytest

from commun import GRAPH, H, PL, Client, env_de_base, lancer_php, port_libre


@pytest.fixture(scope="module")
def demo(faux_microsoft):
    dossier = tempfile.mkdtemp(prefix="avis-cfe-demo-")
    env = dict(env_de_base(dossier), DEMO="1", AVIS_AUTORITE=faux_microsoft, AVIS_GRAPH=faux_microsoft, AVIS_PL_MCP=faux_microsoft,
               AVIS_MICROSOFT_CLIENT_ID="00000000-0000-4000-8000-00000000c0de", AVIS_SHAREPOINT="https://exemple.sharepoint.com/sites/cabinet/Documents")
    p, url = lancer_php(env, port_libre())
    yield {"url": url, "dossier": dossier}
    p.terminate()
    shutil.rmtree(dossier, ignore_errors=True)


def test_la_demo_demarre_avec_des_donnees_fictives_et_rien_ne_sort(demo):
    GRAPH.clear()
    PL["appels"] = []
    c = Client(demo["url"])
    o = c.get("/api/connexion/options").json()
    assert o["demo"] is True and o["mot_de_passe"] is True and o["microsoft"] is False
    assert os.path.exists(os.path.join(demo["dossier"], "comptes.json"))  # données créées au premier lancement, dans le dossier de démo
    assert c.post("/api/connexion", headers=H, json={"identifiant": "demo", "mot_de_passe": "faux"}).status_code == 401
    assert c.post("/api/connexion", headers=H, json={"identifiant": "demo", "mot_de_passe": "demo"}).status_code == 200

    d = c.get("/api/cfe").json()
    assert d["demo"] is True and d["boite"].endswith("@example.com") and len(d["lignes"]) >= 12
    statuts = {l["statut"] for l in d["lignes"]}
    assert {"à payer", "payé", "prélèvement", "rien à payer", "à vérifier"} <= statuts
    for l in d["lignes"]:
        assert re.fullmatch(r"000\d{6}", l["siren"]), l["siren"]  # SIREN fictifs (préfixe 000)
        assert l["contact"]["email"] == "" or l["contact"]["email"].endswith("@example.com")
    assert any(l["contestation"] for l in d["lignes"]) and any(l["annee"] == d["annee"] - 1 for l in d["lignes"])  # à contester, N-1 encore dû
    hausse = [l for l in d["lignes"] if l["prec"] and l["total_avis"] > 2 * l["prec"]["total"] > 0]
    assert hausse  # au moins une forte hausse par rapport à l'année précédente
    pdf = next(a["pdf"] for l in d["lignes"] for a in l["avis"] if a["pdf_present"])
    r = c.get(f"/api/cfe/avis/{pdf}")
    assert r.content.startswith(b"%PDF") and b"FICTIF" in r.content

    # Envoi simulé : rien ne part, mais le suivi « Envoyé » et les échanges le voient
    cle = next(l["cle"] for l in d["lignes"] if l["statut"] == "à payer" and not l["envoye"] and l["contact"]["email"])
    r = c.post("/api/cfe/envoyer", json={"cle": cle}, headers=H).json()
    assert r["ok"] is True and r["demo"] is True
    assert next(l for l in c.get("/api/cfe?frais=1").json()["lignes"] if l["cle"] == cle)["envoye"] is True
    assert any(m["entrant"] for m in c.get("/api/cfe/echanges").json()["mails"])
    assert c.post("/api/cfe/brouillon", json={"cle": cle}, headers=H).json()["ok"] is True

    # Microsoft 365 et Pennylane : refusés avec un message clair
    for methode, route in (("POST", "/api/cfe/onedrive/plan"), ("POST", "/api/outlook/connexion"), ("GET", "/api/pennylane/connecter"),
                           ("POST", "/api/cfe/annuaire/synchro/debut"), ("POST", "/api/cfe/pdf/reseau")):
        r = c.request(methode, route, headers=H, json={}, allow_redirects=False)
        assert r.status_code == 409 and r.json()["erreur"].startswith("Mode démo :"), route
    assert not GRAPH and not PL["appels"]  # rien n'est sorti

    auto = Client(demo["url"])  # /?demo : connexion directe au compte de démonstration
    assert auto.get("/?demo", allow_redirects=False).status_code == 302 and auto.get("/api/moi").json()["identifiant"] == "demo"
