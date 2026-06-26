# Iron Ledger

Personal workout log designed for phone-first use.

## Data Storage

Workout data is saved in the browser on the device that opens the app. The app uses local storage and auto-saves whenever you edit workouts, exercises, templates, or sets.

GitHub stores and publishes the app code. It does not store your workout data.

Before changing phones, clearing browser data, or reinstalling the PWA, open **Library -> Backup** and export a backup JSON file. Use **Import Backup** on the new phone or browser to restore it.

## Local Development

```powershell
npm.cmd install
npm.cmd run dev -- --port 5173
```

## Build

```powershell
npm.cmd run build
```

## GitHub Pages

Use this folder as the root of a GitHub repository.

1. Push the project to the `main` branch.
2. In GitHub, open **Settings -> Pages**.
3. Set the source to **GitHub Actions**.
4. The workflow in `.github/workflows/deploy.yml` will build and publish `dist`.

The app uses relative asset paths, so it works from either a root domain or a GitHub Pages project path.
