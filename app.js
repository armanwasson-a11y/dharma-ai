const messages = document.querySelector("#messages");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#question");
const send = document.querySelector("#send");
const language = document.querySelector("#language");
const modeLabel = document.querySelector("#mode-label");

function addMessage(role, text, sources = []) {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "assistant" ? "ॐ" : "Du";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const heading = document.createElement("strong");
  heading.textContent = role === "assistant" ? "Dharma AI" : "Du";
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  bubble.append(heading, paragraph);
  if (sources.length) {
    const list = document.createElement("div");
    list.className = "source-list";
    const label = document.createElement("strong");
    label.textContent = language.value === "en" ? "Library references" : "Quellen aus der Startbibliothek";
    list.append(label);
    sources.forEach(source => {
      const item = document.createElement("div");
      item.className = "source-item";
      item.textContent = `${source.title} — ${source.reference}`;
      list.append(item);
    });
    bubble.append(list);
  }
  article.append(avatar, bubble);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
}

async function ask(question) {
  addMessage("user", question);
  send.disabled = true;
  input.disabled = true;
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, language: language.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unbekannter Fehler");
    modeLabel.textContent = data.mode === "ai-plus-library" ? "KI + Quellenbibliothek" : "Lokale Demo-Wissensbibliothek";
    addMessage("assistant", data.answer, data.sources || []);
  } catch (error) {
    addMessage("assistant", `Entschuldigung, das hat nicht geklappt: ${error.message}`);
  } finally {
    send.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question) return;
  input.value = "";
  ask(question);
});
document.querySelectorAll(".suggestion").forEach(button => {
  button.addEventListener("click", () => ask(button.dataset.q));
});
document.querySelector("#clear").addEventListener("click", () => {
  messages.replaceChildren();
  addMessage("assistant", language.value === "en"
    ? "Hello! Ask me a question about Hinduism. My current library is a small starter collection."
    : "Namaste! Stelle mir eine Frage zum Hinduismus. Meine aktuelle Bibliothek ist eine kleine Startsammlung.");
});
fetch("/api/health").then(r => r.json()).then(data => {
  modeLabel.textContent = data.mode === "ai-plus-library" ? "KI + Quellenbibliothek" : `Lokale Demo-Wissensbibliothek · ${data.entries} Einträge`;
}).catch(() => { modeLabel.textContent = "Server nicht verbunden"; });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
