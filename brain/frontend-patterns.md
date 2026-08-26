# Frontend Patterns

## Next.js (10 repos)

All use the **App Router** with TypeScript, Tailwind, shadcn/ui on Radix primitives.

### Versions differ — check first

| Repo | Next | React | Tailwind |
|---|---|---|---|
| Medoc-Care-Dashboard-Frontend | ^16.3.1 | 19.2.4 | 4 |
| Medoc-Velocity-Frontend | ^16.3.1 | 19.2.4 | 4 |
| Medoc-Main-Website | ^16.3.1 | ^19.0.0 | 3.4.1 |
| medoc-abdm-dashboard-frontend | 16.2.7 | 19.2.4 | 4 |
| Admin-Dashboard-Frontend | ^16.2.6 | ^18 | 3.4.1 |
| Medoc-Outreach-Frontend | ^16.2.6 | 19.2.3 | 4 |
| Medoc-Support-Dashboard | 15.5.18 | 19.1.0 | 4 |
| Medoc-One-Frontend | 15.5.7 | 19.1.0 | 4 |

Tailwind **4** is CSS-first (`@tailwindcss/postcss`, no `tailwind.config.ts`); Tailwind **3** uses
`tailwind.config.ts`. Do not carry config between them.

Four repos enable `babel-plugin-react-compiler` (React 19 compiler): Care, Velocity, Outreach, ABDM.
Under the compiler, manual `useMemo`/`useCallback` is often unnecessary — check before adding.

Three repos ship an `AGENTS.md` (referenced by `CLAUDE.md` via `@AGENTS.md`):

> *"This is NOT the Next.js you know. This version has breaking changes — APIs, conventions, and file
> structure may all differ from your training data. Read the relevant guide in
> `node_modules/next/dist/docs/` before writing any code."*

Take it literally.

### Folder structure

```
src/
  app/
    (public)/     layout.tsx + unauthenticated routes
    (verified)/   layout.tsx + guarded routes
    (admin)/      route group for admin areas
    layout.tsx    root — providers mount here
    globals.css
  components/
    ui/           shadcn/Radix primitives (button.tsx, dialog.tsx, ...) — lowercase files
    shared/       cross-page components (Sidebar, Loader, ErrorMessage)
    pages/        page-specific composites
    providers/    ReduxProvider, AuthInitializer, ThemeProvider
  hooks/          useApi.ts, useDebounce.ts, useToast.ts, ...
  lib/            utils.ts (cn), constants.ts, validations.ts, api helpers
  store/          index.ts + slices/*.slice.ts
  types/          domain types, barrel-exported
  services/       API service functions
  constants/      sidebar.ts, api-endpoints.ts
```

Route groups `(public)` / `(verified)` carry the auth boundary. Guarding lives in the **group layout**,
not scattered per page — except login, which guards itself so it can redirect an already-authenticated user.

### State management

- **Redux Toolkit** — Care, Admin, Outreach, One, Support. Slices in `store/slices/*.slice.ts`,
  memoised selectors via `createSelector`, `redux-persist` where sessions need to survive reload.
- **SWR** — Admin Dashboard, Main Website.
- **TanStack Query** — Medoc-One only.
- Local `useState` for component-scoped state.

ADR `003-content-redux-caching.md` documents the caching convention: each collection slice carries an
`initialized: boolean`; pages auto-fetch only `if (!initialized)`; an explicit **Refresh** button
bypasses the guard. During a background refresh the table gets `opacity-50` so stale data stays
visible. Known trade-off: data can go stale within a session; the Refresh button is the mitigation.

### API client

`src/hooks/useApi.ts` wraps a shared Axios instance and returns typed methods. All return
`Promise<BackendResponse<T>>` — the full backend envelope `{ message, data?, pagination? }`.

```ts
const api = useApi();

const { data: chapter }              = await api.get<Chapter>('/chapters/123');
const { data: chapters, pagination } = await api.get<Chapter[]>('/chapters', { params: { page: 1, limit: 20 } });
const { message }                    = await api.post('/auth/login', { userId, password });
await api.put('/chapters/123', body);
await api.patch('/chapters/123', { chapterName });
await api.del('/chapters/123');
await api.upload<T>('/upload', formData);   // do NOT set Content-Type — the browser sets the boundary
```

Cookie-auth repos configure `withCredentials: true` on the instance.

### Auth on the client (Care Dashboard reference)

```
RootLayout
  └─ ReduxProvider
       ├─ AuthInitializer   renderless; ref-guarded; calls GET /auth/me once on mount
       └─ children
```

- The auth slice starts `isLoading: true`; `AuthInitializer` only ever sets it to `false` (in `finally`).
- `VerifiedLayout` redirects to `/login` when loading is done and the user is unauthenticated,
  unverified, or suspended; shows a spinner while loading.
- `PublicLayout` is stateless — the homepage is never redirected.
- `LoginPage` guards itself: spinner while loading, `router.replace('/dashboard')` if already
  authenticated, otherwise the form. The spinner persists until navigation fires, preventing a form flash.
- Slice actions: `setUser`, `setLoading`, `setError`, `clearAuth`.

### Component conventions

