# How to Extend This Project

You already have: Python backend + Docker + Docker Compose + GitHub Actions CI.

This doc shows **what to add / what to change** if you want to go further. Each section is independent — pick only what you need.

---

## End-to-End Flow Charts

### What You Have Now

```
Developer
    │
    │  git push origin main
    ▼
GitHub
    │
    │  triggers ci.yml
    ▼
GitHub Actions Runner (Ubuntu VM)
    │
    ├──► Job: test
    │         ├── pip install
    │         ├── start MongoDB container
    │         └── pytest → ✅ pass
    │
    └──► Job: build  (only if test passed)
              ├── docker build backend
              ├── docker build frontend
              ├── docker compose up -d
              ├── curl localhost:8000  → ✅
              ├── curl localhost:3000  → ✅
              └── docker compose down

Pipeline ✅ Green  —  stops here, nothing deployed anywhere
```

---

### Flow: AWS ECS

```
Developer
    │
    │  git push origin main
    ▼
GitHub Actions
    │
    ├──► Job: test       → pytest passes
    ├──► Job: build      → docker build + smoke test passes
    └──► Job: deploy
              │
              ├── Login to ECR (AWS image registry)
              ├── docker build backend
              ├── docker push → ECR  (image stored in AWS)
              └── aws ecs update-service
                        │
                        ▼
                  ECS Fargate Cluster
                        │
                        ├── pulls new image from ECR
                        ├── starts new container
                        ├── health check: GET / → 200 ✅
                        ├── routes traffic to new container
                        └── stops old container
                                  │
                                  ▼
                          App Live on AWS  🌐
```

---

### Flow: Kubernetes

```
Developer
    │
    ├── [One time only] kubectl apply -f k8s/
    │         └── creates Deployments, Services in cluster
    │
    │  git push origin main
    ▼
GitHub Actions
    │
    ├──► Job: test       → pytest passes
    ├──► Job: build      → docker build + smoke test passes
    └──► Job: deploy
              │
              ├── docker build backend
              ├── docker push → image registry (ECR / Docker Hub)
              └── kubectl set image deployment/backend ...
                        │
                        ▼
                  Kubernetes Cluster
                        │
                        ├── pulls new image
                        ├── starts new pod (old one still running)
                        ├── readiness probe: GET / → 200 ✅
                        ├── routes traffic to new pod
                        └── terminates old pod  (zero downtime)
                                  │
                                  ▼
                          App Live on K8s  🌐
```

---

### Flow: Terraform (sets up AWS infra before deploying)

```
Developer  (one time only — sets up infrastructure)
    │
    │  terraform init
    │  terraform apply
    ▼
Terraform
    │
    ├── creates VPC (private network in AWS)
    ├── creates ECR repository (image storage)
    ├── creates ECS cluster + service
    └── creates Load Balancer
              │
              ▼
        AWS Infrastructure Ready ✅
              │
              ▼
    Now use the AWS ECS flow above ↑
    (Terraform is not in every push — only when infra changes)
```

---

### Flow: Jenkins (replaces GitHub Actions)

```
Developer
    │
    │  git push origin main
    ▼
GitHub
    │
    │  webhook (HTTP POST to Jenkins server)
    ▼
Jenkins Server  (your own EC2 / VM)
    │
    ├── Stage: Checkout  → git clone repo
    ├── Stage: Test      → pip install + pytest ✅
    ├── Stage: Build     → docker build backend + frontend
    ├── Stage: Push      → docker push to ECR
    └── Stage: Deploy    → aws ecs update-service
              │
              ▼
        ECS pulls new image → App Live 🌐
              │
    post { success → Slack notification ✅ }
    post { failure → Slack alert ❌ }
```

---

### All 4 Paths Side by Side

```
git push
    │
    ├──────────────────────────────────────────────────────────┐
    │                                                          │
    ▼                                                          ▼
GitHub Actions                                            Jenkins Server
(cloud, free)                                         (your own server)
    │                                                          │
    ├── test ──► build ──► [deploy?]              ├── test ──► build ──► deploy
    │                           │                             │
    │               ┌───────────┴───────────┐                │
    │               │                       │                │
    ▼               ▼                       ▼                ▼
stops here       AWS ECS              Kubernetes          AWS ECS
(what you      (containers           (pods restart,     (same as left,
 have now)      restart in            zero downtime)     self-hosted)
                Fargate)
                    ▲
                    │
               Terraform
            (created this
             infra once)
```

---

## 1. Deploy to AWS (ECS)

**What you need:** An AWS account.

**What changes:**

