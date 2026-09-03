# Option 2 — GitHub Actions + GHCR

The workflow at `.github/workflows/build-push.yml` builds both Docker images for `linux/amd64` and `linux/arm64`, then pushes them to GitHub Container Registry (GHCR) on every push to `main`.

## How it works

1. Triggers on push to `main` or manually via `workflow_dispatch`
2. Logs in to `ghcr.io` using the built-in `GITHUB_TOKEN` — no secrets to configure
3. Sets up QEMU and Docker Buildx for cross-platform builds
4. Builds `./backend` and `./frontend` as multi-architecture images
5. Pushes two tags per image:
   - `latest` — always points to the most recent build from `main`
   - `<git-sha>` — immutable reference for pinned deployments

**Image names produced:**
```
ghcr.io/diegolegitsec/k8s-app/backend:latest
ghcr.io/diegolegitsec/k8s-app/frontend:latest
```

Each tag is a multi-architecture manifest for:

```text
linux/amd64
linux/arm64
```

## Setup steps

### 1. Enable the workflow

The workflow file is already in `.github/workflows/build-push.yml`. Push it to `main` — it will run automatically on the next push.

No additional secrets are needed. `GITHUB_TOKEN` is provided automatically by GitHub Actions and has permission to push packages to GHCR.

### 2. Make packages public (recommended)

After the first successful workflow run, your packages will appear at:
```
https://github.com/diegolegitsec?tab=packages
```

By default, new GHCR packages are **private**. To pull them from EKS without an imagePullSecret, make them public:

1. Go to `https://github.com/diegolegitsec/k8s-app/pkgs/container/k8s-app%2Fbackend`
2. Click **Package settings** → **Change visibility** → Public
3. Repeat for the frontend package

Alternatively, keep them private and [create an imagePullSecret](#using-private-packages).

### 3. Update image references in K8s manifests

Before deploying to AWS, update the `<OWNER>` placeholder in both AWS deployment files:

**`k8s/aws/backend/deployment.yaml` — line 18:**
```yaml
image: ghcr.io/diegolegitsec/k8s-app/backend:latest
```

**`k8s/aws/frontend/deployment.yaml` — line 18:**
```yaml
image: ghcr.io/diegolegitsec/k8s-app/frontend:latest
```

Or use `sed` to replace both at once:
```bash
sed -i '' 's|<OWNER>|diegolegitsec|g' \
  k8s/aws/backend/deployment.yaml \
  k8s/aws/frontend/deployment.yaml
```

> **Local deployments are still local-build friendly.** `k8s/local/` manifests use GHCR-style image names with `imagePullPolicy: Never`, so Docker Desktop uses the locally-built images created by `./scripts/deploy.sh vanilla`.

## Using private packages

If you keep the packages private, create a Kubernetes secret with a GitHub Personal Access Token (PAT) that has `read:packages` scope:

```bash
kubectl create secret docker-registry ghcr-secret \
  --namespace k8s-app \
  --docker-server=ghcr.io \
  --docker-username=diegolegitsec \
  --docker-password=<your-pat>
```

Then add `imagePullSecrets` to both AWS deployment files:
```yaml
spec:
  containers:
    - name: backend
      image: ghcr.io/diegolegitsec/k8s-app/backend:latest
  imagePullSecrets:
    - name: ghcr-secret
```

## Pinning to a specific commit

To deploy a specific build instead of `latest`, replace the tag with the Git SHA:
```yaml
image: ghcr.io/diegolegitsec/k8s-app/backend:abc1234
```

SHA tags are listed under each package's versions page on GitHub.