```tsx
interface UserCardProps {
  /** The user to display */
  user: User;
  onEdit?: (user: User) => void;
  className?: string;
}

export function UserCard({ user, onEdit, className }: UserCardProps) { /* ... */ }
```

- Destructure props **in the signature**, not the body.
- `memo` + `displayName` where memoisation is warranted.
- Extract data logic into a custom hook (`useUserCard(userId)`), keep the component presentational.
- Tailwind classes only — no inline `style`. Theme via CSS variables
  (`bg-primary text-primary-foreground`), not hardcoded colours.
- Responsive by default: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`.
- Barrel exports (`components/ui/index.ts`) for ergonomic imports.

### Naming

| Kind | Convention | Example |
|---|---|---|
| Components | `PascalCase.tsx` | `UserCard.tsx` |
| shadcn/ui primitives | lowercase | `button.tsx`, `dialog.tsx` |
| Hooks | `useThing.ts` | `useApi.ts` |
| Utilities | `kebab-case.ts` or `camelCase.ts` | `date-utils.ts`, `formatters.ts` |
| Types | `PascalCase.ts` | `Hospital.ts` |
| Redux slices | `thing.slice.ts` | `auth.slice.ts` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_RETRY_ATTEMPTS` |

Path alias `@/*` → `./src/*` in every Next.js repo.

### Common libraries

`lucide-react` (icons) · `react-hook-form` + `@hookform/resolvers` + `zod` (forms) ·
`recharts` (charts; `apexcharts` in Outreach) · `motion` (animation) · `sonner` (toasts) ·
`date-fns` · `cmdk` (command palette) · `next-themes` (dark mode) · `embla-carousel-react` ·
`exceljs` / `jspdf` + `jspdf-autotable` (exports) · `@dnd-kit` (drag & drop) ·
`class-variance-authority` + `clsx` + `tailwind-merge` (the `cn()` helper).

`Medoc-Main-Website` additionally uses Prisma + NextAuth + TipTap (CMS) — it is a marketing site,
not a clinical app. Do not treat its patterns as the platform standard.

---

## Flutter (4 apps)

| App | Version | Dart SDK | State mgmt | HTTP | Files |
|---|---|---|---|---|---|
| `DocAssist` (doc_assist) | 4.5.1 | `^3.7.2` | **Provider** | dio + http | 517 |
| `hospital-plus-frontend` (hospital_plus) | 2.2.5 | `>=3.0.5 <4.0.0` | **Riverpod** + Provider | dio + http | 717 |
| `MedocPlus-Frontend-V2` (medocplus) | 2.6.8+12 | `>=3.0.0 <4.0.0` | **Provider** | http | 342 |
| `MedocEUA` (medoceua) | 1.7.3+34 | `>=2.19.0 <3.0.0` ⚠ | **GetX** + Provider | dio + http | 296 |

Four apps, three different state-management approaches. There is no house standard.
**Follow the app you are in.**

⚠ `MedocEUA` is constrained to **Dart 2.x** — it will not build on a current Flutter toolchain
without a null-safety/SDK migration.

### Structure

`DocAssist` is the best-organised:
```
lib/ core/ constants/ models/ screens/ feature/ services/ widgets/ provider/ database/ responsive/ utils/ extras/
```
The other three use a single `lib/src/` tree.

### Notable capabilities

- `DocAssist` — desktop targets (Windows/macOS/Linux), `auto_updater`, Inno Setup installer
  (`installer.iss`), **Shorebird** code push (`shorebird.yaml`), Hive local DB,
  `flutter_secure_storage`, WebRTC (telemedicine), camera, barcode.
- `hospital-plus-frontend` — Google Maps, geolocation, drawing board (signatures), Shorebird.
- `MedocPlus-Frontend-V2` — `dicom_parser` (medical imaging), file save/export.
- `MedocEUA` — `health` package (HealthKit/Google Fit), `body_part_selector`, Google Sign-In,
  `encrypt` for client-side crypto.

Secure storage: only `DocAssist` uses `flutter_secure_storage`. The others use
`shared_preferences` — **not appropriate for tokens or PHI**. Prefer secure storage for anything sensitive.

### Web build artifacts

`hospital_plus_build` (58 MB) and `mplus-web-build` (45 MB) are **compiled Flutter web output**
checked into their own repos — `main.dart.js` is 13 MB and 9.4 MB respectively. They are deploy
artifacts, not source. Do not edit them; change the source app and rebuild.

`hospital_plus_build/assets/packages/encryption_json/assets/keys/auth_key.pem` is a key material
file inside a build artifact — see `hazards.md`.

---

## Asset discipline

`Medoc-Velocity-Frontend` is **355 MB**, of which ~354 MB is badge PNGs: 12–17 MB each, and
**duplicated** between `src/assets/badges/` and `public/badges/`. `Medoc-Main-Website` carries
~220 MB in `src/`.

Rules for new assets:
- Optimise raster images before committing; a badge icon should be single-digit KB, not 15 MB.
- Prefer SVG for icons and badges.
- Store web-served assets in `public/` only — importing the same file from `src/` duplicates it.
- Use `next/image` (`sharp` is already a dependency where needed).
