# System Architecture

## Overview

MetLife Assist is designed as a secure, highly-available monolithic web application to serve real-time stadium data and AI-driven concierge services during the 2026 FIFA World Cup.

## Architecture Diagram

```mermaid
graph TD
    Client[Web Browser / PWA] -->|HTTPS| CDN[CDN / Edge Cache]
    CDN -->|Load Balancer| NodeApp[Express.js Node Backend]

    NodeApp -->|API Calls| AI[Google Gemini AI]
    NodeApp -->|Mocked DB| FileSystem[Static JSON Stores]

    NodeApp -->|Security Middleware| HPP[HTTP Parameter Pollution]
    NodeApp -->|Security Middleware| XSS[XSS Clean]
    NodeApp -->|Security Middleware| Helmet[Helmet Headers]

    NodeApp -->|Caching| ApiCache[In-Memory Cache]
```

## Security Posture

- **XSS Protection**: `xss-clean` middleware sterilizes incoming payloads.
- **DDoS Mitigation**: `express-rate-limit` throttles aggressive traffic (100 req/15min).
- **HPP Protection**: `hpp` middleware guards against query string attacks.

## Scalability

- The application is fully containerized via `Dockerfile` allowing for horizontal scaling on orchestration platforms like Kubernetes or Docker Swarm.
- Static assets are cached client-side for 24 hours and offline via Service Workers.
- API responses are cached server-side using `apicache` for 5 minutes, significantly reducing compute load.
