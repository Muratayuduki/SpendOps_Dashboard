const authWindow = typeof window === "undefined" ? {} : window;
const authConfig = authWindow.SPENDOPS_CONFIG || {};
const cognitoRegion = String(authConfig.awsRegion || "");
const cognitoClientId = String(authConfig.cognitoClientId || "");
const authApiBaseUrl = String(authConfig.apiBaseUrl || "").replace(/\/$/, "");
const tokenKeys = {
  id: "spendops.auth.idToken",
  access: "spendops.auth.accessToken",
  refresh: "spendops.auth.refreshToken",
};

const memoryValues = new Map();
let pendingSignupEmail = "";

function getSessionStore() {
  try {
    if (authWindow.sessionStorage) return authWindow.sessionStorage;
  } catch (_error) {
    // Storage can be unavailable in privacy-restricted contexts.
  }
  return {
    getItem: (key) => memoryValues.get(key) || null,
    setItem: (key, value) => memoryValues.set(key, value),
    removeItem: (key) => memoryValues.delete(key),
  };
}

function clearSession() {
  const storage = getSessionStore();
  Object.values(tokenKeys).forEach((key) => storage.removeItem(key));
}

function decodeJwt(token) {
  try {
    const encoded = String(token || "").split(".")[1];
    if (!encoded) return null;
    const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = typeof atob === "function"
      ? atob(padded)
      : Buffer.from(padded, "base64").toString("binary");
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const text = typeof TextDecoder === "function"
      ? new TextDecoder().decode(bytes)
      : Buffer.from(bytes).toString("utf8");
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function getSessionUser() {
  const idToken = getSessionStore().getItem(tokenKeys.id);
  const claims = decodeJwt(idToken);
  if (!claims?.sub) return null;
  return {
    sub: String(claims.sub),
    email: String(claims.email || ""),
    expiresAt: Number(claims.exp || 0),
  };
}

function authIsConfigured() {
  return Boolean(cognitoRegion && cognitoClientId && authApiBaseUrl);
}

function authErrorCode(error) {
  return String(error?.code || error?.__type || error?.name || "")
    .split("#")
    .at(-1);
}

function friendlyAuthError(error) {
  const messages = {
    UsernameExistsException: "このメールアドレスは登録済みです。",
    UserNotFoundException: "メールアドレスまたはパスワードを確認してください。",
    NotAuthorizedException: "メールアドレスまたはパスワードを確認してください。",
    UserNotConfirmedException: "メールに届いた確認コードを入力してください。",
    CodeMismatchException: "確認コードが正しくありません。",
    ExpiredCodeException: "確認コードの期限が切れています。再送してください。",
    InvalidPasswordException: "パスワード条件を満たしていません。",
    LimitExceededException: "試行回数が多すぎます。時間を置いて再度お試しください。",
    TooManyRequestsException: "試行回数が多すぎます。時間を置いて再度お試しください。",
    AuthRequiredError: "ログインが必要です。",
  };
  return messages[authErrorCode(error)] || "認証処理に失敗しました。時間を置いて再度お試しください。";
}

async function cognitoRequest(operation, payload) {
  if (!authIsConfigured()) throw Object.assign(new Error("Auth is not configured"), { code: "AuthConfigurationError" });
  const response = await fetch(`https://cognito-idp.${cognitoRegion}.amazonaws.com/`, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    headers: {
      "content-type": "application/x-amz-json-1.1",
      "x-amz-target": `AWSCognitoIdentityProviderService.${operation}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error("Cognito request failed"), result);
  return result;
}

async function signUp(email, password) {
  return cognitoRequest("SignUp", {
    ClientId: cognitoClientId,
    Username: String(email).trim().toLowerCase(),
    Password: String(password),
    UserAttributes: [{ Name: "email", Value: String(email).trim().toLowerCase() }],
  });
}

async function confirmSignUp(email, code) {
  return cognitoRequest("ConfirmSignUp", {
    ClientId: cognitoClientId,
    Username: String(email).trim().toLowerCase(),
    ConfirmationCode: String(code).trim(),
  });
}

async function resendConfirmationCode(email) {
  return cognitoRequest("ResendConfirmationCode", {
    ClientId: cognitoClientId,
    Username: String(email).trim().toLowerCase(),
  });
}

function storeAuthentication(authenticationResult) {
  const storage = getSessionStore();
  if (authenticationResult?.IdToken) storage.setItem(tokenKeys.id, authenticationResult.IdToken);
  if (authenticationResult?.AccessToken) storage.setItem(tokenKeys.access, authenticationResult.AccessToken);
  if (authenticationResult?.RefreshToken) storage.setItem(tokenKeys.refresh, authenticationResult.RefreshToken);
}

async function signIn(email, password) {
  const result = await cognitoRequest("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: cognitoClientId,
    AuthParameters: {
      USERNAME: String(email).trim().toLowerCase(),
      PASSWORD: String(password),
    },
  });
  if (!result.AuthenticationResult) {
    throw Object.assign(new Error("Unsupported authentication challenge"), { code: "UnsupportedChallenge" });
  }
  storeAuthentication(result.AuthenticationResult);
  return getSessionUser();
}

async function getValidIdToken(forceRefresh = false) {
  const storage = getSessionStore();
  const idToken = storage.getItem(tokenKeys.id);
  const claims = decodeJwt(idToken);
  const now = Math.floor(Date.now() / 1000);
  if (!forceRefresh && idToken && Number(claims?.exp || 0) > now + 60) return idToken;

  const refreshToken = storage.getItem(tokenKeys.refresh);
  if (!refreshToken) {
    clearSession();
    return null;
  }
  try {
    const result = await cognitoRequest("InitiateAuth", {
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: cognitoClientId,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    });
    storeAuthentication(result.AuthenticationResult || {});
    return storage.getItem(tokenKeys.id);
  } catch (error) {
    clearSession();
    throw error;
  }
}

async function signOut() {
  const storage = getSessionStore();
  const accessToken = storage.getItem(tokenKeys.access);
  if (accessToken) {
    try {
      await cognitoRequest("GlobalSignOut", { AccessToken: accessToken });
    } catch (_error) {
      // The local session must still be removed when the token is already expired.
    }
  }
  clearSession();
}

async function authenticatedFetch(path, options = {}) {
  const execute = async (forceRefresh) => {
    const idToken = await getValidIdToken(forceRefresh);
    if (!idToken) throw Object.assign(new Error("Authentication required"), { code: "AuthRequiredError" });
    const headers = new Headers(options.headers || {});
    headers.set("authorization", `Bearer ${idToken}`);
    headers.set("accept", "application/json");
    if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    return fetch(`${authApiBaseUrl}${path}`, { ...options, headers, credentials: "omit" });
  };

  let response = await execute(false);
  if (response.status === 401) response = await execute(true);
  return response;
}

function emitAuthChanged() {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent("spendops:auth-changed", { detail: { user: getSessionUser() } }));
}

function setAuthMessage(text, type = "") {
  const element = document.querySelector("#auth-message");
  element.textContent = text;
  element.className = `auth-message${type ? ` is-${type}` : ""}`;
}

function showAuthPanel(panel) {
  document.querySelectorAll("[data-auth-panel]").forEach((element) => {
    element.hidden = element.dataset.authPanel !== panel;
  });
  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    const active = button.dataset.authTab === panel;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  setAuthMessage("");
}

function updateAuthUi() {
  const user = getSessionUser();
  document.querySelector("#auth-open").hidden = Boolean(user);
  document.querySelector("#auth-logout").hidden = !user;
  document.querySelector("#load-saved").hidden = !user;
  document.querySelector("#auth-status").textContent = user ? "ログイン済み・DB保存有効" : "未ログイン・端末内のみ";
  document.querySelector("#auth-status").classList.toggle("is-authenticated", Boolean(user));
}

function openAuthDialog(panel = "login") {
  showAuthPanel(panel);
  const dialog = document.querySelector("#auth-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeAuthDialog() {
  const dialog = document.querySelector("#auth-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

async function initializeAuthUi() {
  if (!authIsConfigured()) {
    document.querySelector("#auth-status").textContent = "認証設定待ち";
    document.querySelector("#auth-open").disabled = true;
    return;
  }

  document.querySelector("#auth-open").addEventListener("click", () => openAuthDialog("login"));
  document.querySelector("#auth-close").addEventListener("click", closeAuthDialog);
  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => showAuthPanel(button.dataset.authTab));
  });
  document.querySelector("#auth-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeAuthDialog();
  });

  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    setAuthMessage("ログインしています…");
    try {
      await signIn(form.elements.email.value, form.elements.password.value);
      form.elements.password.value = "";
      updateAuthUi();
      closeAuthDialog();
      emitAuthChanged();
    } catch (error) {
      if (authErrorCode(error) === "UserNotConfirmedException") {
        pendingSignupEmail = String(form.elements.email.value).trim().toLowerCase();
        document.querySelector("#confirmation-email").textContent = pendingSignupEmail;
        showAuthPanel("confirm");
      }
      setAuthMessage(friendlyAuthError(error), "error");
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#signup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    if (form.elements.password.value !== form.elements.password_confirm.value) {
      setAuthMessage("確認用パスワードが一致しません。", "error");
      return;
    }
    if (!form.elements.data_consent.checked) {
      setAuthMessage("匿名集計への利用同意が必要です。", "error");
      return;
    }
    button.disabled = true;
    setAuthMessage("確認メールを送信しています…");
    try {
      pendingSignupEmail = String(form.elements.email.value).trim().toLowerCase();
      await signUp(pendingSignupEmail, form.elements.password.value);
      form.elements.password.value = "";
      form.elements.password_confirm.value = "";
      document.querySelector("#confirmation-email").textContent = pendingSignupEmail;
      showAuthPanel("confirm");
      setAuthMessage("メールに届いた確認コードを入力してください。", "success");
    } catch (error) {
      setAuthMessage(friendlyAuthError(error), "error");
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#confirm-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    setAuthMessage("メールアドレスを確認しています…");
    try {
      await confirmSignUp(pendingSignupEmail, form.elements.code.value);
      form.elements.code.value = "";
      showAuthPanel("login");
      document.querySelector("#login-email").value = pendingSignupEmail;
      setAuthMessage("確認が完了しました。ログインしてください。", "success");
    } catch (error) {
      setAuthMessage(friendlyAuthError(error), "error");
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#resend-confirmation").addEventListener("click", async () => {
    try {
      await resendConfirmationCode(pendingSignupEmail);
      setAuthMessage("確認コードを再送しました。", "success");
    } catch (error) {
      setAuthMessage(friendlyAuthError(error), "error");
    }
  });

  document.querySelector("#auth-logout").addEventListener("click", async () => {
    await signOut();
    updateAuthUi();
    emitAuthChanged();
  });

  try {
    await getValidIdToken();
  } catch (_error) {
    clearSession();
  }
  updateAuthUi();
  emitAuthChanged();
}

authWindow.SpendOpsAuth = {
  authIsConfigured,
  decodeJwt,
  getSessionUser,
  getValidIdToken,
  signUp,
  confirmSignUp,
  resendConfirmationCode,
  signIn,
  signOut,
  authenticatedFetch,
  friendlyAuthError,
  clearSession,
};

if (typeof document !== "undefined") initializeAuthUi();

if (typeof module !== "undefined" && module.exports) {
  module.exports = authWindow.SpendOpsAuth;
}
