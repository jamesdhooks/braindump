---
description: "Scaffold a new IPC channel — adds matching ipcMain.handle in electron/main.ts, contextBridge entry in electron/preload.ts, and a typed window.braindump call site in the renderer."
argument-hint: "Describe the channel: e.g. 'read clipboard text and return it to the renderer'"
agent: "agent"
---

Add a new IPC channel to Braindump. The channel name and behaviour are described in my request.

Follow the three-file contract exactly — all three must stay in sync:

## 1. electron/main.ts

Inside the existing `ipcMain.handle` block, register the new handler:

```ts
ipcMain.handle('<group>:<action>', async (_event, args) => {
  // implementation — only main can touch fs, secrets, net
  return result;
});
```

- Pick a `<group>:<action>` name consistent with existing channels (e.g. `store:get`, `secrets:set-key`, `skill:format`).
- All secret/fs/network access belongs here, never in the renderer.

## 2. electron/preload.ts

Inside the `contextBridge.exposeInMainWorld('braindump', { … })` object, add the method under the appropriate group (or create a new group object):

```ts
myGroup: {
  myMethod: (arg: ArgType): Promise<ReturnType> =>
    ipcRenderer.invoke('<group>:<action>', arg),
},
```

- Keep the TypeScript types explicit — no `any`.
- For event listeners, return an unsubscribe function (`() => ipcRenderer.removeListener(…)`).

## 3. Renderer call site

In the component or hook that needs the feature, call:

```ts
const result = await window.braindump.myGroup.myMethod(arg);
```

- Read resulting state from the zustand store ([src/store/index.ts](../src/store/index.ts)) if the channel mutates state.
- Handle the promise rejection or an error-shaped result gracefully (show a toast or degrade silently).

---

Now implement the channel described in my request, following these rules.
