# Backend Patterns

Copy-paste reference. Match the repo you are in — consistency inside a repo beats global purity.

## Two architectures

### A — Feature-sliced
`HPlus-Backend`, `medoc_plus_backend`, `docApp-backend`, `compliant-dashboard-backend`

```
src/features/<domain>/
  <domain>Controller.ts      route + socket handlers
  <domain>Routes.ts          router definition
  <domain>Model.ts           interfaces + collection shape
  models/                    when a domain has several models
  validations/               express-validator / zod schemas
  utils/                     domain helpers
  Readme.md                  the feature spec — keep it current
```

Large domains nest: `features/ipd/{vitals,ward,models,validations,scripts}/`.
`docApp-backend`'s README states the intent: *"features first approach"*, each folder holding
`controller.ts`, `<feature>_model.ts`, `ctrlfunc.ts`.

### B — Layered MVC
`admin-dashboard-backend`, `Medoc-Velocity-Backend`, `Support-Dashboard-Backend`,
`Medoc-Outreach-Backend`, `Campaign-Dashboard-Backend`, `medoc-auth-service`, `medoc-abdm-dashboard-backend`

```
src/
  routes/          *.routes.ts      endpoint definitions + middleware mounting
  controllers/     *.controller.ts  validation, orchestration, response shaping
  services/        *.service.ts     business logic, external integrations
  repositories/    *.repository.ts  data access
  models/          *.model.ts       schemas and interfaces
  middleware/      auth, validation, error handling
  errors/  config/  utils/  integrations/  types/
```

Sub-modules may be nested feature-style inside a layered repo
(`admin-dashboard-backend/src/paymentRouting/` and `src/upload/` both have their own
`controllers/ models/ routes/ services/ validation/`). That hybrid is acceptable for a bounded subsystem.

## Errors — throw, never return

Reference: `HPlus-Backend/src/errors/`.

```ts
// HttpError.ts — factory-generated typed errors
export const BadRequestError          = createHttpErrorClass(400, "Bad Request");
export const UnauthorizedError        = createHttpErrorClass(401, "Unauthorized");
export const ForbiddenError           = createHttpErrorClass(403, "Forbidden");
export const NotFoundError            = createHttpErrorClass(404, "Not Found");
export const ConflictError            = createHttpErrorClass(409, "Conflict");
export const UnprocessableEntityError = createHttpErrorClass(422, "Unprocessable Entity");
export const TooManyRequestsError     = createHttpErrorClass(429, "Too Many Requests");
export const InternalServerError      = createHttpErrorClass(500, "Internal Server Error");
export const BadGatewayError          = createHttpErrorClass(502, "Bad Gateway");
export const ServiceUnavailableError  = createHttpErrorClass(503, "Service Unavailable");
```

Each accepts either a string or `{ message, data }`:

```ts
throw new BadRequestError("patientId is required");
throw new NotFoundError({ message: "Ward not found", data: { wardId } });
```

`errorHandler` (mounted last) resolves, in order:
1. `instanceof HttpError`
2. any object with a numeric `statusCode` — a deliberate fallback, because `instanceof` can fail
   across bundled/`tsup` build boundaries
3. Multer errors (`LIMIT_FILE_SIZE` → 413, `LIMIT_UNEXPECTED_FILE`/`LIMIT_FILE_COUNT` → 400)
4. Mongoose validation errors
5. generic 500

It always sets `Content-Type: application/json` and guards `res.headersSent`, so Express never
renders its default HTML error page into an API response.

**Note:** `HttpError` sets `Object.setPrototypeOf(this, new.target.prototype)` — required for
`instanceof` to survive TypeScript's ES5 class-extends-Error downlevelling. Keep it.

## Responses — one envelope

```ts
{ success: boolean, message: string, data?: T, pagination?: IPagination }
interface IPagination { total: number; page: number; limit: number; totalPages: number }
```

Use the `HttpResponse` helper rather than hand-rolling:

```ts
HttpResponse.send({ res, data, message });                       // 200
HttpResponse.created({ res, data });                             // 201
HttpResponse.noContent({ res });                                 // 204
HttpResponse.sendWithPagination({ res, data, pagination });      // 200 + pagination
```

> **Honest state:** the helper is under-adopted. `HPlus` has 207 `HttpResponse.*` calls against 2,719
> raw `res.status().json({ success: ... })`; most other services have zero. The envelope shape is
> nonetheless consistent everywhere. **New code should use the helper**; do not mass-migrate old code
> without a reason.

