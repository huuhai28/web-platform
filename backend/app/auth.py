from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from .config import settings
from .schemas import AuthenticatedUser


bearer = HTTPBearer(auto_error=False)
jwks_client = PyJWKClient(settings.keycloak_jwks_url, cache_keys=True)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> AuthenticatedUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login required")

    try:
        signing_key = jwks_client.get_signing_key_from_jwt(credentials.credentials)
        payload = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.keycloak_issuer,
            options={"verify_aud": False},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
        ) from exc

    roles = payload.get("realm_access", {}).get("roles", [])
    return AuthenticatedUser(
        subject=payload["sub"],
        username=payload.get("preferred_username", "unknown"),
        email=payload.get("email"),
        roles=roles,
    )


def require_admin(user: Annotated[AuthenticatedUser, Depends(get_current_user)]) -> AuthenticatedUser:
    if "portfolio-admin" not in user.roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return user

