export function $(id){ return document.getElementById(id); }

export function apiBase(){
  // On utilise l’origin courant (car servi par Nest)
  return window.location.origin.replace(/\/$/, "");
}

export function getToken(){
  return localStorage.getItem("token") || localStorage.getItem("access_token") || "";
}

export function requireToken(){
  const t = getToken();
  if(!t){
    // ✅ nouveau chemin centralisé
    window.location.href = "/html/auth/login.html";
    return "";
  }
  return t;
}

export async function api(path, method="GET", body=null){
  const t = requireToken();
  const headers = {};
  if (t) headers["Authorization"] = "Bearer " + t;
  if (body !== null) headers["Content-Type"] = "application/json";

  const res = await fetch(apiBase() + path, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : null
  });

  const txt = await res.text();
  let data;
  try{ data = JSON.parse(txt); } catch { data = txt; }

  return { ok: res.ok, status: res.status, data };
}

export function qs(name){
  return new URLSearchParams(window.location.search).get(name) || "";
}

export function setQs(name, val){
  const u = new URL(window.location.href);
  u.searchParams.set(name, val);
  window.history.replaceState({}, "", u.toString());
}

export function normCode(code){
  return String(code||"").trim().toUpperCase();
}

export function fmtCardFilename(card){
  // backend => { rank: "A"|"10"|..., suit:"S"|"H"|"D"|"C" }
  return `${card.rank}${card.suit}`;
}

export function cardImgSrc(card){
  return `../assets/img/${fmtCardFilename(card)}.svg`;
}

export function backImgSrc(){
  return `../assets/img/back.svg`;
}
