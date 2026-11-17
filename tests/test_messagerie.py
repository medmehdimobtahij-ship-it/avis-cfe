"""Messagerie : sanitiseur HTML, signature (Outlook du PC, dernier mail envoyé, fichier importé, enregistrée), envoi depuis la
boîte (faux Graph) avec images intégrées en pièces jointes « en ligne » (cid:), réponse dans le fil."""
import os

from commun import DOSSIER, GRAPH, H, SIGNATURES, connecter_boite, regler

LOGO = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="


def connecte(app, qui="claire", boite=True):
    c = app["local"]()
    assert c.post("/api/connexion", headers=H, json={"identifiant": qui, "mot_de_passe": app["mdp"][qui]}).status_code == 200
    if boite:
        connecter_boite(c)
    return c


def ecrits(methode, fin=""):
    return [(c, corps) for m, c, corps in GRAPH if m == methode and c.endswith(fin)]


def test_nettoyage_du_html(app):
    c = connecte(app, boite=False)
    sale = ('<p onclick="x()" style="color:#c00000;position:fixed;background:url(javascript:a)">Bonjour <script>alert(1)</script>'
            '<b>gras</b> <a href="javascript:alert(1)">piège</a> <a href="https://cabinet-exemple.fr">site</a></p>'
            '<iframe src="https://x"></iframe><o:p>Word</o:p><img src="https://pistage/x.gif" onerror="y()">'
            f'<img src="data:image/png;base64,{LOGO}" width="80"><img src="file:///C:/x.png"><span style="font-size:14pt">grand</span>')
    h = c.post("/api/signature/apercu", json={"html": f"<html><body>{sale}</body></html>"}, headers=H).json()["html"]
    for interdit in ("script", "onclick", "onerror", "javascript", "iframe", "position", "url(", "file:", "<o:p"):
        assert interdit not in h, interdit
    for garde in ("<b>gras</b>", 'href="https://cabinet-exemple.fr"', "color:#c00000", f"data:image/png;base64,{LOGO}", 'width="80"',
                  "font-size:14pt", "Word", "margin:0"):
        assert garde in h, garde


def test_signature_d_outlook_choisie_et_enregistree(app):
    for nom, contenu in (("Cabinet (claire.moreau@cabinet-exemple.fr).htm", '<html><head><meta charset="windows-1252"></head><body><p><b>Claire</b> · Collaboratrice</p></body></html>'),
                         ("Perso.htm", '<html><body><p>Claire perso</p><img src="Perso_fichiers/image001.png"></body></html>')):
        open(os.path.join(SIGNATURES, nom), "wb").write(contenu.encode("cp1252"))
    os.makedirs(os.path.join(SIGNATURES, "Perso_fichiers"), exist_ok=True)
    open(os.path.join(SIGNATURES, "Perso_fichiers", "image001.png"), "wb").write(b"\x89PNG\r\n")
    c = connecte(app)
    s = c.get("/api/signature").json()
    assert s["personnalisee"] is False and "Claire Moreau" in s["html"] and "claire.moreau@cabinet-exemple.fr" in s["html"]  # signature simple
    liste = c.get("/api/signature/outlook-locales").json()["signatures"]
    assert [x["nom"] for x in liste] == ["Cabinet (claire.moreau@cabinet-exemple.fr)", "Perso"] and liste[0]["defaut"] is True
    assert "data:image/png;base64," in liste[1]["html"]  # image du dossier « _fichiers » remise dans la signature
    regler(ModeConnexion="")  # en ligne (mot de passe de secours), le site ne lit jamais le PC
    e = app["en_ligne"]()
    assert e.post("/api/connexion", headers=H, json={"identifiant": "claire", "mot_de_passe": app["mdp"]["claire"]}).status_code == 200
    assert e.get("/api/signature/outlook-locales").json() == {"signatures": []}
    r = c.post("/api/signature/outlook", headers=H).json()  # sans accès au PC : relue dans le dernier mail envoyé, logo compris
    assert "Claire MOREAU" in r["html"] and "data:image/png;base64,iVBORw0KGgo=" in r["html"] and "texte cité" not in r["html"]
    choisie = liste[0]["html"]
    assert c.post("/api/signature", json={"html": choisie + "<script>x</script>"}, headers=H).json() == {"html": choisie, "personnalisee": True}
    assert open(os.path.join(DOSSIER, "signatures", "claire.html"), encoding="utf-8").read() == choisie
    assert c.get("/api/signature").json() == {"html": choisie, "personnalisee": True}
    assert connecte(app, "paul", boite=False).get("/api/signature").json()["personnalisee"] is False  # chacun la sienne
    assert c.post("/api/signature/effacer", headers=H).json()["personnalisee"] is False


