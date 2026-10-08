"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
const https_1 = require("firebase-functions/v2/https");
const server_1 = __importDefault(require("./server")); // Import the Express app
// Export the Express API as a Firebase Cloud Function (v2)
// This makes the entire Express backend Serverless and SOC 2 compatible,
// running securely on Google Cloud Run via Firebase.
exports.api = (0, https_1.onRequest)({
    memory: "1GiB",
    timeoutSeconds: 60,
    region: "us-central1", // Or your preferred SOC 2 compliance region
    minInstances: 1, // Prevent cold starts for critical transactions
    maxInstances: 50, // Autoscaling boundary
}, server_1.default);
