-- Runs once, on the very first startup of the local MariaDB container (empty
-- volume). Grants the dev user full instance privileges: Prisma Migrate
-- creates/drops a "shadow database" on the fly to compute schema diffs,
-- which goes beyond a single database. No consequence here: disposable
-- container, not exposed to the Internet, one per developer.
-- Unrelated to the VPS (prod/staging), where the user stays restricted to
-- its own database -- see infra/setup-mariadb.sh.
GRANT ALL PRIVILEGES ON *.* TO 'bde_app'@'%';
FLUSH PRIVILEGES;
