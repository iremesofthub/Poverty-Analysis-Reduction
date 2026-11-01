"""JWT authentication and authorization for the governed API.

Issuer, audience and JWKS URL are deployment configuration, never request fields.
Only server-managed app_metadata grants roles/scopes. Hosted identity-provider
configuration, revocation infrastructure and penetration tests remain required.

Supports two profiles: HACKATHON_DEMO (test identities allowed) and GOVERNED_PRODUCTION.
Includes Admin MFA Toggle for HACKATHON_DEMO: MFA disabled by default for quick testing,
admin can toggle ON via admin panel for strict MFA enforcement testing.
"""
from dataclasses import dataclass
import json
import os
import re
import threading
import time
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

import jwt

from .profiles import get_config, is_test_identity, ProfileConfig, get_admin_mfa_toggle_allowed, is_mfa_enabled


class AuthenticationError(PermissionError):
    pass


class IdentityProviderUnavailable(RuntimeError):
    pass


class AuthorizationError(PermissionError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def fetch_jwks(url):
    try:
        with build_opener(NoRedirect()).open(Request(url, headers={'Accept': 'application/json'}), timeout=10) as response:
            body = response.read(256001)
            if len(body) > 256000:
                raise ValueError('JWKS too large')
            return json.loads(body)
    except Exception:
        raise IdentityProviderUnavailable('Identity-provider keys unavailable') from None


@dataclass(frozen=True)
class Principal:
    subject: str
    tenant: str
    roles: frozenset
    districts: frozenset
    national_scope: bool
    assurance: str
    expires_at: int


class TokenVerifier:
    def __init__(self, issuer, audience, jwks_url, fetch=fetch_jwks, cache_seconds=60, clock=time.monotonic):
        issuer_url, key_url = urlsplit(issuer), urlsplit(jwks_url)
        if issuer_url.scheme != 'https' or key_url.scheme != 'https' or not issuer_url.hostname:
            raise ValueError('Configured identity endpoints must use HTTPS')
        if issuer_url.netloc != key_url.netloc or any(p.username is not None or p.password is not None
                or p.fragment or p.query for p in (issuer_url, key_url)):
            raise ValueError('JWKS must belong to the configured identity authority')
        if not audience or not 0 < cache_seconds <= 300:
            raise ValueError('Audience and bounded key-cache lifetime required')
        self.issuer, self.audience, self.url = issuer, audience, jwks_url
        self.fetch, self.ttl, self.clock = fetch, cache_seconds, clock
        self.keys, self.loaded, self.last_refresh = {}, -float('inf'), -float('inf')
        self.lock = threading.Lock()

    def _key(self, kid, algorithm):
        with self.lock:
            now = self.clock()
            stale = now - self.loaded >= self.ttl
            unknown = (kid, algorithm) not in self.keys
            if stale and now - self.last_refresh < 5:
                raise IdentityProviderUnavailable('Identity-provider key refresh temporarily unavailable')
            if stale or (unknown and now - self.last_refresh >= 5):
                self.last_refresh = now
                document = self.fetch(self.url)
                entries = document.get('keys', [])
                if not entries or len(entries) > 32:
                    raise IdentityProviderUnavailable('Invalid identity-provider key set')
                keys, seen = {}, set()
                try:
                    for value in entries:
                        key_id = value['kid']
                        if key_id in seen:
                            raise ValueError('duplicate key identifier')
                        seen.add(key_id)
                        alg = value.get('alg') or {'RSA': 'RS256', 'EC': 'ES256'}.get(value.get('kty'))
                        if alg not in ('RS256', 'ES256') or value.get('use', 'sig') != 'sig':
                            continue
                        if 'key_ops' in value and 'verify' not in value['key_ops']:
                            continue
                        key = jwt.PyJWK.from_dict(value, algorithm=alg).key
                        if alg == 'RS256' and key.key_size < 2048:
                            raise ValueError('RSA key too small')
                        if alg == 'ES256' and key.curve.name != 'secp256r1':
                            raise ValueError('ES256 requires P-256')
                        keys[(key_id, alg)] = key
                except Exception:
                    raise IdentityProviderUnavailable('Invalid identity-provider key set') from None
                self.keys, self.loaded = keys, now
            if (kid, algorithm) not in self.keys:
                raise AuthenticationError('Unrecognized signing key')
            return self.keys[(kid, algorithm)]

    def verify(self, authorization):
        if not isinstance(authorization, str) or not authorization.startswith('Bearer ') or len(authorization) > 16384:
            raise AuthenticationError('Bearer authentication required')
        token = authorization[7:]
        try:
            header = jwt.get_unverified_header(token)
            if header.get('crit') or header.get('jku') or header.get('x5u'):
                raise AuthenticationError('Unsupported token header extension')
            kid, algorithm = header.get('kid'), header.get('alg')
            if algorithm not in ('RS256', 'ES256') or not isinstance(kid, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', kid):
                raise AuthenticationError('Invalid token header')
            key = self._key(kid, algorithm)
            payload = jwt.decode(token, key, algorithms=[algorithm], issuer=self.issuer, audience=self.audience,
                options={'require': ['exp', 'iat', 'sub', 'iss', 'aud'], 'strict_aud': True}, leeway=0)
            if not isinstance(payload['sub'], str) or not payload['sub']:
                raise ValueError('Missing subject')
            if type(payload['exp']) is not int or type(payload['iat']) is not int or payload['exp'] <= payload['iat']:
                raise ValueError('Invalid token lifetime')
            metadata = payload.get('app_metadata', {})
            tenant = metadata.get('tenant_id')
            if not isinstance(tenant, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', tenant):
                raise ValueError('Tenant assignment required')
            roles = metadata.get('roles', [metadata['role']] if 'role' in metadata else [])
            districts = metadata.get('districts', [])
            if not isinstance(roles, list) or not isinstance(districts, list) or not all(isinstance(x, str) and x for x in roles + districts):
                raise ValueError('Invalid permission scopes')
            return Principal(payload['sub'], tenant, frozenset(roles), frozenset(districts),
                             metadata.get('national_scope') is True, payload.get('aal', 'aal1'), payload['exp'])
        except (AuthenticationError, IdentityProviderUnavailable):
            raise
        except Exception:
            raise AuthenticationError('Invalid or expired bearer token') from None


# Base permissions (production)
PERMISSIONS = {
    'investigation:create': {'nisr_analyst', 'platform_admin'},
    'investigation:read': {'nisr_analyst', 'platform_admin', 'gov_district', 'statistical_reviewer', 'privacy_reviewer', 'release_reviewer'},
    'report:review': {'statistical_reviewer', 'privacy_reviewer', 'release_reviewer'},
    'report:publish': {'publication_authority'},
    'provider:health': {'platform_admin'},
}

# Hackathon demo adds test roles
DEMO_PERMISSIONS = {
    **PERMISSIONS,
    'investigation:create': {'nisr_analyst', 'platform_admin', 'test-statistician', 'test-privacy-officer', 'test-release-authority'},
    'investigation:read': {'nisr_analyst', 'platform_admin', 'gov_district', 'statistical_reviewer', 'privacy_reviewer', 'release_reviewer', 'test-statistician', 'test-privacy-officer', 'test-release-authority', 'hackathon-viewer'},
    # Demo lets the analyst drive the whole lifecycle alone when human approvals are bypassed.
    'report:review': {'statistical_reviewer', 'privacy_reviewer', 'release_reviewer', 'test-statistician', 'test-privacy-officer', 'test-release-authority', 'nisr_analyst', 'platform_admin'},
    'report:publish': {'publication_authority', 'test-release-authority', 'nisr_analyst', 'platform_admin'},
}


def _get_permissions(profile: ProfileConfig) -> dict:
    """Get permissions for the active profile."""
    if profile.name.value == "HACKATHON_DEMO":
        return DEMO_PERMISSIONS
    return PERMISSIONS


# MFA state management for Admin MFA Toggle
_mfa_state_lock = threading.Lock()
_mfa_enabled_override: bool | None = None  # None = use profile default, True/False = override


def _get_mfa_state(profile: ProfileConfig) -> bool:
    """Get current MFA enabled state, considering override.

    The override only exists where the admin toggle exists (the demo profile), so a
    demo toggle can never weaken or strengthen GOVERNED_PRODUCTION.
    """
    global _mfa_enabled_override
    with _mfa_state_lock:
        if _mfa_enabled_override is not None and profile.admin_mfa_toggle:
            return _mfa_enabled_override
        return profile.mfa_enabled


def _set_mfa_state(enabled: bool) -> bool:
    """Set MFA enabled override state (for admin toggle)."""
    global _mfa_enabled_override
    with _mfa_state_lock:
        _mfa_enabled_override = enabled
    return True


def get_mfa_status(profile: ProfileConfig = None) -> dict:
    """Get current MFA status for admin panel."""
    if profile is None:
        profile = get_config()
    from .profiles import get_admin_mfa_toggle_allowed, is_mfa_enabled
    current_enabled = _get_mfa_state(profile)
    return {
        "mfa_enabled": current_enabled,
        "profile_default": profile.mfa_enabled,
        "admin_toggle_allowed": profile.admin_mfa_toggle,
        "profile": profile.name.value
    }


def set_mfa_enabled(enabled: bool, profile: ProfileConfig = None) -> dict:
    """Admin toggle to enable/disable MFA (only works if admin_mfa_toggle is allowed)."""
    if profile is None:
        profile = get_config()
    
    if not profile.admin_mfa_toggle:
        return {
            "success": False,
            "error": "Admin MFA toggle not allowed for this profile",
            "mfa_enabled": _get_mfa_state(profile)
        }
    
    _set_mfa_state(enabled)
    return {
        "success": True,
        "mfa_enabled": enabled,
        "message": f"MFA {'enabled' if enabled else 'disabled'} via admin toggle"
    }


def authorize(principal, action, tenant, district=None, author=None, profile: ProfileConfig = None):
    """Authorize a principal for an action under the given profile."""
    if profile is None:
        profile = get_config()
    
    if principal.expires_at <= time.time():
        raise AuthorizationError('Session expired')
    if principal.tenant != tenant:
        raise AuthorizationError('Resource unavailable')
    
    permissions = _get_permissions(profile)
    if action not in permissions or not principal.roles.intersection(permissions[action]):
        raise AuthorizationError('Permission denied')
    
    if district is not None and not principal.national_scope and district not in principal.districts:
        raise AuthorizationError('District scope denied')
    
    # AAL2 requirement - controlled by MFA toggle state
    if action in ('report:review', 'report:publish'):
        # Demo freedom: with human approvals bypassed the analyst may review and publish
        # alone, without MFA or a second identity.
        if profile.bypass_human_approvals:
            return principal
        is_test = is_test_identity(principal, profile)
        mfa_enabled = _get_mfa_state(profile)
        
        # If MFA is enabled (either by profile default or admin toggle), enforce AAL2
        if mfa_enabled and not is_test and principal.assurance != 'aal2':
            raise AuthorizationError('Elevated authentication required (AAL2)')
        
        # In demo mode, test identities can review with aal1 when MFA is disabled
        if is_test and profile.allow_test_identities and not mfa_enabled:
            pass  # Allow test identities to bypass AAL2 when MFA is off
        elif author is None or principal.subject == author:
            raise AuthorizationError('Independent reviewer required')
    
    return principal


def create_test_identities() -> list[dict]:
    """Create test identities for hackathon demo testing.
    
    Returns a list of test identity configurations that can be used to
    create JWT tokens for testing the review workflow.
    """
    return [
        {
            "subject": "test-statistician",
            "tenant": "nisr-hackathon",
            "roles": ["test-statistician"],
            "districts": ["Rwanda", "Gasabo", "Kicukiro", "Nyarugenge"],
            "national_scope": True,
            "assurance": "aal1",
            "expires_at": int(time.time()) + 3600,
        },
        {
            "subject": "test-privacy-officer",
            "tenant": "nisr-hackathon",
            "roles": ["test-privacy-officer"],
            "districts": ["Rwanda"],
            "national_scope": True,
            "assurance": "aal1",
            "expires_at": int(time.time()) + 3600,
        },
        {
            "subject": "test-release-authority",
            "tenant": "nisr-hackathon",
            "roles": ["test-release-authority"],
            "districts": ["Rwanda"],
            "national_scope": True,
            "assurance": "aal1",
            "expires_at": int(time.time()) + 3600,
        },
        {
            "subject": "hackathon-viewer",
            "tenant": "nisr-hackathon",
            "roles": ["hackathon-viewer"],
            "districts": ["Rwanda"],
            "national_scope": True,
            "assurance": "aal1",
            "expires_at": int(time.time()) + 3600,
        },
    ]


def create_test_jwt(identity: dict, issuer: str, audience: str, private_key_pem: str) -> str:
    """Create a JWT for a test identity (for hackathon demo only)."""
    import jwt
    payload = {
        "sub": identity["subject"],
        "tenant_id": identity["tenant"],
        "roles": identity["roles"],
        "districts": identity["districts"],
        "national_scope": identity["national_scope"],
        "aal": identity["assurance"],
        "exp": identity["expires_at"],
        "iat": int(time.time()),
        "iss": issuer,
        "aud": audience,
    }
    return jwt.encode(payload, private_key_pem, algorithm="RS256")