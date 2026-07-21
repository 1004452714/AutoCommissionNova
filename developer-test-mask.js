(function () {
  const ids = ["mode", "caseName", "country", "commissionName", "location", "processFile", "branchCondition"];
  const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  const status = document.getElementById("status");
  const runButton = document.getElementById("run");
  let options = { modes: [], scopes: [], cases: [] };

  function request(url, data) {
    if (!window.htmlMask || typeof window.htmlMask.request !== "function") return Promise.reject(new Error("htmlMask 不可用"));
    return Promise.resolve(window.htmlMask.request(url, data || {}));
  }

  function unwrap(response) {
    let value = response && response.data !== undefined ? response.data : response;
    if (value && value.requestId && value.data !== undefined) value = value.data;
    if (typeof value === "string") { try { value = JSON.parse(value); } catch {} }
    return value || {};
  }

  function setOptions(select, values, preferred) {
    const unique = Array.from(new Set(values.filter(Boolean)));
    select.replaceChildren(...unique.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      return option;
    }));
    if (preferred && unique.includes(preferred)) select.value = preferred;
  }

  function matchingScopes() {
    return options.scopes.filter((scope) => scope.mode === el.mode.value);
  }

  function refresh(source) {
    const isCase = el.mode.value === "case";
    el.caseName.disabled = !isCase;
    el.branchCondition.disabled = !isCase;
    [el.country, el.commissionName, el.location, el.processFile].forEach((field) => { field.disabled = isCase; });
    if (isCase) {
      [el.country, el.commissionName, el.location, el.processFile].forEach((field) => { field.replaceChildren(); });
      setOptions(el.caseName, options.cases, el.caseName.value);
    } else {
      el.caseName.replaceChildren();
      el.branchCondition.value = "";
      let scopes = matchingScopes();
      setOptions(el.country, scopes.map((x) => x.country), source === "mode" ? "挪德卡莱" : el.country.value);
      scopes = scopes.filter((x) => x.country === el.country.value);
      setOptions(el.commissionName, scopes.map((x) => x.commissionName), el.commissionName.value);
      scopes = scopes.filter((x) => x.commissionName === el.commissionName.value);
      setOptions(el.location, scopes.map((x) => x.location), el.location.value);
      const scope = scopes.find((x) => x.location === el.location.value);
      setOptions(el.processFile, scope ? scope.processFiles : [], "process.json");
    }
    runButton.disabled = isCase ? !el.caseName.value : !el.processFile.value;
  }

  function config() {
    if (el.mode.value === "case") {
      let branchCondition = null;
      if (el.branchCondition.value.trim()) branchCondition = JSON.parse(el.branchCondition.value);
      return { mode: "case", caseName: el.caseName.value, branchCondition };
    }
    return { mode: el.mode.value, country: el.country.value, commissionName: el.commissionName.value, location: el.location.value, processFile: el.processFile.value };
  }

  async function init() {
    try {
      options = unwrap(await request("/loadTestOptions"));
      setOptions(el.mode, options.modes || [], "basic");
      refresh("mode");
      status.textContent = "参数已加载";
    } catch (error) { status.textContent = error.message || "参数加载失败"; status.className = "status error"; }
  }

  [el.mode, el.country, el.commissionName, el.location].forEach((field) => field.addEventListener("change", () => refresh(field.id)));
  document.getElementById("test-form").addEventListener("submit", async (event) => {
    event.preventDefault(); runButton.disabled = true; status.textContent = "正在启动测试...";
    try { const result = unwrap(await request("/runTest", { config: config() })); if (result.status === "error") throw new Error(result.message); }
    catch (error) { status.textContent = error.message || "启动失败"; status.className = "status error"; runButton.disabled = false; }
  });
  document.getElementById("close").addEventListener("click", () => request("/close", {}));
  init();
})();
