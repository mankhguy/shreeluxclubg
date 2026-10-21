const test = require("node:test");
const assert = require("node:assert/strict");
const { getBearerToken, readJsonBody } = require("../api/_lib/http");

test("reads an object body and parses a JSON string body", () => {
  assert.deepEqual(readJsonBody({ body: { email: "user@example.com" } }), {
    email: "user@example.com"
  });
  assert.deepEqual(readJsonBody({ body: '{"display_name":"Player"}' }), {
    display_name: "Player"
  });
});

test("rejects malformed, array, and missing JSON bodies", () => {
  assert.equal(readJsonBody({ body: "{" }), null);
  assert.equal(readJsonBody({ body: "[]" }), null);
  assert.equal(readJsonBody({}), null);
});

test("extracts only a well-formed bearer token", () => {
  assert.equal(getBearerToken({ headers: { authorization: "Bearer abc.def" } }), "abc.def");
  assert.equal(getBearerToken({ headers: { authorization: "Basic abc" } }), null);
  assert.equal(getBearerToken({ headers: {} }), null);
});
