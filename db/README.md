> Escrito para: quien opere la base de cheapmusic.best (tú). Complementa `deploy/README.md`.

# Base de datos · PostgreSQL propio

Todo cambio de esquema es un archivo en `db/migrations/`, numerado y versionado. `npm run db:migrate` aplica los pendientes en orden, cada uno en su transacción, y los registra en `schema_migrations`. En el VPS lo ejecuta `deploy.sh` con el rol `mpb_migrator` antes de reiniciar la web.

| Migración | Qué hace |
|---|---|
| `001_baseline.sql` | Las tablas que venían de Supabase. Idempotente: sobre un volcado restaurado no toca nada salvo índices faltantes y el RLS heredado |
| `002_orders_payments.sql` | Trazabilidad de pedidos, reserva de cupos, contabilidad real en `payments`, `settings` (§7.1) |
| `003_intents_wallet.sql` | Intentos de pago, eventos de proveedor, entregas, saldo dual, límites de tasa (§7.2) |
| `004_telegram.sql` | Estado conversacional del bot |

Las columnas que apuntan a tablas heredadas usan dominios (`mpb_customer_ref`, etc.) que copian el tipo real del `id`, sea `bigint` o `uuid`. Así no importa cómo lo creó Supabase.

## Corte desde Supabase (fase 1, §5)

Con la fase 0 del kit terminada (PostgreSQL instalado, base `musicapremium` vacía):

1. **Volcar Supabase.** Desde tu máquina, con la cadena de conexión de *Project Settings → Database* (modo Session):

   ```bash
   SUPABASE_DB_URL='postgresql://…' ./scripts/supabase-export.sh
   ```

2. **Subir el volcado y restaurarlo en el VPS.** El script se niega a restaurar sobre una base con tablas, y deja fuera las políticas RLS y las extensiones de Supabase:

   ```bash
   scp -i ~/.ssh/musicapremium_deploy supabase-public.dump deploy@cheapmusic.best:/tmp/
   # en el VPS, desde /srv/musicapremium/repo:
   export DATABASE_MIGRATION_URL="$(sudo sed -n 's/^DATABASE_MIGRATION_URL=//p' /etc/musicapremium/env)"
   bash scripts/supabase-restore.sh /tmp/supabase-public.dump
   ```

3. **Desplegar.** `sudo musicapremium-deploy` aplica 001–004 y arranca la web y el worker.

4. **Verificar.** Compara conteos por tabla y cuatro consultas de negocio entre las dos bases, en modo solo lectura:

   ```bash
   SOURCE_DATABASE_URL='postgresql://…supabase…' \
   TARGET_DATABASE_URL="$(sudo sed -n 's/^DATABASE_URL=//p' /etc/musicapremium/env)" \
     npm run db:verify-cutover
   ```

5. **Dejar Supabase en solo lectura** una o dos semanas antes de apagarlo.

Borra `supabase-public.dump` de tu máquina y de `/tmp` cuando termines: contiene las credenciales de las cuentas.

## Desarrollo local sin instalar PostgreSQL

`npm run db:dev` levanta PostgreSQL real (PGlite) en `127.0.0.1:55432`, con los datos en `.pglite-dev/`. Crea `.env.development.local` con:

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/postgres
```

Luego, en otra terminal:

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/postgres npm run db:migrate
```

```bash
npm run dev
```

Las pruebas (`npm test`) no necesitan nada de esto: cada archivo crea su propia base PGlite en memoria con las mismas migraciones.
