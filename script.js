(() => {
  "use strict";

  const API_BASE = "https://mansik-santulan-score.onrender.com";
  const DRAFT_KEY = "mhs_draft_v1";
  const HISTORY_KEY = "mhs_history_v1";
  const THEME_KEY = "mhs_theme";

  const form = document.getElementById("predict-form");
  const submitBtn = document.getElementById("submit-btn");
  const resetBtn = document.getElementById("reset-btn");
  const errorRetryBtn = document.getElementById("error-retry-btn");

  const stateIdle = document.getElementById("state-idle");
  const stateLoading = document.getElementById("state-loading");
  const stateResult = document.getElementById("state-result");
  const stateError = document.getElementById("state-error");

  const scoreNumberEl = document.getElementById("score-number");
  const scoreBandEl = document.getElementById("score-band");
  const scoreContextEl = document.getElementById("score-context");
  const gaugeFill = document.getElementById("gauge-fill");
  const errorLabelEl = document.getElementById("error-label");
  const errorCopyEl = document.getElementById("error-copy");

  const themeToggle = document.getElementById("theme-toggle");
  const draftBanner = document.getElementById("draft-banner");
  const draftRestoreBtn = document.getElementById("draft-restore");
  const draftDiscardBtn = document.getElementById("draft-discard");
  const copyBtn = document.getElementById("copy-btn");
  const downloadBtn = document.getElementById("download-btn");
  const historyBlock = document.getElementById("history-block");
  const historySparkLine = document.getElementById("history-spark-line");
  const historyClearBtn = document.getElementById("history-clear");

  const GAUGE_ARC_LENGTH = 314;

  let lastPayload = null;
  let lastScore = null;

  function initTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    const preferred = stored || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = preferred;
  }
  initTheme();

  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  });

  function drawTicks() {
    document.querySelectorAll(".gauge-ticks").forEach((g) => {
      g.innerHTML = "";
      const cx = 120, cy = 140, rOuter = 100, rInner = 90;
      for (let i = 0; i <= 10; i += 2) {
        const angle = Math.PI - (i / 10) * Math.PI;
        const x1 = cx + rOuter * Math.cos(angle);
        const y1 = cy - rOuter * Math.sin(angle);
        const x2 = cx + rInner * Math.cos(angle);
        const y2 = cy - rInner * Math.sin(angle);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x1.toFixed(1));
        line.setAttribute("y1", y1.toFixed(1));
        line.setAttribute("x2", x2.toFixed(1));
        line.setAttribute("y2", y2.toFixed(1));
        g.appendChild(line);
      }
    });
  }
  drawTicks();

  const segGroup = document.getElementById("stress_level_group");
  const stressHiddenInput = document.getElementById("stress_level");
  segGroup.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      segGroup.querySelectorAll(".seg-btn").forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      stressHiddenInput.value = btn.dataset.value;
      clearFieldError(stressHiddenInput);
      saveDraft();
    });
  });

  const purposeRow = document.getElementById("purpose_chip_row");
  const purposeHiddenInput = document.getElementById("purpose_of_use");
  purposeRow.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      purposeRow.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      purposeHiddenInput.value = chip.dataset.value;
      clearFieldError(purposeHiddenInput);
      saveDraft();
    });
  });

  const syncPairs = [
    ["avg_daily_usage_hours_range", "avg_daily_usage_hours", "avg_daily_usage_hours_val", "hrs"],
    ["study_hours_range", "study_hours", "study_hours_val", "hrs"],
    ["physical_activity_hours_range", "physical_activity_hours", "physical_activity_hours_val", "hrs"],
    ["sleep_hours_per_night_range", "sleep_hours_per_night", "sleep_hours_per_night_val", "hrs"],
  ];

  syncPairs.forEach(([rangeId, numberId, labelId, unit]) => {
    const rangeEl = document.getElementById(rangeId);
    const numberEl = document.getElementById(numberId);
    const labelEl = document.getElementById(labelId);
    rangeEl.addEventListener("input", () => {
      numberEl.value = rangeEl.value;
      labelEl.textContent = `${parseFloat(rangeEl.value).toFixed(1)} ${unit}`;
      clearFieldError(numberEl);
      updateRhythmPreview();
      saveDraft();
    });
    numberEl.addEventListener("input", () => {
      const v = parseFloat(numberEl.value);
      if (!Number.isNaN(v)) {
        rangeEl.value = Math.min(v, parseFloat(rangeEl.max));
        labelEl.textContent = `${v.toFixed(1)} ${unit}`;
      }
      updateRhythmPreview();
    });
  });

  function updateRhythmPreview() {
    const sleep = parseFloat(document.getElementById("sleep_hours_per_night").value) || 0;
    const study = parseFloat(document.getElementById("study_hours").value) || 0;
    const screen = parseFloat(document.getElementById("avg_daily_usage_hours").value) || 0;
    const activity = parseFloat(document.getElementById("physical_activity_hours").value) || 0;
    const total = sleep + study + screen + activity;
    const clampedTotal = Math.min(total, 24);
    const rest = Math.max(0, 24 - clampedTotal);

    const scale = total > 24 ? 24 / total : 1;
    document.getElementById("seg-sleep").style.width = `${(sleep * scale / 24) * 100}%`;
    document.getElementById("seg-study").style.width = `${(study * scale / 24) * 100}%`;
    document.getElementById("seg-screen").style.width = `${(screen * scale / 24) * 100}%`;
    document.getElementById("seg-activity").style.width = `${(activity * scale / 24) * 100}%`;
    document.getElementById("seg-rest").style.width = `${(rest / 24) * 100}%`;

    const totalLabel = document.getElementById("rhythm-total");
    totalLabel.textContent = total > 24
      ? `${total.toFixed(1)} / 24 hrs — over a full day`
      : `${total.toFixed(1)} / 24 hrs accounted for`;
  }

  function fieldWrapper(input) { return input.closest(".field"); }

  function setFieldError(input, message) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.add("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = message;
  }

  function clearFieldError(input) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.remove("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = "";
  }

  function clearAllErrors() {
    form.querySelectorAll(".field").forEach((f) => f.classList.remove("field-error"));
    form.querySelectorAll(".error-msg").forEach((m) => (m.textContent = ""));
  }

  function validate(payload) {
    const errors = [];
    const numericChecks = [
      ["age", 10, 100],
      ["avg_daily_usage_hours", 0, 24],
      ["daily_unlocks", 0, Infinity],
      ["study_hours", 0, 24],
      ["physical_activity_hours", 0, 24],
      ["sleep_hours_per_night", 0, 24],
    ];

    numericChecks.forEach(([key, min, max]) => {
      const input = document.getElementById(key);
      const val = payload[key];
      if (val === "" || val === null || Number.isNaN(val)) {
        errors.push([input, "This field is required."]);
      } else if (val < min || val > max) {
        errors.push([input, `Must be between ${min} and ${max === Infinity ? "0+" : max}.`]);
      }
    });

    ["gender", "country", "academic_level", "most_used_platform"].forEach((key) => {
      const input = document.getElementById(key);
      if (!payload[key] || String(payload[key]).trim() === "") {
        errors.push([input, "This field is required."]);
      }
    });

    if (!payload.purpose_of_use) errors.push([purposeHiddenInput, "Pick a purpose."]);
    if (!payload.stress_level) errors.push([stressHiddenInput, "Pick a stress level."]);

    return errors;
  }

  function collectPayload() {
    const fd = new FormData(form);
    return {
      age: fd.get("age") === "" ? NaN : parseInt(fd.get("age"), 10),
      gender: fd.get("gender") || "",
      country: (fd.get("country") || "").trim(),
      academic_level: fd.get("academic_level") || "",
      most_used_platform: fd.get("most_used_platform") || "",
      purpose_of_use: fd.get("purpose_of_use") || "",
      avg_daily_usage_hours: fd.get("avg_daily_usage_hours") === "" ? NaN : parseFloat(fd.get("avg_daily_usage_hours")),
      daily_unlocks: fd.get("daily_unlocks") === "" ? NaN : parseInt(fd.get("daily_unlocks"), 10),
      study_hours: fd.get("study_hours") === "" ? NaN : parseFloat(fd.get("study_hours")),
      physical_activity_hours: fd.get("physical_activity_hours") === "" ? NaN : parseFloat(fd.get("physical_activity_hours")),
      sleep_hours_per_night: fd.get("sleep_hours_per_night") === "" ? NaN : parseFloat(fd.get("sleep_hours_per_night")),
      stress_level: fd.get("stress_level") || "",
    };
  }

  function showState(name) {
    [stateIdle, stateLoading, stateResult, stateError].forEach((el) => (el.hidden = true));
    ({ idle: stateIdle, loading: stateLoading, result: stateResult, error: stateError }[name]).hidden = false;
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.classList.toggle("loading", isSubmitting);
  }

  function bandFor(score) {
    if (score < 4) {
      return {
        label: "Signal: strained",
        context: "Your responses suggest elevated strain right now. Small shifts in sleep or screen time can go a long way.",
      };
    }
    if (score < 7) {
      return {
        label: "Signal: balanced",
        context: "Your rhythm looks fairly steady, with some room to recover and reset.",
      };
    }
    return {
      label: "Signal: strong",
      context: "Your habits point to a well-supported, resilient baseline. Keep it up.",
    };
  }

  function renderResult(score) {
    const clamped = Math.max(0, Math.min(10, score));
    const { label, context } = bandFor(clamped);

    scoreNumberEl.textContent = score.toFixed(2);
    scoreBandEl.textContent = label;
    scoreContextEl.textContent = context;

    gaugeFill.style.transition = "none";
    gaugeFill.style.strokeDashoffset = String(GAUGE_ARC_LENGTH);
    requestAnimationFrame(() => {
      gaugeFill.style.transition = "";
      const offset = GAUGE_ARC_LENGTH * (1 - clamped / 10);
      gaugeFill.style.strokeDashoffset = String(offset);
    });

    lastScore = score;
    pushHistory(score);
    renderHistory();
    clearDraft();
    showState("result");
  }

  function renderError(label, copy) {
    errorLabelEl.textContent = label;
    errorCopyEl.textContent = copy;
    showState("error");
  }

  function applyServerValidationErrors(detail) {
    if (!Array.isArray(detail)) return false;
    let matched = false;
    detail.forEach((err) => {
      const field = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : null;
      const input = field ? document.getElementById(field) : null;
      const target = field === "stress_level" ? stressHiddenInput : (field === "purpose_of_use" ? purposeHiddenInput : input);
      if (target) {
        setFieldError(target, err.msg || "Invalid value.");
        matched = true;
      }
    });
    return matched;
  }

  function readHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function pushHistory(score) {
    const hist = readHistory();
    hist.push({ ts: Date.now(), score });
    while (hist.length > 8) hist.shift();
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(hist)); } catch (e) {}
  }

  function renderHistory() {
    const hist = readHistory();
    if (hist.length < 2) { historyBlock.hidden = true; return; }
    historyBlock.hidden = false;
    const w = 200, h = 40, pad = 4;
    const points = hist.map((entry, i) => {
      const x = pad + (i / (hist.length - 1)) * (w - pad * 2);
      const y = h - pad - (entry.score / 10) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    historySparkLine.setAttribute("points", points);
  }

  historyClearBtn.addEventListener("click", () => {
    try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
    historyBlock.hidden = true;
  });

  function summaryText() {
    if (!lastPayload || lastScore === null) return "";
    const p = lastPayload;
    return [
      "Mental Health Signal — Result",
      `Score: ${lastScore.toFixed(2)} / 10`,
      `Age: ${p.age}, Gender: ${p.gender}, Country: ${p.country}`,
      `Academic level: ${p.academic_level}`,
      `Screen time: ${p.avg_daily_usage_hours} hrs/day on ${p.most_used_platform} (${p.purpose_of_use})`,
      `Study: ${p.study_hours} hrs, Activity: ${p.physical_activity_hours} hrs, Sleep: ${p.sleep_hours_per_night} hrs`,
      `Perceived stress: ${p.stress_level}`,
      "This is informational only, not a clinical assessment.",
    ].join("\n");
  }

  copyBtn.addEventListener("click", async () => {
    const text = summaryText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy summary"), 1600);
    } catch (e) {
      copyBtn.textContent = "Couldn't copy";
      setTimeout(() => (copyBtn.textContent = "Copy summary"), 1600);
    }
  });

  downloadBtn.addEventListener("click", () => {
    const text = summaryText();
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mental-health-signal-result.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  function saveDraft() {
    const payload = collectPayload();
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(payload)); } catch (e) {}
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  }

  function applyDraft(draft) {
    Object.keys(draft).forEach((key) => {
      if (key === "purpose_of_use") {
        purposeHiddenInput.value = draft[key];
        purposeRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.value === draft[key]));
        return;
      }
      if (key === "stress_level") {
        stressHiddenInput.value = draft[key];
        segGroup.querySelectorAll(".seg-btn").forEach((b) => {
          const active = b.dataset.value === draft[key];
          b.classList.toggle("active", active);
          b.setAttribute("aria-pressed", active ? "true" : "false");
        });
        return;
      }
      const input = document.getElementById(key);
      if (input && draft[key] !== undefined && draft[key] !== null && !Number.isNaN(draft[key])) {
        input.value = draft[key];
      }
    });
    syncPairs.forEach(([rangeId, numberId, labelId, unit]) => {
      const rangeEl = document.getElementById(rangeId);
      const numberEl = document.getElementById(numberId);
      const labelEl = document.getElementById(labelId);
      const v = parseFloat(numberEl.value) || 0;
      rangeEl.value = Math.min(v, parseFloat(rangeEl.max));
      labelEl.textContent = `${v.toFixed(1)} ${unit}`;
    });
    updateRhythmPreview();
  }

  function initDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      const hasContent = Object.values(draft).some((v) => v !== "" && v !== undefined && v !== null && !Number.isNaN(v));
      if (hasContent) draftBanner.hidden = false;
    } catch (e) {}
  }
  initDraft();

  draftRestoreBtn.addEventListener("click", () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) applyDraft(JSON.parse(raw));
    } catch (e) {}
    draftBanner.hidden = true;
  });

  draftDiscardBtn.addEventListener("click", () => {
    clearDraft();
    draftBanner.hidden = true;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllErrors();

    const payload = collectPayload();
    const clientErrors = validate(payload);

    if (clientErrors.length > 0) {
      clientErrors.forEach(([input, msg]) => input && setFieldError(input, msg));
      clientErrors[0][0]?.focus?.();
      return;
    }

    lastPayload = payload;
    setSubmitting(true);
    showState("loading");

    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 422) {
        const body = await res.json().catch(() => null);
        const matched = body && applyServerValidationErrors(body.detail);
        renderError(
          "Check your inputs",
          matched
            ? "The API rejected a few fields — details are marked on the form."
            : "The API rejected this submission. Please review your inputs and try again."
        );
        return;
      }

      if (!res.ok) {
        let detailMsg = `The API responded with status ${res.status}.`;
        const body = await res.json().catch(() => null);
        if (body && typeof body.detail === "string") detailMsg = body.detail;
        renderError("Prediction failed", detailMsg);
        return;
      }

      const data = await res.json();
      if (typeof data.predicted_mental_health_score !== "number") {
        renderError("Unexpected response", "The API responded, but the score was missing or malformed.");
        return;
      }

      renderResult(data.predicted_mental_health_score);
    } catch (err) {
      renderError(
        "Can't reach the server",
        `Couldn't connect to ${API_BASE}. Make sure the backend is running and reachable from this page.`
      );
    } finally {
      setSubmitting(false);
    }
  });

  form.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("input", () => { clearFieldError(el); saveDraft(); });
    el.addEventListener("change", () => { clearFieldError(el); saveDraft(); });
  });

  resetBtn.addEventListener("click", () => showState("idle"));
  errorRetryBtn.addEventListener("click", () => showState("idle"));

  updateRhythmPreview();
  renderHistory();
})();