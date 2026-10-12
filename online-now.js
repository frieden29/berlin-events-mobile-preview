(() => {
  const script = document.currentScript;
  const endpointValue = script?.dataset.endpoint;
  if (
    !endpointValue ||
    location.hostname !== "frieden29.github.io" ||
    location.pathname !== "/berlin-events-mobile-preview/"
  )
    return;

  let endpoint;
  try {
    endpoint = new URL(endpointValue);
  } catch (_) {
    return;
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !["", "/"].includes(endpoint.pathname)
  )
    return;

  const protocol = "berlin-events-presence-v1";
  const storageKey = "berlin_events_online_now_session_v1";
  const idleAfterMs = 2 * 60 * 1000;
  let sessionId;
  try {
    sessionId = sessionStorage.getItem(storageKey) || crypto.randomUUID();
    sessionStorage.setItem(storageKey, sessionId);
  } catch (_) {
    sessionId = crypto.randomUUID();
  }

  let socket;
  let lastActivity = Date.now();
  let retryTimer;
  let idleTimer;
  let retryDelay = 5000;
  let stopped = false;

  const recentlyActive = () => Date.now() - lastActivity < idleAfterMs;
  const online = () =>
    typeof navigator === "undefined" || navigator.onLine !== false;
  const clearRetry = () => {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  };
  const closeSocket = (reason) => {
    if (socket && socket.readyState < WebSocket.CLOSING)
      socket.close(1000, reason);
  };
  const send = () => {
    if (
      !stopped &&
      online() &&
      document.visibilityState === "visible" &&
      recentlyActive() &&
      socket?.readyState === WebSocket.OPEN
    )
      socket.send("active");
  };
  const scheduleReconnect = () => {
    clearRetry();
    if (
      stopped ||
      !online() ||
      document.visibilityState !== "visible" ||
      !recentlyActive()
    )
      return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      connect();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60000);
  };
  const connect = () => {
    if (
      stopped ||
      !online() ||
      document.visibilityState !== "visible" ||
      !recentlyActive() ||
      (socket && socket.readyState < WebSocket.CLOSING)
    )
      return;
    try {
      const websocketUrl = new URL("/presence", endpoint);
      websocketUrl.protocol = "wss:";
      websocketUrl.searchParams.set("sid", sessionId);
      const candidate = new WebSocket(websocketUrl, protocol);
      socket = candidate;
      candidate.addEventListener("open", () => {
        if (socket !== candidate) return;
        retryDelay = 5000;
        clearRetry();
        send();
      });
      candidate.addEventListener("error", () => candidate.close());
      candidate.addEventListener("close", () => {
        if (socket === candidate) socket = undefined;
        scheduleReconnect();
      });
    } catch (_) {
      socket = undefined;
      scheduleReconnect();
    }
  };
  const scheduleIdleClose = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => closeSocket("inactive"), idleAfterMs);
  };
  const activity = () => {
    stopped = false;
    lastActivity = Date.now();
    scheduleIdleClose();
    connect();
  };

  for (const name of ["pointerdown", "keydown", "touchstart", "scroll"]) {
    addEventListener(name, activity, { passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") activity();
    else {
      clearRetry();
      closeSocket("hidden");
    }
  });
  addEventListener("online", activity);
  addEventListener("offline", () => {
    clearRetry();
    closeSocket("offline");
  });
  addEventListener("pagehide", () => {
    stopped = true;
    clearRetry();
    clearTimeout(idleTimer);
    closeSocket("left");
  });
  addEventListener("pageshow", activity);

  scheduleIdleClose();
  connect();
  setInterval(send, 30000);
})();
