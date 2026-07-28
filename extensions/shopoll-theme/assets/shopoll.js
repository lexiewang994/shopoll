(function (globalObject, documentObject) {
  "use strict";

  var stateKey = "__shopollRuntimeLoaderV1";
  var state = globalObject[stateKey] || { status: "idle" };
  globalObject[stateKey] = state;

  function findRoot(scope) {
    if (scope && scope.matches && scope.matches("[data-shopoll-root]")) return scope;
    return scope && scope.querySelector ? scope.querySelector("[data-shopoll-root]") : null;
  }

  function loadRuntime(scope) {
    if (state.status === "loading" || state.status === "loaded") return;
    var root = findRoot(scope) || findRoot(documentObject);
    var source = root && root.dataset.runtimeUrl;
    if (!source) return;

    state.status = "loading";
    var script = documentObject.createElement("script");
    script.src = source;
    script.async = true;
    script.dataset.shopollRuntime = "v1";
    script.onload = function () { state.status = "loaded"; };
    script.onerror = function () { state.status = "idle"; };
    documentObject.head.appendChild(script);
  }

  function schedule(scope) {
    var root = findRoot(scope) || findRoot(documentObject);
    if (!root) return;
    if (root.dataset.mode === "inline") {
      globalObject.requestAnimationFrame(function () { loadRuntime(scope); });
      return;
    }
    if (typeof globalObject.requestIdleCallback === "function") {
      globalObject.requestIdleCallback(function () { loadRuntime(scope); }, { timeout: 1500 });
      return;
    }
    globalObject.setTimeout(function () { loadRuntime(scope); }, 0);
  }

  if (documentObject.readyState === "loading") {
    documentObject.addEventListener("DOMContentLoaded", function () { schedule(documentObject); }, { once: true });
  } else {
    schedule(documentObject);
  }
  documentObject.addEventListener("shopify:section:load", function (event) { schedule(event.target); });
})(window, document);
