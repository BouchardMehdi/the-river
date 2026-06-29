import { apiPost } from "./api.js";
import { setAuth, clearAuth } from "./state.js";

export async function login(username, password) {
  const data = await apiPost("/auth/login", { username, password }, false);
  setAuth(data.access_token, data.user);
  return data;
}

export async function register(username, password, email) {
  const data = await apiPost("/auth/register", { username, password, email }, false);

  // Selon ton API, tu peux recevoir un token direct à la création.
  // On le stocke mais le vrai "login final" sera fait après vérif code.
  if (data?.access_token) setAuth(data.access_token, data.user);

  return data;
}

// --- Email verification ---
export async function resendVerification(email) {
  return apiPost("/auth/resend-verification", { email }, false);
}

export async function verifyEmail(email, code) {
  return apiPost("/auth/verify-email", { email, code }, false);
}

// --- Forgot password ---
export async function forgotPassword(email) {
  return apiPost("/auth/forgot-password", { email }, false);
}

export async function resetPassword(email, code, newPassword) {
  return apiPost("/auth/reset-password", { email, code, newPassword }, false);
}

export function logout() {
  clearAuth();
  location.href = "/public/html/auth/login.html";
}
