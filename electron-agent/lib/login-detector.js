// lib/login-detector.js — detect which services the user is logged into
// Reads Chrome cookies via CDP Network.getAllCookies and maps domains to
// known services. Result is POSTed to /api/agent/context so the UI can
// show personalised prompt suggestions instead of generic defaults.

"use strict";

const { getResolvedUrl } = require("./config");
const log = require("./logger");

// Domain suffix → service key. Matched with endsWith() against cookie domain.
// Order matters: more specific entries first.
const DOMAIN_MAP = [
  // Jobs
  { match: "linkedin.com",     service: "linkedin"    },
  { match: "indeed.com",       service: "indeed"      },
  { match: "glassdoor.com",    service: "glassdoor"   },
  { match: "lever.co",         service: "lever"       },
  { match: "greenhouse.io",    service: "greenhouse"  },
  { match: "workday.com",      service: "workday"     },
  // Email / calendar
  { match: "gmail.com",        service: "gmail"       },
  { match: "mail.google.com",  service: "gmail"       },
  { match: "google.com",       service: "google"      },
  { match: "outlook.com",      service: "outlook"     },
  { match: "office.com",       service: "outlook"     },
  { match: "mail.yahoo.com",   service: "yahoo_mail"  },
  // Shopping
  { match: "amazon.com",       service: "amazon"      },
  { match: "amazon.co.uk",     service: "amazon"      },
  { match: "amazon.de",        service: "amazon"      },
  { match: "ebay.com",         service: "ebay"        },
  { match: "etsy.com",         service: "etsy"        },
  // Social / content
  { match: "twitter.com",      service: "twitter"     },
  { match: "x.com",            service: "twitter"     },
  { match: "instagram.com",    service: "instagram"   },
  { match: "facebook.com",     service: "facebook"    },
  { match: "reddit.com",       service: "reddit"      },
  { match: "youtube.com",      service: "youtube"     },
  { match: "tiktok.com",       service: "tiktok"      },
  // Dev / productivity
  { match: "github.com",       service: "github"      },
  { match: "gitlab.com",       service: "gitlab"      },
  { match: "notion.so",        service: "notion"      },
  { match: "slack.com",        service: "slack"       },
  { match: "discord.com",      service: "discord"     },
  { match: "trello.com",       service: "trello"      },
  { match: "asana.com",        service: "asana"       },
  { match: "jira.atlassian.net", service: "jira"      },
  { match: "linear.app",       service: "linear"      },
  // Finance / sales
  { match: "stripe.com",       service: "stripe"      },
  { match: "quickbooks.intuit.com", service: "quickbooks" },
  { match: "hubspot.com",      service: "hubspot"     },
  { match: "salesforce.com",   service: "salesforce"  },
  // Travel
  { match: "airbnb.com",       service: "airbnb"      },
  { match: "booking.com",      service: "booking"     },
  { match: "expedia.com",      service: "expedia"     },
  { match: "kayak.com",        service: "kayak"       },
  { match: "uber.com",         service: "uber"        },
];

// Cookies that are likely session/auth tokens (short expiry = session cookie = likely logged in)
function _looksLikeSession(cookie) {
  const name = (cookie.name ?? "").toLowerCase();
  // Long-lived auth tokens
  if (/^(session|sess|auth|token|user|uid|logged|remember|jwt|access_token|refresh|li_at|li_rm|x-auth|csrftoken|_session)/.test(name)) return true;
  // Platform-specific known session cookie names
  if (["li_at", "JSESSIONID", "SID", "SSID", "HSID", "LSID", "NID", "1P_JAR",
       "sessionid", "auth_token", "twid", "ct0", "x-twitter-auth",
       "ubid-main", "session-id", "sess-at-main"].includes(cookie.name)) return true;
  return false;
}

async function detect(cdpClient) {
  if (!cdpClient) return [];
  try {
    const { cookies } = await cdpClient.Network.getAllCookies();
    const found = new Set();
    for (const c of cookies) {
      const domain = (c.domain ?? "").replace(/^\./, "").toLowerCase();
      if (!_looksLikeSession(c)) continue;
      for (const entry of DOMAIN_MAP) {
        if (domain === entry.match || domain.endsWith("." + entry.match)) {
          found.add(entry.service);
          break;
        }
      }
    }
    return [...found];
  } catch (err) {
    log.debug(`[LoginDetector] cookie scan failed: ${err.message}`);
    return [];
  }
}

async function detectAndPost(cdpClient) {
  const services = await detect(cdpClient);
  if (services.length === 0) return;
  log.info(`[LoginDetector] detected: ${services.join(", ")}`);
  try {
    await fetch(`${getResolvedUrl()}/api/agent/context`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ services }),
    });
  } catch (err) {
    log.debug(`[LoginDetector] POST failed: ${err.message}`);
  }
}

module.exports = { detect, detectAndPost };
