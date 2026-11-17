"""Commun aux tests : vrai serveur PHP (php -S), données temporaires, faux Microsoft (connexion + boîte Graph + SharePoint) et faux
Pennylane (MCP). Aucun appel ne sort de la machine.

Deux serveurs : « serveur » a tous les services configurés (et pointés vers les faux) ; « serveur_nu » n'en a aucun (ni Microsoft,
ni SharePoint, ni Pennylane), comme un cabinet qui installe l'outil sans rien relier.
Lancer : python -m pytest tests -q   (PHP 8.2+ du PATH, ou variable AVIS_PHP=chemin vers php)
"""
import base64
import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

import pytest
import requests
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHP = os.environ.get("AVIS_PHP") or shutil.which("php") or r"C:\dev\outils\php83\php.exe"
DOSSIER = tempfile.mkdtemp(prefix="avis-cfe-")
DOSSIER_NU = tempfile.mkdtemp(prefix="avis-cfe-nu-")
SIGNATURES = DOSSIER + "-signatures"  # faux %APPDATA%\\Microsoft\\Signatures du PC
H = {"X-Avis": "1"}
EN_LIGNE = {"Host": "cfe.cabinet-exemple.fr", "X-Forwarded-Proto": "https"}
COMPTES = "claire:Claire Moreau,paul:Paul Bernard"


def port_libre():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


# ---------- Faux Microsoft (connexion OpenID Connect + clés de signature) ----------
MS = {}
GRAPH = []  # appels à la boîte (faux Graph) : (méthode, chemin, corps JSON)
CLE_MS = rsa.generate_private_key(public_exponent=65537, key_size=2048)  # clé de signature du faux Microsoft
CLIENT_ID = "00000000-0000-4000-8000-00000000c0de"  # application Entra fictive
TENANT_CABINET = "11111111-2222-3333-4444-555555555555"
TENANT_PERSONNEL = "9188040d-6c67-4c5b-b112-36a304b66dad"  # constante publique de Microsoft (comptes personnels)
CLAIMS = '{"access_token":{"capolids":{"essential":true,"values":["p1"]}}}'


def b64u(o):
    return base64.urlsafe_b64encode(o).decode().rstrip("=")


