const test = require("node:test");
const assert = require("node:assert/strict");

function jwt(claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(claims)}.`;
}

global.window = {
  SPENDOPS_CONFIG: {
    apiBaseUrl: "https://api.example.com",
    awsRegion: "ap-northeast-1",
    cognitoClientId: "public-client-id",
  },
};

const auth = require("../auth.js");

test("authentication requires public Cognito and API configuration", () => {
  assert.equal(auth.authIsConfigured(), true);
});

test("JWT decoder reads UTF-8 claims without exposing a password", () => {
  const claims = auth.decodeJwt(jwt({ sub: "user-1", email: "test@example.invalid", exp: 9999999999 }));
  assert.equal(claims.sub, "user-1");
  assert.equal(claims.email, "test@example.invalid");
  assert.equal(auth.decodeJwt("invalid"), null);
  assert.equal(JSON.stringify(global.window).includes("password"), false);
});

test("authenticated user email is masked for the header", () => {
  assert.equal(auth.maskEmailAddress("test@example.invalid"), "te****@example.invalid");
  assert.equal(auth.maskEmailAddress("a@example.invalid"), "a****@example.invalid");
  assert.equal(auth.authenticatedUserLabel({ email: "test@example.invalid" }), "te****@example.invalid でログイン中");
  assert.equal(auth.authenticatedUserLabel({ email: "" }), "ログイン中");
});

test("authentication errors use safe Japanese messages", () => {
  assert.equal(
    auth.friendlyAuthError({ __type: "NotAuthorizedException" }),
    "メールアドレスまたはパスワードを確認してください。",
  );
  assert.equal(auth.friendlyAuthError({ __type: "UnknownException" }).includes("UnknownException"), false);
});
