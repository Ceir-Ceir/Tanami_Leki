var _a;
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter, UNSAFE_withComponentProps, useLoaderData, Meta, Links, Outlet, ScrollRestoration, Scripts, useActionData, Form, redirect, UNSAFE_withErrorBoundaryProps, useRouteError } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import "@shopify/shopify-app-react-router/adapters/node";
import { shopifyApp, AppDistribution, ApiVersion, LoginErrorType, boundary } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { useState, useRef, useEffect } from "react";
import { pipeline } from "@xenova/transformers";
import Groq from "groq-sdk";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, PieChart, Pie, Cell, Legend, ReferenceLine } from "recharts";
let prisma;
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set in your .env file");
}
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient({ adapter });
} else {
  if (!global.__db__) {
    global.__db__ = new PrismaClient({ adapter });
  }
  prisma = global.__db__;
  prisma.$connect();
}
const db = prisma;
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: (_a = process.env.SCOPES) == null ? void 0 : _a.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  // ✅ SQLite session storage (replaces Prisma)
  sessionStorage: new PrismaSessionStorage(db),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true
  },
  ...process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}
});
ApiVersion.October25;
const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
const authenticate = shopify.authenticate;
shopify.unauthenticated;
const login = shopify.login;
shopify.registerWebhooks;
shopify.sessionStorage;
const streamTimeout = 5e3;
async function handleRequest(request, responseStatusCode, responseHeaders, reactRouterContext) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";
  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(
        ServerRouter,
        {
          context: reactRouterContext,
          url: request.url
        }
      ),
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        }
      }
    );
    setTimeout(abort, streamTimeout + 1e3);
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest,
  streamTimeout
}, Symbol.toStringTag, { value: "Module" }));
const loader$7 = async () => {
  return {
    apiKey: process.env.SHOPIFY_API_KEY || ""
  };
};
const root = UNSAFE_withComponentProps(function App() {
  const {
    apiKey
  } = useLoaderData();
  return /* @__PURE__ */ jsxs("html", {
    lang: "en",
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "utf-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "shopify-api-key",
        content: apiKey
      }), /* @__PURE__ */ jsx("script", {
        src: "https://cdn.shopify.com/shopifycloud/app-bridge.js"
      }), /* @__PURE__ */ jsx("script", {
        src: "https://cdn.shopify.com/shopifycloud/polaris.js"
      }), /* @__PURE__ */ jsx(Meta, {}), /* @__PURE__ */ jsx(Links, {})]
    }), /* @__PURE__ */ jsxs("body", {
      children: [/* @__PURE__ */ jsx(Outlet, {}), /* @__PURE__ */ jsx(ScrollRestoration, {}), /* @__PURE__ */ jsx(Scripts, {})]
    })]
  });
});
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: root,
  loader: loader$7
}, Symbol.toStringTag, { value: "Module" }));
const action$4 = async ({
  request
}) => {
  const {
    payload,
    session,
    topic,
    shop
  } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;
  if (session) {
    await db.session.update({
      where: {
        id: session.id
      },
      data: {
        scope: current.toString()
      }
    });
  }
  return new Response();
};
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4
}, Symbol.toStringTag, { value: "Module" }));
const action$3 = async ({
  request
}) => {
  const {
    shop,
    session,
    topic
  } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  if (session) {
    await db.session.deleteMany({
      where: {
        shop
      }
    });
  }
  return new Response();
};
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3
}, Symbol.toStringTag, { value: "Module" }));
function loginErrorMessage(loginErrors) {
  if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  } else if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain to log in" };
  }
  return {};
}
const loader$6 = async ({
  request
}) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
const action$2 = async ({
  request
}) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
const route$1 = UNSAFE_withComponentProps(function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("tamani-beta.myshopify.com");
  const {
    errors
  } = actionData || loaderData || {};
  return /* @__PURE__ */ jsx("s-page", {
    children: /* @__PURE__ */ jsx(Form, {
      method: "post",
      children: /* @__PURE__ */ jsx("s-section", {
        heading: "Log in",
        children: /* @__PURE__ */ jsxs("s-stack", {
          gap: "base",
          children: [/* @__PURE__ */ jsx("s-text-field", {
            name: "shop",
            label: "Shop domain",
            details: "example.myshopify.com",
            value: shop,
            onInput: (
              // Need to use onInput for value updates in web component
              (e) => setShop(e.target.value)
            ),
            autocomplete: "on",
            error: errors == null ? void 0 : errors.shop
          }), /* @__PURE__ */ jsx("s-button", {
            type: "submit",
            variant: "primary",
            children: "Log in"
          })]
        })
      })
    })
  });
});
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$2,
  default: route$1,
  loader: loader$6
}, Symbol.toStringTag, { value: "Module" }));
const index = "_index_12o3y_1";
const heading = "_heading_12o3y_11";
const text = "_text_12o3y_12";
const content = "_content_12o3y_22";
const form = "_form_12o3y_27";
const label = "_label_12o3y_35";
const input = "_input_12o3y_43";
const button = "_button_12o3y_47";
const list = "_list_12o3y_51";
const styles = {
  index,
  heading,
  text,
  content,
  form,
  label,
  input,
  button,
  list
};
const loader$5 = async ({
  request
}) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return {
    showForm: Boolean(login)
  };
};
const route = UNSAFE_withComponentProps(function App2() {
  const {
    showForm
  } = useLoaderData();
  return /* @__PURE__ */ jsx("div", {
    className: styles.index,
    children: /* @__PURE__ */ jsxs("div", {
      className: styles.content,
      children: [/* @__PURE__ */ jsx("h1", {
        className: styles.heading,
        children: "A short heading about [your app]"
      }), /* @__PURE__ */ jsx("p", {
        className: styles.text,
        children: "A tagline about [your app] that describes your value proposition."
      }), showForm && /* @__PURE__ */ jsxs(Form, {
        className: styles.form,
        method: "post",
        action: "/auth/login",
        children: [/* @__PURE__ */ jsxs("label", {
          className: styles.label,
          children: [/* @__PURE__ */ jsx("span", {
            children: "Shop domain"
          }), /* @__PURE__ */ jsx("input", {
            className: styles.input,
            type: "text",
            name: "shop"
          }), /* @__PURE__ */ jsx("span", {
            children: "e.g: my-shop-domain.myshopify.com"
          })]
        }), /* @__PURE__ */ jsx("button", {
          className: styles.button,
          type: "submit",
          children: "Log in"
        })]
      }), /* @__PURE__ */ jsxs("ul", {
        className: styles.list,
        children: [/* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        }), /* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        }), /* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        })]
      })]
    })
  });
});
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: route,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
const loader$4 = async ({
  request
}) => {
  await authenticate.admin(request);
  return null;
};
const headers$2 = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  headers: headers$2,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
const loader$3 = async ({
  request
}) => {
  await authenticate.admin(request);
  return null;
};
const app = UNSAFE_withComponentProps(function App3() {
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [/* @__PURE__ */ jsxs("s-app-nav", {
      children: [/* @__PURE__ */ jsx("s-link", {
        href: "/app",
        rel: "home",
        children: "Home"
      }), /* @__PURE__ */ jsx("s-link", {
        href: "/app/dashboard",
        children: "Dashboard"
      })]
    }), /* @__PURE__ */ jsx(Outlet, {})]
  });
});
const ErrorBoundary = UNSAFE_withErrorBoundaryProps(function ErrorBoundary2() {
  return boundary.error(useRouteError());
});
const headers$1 = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary,
  default: app,
  headers: headers$1,
  loader: loader$3
}, Symbol.toStringTag, { value: "Module" }));
const app_additional = UNSAFE_withComponentProps(function AdditionalPage() {
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "Additional page",
    children: [/* @__PURE__ */ jsxs("s-section", {
      heading: "Multiple pages",
      children: [/* @__PURE__ */ jsxs("s-paragraph", {
        children: ["The app template comes with an additional page which demonstrates how to create multiple pages within app navigation using", " ", /* @__PURE__ */ jsx("s-link", {
          href: "https://shopify.dev/docs/apps/tools/app-bridge",
          target: "_blank",
          children: "App Bridge"
        }), "."]
      }), /* @__PURE__ */ jsxs("s-paragraph", {
        children: ["To create your own page and have it show up in the app navigation, add a page inside ", /* @__PURE__ */ jsx("code", {
          children: "app/routes"
        }), ", and a link to it in the", " ", /* @__PURE__ */ jsx("code", {
          children: "<ui-nav-menu>"
        }), " component found in", " ", /* @__PURE__ */ jsx("code", {
          children: "app/routes/app.jsx"
        }), "."]
      })]
    }), /* @__PURE__ */ jsx("s-section", {
      slot: "aside",
      heading: "Resources",
      children: /* @__PURE__ */ jsx("s-unordered-list", {
        children: /* @__PURE__ */ jsx("s-list-item", {
          children: /* @__PURE__ */ jsx("s-link", {
            href: "https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav",
            target: "_blank",
            children: "App nav best practices"
          })
        })
      })
    })]
  });
});
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app_additional
}, Symbol.toStringTag, { value: "Module" }));
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});
let extractor = null;
async function generateEmbedding(text2) {
  if (!extractor) {
    extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  const output = await extractor(text2, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}
async function searchKnowledgeBase(embedding) {
  const vectorStr = `[${embedding.join(",")}]`;
  const chunks = await db.$queryRaw`
    SELECT id, content, metadata, 1 - (embedding <=> ${vectorStr}::vector) as similarity
    FROM kb_chunks
    WHERE 1 - (embedding <=> ${vectorStr}::vector) > 0.5
    ORDER BY similarity DESC
    LIMIT 5
  `;
  return chunks;
}
async function generateAnswer(query, contextChunks) {
  var _a2, _b;
  const context = contextChunks.join("\n\n---\n\n");
  const systemPrompt = `You are Leki, a helpful AI assistant for this store.
Use the following context to answer the user's question.
If the answer is not in the context, say you don't know but offer to help find contact info.
Keep answers concise and friendly.
  
Context:
${context}
  `;
  const completion = await groq.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: query }
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.5
  });
  return ((_b = (_a2 = completion.choices[0]) == null ? void 0 : _a2.message) == null ? void 0 : _b.content) || "";
}
async function processChat(query) {
  try {
    const embedding = await generateEmbedding(query);
    const results = await searchKnowledgeBase(embedding);
    if (results.length === 0) {
      return {
        answer: "I'm sorry, I couldn't find any information about that in my knowledge base. Please try asking differently or contact support.",
        sources: []
      };
    }
    const contextChunks = results.map((r) => r.content);
    const answer = await generateAnswer(query, contextChunks);
    return {
      answer,
      sources: results
      // Optional: return sources to UI
    };
  } catch (error) {
    console.error("RAG Error:", error);
    return {
      answer: "I'm having trouble connecting to my brain right now. Please try again later.",
      sources: []
    };
  }
}
const action$1 = async ({
  request
}) => {
  const {
    session
  } = await authenticate.public.appProxy(request);
  if (!session) {
    return Response.json({
      error: "Unauthorized"
    }, {
      status: 401
    });
  }
  const formData = await request.json();
  const message = formData.message;
  if (!message) {
    return Response.json({
      error: "Message is required"
    }, {
      status: 400
    });
  }
  const result = await processChat(message);
  return Response.json(result);
};
const loader$2 = async () => {
  return Response.json({
    status: "ok"
  });
};
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
async function getDashboardMetrics() {
  const [uniqueLeads, hvpCount, emailsCaptured, avgScoreResult, totalSessions] = await Promise.all([
    db.leads.count(),
    db.leads.count({
      where: {
        lead_score: { gte: 150 }
      }
    }),
    db.leads.count({
      where: {
        NOT: [
          { email: null },
          { email: "" }
        ]
      }
    }),
    db.leads.aggregate({
      _avg: {
        lead_score: true
      }
    }),
    db.sessions.count()
  ]);
  return {
    uniqueLeads,
    hvpCount,
    emailsCaptured,
    avgLeadScore: Math.round(avgScoreResult._avg.lead_score || 0),
    totalSessions
  };
}
async function getLeads(segment = "ALL") {
  const where = {};
  if (segment === "HVP") {
    where.lead_score = { gte: 150 };
  } else if (segment === "SQL") {
    where.stage = "SQL";
    where.lead_score = { gte: 100, lt: 150 };
  } else if (segment === "MQL") {
    where.stage = "MQL";
  }
  return await db.leads.findMany({
    where,
    orderBy: {
      lead_score: "desc"
    },
    take: 100
    // Limit for performance
  });
}
async function getRecentEvents(limit = 20) {
  return await db.events.findMany({
    orderBy: {
      created_at: "desc"
    },
    take: limit
  });
}
async function getLeadStageDistribution() {
  const groups = await db.leads.groupBy({
    by: ["stage"],
    _count: {
      id: true
    }
  });
  return groups.map((g) => ({
    stage: g.stage || "UNKNOWN",
    count: g._count.id
  }));
}
async function getTopEventsAggregated() {
  try {
    const result = await db.$queryRaw`SELECT top_events FROM v_lead_profiles`;
    const eventCounts = {};
    result.forEach((row) => {
      const events = row.top_events;
      if (Array.isArray(events)) {
        events.forEach((item) => {
          if (item.event_type && item.count) {
            const type = item.event_type;
            const count = parseInt(item.count, 10) || 0;
            eventCounts[type] = (eventCounts[type] || 0) + count;
          }
        });
      } else if (events && typeof events === "object") {
        Object.entries(events).forEach(([type, count]) => {
          eventCounts[type] = (eventCounts[type] || 0) + (parseInt(count, 10) || 0);
        });
      }
    });
    return Object.entries(eventCounts).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count).slice(0, 15);
  } catch (error) {
    console.error("Failed to fetch top events aggregation:", error);
    return [];
  }
}
async function getEventTrends() {
  const today = /* @__PURE__ */ new Date();
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const startOfDay = new Date(d.setHours(0, 0, 0, 0));
    const endOfDay = new Date(d.setHours(23, 59, 59, 999));
    const count = await db.events.count({
      where: {
        created_at: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });
    result.push({
      date: startOfDay.toLocaleDateString(void 0, { month: "short", day: "numeric" }),
      count
    });
  }
  return result;
}
async function getLeadJourneyData() {
  try {
    const sessions = await db.sessions.findMany({
      select: {
        duration_ms: true,
        referrer: true,
        utm_medium: true
      }
    });
    const totalSessions = sessions.length;
    let totalDurationMs = BigInt(0);
    sessions.forEach((s) => {
      totalDurationMs += s.duration_ms || BigInt(0);
    });
    const avgDurationMs = totalSessions > 0 ? Number(totalDurationMs) / totalSessions : 0;
    const avgSessionSeconds = Math.round(avgDurationMs / 1e3);
    const avgSessionMinutes = Math.round(avgSessionSeconds / 60 * 10) / 10;
    const referrerCounts = {};
    sessions.forEach((s) => {
      let source = s.referrer || "(direct)";
      if (source && source !== "(direct)") {
        try {
          const url = new URL(source);
          source = url.hostname.replace(/^www\./, "");
        } catch {
        }
      }
      referrerCounts[source] = (referrerCounts[source] || 0) + 1;
    });
    const referrerDistribution = Object.entries(referrerCounts).map(([source, count]) => ({
      source,
      count,
      percentage: totalSessions > 0 ? Math.round(count / totalSessions * 100) : 0
    })).sort((a, b) => b.count - a.count).slice(0, 10);
    const paidTrafficCount = sessions.filter(
      (s) => {
        var _a2, _b, _c;
        return ((_a2 = s.utm_medium) == null ? void 0 : _a2.toLowerCase()) === "paid" || ((_b = s.utm_medium) == null ? void 0 : _b.toLowerCase()) === "cpc" || ((_c = s.utm_medium) == null ? void 0 : _c.toLowerCase()) === "ppc";
      }
    ).length;
    const paidPercentage = totalSessions > 0 ? Math.round(paidTrafficCount / totalSessions * 100) : 0;
    return {
      avgSessionMinutes,
      avgSessionSeconds,
      referrerDistribution,
      paidTrafficCount,
      totalSessions,
      paidPercentage
    };
  } catch (error) {
    console.error("Failed to fetch lead journey data:", error);
    return {
      avgSessionMinutes: 0,
      avgSessionSeconds: 0,
      referrerDistribution: [],
      paidTrafficCount: 0,
      totalSessions: 0,
      paidPercentage: 0
    };
  }
}
const loader$1 = async ({
  request
}) => {
  await authenticate.admin(request);
  const [metrics, leads, recentEvents, stageDistribution, topEvents, eventTrends, leadJourneyData] = await Promise.all([getDashboardMetrics(), getLeads("ALL"), getRecentEvents(50), getLeadStageDistribution(), getTopEventsAggregated(), getEventTrends(), getLeadJourneyData()]);
  return {
    metrics,
    leads,
    recentEvents,
    stageDistribution,
    topEvents,
    eventTrends,
    leadJourneyData,
    error: null
  };
};
const action = async ({
  request
}) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const content2 = formData.get("kb_content");
  if (!content2) return {
    success: false,
    error: "Content is required"
  };
  try {
    const doc = await db.kb_documents.create({
      data: {
        title: `Manual Upload ${(/* @__PURE__ */ new Date()).toLocaleDateString()}`,
        source_type: "other",
        enabled: true,
        kb_chunks: {
          create: {
            chunk_index: 0,
            content: content2
          }
        }
      }
    });
    return {
      success: true
    };
  } catch (error) {
    console.error("KB Submission failed:", error);
    return {
      success: false,
      error: "Failed to save to Knowledge Base"
    };
  }
};
const app_dashboard = UNSAFE_withComponentProps(function Dashboard() {
  const loaderData = useLoaderData();
  const {
    metrics,
    leads,
    recentEvents,
    error,
    topEvents,
    stageDistribution,
    eventTrends,
    leadJourneyData
  } = loaderData;
  const actionData = useActionData();
  const [selectedTab, setSelectedTab] = useState("dashboard");
  const tabsRef = useRef(null);
  const GREEN_ACCENT = "#22c55e";
  const DARK_BG = "#0e110e";
  const DARK_SURFACE = "#1a1f1a";
  const DARK_BORDER = "#2d362d";
  const LIGHT_TEXT = "#e8f5e9";
  const GREEN_SHADES = ["#22c55e", "#166534", "#15803d", "#14532d"];
  useEffect(() => {
    const tabsEl = tabsRef.current;
    if (!tabsEl) return;
    const handleSelect = (e) => {
      var _a2;
      if ((_a2 = e.detail) == null ? void 0 : _a2.id) {
        setSelectedTab(e.detail.id);
      }
    };
    tabsEl.addEventListener("shopify:select", handleSelect);
    return () => tabsEl.removeEventListener("shopify:select", handleSelect);
  }, []);
  const renderDashboard = () => /* @__PURE__ */ jsxs("div", {
    id: "tanami-dashboard",
    children: [/* @__PURE__ */ jsx("style", {
      children: `
                #tanami-dashboard {
                    background-color: ${DARK_BG};
                    color: ${LIGHT_TEXT};
                    padding: 1.5rem;
                    border-radius: 12px;
                }
                /* Metric Row - 4 columns */
                .metrics-row {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                .metric-box {
                    background-color: ${DARK_SURFACE};
                    border: 1px solid ${DARK_BORDER};
                    border-radius: 8px;
                    padding: 1.25rem;
                    text-align: center;
                }
                .metric-box h3 {
                    margin: 0 0 0.5rem 0;
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: ${LIGHT_TEXT};
                    opacity: 0.8;
                }
                .metric-box .value {
                    font-size: 2rem;
                    font-weight: bold;
                    color: ${GREEN_ACCENT};
                }
                /* Chart Rows - 2 columns each */
                .charts-row {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                .chart-box {
                    background-color: ${DARK_SURFACE};
                    border: 1px solid ${DARK_BORDER};
                    border-radius: 8px;
                    padding: 1rem;
                    min-height: 320px;
                }
                .chart-box h3 {
                    margin: 0 0 1rem 0;
                    font-size: 1rem;
                    font-weight: 600;
                    color: ${LIGHT_TEXT};
                }
                /* Full width chart */
                .chart-box.full-width {
                    grid-column: span 2;
                }
                /* Tables Row */
                .tables-row {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                .table-box {
                    background-color: ${DARK_SURFACE};
                    border: 1px solid ${DARK_BORDER};
                    border-radius: 8px;
                    padding: 1rem;
                    overflow-x: auto;
                }
                .table-box.full-width {
                    grid-column: span 2;
                }
                .table-box h3 {
                    margin: 0 0 1rem 0;
                    font-size: 1rem;
                    font-weight: 600;
                    color: ${LIGHT_TEXT};
                }
                #tanami-dashboard s-data-table {
                    --s-data-table-background: ${DARK_SURFACE};
                    --s-data-table-border-color: ${DARK_BORDER};
                    color: ${LIGHT_TEXT};
                }
                /* Scrollbar styling */
                #tanami-dashboard ::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                #tanami-dashboard ::-webkit-scrollbar-track {
                    background: ${DARK_BG};
                }
                #tanami-dashboard ::-webkit-scrollbar-thumb {
                    background: ${DARK_BORDER};
                    border-radius: 4px;
                }
                #tanami-dashboard ::-webkit-scrollbar-thumb:hover {
                    background: ${GREEN_ACCENT};
                }
                /* Responsive */
                @media (max-width: 768px) {
                    .metrics-row { grid-template-columns: repeat(2, 1fr); }
                    .charts-row { grid-template-columns: 1fr; }
                    .tables-row { grid-template-columns: 1fr; }
                    .chart-box.full-width, .table-box.full-width { grid-column: span 1; }
                }
            `
    }), /* @__PURE__ */ jsxs("div", {
      className: "metrics-row",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "metric-box",
        children: [/* @__PURE__ */ jsx("h3", {
          children: "Visitors Tracked"
        }), /* @__PURE__ */ jsx("div", {
          className: "value",
          children: (metrics == null ? void 0 : metrics.totalSessions) || 0
        })]
      }), /* @__PURE__ */ jsxs("div", {
        className: "metric-box",
        children: [/* @__PURE__ */ jsx("h3", {
          children: "HVP Count (Total)"
        }), /* @__PURE__ */ jsx("div", {
          className: "value",
          children: (metrics == null ? void 0 : metrics.hvpCount) || 0
        })]
      }), /* @__PURE__ */ jsxs("div", {
        className: "metric-box",
        children: [/* @__PURE__ */ jsx("h3", {
          children: "Emails Captured"
        }), /* @__PURE__ */ jsx("div", {
          className: "value",
          children: (metrics == null ? void 0 : metrics.emailsCaptured) || 0
        })]
      }), /* @__PURE__ */ jsxs("div", {
        className: "metric-box",
        children: [/* @__PURE__ */ jsx("h3", {
          children: "Avg Lead Score"
        }), /* @__PURE__ */ jsx("div", {
          className: "value",
          children: (metrics == null ? void 0 : metrics.avgLeadScore) || 0
        })]
      })]
    }), /* @__PURE__ */ jsx("div", {
      className: "charts-row",
      children: /* @__PURE__ */ jsxs("div", {
        className: "chart-box full-width",
        children: [/* @__PURE__ */ jsx("h3", {
          children: "Weekly Event Activity"
        }), /* @__PURE__ */ jsx(ResponsiveContainer, {
          width: "100%",
          height: 280,
          children: /* @__PURE__ */ jsxs(BarChart, {
            data: eventTrends,
            children: [/* @__PURE__ */ jsx(CartesianGrid, {
              strokeDasharray: "3 3",
              vertical: false,
              stroke: DARK_BORDER
            }), /* @__PURE__ */ jsx(XAxis, {
              dataKey: "date",
              fontSize: 12,
              tickLine: false,
              axisLine: false,
              stroke: LIGHT_TEXT
            }), /* @__PURE__ */ jsx(YAxis, {
              fontSize: 12,
              tickLine: false,
              axisLine: false,
              stroke: LIGHT_TEXT
            }), /* @__PURE__ */ jsx(Tooltip, {
              contentStyle: {
                backgroundColor: DARK_SURFACE,
                borderColor: DARK_BORDER,
                color: LIGHT_TEXT
              },
              itemStyle: {
                color: GREEN_ACCENT
              },
              cursor: {
                fill: DARK_BORDER,
                opacity: 0.4
              }
            }), /* @__PURE__ */ jsx(Bar, {
              dataKey: "count",
              fill: GREEN_ACCENT,
              radius: [4, 4, 0, 0]
            })]
          })
        })]
      })
    }), /* @__PURE__ */ jsxs("div", {
      className: "charts-row",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "chart-box",
        children: [/* @__PURE__ */ jsx("h3", {
          children: "Lead Stage Distribution"
        }), /* @__PURE__ */ jsx(ResponsiveContainer, {
          width: "100%",
          height: 280,
          children: /* @__PURE__ */ jsxs(PieChart, {
            children: [/* @__PURE__ */ jsx(Pie, {
              data: stageDistribution,
              dataKey: "count",
              nameKey: "stage",
              cx: "50%",
              cy: "50%",
              outerRadius: 90,
              label: {
                fill: LIGHT_TEXT,
                fontSize: 12
              },
              children: stageDistribution.map((entry2, index2) => /* @__PURE__ */ jsx(Cell, {
                fill: GREEN_SHADES[index2 % GREEN_SHADES.length]
              }, `cell-${index2}`))
            }), /* @__PURE__ */ jsx(Tooltip, {
              contentStyle: {
                backgroundColor: DARK_SURFACE,
                borderColor: DARK_BORDER,
                color: LIGHT_TEXT
              }
            }), /* @__PURE__ */ jsx(Legend, {
              wrapperStyle: {
                color: LIGHT_TEXT
              }
            })]
          })
        })]
      }), /* @__PURE__ */ jsxs("div", {
        className: "chart-box",
        children: [/* @__PURE__ */ jsx("h3", {
          children: "Top Event Types (Leads)"
        }), /* @__PURE__ */ jsx(ResponsiveContainer, {
          width: "100%",
          height: 280,
          children: /* @__PURE__ */ jsxs(BarChart, {
            data: topEvents,
            layout: "vertical",
            children: [/* @__PURE__ */ jsx(CartesianGrid, {
              strokeDasharray: "3 3",
              horizontal: false,
              stroke: DARK_BORDER
            }), /* @__PURE__ */ jsx(XAxis, {
              type: "number",
              fontSize: 12,
              tickLine: false,
              axisLine: false,
              stroke: LIGHT_TEXT
            }), /* @__PURE__ */ jsx(YAxis, {
              dataKey: "type",
              type: "category",
              fontSize: 10,
              tickLine: false,
              axisLine: false,
              width: 100,
              stroke: LIGHT_TEXT
            }), /* @__PURE__ */ jsx(Tooltip, {
              contentStyle: {
                backgroundColor: DARK_SURFACE,
                borderColor: DARK_BORDER,
                color: LIGHT_TEXT
              },
              itemStyle: {
                color: GREEN_ACCENT
              },
              cursor: {
                fill: DARK_BORDER,
                opacity: 0.4
              }
            }), /* @__PURE__ */ jsx(Bar, {
              dataKey: "count",
              fill: GREEN_ACCENT,
              radius: [0, 4, 4, 0]
            })]
          })
        })]
      })]
    }), /* @__PURE__ */ jsxs("div", {
      className: "charts-row",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "chart-box",
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center"
        },
        children: [/* @__PURE__ */ jsx("h3", {
          children: "Lead Journey"
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            display: "flex",
            gap: "2rem",
            marginBottom: "1rem"
          },
          children: [/* @__PURE__ */ jsxs("div", {
            style: {
              textAlign: "center"
            },
            children: [/* @__PURE__ */ jsx("div", {
              style: {
                fontSize: "0.875rem",
                opacity: 0.8,
                marginBottom: "0.25rem"
              },
              children: "Avg Session"
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                fontSize: "2rem",
                fontWeight: "bold",
                color: GREEN_ACCENT
              },
              children: [(leadJourneyData == null ? void 0 : leadJourneyData.avgSessionMinutes) || 0, " min"]
            })]
          }), /* @__PURE__ */ jsxs("div", {
            style: {
              textAlign: "center"
            },
            children: [/* @__PURE__ */ jsx("div", {
              style: {
                fontSize: "0.875rem",
                opacity: 0.8,
                marginBottom: "0.25rem"
              },
              children: "Paid Traffic"
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                fontSize: "2rem",
                fontWeight: "bold",
                color: "#f59e0b"
              },
              children: [(leadJourneyData == null ? void 0 : leadJourneyData.paidPercentage) || 0, "%"]
            })]
          })]
        })]
      }), /* @__PURE__ */ jsxs("div", {
        className: "chart-box",
        children: [/* @__PURE__ */ jsx("h3", {
          children: "Traffic Sources (with Paid Overlay)"
        }), /* @__PURE__ */ jsx(ResponsiveContainer, {
          width: "100%",
          height: 280,
          children: /* @__PURE__ */ jsxs(BarChart, {
            data: (leadJourneyData == null ? void 0 : leadJourneyData.referrerDistribution) || [],
            layout: "vertical",
            children: [/* @__PURE__ */ jsx(CartesianGrid, {
              strokeDasharray: "3 3",
              horizontal: false,
              stroke: DARK_BORDER
            }), /* @__PURE__ */ jsx(XAxis, {
              type: "number",
              fontSize: 12,
              tickLine: false,
              axisLine: false,
              stroke: LIGHT_TEXT,
              domain: [0, 100],
              unit: "%"
            }), /* @__PURE__ */ jsx(YAxis, {
              dataKey: "source",
              type: "category",
              fontSize: 10,
              tickLine: false,
              axisLine: false,
              width: 120,
              stroke: LIGHT_TEXT
            }), /* @__PURE__ */ jsx(Tooltip, {
              contentStyle: {
                backgroundColor: DARK_SURFACE,
                borderColor: DARK_BORDER,
                color: LIGHT_TEXT
              },
              formatter: (value) => [`${value}%`, "Share"]
            }), /* @__PURE__ */ jsx(Bar, {
              dataKey: "percentage",
              fill: GREEN_ACCENT,
              radius: [0, 4, 4, 0]
            }), /* @__PURE__ */ jsx(ReferenceLine, {
              x: (leadJourneyData == null ? void 0 : leadJourneyData.paidPercentage) || 0,
              stroke: "#f59e0b",
              strokeWidth: 2,
              strokeDasharray: "5 5",
              label: {
                value: `Paid: ${(leadJourneyData == null ? void 0 : leadJourneyData.paidPercentage) || 0}%`,
                fill: "#f59e0b",
                fontSize: 10,
                position: "top"
              }
            })]
          })
        })]
      })]
    })]
  });
  const renderKB = () => /* @__PURE__ */ jsx("s-section", {
    heading: "Feed the Brain",
    children: /* @__PURE__ */ jsxs("s-stack", {
      gap: "base",
      children: [/* @__PURE__ */ jsx("s-text", {
        children: "Add new text chunks to the knowledge base. This data is stored locally and used for RAG context."
      }), (actionData == null ? void 0 : actionData.success) && /* @__PURE__ */ jsx("s-banner", {
        tone: "success",
        heading: "Added to Knowledge Base!"
      }), (actionData == null ? void 0 : actionData.error) && /* @__PURE__ */ jsx("s-banner", {
        tone: "critical",
        heading: actionData.error
      }), /* @__PURE__ */ jsx(Form, {
        method: "post",
        children: /* @__PURE__ */ jsxs("s-stack", {
          gap: "base",
          children: [/* @__PURE__ */ jsx("s-text-field", {
            label: "Knowledge Content",
            name: "kb_content",
            rows: "6",
            placeholder: "Ex: Our return policy is 30 days..."
          }), /* @__PURE__ */ jsx("s-button", {
            variant: "primary",
            type: "submit",
            children: "Submit to Brain"
          })]
        })
      })]
    })
  });
  return /* @__PURE__ */ jsxs("s-page", {
    children: [/* @__PURE__ */ jsx("s-text", {
      slot: "title",
      children: "Leki x Tanami"
    }), error && /* @__PURE__ */ jsx("s-banner", {
      tone: "critical",
      heading: error
    }), /* @__PURE__ */ jsxs("s-tabs", {
      ref: tabsRef,
      children: [/* @__PURE__ */ jsx("s-tab", {
        id: "dashboard",
        label: "Dashboard",
        selected: selectedTab === "dashboard"
      }), /* @__PURE__ */ jsx("s-tab", {
        id: "kb",
        label: "Knowledge Base",
        selected: selectedTab === "kb"
      })]
    }), /* @__PURE__ */ jsxs("s-box", {
      padding: "base",
      children: [selectedTab === "dashboard" && renderDashboard(), selectedTab === "kb" && renderKB()]
    })]
  });
});
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action,
  default: app_dashboard,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
