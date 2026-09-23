#!/usr/bin/env bash
# Fase 0 · paso 20: PostgreSQL 18 desde PGDG, ajustado, con roles mpb_app y
# mpb_migrator y la base musicapremium (§4.3 y §4.4).
#
# Reparto de privilegios, que es el punto clave:
#   mpb_migrator  dueño de la base y del esquema public. Crea y altera tablas.
#   mpb_app       solo SELECT/INSERT/UPDATE/DELETE. No puede crear ni borrar
#                 tablas, así que una inyección SQL en la web no toca el esquema.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
require_root

log "Añadiendo el repositorio oficial PGDG"
install -d -m 0755 /usr/share/postgresql-common/pgdg
if [[ ! -f /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc ]]; then
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
fi
CODENAME="$(lsb_release -cs)"
cat >/etc/apt/sources.list.d/pgdg.list <<EOF
deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
http://apt.postgresql.org/pub/repos/apt ${CODENAME}-pgdg main
EOF
apt-get update -qq
ok "PGDG configurado para ${CODENAME}"

log "Instalando PostgreSQL ${PG_VERSION}"
if ! apt-cache show "postgresql-${PG_VERSION}" >/dev/null 2>&1; then
  die "PGDG no ofrece postgresql-${PG_VERSION} para ${CODENAME}.
       Revisa https://apt.postgresql.org/pub/repos/apt/dists/ y ajusta PG_VERSION."
fi
apt_install "postgresql-${PG_VERSION}" "postgresql-client-${PG_VERSION}" \
  "postgresql-contrib-${PG_VERSION}"
PG_FULL="$(su - postgres -c 'psql -Atqc "select version()"' | awk '{print $2}')"
ok "Instalado PostgreSQL ${PG_FULL}"

PG_CONF_DIR="/etc/postgresql/${PG_VERSION}/main"
[[ -d "$PG_CONF_DIR" ]] || die "No encuentro ${PG_CONF_DIR}."

log "Aplicando el ajuste de §4.4"
install -d -m 0755 "${PG_CONF_DIR}/conf.d"
grep -qE "^include_dir\s*=\s*'conf\.d'" "${PG_CONF_DIR}/postgresql.conf" \
  || echo "include_dir = 'conf.d'" >>"${PG_CONF_DIR}/postgresql.conf"
render "${KIT_DIR}/config/postgresql-musicapremium.conf" \
  "${PG_CONF_DIR}/conf.d/99-musicapremium.conf" 0644 postgres:postgres
ok "conf.d/99-musicapremium.conf instalado"

log "Reescribiendo pg_hba.conf (solo localhost, solo scram)"
[[ -f "${PG_CONF_DIR}/pg_hba.conf.orig" ]] \
  || cp -a "${PG_CONF_DIR}/pg_hba.conf" "${PG_CONF_DIR}/pg_hba.conf.orig"
render "${KIT_DIR}/config/pg_hba.conf" "${PG_CONF_DIR}/pg_hba.conf" 0640 postgres:postgres
systemctl enable postgresql >/dev/null 2>&1 || true
systemctl restart postgresql
# shared_preload_libraries obliga a reinicio, ya hecho arriba.
ok "PostgreSQL reiniciado con la configuración nueva"

log "Roles y contraseñas"
# Reutiliza las contraseñas ya emitidas para no invalidar el env en cada corrida.
APP_PW="$(env_get DATABASE_URL 2>/dev/null | sed -nE 's|^postgres://[^:]+:([^@]+)@.*$|\1|p')"
MIG_PW="$(env_get DATABASE_MIGRATION_URL 2>/dev/null | sed -nE 's|^postgres://[^:]+:([^@]+)@.*$|\1|p')"
[[ -n "$APP_PW" ]] || { APP_PW="$(gen_pw)"; NEW_APP_PW=1; }
[[ -n "$MIG_PW" ]] || { MIG_PW="$(gen_pw)"; NEW_MIG_PW=1; }

su - postgres -c "psql -v ON_ERROR_STOP=1 -q" <<SQL
do \$\$
begin
  if not exists (select 1 from pg_roles where rolname = '${PG_MIGRATOR_ROLE}') then
    create role ${PG_MIGRATOR_ROLE} login password '${MIG_PW}';
  else
    alter role ${PG_MIGRATOR_ROLE} login password '${MIG_PW}';
  end if;
  if not exists (select 1 from pg_roles where rolname = '${PG_APP_ROLE}') then
    create role ${PG_APP_ROLE} login password '${APP_PW}';
  else
    alter role ${PG_APP_ROLE} login password '${APP_PW}';
  end if;
end
\$\$;
-- Las migraciones pueden tardar más que una consulta web: sin tope de 15 s.
alter role ${PG_MIGRATOR_ROLE} set statement_timeout = '15min';
alter role ${PG_MIGRATOR_ROLE} set lock_timeout = '30s';
alter role ${PG_APP_ROLE} set statement_timeout = '15s';
SQL
ok "Roles ${PG_MIGRATOR_ROLE} y ${PG_APP_ROLE} listos"

log "Base de datos ${PG_DB} (locale ICU es-PE)"
if su - postgres -c "psql -Atqc \"select 1 from pg_database where datname='${PG_DB}'\"" | grep -q 1; then
  ok "La base ya existe"
