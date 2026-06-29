import { login, forgotPassword, resetPassword } from "./core/auth.js";
import { State } from "./core/state.js";

const $ = (id) => document.getElementById(id);

if (State.token) location.href = "/public/html/dashboard.html";

function setStatus(msg) {
  $("status").textContent = msg || "";
}

function setForgotStatus(msg) {
  $("forgotStatus").textContent = msg || "";
}

function showForgot() {
  $("forgotOverlay").classList.remove("hidden");
  $("forgotOverlay").setAttribute("aria-hidden", "false");

  $("forgotStep1").classList.remove("hidden");
  $("forgotStep2").classList.add("hidden");

  $("forgotEmail").value = "";
  $("forgotCode").value = "";
  $("forgotNewPass").value = "";
  setForgotStatus("");

  setTimeout(() => $("forgotEmail").focus(), 0);
}

function hideForgot() {
  $("forgotOverlay").classList.add("hidden");
  $("forgotOverlay").setAttribute("aria-hidden", "true");
}

function setLoading(isLoading) {
  $("loginBtn").disabled = isLoading;
  $("username").disabled = isLoading;
  $("password").disabled = isLoading;

  $("forgotSendBtn").disabled = isLoading;
  $("forgotResendBtn").disabled = isLoading;
  $("forgotResetBtn").disabled = isLoading;
  $("forgotEmail").disabled = isLoading;
  $("forgotCode").disabled = isLoading;
  $("forgotNewPass").disabled = isLoading;
}

// Login submit
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");

  const username = ($("username").value || "").trim();
  const password = $("password").value || "";

  if (!username) return setStatus("Username manquant.");
  if (!password) return setStatus("Mot de passe manquant.");

  try {
    setLoading(true);
    await login(username, password);
    location.href = "/public/html/dashboard.html";
  } catch (err) {
    setStatus(String(err?.message || err));
  } finally {
    setLoading(false);
  }
});

// Forgot link
$("forgotLink").addEventListener("click", (e) => {
  e.preventDefault();
  showForgot();
});

// Step 1: send code
$("forgotSendBtn").addEventListener("click", async () => {
  setForgotStatus("");

  const email = ($("forgotEmail").value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    setForgotStatus("Email invalide.");
    return;
  }

  try {
    setLoading(true);
    await forgotPassword(email);

    // go step 2
    $("forgotStep1").classList.add("hidden");
    $("forgotStep2").classList.remove("hidden");
    setForgotStatus("Code envoyé ✅ (vérifie ta boîte ou MailHog).");
    setTimeout(() => $("forgotCode").focus(), 0);
  } catch (e) {
    setForgotStatus(String(e?.message || e));
  } finally {
    setLoading(false);
  }
});

// Resend code (step 2)
$("forgotResendBtn").addEventListener("click", async () => {
  setForgotStatus("");

  const email = ($("forgotEmail").value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    setForgotStatus("Email invalide.");
    return;
  }

  try {
    setLoading(true);
    await forgotPassword(email);
    setForgotStatus("Code renvoyé ✅ (vérifie ta boîte ou MailHog).");
  } catch (e) {
    setForgotStatus(String(e?.message || e));
  } finally {
    setLoading(false);
  }
});

// Step 2: reset password
$("forgotResetBtn").addEventListener("click", async () => {
  setForgotStatus("");

  const email = ($("forgotEmail").value || "").trim().toLowerCase();
  const code = ($("forgotCode").value || "").trim();
  const newPassword = $("forgotNewPass").value || "";

  if (!email || !email.includes("@")) return setForgotStatus("Email invalide.");
  if (!code || code.length < 4) return setForgotStatus("Code invalide.");
  if (!newPassword || newPassword.length < 6) return setForgotStatus("Mot de passe trop court (min 6).");

  try {
    setLoading(true);
    await resetPassword(email, code, newPassword);

    setForgotStatus("Mot de passe réinitialisé ✅ Tu peux te connecter.");
    // on laisse ouvert 1s puis ferme
    setTimeout(() => {
      hideForgot();
    }, 900);
  } catch (e) {
    setForgotStatus(String(e?.message || e));
  } finally {
    setLoading(false);
  }
});
