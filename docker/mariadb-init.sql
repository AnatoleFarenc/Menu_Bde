-- Exécuté une seule fois, au tout premier démarrage du conteneur MariaDB local
-- (volume vide). Donne à l'utilisateur de dev tous les droits sur l'instance :
-- Prisma Migrate crée/détruit une "shadow database" à la volée pour calculer
-- les diffs de schéma, ce qui va au-delà d'une simple base. Sans conséquence
-- ici : conteneur jetable, non exposé sur Internet, un par développeur.
-- Sans rapport avec le VPS (prod/staging), où l'utilisateur reste restreint à
-- sa seule base -- voir infra/setup-mariadb.sh.
GRANT ALL PRIVILEGES ON *.* TO 'bde_app'@'%';
FLUSH PRIVILEGES;
