// ==UserScript==
// @name Pink Moo Entry
// @author Pink, Murka
// @description Add a button to redirect to Pink's MooMoo server
// @version 1.5
// @match *://sandbox.moomoo.io/
// @match *://sandbox.moomoo.io/?*
// @grant none
// @run-at document-body
// @icon https://www.google.com/s2/favicons?sz=64&domain=moomoo.io
// @downloadURL https://huey.ckefgisc.org/moomoo/entry.user.js
// ==/UserScript==

let active = false;

document.body.insertAdjacentHTML('beforeend', /* html */ `
  <style>
    .pme.hidden {
      display: none !important;
    }

    .pme.root * {
      background-color: transparent;
      color: #a6aec4;
      font-size: 20px;
    }

    .pme.root button {
      border-radius: 5px;
      border: none;
      cursor: pointer;
      font-weight: 900;
      will-change: scale;
      transition: scale 100ms;
    }

    .pme.root button:active {
      scale: 0.9;
    }

    .pme.root button:focus-visible {
      outline: none;
    }

    .pme.root {
      position: absolute;
      right: 20px;
      bottom: 60px;
      z-index: 9999;
      background-color: #16181d99;
      backdrop-filter: blur(5px);
      box-shadow: 0 5px 5px 0 #00000022;
      color: #a6aec4;
      padding: 10px 15px;
      border-radius: 10px;
      display: flex;
      gap: 10px;
    }

    .pme.loaded {
      display: flex;
      gap: 10px;
    }

    .pme.toggle {
      width: 50px;
      font-size: 15px;
      background-color: #e64887aa;
      color: #ffffff;
      padding: 0 10px;
    }

    .pme.toggle.active {
      background-color: #44b522aa;
    }

    .pme.dismiss {
      margin: -20px 0;
      padding: 0;
      font-size: 25px;
    }
  </style>
  <div class="pme root hidden">
    <div class="pme loaded hidden">
      Redirect to Pink Moo
      <button class="pme toggle">
        OFF
      </button>
    </div>
    <div class="pme failed hidden">
      Pink Moo is Offline
    </div>
    <button class="pme dismiss">
      ×
    </button>
  </div>
`);

let root = document.querySelector(".pme.root");
let loaded = root.querySelector(".pme.loaded");
let failed = root.querySelector(".pme.failed");
let toggleButton = root.querySelector(".pme.toggle");
let dismissButton = root.querySelector(".pme.dismiss");

function toggle() {
  active = !active;
  toggleButton.classList[active ? "add" : "remove"]("active");
  toggleButton.innerText = active ? "ON" : "OFF";
}

function show(success) {
  root.classList.remove("hidden");
  loaded.classList[success ? "remove" : "add"]("hidden");
  failed.classList[success ? "add" : "remove"]("hidden");
}

function dismiss() {
  root.classList.add("hidden");
}

toggleButton.addEventListener("click", toggle);
dismissButton.addEventListener("click", dismiss);

let id = "pink";
let originalServer = null;
let url = new URL(window.location);

function setUrl(server) {
  url.searchParams.set("server", server);
  url.search = decodeURIComponent(url.search);
  window.history.pushState({}, '', url);
}

if (url.searchParams.get("server") === id) {
  toggle();
}

function checkUrl() {
  url = new URL(window.location);

  let server = url.searchParams.get("server");
  if (server !== id) originalServer = server;

  if (active && server !== id) setUrl(id);
  if (!active && server === id && originalServer) setUrl(originalServer);
}

function tick() {
  checkUrl();
  window.requestAnimationFrame(tick);
}

tick();

window.WebSocket = new Proxy(WebSocket, {
  construct(target, args) {
    dismiss();

    if (active) {
      setUrl();
      args[0] = "wss://huey.ckefgisc.org/moomoo/ws";
    }

    return new target(...args);
  }
});

async function init() {
  try {
    await fetch("https://huey.ckefgisc.org/moomoo/", { method: "HEAD" });
    show(true);
  }
  catch (ignored) {
    show(false);
    active = false;
  }
}

init();

console.log("Pink Moo Entry - Initialized");
