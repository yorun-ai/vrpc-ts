# Browser CDN usage

This guide shows how to use `@yorun-ai/vrpc` from a CDN in a plain HTML page,
without a bundler or a package install. For packaged applications, prefer the
npm installation and the [Usage guide](./usage.md).

## 1. Overview

Use the CDN builds when you want to:

- prototype against a real vRPC or HTTP endpoint from a static page,
- embed the client in a CodePen, JSFiddle, or documentation snippet,
- keep a small internal tool free of a build step.

Two constraints apply to every CDN setup:

- **ES modules only.** The published package ships ES module and CommonJS
  builds, not an IIFE/UMD bundle. There is no `window.Vrpc` or `window.Http`
  global, and a classic `<script src="...">` without `type="module"` fails with
  a syntax error because the file contains `import` statements.
- **Pin the version.** Use an exact version such as `@0.9.3` so a new release
  cannot change the behavior of a page you already published.

The runtime needs native ES modules, `fetch`, `AbortController`, and `Headers`.
All current evergreen browsers provide these.

## 2. Available bundles

| Import                         | File                | Format                                                   |
| ------------------------------ | ------------------- | -------------------------------------------------------- |
| vRPC client + protocol helpers | `dist/client.es.js` | ES module; imports one relative shared chunk             |
| Generic HTTP client            | `dist/http.es.js`   | ES module; imports the same shared chunk                 |
| vRPC client (bundled)          | `+esm`              | ES module; single self-contained file, no extra requests |
| Generic HTTP client (bundled)  | `/http/+esm`        | ES module; single self-contained file, no extra requests |

Notes:

- `dist/client.cjs` and `dist/http.cjs` are CommonJS builds and cannot be
  loaded directly by a browser.
- `dist/client.es.min.js` and `dist/http.es.min.js` are minified on demand by
  jsDelivr from the published `.es.js` files. They are still ES modules, and
  because they are generated they must not be used with subresource integrity
  hashes.
- `dist/client.es.js` and `dist/http.es.js` import a build-specific shared chunk
  whose name changes on every release. Do not copy a chunk filename into your
  page; import the entry file and let the browser resolve it, or use `+esm` to
  avoid the extra request entirely.

## 3. Loading the module

Browser ESM with jsDelivr:

```html
<script type="module">
  import { createVrpcClient } from "https://cdn.jsdelivr.net/npm/@yorun-ai/vrpc@0.9.3/+esm";

  // ...
</script>
```

The same API is available from the unbundled entry file:

```html
<script type="module">
  import { createVrpcClient } from "https://cdn.jsdelivr.net/npm/@yorun-ai/vrpc@0.9.3/dist/client.es.js";
</script>
```

Import the HTTP client from its own module path:

```html
<script type="module">
  import { createHttpClient } from "https://cdn.jsdelivr.net/npm/@yorun-ai/vrpc@0.9.3/http/+esm";
</script>
```

This form does **not** work, because the bundle is an ES module:

```html
<!-- Fails: the runtime has no global build. -->
<script src="https://cdn.jsdelivr.net/npm/@yorun-ai/vrpc@0.9.3/dist/client.es.js"></script>
<script>
  const client = Vrpc.createVrpcClient({/* ... */}); // Vrpc is undefined
</script>
```

## 4. Complete vRPC example