## Async handler

Wrap async route handlers so rejections reach `errorHandler` (mandatory on Express 4; still good
practice on Express 5). Reference: `medoc-auth-service/src/middlewares/async.handler.ts`.

```ts
router.post("/", asyncHandler(controller.create));
```

## Environment validation — fail fast at boot

Reference: `medoc-auth-service/src/config/env.ts`, `whatsapp-delivery-service/src/config/env.ts`.

```ts
export interface EnvSchema { PORT: string; MONGODB_URI: string; /* ... */ }
export enum ENODE_ENV { DEV = "development", PROD = "production" }

export class EnvConfig {
  private static instance: EnvConfig;
  public readonly config: EnvSchema;
  private constructor() { this.config = this.validateEnvs(); }
  public static getInstance(): EnvConfig {
    if (!EnvConfig.instance) EnvConfig.instance = new EnvConfig();
    return EnvConfig.instance;
  }
  private validateEnvs(): EnvSchema {
    const requiredKeys: (keyof EnvSchema)[] = ["PORT", "MONGODB_URI", "NODE_ENV"];
    // throw on any missing key
  }
}
```

Adopt this in every new service. It is the structural answer to the hardcoded-secret-fallback problem:
if the key is required and missing, the process refuses to start, so there is never a reason to write
`process.env.X || "default"`.

Note `dotenv.config({ quiet: true })` — suppresses dotenv's startup banner.

## Dependency injection

`medoc-abdm-dashboard-backend` uses **Brandi**:

```ts
// tokens.ts  — declare FIRST (tsup builds in import order)
export const TOKENS = { milestone1Service: token<Milestone1Service>("m1Service") };

// service file — bind deps at the bottom
injected(Milestone1Controller, TOKENS.milestone1Service);

// di.ts — register
container.bind(TOKENS.milestone1Service).toInstance(Milestone1Service).inSingletonScope();

// route file — resolve
const controller = container.get(TOKENS.milestone1Controller);
```

`medoc-auth-service` uses a simpler hand-rolled `container.ts`. Both are fine; the pattern to keep is
**services are stateless and receive per-request config as an argument**, not via constructor state.

## Controller shape

```ts
class ThingController {
  constructor(private thingService: ThingService) {}

  create = async (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) throw new BadRequestError("name is required");
    const data = await this.thingService.create(name, req.user.hospitalId);
    return HttpResponse.created({ res, data });
  };
}
```

- Arrow-function properties so `this` survives Express's handler invocation.
- Validate, delegate, respond. No DB calls, no business rules.
- `hospitalId` from `req.user` (populated by verified JWT), never from the body.

## Logging

- `winston` in `compliant-dashboard-backend`, `HPlus`, `medoc-upload-service`,
  `whatsapp-delivery-service`, `medoc-patient-service`, `medoc-auth-service`.
- `morgan` for HTTP access logs.
- Use the repo's `logger`. **Do not add `console.log`** — there are ~1,850 already and they leak into
  production output. Never log PHI.

## Validation

- `express-validator` — most Express services.
- `zod` — `msf-core`, `HPlus`, `medoc_plus`, `admin-dashboard`, `compliant-dashboard`, `patient-service`, and all Next.js frontends. **Check the major version (3 vs 4) before writing schemas.**

## Messaging

`whatsapp-delivery-service/src/rabbitmqManager.ts` is the reference:

- Singleton `RabbitMQManager` with a listener registry.
- `reconnectDelay = 5000`, `maxRetries = 5`, `isConnecting` guard against concurrent connects,
  `shouldReconnect` flag for clean shutdown.
- Queues: `queue.otp`, `queue.schedulers`, `queue.prescriptions` (the `EQUEUE` enum).
- Handlers extend `baseHandler.ts` — one handler per queue.

Producers: `docApp-backend/src/async/rabbitMQProducer.ts`, `me-backend/src/async/rabbitMQProducer.ts`.

## Testing

Jest + ts-jest. `__mocks__/` for module mocks (`docApp-backend/src/__mocks__/amqplib.ts`),
`supertest` for HTTP integration tests.

Coverage is thin — 32 test files across ~665k LOC. `msf-core` (5 test files, 20 source files) and
`Support-Dashboard-Backend` (10) are the only repos with meaningful suites.
**New business logic should ship with tests**; that is how the number moves.

## Health checks

Every service exposes `GET /health` returning 200. The Docker `HEALTHCHECK` depends on it. Some
services also mount `/api/health`. New services must expose `/health`.
