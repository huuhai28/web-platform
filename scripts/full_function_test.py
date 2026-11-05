#!/usr/bin/env python3
"""End-to-end API checks for Personal Web Platform."""

from __future__ import annotations

import argparse
import getpass
import os
import sys
import time
import uuid
from dataclasses import dataclass
from typing import Callable

import httpx


@dataclass
class Check:
    name: str
    passed: bool
    detail: str


def secret_from_env(name: str, prompt: str) -> str:
    value = os.getenv(name)
    if value:
        return value
    if sys.stdin.isatty():
        return getpass.getpass(prompt)
    raise SystemExit(f"Missing environment variable: {name}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Test all Personal Web API functions.")
    parser.add_argument("--base-url", default="http://localhost:3000")
    parser.add_argument("--realm", default="personal-web")
    parser.add_argument("--client-id", default="load-test-client")
    parser.add_argument("--user", default="loaduser0001")
    parser.add_argument("--admin-user", default="loadadmin")
    parser.add_argument("--timeout", type=float, default=15.0)
    return parser.parse_args()


def token(
    client: httpx.Client,
    base_url: str,
    realm: str,
    client_id: str,
    username: str,
    password: str,
) -> str:
    response = client.post(
        f"{base_url}/auth/realms/{realm}/protocol/openid-connect/token",
        data={
            "grant_type": "password",
            "client_id": client_id,
            "username": username,
            "password": password,
        },
    )
    response.raise_for_status()
    return response.json()["access_token"]


def main() -> int:
    args = parse_args()
    base_url = args.base_url.rstrip("/")
    user_password = secret_from_env(
        "LOADTEST_USER_PASSWORD", f"Password for {args.user}: "
    )
    admin_password = secret_from_env(
        "LOADTEST_ADMIN_PASSWORD", f"Password for {args.admin_user}: "
    )
    checks: list[Check] = []

    def run(name: str, operation: Callable[[], str]) -> None:
        started = time.perf_counter()
        try:
            detail = operation()
            elapsed = (time.perf_counter() - started) * 1000
            checks.append(Check(name, True, f"{detail}; {elapsed:.0f} ms"))
        except Exception as exc:
            checks.append(Check(name, False, str(exc)))

    with httpx.Client(timeout=args.timeout, follow_redirects=False) as client:
        run(
            "Frontend HTML",
            lambda: _expect(client.get(f"{base_url}/"), 200, "text/html"),
        )
        run(
            "Keycloak discovery",
            lambda: _discovery(client, base_url, args.realm),
        )
        run(
            "Backend health",
            lambda: _expect_json(client.get(f"{base_url}/api/health"), 200, "status"),
        )
        run(
            "Profile",
            lambda: _expect_json(client.get(f"{base_url}/api/profile"), 200, "name"),
        )
        run(
            "Projects",
            lambda: _expect_list(client.get(f"{base_url}/api/projects"), 200),
        )
        run(
            "Invalid contact rejected",
            lambda: _expect(client.post(f"{base_url}/api/contact", json={}), 422),
        )
        run(
            "Protected API requires login",
            lambda: _expect(client.get(f"{base_url}/api/me"), 401),
        )
        run(
            "Fake token rejected",
            lambda: _expect(
                client.get(
                    f"{base_url}/api/me",
                    headers={"Authorization": "Bearer invalid-token"},
                ),
                401,
            ),
        )

        user_token = ""
        admin_token = ""

        def login_user() -> str:
            nonlocal user_token
            user_token = token(
                client,
                base_url,
                args.realm,
                args.client_id,
                args.user,
                user_password,
            )
            return "access token received"

        def login_admin() -> str:
            nonlocal admin_token
            admin_token = token(
                client,
                base_url,
                args.realm,
                args.client_id,
                args.admin_user,
                admin_password,
            )
            return "admin access token received"

        run("User login", login_user)
        if user_token:
            user_headers = {"Authorization": f"Bearer {user_token}"}
            run(
                "User identity",
                lambda: _expect_json(
                    client.get(f"{base_url}/api/me", headers=user_headers),
                    200,
                    "username",
                ),
            )
            run(
                "User forbidden from admin API",
                lambda: _expect(
                    client.get(
                        f"{base_url}/api/admin/messages", headers=user_headers
                    ),
                    403,
                ),
            )

        subject = f"functional-test-{uuid.uuid4().hex[:10]}"
        contact_id: int | None = None

        def create_contact() -> str:
            nonlocal contact_id
            response = client.post(
                f"{base_url}/api/contact",
                json={
                    "name": "Functional Test",
                    "email": "functional@example.com",
                    "subject": subject,
                    "message": "This message verifies PostgreSQL, Redis and the worker path.",
                },
            )
            response.raise_for_status()
            if response.status_code != 201:
                raise AssertionError(f"expected 201, got {response.status_code}")
            contact_id = response.json().get("id")
            return f"contact id={contact_id}"

        run("Create contact", create_contact)
        run("Admin login", login_admin)
        if admin_token:
            admin_headers = {"Authorization": f"Bearer {admin_token}"}

            def verify_contact() -> str:
                response = client.get(
                    f"{base_url}/api/admin/messages", headers=admin_headers
                )
                response.raise_for_status()
                messages = response.json()
                if not any(message.get("subject") == subject for message in messages):
                    raise AssertionError("created contact is missing from admin messages")
                return f"found {subject} in {len(messages)} messages"

            run("Admin reads stored contact", verify_contact)

    print("\nPersonal Web full functional test")
    print("=" * 72)
    for check in checks:
        mark = "PASS" if check.passed else "FAIL"
        print(f"[{mark}] {check.name}: {check.detail}")
    passed = sum(check.passed for check in checks)
    print("=" * 72)
    print(f"Result: {passed}/{len(checks)} checks passed")
    return 0 if passed == len(checks) else 1


def _expect(response: httpx.Response, status: int, content_type: str | None = None) -> str:
    if response.status_code != status:
        raise AssertionError(
            f"expected HTTP {status}, got {response.status_code}: {response.text[:300]}"
        )
    if content_type and content_type not in response.headers.get("content-type", ""):
        raise AssertionError(
            f"expected content-type {content_type}, got {response.headers.get('content-type')}"
        )
    return f"HTTP {response.status_code}"


def _expect_json(response: httpx.Response, status: int, key: str) -> str:
    _expect(response, status)
    payload = response.json()
    if key not in payload:
        raise AssertionError(f"missing JSON key: {key}")
    return f"HTTP {response.status_code}; {key}={payload[key]}"


def _expect_list(response: httpx.Response, status: int) -> str:
    _expect(response, status)
    payload = response.json()
    if not isinstance(payload, list):
        raise AssertionError("expected a JSON list")
    return f"HTTP {response.status_code}; items={len(payload)}"


def _discovery(client: httpx.Client, base_url: str, realm: str) -> str:
    response = client.get(
        f"{base_url}/auth/realms/{realm}/.well-known/openid-configuration"
    )
    response.raise_for_status()
    payload = response.json()
    expected = f"{base_url}/auth/realms/{realm}"
    if payload.get("issuer") != expected:
        raise AssertionError(f"issuer mismatch: {payload.get('issuer')} != {expected}")
    return f"issuer={payload['issuer']}"


if __name__ == "__main__":
    raise SystemExit(main())

