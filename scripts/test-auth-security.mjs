import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authenticateUser, createSessionToken, registerUser, verifySessionToken } from '../src/server/session.ts';

test('Auth Security 1: Rejects duplicate email registration', () => {
  const uniqueEmail = `user_${Date.now()}@example.com`;
  const user1 = registerUser(uniqueEmail, 'strongPassword123', 'Test User');
  assert.equal(user1.email, uniqueEmail);
  assert.ok(user1.passwordHash);
  assert.ok(user1.salt);
  assert.equal(user1.freeSecondsLeft, 180, 'Standard user should get exactly 3 minutes (180s) free trial');

  // Password should NOT be stored plaintext
  assert.notEqual(user1.passwordHash, 'strongPassword123');

  // Second registration with same email should throw
  assert.throws(
    () => registerUser(uniqueEmail, 'anotherPassword', 'Another User'),
    /already exists/i
  );
});

test('Auth Security 2: Correct password logs in and wrong password fails', () => {
  const uniqueEmail = `login_test_${Date.now()}@example.com`;
  registerUser(uniqueEmail, 'correctPassword99', 'Login User');

  // Correct credentials succeed
  const loggedIn = authenticateUser(uniqueEmail, 'correctPassword99');
  assert.equal(loggedIn.email, uniqueEmail);

  // Wrong password throws
  assert.throws(
    () => authenticateUser(uniqueEmail, 'wrongPassword'),
    /incorrect password/i
  );

  // Non-existent email throws
  assert.throws(
    () => authenticateUser('nobody_xyz_nonexistent@example.com', 'somePass'),
    /no account found/i
  );
});

test('Auth Security 3: JWT session token creation and cryptographic verification', () => {
  const uniqueEmail = `jwt_${Date.now()}@example.com`;
  const user = registerUser(uniqueEmail, 'jwtPass123', 'JWT User');

  const token = createSessionToken(user);
  assert.ok(typeof token === 'string' && token.split('.').length === 3);

  // Verification succeeds with valid token
  const claims = verifySessionToken(token);
  assert.ok(claims);
  assert.equal(claims.sub, user.id);
  assert.equal(claims.email, uniqueEmail);

  // Tampered token fails verification
  const [h, p] = token.split('.');
  const forgedToken = `${h}.${p}.tampered_signature_12345`;
  assert.equal(verifySessionToken(forgedToken), null);
});
