# FixIT Volt Matcher ⚡

> **AI-powered platform that connects homeowners with skilled electricians through intelligent fault diagnosis.**
> Live at → [fixitvolt.pages.dev](https://fixitvolt.pages.dev)

---

## The Problem

Finding a reliable electrician in Pakistan means asking around, hoping someone knows someone. There is no structured way to find professionals, no ratings to trust, and no accountability. The entire market runs on informal word-of-mouth.

FixIT solves this by giving both sides a structured platform — and letting AI do the matching.

---

## What FixIT Does

FixIT is a service marketplace with two modes of finding help:

**Mode 1 — AI-Assisted Matching:** A homeowner photographs their electrical fault. Our AI vision pipeline analyzes the image, identifies the fault type and severity, and uses that diagnosis to recommend the most relevant available electricians — matched by what is actually broken, not just who is nearby.

**Mode 2 — Open Job Posting:** The homeowner describes their problem in text and posts it. Available electricians can browse open jobs and reach out. No AI required, just a clean structured feed.

Once a match is made either way, the user and electrician communicate through real-time chat to discuss scope and agree on pricing. The actual job happens in person — FixIT is the medium that gets them there, not a payment or booking system.

After the job is completed, the customer can leave a **rating for the electrician**. Over time, electricians build a visible reputation score. Users can factor this rating into their next hiring decision — creating a trust layer that did not exist before in Pakistan's informal electrician market.

---

## Key Features

- **AI Photo Diagnosis** — Upload an image of your electrical problem, our multi-model vision AI identifies the fault and suggests matched electricians
- **Open Job Posting** — Post a job manually and wait for electricians to respond, no AI required
- **Electrician Ratings** — Users rate electricians after job completion; ratings are visible and influence future matches
- **Role-Based Platform** — Separate dashboards and flows for customers and electricians
- **Real-Time Chat** — Built-in messaging between user and electrician to discuss job scope and pricing before meeting
- **Secure Authentication** — Supabase-powered auth with role-based access (customer vs electrician)
- **Live & Deployed** — Fully functional, not a prototype

---

## AI System — Multi-Provider Fallback

Rather than depending on a single AI provider, our AI service dynamically routes image analysis requests across **3 providers** and **8 models** with automatic fallback. If one provider fails, rate-limits, or times out, the next model is tried instantly — the user never sees a failure.

**Provider 1 — GitHub Models**
```
Llama-4-Maverick-17B-128E-Instruct-FP8
Llama-3-2-90B-Vision-Instruct
Phi-4-multimodal-instruct
Llama-3-2-11B-Vision-Instruct
```

**Provider 2 — NVIDIA NIM**
```
qwen/qwen3.5-397b-a17b
meta/llama-3.2-90b-vision-instruct
microsoft/phi-4-multimodal-instruct
```

**Provider 3 — Google Gemini**
```
gemini-2.5-flash-lite
```

No model is hardcoded as primary. The system picks based on availability at the time of the request, making the AI layer resilient and production-grade.

---

## Architecture

5 independently deployed microservices on HuggingFace Spaces, coordinated by a central orchestrator. The frontend is a static site on Cloudflare Pages talking only to the orchestrator.

```
Cloudflare Pages (Frontend)
        │
        ▼
fixit-orchestrator   ← routes every request to the right service
   ├── fixit-ai          AI image diagnosis + matching logic
   ├── fixit-jobs        Job creation, listing, accept/decline
   ├── fixit-users       User profiles, roles, ratings
   └── fixit-chat        Real-time messaging threads
        │
        ▼
   Supabase (PostgreSQL + Auth)
```

| Service | Role |
|---|---|
| `fixit-orchestrator` | Central router — all frontend traffic flows through here |
| `fixit-ai` | Multi-provider vision pipeline — fault diagnosis and electrician matching |
| `fixit-jobs` | Full job lifecycle — post, browse, accept, decline, close |
| `fixit-users` | Profiles, role management, electrician rating storage |
| `fixit-chat` | Real-time conversation threads between matched parties |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML · CSS · JavaScript |
| Frontend Hosting | Cloudflare Pages |
| Backend | Node.js · Express.js |
| Backend Hosting | HuggingFace Spaces (Dockerized) |
| Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth |
| AI Provider 1 | GitHub Models |
| AI Provider 2 | NVIDIA NIM |
| AI Provider 3 | Google Gemini |
| Architecture | Microservices + Central Orchestrator |

---

## Live Links

| | URL |
|---|---|
| **Live Website** | https://fixitvolt.pages.dev |
| **Frontend Code** | https://github.com/fixitvoltmatch/Fixit-Volt-Matcher |
| **All Backend Services** | https://huggingface.co/Fixit-Volt-Matcher |
| AI Service | https://huggingface.co/spaces/Fixit-Volt-Matcher/fixit-ai |
| Orchestrator | https://huggingface.co/spaces/Fixit-Volt-Matcher/fixit-orchestrator |
| Jobs Service | https://huggingface.co/spaces/Fixit-Volt-Matcher/fixit-jobs |
| Users Service | https://huggingface.co/spaces/Fixit-Volt-Matcher/fixit-users |
| Chat Service | https://huggingface.co/spaces/Fixit-Volt-Matcher/fixit-chat |

---

## Team

Built for the **HEC GenAI Hackathon — Cohort 3 (Learning Phase)**

| Name | Role |
|---|---|
| Dua Adnan | Team Lead |
| Muhammad Ammar Tariq | Developer |
| Abdullah Adnan | Developer |
| *(add remaining members)* | |
