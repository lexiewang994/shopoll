(function (global, factory) {
  "use strict";

  var core = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  if (global && global.document) core.boot(global);
})(typeof window !== "undefined" ? window : undefined, function () {
  "use strict";

  var ALLOWED_TRIGGERS = ["immediate", "timed", "scroll", "exit", "add_to_cart"];
  var CHOICE_TYPES = ["single_choice", "multiple_choice", "nps", "csat", "rating"];

  function clampNumber(value, fallback, minimum, maximum) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
  }

  function sanitizeBase(input, origin) {
    var value = String(input || "").trim().replace(/\/$/, "");
    if (!value) return "";
    if (value.charAt(0) === "/") return value;
    try {
      var url = new URL(value, origin);
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return "";
      return url.origin + url.pathname.replace(/\/$/, "");
    } catch (_error) {
      return "";
    }
  }

  function normalizeType(type) {
    var value = String(type || "").toLowerCase().replace(/[-\s]/g, "_");
    var aliases = {
      single: "single_choice",
      radio: "single_choice",
      choice: "single_choice",
      multi: "multiple_choice",
      multiple: "multiple_choice",
      checkbox: "multiple_choice",
      short: "short_text",
      text: "short_text",
      long: "long_text",
      textarea: "long_text",
      stars: "rating",
      welcome_page: "welcome",
      end_page: "end",
      thank_you: "end"
    };
    return aliases[value] || value;
  }

  function normalizeTrigger(dataset, placement, isMobile, mode) {
    if (mode === "inline") return { type: "immediate" };
    var remote = placement && (placement.trigger || (placement.triggers && placement.triggers[0]));
    var configured = dataset.triggerMode || "server";
    var trigger = configured === "server" && remote ? remote : {
      type: configured === "server" ? "timed" : configured,
      delaySeconds: dataset.delaySeconds,
      scrollPercent: dataset.scrollPercent,
      mobileFallback: dataset.mobileFallback,
      mobileDelaySeconds: dataset.mobileDelaySeconds,
      mobileScrollPercent: dataset.mobileScrollPercent
    };
    if (trigger && (trigger.desktop || trigger.mobile)) {
      trigger = (isMobile ? trigger.mobile : trigger.desktop) || trigger.desktop || trigger.mobile;
    }
    var type = String(trigger.type || trigger.kind || "timed").toLowerCase().replace(/[-\s]/g, "_");
    if (type === "time" || type === "time_on_page" || type === "delay") type = "timed";
    if (type === "elapsed") type = "timed";
    if (type === "scroll_depth") type = "scroll";
    if (type === "exit_intent") type = "exit";
    if (type === "cart" || type === "added_to_cart") type = "add_to_cart";

    if (isMobile && type === "exit") {
      type = String(trigger.mobileFallback || trigger.mobile_fallback || dataset.mobileFallback || "timed");
    }
    if (ALLOWED_TRIGGERS.indexOf(type) === -1) type = "timed";

    var delay = isMobile
      ? trigger.mobileDelaySeconds || trigger.mobile_delay_seconds || trigger.seconds || dataset.mobileDelaySeconds
      : trigger.delaySeconds || trigger.delay_seconds || trigger.delay || trigger.seconds || dataset.delaySeconds;
    var scroll = isMobile
      ? trigger.mobileScrollPercent || trigger.mobile_scroll_percent || dataset.mobileScrollPercent
      : trigger.scrollPercent || trigger.scroll_percent || trigger.threshold || dataset.scrollPercent;

    return {
      type: type,
      delayMs: clampNumber(delay, isMobile ? 12 : 8, 0, 600) * 1000,
      scrollPercent: clampNumber(scroll, isMobile ? 60 : 50, 1, 100)
    };
  }

  function matchesCondition(condition, value) {
    var operator = String(condition.operator || condition.comparator || "equals").toLowerCase();
    var expected = condition.value;
    if (operator === "equals" || operator === "is") return value === expected;
    if (operator === "not_equals" || operator === "is_not") return value !== expected;
    if (operator === "includes" || operator === "contains") {
      return Array.isArray(value) ? value.indexOf(expected) !== -1 : String(value || "").indexOf(String(expected)) !== -1;
    }
    if (operator === "not_includes") return !matchesCondition({ operator: "includes", value: expected }, value);
    if (operator === "answered") return value !== undefined && value !== null && value !== "";
    if (operator === "greater_than") return Number(value) > Number(expected);
    if (operator === "less_than") return Number(value) < Number(expected);
    return false;
  }

  function resolveNext(question, answer, questions) {
    var logic = question.logic && (question.logic.rules || question.logic);
    var rules = Array.isArray(logic) ? logic : Array.isArray(question.rules) ? question.rules : [];
    for (var index = 0; index < rules.length; index += 1) {
      var rule = rules[index];
      var condition = rule.condition || rule.when || rule;
      if (!matchesCondition(condition, answer)) continue;
      var action = String(rule.action || rule.type || "go_to").toLowerCase();
      if (action === "complete" || action === "end" || action === "end_survey") return { complete: true };
      var target = rule.targetQuestionId || rule.target_question_id || rule.target || rule.goTo;
      if (target) return { nextQuestionId: String(target) };
    }
    var explicit = question.nextQuestionId || question.next_question_id || question.next;
    if (explicit === "complete" || explicit === "end") return { complete: true };
    if (explicit) return { nextQuestionId: String(explicit) };
    var current = questions.indexOf(question);
    if (current < 0 || current >= questions.length - 1) return { complete: true };
    return { nextQuestionId: String(questions[current + 1].id) };
  }

  function stableHash(value) {
    var serialized = typeof value === "string" ? value : JSON.stringify(value);
    var text = serialized === undefined ? String(value) : serialized;
    var hash = 2166136261;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function textFor(value, locale) {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    var shortLocale = String(locale || "en").split("-")[0];
    return value[locale] || value[shortLocale] || value.en || value.default || "";
  }

  function randomToken(globalObject) {
    var cryptoApi = globalObject.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
    if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
      var bytes = new Uint8Array(16);
      cryptoApi.getRandomValues(bytes);
      return Array.prototype.map.call(bytes, function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
    }
    return String(Date.now()) + "-" + Math.random().toString(36).slice(2);
  }

  function unwrap(payload) {
    return payload && payload.data && typeof payload.data === "object" ? payload.data : payload;
  }

  function createElement(documentObject, name, className, text) {
    var element = documentObject.createElement(name);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function ShopollSurvey(root, globalObject) {
    this.root = root;
    this.global = globalObject;
    this.document = globalObject.document;
    this.dataset = root.dataset;
    this.mode = this.dataset.mode || "inline";
    this.locale = this.dataset.locale || "en";
    this.apiBase = sanitizeBase(this.dataset.apiBase, globalObject.location.origin);
    this.labels = {
      loading: this.dataset.labelLoading || "Loading survey",
      close: this.dataset.labelClose || "Close survey",
      next: this.dataset.labelNext || "Next",
      back: this.dataset.labelBack || "Back",
      submit: this.dataset.labelSubmit || "Submit",
      retry: this.dataset.labelRetry || "Try again",
      required: this.dataset.labelRequired || "Please answer this question.",
      consentRequired: this.dataset.labelConsentRequired || "Please confirm your consent before continuing.",
      error: this.dataset.labelError || "We couldn't save your answer. Please try again.",
      question: this.dataset.labelQuestion || "Question",
      other: this.dataset.labelOther || "Other",
      thankYou: this.dataset.labelThankYou || "Thank you",
      rewardPending: this.dataset.labelRewardPending || "Your discount code is being prepared."
    };
    this.answers = {};
    this.history = [];
    this.pendingTextTimer = null;
    this.saveQueue = Promise.resolve();
    this.answerSequence = 0;
    this.cleanupTrigger = function () {};
    this.analyticsAllowed = this.readAnalyticsConsent();
    this.pageToken = randomToken(globalObject);
    this.context = this.buildContext();
  }

  ShopollSurvey.prototype.readAnalyticsConsent = function () {
    try {
      var privacy = this.global.Shopify && this.global.Shopify.customerPrivacy;
      return Boolean(privacy && typeof privacy.analyticsProcessingAllowed === "function" && privacy.analyticsProcessingAllowed());
    } catch (_error) {
      return false;
    }
  };

  ShopollSurvey.prototype.safeStorage = function (persistent) {
    try {
      var storage = persistent ? this.global.localStorage : this.global.sessionStorage;
      var probe = "shopoll:probe";
      storage.setItem(probe, "1");
      storage.removeItem(probe);
      return storage;
    } catch (_error) {
      return null;
    }
  };

  ShopollSurvey.prototype.visitorToken = function () {
    if (!this.analyticsAllowed) return this.pageToken;
    var storage = this.safeStorage(true);
    var key = "shopoll:visitor:v1";
    var cookie = this.document.cookie.split(";").map(function (part) { return part.trim(); }).find(function (part) {
      return part.indexOf("shopoll_visitor=") === 0;
    });
    var current = cookie ? decodeURIComponent(cookie.slice("shopoll_visitor=".length)) : storage && storage.getItem(key);
    if (current) {
      if (!cookie) this.document.cookie = "shopoll_visitor=" + encodeURIComponent(current) + "; Path=/; Max-Age=63072000; SameSite=Lax; Secure";
      return current;
    }
    if (storage) storage.setItem(key, this.pageToken);
    this.document.cookie = "shopoll_visitor=" + encodeURIComponent(this.pageToken) + "; Path=/; Max-Age=63072000; SameSite=Lax; Secure";
    return this.pageToken;
  };

  ShopollSurvey.prototype.buildContext = function () {
    var params = new URLSearchParams(this.global.location.search);
    var utm = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (key) {
      var value = params.get(key);
      if (value) utm[key] = value.slice(0, 200);
    });
    var width = this.global.innerWidth || 1024;
    var list = function (value) {
      return String(value || "").split(",").map(function (item) { return item.trim(); }).filter(Boolean);
    };
    return {
      surface: "theme",
      placementKey: this.dataset.placementKey || "storefront",
      mode: this.mode,
      locale: this.locale,
      country: this.dataset.country || undefined,
      device: width < 750 ? "mobile" : width < 1024 ? "tablet" : "desktop",
      analyticsAllowed: this.analyticsAllowed,
      behaviorScope: this.analyticsAllowed ? "cross_page" : "current_page",
      visitorToken: this.visitorToken(),
      page: {
        type: this.dataset.pageType || "unknown",
        path: this.dataset.path || this.global.location.pathname,
        productGid: this.dataset.productId || undefined,
        variantGid: this.dataset.variantId || undefined,
        productHandle: this.dataset.productHandle || undefined,
        collectionHandle: this.dataset.collectionHandle || undefined
      },
      collectionIds: list(this.dataset.collectionIds),
      cartProductIds: list(this.dataset.cartProductIds),
      utm: utm
    };
  };

  ShopollSurvey.prototype.request = async function (path, options) {
    if (!this.apiBase) throw new Error("missing_api_base");
    var controller = typeof AbortController === "undefined" ? null : new AbortController();
    var timer = controller ? this.global.setTimeout(function () { controller.abort(); }, 8000) : null;
    try {
      var response = await this.global.fetch(this.apiBase + path, {
        method: options && options.method ? options.method : "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Shopoll-Client": "theme-v1"
        },
        body: options && options.body ? JSON.stringify(options.body) : undefined,
        credentials: this.apiBase.charAt(0) === "/" ? "same-origin" : "omit",
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) throw new Error("request_failed_" + response.status);
      return unwrap(await response.json());
    } finally {
      if (timer) this.global.clearTimeout(timer);
    }
  };

  ShopollSurvey.prototype.resumeRecord = function (writeValue) {
    var storage = this.safeStorage(false);
    if (!storage) return null;
    var key = "shopoll:resume:" + this.context.placementKey + ":" + stableHash(this.context.page.path);
    if (writeValue === null) {
      storage.removeItem(key);
      return null;
    }
    if (writeValue) {
      storage.setItem(key, JSON.stringify(writeValue));
      return writeValue;
    }
    try {
      return JSON.parse(storage.getItem(key) || "null");
    } catch (_error) {
      storage.removeItem(key);
      return null;
    }
  };

  ShopollSurvey.prototype.frequencyBlocked = function (placement) {
    var frequency = placement && placement.frequency;
    if (!frequency) return false;
    var storage = this.safeStorage(this.analyticsAllowed);
    if (!storage) return false;
    var suffix = this.analyticsAllowed ? "" : ":" + stableHash(this.context.page.path);
    var key = "shopoll:frequency:" + (frequency.key || placement.id || this.context.placementKey) + suffix;
    this.frequencyKey = key;
    this.frequencyStorage = storage;
    var previous = Number(storage.getItem(key) || 0);
    var cooldownDays = clampNumber(frequency.cooldownDays || frequency.cooldown_days, 0, 0, 365);
    return cooldownDays > 0 && previous > Date.now() - cooldownDays * 86400000;
  };

  ShopollSurvey.prototype.markFrequency = function () {
    if (this.frequencyKey && this.frequencyStorage) this.frequencyStorage.setItem(this.frequencyKey, String(Date.now()));
  };

  ShopollSurvey.prototype.init = async function () {
    if (!this.apiBase) return this.remove();
    try {
      var result = await this.request("/surveys/resolve", {
        method: "POST",
        body: { schemaVersion: 1, context: this.context }
      });
      if (!result || result.eligible === false || !result.survey) return this.remove();
      this.placement = result.placement || {};
      if (this.frequencyBlocked(this.placement)) return this.remove();
      this.surveyEnvelope = result.survey;
      this.definition = result.survey.definition || result.survey.definitionJson || result.survey;
      this.applyStyle();
      this.questions = (this.definition.questions || this.definition.nodes || []).filter(function (question) { return question && question.id; });
      if (!this.questions.length) return this.remove();
      this.session = result.session || null;
      if (this.session && Array.isArray(this.session.answers)) this.restoreAnswers(this.session.answers);
      this.schedule();
    } catch (_error) {
      this.remove();
    }
  };

  ShopollSurvey.prototype.applyStyle = function () {
    var style = Object.assign({}, this.definition.style || {}, this.placement.style || {});
    if (/^#[0-9a-f]{6}$/i.test(String(style.accentColor || ""))) {
      this.root.style.setProperty("--shopoll-accent", style.accentColor);
    }
    this.root.style.setProperty("--shopoll-radius", clampNumber(style.borderRadius, 4, 0, 8) + "px");
    if (style.density === "compact") this.root.classList.add("shopoll--compact");
  };

  ShopollSurvey.prototype.restoreAnswers = function (answers) {
    var self = this;
    answers.forEach(function (answer) {
      if (answer && answer.questionId) self.answers[answer.questionId] = answer.value;
    });
  };

  ShopollSurvey.prototype.schedule = function () {
    var self = this;
    var isMobile = this.context.device === "mobile" || Boolean(this.global.matchMedia && this.global.matchMedia("(pointer: coarse)").matches);
    var trigger = normalizeTrigger(this.dataset, this.placement, isMobile, this.mode);
    var shown = false;
    function show() {
      if (shown) return;
      shown = true;
      self.cleanupTrigger();
      self.show();
    }
    if (trigger.type === "immediate") return show();
    if (trigger.type === "timed") {
      var timer = this.global.setTimeout(show, trigger.delayMs);
      this.cleanupTrigger = function () { self.global.clearTimeout(timer); };
      return;
    }
    if (trigger.type === "scroll") {
      var onScroll = function () {
        var documentElement = self.document.documentElement;
        var available = Math.max(1, documentElement.scrollHeight - self.global.innerHeight);
        if ((self.global.scrollY / available) * 100 >= trigger.scrollPercent) show();
      };
      this.global.addEventListener("scroll", onScroll, { passive: true });
      this.cleanupTrigger = function () { self.global.removeEventListener("scroll", onScroll); };
      onScroll();
      return;
    }
    if (trigger.type === "exit") {
      var onExit = function (event) {
        if (!event.relatedTarget && event.clientY <= 0) show();
      };
      this.document.addEventListener("mouseout", onExit);
      this.cleanupTrigger = function () { self.document.removeEventListener("mouseout", onExit); };
      return;
    }
    var onCart = function (event) {
      var target = event.target && event.target.closest ? event.target.closest("form[action*='/cart/add'], [name='add'], [data-add-to-cart]") : null;
      if (event.type !== "click" || target) show();
    };
    ["shopify:cart:lines-update", "shopify:cart:add", "cart:updated"].forEach(function (name) {
      self.document.addEventListener(name, onCart);
    });
    this.document.addEventListener("click", onCart);
    this.cleanupTrigger = function () {
      ["shopify:cart:lines-update", "shopify:cart:add", "cart:updated"].forEach(function (name) {
        self.document.removeEventListener(name, onCart);
      });
      self.document.removeEventListener("click", onCart);
    };
  };

  ShopollSurvey.prototype.ensureSession = async function () {
    if (this.session && (this.session.id || this.session.sessionId)) return this.session;
    var resume = this.resumeRecord();
    this.session = await this.request("/sessions", {
      method: "POST",
      body: {
        schemaVersion: 1,
        surveyId: this.surveyEnvelope.id || this.definition.surveyId,
        surveyVersionId: this.surveyEnvelope.versionId || this.surveyEnvelope.surveyVersionId || this.definition.versionId,
        placementId: this.placement.id,
        resumeToken: resume && resume.resumeToken,
        context: this.context,
        idempotencyKey: "session:" + this.pageToken + ":" + this.context.placementKey
      }
    });
    if (this.session && Array.isArray(this.session.answers)) this.restoreAnswers(this.session.answers);
    if (this.session) {
      this.resumeRecord({
        sessionId: this.session.id || this.session.sessionId,
        resumeToken: this.session.resumeToken,
        surveyVersionId: this.surveyEnvelope.versionId || this.surveyEnvelope.surveyVersionId
      });
    }
    return this.session;
  };

  ShopollSurvey.prototype.show = async function () {
    try {
      await this.ensureSession();
    } catch (_error) {
      return this.remove();
    }
    this.buildShell();
    this.renderQuestion(this.firstQuestionId());
    var sessionId = this.session && (this.session.id || this.session.sessionId);
    this.request("/impressions", {
      method: "POST",
      body: {
        schemaVersion: 1,
        surveyId: this.surveyEnvelope.id || this.definition.surveyId,
        surveyVersionId: this.surveyEnvelope.versionId || this.surveyEnvelope.surveyVersionId || this.definition.versionId,
        placementId: this.placement.id,
        sessionId: sessionId,
        resumeToken: this.session && this.session.resumeToken,
        context: this.context,
        idempotencyKey: "impression:" + sessionId
      }
    }).catch(function () {});
  };

  ShopollSurvey.prototype.firstQuestionId = function () {
    return String(this.definition.startQuestionId || this.definition.start_question_id || this.questions[0].id);
  };

  ShopollSurvey.prototype.buildShell = function () {
    var self = this;
    this.root.hidden = false;
    this.root.replaceChildren();
    var surface;
    if (this.mode === "popup") {
      surface = createElement(this.document, "dialog", "shopoll__dialog");
      surface.setAttribute("aria-labelledby", this.root.id + "-title");
      var close = createElement(this.document, "button", "shopoll__close", "\u00d7");
      close.type = "button";
      close.setAttribute("aria-label", this.labels.close);
      close.addEventListener("click", function () { self.dismiss(); });
      surface.appendChild(close);
      this.root.appendChild(surface);
      this.dialog = surface;
      if (typeof surface.showModal === "function") surface.showModal();
      else surface.setAttribute("open", "");
      surface.addEventListener("cancel", function (event) {
        event.preventDefault();
        self.dismiss();
      });
    } else {
      surface = createElement(this.document, "section", "shopoll__panel");
      surface.setAttribute("aria-labelledby", this.root.id + "-title");
      this.root.appendChild(surface);
    }
    this.surface = surface;
    var brand = createElement(this.document, "p", "shopoll__eyebrow", textFor(this.definition.eyebrow, this.locale));
    if (brand.textContent) surface.appendChild(brand);
    var title = createElement(this.document, "h2", "shopoll__title", textFor(this.definition.title || this.surveyEnvelope.title, this.locale));
    title.id = this.root.id + "-title";
    surface.appendChild(title);
    var description = createElement(this.document, "p", "shopoll__description", textFor(this.definition.description, this.locale));
    if (description.textContent) surface.appendChild(description);
    this.body = createElement(this.document, "div", "shopoll__body");
    surface.appendChild(this.body);
    this.live = createElement(this.document, "p", "shopoll__status");
    this.live.setAttribute("role", "status");
    this.live.setAttribute("aria-live", "polite");
    surface.appendChild(this.live);
  };

  ShopollSurvey.prototype.findQuestion = function (questionId) {
    return this.questions.find(function (question) { return String(question.id) === String(questionId); });
  };

  ShopollSurvey.prototype.interactiveQuestions = function () {
    return this.questions.filter(function (question) {
      var type = normalizeType(question.type);
      return type !== "welcome" && type !== "end";
    });
  };

  ShopollSurvey.prototype.renderQuestion = function (questionId) {
    var self = this;
    var question = this.findQuestion(questionId);
    if (!question) return this.complete();
    this.currentQuestion = question;
    this.body.replaceChildren();
    this.live.textContent = "";
    var type = normalizeType(question.type);
    var interactive = this.interactiveQuestions();
    var progressIndex = interactive.indexOf(question);
    if (progressIndex >= 0) {
      var progress = createElement(this.document, "p", "shopoll__progress", this.labels.question + " " + (progressIndex + 1) + " / " + interactive.length);
      this.body.appendChild(progress);
    }
    var prompt = createElement(this.document, type === "welcome" || type === "end" ? "h3" : "h3", "shopoll__question", textFor(question.title || question.prompt, this.locale));
    prompt.id = this.root.id + "-question";
    this.body.appendChild(prompt);
    var help = createElement(this.document, "p", "shopoll__help", textFor(question.description || question.helpText, this.locale));
    if (help.textContent) this.body.appendChild(help);

    this.field = null;
    if (type !== "welcome" && type !== "end") this.body.appendChild(this.renderField(question, type));
    var actions = createElement(this.document, "div", "shopoll__actions");
    if (this.history.length) {
      var back = createElement(this.document, "button", "shopoll__button shopoll__button--secondary", this.labels.back);
      back.type = "button";
      back.addEventListener("click", function () { self.goBack(); });
      actions.appendChild(back);
    }
    var nextLabel = textFor(question.buttonLabel, this.locale)
      || (type === "end" || question.isFinal ? this.labels.submit : this.labels.next);
    var next = createElement(this.document, "button", "shopoll__button shopoll__button--primary", nextLabel);
    next.type = "button";
    next.addEventListener("click", function () { self.advance(); });
    actions.appendChild(next);
    this.body.appendChild(actions);
    this.nextButton = next;
    var focusTarget = this.field || next;
    this.global.setTimeout(function () { if (focusTarget && focusTarget.focus) focusTarget.focus(); }, 0);
  };

  ShopollSurvey.prototype.renderField = function (question, type) {
    var self = this;
    var current = this.answers[question.id];
    if (CHOICE_TYPES.indexOf(type) !== -1) {
      var fieldset = createElement(this.document, "fieldset", "shopoll__choices");
      fieldset.setAttribute("aria-labelledby", this.root.id + "-question");
      var options = question.options || [];
      if (!options.length && (type === "nps" || type === "csat" || type === "rating")) {
        var maximum = type === "nps" ? 10 : type === "csat" ? (question.scale || 5) : (question.stars || 5);
        var minimum = type === "nps" ? 0 : 1;
        for (var number = minimum; number <= maximum; number += 1) options.push({ id: String(number), label: String(number), value: number });
      }
      options.forEach(function (option, optionIndex) {
        var optionId = String(option.id || option.value || optionIndex);
        var wrapper = createElement(self.document, "div", "shopoll__choice");
        var input = createElement(self.document, "input", "shopoll__choice-input");
        input.type = type === "multiple_choice" ? "checkbox" : "radio";
        input.name = self.root.id + "-" + question.id;
        input.id = self.root.id + "-" + question.id + "-" + optionId.replace(/[^a-zA-Z0-9_-]/g, "-");
        input.value = optionId;
        input.checked = Array.isArray(current) ? current.indexOf(optionId) !== -1 : String(current) === optionId;
        var label = createElement(self.document, "label", "shopoll__choice-label", textFor(option.label || option.text || option.title, self.locale) || optionId);
        label.setAttribute("for", input.id);
        input.addEventListener("change", function () {
          var value;
          if (type === "multiple_choice") {
            value = Array.prototype.filter.call(fieldset.querySelectorAll("input:checked"), function (item) { return item.type !== "text"; }).map(function (item) { return item.value; });
          } else {
            value = input.value;
          }
          self.answers[question.id] = value;
          self.saveAnswer(question, value, true).catch(function () { self.showError(); });
        });
        wrapper.appendChild(input);
        wrapper.appendChild(label);
        fieldset.appendChild(wrapper);
      });
      if ((type === "nps" || type === "csat") && (question.lowLabel || question.highLabel)) {
        var scaleLabels = createElement(this.document, "div", "shopoll__scale-labels");
        scaleLabels.appendChild(createElement(this.document, "span", "", textFor(question.lowLabel, this.locale)));
        scaleLabels.appendChild(createElement(this.document, "span", "", textFor(question.highLabel, this.locale)));
        fieldset.appendChild(scaleLabels);
      }
      this.field = fieldset.querySelector("input");
      return fieldset;
    }

    if (type === "consent") {
      var consentWrapper = createElement(this.document, "div", "shopoll__consent");
      var checkbox = createElement(this.document, "input");
      checkbox.type = "checkbox";
      checkbox.id = this.root.id + "-" + question.id;
      checkbox.checked = current === true;
      var consentLabel = createElement(this.document, "label", "", textFor(question.consentText || question.title, this.locale));
      consentLabel.setAttribute("for", checkbox.id);
      checkbox.addEventListener("change", function () {
        self.answers[question.id] = checkbox.checked;
        self.saveAnswer(question, checkbox.checked, true).catch(function () { self.showError(); });
      });
      consentWrapper.appendChild(checkbox);
      consentWrapper.appendChild(consentLabel);
      this.field = checkbox;
      return consentWrapper;
    }

    if (type === "contact") {
      var contactWrapper = createElement(this.document, "div", "shopoll__contact");
      var contactCurrent = current && typeof current === "object"
        ? current
        : { value: current || "", consent: false };
      var primaryKind = question.contactKind || (question.collect && question.collect[0]) || "email";
      if (contactCurrent.value) contactCurrent[primaryKind] = contactCurrent.value;
      var fields = question.collect && question.collect.length ? question.collect : [primaryKind];
      var contactInputs = [];
      var consentText = textFor(question.consentText, this.locale);
      var consentInput = null;
      fields.forEach(function (kind) {
        var contactInput = createElement(self.document, "input", "shopoll__text-field");
        contactInput.type = kind === "phone" ? "tel" : "email";
        contactInput.autocomplete = kind;
        contactInput.id = self.root.id + "-" + question.id + "-" + kind;
        contactInput.setAttribute("aria-label", kind === "phone" ? "Phone" : "Email");
        contactInput.value = contactCurrent[kind] || "";
        contactInput.maxLength = clampNumber(question.maxLength || question.max_length, 320, 1, 1000);
        contactInput.addEventListener("input", function () {
          contactCurrent[kind] = contactInput.value;
          contactCurrent.consent = Boolean(consentInput && consentInput.checked);
          self.answers[question.id] = contactCurrent;
        });
        contactInput.addEventListener("blur", function () {
          if (self.isAnswered(contactCurrent) && consentText && contactCurrent.consent) {
            self.saveAnswer(question, contactCurrent, true).catch(function () {});
          }
        });
        contactInputs.push(contactInput);
        contactWrapper.appendChild(contactInput);
      });
      if (consentText) {
        var contactConsent = createElement(this.document, "div", "shopoll__consent");
        consentInput = createElement(this.document, "input");
        consentInput.type = "checkbox";
        consentInput.id = self.root.id + "-" + question.id + "-consent";
        consentInput.checked = contactCurrent.consent === true;
        var contactConsentLabel = createElement(this.document, "label", "", consentText);
        contactConsentLabel.setAttribute("for", consentInput.id);
        consentInput.addEventListener("change", function () {
          contactCurrent.consent = consentInput.checked;
          self.answers[question.id] = contactCurrent;
          var savedValue = contactCurrent.consent ? contactCurrent : { consent: false };
          self.saveAnswer(question, savedValue, true).catch(function () { self.showError(); });
        });
        contactConsent.appendChild(consentInput);
        contactConsent.appendChild(contactConsentLabel);
        contactWrapper.appendChild(contactConsent);
      }
      this.field = contactInputs[0];
      return contactWrapper;
    }

    var input = createElement(this.document, type === "long_text" ? "textarea" : "input", "shopoll__text-field");
    if (type !== "long_text") {
      input.type = "text";
    } else {
      input.rows = 4;
    }
    input.id = this.root.id + "-" + question.id;
    input.setAttribute("aria-labelledby", this.root.id + "-question");
    input.placeholder = textFor(question.placeholder, this.locale);
    input.value = current && typeof current === "object" ? current.value || "" : current || "";
    input.maxLength = clampNumber(question.maxLength || question.max_length, type === "long_text" ? 2000 : 500, 1, 10000);
    input.addEventListener("input", function () {
      self.answers[question.id] = input.value;
      self.global.clearTimeout(self.pendingTextTimer);
      self.pendingTextTimer = self.global.setTimeout(function () {
        self.saveAnswer(question, input.value, true).catch(function () {});
      }, 600);
    });
    input.addEventListener("blur", function () {
      self.global.clearTimeout(self.pendingTextTimer);
      if (input.value) self.saveAnswer(question, input.value, true).catch(function () {});
    });
    this.field = input;
    return input;
  };

  ShopollSurvey.prototype.readValue = function (question) {
    return this.answers[question.id];
  };

  ShopollSurvey.prototype.isAnswered = function (value) {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "boolean") return value;
    if (value && typeof value === "object") return Boolean(value.value || value.email || value.phone);
    return value !== undefined && value !== null && String(value).trim() !== "";
  };

  ShopollSurvey.prototype.saveAnswer = function (question, value, quiet, skipped) {
    var self = this;
    var sessionId = this.session && (this.session.id || this.session.sessionId);
    if (!sessionId) return Promise.reject(new Error("missing_session"));
    var operationSequence = ++this.answerSequence;
    var task = function () {
      if (!quiet) self.setBusy(true);
      return self.request("/sessions/" + encodeURIComponent(sessionId) + "/answers", {
        method: "POST",
        body: {
          schemaVersion: 1,
          questionId: String(question.id),
          ...(skipped ? { skipped: true } : { value: value }),
          resumeToken: self.session && self.session.resumeToken,
          idempotencyKey: "answer:" + sessionId + ":" + question.id + ":" + self.pageToken + ":" + operationSequence + ":" + stableHash(skipped ? "skipped" : value)
        }
      }).finally(function () { if (!quiet) self.setBusy(false); });
    };
    this.saveQueue = this.saveQueue.catch(function () {}).then(task);
    return this.saveQueue;
  };

  ShopollSurvey.prototype.advance = async function () {
    var question = this.currentQuestion;
    var type = normalizeType(question.type);
    if (type === "end") return this.complete();
    var value = this.readValue(question);
    if (type !== "welcome" && question.required !== false && !this.isAnswered(value)) {
      this.showError(this.labels.required);
      if (this.field && this.field.focus) this.field.focus();
      return;
    }
    if (type === "contact" && this.isAnswered(value) && (!textFor(question.consentText, this.locale) || !(value && value.consent === true))) {
      this.showError(this.labels.consentRequired);
      if (this.field && this.field.focus) this.field.focus();
      return;
    }
    try {
      var directive = type === "welcome" ? null : await this.saveAnswer(question, value, false, !this.isAnswered(value));
      var navigation = directive && (directive.navigation || directive);
      if (!navigation || (!navigation.nextQuestionId && !navigation.complete)) navigation = resolveNext(question, value, this.questions);
      if (navigation.complete) return this.complete();
      this.history.push(String(question.id));
      this.renderQuestion(navigation.nextQuestionId);
    } catch (_error) {
      this.showError();
    }
  };

  ShopollSurvey.prototype.goBack = function () {
    var previous = this.history.pop();
    if (previous) this.renderQuestion(previous);
  };

  ShopollSurvey.prototype.complete = async function () {
    var self = this;
    var sessionId = this.session && (this.session.id || this.session.sessionId);
    try {
      this.setBusy(true);
      var result = await this.request("/sessions/" + encodeURIComponent(sessionId) + "/complete", {
        method: "POST",
        body: { schemaVersion: 1, resumeToken: this.session && this.session.resumeToken, idempotencyKey: "complete:" + sessionId }
      });
      this.markFrequency();
      this.resumeRecord(null);
      this.renderComplete(result);
      if (result && result.reward && result.reward.status === "pending") {
        for (var attempt = 0; attempt < 32; attempt += 1) {
          await new Promise(function (resolve) { self.global.setTimeout(resolve, 2500); });
          if (self.root.isConnected === false) break;
          try {
            result = await self.request("/sessions/" + encodeURIComponent(sessionId) + "/complete", {
              method: "POST",
              body: { schemaVersion: 1, resumeToken: self.session && self.session.resumeToken, idempotencyKey: "complete:" + sessionId }
            });
            if (!result.reward || result.reward.status !== "pending") {
              self.renderComplete(result);
              break;
            }
          } catch (_pollError) {
            // Keep the completion visible while retrying transient failures.
          }
        }
      }
    } catch (_error) {
      this.showError();
    } finally {
      this.setBusy(false);
    }
  };

  ShopollSurvey.prototype.renderComplete = function (result) {
    var self = this;
    this.body.replaceChildren();
    var completion = (result && result.completion) || this.definition.completion || {};
    var heading = createElement(this.document, "h3", "shopoll__question", textFor(completion.title, this.locale) || textFor(this.definition.thankYouTitle, this.locale) || this.labels.thankYou);
    this.body.appendChild(heading);
    var message = createElement(this.document, "p", "shopoll__help", textFor(completion.message, this.locale) || textFor(this.definition.thankYouMessage, this.locale));
    if (message.textContent) this.body.appendChild(message);
    var reward = result && result.reward;
    if (reward && reward.code) {
      var rewardBox = createElement(this.document, "div", "shopoll__reward");
      var code = createElement(this.document, "code", "shopoll__reward-code", reward.code);
      rewardBox.appendChild(code);
      this.body.appendChild(rewardBox);
    } else if (reward && reward.status === "pending") {
      this.body.appendChild(createElement(this.document, "p", "shopoll__help", this.labels.rewardPending));
    }
    if (this.mode === "popup") {
      var close = createElement(this.document, "button", "shopoll__button shopoll__button--primary", this.labels.close);
      close.type = "button";
      close.addEventListener("click", function () { self.dismiss(true); });
      this.body.appendChild(close);
      close.focus();
    }
  };

  ShopollSurvey.prototype.setBusy = function (busy) {
    if (this.nextButton) {
      this.nextButton.disabled = busy;
      this.nextButton.setAttribute("aria-busy", busy ? "true" : "false");
    }
  };

  ShopollSurvey.prototype.showError = function (message) {
    this.live.textContent = message || this.labels.error;
    this.live.setAttribute("role", "alert");
  };

  ShopollSurvey.prototype.dismiss = function (completed) {
    if (!completed) this.markFrequency();
    if (this.dialog && this.dialog.open && typeof this.dialog.close === "function") this.dialog.close();
    this.remove();
  };

  ShopollSurvey.prototype.remove = function () {
    this.cleanupTrigger();
    this.root.remove();
  };

  function boot(globalObject) {
    var started = new WeakSet();
    function start(root) {
      if (!root || started.has(root)) return;
      started.add(root);
      new ShopollSurvey(root, globalObject).init();
    }
    function scan(scope) {
      if (scope.matches && scope.matches("[data-shopoll-root]")) start(scope);
      if (scope.querySelectorAll) scope.querySelectorAll("[data-shopoll-root]").forEach(start);
    }
    if (globalObject.document.readyState === "loading") {
      globalObject.document.addEventListener("DOMContentLoaded", function () { scan(globalObject.document); }, { once: true });
    } else {
      scan(globalObject.document);
    }
    globalObject.document.addEventListener("shopify:section:load", function (event) { scan(event.target); });
  }

  return {
    boot: boot,
    clampNumber: clampNumber,
    matchesCondition: matchesCondition,
    normalizeTrigger: normalizeTrigger,
    normalizeType: normalizeType,
    resolveNext: resolveNext,
    sanitizeBase: sanitizeBase,
    stableHash: stableHash,
    textFor: textFor
  };
});
