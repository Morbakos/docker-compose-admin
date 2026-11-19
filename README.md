# Compose Admin

Compose Admin est une application desktop Tauri 2 + Angular pour parcourir un dossier de projets Docker Compose, détecter les stacks déclarées dans les fichiers YAML et exécuter les opérations courantes via Docker Compose CLI.

## Fonctionnalités

- Sélection d'un dossier avec le sélecteur natif Windows, Linux ou macOS.
- Recherche récursive des fichiers `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml` et variantes telles que `compose.override.yaml` ou `docker-compose.prod.yml`.
- Regroupement des fichiers Compose trouvés dans un même dossier en un projet ; les fichiers sont transmis à Docker Compose dans un ordre déterministe, fichier de base avant fichiers complémentaires.
- Affichage des projets, des chemins et des états connus des conteneurs.
- Démarrage (`up --detach`), arrêt (`stop`), redémarrage (`restart`) et récupération des images (`pull`).
- Consultation des 250 dernières lignes de logs (`logs --tail 250`).
- Mémorisation locale du dernier dossier choisi et actualisation manuelle.

Les dossiers `.git`, `.hg`, `.svn`, `node_modules`, `target`, `dist`, `vendor`, `.venv`, `venv`, `.idea` et `.angular` sont ignorés. Les liens symboliques ne sont pas suivis.

## Prérequis

- Bun et Node.js compatibles avec la version Angular du projet.
- Rust stable (1.90 ou plus récent pour le plugin Dialog Tauri).
- Les dépendances système Tauri requises par votre plateforme.
- Docker Desktop ou Docker Engine avec Docker Compose v2 pour utiliser les fonctions Docker.

Le binaire `docker` doit être disponible dans le `PATH` de l'application.

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

Le workflow `.github/workflows/ci.yml` construit le frontend Angular, exécute les tests Rust et compile le binaire Tauri sur Windows, Ubuntu et macOS pour chaque push et pull request vers `main`.

Le POC ne doit être considéré comme vérifié qu'une fois les trois jobs réussis sur un même commit. La compilation CI ne teste pas les opérations Docker contre un moteur réel : cette vérification nécessite Docker installé et des projets Compose de test sur une machine d'exécution.
