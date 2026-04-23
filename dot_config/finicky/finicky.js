// ~/.config/finicky/finicky.js
// Docs: https://github.com/johnste/finicky/wiki/Configuration-(v4)
//
// Arc profiles are not CLI-selectable; each Arc Space is bound to one profile.
// So we tag URLs with a `finicky_dest_space=<name>` marker and let Arc's
// Air Traffic Control route the tag to the matching Space (and thus profile).
// ATC setup (Arc → Settings → Links → Air Traffic Control):
//   URL contains "finicky_dest_space=akkio"   → Space bound to the akkio profile
//   URL contains "finicky_dest_space=horizon" → Space bound to the horizon profile

const tagSpace = (space) => (url) => {
  if (url.searchParams.has("finicky_dest_space")) return url;
  url.searchParams.set("finicky_dest_space", space);
  return url;
};

const isLocal = (url) =>
  url.hostname === "localhost" ||
  url.hostname === "127.0.0.1" ||
  url.hostname === "0.0.0.0";

export default {
  defaultBrowser: "Arc",
  rewrite: [
    {
      match: "blu.sky.horizonmedia.com/ratings-chat/*",
      url: tagSpace("akkio"),
    },
    {
      match: "blu.sky.horizonmedia.com/*",
      url: tagSpace("horizon"),
    },
    {
      match: "bitbucket.org/horizonspireteam/*",
      url: tagSpace("horizon"),
    },
    {
      match: "spirehorizon.atlassian.net/*",
      url: tagSpace("horizon"),
    },
    {
      match: (url) => !isLocal(url),
      url: tagSpace("akkio"),
    },
  ],
  handlers: [
    {
      match: (url) => isLocal(url),
      browser: "Google Chrome",
    },
  ],
};
