#!/usr/bin/env python3
"""Create idempotent Keycloak users for functional and load testing."""

from __future__ import annotations

import argparse
import concurrent.futures
import getpass
import os
import sys
import threading
from dataclasses import dataclass

import httpx


@dataclass
class Result:
    username: str
    action: str
    error: str = ""


def secret_from_env(name: str, prompt: str) -> str:
    value = os.getenv(name)
    if value:
        return value
    if sys.stdin.isatty():
        return getpass.getpass(prompt)
    raise SystemExit(f"Missing environment variable: {name}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create Keycloak load-test users and a Direct Access Grant client."
    )
    parser.add_argument("--base-url", default="http://localhost:3000")
    parser.add_argument("--realm", default="personal-web")
    parser.add_argument("--admin-realm", default="master")
    parser.add_argument("--admin-user", default=os.getenv("KEYCLOAK_ADMIN", "admin"))
    parser.add_argument("--count", type=int, default=1000)
    parser.add_argument("--prefix", default="loaduser")
    parser.add_argument("--start-index", type=int, default=1)
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument(
        "--batch-size",
        type=int,
        default=200,
        help="Refresh the admin token before each batch to avoid token expiry.",
    )
    parser.add_argument("--role", default="portfolio-user")
    parser.add_argument("--client-id", default="load-test-client")
    parser.add_argument("--admin-test-user", default="loadadmin")
    parser.add_argument("--timeout", type=float, default=20.0)
    return parser.parse_args()


def admin_token(client: httpx.Client, args: argparse.Namespace, password: str) -> str:
    response = client.post(
        f"{args.base_url}/auth/realms/{args.admin_realm}/protocol/openid-connect/token",
        data={
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": args.admin_user,
            "password": password,
        },
    )
    response.raise_for_status()
    return response.json()["access_token"]


def ensure_client(client: httpx.Client, api: str, client_id: str) -> None:
    response = client.get(f"{api}/clients", params={"clientId": client_id})
    response.raise_for_status()
    matches = response.json()
    payload = {
        "clientId": client_id,
        "name": "Load test client",
        "enabled": True,
        "publicClient": True,
        "standardFlowEnabled": False,
        "directAccessGrantsEnabled": True,
        "serviceAccountsEnabled": False,
        "protocol": "openid-connect",
    }
    if matches:
        internal_id = matches[0]["id"]
        current = client.get(f"{api}/clients/{internal_id}")
        current.raise_for_status()
        merged = current.json() | payload
        update = client.put(f"{api}/clients/{internal_id}", json=merged)
        update.raise_for_status()
        print(f"Updated Keycloak client: {client_id}")
        return
    created = client.post(f"{api}/clients", json=payload)
    created.raise_for_status()
    print(f"Created Keycloak client: {client_id}")


def get_role(client: httpx.Client, api: str, role_name: str) -> dict:
    response = client.get(f"{api}/roles/{role_name}")
    response.raise_for_status()
    return response.json()


def find_user(client: httpx.Client, api: str, username: str) -> dict | None:
    response = client.get(
        f"{api}/users", params={"username": username, "exact": "true"}
    )
    response.raise_for_status()
    users = response.json()
    return users[0] if users else None


def create_or_update_user(
    client: httpx.Client,
    api: str,
    username: str,
    password: str,
    roles: list[dict],
) -> Result:
    try:
        existing = find_user(client, api, username)
        action = "updated"
        if existing is None:
            response = client.post(
                f"{api}/users",
                json={
                    "username": username,
                    "email": f"{username}@example.com",
                    "firstName": "Load",
                    "lastName": "Test",
                    "enabled": True,
                    "emailVerified": True,
                },
            )
            if response.status_code not in (201, 204):
                response.raise_for_status()
            existing = find_user(client, api, username)
            if existing is None:
                raise RuntimeError("Keycloak created the user but it cannot be queried")
            action = "created"

        user_id = existing["id"]
        reset = client.put(
            f"{api}/users/{user_id}/reset-password",
            json={"type": "password", "value": password, "temporary": False},
        )
        reset.raise_for_status()
        mapping = client.post(
            f"{api}/users/{user_id}/role-mappings/realm", json=roles
        )
        if mapping.status_code not in (204, 409):
            mapping.raise_for_status()
        return Result(username, action)
    except Exception as exc:  # report each failed account without hiding others
        return Result(username, "failed", str(exc))


def main() -> int:
    args = parse_args()
    if args.count < 1 or args.concurrency < 1 or args.batch_size < 1:
        raise SystemExit("--count, --concurrency and --batch-size must be positive")

    admin_password = secret_from_env(
        "KEYCLOAK_ADMIN_PASSWORD", "Keycloak master admin password: "
    )
    user_password = secret_from_env(
        "LOADTEST_USER_PASSWORD", "Password shared by generated load users: "
    )
    admin_test_password = secret_from_env(
        "LOADTEST_ADMIN_PASSWORD", "Password for the loadadmin test user: "
    )

    limits = httpx.Limits(
        max_connections=max(20, args.concurrency * 2),
        max_keepalive_connections=max(10, args.concurrency),
    )
    with httpx.Client(timeout=args.timeout, limits=limits) as client:
        token = admin_token(client, args, admin_password)
        client.headers["Authorization"] = f"Bearer {token}"
        api = f"{args.base_url}/auth/admin/realms/{args.realm}"
        ensure_client(client, api, args.client_id)
        user_role = get_role(client, api, args.role)
        admin_role = get_role(client, api, "portfolio-admin")

        admin_result = create_or_update_user(
            client,
            api,
            args.admin_test_user,
            admin_test_password,
            [user_role, admin_role],
        )
        print(f"{admin_result.action}: {admin_result.username}")
        if admin_result.error:
            print(admin_result.error, file=sys.stderr)
            return 1

        usernames = [
            f"{args.prefix}{index:04d}"
            for index in range(args.start_index, args.start_index + args.count)
        ]
        completed = 0
        lock = threading.Lock()
        results: list[Result] = []

        def task(username: str) -> Result:
            nonlocal completed
            result = create_or_update_user(
                client, api, username, user_password, [user_role]
            )
            with lock:
                completed += 1
                if completed % 50 == 0 or completed == len(usernames):
                    print(f"Progress: {completed}/{len(usernames)}")
            return result

        with concurrent.futures.ThreadPoolExecutor(
            max_workers=args.concurrency
        ) as executor:
            for offset in range(0, len(usernames), args.batch_size):
                batch = usernames[offset : offset + args.batch_size]
                # Keycloak admin tokens are intentionally short lived. Refresh only
                # after the previous batch has finished, so no request sees a race.
                token = admin_token(client, args, admin_password)
                client.headers["Authorization"] = f"Bearer {token}"
                for result in executor.map(task, batch):
                    results.append(result)

    created = sum(result.action == "created" for result in results)
    updated = sum(result.action == "updated" for result in results)
    failed = [result for result in results if result.action == "failed"]
    print(f"Finished: created={created}, updated={updated}, failed={len(failed)}")
    for result in failed[:20]:
        print(f"FAILED {result.username}: {result.error}", file=sys.stderr)
    print(f"Load-test client: {args.client_id}")
    print(f"Generated users: {usernames[0]} .. {usernames[-1]}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

