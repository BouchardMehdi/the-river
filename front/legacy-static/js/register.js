import { register, login, resendVerification, verifyEmail } from "./core/auth.js";
import { State } from "./core/state.js";

const $ = (id) => document.getElementById(id);

if (State.token) location.href = "/public/html/dashboard.html";

let pending = {
  email: "",
  username: "",
  password: "",
};

function setMainError(msg) {
  const el = $("error");
  if (el) el.textContent = msg || "";
}

function setVerifyError(msg) {
  const el = $("verifyStatus");
  if (el) el.textContent = msg || "";
}

function setLoading(isLoading) {
  $("registerBtn").disabled = isLoading;
  $("verifyBtn").disabled = isLoading;
  $("resendBtn").disabled = isLoading;

  $("email").disabled = isLoading;
  $("username").disabled = isLoading;
  $("password").disabled = isLoading;
  $("verifyCode").disabled = isLoading;
}

function openVerify(email) {
  $("verifyEmailLabel").textContent = email;
  $("verifyCode").value = "";
  setVerifyError("");

  $("verifyOverlay").classList.remove("hidden");
  $("verifyOverlay").setAttribute("aria-hidden", "false");

  setTimeout(() => $("verifyCode").focus(), 0);
}

function closeVerify() {
  $("verifyOverlay").classList.add("hidden");
  $("verifyOverlay").setAttribute("aria-hidden", "true");
}

async function doVerify() {
  setVerifyError("");
  const code = ($("verifyCode").value || "").trim();

  if (!code || code.length < 4) {
    setVerifyError("Entre le code reçu par email.");
    return;
  }

  try {
    setLoading(true);

    await verifyEmail(pending.email, code);

    // ✅ auto login après vérification
    await login(pending.username, pending.password);

    // ✅ popup bonus dashboard (une seule fois)
    localStorage.setItem("showWelcomeBonus", "1");

    closeVerify();
    location.href = "/public/html/dashboard.html";
  } catch (e) {
    setVerifyError(String(e?.message || e));
  } finally {
    setLoading(false);
  }
}

// Submit register
$("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  setMainError("");
  setVerifyError("");

  const email = ($("email").value || "").trim().toLowerCase();
  const username = ($("username").value || "").trim();
  const password = $("password").value || "";

  if (!email || !username || !password) {
    setMainError("Tous les champs sont obligatoires.");
    return;
  }

  if (!email.includes("@") || !email.includes(".")) {
    setMainError("Email invalide.");
    return;
  }
  if (username.length < 3) {
    setMainError("Username trop court (min 3).");
    return;
  }
  if (password.length < 6) {
    setMainError("Mot de passe trop court (min 6).");
    return;
  }

  pending = { email, username, password };

  try {
    setLoading(true);

    // ✅ register -> l’API envoie le mail de vérif
    await register(username, password, email);

    // ✅ ouvre la popup code
    openVerify(email);
  } catch (e2) {
    setMainError(String(e2?.message || e2));
  } finally {
    setLoading(false);
  }
});

// Verify button
$("verifyBtn").addEventListener("click", doVerify);

// Enter to verify
$("verifyCode").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    doVerify();
  }
});

// Resend
$("resendBtn").addEventListener("click", async () => {
  setVerifyError("");
  try {
    setLoading(true);
    await resendVerification(pending.email);
    setVerifyError("Code renvoyé ✅ (vérifie ta boîte ou MailHog).");
  } catch (e) {
    setVerifyError(String(e?.message || e));
  } finally {
    setLoading(false);
  }
});
