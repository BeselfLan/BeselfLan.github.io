# Deploying BeselfOS

This takes you from "VPS and domain chosen" to a live site. Each step is a command to copy, then a check that it worked. Every host-specific value lives in one file, `deploy/.env` (`/srv/beselfos/.env` on the VPS). The hosts below are examples: `example.com`, `api.example.com` and `vps.example.com`, the address `203.0.113.10`, and the user `deploy`. Replace them with yours.

Commands say where they run. "Workstation" is your own machine, in a checkout of this repository. "VPS" is the server.

## 1. Before you start

**You need:**
- an Ubuntu 24.04 or later VPS with at least 1 GB of RAM (256 MB for the API, 128 MB for Caddy, and 64 MB for the site in (b));
- a domain you can add DNS records to;
- an SSH key pair for the deploy user;
- optionally, a Resend account, for the contact form's mail;
- on the workstation: Docker with Compose 2.24.4 or later, git, rsync and ssh. For media you also need Node 24 and ffmpeg.

**Two topologies**, from plan 7.6 and decision D10:
- **(a), the default.** The site stays on GitHub Pages at `https://beselflan.github.io`. The API runs on the VPS at `https://api.example.com`.
- **(b).** The site runs on the VPS too, at `https://example.com`, from its own image. That image is built for one API origin.

**One Caddy per host.** Only one program can listen on ports 80 and 443. If the VPS already runs a Caddy, either topology goes behind it (section 7). If not, our own Caddy takes the ports.

**`COMPOSE_FILE`** tells Compose which files to read. It goes in `/srv/beselfos/.env`. Leave it out when it has no value, because an empty `COMPOSE_FILE=` stops Compose.

| Case | `COMPOSE_FILE` |
| --- | --- |
| (a), our own Caddy | not set |
| (a), behind a Caddy the host already runs | `docker-compose.yml:docker-compose.edge.yml` |
| (b), our own Caddy | `docker-compose.yml:docker-compose.web.yml` |
| (b), behind a Caddy the host already runs | `docker-compose.yml:docker-compose.web.yml:docker-compose.edge.yml` |

**The files in `deploy/`:**

| File | What it is for |
| --- | --- |
| `deploy/.env.example` | Every key, with comments. Copy it to `deploy/.env` (git-ignored). |
| `deploy/docker-compose.yml` | The base: the API, our Caddy, and the site (off until (b) turns it on). |
| `deploy/docker-compose.web.yml` | Topology (b): turns the site on and gives Caddy the site's host. |
| `deploy/docker-compose.edge.yml` | For a host's own Caddy: ours never starts, and the API joins that Caddy's network. |
| `deploy/docker-compose.local.yml` | The workstation: builds the images from this checkout, and one loopback port. |
| `deploy/Caddyfile` | Our Caddy: media straight from the folder, everything else to the API. |
| `deploy/web/site.caddy` | Our Caddy's block for the site, in (b). |
| `deploy/edge/api.caddy` | The API's site block for the host's Caddy. |
| `deploy/edge/web.caddy` | The site's block for the host's Caddy, in (b). |
| `deploy/web/Dockerfile` | The site image: the static export, served by Caddy as a user that is not root. |
| `deploy/web/Dockerfile.dockerignore` | The allowlist of what the site image's build may read. |
| `deploy/web/Caddyfile` | The site image's own config: security headers, caching and the 404 page. |
| `deploy/vps-bootstrap.sh` | Prepares the VPS (section 3). |
| `deploy/smoke.sh` | A local rehearsal of the API stack (section 15). |
| `deploy/smoke-web.sh` | A local rehearsal of topology (b), with a browser (section 15). |
| `deploy/smoke-browser.mts` | The browser half of `deploy/smoke-web.sh`. |
| `deploy/bootstrap-check.sh` | Proves the bootstrap script in throwaway containers (section 15). |

## 2. DNS

Add these records at your DNS provider. Use the VPS's address from its dashboard:

| Name | Type | Value | For |
| --- | --- | --- | --- |
| `api.example.com` | A | `203.0.113.10` | (a) and (b) |
| `example.com` | A | `203.0.113.10` | (b) only |
| `www.example.com` | A | `203.0.113.10` | (b), only if you want it |

Add an AAAA record with the VPS's IPv6 address next to each A record if the VPS has IPv6. Add none if it has not: a wrong AAAA record breaks the site for everyone on IPv6.

**Check:** wait for the records to spread, then run this on the workstation. It must print the VPS's address.

```sh
dig +short api.example.com
```

Caddy cannot get a certificate from Let's Encrypt until the records point at the VPS, so do this before section 7.

### A domain behind Cloudflare

Cloudflare's proxy sits between visitors and the VPS. These rules keep Caddy's certificates working. The choices are cheap to change, and each one says how.

- **SSL/TLS mode:** Full (strict), or Full. Never Flexible: Cloudflare then talks plain HTTP to Caddy, and Caddy redirects it to HTTPS, which loops.
- **Certificates:** Caddy's HTTP-01 challenge works through the proxy.
- **Redirected hosts:** a host that a Cloudflare redirect rule sends elsewhere never reaches Caddy, so its challenge cannot pass. `www.example.com` redirected to `example.com` is the usual case. Such a host gets no Caddy block and stays out of `WEB_SITE`.
- **The API host stays "DNS only"** (the grey cloud), and the site host may be proxied. Why: behind the proxy the API would sit two proxy hops deep, and it trusts one, so every visitor would look like a Cloudflare address and share one contact-form limit (section 10). Override: proxy the API host as well, after making the two changes in section 10.
- **Checking a proxied host:** `dig +short` prints Cloudflare's addresses, not the VPS. Check the record in the Cloudflare dashboard, and check that this answers from the VPS:

```sh
curl -sI http://example.com/
```

- **Checking a DNS-only host:** `dig +short api.example.com` prints the VPS address.
- **If the first certificate does not arrive:** switch the record to DNS only until Caddy logs that it has the certificate, then turn the proxy back on.

## 3. Bootstrap

Bootstrap prepares a fresh Ubuntu VPS. Run it once as root.

**Workstation:** copy `deploy/` to the VPS, without your `.env` and without a local `media` folder.

```sh
rsync -a --exclude=.env --exclude=/media deploy/ root@vps.example.com:/srv/beselfos/
```

**Workstation:** run the script on the VPS with your public key. It must be one line that starts with `ssh-`, `ecdsa-` or `sk-`. If `sshd` listens on a port other than 22, add `SSH_PORT=<port>` beside `DEPLOY_SSH_KEY`. On the VPS, `sshd -T | grep '^port '` shows the port.

```sh
ssh root@vps.example.com "DEPLOY_SSH_KEY='$(cat ~/.ssh/id_ed25519.pub)' /srv/beselfos/vps-bootstrap.sh"
```

**Check:** the last line is `bootstrap: done`. Then log in as the deploy user from the workstation:

```sh
ssh deploy@vps.example.com ls -l /srv/beselfos/.env
```

The file belongs to `deploy` and has mode `-rw-------`.

**What it does.** Each step checks first and prints `ok:` or `changed:`:
- installs Docker Engine and the Compose plugin from the Ubuntu archive, if they are missing, and refuses a Compose older than 2.24.4;
- makes the group `docker` and the user `deploy`, puts `deploy` in that group, and adds your key to its `authorized_keys`. A user in the `docker` group can become root on the host, so guard that key;
- installs `ufw` if needed, allows `SSH_PORT` (default 22), 80/tcp, 443/tcp and 443/udp, then enables it. SSH is allowed first, so enabling cannot lock you out, as long as `SSH_PORT` is the port `sshd` listens on;
- makes `/srv/beselfos` and `/srv/beselfos/media` (mode 755), and `/srv/beselfos/.env` from `.env.example` (mode 600). It never overwrites an `.env`;
- gives the copied files to `deploy`.

**What it never does:** upgrade packages, edit `sshd`, or touch containers, images, networks or volumes. Running it again is safe, and changes nothing the second time.

