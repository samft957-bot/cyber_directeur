# CyberDirecteur

Site de cybersécurité : 12 cours gratuits, 6 cours Premium et 72 questions de quiz.
Application **Node.js + Express** avec paiement **Stripe** vérifié côté serveur.

## Fichiers (tous à la racine du dépôt)

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `script.js` | Site public (seuls fichiers servis au navigateur) |
| `server.js` | Serveur Express + Stripe |
| `premium.json` | Cours Premium et quiz — **jamais servi directement**, uniquement via `/api` après vérification |
| `render.yaml` | Configuration de déploiement Render |
| `.env.example` | Modèle des variables d'environnement |

## Mettre sur GitHub

1. Crée un dépôt **privé** (`premium.json` contient le contenu payant : en dépôt public, tout le monde pourrait le lire).
2. Envoie **le contenu** de ce dossier à la racine du dépôt (pas le dossier lui-même). `index.html` et `package.json` doivent être visibles dès la page d'accueil du dépôt.
3. Ne mets jamais `.env` ni de clé Stripe dans GitHub (`.gitignore` les exclut déjà).

## Déployer (Render)

GitHub Pages et Cloudflare Pages ne servent que des fichiers statiques : ils ne peuvent pas lancer `server.js`, donc ni Stripe ni la protection Premium. Utilise un hébergeur Node.js :

1. Render → **New → Web Service** → connecte le dépôt GitHub.
2. Runtime `Node`, Root Directory vide, Build `npm install`, Start `npm start`.
3. Ajoute les variables d'environnement :

| Variable | Valeur |
|---|---|
| `SITE_URL` | URL HTTPS exacte du site, sans `/` final |
| `STRIPE_SECRET_KEY` | `sk_test_...` au début (jamais dans le code) |
| `STRIPE_PRICE_MONTHLY` | `price_...` — 5 €/mois, récurrent |
| `STRIPE_PRICE_ANNUAL` | `price_...` — 25 €, paiement ponctuel (accès 12 mois) |
| `STRIPE_PRICE_LIFETIME` | `price_...` — 40 €, paiement ponctuel (permanent) |
| `SESSION_SECRET` | secret aléatoire d'au moins 32 caractères (Render peut le générer) |

4. Après le premier déploiement, copie l'URL Render dans `SITE_URL` et redéploie.

## Stripe

- Produits attendus par le serveur : mensuel `prod_VUiq9YfDbrgA2f`, annuel `prod_VUicouxQJ4T45V`, permanent `prod_VUitLfHuBTmPmr`.
- Il faut les identifiants de **tarif** `price_...`, pas ceux des produits `prod_...`.
- Le serveur refuse un tarif dont le produit, la devise (EUR), le montant ou le type ne correspondent pas.
- Teste les trois formules en **mode test** (clé et tarifs du même mode) avant le mode réel.
- Active le portail client Stripe (Paramètres → Facturation → Portail client) pour « Gérer mon abonnement ».
- Le compte marchand doit être géré par un adulte responsable.

## Vérifier après déploiement

- Les cours gratuits s'ouvrent.
- Quiz et cours Premium affichent un cadenas sans abonnement.
- `/api/premium/questions` et `/api/premium/course/0` répondent **403** sans accès.
- Un paiement test redonne l'accès Premium dans le même navigateur.

## Limites actuelles (avant de vendre pour de vrai)

- L'accès Premium est lié au navigateur d'achat (cookie signé) : pas de compte, pas de récupération multi-appareils.
- Pas de webhook Stripe : remboursements et litiges ne sont pas gérés automatiquement.
- Prévoir CGV, mentions légales et politique de confidentialité.

## Publicités (Google AdSense)

Désactivées par défaut dans `script.js` (`ADSENSE.enabled: false`). Pour les activer : compte AdSense approuvé, identifiants des 4 emplacements (`home`, `courses`, `lesson`, `offers`) dans `ADSENSE.slots`, et une CMP certifiée reliée à `ADSENSE.consentReady`. Dans AdSense, bloque les catégories qui ne conviennent pas (alcool, jeux d'argent, rencontres, etc.) : aucun filtre ne garantit 100 % de conformité halal. Les annonces sont masquées pour les abonnés Premium.

## Images

Les photos viennent d'Unsplash (licence commerciale autorisée). Si une image est bloquée, le site affiche son illustration intégrée.

## Lancer en local

```
npm install
npm start
```
