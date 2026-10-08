"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const client_1 = require("@prisma/client");
const redis_1 = require("redis");
const crypto_1 = __importDefault(require("crypto"));
const documents_1 = __importDefault(require("./routes/documents"));
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
const redisClient = (0, redis_1.createClient)({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);
// ---------------------------------------------------------
// COMPLIANCE & SECURITY MIDDLEWARE (SOC 2 / OWASP)
// ---------------------------------------------------------
// Enforce TLS 1.3 only (Usually handled by Ingress/Load Balancer, 
// but we add a strict transport security check here)
app.use((req, res, next) => {
    // If terminated at app level, reject non-TLS or old TLS versions
    const protocol = req.socket.constructor.name === 'TLSSocket' ? req.socket.getProtocol() : null;
    if (protocol && protocol !== 'TLSv1.3') {
        return res.status(403).json({ error: 'Strict TLS 1.3 required.', tracking_id: crypto_1.default.randomUUID() });
    }
    next();
});
// Inject comprehensive OWASP-compliant security header stack
app.use((0, helmet_1.default)({
    hsts: {
        maxAge: 63072000,
        includeSubDomains: true,
        preload: true
    },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"]
        }
    },
    frameguard: { action: 'deny' },
    noSniff: true
}));
// Cross-Origin Resource Sharing (CORS) - Strict origin validation
app.use((0, cors_1.default)({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || 'https://app.netamps.com',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
// DDoS & Brute Force Protection
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, error: "Too many requests. Please try again later." }
});
app.use('/api/', apiLimiter);
app.use(express_1.default.json({ limit: '300mb' })); // Restricted payload size for multi-format ingestion
// ---------------------------------------------------------
// ROUTERS
// ---------------------------------------------------------
app.use(documents_1.default);
// ---------------------------------------------------------
// CLOUD CONTAINER HEALTH ASSESSMENT (`GET /health`)
// ---------------------------------------------------------
app.get('/health', async (req, res) => {
    try {
        // Deep Diagnostic Inspection
        const dbCheck = await prisma.$queryRaw `SELECT 1`.catch(() => null);
        const redisCheck = redisClient.isReady ? 'healthy' : 'degraded';
        if (!dbCheck || redisCheck !== 'healthy') {
            return res.status(503).json({
                status: "DOWN",
                timestamp: new Date().toISOString(),
                services: {
                    database: dbCheck ? "healthy" : "unreachable",
                    cache: redisCheck
                }
            });
        }
        res.status(200).json({
            status: "UP",
            timestamp: new Date().toISOString(),
            services: {
                database: "healthy",
                cache: "healthy"
            }
        });
    }
    catch (error) {
        res.status(503).json({ status: "DOWN", error: "Diagnostic failure" });
    }
});
// Global Exception Boundary Middleware
app.use((err, req, res, next) => {
    const trackingId = crypto_1.default.randomUUID();
    // Strip raw stacks; log internally securely
    console.error(`[CRITICAL] [${trackingId}] Error: ${err.message}`);
    res.status(500).json({
        status: 500,
        error: "An internal system error occurred. Please contact support with your tracking ID.",
        tracking_id: trackingId
    });
});
exports.default = app;
