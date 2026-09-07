(function () {
  var select = document.getElementById("marketFilter");
  var chips = document.getElementById("marketHeroChips");
  var countEl = document.getElementById("marketHeroCount");
  var badge = document.getElementById("marketHeroBadge");
  if (!select || !chips) return;

  function options() {
    return Array.prototype.filter.call(select.options, function (o) { return o.value; });
  }

  function render() {
    var current = select.value;
    chips.innerHTML = "";
    var allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "pitch-chip" + (current ? "" : " active");
    allBtn.textContent = "All markets";
    allBtn.addEventListener("click", function () {
      select.value = "";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      render();
    });
    chips.appendChild(allBtn);
    options().forEach(function (opt) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pitch-chip" + (current === opt.value ? " active" : "");
      btn.textContent = opt.textContent;
      btn.addEventListener("click", function () {
        select.value = current === opt.value ? "" : opt.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        render();
      });
      chips.appendChild(btn);
    });
    if (badge) badge.textContent = current || "ALL";
    if (countEl) {
      var n = document.getElementById("marketCount");
      var cards = document.querySelectorAll("#portalContent .pick-card, #portalContent article, #portalContent .consensus-banker-card");
      countEl.textContent = n && n.textContent ? n.textContent : String(cards.length);
    }
  }

  var obs = new MutationObserver(render);
  obs.observe(select, { childList: true, subtree: true });
  var content = document.getElementById("portalContent");
  if (content) obs.observe(content, { childList: true, subtree: true });
  var mc = document.getElementById("marketCount");
  if (mc) obs.observe(mc, { childList: true, characterData: true, subtree: true });
  select.addEventListener("change", render);
  render();
})();