**Why only Caddy publishes ports.** A port that Docker publishes bypasses `ufw`, because Docker writes its own firewall rules. So the API publishes none, and only Caddy publishes 80, 443 and 443/udp.

**Optional: harden `sshd`.** This is manual, because a wrong edit locks you out. First check that `ssh deploy@vps.example.com` works with your key, in a second terminal. Then, on the VPS as root:

```sh
printf 'PasswordAuthentication no\nPermitRootLogin no\n' > /etc/ssh/sshd_config.d/10-beselfos.conf
sshd -t && systemctl reload ssh
sshd -T | grep -E '^(passwordauthentication|permitrootlogin)'
```

The name starts with `10-` so that it is read before other files in that folder, and `sshd` keeps the first value it reads. **Check:** both lines print `no`. Keep your root session open until a fresh login as `deploy` works. Afterwards root cannot log in over SSH, and `deploy` has no sudo. Keep a sudo user, or your provider's console, for root work such as updates or running the bootstrap again.

**Later syncs** run as `deploy`, with the same excludes:

```sh
rsync -a --exclude=.env --exclude=/media deploy/ deploy@vps.example.com:/srv/beselfos/
```

### A shared host that already has a firewall

Run the script with `SKIP_FIREWALL=1`. It still makes the deploy user, the two folders and the `.env`, and leaves the firewall alone:

```sh
ssh root@vps.example.com "SKIP_FIREWALL=1 DEPLOY_SSH_KEY='$(cat ~/.ssh/id_ed25519.pub)' /srv/beselfos/vps-bootstrap.sh"
```

Afterwards, check that the existing firewall allows the SSH port, 80/tcp, 443/tcp and 443/udp.

Override: skip the script. On the VPS, as root, make the user, its key, the two folders and the `.env` yourself, with the script's modes. The `.env` is made only if there is none, as the script does:

```sh
useradd --create-home --shell /bin/bash deploy && usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
echo '<your public key line>' >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
install -d -m 755 -o deploy -g deploy /srv/beselfos /srv/beselfos/media
[ -e /srv/beselfos/.env ] || install -m 600 -o deploy -g deploy /srv/beselfos/.env.example /srv/beselfos/.env
chown -R deploy:deploy /srv/beselfos
ls -l /srv/beselfos/.env
```

**Check:** the last line shows `-rw-------` and the owner `deploy`.

## 4. Env

On the VPS, edit `/srv/beselfos/.env`, as `deploy`. Compose stops with a message that names a required key when it has no value. When the file is ready, this prints nothing:

```sh
cd /srv/beselfos && docker compose config --quiet
```

| Key | Needed | Read by | Example |
| --- | --- | --- | --- |
| `API_SITE` | Required. Also with the host's Caddy: Compose checks it, and it is the host's `BESELFOS_API_SITE`. | our Caddy | `api.example.com` |
| `HTTP_PORT`, `HTTPS_PORT` | Optional (80 and 443). | our Caddy only. The edge overlay ignores them. | `80`, `443` |
| `PUBLIC_MEDIA_BASE_URL` | Required. No trailing slash. It must be `https` for an `https` site, or browsers block the media. | the API | `https://api.example.com/media/files` |
| `CORS_ORIGINS` | Required. Exact origins, comma-separated, no trailing slash (the API refuses one). | the API | (a) `https://beselflan.github.io`, (b) `https://beselflan.github.io,https://example.com` |
| `API_IMAGE` | Optional. Empty means `beselfos-api:local`. | Compose | `beselfos-api:3f9c2ab` |
| `MEDIA_HOST_DIR` | Optional. Empty means `/srv/beselfos/media`. | Compose | (empty) |
| `EDGE_NETWORK` | Required with the edge overlay, unused without. | Compose | `shared-proxy` |
| `WEB_SITE` | (b) only. A host, or a list. | our Caddy | `example.com` or `example.com, www.example.com` |
| `WEB_IMAGE` | (b) only. Empty means `beselfos-web:local`. | Compose | `beselfos-web:3f9c2ab` |
| `NEXT_PUBLIC_API_URL` | (b) only, at build time (section 6). An origin: no path, no trailing slash. | the site build | `https://api.example.com` |
| `RESEND_API_KEY` | Optional. | the API | `re_xxxxxxxx` |
| `CONTACT_TO` | Optional. | the API | `me@example.com` |
| `CONTACT_FROM` | Optional. | the API | `"BeselfOS <contact@example.com>"` |
| `ADMIN_TOKEN` | Reserved: nothing reads it yet. | nothing | (empty) |
| `DMOJ_USER`, `GITHUB_USER` | Optional. Without them the stats routes answer 503. | the API | `your-handle` |
| `MEDIA_SYNC_TARGET` | Optional. Read from the shell by `scripts/media/sync.sh`, not by Compose. | the sync script | `deploy@vps.example.com:/srv/beselfos/media` |
| `COMPOSE_FILE` | Optional. See section 1. Leave it out unless it has a value. | Compose | `docker-compose.yml:docker-compose.web.yml` |