| What | Action |
|---|---|
| Docker images | Push to **ECR** (AWS's image registry) instead of running locally |
| Running containers | Use **ECS Fargate** instead of `docker compose up` |
| MongoDB | Use **MongoDB Atlas** (free tier) or AWS DocumentDB |
| CI pipeline | Add a `deploy` job to `ci.yml` that pushes to ECR and restarts ECS |

**Files to create:**
- Nothing new — just add a `deploy` job at the bottom of `.github/workflows/ci.yml`

**The 4 steps:**
1. Create an ECR repository in AWS Console → get your registry URL
2. Create an ECS cluster + service in AWS Console → point it to your ECR image
3. Add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to GitHub Secrets
4. Add this block to `ci.yml` after the `build` job:

```yaml
  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - uses: aws-actions/amazon-ecr-login@v2
      - run: |
          docker build -t ${{ steps.login-ecr.outputs.registry }}/task-manager-backend:$GITHUB_SHA ./backend
          docker push ${{ steps.login-ecr.outputs.registry }}/task-manager-backend:$GITHUB_SHA
          aws ecs update-service --cluster task-manager-cluster --service backend --force-new-deployment
```

That's it. Every push to `main` → tests pass → image pushed to ECR → ECS restarts with the new image.

---

## 2. Deploy to Kubernetes (K8s)

**What you need:** A Kubernetes cluster (local: Docker Desktop K8s or minikube / cloud: EKS, GKE, AKS).

**What changes:**

| What | Action |
|---|---|
| `docker-compose.yml` | Replaced by Kubernetes YAML files |
| Running containers | `kubectl apply` instead of `docker compose up` |
| Networking | K8s Services + Ingress instead of `ports:` in Compose |

**Files to create** (new folder `k8s/`):

```
k8s/
  backend-deployment.yaml   ← replaces "backend" service in docker-compose
  backend-service.yaml      ← internal networking
  frontend-deployment.yaml  ← replaces "frontend" service
  frontend-service.yaml
  mongo-deployment.yaml     ← replaces "mongo" service
  mongo-service.yaml
```

**Minimum backend-deployment.yaml:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
        - name: backend
          image: your-ecr-url/task-manager-backend:latest
          ports:
            - containerPort: 8000
          env:
            - name: MONGO_URL
              value: "mongodb://mongo:27017"
```

**To run:**
```bash
kubectl apply -f k8s/
kubectl get pods          # check everything is running
```

**Nothing changes** in your Python code, Dockerfiles, or CI tests — only how you run it changes.

---

## 3. Infrastructure as Code with Terraform

**What you need:** Terraform CLI + AWS account (if deploying to AWS).

**What Terraform does:** Instead of clicking through AWS Console to create ECR, ECS, VPC — you write it as code and Terraform creates it all with one command.

**What changes:**

| What | Action |
|---|---|
| AWS Console setup | Replaced by Terraform config files |
| Your app code | Nothing changes |
| CI pipeline | Add `terraform apply` step or run manually |

**Files to create** (new folder `terraform/`):

```
terraform/
  main.tf         ← defines AWS resources (ECR, ECS, VPC)
  variables.tf    ← input variables (region, image name, etc.)
  outputs.tf      ← prints ECR URL, ECS cluster name after apply
```

**Minimum main.tf (just ECR + ECS cluster):**

```hcl
provider "aws" {
  region = "us-east-1"
}

resource "aws_ecr_repository" "backend" {
  name = "task-manager-backend"
}

resource "aws_ecs_cluster" "main" {
  name = "task-manager-cluster"
}
```

**To run:**
```bash
terraform init      # download AWS provider
terraform plan      # preview what will be created
terraform apply     # create the resources in AWS
terraform destroy   # tear everything down
```

**Nothing changes** in your app — Terraform only manages the AWS infrastructure, not the code.

---

## 4. Jenkins (Self-hosted CI/CD)

**What you need:** A server running Jenkins (can be a local VM, EC2, or Docker container).

**What changes:**

| What | Action |
|---|---|
| `.github/workflows/ci.yml` | Replaced by a `Jenkinsfile` at the repo root |
| GitHub triggers pipeline | Jenkins webhook triggers pipeline instead |
| Tests + Docker build | Same commands, different runner |

**File to create:** `Jenkinsfile` at the root of the repo

```groovy
pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps { checkout scm }
        }

        stage('Test') {
            steps {
                sh 'cd backend && pip install -r requirements.txt && pytest test_main.py -v'
            }
        }

        stage('Build') {
            steps {
                sh 'docker build -t task-manager-backend ./backend'
                sh 'docker build -t task-manager-frontend ./frontend'
            }
        }

        stage('Smoke Test') {
            steps {
                sh 'docker compose up -d'
                sh 'sleep 10 && curl -f http://localhost:8000/ && curl -f http://localhost:3000/'
                sh 'docker compose down'
            }
        }
    }

    post {
        failure { echo 'Pipeline failed!' }
        success { echo 'All good.' }
    }
}
```

**Setup in Jenkins:**
1. Install Jenkins → create a new Pipeline job
2. Point it to your GitHub repo
3. Add a GitHub webhook so Jenkins triggers on every push

**Nothing changes** in your app code or Dockerfiles — only the CI runner changes from GitHub's cloud to your own server.

---

## Summary: What Actually Changes Per Option

| Extension | App Code | Dockerfile | docker-compose.yml | CI file |
|---|---|---|---|---|
| AWS ECS | ✅ no change | ✅ no change | ✅ no change | Add `deploy` job |
| Kubernetes | ✅ no change | ✅ no change | Add `k8s/` folder instead | Optional deploy step |
| Terraform | ✅ no change | ✅ no change | ✅ no change | Add `terraform/` folder |
| Jenkins | ✅ no change | ✅ no change | ✅ no change | Replace with `Jenkinsfile` |

Your Python code and Docker setup never change — the extensions only affect **where and how** the containers run.
