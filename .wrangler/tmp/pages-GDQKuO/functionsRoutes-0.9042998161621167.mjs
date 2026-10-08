import { onRequestPost as __api_email_push_js_onRequestPost } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\email\\push.js"
import { onRequestPost as __api_intake_import_js_onRequestPost } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\intake\\import.js"
import { onRequestGet as __api_intake_sessions_js_onRequestGet } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\intake\\sessions.js"
import { onRequestPost as __api_intake_sessions_js_onRequestPost } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\intake\\sessions.js"
import { onRequestPost as __api_otp_generate_js_onRequestPost } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\otp\\generate.js"
import { onRequestPost as __api_otp_verify_js_onRequestPost } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\otp\\verify.js"
import { onRequestPost as __api_users_create_js_onRequestPost } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\users\\create.js"
import { onRequestPost as __api_users_modify_password_js_onRequestPost } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\users\\modify-password.js"
import { onRequestGet as __api_cdn___path___js_onRequestGet } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\cdn\\[[path]].js"
import { onRequestHead as __api_cdn___path___js_onRequestHead } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\cdn\\[[path]].js"
import { onRequestDelete as __api_logs_js_onRequestDelete } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\logs.js"
import { onRequestGet as __api_logs_js_onRequestGet } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\logs.js"
import { onRequestPost as __api_logs_js_onRequestPost } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\logs.js"
import { onRequestDelete as __api_returns_js_onRequestDelete } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\returns.js"
import { onRequestGet as __api_returns_js_onRequestGet } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\returns.js"
import { onRequestPost as __api_returns_js_onRequestPost } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\returns.js"
import { onRequestPut as __api_returns_js_onRequestPut } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\returns.js"
import { onRequestPost as __api_secure_upload_js_onRequestPost } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\secure-upload.js"
import { onRequestGet as __api_users_js_onRequestGet } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\users.js"
import { onRequestPost as __api_users_js_onRequestPost } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\users.js"
import { onRequest as __api_bindings_status_js_onRequest } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\bindings-status.js"
import { onRequest as __api_status_js_onRequest } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\status.js"
import { onRequest as __api_verify_turnstile_js_onRequest } from "C:\\Users\\Ashok\\Documents\\Default Project\\netamps-landing\\functions\\api\\verify-turnstile.js"

export const routes = [
    {
      routePath: "/api/email/push",
      mountPath: "/api/email",
      method: "POST",
      middlewares: [],
      modules: [__api_email_push_js_onRequestPost],
    },
  {
      routePath: "/api/intake/import",
      mountPath: "/api/intake",
      method: "POST",
      middlewares: [],
      modules: [__api_intake_import_js_onRequestPost],
    },
  {
      routePath: "/api/intake/sessions",
      mountPath: "/api/intake",
      method: "GET",
      middlewares: [],
      modules: [__api_intake_sessions_js_onRequestGet],
    },
  {
      routePath: "/api/intake/sessions",
      mountPath: "/api/intake",
      method: "POST",
      middlewares: [],
      modules: [__api_intake_sessions_js_onRequestPost],
    },
  {
      routePath: "/api/otp/generate",
      mountPath: "/api/otp",
      method: "POST",
      middlewares: [],
      modules: [__api_otp_generate_js_onRequestPost],
    },
  {
      routePath: "/api/otp/verify",
      mountPath: "/api/otp",
      method: "POST",
      middlewares: [],
      modules: [__api_otp_verify_js_onRequestPost],
    },
  {
      routePath: "/api/users/create",
      mountPath: "/api/users",
      method: "POST",
      middlewares: [],
      modules: [__api_users_create_js_onRequestPost],
    },
  {
      routePath: "/api/users/modify-password",
      mountPath: "/api/users",
      method: "POST",
      middlewares: [],
      modules: [__api_users_modify_password_js_onRequestPost],
    },
  {
      routePath: "/api/cdn/:path*",
      mountPath: "/api/cdn",
      method: "GET",
      middlewares: [],
      modules: [__api_cdn___path___js_onRequestGet],
    },
  {
      routePath: "/api/cdn/:path*",
      mountPath: "/api/cdn",
      method: "HEAD",
      middlewares: [],
      modules: [__api_cdn___path___js_onRequestHead],
    },
  {
      routePath: "/api/logs",
      mountPath: "/api",
      method: "DELETE",
      middlewares: [],
      modules: [__api_logs_js_onRequestDelete],
    },
  {
      routePath: "/api/logs",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_logs_js_onRequestGet],
    },
  {
      routePath: "/api/logs",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_logs_js_onRequestPost],
    },
  {
      routePath: "/api/returns",
      mountPath: "/api",
      method: "DELETE",
      middlewares: [],
      modules: [__api_returns_js_onRequestDelete],
    },
  {
      routePath: "/api/returns",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_returns_js_onRequestGet],
    },
  {
      routePath: "/api/returns",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_returns_js_onRequestPost],
    },
  {
      routePath: "/api/returns",
      mountPath: "/api",
      method: "PUT",
      middlewares: [],
      modules: [__api_returns_js_onRequestPut],
    },
  {
      routePath: "/api/secure-upload",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_secure_upload_js_onRequestPost],
    },
  {
      routePath: "/api/users",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_users_js_onRequestGet],
    },
  {
      routePath: "/api/users",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_users_js_onRequestPost],
    },
  {
      routePath: "/api/bindings-status",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_bindings_status_js_onRequest],
    },
  {
      routePath: "/api/status",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_status_js_onRequest],
    },
  {
      routePath: "/api/verify-turnstile",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_verify_turnstile_js_onRequest],
    },
  ]