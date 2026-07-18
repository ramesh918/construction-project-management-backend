# Step 5 — Folder Structure Creation

---

## 5.1 Create All Service Folders

Make sure you are inside the `buildtrack/` folder, then run each command one by one:

```bash
mkdir -p services/auth-service/src
mkdir -p services/projects-service/src
mkdir -p services/workers-service/src
mkdir -p services/materials-service/src
mkdir -p services/progress-service/src
mkdir -p services/dashboard-service/src
```

Create the shared types directory:
```bash
mkdir -p shared/types
```

Create a placeholder `index.ts` in each service (run each line separately on Windows):
```bash
echo 'export const handler = async () => ({ statusCode: 200, body: "ok" });' > services/auth-service/src/index.ts
echo 'export const handler = async () => ({ statusCode: 200, body: "ok" });' > services/projects-service/src/index.ts
echo 'export const handler = async () => ({ statusCode: 200, body: "ok" });' > services/workers-service/src/index.ts
echo 'export const handler = async () => ({ statusCode: 200, body: "ok" });' > services/materials-service/src/index.ts
echo 'export const handler = async () => ({ statusCode: 200, body: "ok" });' > services/progress-service/src/index.ts
echo 'export const handler = async () => ({ statusCode: 200, body: "ok" });' > services/dashboard-service/src/index.ts
```

Create a `package.json` in each service folder (run each line separately on Windows):
```bash
echo '{"name":"auth-service","version":"1.0.0","main":"src/index.ts","scripts":{"build":"tsc"},"dependencies":{},"devDependencies":{}}' > services/auth-service/package.json
echo '{"name":"projects-service","version":"1.0.0","main":"src/index.ts","scripts":{"build":"tsc"},"dependencies":{},"devDependencies":{}}' > services/projects-service/package.json
echo '{"name":"workers-service","version":"1.0.0","main":"src/index.ts","scripts":{"build":"tsc"},"dependencies":{},"devDependencies":{}}' > services/workers-service/package.json
echo '{"name":"materials-service","version":"1.0.0","main":"src/index.ts","scripts":{"build":"tsc"},"dependencies":{},"devDependencies":{}}' > services/materials-service/package.json
echo '{"name":"progress-service","version":"1.0.0","main":"src/index.ts","scripts":{"build":"tsc"},"dependencies":{},"devDependencies":{}}' > services/progress-service/package.json
echo '{"name":"dashboard-service","version":"1.0.0","main":"src/index.ts","scripts":{"build":"tsc"},"dependencies":{},"devDependencies":{}}' > services/dashboard-service/package.json
```

---

## 5.2 Verify the Full Structure

```bash
find . -type f \( -name "*.ts" -o -name "package.json" \) | grep -v node_modules | grep -v cdk.out | sort
```

Expected output:
```
./bin/buildtrack.ts
./lib/buildtrack-stack.ts
./services/auth-service/package.json
./services/auth-service/src/index.ts
./services/dashboard-service/package.json
./services/dashboard-service/src/index.ts
./services/materials-service/package.json
./services/materials-service/src/index.ts
./services/progress-service/package.json
./services/progress-service/src/index.ts
./services/projects-service/package.json
./services/projects-service/src/index.ts
./services/workers-service/package.json
./services/workers-service/src/index.ts
./shared/types/
```

---

## Checkpoints Before Moving to Step 6

- [ ] All 6 service folders created under `services/`
- [ ] `shared/types/` folder created
- [ ] Each service has a placeholder `index.ts`
- [ ] Each service has a `package.json` file
- [ ] `find` command shows all `.ts` and `package.json` files with no errors
