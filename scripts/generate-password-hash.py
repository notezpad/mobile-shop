#!/usr/bin/env python3
"""
Generate a PBKDF2-SHA256 hash compatible with the worker's crypto.ts.
Used to seed the super_admin password in migration 0002.

Format: pbkdf2$<iterations>$<base64-salt>$<base64-hash>
Algorithm: PBKDF2-HMAC-SHA256, 150000 iterations, 32-byte key, 16-byte salt.

Usage:
  python3 scripts/generate-password-hash.py
  python3 scripts/generate-password-hash.py --password MyPass123
  python3 scripts/generate-password-hash.py --password MyPass123 --pin 1234
"""

import argparse
import base64
import hashlib
import os
import sys


ITERATIONS = 150_000
KEY_LENGTH = 32  # bytes
SALT_LENGTH = 16  # bytes


def generate_hash(secret: str) -> str:
    salt = os.urandom(SALT_LENGTH)
    derived = hashlib.pbkdf2_hmac('sha256', secret.encode('utf-8'), salt, ITERATIONS, KEY_LENGTH)
    salt_b64 = base64.b64encode(salt).decode('ascii')
    hash_b64 = base64.b64encode(derived).decode('ascii')
    return f"pbkdf2${ITERATIONS}${salt_b64}${hash_b64}"


def verify_hash(secret: str, stored: str) -> bool:
    parts = stored.split('$')
    if len(parts) != 4 or parts[0] != 'pbkdf2':
        return False
    iterations = int(parts[1])
    salt = base64.b64decode(parts[2])
    expected = base64.b64decode(parts[3])
    actual = hashlib.pbkdf2_hmac('sha256', secret.encode('utf-8'), salt, iterations, len(expected))
    return actual == expected


def main():
    parser = argparse.ArgumentParser(description='Generate PBKDF2 password hash for seeding.')
    parser.add_argument('--password', default='Admin@123', help='Password to hash (default: Admin@123)')
    parser.add_argument('--pin', default=None, help='Optional PIN to hash')
    parser.add_argument('--verify', default=None, help='Verify a password against a stored hash')
    args = parser.parse_args()

    if args.verify:
        ok = verify_hash(args.password, args.verify)
        print(f'Verification: {"PASS" if ok else "FAIL"}')
        sys.exit(0 if ok else 1)

    password_hash = generate_hash(args.password)
    print(f'Password: {args.password}')
    print(f'Hash:     {password_hash}')

    # Self-verify
    assert verify_hash(args.password, password_hash), 'Self-verification failed!'
    print('Self-verification: PASS')

    if args.pin:
        pin_hash = generate_hash(args.pin)
        print()
        print(f'PIN:   {args.pin}')
        print(f'Hash:  {pin_hash}')
        assert verify_hash(args.pin, pin_hash), 'PIN self-verification failed!'
        print('PIN self-verification: PASS')


if __name__ == '__main__':
    main()
