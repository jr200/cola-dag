// ---------------------------------------------------------------------------
// Share panel component: generates a shareable URL with the current graph
// state encoded as a base64 query parameter.
// Returns { el, panelEl, destroy }.
// ---------------------------------------------------------------------------

export function createSharePanel() {
  var btn = document.createElement("button");
  btn.textContent = "Share";
  btn.dataset.tooltip = "Generate a shareable URL for the current graph";

  var panel = document.createElement("div");
  panel.className = "share-panel";
  panel.style.display = "none";

  var urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.className = "share-url-input";
  urlInput.readOnly = true;
  panel.appendChild(urlInput);

  var actions = document.createElement("div");
  actions.className = "share-actions";

  var copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy";
  actions.appendChild(copyBtn);

  var closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  actions.appendChild(closeBtn);

  panel.appendChild(actions);

  var visible = false;

  function buildUrl() {
    fetch("/api/graph-dot")
      .then(function (res) { return res.text(); })
      .then(function (dotText) {
        var bytes = new TextEncoder().encode(dotText);
        var encoded = btoa(String.fromCharCode.apply(null, bytes));
        var base = window.location.origin + window.location.pathname;
        var params = new URLSearchParams(window.location.search);
        params.set("dot", encoded);
        urlInput.value = base + "?" + params.toString();
        urlInput.select();
      })
      .catch(function () { urlInput.value = "Failed to generate URL"; });
  }

  function toggle() {
    visible = !visible;
    panel.style.display = visible ? "" : "none";
    btn.classList.toggle("active", visible);
    if (visible) buildUrl();
  }

  function onCopy() {
    urlInput.select();
    navigator.clipboard.writeText(urlInput.value).then(function () {
      copyBtn.textContent = "Copied!";
      setTimeout(function () { copyBtn.textContent = "Copy"; }, 1500);
    });
  }

  btn.addEventListener("click", toggle);
  copyBtn.addEventListener("click", onCopy);
  closeBtn.addEventListener("click", toggle);

  var el = document.createDocumentFragment();
  el.appendChild(btn);

  return {
    el: el,
    panelEl: panel,
    destroy: function () {
      btn.removeEventListener("click", toggle);
      copyBtn.removeEventListener("click", onCopy);
      closeBtn.removeEventListener("click", toggle);
      btn.remove();
      panel.remove();
    }
  };
}
