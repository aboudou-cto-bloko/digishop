/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as account from "../account.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as catalog from "../catalog.js";
import type * as checkout from "../checkout.js";
import type * as coupons from "../coupons.js";
import type * as crons from "../crons.js";
import type * as customers from "../customers.js";
import type * as email_data from "../email/data.js";
import type * as email_log from "../email/log.js";
import type * as email_send from "../email/send.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_brand from "../lib/brand.js";
import type * as lib_centroids from "../lib/centroids.js";
import type * as lib_fx from "../lib/fx.js";
import type * as lib_legal_templates from "../lib/legal_templates.js";
import type * as lib_preview from "../lib/preview.js";
import type * as lib_pricing from "../lib/pricing.js";
import type * as lib_sign from "../lib/sign.js";
import type * as lib_stores from "../lib/stores.js";
import type * as lib_utils from "../lib/utils.js";
import type * as lib_validators from "../lib/validators.js";
import type * as media from "../media.js";
import type * as meta_capi from "../meta/capi.js";
import type * as migrations from "../migrations.js";
import type * as odin from "../odin.js";
import type * as odinApiUpdate from "../odinApiUpdate.js";
import type * as pages from "../pages.js";
import type * as payments_lookup from "../payments/lookup.js";
import type * as payments_moneroo from "../payments/moneroo.js";
import type * as payments_moneroo_client from "../payments/moneroo_client.js";
import type * as payments_saspay from "../payments/saspay.js";
import type * as payments_saspay_client from "../payments/saspay_client.js";
import type * as payments_shared from "../payments/shared.js";
import type * as payments_webhooks from "../payments/webhooks.js";
import type * as payouts from "../payouts.js";
import type * as previews from "../previews.js";
import type * as products from "../products.js";
import type * as push from "../push.js";
import type * as pushNode from "../pushNode.js";
import type * as recovery from "../recovery.js";
import type * as routing from "../routing.js";
import type * as sales from "../sales.js";
import type * as seo from "../seo.js";
import type * as settings from "../settings.js";
import type * as storefront from "../storefront.js";
import type * as stores from "../stores.js";
import type * as tracking from "../tracking.js";
import type * as whatsapp from "../whatsapp.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  account: typeof account;
  analytics: typeof analytics;
  auth: typeof auth;
  catalog: typeof catalog;
  checkout: typeof checkout;
  coupons: typeof coupons;
  crons: typeof crons;
  customers: typeof customers;
  "email/data": typeof email_data;
  "email/log": typeof email_log;
  "email/send": typeof email_send;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/brand": typeof lib_brand;
  "lib/centroids": typeof lib_centroids;
  "lib/fx": typeof lib_fx;
  "lib/legal_templates": typeof lib_legal_templates;
  "lib/preview": typeof lib_preview;
  "lib/pricing": typeof lib_pricing;
  "lib/sign": typeof lib_sign;
  "lib/stores": typeof lib_stores;
  "lib/utils": typeof lib_utils;
  "lib/validators": typeof lib_validators;
  media: typeof media;
  "meta/capi": typeof meta_capi;
  migrations: typeof migrations;
  odin: typeof odin;
  odinApiUpdate: typeof odinApiUpdate;
  pages: typeof pages;
  "payments/lookup": typeof payments_lookup;
  "payments/moneroo": typeof payments_moneroo;
  "payments/moneroo_client": typeof payments_moneroo_client;
  "payments/saspay": typeof payments_saspay;
  "payments/saspay_client": typeof payments_saspay_client;
  "payments/shared": typeof payments_shared;
  "payments/webhooks": typeof payments_webhooks;
  payouts: typeof payouts;
  previews: typeof previews;
  products: typeof products;
  push: typeof push;
  pushNode: typeof pushNode;
  recovery: typeof recovery;
  routing: typeof routing;
  sales: typeof sales;
  seo: typeof seo;
  settings: typeof settings;
  storefront: typeof storefront;
  stores: typeof stores;
  tracking: typeof tracking;
  whatsapp: typeof whatsapp;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
