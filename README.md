# Compose Admin

Compose Admin est une application desktop locale construite avec **Tauri 2, Angular, TypeScript et Rust**. Son objectif est de permettre à un PO, un designer ou un membre d'équipe produit de lancer et d'utiliser une application métier sans installer sa stack technique (par exemple .NET, Node.js, Angular ou les dépendances npm privées).

Ce n'est pas un remplacement de Docker Desktop : c'est un **lanceur d'environnements métier basé sur Docker Compose**, avec une interface simple et des fonctions avancées disponibles en complément.

## Vision produit

- L'utilisateur dispose déjà d'une copie locale du dépôt métier.
- Il sélectionne le dossier du projet dans Compose Admin.
- L'application détecte les fichiers Compose du dossier et conserve le dernier emplacement choisi localement.
- Un clic démarre l'environnement avec Docker Compose Watch lorsque l'utilisateur lance l'environnement, afin que les modifications locales du code soient répercutées selon les règles `develop.watch` du Compose.
- L'utilisateur peut arrêter l'environnement, ouvrir l'application dans son navigateur et consulter ses logs.
- Les agents de code (Codex, Claude Code, etc.) peuvent modifier directement les fichiers du dépôt local ; Compose Admin n'édite pas le code.

Le modèle de données et les écrans doivent rester extensibles à plusieurs projets, mais le parcours principal doit rester simple pour un utilisateur qui ne connaît pas Docker.

## Fonctionnalités

### Parcours principal
- Sélection d'un dossier local contenant un projet Compose.
- Détection récursive des fichiers `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml` et variantes.
- Démarrage avec `docker compose up --watch` pour activer la synchronisation définie par le Compose.
- Arrêt et redémarrage de l'environnement.
- Ouverture du premier port TCP publié détecté dans le navigateur.
- Consultation des 250 dernières lignes de logs avec rafraîchissement périodique.

### Fonctions avancées
- Vue des conteneurs et de leurs services.
- Actions individuelles Start / Stop / Restart.
- Affichage des ports, CPU et mémoire lorsque Docker fournit ces informations.
- Actualisation de l'état du moteur Docker et des projets.

## Architecture et principes

- **Angular + TypeScript** : interface utilisateur.
- **Tauri 2 + Rust** : accès local au système et orchestration.
- **Tauri Specta 2** : génération des bindings TypeScript à partir des commandes et types Rust ; les commandes du frontend doivent passer par `src/app/bindings.ts`.
- **Docker Compose CLI v2** : unique interface de pilotage Docker ; ne pas ajouter de dépendance à l'API propriétaire de Docker Desktop.
- Le code source reste sur la machine de l'utilisateur ; Docker Compose Watch applique les règles de synchronisation du dépôt.
- Ne pas demander aux utilisateurs de configurer manuellement .NET, Node.js, Angular ou les registres npm privés.
- Prioriser les messages compréhensibles et les actions orientées application métier. Éviter le jargon Docker dans le parcours principal.
- Les détails Docker restent accessibles dans une vue avancée.

## Détection des fichiers Compose

Les dossiers `.git`, `.hg`, `.svn`, `node_modules`, `target`, `dist`, `vendor`, `.venv`, `venv`, `.idea` et `.angular` sont ignorés. Les liens symboliques ne sont pas suivis. Les fichiers Compose d'un même dossier sont regroupés et transmis à Docker Compose dans un ordre déterministe.

## Prérequis

- Bun et Node.js compatibles avec la version Angular du projet.
- Rust stable (1.90 ou plus récent pour le plugin Dialog Tauri).
- Les dépendances système Tauri requises par la plateforme.
- Docker Desktop ou Docker Engine avec Docker Compose v2 prenant en charge `up --watch`.
- Le binaire `docker` doit être disponible dans le `PATH` de l'application.

## Développement

```bash
bun install
bun run start
```

Dans un second terminal :

```bash
bun run tauri dev
```

Build frontend :

```bash
bun run build
```

Compilation backend Tauri :

```bash
cargo build --release --manifest-path src-tauri/Cargo.toml
```

Tests Rust :

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

## CI multiplateforme

Le workflow `.github/workflows/ci.yml` construit le frontend Angular, exécute les tests Rust et compile le binaire Tauri sur Windows, Ubuntu et macOS pour les push sur `main` et `feat/compose-dashboard-mvp`, ainsi que les pull requests vers `main`.

La CI valide la compilation et les tests unitaires, mais ne teste pas les opérations Docker contre un moteur réel. Tauri Specta exporte les bindings dans `src/app/bindings.ts` en mode debug ; après modification d'une commande ou d'un type Rust, vérifier et committer les bindings générés. Il faut une validation manuelle avec Docker Compose v2 et un projet contenant des règles `develop.watch`.