def jwks():
    n = CLE_MS.public_key().public_numbers()
    entier = lambda v: b64u(v.to_bytes((v.bit_length() + 7) // 8, "big"))
    return {"keys": [{"kty": "RSA", "kid": "cle1", "use": "sig", "n": entier(n.n), "e": entier(n.e)}]}


def signer(infos, kid="cle1", cle=None):
    debut = b64u(json.dumps({"alg": "RS256", "kid": kid, "typ": "JWT"}).encode()) + "." + b64u(json.dumps(infos).encode())
    return debut + "." + b64u((cle or CLE_MS).sign(debut.encode(), padding.PKCS1v15(), hashes.SHA256()))


def id_token(adresse):
    tid = TENANT_PERSONNEL if adresse.endswith("@hotmail.fr") else MS.get("tid", TENANT_CABINET)
    infos = {"aud": MS.get("aud", CLIENT_ID), "iss": f"https://login.microsoftonline.com/{tid}/v2.0", "tid": tid,
             "oid": MS.get("oid", "oid-" + adresse), "preferred_username": adresse, "name": MS.get("nom", adresse.split("@")[0]),
             "iat": int(time.time()), "nbf": int(time.time()), "exp": int(time.time()) + 3600, "nonce": MS.get("nonce", "")}
    if MS.get("mfa"):
        infos["amr"] = ["pwd", "mfa"]
    return signer(infos, cle=MS.get("cle_pirate"))


def code_pour(url):
    # Le vrai Microsoft lie le nonce de la page d'autorisation au code : le faux le reprend de l'adresse.
    MS["nonce"] = parse_qs(urlparse(url).query)["nonce"][0]
    return "c1"


# ---------- Faux SharePoint (bibliothèque du cabinet) : id -> {nom, parent, dossier, contenu} ----------
SP = {}


def sp_reinitialiser():
    SP.clear()
    SP["racine"] = {"nom": "Comptabilite", "parent": None, "dossier": True}


def sp_ajouter(parent, nom, dossier=False, contenu=b""):
    i = f"i{len(SP)}"
    SP[i] = {"nom": nom, "parent": parent, "dossier": dossier, "contenu": contenu}
    return i


def sp_enfant(parent, nom):
    return next((i for i, x in SP.items() if x["parent"] == parent and x["nom"].lower() == nom.lower()), None)


def sp_chemin(depart, chemin):
    i = depart
    for morceau in [unquote(m) for m in chemin.strip("/").split("/") if m]:
        i = sp_enfant(i, morceau)
        if i is None:
            return None
    return i


def sp_vue(i):
    x = SP[i]
    return {"id": i, "name": x["nom"], **({"folder": {}} if x["dossier"] else {"file": {}}), "size": len(x.get("contenu") or b""),
            "parentReference": {"driveId": "d1"}, "webUrl": f"https://exemple.sharepoint.com/{i}"}


class FauxMicrosoft(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def repondre(self, code, corps=None, brut=None, type_="application/json"):
        data = brut if brut is not None else json.dumps(corps if corps is not None else {}).encode()
        self.send_response(code)
        self.send_header("Content-Type", type_)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def lire(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def do_POST(self):
        brut = self.lire()
        chemin = urlparse(self.path).path
        if chemin.startswith("/oauth/") or chemin == "/mcp":
            return faux_pennylane_mcp(self, "POST", chemin, brut.decode())
        if chemin.startswith("/me/") or chemin.startswith("/drives/") or chemin == "/$batch":
            return self.graph("POST", chemin, json.loads(brut) if brut else None)
        q = parse_qs(brut.decode())
        if chemin.endswith("/token"):
            if MS.get("exige_secret") and q.get("client_secret") != [MS["exige_secret"]]:  # adresse déclarée en « Web » : secret exigé
                return self.repondre(401, {"error": "invalid_client", "error_description": "AADSTS7000218: client_secret required"})
            if MS.get("exige_mfa") and q.get("grant_type") == ["authorization_code"]:  # le cabinet exige Authenticator, pas validé
                MS["exige_mfa"] -= 1
                return self.repondre(400, {"error": "invalid_grant", "error_description": "AADSTS50076: you must use multi-factor authentication",
                                           "claims": CLAIMS})
            if q.get("grant_type") == ["authorization_code"] and q.get("code") == ["c1"] and q.get("code_verifier"):
                MS["redirect_uri"] = q.get("redirect_uri", [""])[0]
                return self.repondre(200, {"access_token": "t", "refresh_token": "r", "expires_in": 3600,
                                           "id_token": id_token(MS.get("adresse", "moi@cabinet-exemple.fr"))})
            return self.repondre(400, {"error": "invalid_grant", "error_description": "AADSTS70008: expired"})
        self.repondre(404, {"error": {"message": "inconnu"}})

    def do_GET(self):
        chemin = urlparse(self.path).path
        if chemin.startswith("/oauth/"):
            return faux_pennylane_mcp(self, "GET", chemin, "")
        if chemin == "/discovery/v2.0/keys":  # clés publiques de signature
            return self.repondre(200, jwks())
        if chemin.startswith(("/me/", "/shares/", "/drives/")):
            return self.graph("GET", chemin, None)
        self.repondre(404, {"error": {"message": "inconnu"}})

    def do_PATCH(self):
        return self.graph("PATCH", urlparse(self.path).path, json.loads(self.lire().decode() or "{}"))

    def do_PUT(self):
        return self.graph("PUT", urlparse(self.path).path, self.lire())

    def drive(self, methode, chemin, corps):
        """Faux SharePoint : dossiers et fichiers de SP ; un nom déjà pris avec « conflictBehavior=fail » répond 409."""
        q = parse_qs(urlparse(self.path).query)
        if chemin.startswith("/shares/"):
            return self.repondre(200, sp_vue("racine"))
        m = re.match(r"^/drives/d1/items/([^/:]+)(?::/(.+?):?)?(/children|/content)?$", unquote(chemin))
        if not m:
            return self.repondre(404, {"error": {"message": "inconnu"}})
        depart, sous, fin = m.group(1), (m.group(2) or "").rstrip(":"), m.group(3) or ""
        if depart not in SP:
            return self.repondre(404, {"error": {"message": "absent"}})
        if methode == "PUT" and fin == "/content":  # envoi d'un fichier : jamais de remplacement
            parent, nom = (sp_chemin(depart, os.path.dirname(sous)) if "/" in sous else depart), os.path.basename(sous)
            if sp_enfant(parent, nom):
                return self.repondre(409, {"error": {"message": "nameAlreadyExists"}})
            return self.repondre(201, sp_vue(sp_ajouter(parent, nom, contenu=corps)))
        i = sp_chemin(depart, sous) if sous else depart
        if i is None:
            return self.repondre(404, {"error": {"message": "itemNotFound"}})
        if methode == "POST" and fin == "/children":  # création d'un dossier
            if sp_enfant(i, corps["name"]):
                return self.repondre(409, {"error": {"message": "nameAlreadyExists"}})
            return self.repondre(201, sp_vue(sp_ajouter(i, corps["name"], dossier=True)))
        if fin == "/children":
            return self.repondre(200, {"value": [sp_vue(k) for k, x in SP.items() if x["parent"] == i]})
        if fin == "/content":
            return self.repondre(200, brut=SP[i]["contenu"], type_="application/pdf")
        return self.repondre(200, sp_vue(i))

    def graph(self, methode, chemin, corps):
        """Faux Graph : la boîte de la personne et le SharePoint. Tout ce qui y est écrit est noté dans GRAPH (vérifié par les tests)."""
        if self.headers.get("Authorization") != "Bearer t":
            return self.repondre(401, {"error": {"message": "jeton"}})
        GRAPH.append((methode, chemin, corps if methode != "PUT" else len(corps)))
        if chemin == "/$batch":  # lots de lectures (dossiers SharePoint)
            reponses = []
            for r in corps["requests"]:
                gr = FauxReponse()
                FauxMicrosoft.drive(gr, "GET", urlparse(r["url"]).path, None)
                reponses.append({"id": r["id"], "status": gr.code, "body": gr.corps})
            return self.repondre(200, {"responses": reponses})
        if chemin.startswith(("/shares/", "/drives/")):
            return self.drive(methode, chemin, corps)
        if methode == "POST" and chemin == "/me/messages":
            k = sum(1 for m, c, _ in GRAPH if m == "POST" and c == "/me/messages")
            return self.repondre(201, {"id": f"n{k}", "webLink": f"https://outlook.office.com/brouillon/n{k}"})
        if methode == "POST" and chemin.endswith("/createReply"):
            return self.repondre(201, {"id": "r1", "body": {"content": "<div>message cité</div>"}})
        if methode == "POST" and (chemin.endswith("/attachments") or chemin.endswith("/send")):
            return self.repondre(202 if chemin.endswith("/send") else 201, {})
        if methode == "PATCH":
            return self.repondre(200, {})
        q = parse_qs(urlparse(self.path).query)
        if chemin == "/me/mailFolders/sentitems/messages" and "$filter" in q:  # Éléments envoyés (suivi « Envoyé »)
            return self.repondre(200, {"value": MS.get("envoyes", [])})
        if chemin == "/me/messages" and "$search" in q:  # mails d'un sujet (échanges)
            return self.repondre(200, {"value": MS.get("messages", [])})
        if chemin == "/me/mailFolders/sentitems/messages":
            return self.repondre(200, {"value": [
                {"id": "e1", "body": {"content": "<p>Sans signature</p>"}},
                {"id": "e2", "body": {"content": '<div>Bonjour,</div><div id="Signature"><table><tr><td><img src="cid:logo1" width="80"></td>'
                                                 '<td><b style="color:#4f4bd9">Claire MOREAU</b><br>CABINET EXEMPLE</td></tr></table></div>'
                                                 '<div id="divRplyFwdMsg">De : client</div><p>texte cité</p>'}}]})
        if chemin == "/me/messages/e2/attachments":
            return self.repondre(200, {"value": [{"contentId": "logo1", "contentType": "image/png", "contentBytes": "iVBORw0KGgo=", "isInline": True}]})
        if chemin.startswith("/me/mailFolders/"):
            return self.repondre(200, {"id": chemin.split("/")[-1]})
        self.repondre(404, {"error": {"message": "inconnu"}})


class FauxReponse:
    """Réponse d'une requête d'un lot ($batch), rendue par le même code que les requêtes simples."""
    path = ""

    def repondre(self, code, corps=None, brut=None, type_=None):
        self.code, self.corps = code, corps


# ---------- Faux Pennylane MCP (mcp.pennylane.com) : OAuth (enregistrement, PKCE, renouvellement) + JSON-RPC ----------
PL = {"appels": []}  # état du faux Pennylane (remis à zéro par la fixture app) ; appels : (outil, arguments)
PL_DOSSIERS = [{"id": 1, "name": "SAS ALPHA"}, {"id": 2, "name": "SAS KAPPA"}, {"id": 3, "name": "SARL SANS CONTACT"}]
PL_CONTACTS = {1: {"first_name": "Jean", "last_name": "Dupont", "email": "jean@alpha.example.com", "civility": "mr"},
               2: {"first_name": "Nora", "last_name": "Blanc", "email": "nora@kappa.example.com"}}


def faux_pennylane_mcp(h, methode, chemin, brut):
    def repondre(code, corps, entetes=None, sse=False):
        data = (f"event: message\ndata: {json.dumps(corps)}\n\n" if sse else json.dumps(corps)).encode()
        h.send_response(code)
        h.send_header("Content-Type", "text/event-stream" if sse else "application/json")
        for k, v in (entetes or {}).items():
            h.send_header(k, v)
        h.send_header("Content-Length", str(len(data)))
        h.end_headers()
        h.wfile.write(data)

    if chemin == "/oauth/register":
        PL["inscription"] = json.loads(brut)
        return repondre(201, {"client_id": "cid", "client_secret": "sec"})
    if chemin == "/oauth/token":
        q = {k: v[0] for k, v in parse_qs(brut).items()}
        if (q.get("client_id"), q.get("client_secret")) != ("cid", "sec"):
            return repondre(401, {"error": "invalid_client"})
        if q.get("grant_type") == "authorization_code":
            defi = b64u(hashlib.sha256(q.get("code_verifier", "").encode()).digest())
            if q.get("code") != "plc" or defi != PL.get("defi") or q.get("redirect_uri") != PL.get("retour"):
                return repondre(400, {"error": "invalid_grant"})
            PL["valides"] = {"pla1"}
            return repondre(200, {"access_token": "pla1", "refresh_token": "plr1", "expires_in": 3600, "token_type": "Bearer"})
        return repondre(400, {"error": "invalid_grant"})
    if chemin == "/oauth/userinfo":
        return repondre(200, {"email": "claire.moreau@cabinet-exemple.fr", "first_name": "Claire", "last_name": "Moreau"})
    if chemin == "/oauth/revoke":
        PL["revoque"] = parse_qs(brut).get("token", [""])[0]
        return repondre(200, {})
    jeton = (h.headers.get("Authorization") or "").removeprefix("Bearer ")
    if jeton not in PL.get("valides", set()):
        return repondre(401, {"jsonrpc": "2.0", "error": {"code": -32001, "message": "Unauthorized"}, "id": None})
    m = json.loads(brut)
    if m.get("method") == "initialize":
        return repondre(200, {"jsonrpc": "2.0", "id": m["id"], "result": {"protocolVersion": "2025-06-18", "capabilities": {}}},
                        {"Mcp-Session-Id": "s1"})
    if "id" not in m:  # notification
        h.send_response(202)
        h.send_header("Content-Length", "0")
        h.end_headers()
        return
    outil, args = m["params"]["name"], m["params"]["arguments"]
    PL["appels"].append((outil, args))
    texte = lambda v: {"jsonrpc": "2.0", "id": m["id"], "result": {"content": [{"type": "text", "text": json.dumps(v)}]}}
    if outil == "list_companies":
        return repondre(200, texte({"companies": PL_DOSSIERS if args.get("page", 1) == 1 else []}), sse=True)
    p = args.get("path_params", {})
    if args.get("operation_id") == "getDashboardFirmSidepanelsCompany":
        return repondre(200, texte({"id": p["id"], "main_contact": PL_CONTACTS.get(p["id"])}), sse=True)
    return repondre(200, {"jsonrpc": "2.0", "id": m["id"], "result": {"isError": True, "content": [{"type": "text", "text": "inconnu"}]}})


def lancer_php(env, port):
    p = subprocess.Popen([PHP, "-S", f"127.0.0.1:{port}", "-t", "public", "public/routeur.php"], cwd=RACINE, env=env,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"http://127.0.0.1:{port}"
    for _ in range(80):
        try:
            requests.get(url + "/api/connexion/options", timeout=1)
            break
        except requests.ConnectionError:
            time.sleep(0.1)
    return p, url


def env_de_base(dossier):
    env = {k: v for k, v in os.environ.items() if not k.startswith("AVIS_") and k != "DEMO"}
    return dict(env, AVIS_DATA=dossier, AVIS_COMPTES=COMPTES, AVIS_SANS_REGISTRE="1", AVIS_SIGNATURES=SIGNATURES)


@pytest.fixture(scope="session")
def faux_microsoft():
    ms = ThreadingHTTPServer(("127.0.0.1", port_libre()), FauxMicrosoft)
    threading.Thread(target=ms.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{ms.server_port}"
    ms.shutdown()


@pytest.fixture(scope="session")
def serveur(faux_microsoft):
    """Tous les services configurés, pointés vers les faux serveurs."""
    os.makedirs(SIGNATURES, exist_ok=True)
    env = dict(env_de_base(DOSSIER), AVIS_AUTORITE=faux_microsoft, AVIS_GRAPH=faux_microsoft, AVIS_PL_MCP=faux_microsoft,
               AVIS_MICROSOFT_CLIENT_ID=CLIENT_ID, AVIS_DOMAINE="cabinet-exemple.fr", AVIS_CONNEXION_PAR_NOM_EN_LOCAL="1",
               AVIS_SHAREPOINT="https://exemple.sharepoint.com/sites/cabinet/Documents", AVIS_CABINET_PENNYLANE="4242",
               AVIS_CABINET_NOM="Cabinet Exemple")
    p, url = lancer_php(env, port_libre())
    yield {"url": url, "env": env}
    p.terminate()
    shutil.rmtree(DOSSIER, ignore_errors=True)
    shutil.rmtree(SIGNATURES, ignore_errors=True)


@pytest.fixture(scope="session")
def serveur_nu(faux_microsoft):
    """Aucun service relié : ni Microsoft, ni SharePoint, ni Pennylane (adresses tout de même pointées vers le faux : rien ne doit y arriver)."""
    env = dict(env_de_base(DOSSIER_NU), AVIS_AUTORITE=faux_microsoft, AVIS_GRAPH=faux_microsoft, AVIS_PL_MCP=faux_microsoft)
    p, url = lancer_php(env, port_libre())
    yield {"url": url, "env": env}
    p.terminate()
    shutil.rmtree(DOSSIER_NU, ignore_errors=True)


class Client(requests.Session):
    def __init__(self, base, en_ligne=False):
        super().__init__()
        self.base = base
        if en_ligne:
            self.headers.update(EN_LIGNE)

    def request(self, methode, url, *a, **k):
        r = super().request(methode, self.base + url, *a, **k)
        for cookie in self.cookies:  # le faux site « en ligne » est servi en http : ses cookies Secure (__Host-) sont renvoyés quand même
            cookie.secure = False
        return r


def vider(dossier):
    for n in os.listdir(dossier):
        p = os.path.join(dossier, n)
        shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)


def initialiser(env):
    """outils/initialiser.php : les comptes du réglage « comptes », avec leur mot de passe provisoire."""
    return json.loads(subprocess.run([PHP, "outils/initialiser.php", "--json"], cwd=RACINE, env=env, capture_output=True,
                                     text=True, check=True).stdout)


@pytest.fixture()
def app(serveur):
    vider(DOSSIER)
    mdp = initialiser(serveur["env"])
    MS.clear()
    GRAPH.clear()
    PL.clear()
    PL["appels"] = []
    sp_reinitialiser()
    return {"mdp": mdp, "local": lambda: Client(serveur["url"]), "en_ligne": lambda: Client(serveur["url"], True)}


@pytest.fixture()
def nu(serveur_nu):
    vider(DOSSIER_NU)
    mdp = initialiser(serveur_nu["env"])
    GRAPH.clear()
    PL.clear()
    PL["appels"] = []
    c = Client(serveur_nu["url"])
    assert c.post("/api/connexion", headers=H, json={"identifiant": "claire", "mot_de_passe": mdp["claire"]}).status_code == 200
    return c


def page_microsoft(c, adresse="/api/microsoft/connexion"):
    """Ouvre la page Microsoft depuis le site : l'adresse d'autorisation (vers le faux Microsoft)."""
    r = c.get(adresse, allow_redirects=False)
    assert r.status_code == 302, r.text
    return r.headers["Location"]


def retour_microsoft(c, url, **remplace):
    q = parse_qs(urlparse(url).query)
    r = c.get("/", params={"code": code_pour(url), "state": q["state"][0], "session_state": "x", **remplace})
    vers = re.search(r'url=([^"]+)"', r.text)
    assert r.status_code == 200 and vers, r.text[:200]
    return vers.group(1).replace("&amp;", "&")


def comptes():
    return json.load(open(os.path.join(DOSSIER, "comptes.json"), encoding="utf-8"))


def journal():
    chemin = os.path.join(DOSSIER, "journal-securite.jsonl")
    return [json.loads(l) for l in open(chemin, encoding="utf-8")] if os.path.exists(chemin) else []


def regler(**p):
    chemin = os.path.join(DOSSIER, "parametres.json")
    d = json.load(open(chemin, encoding="utf-8")) if os.path.exists(chemin) else {}
    d.update(p)
    json.dump(d, open(chemin, "w", encoding="utf-8"))


def connecter_boite(c, adresse="claire.moreau@cabinet-exemple.fr"):
    """« Connecter ma boîte » (adresse de retour collée) : la boîte du faux Microsoft est connectée."""
    MS["adresse"] = adresse
    r = c.post("/api/outlook/connexion", headers=H).json()
    etat = parse_qs(urlparse(r["url"]).query)["state"][0]
    r = c.post("/api/outlook/connexion/retour", json={"adresse": f"http://localhost/?code={code_pour(r['url'])}&state={etat}"}, headers=H)
    assert r.status_code == 200, r.text
