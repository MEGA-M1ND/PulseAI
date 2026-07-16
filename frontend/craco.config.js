// craco.config.js
const path = require("path");
require("dotenv").config();

// Check if we're in development/preview mode (not production build)
// Craco sets NODE_ENV=development for start, NODE_ENV=production for build
const isDevServer = process.env.NODE_ENV !== "production";

// Environment variable overrides
const config = {
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
};

function makeDevServerV5Compatible(devServerConfig) {
  const {
    https,
    onAfterSetupMiddleware,
    onBeforeSetupMiddleware,
    onListening,
    setupMiddlewares,
    ...compatibleConfig
  } = devServerConfig;

  compatibleConfig.server =
    typeof https === "object"
      ? { type: "https", options: https }
      : https
        ? "https"
        : "http";
  compatibleConfig.headers = {
    ...compatibleConfig.headers,
    "Cross-Origin-Resource-Policy": "same-origin",
  };

  if (onBeforeSetupMiddleware || setupMiddlewares) {
    compatibleConfig.setupMiddlewares = (middlewares, devServer) => {
      if (onBeforeSetupMiddleware) {
        onBeforeSetupMiddleware(devServer);
      }

      return setupMiddlewares
        ? setupMiddlewares(middlewares, devServer)
        : middlewares;
    };
  }

  compatibleConfig.onListening = (devServer) => {
    devServer.close ??= (callback) => devServer.stopCallback(callback);

    if (onListening) {
      onListening(devServer);
    }
    if (onAfterSetupMiddleware) {
      onAfterSetupMiddleware(devServer);
    }
  };

  return compatibleConfig;
}

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

let webpackConfig = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {

      // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
        ],
      };

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }
      return webpackConfig;
    },
  },
};

webpackConfig.devServer = (devServerConfig) => {
  // Add health check endpoints if enabled
  if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Call original setup if exists
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }

      // Setup health endpoints
      setupHealthEndpoints(devServer, healthPluginInstance);

      return middlewares;
    };
  }

  return devServerConfig;
};

// Wrap with visual edits (automatically adds babel plugin, dev server, and overlay in dev mode)
if (isDevServer) {
  try {
    const { withVisualEdits } = require("@emergentbase/visual-edits/craco");
    webpackConfig = withVisualEdits(webpackConfig);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.message.includes('@emergentbase/visual-edits/craco')) {
      console.warn(
        "[visual-edits] @emergentbase/visual-edits not installed — visual editing disabled."
      );
    } else {
      throw err;
    }
  }
}

const configureDevServer = webpackConfig.devServer;
webpackConfig.devServer = (devServerConfig) => {
  const cfg = makeDevServerV5Compatible(configureDevServer(devServerConfig));
  // Attach SSR bridge AFTER visual-edits so it's not overwritten.
  const BOT_UA = /bot|crawl|spider|slurp|whatsapp|slack|discord|facebookexternalhit|linkedin|twitter|telegram|preview|curl|wget|python-requests|httpie|libwww|node-fetch|axios|http-client|pagespeed/i;
  const BACKEND = process.env.INTERNAL_BACKEND_URL || "http://localhost:8001";
  const priorSetup = cfg.setupMiddlewares;
  cfg.setupMiddlewares = (middlewares, devServer) => {
    if (priorSetup) middlewares = priorSetup(middlewares, devServer) || middlewares;
    if (devServer && devServer.app && !devServer.app.__pulseai_ssr__) {
      devServer.app.__pulseai_ssr__ = true;
      devServer.app.use((req, res, next) => {
        try {
          const ua = String(req.headers["user-agent"] || "");
          const p = (req.path || req.url || "").split("?")[0];
          if (
            p.startsWith("/api/") ||
            p.startsWith("/static/") ||
            p.startsWith("/sockjs-node") ||
            p.startsWith("/ws") ||
            p.startsWith("/__") ||
            /\.[a-zA-Z0-9]{2,5}$/.test(p)
          ) return next();
          if (!BOT_UA.test(ua)) return next();
          let ssrPath = null;
          if (p === "/" || p === "") ssrPath = "/api/ssr/";
          else if (p.startsWith("/story/")) {
            const parts = p.replace(/\/+$/, "").split("/");
            const slug = parts[parts.length - 1];
            if (slug) ssrPath = `/api/ssr/story/${encodeURIComponent(slug)}`;
          } else if (p.startsWith("/digest/")) {
            const date = p.replace(/^\/digest\/+/, "").replace(/\/+$/, "");
            if (date) ssrPath = `/api/ssr/digest/${encodeURIComponent(date)}`;
          }
          if (!ssrPath) return next();
          const http = require("http");
          const url = require("url");
          const parsed = url.parse(BACKEND + ssrPath);
          const opts = {
            hostname: parsed.hostname,
            port: parsed.port || 80,
            path: parsed.path,
            method: "GET",
            headers: { Accept: "text/html", "User-Agent": ua },
          };
          const upstream = http.request(opts, (r) => {
            res.statusCode = r.statusCode || 200;
            for (const [k, v] of Object.entries(r.headers)) {
              if (["content-length", "connection", "transfer-encoding"].includes(k)) continue;
              try { res.setHeader(k, v); } catch (_) {}
            }
            r.pipe(res);
          });
          upstream.on("error", () => next());
          upstream.end();
        } catch (_) { next(); }
      });
    }
    return middlewares;
  };
  return cfg;
};

module.exports = webpackConfig;
