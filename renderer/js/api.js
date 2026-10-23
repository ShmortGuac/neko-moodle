// `italeem.*` — the app's API, backed by the preload bridge.
// Unwraps {ok, data} results and turns failures into Errors that keep their Moodle error code.
const italeem = Object.fromEntries(
  Object.entries(window.italeemBridge).map(([name, fn]) => [
    name,
    name.startsWith('on') ? fn : async (...args) => {
      const res = await fn(...args);
      if (!res.ok) {
        const err = new Error(res.error);
        err.code = res.code;
        throw err;
      }
      return res.data;
    },
  ])
);
