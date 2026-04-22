// ~/.config/finicky/finicky.js
// Docs: https://github.com/johnste/finicky/wiki/Configuration-(v4)

export default {
  defaultBrowser: "Zen",
  handlers: [
    {
      match: ({ url }) =>
        url.host === "localhost" ||
        url.host === "127.0.0.1" ||
        url.host === "0.0.0.0",
      browser: "Google Chrome",
    },
  ],
};