Notes:
- **Production `CORS_ORIGINS`** drops `http://localhost:3000`, which the example file lists for development. In (b) it also lists the site's own origin.
- **Mail** needs both `RESEND_API_KEY` and `CONTACT_TO`. Without either, `POST /api/contact` answers 503. `CONTACT_FROM` defaults to `BeselfOS <onboarding@resend.dev>`. A display name goes in double quotes, as in the table. Compose removes the quotes.
- **Pairs.** With the host's Caddy, `API_SITE` is also that Caddy's `BESELFOS_API_SITE`, and in (b) `WEB_SITE` is its `BESELFOS_WEB_SITE`. Keep each pair equal.

## 5. Secrets

- **On the VPS** they live only in `/srv/beselfos/.env`, with mode 600. The bootstrap script sets it. Check with `ls -l /srv/beselfos/.env`.
- **For CI** they go in GitHub Actions secrets. Plan 7.6 names `VPS_HOST`, `VPS_USER` and `VPS_SSH_KEY`. Issue #27 wires them.
- **Never** in the repository, in an issue, or in a `NEXT_PUBLIC_` value: those are baked into the public site.

## 6. Images

There is no registry until #27, so you build on the workstation and copy the images across.

**Workstation:** make `deploy/.env` with the same values as the VPS. The build reads `NEXT_PUBLIC_API_URL`, and Compose needs the required keys and `HTTP_PORT` to read the files.

```sh
cp deploy/.env.example deploy/.env
```

**Workstation:** build with Compose, never with plain `docker build`. Without buildx, plain `docker build` ignores the allowlist file `deploy/web/Dockerfile.dockerignore`. (a) builds the API only:

```sh
docker compose --env-file deploy/.env -f deploy/docker-compose.yml -f deploy/docker-compose.local.yml build api
```

(b) builds the site too. It is built for one API origin, so build it again whenever `NEXT_PUBLIC_API_URL` changes:

```sh
docker compose --env-file deploy/.env -f deploy/docker-compose.yml -f deploy/docker-compose.local.yml -f deploy/docker-compose.web.yml build api web
```

**Workstation:** tag each image with the commit, and copy it across. Use one tag per commit, so a rollback is the previous tag.

```sh
tag=$(git rev-parse --short HEAD)
docker tag beselfos-api:local "beselfos-api:$tag"
docker save "beselfos-api:$tag" | ssh deploy@vps.example.com docker load
```

For (b), do the same with `beselfos-web`:

```sh
docker tag beselfos-web:local "beselfos-web:$tag"
docker save "beselfos-web:$tag" | ssh deploy@vps.example.com docker load
```

**Check:** `ssh deploy@vps.example.com docker image ls beselfos-api` lists the tag.

Then set `API_IMAGE=beselfos-api:<tag>` in `/srv/beselfos/.env`, and for (b) `WEB_IMAGE=beselfos-web:<tag>`. Do not run `docker compose pull` yet: there is no registry to pull from.

## 7. Start

**VPS:**

```sh
cd /srv/beselfos && docker compose up -d --wait
docker compose ps
```