Save this as `vrpc-demo.html` and open it in a browser. It creates a client,
invokes a method, and renders either the result or a classified error.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>vRPC CDN demo</title>
  </head>
  <body>
    <pre id="output">loading…</pre>

    <script type="module">
      import {
        createVrpcClient,
        getClientInstanceId,
        isVrpcError,
      } from "https://cdn.jsdelivr.net/npm/@yorun-ai/vrpc@0.9.3/+esm";

      const output = document.getElementById("output");

      const client = createVrpcClient({
        prefixUrl: "https://api.example.com/invoke",
        clientInfo: {
          clientName: "demo.browser",
          clientVersion: "1.0.0",
          clientInstanceId: getClientInstanceId(),
        },
      });

      try {
        const profile = await client.invoke({
          serviceName: "user.UserService",
          methodName: "getProfile",
          params: { userId: 1 },
        });
        output.textContent = JSON.stringify(profile, null, 2);
      } catch (error) {
        if (!isVrpcError(error)) {
          output.textContent = String(error);
        } else if (error.kind === "invoke") {
          output.textContent = `${error.vrpcStatus} ${error.code} ${error.reason}`;
        } else {
          output.textContent = `${error.kind}: ${error.message}`;
        }
      }
    </script>
  </body>
</html>
```

Top-level `await` is valid inside a module script, so no wrapper function is
required.

## 5. Complete HTTP example

The generic HTTP client is a separate module and does not use vRPC protocol
headers.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>HTTP CDN demo</title>
  </head>
  <body>
    <pre id="output">loading…</pre>

    <script type="module">
      import {
        createHttpClient,
        isHttpError,
      } from "https://cdn.jsdelivr.net/npm/@yorun-ai/vrpc@0.9.3/http/+esm";

      const output = document.getElementById("output");

      const http = createHttpClient({
        prefixUrl: "https://api.example.com",
        timeoutMs: 5_000,
      });

      try {
        const profile = await http.request({ path: "/users/me" });
        output.textContent = JSON.stringify(profile, null, 2);
      } catch (error) {
        output.textContent = isHttpError(error) ? `${error.kind}: ${error.message}` : String(error);
      }
    </script>
  </body>
</html>
```

## 6. Version pinning

Always pin an exact version in the URL:

```text
https://cdn.jsdelivr.net/npm/@yorun-ai/vrpc@0.9.3/+esm
```

`@0.9.3` is immutable on jsDelivr. A floating range such as `@0` resolves to the
newest `0.x` release and can pick up behavior changes; use it only for a
throwaway prototype. Keep the pinned version aligned with the version in your
`package.json` when the same project uses both.

## 7. Troubleshooting

| Symptom                                                 | Cause and fix                                                                                                                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cannot use import statement outside a module`          | The script tag is missing `type="module"`.                                                                                                                                                                 |
| `window.Vrpc is undefined` / `window.Http is undefined` | There is no global build. Import the module instead.                                                                                                                                                       |
| `Failed to resolve module specifier`                    | A bare specifier such as `@yorun-ai/vrpc` was used in a browser import without a CDN URL or an import map.                                                                                                 |
| `404` when importing the shared chunk                   | A hashed chunk filename was copied into a page. Import `dist/client.es.js` / `dist/http.es.js` and let the browser resolve it, or use `+esm`.                                                              |
| Blocked by CORS                                         | The target API must return `Access-Control-Allow-Origin`. Cookies additionally require `requestInit: { credentials: "include" }` on the client and `Access-Control-Allow-Credentials: true` on the server. |
| Unexpected behavior after a release                     | The CDN URL is not pinned to an exact version.                                                                                                                                                             |
| `fetch is not available in current runtime`             | The page runs in an environment without a global `fetch`, such as a very old browser.                                                                                                                      |
| An interceptor is never called                          | `client.use(...)` must be called on the same client instance that performs the request.                                                                                                                    |

For protocol-level failures such as a missing `vrpc-status` or `vrpc-server`
header, see the [vRPC protocol](../maintainers/protocol.md) reference.

## 8. Verification status

The examples in this guide were checked against the `0.9.3` bundle in a real
browser: the bundled `+esm` imports, the unbundled `dist/*.es.js` entry files,
and the jsDelivr-generated `dist/*.es.min.js` variants all load as ES modules
and complete a real invocation. Loading any of them as a classic script fails,
and no global variable is created.

Each version ships its own build, so re-check these loading modes when you move
the pinned version.
