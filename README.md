# CivicResolve - AI-Powered Civic Issue Reporting Platform

Live demo: https://nikilchandrasekaran-codes.github.io/Civicresolve/

## The Problem
Everyday civic issues like potholes, overflowing garbage, broken streetlights and water leaks affect communities, but reporting them is confusing. Citizens often do not know which department to contact or how to describe the problem, and they cannot see what happens after they report it. Authorities receive unstructured complaints that are hard to sort and prioritize.

## What CivicResolve Does
CivicResolve lets citizens report an issue with a title, description, location and an optional photo. Google Gemini then reads the complaint and automatically gives:
- the issue category
- a priority level (Low, Medium, High, Critical) with a one-line reason
- the recommended department

Citizens can track each complaint through a status timeline (Reported, In Progress, Resolved). An admin dashboard lets officials search and filter complaints, update statuses, and see live counts by status and priority.

## How It Solves the Problem
- Citizens no longer need to know which department to approach, because the AI routes the complaint.
- Urgent cases such as a collapsing bridge are marked Critical, while routine ones stay lower, so authorities can act on the most dangerous issues first.
- The status timeline makes progress visible and transparent.
- If Gemini is busy, the app retries automatically and switches to a lighter model, so reporting keeps working.

## How I Built It
I built this as a solo vibe coding project in one day. I described the app in plain English to Google Antigravity, which generated the HTML, CSS and JavaScript, then tested and improved it step by step. Gemini is called through the Gemini API for classification, priority and department routing. Data is saved in the browser (localStorage and IndexedDB), so no backend is needed. The app is hosted with GitHub Pages.

## Try It (no setup)
1. Open the live demo. The top should say "Gemini: Active".
2. In Citizen Portal, submit a complaint (add a photo if you like).
3. See the AI category, priority, reason and department.
4. Open Admin Dashboard, change the status, and watch the timeline update.

Tip: compare "Streetlight not working near school" (Medium) with "Bridge about to collapse" (Critical).

## Note on the API Key
The demo uses a free, limited key made only for judging. It will be deleted after the results.

## Tech Stack
HTML, CSS, JavaScript, Google Gemini API, Google Antigravity, GitHub Pages

Built by Nikil Chandrasekaran
