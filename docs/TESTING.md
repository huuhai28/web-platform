# Personal Web functional and load testing

These scripts target the lab deployment only. Do not run them against a system you do not own or have permission to test.

## 1. Install the test dependency

```bash
cd /home/master/personal-web-platform
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r scripts/requirements-test.txt
```

## 2. Configure passwords without committing them

```bash
read -s -p 'Keycloak admin password: ' KEYCLOAK_ADMIN_PASSWORD; echo
export KEYCLOAK_ADMIN_PASSWORD
read -s -p 'Generated user password: ' LOADTEST_USER_PASSWORD; echo
export LOADTEST_USER_PASSWORD
read -s -p 'Functional admin password: ' LOADTEST_ADMIN_PASSWORD; echo
export LOADTEST_ADMIN_PASSWORD
```

The shell does not display password characters. These variables disappear when the shell session ends.

## 3. Create 1,000 users first

The command is idempotent: an existing account is updated instead of duplicated. It also creates or updates the `load-test-client` Keycloak client with Direct Access Grants enabled and creates `loadadmin` with `portfolio-admin`. The script refreshes its Keycloak admin token between batches during long runs.

```bash
python scripts/keycloak_seed_users.py --base-url http://<node-ip>:30777 --count 1000 --concurrency 10 --batch-size 200
```

Expected result:

```text
Progress: 1000/1000
Finished: created=1000, updated=0, failed=0
```

## 4. Run the complete functional check

```bash
python scripts/full_function_test.py --base-url http://<node-ip>:30777
```

It verifies the frontend, Keycloak discovery, public APIs, invalid input, missing/fake tokens, normal-user authorization, PostgreSQL persistence through the admin API, and the admin role.

## 5. Load test in controlled steps

Do not begin at concurrency 1,000. Keep worker2 cordoned until its disk is healthy, then monitor the cluster in separate terminals.

Warm-up with 50 users:

```bash
python scripts/load_test.py --base-url http://<node-ip>:30777 --confirm-target http://<node-ip>:30777 --users 50 --concurrency 10 --ramp-up 20 --contact-rate 0
```

Then 250 users:

```bash
python scripts/load_test.py --base-url http://<node-ip>:30777 --confirm-target http://<node-ip>:30777 --users 250 --concurrency 50 --ramp-up 30 --contact-rate 0.01
```

Then 1,000 users with a safe initial concurrency:

```bash
python scripts/load_test.py --base-url http://<node-ip>:30777 --confirm-target http://<node-ip>:30777 --users 1000 --concurrency 100 --ramp-up 60 --contact-rate 0.01
```

Only after the previous run passes, stress with 1,000 simultaneous users:

```bash
python scripts/load_test.py --base-url http://<node-ip>:30777 --confirm-target http://<node-ip>:30777 --users 1000 --concurrency 1000 --ramp-up 10 --contact-rate 0
```

## 6. Monitor while the load test runs

```bash
watch -n 2 kubectl top nodes
```

```bash
watch -n 2 kubectl top pods -n personal-web
```

```bash
kubectl get pods -n personal-web -w
```

```bash
kubectl get events -n personal-web --sort-by=.lastTimestamp
```

```bash
kubectl logs -n personal-web deployment/backend -f --tail=100
```

## 7. Interpret the report

- `error_rate`: failed HTTP requests divided by all requests.
- `p50`: half the requests completed below this latency.
- `p95`: 95% completed below this latency.
- `p99`: tail latency experienced by the slowest 1%.
- `throughput`: completed requests per second.

Default pass thresholds are error rate at most 1% and overall p95 at most 1,500 ms. Change them with `--max-error-rate` and `--max-p95-ms` only when the test objective requires it.

## 8. Common bottlenecks and responses

| Symptom | Likely cause | First response |
|---|---|---|
| Backend CPU high | Too few backend replicas | Add HPA or temporarily scale backend |
| Keycloak token calls slow | One Keycloak replica | Increase Keycloak resources/replicas and database capacity |
| PostgreSQL connections exhausted | SQLAlchemy pool or DB limit | Tune connection pool and PostgreSQL `max_connections` |
| Redis/worker queue grows | Worker throughput is low | Scale worker or add KEDA |
| 502/504 from Nginx | Backend unavailable/slow | Inspect readiness, logs, timeout and endpoints |
| Pods Evicted | Node DiskPressure/MemoryPressure | Cordon node and fix capacity before rerunning |
| p95 high but error rate low | Saturation starts before failure | Stop increasing load and inspect CPU, DB and latency |

After testing, remove generated users only with a separate reviewed cleanup procedure. Do not delete the realm or production users.
