# Data Layer

## Model: database-per-tenant

Each hospital gets a **physically separate MongoDB database**. There is no shared collection with a
`hospitalId` discriminator column for tenant data.

```
hos_XXXXXX_db      per-hospital data      (hospitalId is `hos_` + 6 chars; suffix `_db` added by getDbName)
MedocOne_DB        cross-tenant platform data
MedocGlobal_DB     hospital registry — the source of truth for which tenants exist
Notification_DB    notification fan-out
```

Reference implementation: `HPlus-Backend/src/db/db.ts`. `docApp-backend` and `medoc_plus_backend`
carry near-identical copies. Treat the HPlus version as canonical.

## The tenant boundary

`getDbName(dbname, options?)` is the security boundary. It:

1. If `useRawDbName` — requires the name to start with `hos_`, else throws `DBNameError`.
2. If the name looks like a tenant (`hos_` prefix, length 10) — checks `hospitalIdCache`; on a miss,
   confirms against `MedocGlobal_DB.Hospitals` and caches it; if still absent, **throws**.
3. Otherwise accepts only values in the `EDBName` enum.
4. Anything else throws `DBNameError("InvalidDatabaseName")`.

**Never bypass this.** Never call `mongoClient.db(x)` directly. The `hospitalId` must originate from
the verified JWT — not `req.body`, `req.params`, or a header the client controls.

## Access pattern

```ts
import { getCollection, withTransaction } from "@/db/db";
import { ECollectionName, EDBName } from "@/configs/schemaConfig";

// tenant-scoped
const coll = await getCollection<IPatient>(ECollectionName.PATIENT_LIST, hospitalId);

// platform-scoped
const hospitals = await getCollection<IHospital>(ECollectionName.HOSPITALS, EDBName.MedocGlobalDB);
```

- Collection names: always the `ECollectionName` enum, never a literal. `medoc_plus_backend` has the
  largest enum (~90 collections) — check there before inventing a new name.
- Interfaces are `I`-prefixed; enums are `E`-prefixed.

## Connection lifecycle

- Single lazily-created `MongoClient`, `maxPoolSize: 10`, `minPoolSize: 1`.
- `connectTimeoutMS: 30000`, `socketTimeoutMS: 45000`, `waitQueueTimeoutMS: 10000`.
- `serverApi: v1`, `strict: false`, `deprecationErrors: true`.
- TLS/SSL enabled only when `NODE_ENV === "production"`.
- **Idle timeout: 10 minutes** — the client closes itself. Every `getCollection` call resets the timer.
- Long-running consumers (change streams, watchers) must bracket with `startActiveTask()` /
  `stopActiveTask()`, which increments `activeDBWatchers` and suppresses the idle close. Forgetting
  this is a classic source of "connection closed" during a watch.

## Transactions

```ts
await withTransaction(async (session) => {
  await collA.updateOne(filter, update, { session });
  await collB.insertOne(doc, { session });
});
```

- Retries up to 3 times on transient errors (`TransientTransactionError`, `WriteConflict`,
  `Unable to acquire`) with `50ms * attempt` backoff.
- Aborts and ends the session in `finally`.
- **Every operation inside must pass `{ session }`** or it runs outside the transaction silently.

## Query discipline

- Aggregations set `maxTimeMS: MONGO_AGG_MAX_TIME_MS` (25,000 ms).
- Use projections — several hot paths already do (`{ projection: { hospitalId: 1 } }`).
- Paginate list endpoints; the response envelope has a `pagination` slot:
  `{ total, page, limit, totalPages }`.
- Index creation is handled by `services/indexInitializer` in `admin-dashboard-backend` and
  `src/initializer.ts` in `HPlus-Backend` (run via `npm run initialize` before `dev`).

## Audit fields

`medoc_plus_backend/src/db/audit.model.ts` defines the shape every mutable document should carry:

```ts
interface IAuditFields {
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;   // userId from the token
  updatedBy?: string;   // userId from the token
  createdFrom?: 'VIGIL';
}
```

For NABH and DPDP purposes, treat these as mandatory on clinical and financial records.

## Mongoose vs native driver

Older services (`admin-dashboard`, `Campaign`, `Velocity`, `Support`, `Outreach`,
`Medoc-Main-Website-Backend`) still depend on **Mongoose 8/9** alongside the native driver.
Newer services (`HPlus`, `medoc_plus`, `docApp`, `auth-service`, `upload-service`,
`whatsapp-delivery-service`, `abdm`) use the **native driver only**.

**Direction of travel: native driver.** Do not introduce Mongoose into a service that does not
already have it. The tenant-switching model does not fit Mongoose's global connection/model registry well.

## Other stores

- **Redis** — RBAC permission maps (`HPlus/src/configs/redisService.ts`), caching in
  `compliant-dashboard-backend`. BullMQ queues in `admin-dashboard-backend`.
- **ClickHouse** — action/audit logs at volume (`admin-dashboard-backend/src/actionLogs/`), buffered
  in memory and flushed by a worker. Schema in `medoc-docker-repository/clickhouse/init/`.
- **Prisma + Postgres** — only `Medoc-Main-Website-Backend` and `Medoc-Main-Website` (marketing CMS).
  Unrelated to the clinical data model.
- **Azure Blob Storage / Cloudinary / AWS S3 / GCS** — file storage, abstracted behind
  `medoc-upload-service` and the shared `@medoc-health/cloudinary-multer-storage` package.