const loader = async ({
  request
}) => {
  const {
    redirect: redirect2
  } = await authenticate.admin(request);
  return redirect2("/app/dashboard");
};
const app__index = UNSAFE_withComponentProps(function Index() {
  return null;
});
const headers = ({
  parentHeaders
}) => {
  return parentHeaders;
};
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app__index,
  headers,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-BnMFXfsE.js", "imports": ["/assets/jsx-runtime-B66JxjSA.js", "/assets/chunk-JMJ3UQ3L-BVZKPryQ.js", "/assets/index-DUKIqpmn.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/root-CFLD1yQb.js", "imports": ["/assets/jsx-runtime-B66JxjSA.js", "/assets/chunk-JMJ3UQ3L-BVZKPryQ.js", "/assets/index-DUKIqpmn.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.scopes_update": { "id": "routes/webhooks.app.scopes_update", "parentId": "root", "path": "webhooks/app/scopes_update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.scopes_update-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.uninstalled": { "id": "routes/webhooks.app.uninstalled", "parentId": "root", "path": "webhooks/app/uninstalled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.uninstalled-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.login": { "id": "routes/auth.login", "parentId": "root", "path": "auth/login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/route-BcfhwYJY.js", "imports": ["/assets/chunk-JMJ3UQ3L-BVZKPryQ.js", "/assets/jsx-runtime-B66JxjSA.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_index": { "id": "routes/_index", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/route-xStwRjVx.js", "imports": ["/assets/chunk-JMJ3UQ3L-BVZKPryQ.js", "/assets/jsx-runtime-B66JxjSA.js"], "css": ["/assets/route-Xpdx9QZl.css"], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.$": { "id": "routes/auth.$", "parentId": "root", "path": "auth/*", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/auth._-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app": { "id": "routes/app", "parentId": "root", "path": "app", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": true, "module": "/assets/app-OJTlExqa.js", "imports": ["/assets/chunk-JMJ3UQ3L-BVZKPryQ.js", "/assets/jsx-runtime-B66JxjSA.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.additional": { "id": "routes/app.additional", "parentId": "routes/app", "path": "additional", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app.additional-D8KLrAMJ.js", "imports": ["/assets/chunk-JMJ3UQ3L-BVZKPryQ.js", "/assets/jsx-runtime-B66JxjSA.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.proxy.chat": { "id": "routes/app.proxy.chat", "parentId": "routes/app", "path": "proxy/chat", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app.proxy.chat-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.dashboard": { "id": "routes/app.dashboard", "parentId": "routes/app", "path": "dashboard", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app.dashboard-DH_K2owK.js", "imports": ["/assets/chunk-JMJ3UQ3L-BVZKPryQ.js", "/assets/jsx-runtime-B66JxjSA.js", "/assets/index-DUKIqpmn.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app._index": { "id": "routes/app._index", "parentId": "routes/app", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app._index-C0pHzRRC.js", "imports": ["/assets/chunk-JMJ3UQ3L-BVZKPryQ.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-5a91754d.js", "version": "5a91754d", "sri": void 0 };
const assetsBuildDirectory = "build/client";
const basename = "/";
const future = { "unstable_optimizeDeps": false, "unstable_subResourceIntegrity": false, "v8_middleware": false, "v8_splitRouteModules": false, "v8_viteEnvironmentApi": false };
const ssr = true;
const isSpaMode = false;
const prerender = [];
const routeDiscovery = { "mode": "lazy", "manifestPath": "/__manifest" };
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/webhooks.app.scopes_update": {
    id: "routes/webhooks.app.scopes_update",
    parentId: "root",
    path: "webhooks/app/scopes_update",
    index: void 0,
    caseSensitive: void 0,
    module: route1
  },
  "routes/webhooks.app.uninstalled": {
    id: "routes/webhooks.app.uninstalled",
    parentId: "root",
    path: "webhooks/app/uninstalled",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/auth.login": {
    id: "routes/auth.login",
    parentId: "root",
    path: "auth/login",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/_index": {
    id: "routes/_index",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route4
  },
  "routes/auth.$": {
    id: "routes/auth.$",
    parentId: "root",
    path: "auth/*",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/app": {
    id: "routes/app",
    parentId: "root",
    path: "app",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/app.additional": {
    id: "routes/app.additional",
    parentId: "routes/app",
    path: "additional",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/app.proxy.chat": {
    id: "routes/app.proxy.chat",
    parentId: "routes/app",
    path: "proxy/chat",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/app.dashboard": {
    id: "routes/app.dashboard",
    parentId: "routes/app",
    path: "dashboard",
    index: void 0,
    caseSensitive: void 0,
    module: route9
  },
  "routes/app._index": {
    id: "routes/app._index",
    parentId: "routes/app",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route10
  }
};
export {
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  prerender,
  publicPath,
  routeDiscovery,
  routes,
  ssr
};
