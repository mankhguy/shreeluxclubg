/* ShreeLuxClubG front-end runtime.
 *
 * The site used to be rendered by a vendor bundle that depended on a backend
 * that was never shipped, so the page had nothing to hydrate with. The static
 * markup in index.html is the original home screen, and this file keeps that
 * markup untouched while making it interactive again.
 */

(function () {
  "use strict";

  var API_BASE = "/api";
  var ACCESS_KEY = "slc_access_token";
  var REFRESH_KEY = "slc_refresh_token";
  var PHONE_KEY = "slc_phone";
  var HIDE_BONUS_KEY = "slc_hideFirstBonus";
  var LOGO = "/assets/svg/shreeluxclubg.svg";

  var PLACEHOLDER_AVATAR =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
        '<circle cx="32" cy="32" r="32" fill="#3c3775"/>' +
        '<circle cx="32" cy="25" r="11" fill="#a08fff"/>' +
        '<path d="M11 61c3-13 11.5-19 21-19s18 6 21 19z" fill="#a08fff"/>' +
        "</svg>"
    );

  /* ------------------------------------------------------------ utilities */

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function on(element, type, handler, options) {
    if (element) element.addEventListener(type, handler, options || false);
  }

  function esc(value) {
    return String(value === null || value === undefined ? "" : value).replace(
      /[&<>"']/g,
      function (character) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        }[character];
      }
    );
  }

  function money(value) {
    var amount = Number(value);
    if (!isFinite(amount)) amount = 0;
    return (
      "\u20B9" +
      amount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    );
  }

  function formatDate(value) {
    if (!value) return "";
    var date = new Date(value);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (error) {
      /* storage can be unavailable in private mode */
    }
  }

  /* --------------------------------------------------------- page scaling */

  function applyFontScale() {
    var width = document.documentElement.clientWidth || window.innerWidth || 375;
    document.documentElement.style.fontSize =
      Math.min(width, 540) / 10 + "px";
  }

  /* ------------------------------------------------------------ image fix */

  var LOCAL_IMAGE_DIRS = [
    { match: "/gamecategory/", dir: "/assets/media/game-categories/" },
    { match: "/lotterycategory/", dir: "/assets/media/site/lotterycategory/" },
    { match: "/banner/", dir: "/assets/media/site/banner/" },
    { match: "/other/", dir: "/assets/media/site/other/" }
  ];

  function resolveImageSource(image) {
    var origin = image.getAttribute("data-origin");
    if (origin) return origin;

    var source = image.getAttribute("src") || "";
    if (!source) return null;
    if (source.charAt(0) === "/") return null;
    if (/^(data:|https?:)/i.test(source)) return null;

    var name = source.split("/").pop();
    for (var index = 0; index < LOCAL_IMAGE_DIRS.length; index += 1) {
      var entry = LOCAL_IMAGE_DIRS[index];
      if (source.indexOf(entry.match) !== -1) return entry.dir + name;
    }
    return null;
  }

  function repairImages(root) {
    $$("img", root).forEach(function (image) {
      if (image.getAttribute("data-slc-image") === "1") return;
      image.setAttribute("data-slc-image", "1");

      var target = resolveImageSource(image);
      if (target && target !== image.getAttribute("src")) {
        image.setAttribute("src", target);
      }

      on(image, "error", function () {
        if (image.getAttribute("data-slc-broken") === "1") return;
        image.setAttribute("data-slc-broken", "1");
        if (image.getAttribute("src") !== PLACEHOLDER_AVATAR) {
          image.setAttribute("src", PLACEHOLDER_AVATAR);
        }
      });
    });
  }

  /* ------------------------------------------------------------ api layer */

  function getToken() {
    return readStorage(ACCESS_KEY);
  }

  function getPhone() {
    return readStorage(PHONE_KEY);
  }

  function saveSession(session, user) {
    if (!session) return;
    writeStorage(ACCESS_KEY, session.access_token || null);
    writeStorage(REFRESH_KEY, session.refresh_token || null);
    writeStorage(PHONE_KEY, (user && user.phone) || readStorage(PHONE_KEY));
  }

  function clearSession() {
    writeStorage(ACCESS_KEY, null);
    writeStorage(REFRESH_KEY, null);
    writeStorage(PHONE_KEY, null);
  }

  function api(path, options) {
    options = options || {};
    var headers = { "Content-Type": "application/json" };
    var token = getToken();
    if (token && options.auth !== false) headers.Authorization = "Bearer " + token;

    var init = { method: options.method || "GET", headers: headers, cache: "no-store" };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);

    return fetch(API_BASE + path, init)
      .then(function (response) {
        return response.text().then(function (text) {
          var data = null;
          if (text) {
            try {
              data = JSON.parse(text);
            } catch (error) {
              data = null;
            }
          }
          if (!response.ok) {
            return {
              ok: false,
              status: response.status,
              error:
                (data && (data.error || data.message)) ||
                "Something went wrong. Please try again."
            };
          }
          return { ok: true, status: response.status, data: data };
        });
      })
      .catch(function () {
        return {
          ok: false,
          status: 0,
          error: "Network problem. Please check your connection and try again."
        };
      });
  }

  var store = {
    user: null,
    profile: null,
    wallet: null,
    transactions: [],
    backendReady: null,
    view: "home",
    route: "home"
  };

  /* --------------------------------------------------------------- toast */

  var activeToast = null;

  function toast(message, duration) {
    if (activeToast && activeToast.parentNode) activeToast.parentNode.removeChild(activeToast);
    var node = document.createElement("div");
    node.className = "slc-toast";
    node.textContent = message;
    document.body.appendChild(node);
    activeToast = node;
    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
      if (activeToast === node) activeToast = null;
    }, duration || 2400);
  }

  /* -------------------------------------------------------------- dialogs */

  function openDialog(options) {
    options = options || {};

    var root = document.createElement("div");
    var bodyHtml = options.bodyHtml || "";
    var actions =
      '<button type="button" class="van-button van-button--primary slc-dialog__ok">' +
      esc(options.okText || "OK") +
      "</button>";

    if (options.cancelText) {
      actions =
        '<button type="button" class="van-button van-button--default slc-dialog__cancel">' +
        esc(options.cancelText) +
        "</button>" +
        actions;
    }

    root.innerHTML =
      '<div class="van-overlay" style="z-index:5000"></div>' +
      '<div role="dialog" tabindex="0" class="van-popup van-popup--center van-dialog" style="z-index:5001">' +
      '<div class="van-dialog__header">' +
      esc(options.title || "") +
      "</div>" +
      '<div class="van-dialog__content">' +
      bodyHtml +
      "</div>" +
      '<div class="van-dialog__footer">' +
      actions +
      "</div>" +
      "</div>";

    document.body.appendChild(root);

    function close() {
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    on($(".slc-dialog__ok", root), "click", function () {
      if (typeof options.onOk === "function") {
        if (options.onOk(root) === false) return;
      }
      close();
    });

    var cancelButton = $(".slc-dialog__cancel", root);
    if (cancelButton) {
      on(cancelButton, "click", function () {
        if (typeof options.onCancel === "function") options.onCancel();
        close();
      });
    }

    if (options.onOpen) options.onOpen(root);
    return { close: close, root: root };
  }

  function openAmountDialog(options) {
    return openDialog({
      title: options.title,
      bodyHtml:
        '<div class="slc-form">' +
        '<label class="slc-field"><span class="slc-field__label">' +
        esc(options.label) +
        '</span><span class="slc-field__box">' +
        '<span class="slc-field__prefix">\u20B9</span>' +
        '<input class="slc-field__input" type="number" inputmode="decimal" min="' +
        esc(options.min) +
        '" max="' +
        esc(options.max) +
        '" step="1" placeholder="' +
        esc(options.placeholder || "") +
        '" value="' +
        esc(options.value || "") +
        '" /></span></label>' +
        '<p class="slc-form__hint">' +
        esc(options.hint || "") +
        "</p>" +
        '<p class="slc-form__error" hidden></p>' +
        "</div>",
      okText: options.okText,
      cancelText: "Cancel",
      onOpen: function (root) {
        var input = $(".slc-field__input", root);
        if (input) {
          window.setTimeout(function () {
            input.focus();
          }, 120);
        }
      },
      onOk: function (root) {
        var input = $(".slc-field__input", root);
        var errorNode = $(".slc-form__error", root);
        var amount = Number(input ? input.value : 0);
        var problem = null;

        if (!isFinite(amount) || amount <= 0) {
          problem = "Enter a valid amount.";
        } else if (amount < options.min) {
          problem = "The minimum amount is " + money(options.min) + ".";
        } else if (amount > options.max) {
          problem = "The maximum amount is " + money(options.max) + ".";
        }

        if (problem) {
          if (errorNode) {
            errorNode.textContent = problem;
            errorNode.hidden = false;
          }
          return false;
        }

        options.onSubmit(amount);
        return true;
      }
    });
  }

  /* ----------------------------------------------------------- navigation */

  var ROUTES = {
    home: "home",
    wallet: "wallet",
    activity: "activity",
    promotions: "activity",
    mine: "mine",
    settings: "settings",
    notices: "notices",
    terms: "terms",
    support: "support"
  };

  function currentRoute() {
    var hash = (window.location.hash || "").replace(/^#\/?/, "");
    var name = hash.split("?")[0];
    return Object.prototype.hasOwnProperty.call(ROUTES, name) ? name : "home";
  }

  function navigate(name, replace) {
    var target = "#/" + name;
    if (window.location.hash === target) {
      render();
      return;
    }
    if (replace) window.location.replace(target);
    else window.location.hash = target;
  }

  function showView(name) {
    store.view = name;

    var home = $("#home");
    if (home) home.hidden = name !== "home";

    $$(".slc-view").forEach(function (view) {
      view.hidden = view.getAttribute("data-view") !== name;
    });

    $$(".float").forEach(function (node) {
      node.hidden = name !== "home";
    });

    updateTabbar();
    window.scrollTo(0, 0);

    if (name === "wallet") loadWallet().then(paintWallet);
    if (name === "activity") paintPromotions();
  }

  function updateTabbar() {
    var route = store.route;
    var mapping = { home: "home", activity: "activity", wallet: "wallet", mine: "account" };
    var wanted = mapping[route] || (route === "promotions" ? "promotion" : "");

    $$(".tabbar__items-tab").forEach(function (item) {
      var label = (item.textContent || "").trim().toLowerCase();
      item.classList.toggle("active", Boolean(wanted) && label === wanted);
    });
  }

  function render() {
    var route = currentRoute();

    if (route === "home" && window.location.hash === "#/login") route = "home";

    store.route = route;
    showView(ROUTES[route] || "home");

    if (window.location.hash === "#/login" || window.location.hash === "#/register") {
      openAuth(window.location.hash === "#/register" ? "register" : "login");
      navigate("home", true);
    }
  }

  /* ------------------------------------------------------------ auth state */

  function isLoggedIn() {
    return Boolean(getToken());
  }

  function requireLogin() {
    if (isLoggedIn()) return true;
    openAuth("login");
    return false;
  }

  function refreshSession() {
    var refreshToken = readStorage(REFRESH_KEY);
    if (!refreshToken) return Promise.resolve(false);

    return api("/auth/refresh", {
      method: "POST",
      auth: false,
      body: { refresh_token: refreshToken }
    }).then(function (result) {
      if (!result.ok || !result.data || !result.data.session) return false;
      saveSession(result.data.session, result.data.user);
      return true;
    });
  }

  function loadProfile() {
    if (!isLoggedIn()) return Promise.resolve(false);
    return api("/profile/me").then(function (result) {
      if (result.ok && result.data && result.data.profile) {
        store.profile = result.data.profile;
        store.user = { id: store.profile.id, phone: getPhone() };
        return true;
      }
      if (result.status === 401) clearSession();
      return false;
    });
  }

  function loadWallet() {
    if (!isLoggedIn()) {
      store.wallet = null;
      store.transactions = [];
      return Promise.resolve(false);
    }
    return api("/wallet/summary").then(function (result) {
      if (result.ok && result.data) {
        store.wallet = result.data.wallet || null;
        store.transactions = result.data.transactions || [];
        return true;
      }
      if (result.status === 401) clearSession();
      return false;
    });
  }

  function restoreSession(retried) {
    if (!isLoggedIn()) return Promise.resolve(false);

    return api("/profile/me").then(function (result) {
      if (result.ok && result.data && result.data.profile) {
        store.profile = result.data.profile;
        store.user = { id: store.profile.id, phone: getPhone() };
        return true;
      }
      if (result.status === 401 && !retried) {
        return refreshSession().then(function (refreshed) {
          if (refreshed) return restoreSession(true);
          clearSession();
          return false;
        });
      }
      if (result.status === 401) clearSession();
      return false;
    });
  }

  function logout() {
    openDialog({
      title: "Log out",
      bodyHtml: "<p>Do you want to log out of this device?</p>",
      okText: "Log out",
      cancelText: "Cancel",
      onOk: function () {
        clearSession();
        store.profile = null;
        store.user = null;
        store.wallet = null;
        store.transactions = [];
        paintChrome();
        toast("You have been logged out.");
        navigate("home");
      }
    });
  }

  /* ------------------------------------------------------------ phone help */

  function normalizePhoneInput(value) {
    var digits = String(value === null || value === undefined ? "" : value).replace(/\D/g, "");
    if (digits.length === 12 && digits.indexOf("91") === 0) digits = digits.slice(2);
    else if (digits.length === 11 && digits.charAt(0) === "0") digits = digits.slice(1);
    return digits;
  }

  function isValidPhone(digits) {
    return /^[6-9]\d{9}$/.test(digits);
  }

  /* ---------------------------------------------------------- auth overlay */

  var authTabs = null;
  var authForms = null;

  function openAuth(tab) {
    var overlay = $("#slc-auth");
    if (!overlay) return;

    overlay.hidden = false;
    setAuthTab(tab === "register" ? "register" : "login");

    var notice = $("[data-auth-notice]", overlay);
    if (notice) {
      var ready = store.backendReady !== false;
      notice.hidden = ready;
      notice.innerHTML = ready
        ? ""
        : "The server is not connected yet. Add SUPABASE_URL and SUPABASE_ANON_KEY to your Vercel project, then redeploy.";
    }
  }

  function closeAuth() {
    var overlay = $("#slc-auth");
    if (overlay) overlay.hidden = true;
  }

  function setAuthTab(tab) {
    authTabs.forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-auth-tab") === tab);
    });
    authForms.forEach(function (form) {
      form.hidden = form.getAttribute("data-auth-form") !== tab;
    });
    var first = $("input", $('[data-auth-form="' + tab + '"]'));
    if (first && !$("#slc-auth").hidden) {
      window.setTimeout(function () {
        first.focus();
      }, 120);
    }
  }

  function showFormError(form, message) {
    var node = $(".slc-form__error", form);
    if (!node) return;
    node.textContent = message;
    node.hidden = !message;
  }

  function buildAuthOverlay() {
    var overlay = document.createElement("div");
    overlay.className = "slc-auth";
    overlay.id = "slc-auth";
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="slc-auth__sheet">' +
      '<button type="button" class="slc-auth__close" data-auth-close aria-label="Close">\u00D7</button>' +
      '<div class="slc-auth__brand">ShreeLuxClubG</div>' +
      '<p class="slc-auth__sub">Sign in with your mobile number and password</p>' +
      '<div class="slc-tabs">' +
      '<button type="button" class="slc-tab is-active" data-auth-tab="login">Login</button>' +
      '<button type="button" class="slc-tab" data-auth-tab="register">Register</button>' +
      "</div>" +
      '<p class="slc-form__error" data-auth-notice hidden></p>' +
      '<form class="slc-form slc-auth__form" data-auth-form="login" novalidate>' +
      '<label class="slc-field"><span class="slc-field__label">Mobile number</span>' +
      '<span class="slc-field__box"><span class="slc-field__prefix">+91</span>' +
      '<input class="slc-field__input" name="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="12" placeholder="10 digit mobile number" /></span></label>' +
      '<label class="slc-field"><span class="slc-field__label">Password</span>' +
      '<span class="slc-field__box"><input class="slc-field__input" name="password" type="password" autocomplete="current-password" placeholder="Your password" /></span></label>' +
      '<p class="slc-form__error" hidden></p>' +
      '<button type="submit" class="slc-btn slc-btn--primary slc-btn--block">Login</button>' +
      '<p class="slc-auth__foot">New here? <button type="button" class="slc-link" data-auth-switch="register">Create an account</button></p>' +
      "</form>" +
      '<form class="slc-form slc-auth__form" data-auth-form="register" hidden novalidate>' +
      '<label class="slc-field"><span class="slc-field__label">Mobile number</span>' +
      '<span class="slc-field__box"><span class="slc-field__prefix">+91</span>' +
      '<input class="slc-field__input" name="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="12" placeholder="10 digit mobile number" /></span></label>' +
      '<label class="slc-field"><span class="slc-field__label">Display name (optional)</span>' +
      '<span class="slc-field__box"><input class="slc-field__input" name="display_name" type="text" maxlength="60" placeholder="How should we call you?" /></span></label>' +
      '<label class="slc-field"><span class="slc-field__label">Password</span>' +
      '<span class="slc-field__box"><input class="slc-field__input" name="password" type="password" autocomplete="new-password" placeholder="At least 8 characters" /></span></label>' +
      '<label class="slc-field"><span class="slc-field__label">Confirm password</span>' +
      '<span class="slc-field__box"><input class="slc-field__input" name="confirm_password" type="password" autocomplete="new-password" placeholder="Repeat your password" /></span></label>' +
      '<p class="slc-form__error" hidden></p>' +
      '<button type="submit" class="slc-btn slc-btn--primary slc-btn--block">Create account</button>' +
      '<p class="slc-auth__foot">Already registered? <button type="button" class="slc-link" data-auth-switch="login">Login</button></p>' +
      '<p class="slc-auth__legal">ShreeLuxClubG is for adults aged 18 and above. Gambling can be addictive, please play rationally.</p>' +
      "</form>" +
      "</div>";

    document.body.appendChild(overlay);

    authTabs = $$("[data-auth-tab]", overlay);
    authForms = $$("[data-auth-form]", overlay);

    authTabs.forEach(function (button) {
      on(button, "click", function () {
        setAuthTab(button.getAttribute("data-auth-tab"));
      });
    });

    $$("[data-auth-switch]", overlay).forEach(function (button) {
      on(button, "click", function () {
        setAuthTab(button.getAttribute("data-auth-switch"));
      });
    });

    on($("[data-auth-close]", overlay), "click", closeAuth);
    on(overlay, "click", function (event) {
      if (event.target === overlay) closeAuth();
    });

    on($('[data-auth-form="login"]', overlay), "submit", function (event) {
      event.preventDefault();
      submitLogin(this);
    });

    on($('[data-auth-form="register"]', overlay), "submit", function (event) {
      event.preventDefault();
      submitRegister(this);
    });
  }

  function afterLogin(message) {
    store.profile = null;
    return loadProfile()
      .then(function () {
        return loadWallet();
      })
      .then(function () {
        paintChrome();
        closeAuth();
        toast(message || "Welcome back!");
        if (!readStorage(HIDE_BONUS_KEY)) {
          window.setTimeout(showBonusDialog, 900);
        }
      });
  }

  function submitLogin(form) {
    var phone = normalizePhoneInput(form.phone.value);
    var password = form.password.value || "";

    if (!isValidPhone(phone)) {
      showFormError(form, "Enter a valid 10 digit mobile number.");
      return;
    }
    if (password.length < 8) {
      showFormError(form, "Password must be at least 8 characters.");
      return;
    }

    showFormError(form, "");
    var button = $("button[type=submit]", form);
    if (button) button.disabled = true;

    api("/auth/login", {
      method: "POST",
      auth: false,
      body: { phone: phone, password: password }
    })
      .then(function (result) {
        if (!result.ok) {
          showFormError(form, result.error);
          return null;
        }
        saveSession(result.data.session, result.data.user);
        writeStorage(PHONE_KEY, phone);
        return afterLogin("Welcome back!");
      })
      .then(function () {
        if (button) button.disabled = false;
      });
  }

  function submitRegister(form) {
    var phone = normalizePhoneInput(form.phone.value);
    var displayName = (form.display_name.value || "").trim();
    var password = form.password.value || "";
    var confirm = form.confirm_password.value || "";

    if (!isValidPhone(phone)) {
      showFormError(form, "Enter a valid 10 digit mobile number.");
      return;
    }
    if (password.length < 8) {
      showFormError(form, "Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      showFormError(form, "Both passwords must match.");
      return;
    }

    showFormError(form, "");
    var button = $("button[type=submit]", form);
    if (button) button.disabled = true;

    api("/auth/signup", {
      method: "POST",
      auth: false,
      body: { phone: phone, password: password, display_name: displayName }
    })
      .then(function (result) {
        if (!result.ok) {
          showFormError(form, result.error);
          return null;
        }

        writeStorage(PHONE_KEY, phone);

        if (result.data && result.data.session) {
          saveSession(result.data.session, result.data.user);
          return afterLogin("Your account is ready.");
        }

        setAuthTab("login");
        var loginForm = $('[data-auth-form="login"]');
        if (loginForm) {
          loginForm.phone.value = phone;
          showFormError(loginForm, "Account created. Please log in.");
        }
        return null;
      })
      .then(function () {
        if (button) button.disabled = false;
      });
  }

  /* --------------------------------------------------------------- views */

  var PROMOTIONS = [
    {
      id: "first-deposit",
      title: "First deposit bonus",
      text: "Deposit for the first time and receive an extra bonus of up to \u20B910,000.00, credited after your first successful deposit.",
      icon: "/assets/png/coinStack-85b61210.webp",
      deposit: true
    },
    {
      id: "daily-signin",
      title: "Daily sign in",
      text: "Open the app every day and collect your daily sign-in reward. The reward grows with a longer streak.",
      icon: "/assets/png/promotion-af22c0fe.webp"
    },
    {
      id: "super-jackpot",
      title: "Super Jackpot",
      text: "Visit the Super Jackpot page to claim your reward and try your luck on the biggest prize pool.",
      icon: "/assets/png/superjackpotHome-72bbeb43.webp"
    },
    {
      id: "championship",
      title: "Championship",
      text: "Climb the daily earnings chart and share the prize pool with the top players.",
      icon: "/assets/png/DailyProfitRankStage-397321b9.webp"
    },
    {
      id: "point-mall",
      title: "Point Mall",
      text: "Collect points from your activity and redeem them in the Point Mall.",
      icon: "/assets/png/rankWreath-733d7a66.webp"
    },
    {
      id: "invitation",
      title: "Invitation bonus",
      text: "Share your invitation link and earn a bonus when your friends join and start playing.",
      icon: "/assets/png/activity_nor-92e1ebc6.webp"
    }
  ];

  var BONUS_TIERS = [
    { deposit: 100, bonus: 20 },
    { deposit: 300, bonus: 60 },
    { deposit: 1000, bonus: 150 },
    { deposit: 3000, bonus: 300 },
    { deposit: 10000, bonus: 600 },
    { deposit: 30000, bonus: 2000 },
    { deposit: 100000, bonus: 5000 },
    { deposit: 200000, bonus: 10000 }
  ];

  var NOTICES = [
    {
      title: "Performance and login tips",
      body: "If you experience slow performance or login issues, please ensure a stable internet connection, reinstall the app, or use our official website link for a smoother experience."
    },
    {
      title: "Website and game catalogue update",
      body: "ShreeLuxClubG is preparing a new catalogue of games and features. Account and game services will be available as soon as the setup is complete."
    }
  ];

  var TERMS = [
    "ShreeLuxClubG is preparing its own game catalogue. Some games may not be available yet.",
    "Account, wallet and game services are enabled progressively while the platform is being set up.",
    "ShreeLuxClubG is for adults aged 18 and above.",
    "Gambling can be addictive, please play rationally and set your own limits.",
    "Keep your password private. You are responsible for activity on your account.",
    "Deposit and withdrawal requests are reviewed before they are settled."
  ];

  function viewShell(route, title, inner) {
    return (
      '<section class="slc-view" data-view="' +
      route +
      '" hidden>' +
      '<header class="slc-topbar">' +
      '<button type="button" class="slc-topbar__back" data-back aria-label="Back">\u2039</button>' +
      '<h1 class="slc-topbar__title">' +
      esc(title) +
      "</h1>" +
      '<span class="slc-topbar__tail"></span>' +
      "</header>" +
      inner +
      "</section>"
    );
  }

  function row(action, label, icon, value, extraClass) {
    return (
      '<button type="button" class="slc-row' +
      (extraClass ? " " + extraClass : "") +
      '" data-action="' +
      esc(action) +
      '">' +
      (icon ? '<img class="slc-row__icon" src="' + esc(icon) + '" alt="" />' : '<span class="slc-row__icon"></span>') +
      '<span class="slc-row__label">' +
      esc(label) +
      "</span>" +
      '<span class="slc-row__value" data-bind="' +
      esc(action) +
      '-value">' +
      esc(value || "") +
      "</span>" +
      '<span class="slc-row__arrow">\u203A</span>' +
      "</button>"
    );
  }

  function buildViews() {
    var app = $("#app");
    if (!app) return;

    var holder = document.createElement("div");
    holder.innerHTML =
      viewShell(
        "wallet",
        "Wallet",
        '<div class="slc-card slc-balance">' +
          '<p class="slc-balance__label">Total balance</p>' +
          '<p class="slc-balance__value" data-bind="wallet-balance">' +
          money(0) +
          "</p>" +
          '<p class="slc-balance__meta" data-bind="wallet-meta"></p>' +
          '<div class="slc-actions">' +
          '<button type="button" class="slc-btn slc-btn--primary" data-action="deposit">Deposit</button>' +
          '<button type="button" class="slc-btn slc-btn--ghost" data-action="withdraw">Withdraw</button>' +
          "</div>" +
          "</div>" +
          '<div class="slc-card">' +
          '<div class="slc-card__head">' +
          '<h2 class="slc-card__title">Transaction history</h2>' +
          '<button type="button" class="slc-link" data-action="reload-wallet">Refresh</button>' +
          "</div>" +
          '<div class="slc-list" data-bind="wallet-transactions"></div>' +
          "</div>"
      ) +
      viewShell(
        "activity",
        "Activity",
        '<div class="slc-tabs">' +
          '<button type="button" class="slc-tab is-active" data-promo-filter="all">All</button>' +
          '<button type="button" class="slc-tab" data-promo-filter="deposit">Deposit</button>' +
          '<button type="button" class="slc-tab" data-promo-filter="reward">Rewards</button>' +
          "</div>" +
          '<div class="slc-promos" data-bind="promotions"></div>'
      ) +
      viewShell(
        "mine",
        "Account",
        '<div class="slc-card slc-user" data-bind="user-card"></div>' +
          '<div class="slc-card"><div class="slc-rows">' +
          row("go-wallet", "Wallet", "/assets/png/wallet_nor-da2e681e.webp") +
          row("go-activity", "Promotions", "/assets/png/promotion-af22c0fe.webp") +
          row("go-notices", "Notices", "/assets/svg/noticeBarSpeaker-0ddc3721.svg") +
          row("go-terms", "Terms and rules", "/assets/svg/shreeluxclubg-logo.svg") +
          row("go-settings", "Settings", "/assets/media/site/other/h5setting_20260325173212e2c7.png") +
          row("go-support", "Customer service", "/assets/png/icon_sevice-f4a1b283.webp") +
          "</div></div>" +
          '<div class="slc-card" data-bind="logout-card" hidden><div class="slc-rows">' +
          row("logout", "Log out", "/assets/png/mine_nor-50322d77.webp", "", "slc-row--danger") +
          "</div></div>"
      ) +
      viewShell(
        "settings",
        "Settings",
        '<div class="slc-card">' +
          '<div class="slc-card__head"><h2 class="slc-card__title">Account</h2></div>' +
          '<div class="slc-rows">' +
          row("edit-name", "Display name") +
          row("edit-phone", "Mobile number") +
          row("change-password", "Change password") +
          "</div></div>" +
          '<div class="slc-card">' +
          '<div class="slc-card__head"><h2 class="slc-card__title">Preferences</h2></div>' +
          '<div class="slc-rows">' +
          row("language", "Language", "", "EN") +
          row("notifications", "Notifications", "", "On") +
          row("clear-cache", "Clear local cache") +
          "</div></div>"
      ) +
      viewShell(
        "notices",
        "Notices",
        '<div class="slc-card"><div class="slc-list" data-bind="notices"></div></div>'
      ) +
      viewShell(
        "terms",
        "Terms and rules",
        '<div class="slc-card"><div class="slc-card__body" data-bind="terms"></div></div>' +
          '<div class="slc-card slc-banner">Gambling can be addictive, please play rationally. ShreeLuxClubG is for adults aged 18 and above.</div>'
      ) +
      viewShell(
        "support",
        "Customer service",
        '<div class="slc-card"><div class="slc-card__body" data-bind="support"></div></div>'
      );

    while (holder.firstChild) app.appendChild(holder.firstChild);

    bindViewActions();
    paintStaticLists();
  }

  function bindViewActions() {
    $$(".slc-topbar__back").forEach(function (button) {
      on(button, "click", function () {
        navigate("home");
      });
    });

    $$("[data-nav], [data-action]").forEach(function (node) {
      var action = node.getAttribute("data-action");
      if (!action) return;
      if (node.getAttribute("data-slc-bound") === "1") return;
      node.setAttribute("data-slc-bound", "1");

      on(node, "click", function () {
        handleAction(action);
      });
    });

    $$("[data-promo-filter]").forEach(function (button) {
      on(button, "click", function () {
        $$("[data-promo-filter]").forEach(function (other) {
          other.classList.toggle("is-active", other === button);
        });
        paintPromotions(button.getAttribute("data-promo-filter"));
      });
    });
  }

  function handleAction(action) {
    switch (action) {
      case "deposit":
        openDepositDialog();
        break;
      case "withdraw":
        openWithdrawDialog();
        break;
      case "reload-wallet":
        if (!requireLogin()) return;
        toast("Refreshing your wallet...");
        loadWallet().then(function () {
          paintWallet();
          toast("Wallet updated.");
        });
        break;
      case "go-wallet":
        navigate("wallet");
        break;
      case "go-activity":
        navigate("promotions");
        break;
      case "go-notices":
        navigate("notices");
        break;
      case "go-terms":
        navigate("terms");
        break;
      case "go-settings":
        navigate("settings");
        break;
      case "go-support":
        navigate("support");
        break;
      case "logout":
        logout();
        break;
      case "edit-name":
        openDisplayNameDialog();
        break;
      case "edit-phone":
        toast("Your mobile number cannot be changed. Contact customer service for help.");
        break;
      case "change-password":
        openPasswordDialog();
        break;
      case "language":
        toast("Only English is available right now.");
        break;
      case "notifications":
        toast("Notification permission is controlled by your browser settings.");
        break;
      case "clear-cache":
        clearLocalCache();
        break;
      default:
        break;
    }
  }

  function paintStaticLists() {
    var notices = $('[data-bind="notices"]');
    if (notices) {
      notices.innerHTML = NOTICES.map(function (notice) {
        return (
          '<button type="button" class="slc-list-item slc-row" data-notice="' +
          esc(notice.title) +
          '">' +
          '<span class="slc-list-item__main">' +
          '<p class="slc-list-item__title">' +
          esc(notice.title) +
          "</p>" +
          '<p class="slc-list-item__meta">Tap to read</p>' +
          "</span>" +
          '<span class="slc-row__arrow">\u203A</span>' +
          "</button>"
        );
      }).join("");

      $$("[data-notice]", notices).forEach(function (button) {
        on(button, "click", function () {
          var title = button.getAttribute("data-notice");
          var notice = NOTICES.filter(function (item) {
            return item.title === title;
          })[0];
          if (!notice) return;
          openDialog({
            title: notice.title,
            bodyHtml: "<p>" + esc(notice.body) + "</p>"
          });
        });
      });
    }

    var terms = $('[data-bind="terms"]');
    if (terms) {
      terms.innerHTML =
        "<ul style=\"margin:0;padding-left:0.5rem;line-height:1.7\">" +
        TERMS.map(function (item) {
          return "<li>" + esc(item) + "</li>";
        }).join("") +
        "</ul>";
    }

    var support = $('[data-bind="support"]');
    if (support) {
      support.innerHTML =
        "<p>Customer service is being set up and will appear here.</p>" +
        "<p>Until then you can reach us from the in-app chat, or send an email to <b>support@shreeluxclubg.com</b>.</p>" +
        "<p>We usually reply within 24 hours.</p>";
    }

    paintPromotions("all");
  }

  function paintPromotions(filter) {
    var list = $('[data-bind="promotions"]');
    if (!list) return;

    var active = filter || "all";
    var items = PROMOTIONS.filter(function (promotion) {
      if (active === "deposit") return promotion.deposit === true;
      if (active === "reward") return promotion.deposit !== true;
      return true;
    });

    list.innerHTML = items
      .map(function (promotion) {
        return (
          '<div class="slc-card slc-promo">' +
          '<img class="slc-promo__icon" src="' +
          esc(promotion.icon) +
          '" alt="" />' +
          '<div class="slc-promo__body">' +
          '<h3 class="slc-promo__title">' +
          esc(promotion.title) +
          "</h3>" +
          '<p class="slc-promo__text">' +
          esc(promotion.text) +
          "</p>" +
          '<button type="button" class="slc-btn slc-btn--small slc-btn--primary" data-promo="' +
          esc(promotion.id) +
          '">' +
          (promotion.deposit ? "Deposit now" : "Details") +
          "</button>" +
          "</div></div>"
        );
      })
      .join("");

    repairImages(list);

    $$("[data-promo]", list).forEach(function (button) {
      on(button, "click", function () {
        var promotion = PROMOTIONS.filter(function (item) {
          return item.id === button.getAttribute("data-promo");
        })[0];
        if (!promotion) return;
        openPromotionDialog(promotion);
      });
    });
  }

  function openPromotionDialog(promotion) {
    var body = "<p>" + esc(promotion.text) + "</p>";

    if (promotion.deposit) {
      body +=
        '<div class="slc-list" style="padding:0">' +
        BONUS_TIERS.slice()
          .reverse()
          .map(function (tier) {
            return (
              '<div class="slc-list-item">' +
              '<span class="slc-list-item__main">' +
              '<p class="slc-list-item__title">First deposit ' +
              money(tier.deposit) +
              "</p>" +
              '<p class="slc-list-item__meta">Bonus credited after a successful deposit</p>' +
              "</span>" +
              '<span class="slc-list-item__amount slc-list-item__amount--in">+' +
              money(tier.bonus) +
              "</span>" +
              "</div>"
            );
          })
          .join("") +
        "</div>";
    }

    openDialog({
      title: promotion.title,
      bodyHtml: body,
      okText: promotion.deposit ? "Deposit now" : "OK",
      cancelText: promotion.deposit ? "Close" : null,
      onOk: function () {
        if (promotion.deposit) window.setTimeout(openDepositDialog, 60);
      }
    });
  }

  /* -------------------------------------------------------------- painting */

  function paintWallet() {
    var balance = $('[data-bind="wallet-balance"]');
    var meta = $('[data-bind="wallet-meta"]');
    var list = $('[data-bind="wallet-transactions"]');

    if (!isLoggedIn()) {
      if (balance) balance.textContent = money(0);
      if (meta) meta.textContent = "Log in to see your balance and transactions.";
      if (list) {
        list.innerHTML =
          '<div class="slc-empty">Log in to see your wallet.<br /><button type="button" class="slc-btn slc-btn--primary slc-btn--small slc-empty__action" data-action="go-login">Login / Register</button></div>';
        var loginButton = $('[data-action="go-login"]', list);
        on(loginButton, "click", function () {
          openAuth("login");
        });
      }
      return;
    }

    if (balance) {
      balance.textContent = money(store.wallet ? store.wallet.balance : 0);
    }
    if (meta) {
      meta.textContent = store.wallet
        ? "Currency: " + (store.wallet.currency || "INR")
        : "Wallet is not configured on the server yet.";
    }

    if (!list) return;

    if (!store.transactions.length) {
      list.innerHTML = '<div class="slc-empty">No transactions yet.</div>';
      return;
    }

    list.innerHTML = store.transactions
      .map(function (transaction) {
        var incoming = transaction.kind === "deposit" || transaction.kind === "bonus";
        return (
          '<div class="slc-list-item">' +
          '<span class="slc-list-item__main">' +
          '<p class="slc-list-item__title">' +
          esc(transactionLabel(transaction.kind)) +
          '<span class="slc-badge slc-badge--' +
          esc(transaction.status) +
          '">' +
          esc(transaction.status) +
          "</span></p>" +
          '<p class="slc-list-item__meta">' +
          esc(formatDate(transaction.created_at)) +
          "</p>" +
          "</span>" +
          '<span class="slc-list-item__amount slc-list-item__amount--' +
          (incoming ? "in" : "out") +
          '">' +
          (incoming ? "+" : "-") +
          money(transaction.amount) +
          "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function transactionLabel(kind) {
    if (kind === "deposit") return "Deposit";
    if (kind === "withdraw") return "Withdrawal";
    if (kind === "bonus") return "Bonus";
    return "Adjustment";
  }

  function paintChrome() {
    var chip = $(".purple-home__nav-chip__amount");
    var addIcon = $(".purple-home__nav-chip__add");
    var navBackground = $(".purple-home__nav-bg");
    var chipNode = $(".purple-home__nav-chip");

    if (isLoggedIn()) {
      if (chip) chip.textContent = money(store.wallet ? store.wallet.balance : 0);
      if (addIcon) addIcon.hidden = false;
      if (navBackground) navBackground.hidden = false;
      if (chipNode) chipNode.setAttribute("data-slc-action", "wallet");
    } else {
      if (chip) chip.textContent = "Login";
      if (addIcon) addIcon.hidden = true;
      if (navBackground) navBackground.hidden = true;
      if (chipNode) chipNode.setAttribute("data-slc-action", "login");
    }

    var userCard = $('[data-bind="user-card"]');
    if (userCard) {
      if (isLoggedIn()) {
        var name =
          (store.profile && store.profile.display_name) ||
          getPhone() ||
          "ShreeLuxClubG player";
        userCard.innerHTML =
          '<img class="slc-user__avatar" src="' +
          LOGO +
          '" alt="" />' +
          '<div class="slc-user__body">' +
          '<p class="slc-user__name">' +
          esc(name) +
          "</p>" +
          '<p class="slc-user__uid">Mobile: ' +
          esc(getPhone() ? "+91 " + getPhone() : "-") +
          "</p>" +
          '<p class="slc-user__meta">Member since ' +
          esc(
            store.profile && store.profile.created_at
              ? formatDate(store.profile.created_at)
              : "-"
          ) +
          "</p>" +
          "</div>";
      } else {
        userCard.innerHTML =
          '<img class="slc-user__avatar" src="' +
          LOGO +
          '" alt="" />' +
          '<div class="slc-user__body">' +
          '<p class="slc-user__name">Guest</p>' +
          '<p class="slc-user__uid">Log in with your mobile number and password.</p>' +
          '<button type="button" class="slc-btn slc-btn--primary slc-btn--small" style="margin-top:0.2rem" data-action="open-auth">Login / Register</button>' +
          "</div>";
      }
      var openAuthButton = $('[data-action="open-auth"]', userCard);
      on(openAuthButton, "click", function () {
        openAuth("login");
      });
    }

    var logoutCard = $('[data-bind="logout-card"]');
    if (logoutCard) logoutCard.hidden = !isLoggedIn();

    var nameValue = $('[data-bind="edit-name-value"]');
    if (nameValue) {
      nameValue.textContent =
        (store.profile && store.profile.display_name) || (isLoggedIn() ? "Not set" : "-");
    }

    var phoneValue = $('[data-bind="edit-phone-value"]');
    if (phoneValue) phoneValue.textContent = getPhone() ? "+91 " + getPhone() : "-";
  }

  /* ----------------------------------------------------------- wallet flow */

  function openDepositDialog() {
    if (!requireLogin()) return;

    openAmountDialog({
      title: "Deposit",
      label: "Deposit amount",
      min: 100,
      max: 500000,
      placeholder: "100",
      hint: "Minimum deposit is " + money(100) + ". Your request is reviewed and settled by our team.",
      okText: "Request deposit",
      onSubmit: function (amount) {
        api("/wallet/deposit", { method: "POST", body: { amount: amount } }).then(function (result) {
          if (!result.ok) {
            toast(result.error);
            return;
          }
          toast("Deposit request created. We will confirm it shortly.");
          loadWallet().then(function () {
            paintWallet();
            paintChrome();
          });
        });
      }
    });
  }

  function openWithdrawDialog() {
    if (!requireLogin()) return;

    var available = store.wallet ? Number(store.wallet.balance) : 0;

    if (!(available > 0)) {
      openDialog({
        title: "Withdraw",
        bodyHtml: "<p>You do not have a withdrawable balance yet. Please deposit first.</p>",
        okText: "Deposit",
        cancelText: "Close",
        onOk: function () {
          window.setTimeout(openDepositDialog, 60);
        }
      });
      return;
    }

    openAmountDialog({
      title: "Withdraw",
      label: "Withdrawal amount",
      min: 100,
      max: available,
      hint: "Available balance " + money(available) + ". Requests are reviewed before payout.",
      okText: "Request withdrawal",
      onSubmit: function (amount) {
        api("/wallet/withdraw", { method: "POST", body: { amount: amount } }).then(function (result) {
          if (!result.ok) {
            toast(result.error);
            return;
          }
          toast("Withdrawal request created.");
          loadWallet().then(function () {
            paintWallet();
            paintChrome();
          });
        });
      }
    });
  }

  /* ------------------------------------------------------------- settings */

  function openDisplayNameDialog() {
    if (!requireLogin()) return;

    openDialog({
      title: "Display name",
      bodyHtml:
        '<div class="slc-form">' +
        '<label class="slc-field"><span class="slc-field__label">Display name</span>' +
        '<span class="slc-field__box"><input class="slc-field__input" type="text" maxlength="60" value="' +
        esc((store.profile && store.profile.display_name) || "") +
        '" placeholder="Your name" /></span></label>' +
        '<p class="slc-form__error" hidden></p>' +
        "</div>",
      okText: "Save",
      cancelText: "Cancel",
      onOk: function (root) {
        var input = $(".slc-field__input", root);
        var error = $(".slc-form__error", root);
        var value = (input ? input.value : "").trim();

        if (value.length > 60) {
          if (error) {
            error.textContent = "Use 60 characters or fewer.";
            error.hidden = false;
          }
          return false;
        }

        api("/profile/me", { method: "PATCH", body: { display_name: value } }).then(function (result) {
          if (!result.ok) {
            toast(result.error);
            return;
          }
          store.profile = result.data.profile;
          paintChrome();
          toast("Profile updated.");
        });
        return true;
      }
    });
  }

  function openPasswordDialog() {
    if (!requireLogin()) return;

    openDialog({
      title: "Change password",
      bodyHtml:
        '<div class="slc-form">' +
        '<label class="slc-field"><span class="slc-field__label">Current password</span>' +
        '<span class="slc-field__box"><input class="slc-field__input" type="password" name="current" autocomplete="current-password" /></span></label>' +
        '<label class="slc-field"><span class="slc-field__label">New password</span>' +
        '<span class="slc-field__box"><input class="slc-field__input" type="password" name="next" autocomplete="new-password" /></span></label>' +
        '<label class="slc-field"><span class="slc-field__label">Confirm new password</span>' +
        '<span class="slc-field__box"><input class="slc-field__input" type="password" name="confirm" autocomplete="new-password" /></span></label>' +
        '<p class="slc-form__error" hidden></p>' +
        "</div>",
      okText: "Update password",
      cancelText: "Cancel",
      onOk: function (root) {
        var current = $('input[name="current"]', root).value;
        var next = $('input[name="next"]', root).value;
        var confirm = $('input[name="confirm"]', root).value;
        var error = $(".slc-form__error", root);

        function fail(message) {
          error.textContent = message;
          error.hidden = false;
          return false;
        }

        if (!current) return fail("Enter your current password.");
        if (next.length < 8) return fail("The new password must be at least 8 characters.");
        if (next !== confirm) return fail("Both new passwords must match.");

        api("/auth/password", {
          method: "POST",
          body: { current_password: current, new_password: next }
        }).then(function (result) {
          toast(result.ok ? "Password updated." : result.error);
        });
        return true;
      }
    });
  }

  function clearLocalCache() {
    var tasks = [];

    if (window.caches && window.caches.keys) {
      tasks.push(
        window.caches.keys().then(function (keys) {
          return Promise.all(
            keys.map(function (key) {
              return window.caches.delete(key);
            })
          );
        })
      );
    }

    var keep = {};
    [ACCESS_KEY, REFRESH_KEY, PHONE_KEY].forEach(function (key) {
      keep[key] = readStorage(key);
    });

    try {
      window.localStorage.clear();
    } catch (error) {
      /* ignore */
    }

    Object.keys(keep).forEach(function (key) {
      if (keep[key]) writeStorage(key, keep[key]);
    });

    Promise.all(tasks)
      .catch(function () {
        return null;
      })
      .then(function () {
        toast("Local cache cleared.");
      });
  }

  /* ------------------------------------------------------- home sections  */

  var swiperState = null;
  var gameGridOriginal = "";

  function initSwiper() {
    var container = $(".swiper_box .swiper");
    if (!container) return;

    var wrapper = $(".swiper-wrapper", container);
    if (!wrapper) return;

    $$(".swiper-slide", wrapper).forEach(function (slide) {
      var image = $("img", slide);
      var origin = image ? image.getAttribute("data-origin") : null;
      var isDuplicate = slide.classList.contains("swiper-slide-duplicate");
      var isPlaceholder = origin === LOGO;
      if (isDuplicate || isPlaceholder) slide.remove();
    });

    var slides = $$(".swiper-slide", wrapper);
    var dots = $$(".swiper-button > span", $(".swiper_box") || document);
    var index = 0;

    if (!slides.length) return;

    dots.forEach(function (dot, position) {
      dot.hidden = position >= slides.length;
    });

    function go(next) {
      var count = slides.length;
      index = ((next % count) + count) % count;
      var offset = slides[index].offsetLeft || 0;
      wrapper.style.transitionDuration = "320ms";
      wrapper.style.transform = "translate3d(" + -offset + "px,0,0)";
      dots.forEach(function (dot, position) {
        dot.classList.toggle("active", position === index);
      });
    }

    dots.forEach(function (dot, position) {
      on(dot, "click", function () {
        go(position);
      });
    });

    var startX = 0;
    var tracking = false;

    on(container, "touchstart", function (event) {
      tracking = true;
      startX = event.touches[0].clientX;
    }, { passive: true });

    on(container, "touchend", function (event) {
      if (!tracking) return;
      tracking = false;
      var delta = event.changedTouches[0].clientX - startX;
      if (Math.abs(delta) > 40) go(delta < 0 ? index + 1 : index - 1);
    });

    swiperState = { go: go, resize: function () { go(index); } };
    go(0);

    window.setInterval(function () {
      if (document.hidden) return;
      if (store.route !== "home") return;
      if (slides.length < 2) return;
      go(index + 1);
    }, 4500);
  }

  function selectGameTab(index) {
    var tabs = $$(".game-tabs__scroll-item");
    var indicator = $(".game-tabs__scroll-indicator");
    var section = $(".game-section");
    var title = section ? $(".section-header__title-bg__text", section) : null;
    var grid = section ? $(".game-section__grid", section) : null;
    var tab = tabs[index];
    if (!tab) return;

    tabs.forEach(function (item) {
      item.classList.toggle("active", item === tab);
    });

    if (indicator) {
      indicator.style.transition = "transform 0.25s ease, width 0.25s ease";
      indicator.style.width = tab.offsetWidth + "px";
      indicator.style.transform = "translate3d(" + tab.offsetLeft + "px,0,0)";
    }

    var label = (tab.textContent || "").trim();
    if (title && label) title.textContent = label;
    if (grid) renderGameGrid(grid, label);
  }

  function renderGameGrid(grid, label) {
    if (label.toLowerCase() === "lottery") {
      grid.innerHTML = gameGridOriginal;
      repairImages(grid);
      bindGameTiles(grid);
      return;
    }

    grid.innerHTML =
      '<div class="slc-empty" style="grid-column:1/-1">' +
      esc(label) +
      " games are being added. Please check back soon.</div>";
  }

  function bindGameTiles(scope) {
    $$(".game-section__grid-item", scope).forEach(function (item) {
      if (item.getAttribute("data-slc-tile") === "1") return;
      item.setAttribute("data-slc-tile", "1");
      on(item, "click", function () {
        var image = $("img", item);
        var label =
          ($(".section-header__title-bg__text", $(".game-section")) || {}).textContent || "Game";
        openDialog({
          title: label.trim(),
          bodyHtml:
            (image
              ? '<img src="' + esc(image.getAttribute("src") || "") + '" alt="" style="width:100%;border-radius:0.2rem;margin-bottom:0.24rem" />'
              : "") +
            "<p>This game will open in the app. Game play is being connected and will be available soon.</p>"
        });
      });
    });
  }

  function initHomeSections() {
    var grid = $(".game-section__grid");
    if (grid) {
      gameGridOriginal = grid.innerHTML;
      bindGameTiles(grid);
    }

    $$(".game-tabs__scroll-item").forEach(function (tab, index) {
      on(tab, "click", function () {
        selectGameTab(index);
      });
    });

    var allButton = $(".section-header__right");
    if (allButton) {
      on(allButton, "click", function () {
        var labels = $$(".game-tabs__scroll-item").map(function (item) {
          return (item.textContent || "").trim();
        });
        openDialog({
          title: "Game categories",
          bodyHtml:
            "<p>Choose a category from the home screen:</p><ul style=\"margin:0;padding-left:0.5rem;line-height:1.8\">" +
            labels
              .map(function (label) {
                return "<li>" + esc(label) + "</li>";
              })
              .join("") +
            "</ul>"
        });
      });
    }

    $$(".recommended-games__list-item").forEach(function (item) {
      on(item, "click", function () {
        openDialog({
          title: "Recommended games",
          bodyHtml:
            "<p>Recommended games are being prepared. New titles will appear here as soon as they are connected.</p>"
        });
      });
    });

    var detailButton = $(".noticeBar__container .hotIcon");
    if (detailButton) {
      on(detailButton, "click", function () {
        navigate("notices");
      });
    }

    var customer = $("#customerId");
    if (customer) {
      on(customer, "click", function () {
        navigate("support");
      });
    }
  }

  function initHomeNav() {
    var chip = $(".purple-home__nav-chip");
    if (chip) {
      on(chip, "click", function () {
        if (isLoggedIn()) navigate("wallet");
        else openAuth("login");
      });
    }

    var download = $(".purple-home__nav-download");
    if (download) {
      on(download, "click", function () {
        toast("The app download will be available soon.");
      });
    }

    var language = $(".purple-home__nav-right .right");
    if (language) {
      on(language, "click", function () {
        toast("Only English is available right now.");
      });
    }

    var loginButton = $(".purple-home__nav-auth__login");
    if (loginButton) on(loginButton, "click", function () { openAuth("login"); });

    var registerButton = $(".purple-home__nav-auth__register");
    if (registerButton) on(registerButton, "click", function () { openAuth("register"); });
  }

  function initTabbar() {
    var labels = { home: "home", activity: "activity", wallet: "wallet", account: "mine" };

    $$(".tabbar__items-tab").forEach(function (item) {
      var label = (item.textContent || "").trim().toLowerCase();
      var target = labels[label];
      if (!target) return;
      on(item, "click", function () {
        navigate(target);
      });
    });

    var center = $(".tabbar__center");
    if (center) {
      on(center, "click", function () {
        navigate("promotions");
      });
    }
  }

  function initFloatingActions() {
    var reward = $(".float .rewardCenter");
    if (reward) on(reward, "click", function () { navigate("promotions"); });

    var turntable = $(".float .big-turntable");
    if (turntable) {
      on(turntable, "click", function () {
        openDialog({
          title: "Lucky wheel",
          bodyHtml: "<p>The lucky wheel is being connected and will be available soon.</p>"
        });
      });
    }

    var changlong = $(".float .changlongEnter");
    if (changlong) {
      on(changlong, "click", function () {
        navigate("activity");
      });
    }
  }

  /* ---------------------------------------------------------- bonus popup */

  function showBonusDialog() {
    var dialog = $(".firstSaveDialog");
    if (!dialog) return;
    if (readStorage(HIDE_BONUS_KEY)) return;

    var overlay = dialog.previousElementSibling;
    if (!overlay || !overlay.classList.contains("van-overlay")) overlay = null;

    dialog.style.display = "block";
    if (overlay) overlay.style.display = "block";

    function close() {
      dialog.style.display = "none";
      if (overlay) overlay.style.display = "none";
      var checkbox = $(".van-checkbox", dialog);
      if (checkbox && checkbox.getAttribute("aria-checked") === "true") {
        writeStorage(HIDE_BONUS_KEY, "1");
      }
    }

    if (dialog.getAttribute("data-slc-bound") === "1") {
      dialog.__slcClose = close;
      return;
    }

    dialog.setAttribute("data-slc-bound", "1");
    dialog.__slcClose = close;

    var closeButton = $(".close", dialog);
    if (closeButton) on(closeButton, "click", close);

    $$(".first_list-item .btn", dialog).forEach(function (button) {
      on(button, "click", function () {
        close();
        window.setTimeout(openDepositDialog, 60);
      });
    });

    var activityButton = $(".footer .btn", dialog);
    if (activityButton) {
      on(activityButton, "click", function () {
        close();
        navigate("promotions");
      });
    }

    var label = $(".footer .active", dialog);
    var checkbox = $(".van-checkbox", dialog);
    if (label && checkbox) {
      on(label, "click", function () {
        var checked = checkbox.getAttribute("aria-checked") === "true";
        checkbox.setAttribute("aria-checked", checked ? "false" : "true");
        checkbox.classList.toggle("van-checkbox--checked", !checked);
        var icon = $(".van-checkbox__icon", checkbox);
        if (icon) icon.classList.toggle("van-checkbox__icon--checked", !checked);
      });
    }
  }

  /* --------------------------------------------------------------- startup */

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol === "file:") return;
    on(window, "load", function () {
      navigator.serviceWorker.register("/shreeluxclubg-sw.js").catch(function () {
        /* service worker is optional */
      });
    });
  }

  function checkBackend() {
    return api("/health", { auth: false }).then(function (result) {
      store.backendReady = result.ok;
    });
  }

  function init() {
    applyFontScale();
    on(window, "resize", function () {
      applyFontScale();
      if (swiperState) swiperState.resize();
    });
    on(window, "orientationchange", applyFontScale);

    repairImages(document);
    buildViews();
    buildAuthOverlay();

    initTabbar();
    initHomeNav();
    initHomeSections();
    initSwiper();
    initFloatingActions();
    showBonusDialog();

    on(window, "hashchange", render);
    if (!window.location.hash) window.location.replace("#/home");
    render();

    checkBackend();
    restoreSession().then(function () {
      paintChrome();
      if (store.route === "wallet") paintWallet();
    });
    loadWallet().then(function () {
      paintWallet();
      paintChrome();
    });

    registerServiceWorker();

    on(window, "error", function (event) {
      if (event && event.message) console.error("[ShreeLuxClubG]", event.message);
    });

    on(window, "unhandledrejection", function (event) {
      if (event && event.reason) console.error("[ShreeLuxClubG]", event.reason);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
