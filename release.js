// Notices when a newer release has been published, so a page left open (the Streamlabs layer, a phone)
// moves to it instead of running old code next to new. Each release stamps its id into every page
// (<meta name="release">) and into version.json; this compares the two once a minute.
export function watchRelease(onNew) {
  const mine = document.querySelector('meta[name="release"]')?.content;
  if (!mine) return;                                  // page not built by a release
  const check = async () => {
    try {
      const r = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });   // ?t= gets past the site's 10 min cache
      const { release } = await r.json();
      if (release && release !== mine) onNew(release);
    } catch {}
  };
  // A page that was just reloaded for a release waits a minute before checking again (the site may still
  // be publishing); any other page checks straight away.
  setTimeout(check, new URL(location.href).searchParams.has("r") ? 60000 : 0);
  setInterval(check, 60000);
}

// Load the page again at the new release. The release id goes into the address (?r=…) so the site's cache
// can't hand back the old page. If the site is still publishing and the old page comes back anyway, it
// tries again (a minute apart) up to 3 times, then stays put rather than loop.
export function reloadTo(release) {
  const u = new URL(location.href);
  const tries = u.searchParams.get("r") === release ? Number(u.searchParams.get("try") || 1) : 0;
  if (tries >= 3) return;
  u.searchParams.set("r", release);
  if (tries) u.searchParams.set("try", tries + 1);
  location.replace(u);
}