else
  # ICU da orden alfabético correcto en español (ñ, tildes) sin depender de los
  # locales instalados en el sistema. template0 es obligatorio cuando el locale
  # difiere de template1. Si el build de Postgres no trae ICU, se cae a C.UTF-8.
  ICU_ERR="$(mktemp)"
  if su - postgres -c "psql -v ON_ERROR_STOP=1 -q -c \"create database ${PG_DB} owner ${PG_MIGRATOR_ROLE} encoding 'UTF8' locale_provider icu icu_locale 'es-PE' locale 'C.UTF-8' template template0\"" 2>"$ICU_ERR"; then
    rm -f "$ICU_ERR"
    ok "Base creada con ICU es-PE"
  else
    warn "No pude crear la base con ICU:"
    sed 's/^/       /' "$ICU_ERR" >&2; rm -f "$ICU_ERR"
    warn "Reintentando con locale C.UTF-8 (el orden alfabético será binario)"
    su - postgres -c "psql -v ON_ERROR_STOP=1 -q -c \"create database ${PG_DB} owner ${PG_MIGRATOR_ROLE} encoding 'UTF8' locale 'C.UTF-8' template template0\""
    ok "Base creada con C.UTF-8"
  fi
fi

log "Privilegios (§4.3)"
su - postgres -c "psql -v ON_ERROR_STOP=1 -q -d ${PG_DB}" <<SQL
-- Las extensiones primero: las crea postgres (superusuario) y sus funciones
-- quedan ejecutables por PUBLIC, así que los grants de abajo las alcanzan.
create extension if not exists pg_stat_statements;
create extension if not exists pgcrypto;

-- El esquema public pertenece al migrador; la app no puede crear objetos.
alter schema public owner to ${PG_MIGRATOR_ROLE};
revoke all on schema public from public;
revoke all on database ${PG_DB} from public;

grant connect, temporary on database ${PG_DB} to ${PG_MIGRATOR_ROLE};
grant connect on database ${PG_DB} to ${PG_APP_ROLE};

grant usage, create on schema public to ${PG_MIGRATOR_ROLE};
grant usage on schema public to ${PG_APP_ROLE};

-- Lo que ya exista.
grant select, insert, update, delete on all tables    in schema public to ${PG_APP_ROLE};
grant usage, select                 on all sequences  in schema public to ${PG_APP_ROLE};
grant execute                       on all functions  in schema public to ${PG_APP_ROLE};

-- Y lo que el migrador cree en el futuro, sin volver a otorgar a mano.
alter default privileges for role ${PG_MIGRATOR_ROLE} in schema public
  grant select, insert, update, delete on tables to ${PG_APP_ROLE};
alter default privileges for role ${PG_MIGRATOR_ROLE} in schema public
  grant usage, select on sequences to ${PG_APP_ROLE};
alter default privileges for role ${PG_MIGRATOR_ROLE} in schema public
  grant execute on functions to ${PG_APP_ROLE};
SQL
ok "mpb_app queda con DML; el esquema solo lo toca mpb_migrator"

log "Escribiendo las cadenas de conexión en ${ENV_FILE}"
env_set DATABASE_URL           "postgres://${PG_APP_ROLE}:${APP_PW}@127.0.0.1:5432/${PG_DB}"
env_set DATABASE_MIGRATION_URL "postgres://${PG_MIGRATOR_ROLE}:${MIG_PW}@127.0.0.1:5432/${PG_DB}"
env_set PGPOOL_MAX             "10"
if [[ -n "${NEW_APP_PW:-}${NEW_MIG_PW:-}" ]]; then
  record_secret "# PostgreSQL ($(date -Is))"
  record_secret "DATABASE_URL=postgres://${PG_APP_ROLE}:${APP_PW}@127.0.0.1:5432/${PG_DB}"
  record_secret "DATABASE_MIGRATION_URL=postgres://${PG_MIGRATOR_ROLE}:${MIG_PW}@127.0.0.1:5432/${PG_DB}"
  record_secret ""
  ok "Contraseñas nuevas guardadas también en ${SECRETS_OUT}"
fi

log "Prueba de conexión real de cada rol"
PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U "$PG_APP_ROLE" -d "$PG_DB" -Atqc \
  "select 'app ok, puedo leer'" || die "mpb_app no puede conectar."
# Debe fallar: si la app pudiera crear tablas, el reparto de privilegios estaría mal.
if PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U "$PG_APP_ROLE" -d "$PG_DB" -Atqc \
     "create table _probe_privilegios(x int)" >/dev/null 2>&1; then
  PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U "$PG_APP_ROLE" -d "$PG_DB" -qc \
    "drop table _probe_privilegios" >/dev/null 2>&1 || true
  die "mpb_app pudo crear una tabla: los privilegios NO están bien."
fi
ok "mpb_app conecta y no puede crear tablas (correcto)"
PGPASSWORD="$MIG_PW" psql -h 127.0.0.1 -U "$PG_MIGRATOR_ROLE" -d "$PG_DB" -Atqc \
  "select 'migrator ok'" >/dev/null || die "mpb_migrator no puede conectar."
ok "mpb_migrator conecta"

ok "Paso 20 completo · PostgreSQL ${PG_FULL} escuchando solo en localhost."