**Check:** `--wait` returns only when every service is up and healthy. `docker compose ps` shows `api` (and `web`, in (b)) as `healthy`, and `caddy` as running. With the edge overlay there is no `caddy` in the list: the host's Caddy serves.

When our own Caddy starts, it asks Let's Encrypt for a certificate for each host in its config. Watch with `docker compose logs caddy`.

### Behind a Caddy the host already runs

Plan 7.6 says one Caddy per host. With `COMPOSE_FILE` set to an edge value (section 1) and `EDGE_NETWORK` set, our Caddy never starts, and the API (and the site, in (b)) join the host Caddy's network as `beselfos-api` and `beselfos-web`. The host's Caddy must then:

1. **Be on that network.** Find the networks it is already on, and set `EDGE_NETWORK` to one of them. That needs no change to that Caddy. Override: a new network, added to that Caddy's own Compose file, which recreates it.

   ```sh
   docker inspect --format '{{json .NetworkSettings.Networks}}' <caddy container>
   ```

2. **Mount the media folder read-only at the same path:** `/srv/beselfos/media`, in that Caddy's own Compose file. A running container cannot take a new mount, so that Caddy is recreated once, when the API arrives. This holds for both ways below. The site alone, in (b), needs no mount.
3. **Have the site block, by one of two ways.** Then reload.

**Way 1 (the default): a literal block.** Copy the block into that Caddy's Caddyfile with the host written in. It is `deploy/edge/api.caddy`, with `{$BESELFOS_API_SITE}` replaced by the API host. It needs no environment variable of that Caddy's:

```caddy
api.example.com {
	handle_path /media/files/* {
		root * /srv/beselfos/media
		header Cache-Control "public, max-age=86400"
		header Cross-Origin-Resource-Policy cross-origin
		header X-Content-Type-Options nosniff
		file_server {
			hide .*
		}
	}
	handle {
		reverse_proxy beselfos-api:8080
	}
}
```

In (b), add the site's block as well. It is `deploy/edge/web.caddy` with the host written in:

```caddy
example.com {
	reverse_proxy beselfos-web:8080
}
```

**Way 2: the import.** Give that Caddy `BESELFOS_API_SITE` (and `BESELFOS_WEB_SITE` in (b)) in its environment, the same values as `API_SITE` and `WEB_SITE`. Mount `/srv/beselfos/edge` read-only at the same path, and add `import /srv/beselfos/edge/api.caddy` to its Caddyfile. In (b) only, add `import /srv/beselfos/edge/web.caddy` too: in (a) it would be a site block with an empty address. Adding variables recreates that Caddy, which briefly drops every site on it. The gain: each sync of `deploy/` and reload keeps the block in step with the repository.

**Reload that Caddy** with its own reload command. For a Caddy in Docker that is usually this pair. A reload keeps the other sites up:

```sh
docker exec <caddy container> caddy validate --config /etc/caddy/Caddyfile
docker exec <caddy container> caddy reload --config /etc/caddy/Caddyfile
```

If that Caddy has its admin endpoint turned off, `caddy reload` cannot reach it, and it has to be restarted.

### Site first, API later

With a Caddy the host already runs, (b) can start the site before the API exists. (Our own Caddy would wait for a healthy API.) The site then plays the demos from its own copies, and its Content-Security-Policy names no API origin.

1. Leave `NEXT_PUBLIC_API_URL` empty. Build the site image (section 6) and set `WEB_IMAGE`.
2. Compose reads the whole project even for one service, so `API_SITE`, `CORS_ORIGINS` and `PUBLIC_MEDIA_BASE_URL` must still hold their planned values, or it stops and names the key. (Its message says `deploy/.env`. On the VPS that means `/srv/beselfos/.env`.) Set them now.
3. Start the site only:

```sh
cd /srv/beselfos && docker compose up -d --wait web
```

**Check:** `curl -sI https://example.com/` answers 200 with the security headers (section 12).

