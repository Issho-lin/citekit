from __future__ import annotations

import base64

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_private = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def public_pem() -> str:
    return _private.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()


def decrypt_envelope(wrapped_key: str, iv: str, ciphertext: str) -> str:
    aes_key = _private.decrypt(
        base64.b64decode(wrapped_key),
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    plain = AESGCM(aes_key).decrypt(base64.b64decode(iv), base64.b64decode(ciphertext), None)
    return plain.decode()


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:3]}****{value[-4:]}"
