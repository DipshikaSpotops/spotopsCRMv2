// src/utils/actorId.js
export function getActorId() {
  let id = localStorage.getItem("actorId");
  if (!id) {
    id = (crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
    localStorage.setItem("actorId", id);
  }
  return id;
}