Later, when the API's turn comes:
1. add the API's DNS record (section 2);
2. set `NEXT_PUBLIC_API_URL=https://api.example.com` in the workstation's `deploy/.env`, and build the site again under a new tag;
3. copy both images across, set `API_IMAGE` and `WEB_IMAGE` (section 6);
4. add the API's block to the host's Caddy, and recreate that Caddy with the media mount (above), if it is shared;
5. run `docker compose up -d --wait` on the VPS.

## 8. Media

The API serves the demos from `/srv/beselfos/media`, and `scripts/media/convert.sh` makes them. **Workstation:**

```sh
scripts/media/convert.sh path/to/demo.gif demo-id
```

It writes `<id>.mp4`, `<id>.webm`, `<id>.jpg` and the manifest into `apps/api/media`. Send that folder:

```sh
MEDIA_SYNC_TARGET=deploy@vps.example.com:/srv/beselfos/media RSYNC_RSH='ssh -i ~/.ssh/id_ed25519' scripts/media/sync.sh
```

For the three demos that are committed, put `MEDIA_SYNC_SOURCE=apps/web/public/media` in front of that command to send them instead.

The script refuses a manifest that names a missing file. It never deletes anything on the VPS, it sets the modes (`D755,F644`) so the containers can read everything, and it sends `manifest.json` last, so the API never lists a file it does not have.

**Check:** `curl -s https://api.example.com/health` shows a `mediaCount` equal to the number of entries in the manifest.

## 9. Mail

The contact form sends through Resend. Skip this section and the form answers 503, and nothing else breaks.

1. In the Resend dashboard, add and verify your domain (it shows the DNS records to add).
2. In `/srv/beselfos/.env`, set `CONTACT_FROM` to an address on that domain, plus `CONTACT_TO` and `RESEND_API_KEY`.
3. On the VPS, recreate the API with the new values:

```sh
cd /srv/beselfos && docker compose up -d --wait
```

4. **Send one test message** from the workstation, with the origin of the site. A non-empty `website` field is the form's honeypot: it answers 202 and sends nothing, so leave it out.

```sh
curl -si https://api.example.com/api/contact \
  -H 'Origin: https://beselflan.github.io' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"you@example.com","message":"Hello from the runbook"}'
```

**What the test send tells you:**
- `202` with `{"ok":true}`: Resend took it. Check the inbox of `CONTACT_TO`.
- `502` `mail_failed`: Resend refused it or could not be reached.
- `503` `mail_not_configured`: `RESEND_API_KEY` or `CONTACT_TO` is missing.
- `400` `invalid_contact`: the body is wrong.
- `429` `rate_limited`: more than 5 requests in 15 minutes from one address. Bad requests count too. The count is in memory, so restarting the API resets it.

**What it does not tell you:** whether the default sender `onboarding@resend.dev` can deliver to `CONTACT_TO`. Do not rely on it. Use your verified domain.

**If it is 502,** read the log on the VPS. A network failure logs `mail request failed: <ErrorName>`, such as `TypeError`, which hides the cause. A refusal logs `mail provider returned <status>`.

```sh
cd /srv/beselfos && docker compose logs api
```

Then check that the VPS can reach the provider. Any HTTP answer means it can:

```sh
curl -sI https://api.resend.com
```

## 10. Proxies

The API trusts exactly one proxy hop (`trust proxy` is 1 in `apps/api/src/app.ts`): the Caddy in front of it. That Caddy replaces the `X-Forwarded-For` of any client it does not trust, so a client cannot choose its own address.

Before you put a CDN or a second proxy in front of the API, Cloudflare's included, make two changes together:

1. **Caddy:** in the front Caddy's global options, set `servers { trusted_proxies static <the CDN's published IP ranges> }`. The stock `caddy:2-alpine` has no Cloudflare module, so write the ranges out, from Cloudflare's published IP ranges. On a shared Caddy this applies to every site on it. To link that page instead, first add Cloudflare's own host name to the vendor hosts that the "names no real host" test allows.
2. **The API:** it must count two hops (`trust proxy` in `apps/api/src/app.ts`). This runbook does not change code. Open a backend-infra issue for it.

Either one alone changes nothing: every visitor still looks like the CDN's address, and shares one rate limit.

## 11. Frontend switch

Plan 7.7 is described here, not done.

- **(a):** the Pages build needs the repository variable `NEXT_PUBLIC_API_URL=https://api.example.com`. Plan 7.7 puts it in `.github/workflows/web.yml`, which issue #27 owns. On v2 that file only runs the checks. After the Pages build has it, Play streams from `api.example.com` and the tray's network icon shows online.
- **Later:** plan 7.7 removes the MP4s from `apps/web/public/media`, since the API serves them. That change must update `apps/web/src/media/publicMedia.test.ts` and the manifest's sources together. It has not been done.
- **(b):** nothing more. The image was built with the API origin (section 6).