def test_envoi_avec_images_en_ligne(app):
    c = connecte(app)
    GRAPH.clear()
    html = (f'<p>Bonjour <b>Madame</b>,</p><p><span style="font-size:14pt;color:#4F4BD9">Voici</span></p>'
            f'<div class="signature-crm"><p>Claire</p><img src="data:image/png;base64,{LOGO}" width="80"></div><script>x</script>')
    r = c.post("/api/mail/envoyer", json={"a": ["client@example.com"], "cc": ["copie@example.com"], "objet": "Avis de CFE", "html": html,
                                          "texte": "Bonjour Madame", "pieces": [{"nom": "avis.pdf", "contenu": "JVBERi0xLjQ="}]}, headers=H)
    assert r.json() == {"ok": True}, r.text
    [(_, msg)] = ecrits("POST", "/me/messages")
    corps = msg["body"]["content"]
    assert msg["subject"] == "Avis de CFE" and msg["toRecipients"] == [{"emailAddress": {"address": "client@example.com"}}]
    assert msg["ccRecipients"] == [{"emailAddress": {"address": "copie@example.com"}}]
    assert "data:image" not in corps and "<script" not in corps and "font-size:14pt" in corps and "Calibri" in corps
    cid = corps.split('src="cid:')[1].split('"')[0]
    pj = [x for _, x in ecrits("POST", "/attachments")]
    assert {"name": "image0.png", "contentType": "image/png", "contentBytes": LOGO, "isInline": True, "contentId": cid}.items() <= pj[0].items()
    assert pj[1]["name"] == "avis.pdf" and pj[1]["contentBytes"] == "JVBERi0xLjQ=" and not pj[1].get("isInline")
    assert ecrits("POST", "/send") == [("/me/messages/n1/send", None)]
    r = c.post("/api/mail/envoyer", json={"a": [], "objet": "", "html": "<p></p>"}, headers=H)
    assert r.status_code == 422 and set(r.json()["champs"]) == {"a", "objet", "texte"}


def test_reponse_dans_le_fil(app):
    c = connecte(app)
    GRAPH.clear()
    r = c.post("/api/mail/repondre", json={"repondre_a": "m1", "a": ["client@example.com"], "html": "<p>Merci, c'est noté.</p>", "texte": "Merci"}, headers=H)
    assert r.json() == {"ok": True}, r.text
    assert [c_ for c_, _ in ecrits("POST", "/createReply")] == ["/me/messages/m1/createReply"]
    [(chemin, patch)] = ecrits("PATCH")
    assert chemin == "/me/messages/r1" and "Merci, c'est noté." in patch["body"]["content"] and patch["body"]["content"].endswith("<div>message cité</div>")
    assert ecrits("POST", "/send") == [("/me/messages/r1/send", None)]
    GRAPH.clear()  # simple texte (sans éditeur) : la signature enregistrée est ajoutée
    c.post("/api/signature", json={"html": "<p>Claire · Cabinet Exemple</p>"}, headers=H)
    c.post("/api/mail/repondre", json={"repondre_a": "m1", "a": ["client@example.com"], "texte": "Bien reçu"}, headers=H)
    assert "Claire · Cabinet Exemple" in ecrits("PATCH")[0][1]["body"]["content"]
