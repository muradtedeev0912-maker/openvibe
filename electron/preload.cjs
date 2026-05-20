// CommonJS preload — Electron requires CJS for preload regardless of project type.
const { contextBridge, ipcRenderer, clipboard } = require("electron");

const api = {
  init: () => ipcRenderer.invoke("vibe:init"),
  send: (text) => ipcRenderer.invoke("vibe:send", text),
  sendParts: (parts, display) =>
    ipcRenderer.invoke("vibe:sendParts", parts, display),
  reset: () => ipcRenderer.invoke("vibe:reset"),
  decide: (id, decision) => ipcRenderer.invoke("vibe:decide", id, decision),
  pickWorkspace: () => ipcRenderer.invoke("vibe:pickWorkspace"),

  window: {
    minimize: () => ipcRenderer.invoke("vibe:window:minimize"),
    maximize: () => ipcRenderer.invoke("vibe:window:maximize"),
    close: () => ipcRenderer.invoke("vibe:window:close"),
  },

  setModel: (model) => ipcRenderer.invoke("vibe:setModel", model),
  setProvider: (apiKey, baseUrl, model) =>
    ipcRenderer.invoke("vibe:setProvider", apiKey, baseUrl, model),

  chats: {
    list: () => ipcRenderer.invoke("vibe:chats:list"),
    new: () => ipcRenderer.invoke("vibe:chats:new"),
    open: (id) => ipcRenderer.invoke("vibe:chats:open", id),
    delete: (id) => ipcRenderer.invoke("vibe:chats:delete", id),
    rename: (id, title) => ipcRenderer.invoke("vibe:chats:rename", id, title),
  },

  projects: {
    list: () => ipcRenderer.invoke("vibe:projects:list"),
    active: () => ipcRenderer.invoke("vibe:projects:active"),
    add: () => ipcRenderer.invoke("vibe:projects:add"),
    setActive: (id) => ipcRenderer.invoke("vibe:projects:setActive", id),
    remove: (id) => ipcRenderer.invoke("vibe:projects:remove", id),
    rename: (id, name) => ipcRenderer.invoke("vibe:projects:rename", id, name),
    close: () => ipcRenderer.invoke("vibe:projects:close"),
  },

  fs: {
    list: (dir) => ipcRenderer.invoke("vibe:fs:list", dir),
    reveal: (path) => ipcRenderer.invoke("vibe:fs:reveal", path),
    read: (path) => ipcRenderer.invoke("vibe:fs:read", path),
    write: (path, content) => ipcRenderer.invoke("vibe:fs:write", path, content),
    rename: (from, to) => ipcRenderer.invoke("vibe:fs:rename", from, to),
    delete: (path) => ipcRenderer.invoke("vibe:fs:delete", path),
    createFile: (dir, name) =>
      ipcRenderer.invoke("vibe:fs:createFile", dir, name),
    createDir: (dir, name) =>
      ipcRenderer.invoke("vibe:fs:createDir", dir, name),
    find: (root, query, limit) =>
      ipcRenderer.invoke("vibe:fs:find", root, query, limit),
    projectInfo: (dir) => ipcRenderer.invoke("vibe:fs:projectInfo", dir),
  },

  clipboard: {
    writeText: (text) => clipboard.writeText(text),
  },

  whisper: {
    transcribe: (audioBase64, mimeType) =>
      ipcRenderer.invoke("vibe:whisper:transcribe", audioBase64, mimeType),
  },

  term: {
    start: (id, cols, rows) =>
      ipcRenderer.invoke("vibe:term:start", id, cols, rows),
    write: (id, data) => ipcRenderer.invoke("vibe:term:write", id, data),
    resize: (id, cols, rows) =>
      ipcRenderer.invoke("vibe:term:resize", id, cols, rows),
    kill: (id) => ipcRenderer.invoke("vibe:term:kill", id),
    onData: (cb) => {
      const listener = (_e, payload) => cb(payload);
      ipcRenderer.on("vibe:term:data", listener);
      return () => ipcRenderer.off("vibe:term:data", listener);
    },
    onExit: (cb) => {
      const listener = (_e, payload) => cb(payload);
      ipcRenderer.on("vibe:term:exit", listener);
      return () => ipcRenderer.off("vibe:term:exit", listener);
    },
  },

  onEvent: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("vibe:event", listener);
    return () => ipcRenderer.off("vibe:event", listener);
  },
  onBusy: (cb) => {
    const listener = (_e, busy) => cb(busy);
    ipcRenderer.on("vibe:busy", listener);
    return () => ipcRenderer.off("vibe:busy", listener);
  },
  onConfirm: (cb) => {
    const listener = (_e, p) => cb(p);
    ipcRenderer.on("vibe:confirm", listener);
    return () => ipcRenderer.off("vibe:confirm", listener);
  },

  onFsChanged: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("vibe:fs:changed", listener);
    return () => ipcRenderer.off("vibe:fs:changed", listener);
  },
};

contextBridge.exposeInMainWorld("vibe", api);

