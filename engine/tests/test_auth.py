"""Real signature verification with ephemeral test authorities; no hosted IdP claim."""
import copy
from dataclasses import replace
import json
import sys
import time
import unittest
from pathlib import Path

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ireme import auth
from ireme.profiles import GOVERNED_PRODUCTION_CONFIG
from acceptance import acceptance


def _reset_mfa_override():
    """Reset MFA override state to ensure test isolation."""
    import ireme.auth as auth_module
    with auth_module._mfa_state_lock:
        auth_module._mfa_enabled_override = None


class JwtAuthorization(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(cls.key.public_key()))
        cls.public.update(kid='test-key', alg='RS256', use='sig')

    def setUp(self):
        now = int(time.time())
        self.payload = {'sub': 'analyst', 'iss': 'https://id.example/auth/v1', 'aud': 'authenticated',
                        'iat': now, 'exp': now+300, 'aal': 'aal1',
                        'app_metadata': {'tenant_id': 'tenant-a', 'roles': ['nisr_analyst'], 'districts': ['Kamonyi']}}
        self.fetches = []
        def fetch(url):
            self.fetches.append(url)
            return {'keys': [self.public]}
        self.verifier = auth.TokenVerifier(self.payload['iss'], 'authenticated',
            'https://id.example/auth/v1/.well-known/jwks.json', fetch=fetch)

    def token(self, payload=None, key=None, algorithm='RS256', **headers):
        return 'Bearer ' + jwt.encode(payload or self.payload, key or self.key, algorithm=algorithm,
                                      headers={'kid': 'test-key', **headers})

    def tearDown(self):
        _reset_mfa_override()

    def test_signed_scopes_are_verified_and_cached(self):
        principal = self.verifier.verify(self.token())
        self.verifier.verify(self.token())
        self.assertEqual(len(self.fetches), 1)
        self.assertEqual(principal.districts, frozenset({'Kamonyi'}))
        auth.authorize(principal, 'investigation:create', 'tenant-a', 'Kamonyi')
        for tenant, district in [('tenant-b', 'Kamonyi'), ('tenant-a', 'Muhanga')]:
            with self.assertRaises(auth.AuthorizationError):
                auth.authorize(principal, 'investigation:read', tenant, district)

    def test_signature_audience_issuer_expiry_and_headers_fail_closed(self):
        invalid = [self.token(key=self.other), self.token(algorithm='HS256', key='test-only-symmetric-key-long-enough'),
                   self.token(jku='https://attacker.invalid/keys')]
        for field, value in [('iss', 'https://other.example'), ('aud', 'other-service'),
                             ('exp', int(time.time())-1), ('iat', int(time.time())+1000)]:
            payload = {**self.payload, field: value}
            invalid.append(self.token(payload))
        for token in invalid:
            with self.subTest(token_prefix=token[:10]), self.assertRaises(auth.AuthenticationError):
                self.verifier.verify(token)

    def test_user_editable_metadata_cannot_elevate_authority(self):
        payload = copy.deepcopy(self.payload)
        payload['app_metadata'] = {'tenant_id': 'tenant-a'}
        payload['user_metadata'] = {'roles': ['platform_admin'], 'tenant_id': 'tenant-b', 'national_scope': True}
        principal = self.verifier.verify(self.token(payload))
        self.assertEqual(principal.roles, frozenset())
        self.assertFalse(principal.national_scope)
        with self.assertRaises(auth.AuthorizationError):
            auth.authorize(principal, 'provider:health', 'tenant-a')

    def test_empty_scope_is_not_implicit_national_access(self):
        payload = copy.deepcopy(self.payload)
        payload['app_metadata'].update(roles=['platform_admin'], districts=[])
        principal = self.verifier.verify(self.token(payload))
        with self.assertRaises(auth.AuthorizationError):
            auth.authorize(principal, 'investigation:read', 'tenant-a', 'Rwanda')

    @acceptance('PRIV-13')
    def test_elevated_review_requires_mfa_and_independent_subject(self):
        # This asserts the production governance contract, so it pins that profile even
        # when the ambient IREME_PROFILE is HACKATHON_DEMO.
        profile = GOVERNED_PRODUCTION_CONFIG
        payload = copy.deepcopy(self.payload)
        payload['app_metadata']['roles'] = ['statistical_reviewer']
        principal = self.verifier.verify(self.token(payload))
        with self.assertRaises(auth.AuthorizationError):
            auth.authorize(principal, 'report:review', 'tenant-a', 'Kamonyi', author='other', profile=profile)
        principal = replace(principal, assurance='aal2')
        with self.assertRaises(auth.AuthorizationError):
            auth.authorize(principal, 'report:review', 'tenant-a', 'Kamonyi', author='analyst', profile=profile)
        auth.authorize(principal, 'report:review', 'tenant-a', 'Kamonyi', author='other', profile=profile)
        with self.assertRaises(auth.AuthorizationError):
            auth.authorize(replace(principal, expires_at=0), 'report:review', 'tenant-a', author='other', profile=profile)

    def test_expired_key_cache_never_uses_stale_keys_during_outage(self):
        clock = [0.0]
        def fetch(url):
            if clock[0] > 0:
                raise auth.IdentityProviderUnavailable('fixture outage')
            return {'keys': [self.public]}
        verifier = auth.TokenVerifier(self.payload['iss'], 'authenticated',
            'https://id.example/auth/v1/keys', fetch=fetch, cache_seconds=10, clock=lambda: clock[0])
        verifier.verify(self.token())
        clock[0] = 11
        with self.assertRaises(auth.IdentityProviderUnavailable):
            verifier.verify(self.token())
