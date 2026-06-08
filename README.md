# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

> **Git LFS required.** The dev-seed video fixtures in `assets/dev/*.mp4` are stored in [Git LFS](https://git-lfs.com). Install it **before/after cloning** or those files arrive as tiny pointer stubs and the dev `+ seed` button breaks:
>
> ```bash
> brew install git-lfs && git lfs install   # one-time
> git lfs pull                              # if you cloned before installing
> ```
>
> The ~400 MB fixture-regen master (`fixtures/bbb_master.mov`) is intentionally **excluded** from normal clones (see `.lfsconfig`); fetch it only when regenerating fixtures: `git lfs pull --include "fixtures/*.mov"`.

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

   This app uses native modules (`expo-camera`), so it needs a **dev build** (`npm run ios` / `npm run android`), not Expo Go. In a dev build, the Home screen has `+ seed` / `clear` buttons that create/remove a "Dev sample" draft from the bundled `assets/dev/` clips — so the editor is exercisable on a simulator with no camera. See [assets/dev/README.md](assets/dev/README.md) and [docs/implementation-status.md](docs/implementation-status.md).

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
