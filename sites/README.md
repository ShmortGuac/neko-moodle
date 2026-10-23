# Site profiles

A site profile tweaks NEKO for one Moodle site: its name, logo, quick-pick addresses on the login screen,
the single sign-on button label, and how course and person names are tidied up. Profiles are optional;
without one, NEKO uses plain Moodle names and labels.

A profile is a JSON file in this folder, e.g. `sites/example.json`. It applies when the site's address
matches one of its `hosts`.

```jsonc
{
  "name": "Example University",
  "brand": "Example Moodle",                 // shown instead of "NEKO" on this site
  "logo": "example/logo.png",                // optional, relative to this folder
  "hosts": ["moodle.example.edu"],

  // Quick picks on the login screen
  "sites": [
    { "label": "Current year", "url": "https://moodle.example.edu" },
    { "label": "Archive", "url": "https://moodle.example.edu/2025" }
  ],

  "ssoLabel": "Sign in with Example account",
  "loginFooter": "You sign in on Example University's own login page.",
  "disclaimer": "Not affiliated with Example University.",

  // Split "SEM1 CS 2101 Section 02 Data Structures" into code / section / title
  "courseName": {
    "pattern": "^(?:SEM\\s*\\d+\\s+)?([A-Z]{2,6}\\s?\\d{3,5})\\s*(?:Section\\s*(\\w+))?\\s*[-:–]?\\s*(.*)$",
    "flags": "i",
    "code": 1, "section": 2, "title": 3,
    "titleCase": true                         // "DATA STRUCTURES" -> "Data Structures"
  },

  // Greet people by part of their name, e.g. "ALEX TAN BIN ALI" -> "Alex Tan"
  "personName": { "givenNameSplit": "\\s+(?:bin|binti)\\s+", "titleCase": true }
}
```

Every field except `hosts` is optional.