## 12. Verify

Run these from the workstation, and read each answer.

1. **Health.** The body has `"ok":true` and `mediaCount`:

   ```sh
   curl -s https://api.example.com/health
   ```

2. **Media with a Range request.** It answers `206`:

   ```sh
   curl -r 0-1023 -I https://api.example.com/media/files/deadknight.mp4
   ```

3. **CORS.** The first shows `access-control-allow-origin: https://beselflan.github.io`. The second shows no such header:

   ```sh
   curl -s -D - -o /dev/null -H 'Origin: https://beselflan.github.io' https://api.example.com/health
   curl -s -D - -o /dev/null -H 'Origin: https://other.example.com' https://api.example.com/health
   ```

4. **(b): the site's headers.** The output has a `content-security-policy`, `strict-transport-security`, `x-content-type-options`, `x-frame-options`, `referrer-policy`, `permissions-policy` and `cross-origin-opener-policy` line:

   ```sh
   curl -sI https://example.com/
   ```

5. **In a browser,** open the site, open an entry in the Projects app that has a demo, and press "Play demo". The video requests go to `api.example.com`, and the tray's network icon shows online.
6. **Offline.** On the VPS stop the API. Reload the site and open the same entry: "Play demo" is disabled with "Demo offline" in its tooltip, and within 5 seconds the tray shows offline. (The tray stays "unknown" until the site has asked the API once.) Then start the API again and reload the site.

   ```sh
   cd /srv/beselfos && docker compose stop api
   docker compose start api
   ```

`deploy/smoke-web.sh` checks the offline and tray steps locally (section 15), so you need not stop production to trust them.

## 13. Rollback

Set the previous tag in `/srv/beselfos/.env` (`API_IMAGE`, and `WEB_IMAGE` in (b)). The old images are still on the VPS from `docker load`. Then:

```sh
cd /srv/beselfos && docker compose up -d --wait
docker compose ps
```

**Check:** `docker compose ps` shows the previous tag in the image column, and section 12 passes again.

## 14. CI deploy

Issue #27 adds this section. Until then, deploys are by hand, as above.

## 15. Local rehearsal

These three scripts prove the stack on one machine. Run them from a checkout. The two smoke scripts bring a stack up under their own Compose project on one loopback port, then take it down. They touch no other project or network. On a shared host, give each its own `SMOKE_PROJECT` and a free `SMOKE_PORT` (1024 or above). They build `beselfos-api:local` (and `beselfos-web:local`), the tags that section 6 copies from. Rehearse before section 6's build or after its tag step, never between them.

```sh
SMOKE_PORT=18140 SMOKE_PROJECT=beself-rehearsal-api deploy/smoke.sh
SMOKE_PORT=18141 SMOKE_PROJECT=beself-rehearsal-web deploy/smoke-web.sh
deploy/bootstrap-check.sh
```

- `deploy/smoke.sh` builds the API image and tests the stack with curl. It needs Docker, ffmpeg, curl and Node, and prints `SMOKE_OK`.
- `deploy/smoke-web.sh` builds the API and site images and tests topology (b) with a browser. It also needs `npm ci` first (for Playwright's Chromium), and prints `SMOKE_WEB_OK`.
- `deploy/bootstrap-check.sh` uses no Compose project and no port. It runs `deploy/vps-bootstrap.sh` in throwaway `ubuntu:24.04` containers (`docker run --rm`) with no network, pulls that image once, and prints `BOOTSTRAP_OK`. It builds none of your images.
