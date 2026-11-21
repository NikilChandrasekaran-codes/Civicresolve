# Testing

CivicResolve was tested manually, end to end, on the live demo (Chrome, private window) during development.

| # | Test | Result |
|---|------|--------|
| 1 | Submit a pothole complaint on a main road | AI returned High priority, Roads & Infrastructure, Department of Public Works, with a reason |
| 2 | Submit a broken streetlight near a school | AI returned Medium priority, Street Lighting |
| 3 | Submit a garbage pile complaint with a photo | AI returned Medium priority, Sanitation; photo displayed in the list |
| 4 | Submit a bridge about to collapse with a photo | AI returned Critical priority, Public Works |
| 5 | Admin changes a complaint status to In Progress | Status updated in the Citizen Portal too |
| 6 | Open the live link in a private window | Shows "Gemini: Active" with no setup |
| 7 | Test connection button | Reports success and the model used |
| 8 | Gemini busy / model unavailable | App retried and switched to a lighter fallback model |
| 9 | Photo upload | Image stored, resized and shown in Citizen and Admin views |

## How to run the tests yourself
1. Open the live demo.
2. Submit the sample complaints above.
3. Check the AI category, priority, reason and department on the result card.
4. Switch to Admin Dashboard, change a status, and check the timeline in the Citizen Portal.
