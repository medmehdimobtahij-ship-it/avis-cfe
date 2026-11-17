#!/usr/bin/env sh
# Avis de CFE : démo hors ligne (données fictives, aucun compte externe). PHP 8.2+ dans le PATH, ou PHP=/chemin/vers/php.
# Identifiant : demo / mot de passe : demo. Supprimez data-demo/ pour repartir de zéro.
cd "$(dirname "$0")" || exit 1
PHP="${PHP:-php}"
PORT="${PORT:-8103}"
if ! "$PHP" -v >/dev/null 2>&1; then
  echo "PHP introuvable : installez PHP 8.2+ (extensions dom, mbstring, openssl) ou lancez PHP=/chemin/vers/php ./demo.sh" >&2
  exit 1
fi
echo "Avis de CFE - démo : http://127.0.0.1:$PORT  (identifiant demo / mot de passe demo)"
( sleep 1; (xdg-open "http://127.0.0.1:$PORT/?demo" || open "http://127.0.0.1:$PORT/?demo") >/dev/null 2>&1 ) &
DEMO=1 exec "$PHP" -S "127.0.0.1:$PORT" -t public public/routeur.php
