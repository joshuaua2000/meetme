# Meetme

A meetup-destination finder for two travelers in different cities — ranks destinations reachable by direct flight from both origins, scored on flight cost, weather, novelty, outdoor activities, nightlife, and cost of living.

## Local development

Because the app loads `cities.json` via `fetch()`, it must be served over HTTP, not opened directly as a file:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Data

`cities.json` contains 380 cities / 432 airports. Run `node validate.js cities.json` after any manual edits to catch structural issues before deploying.
