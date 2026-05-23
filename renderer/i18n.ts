// Lightweight i18n for OpenVibe. Translations live inline in this file so
// there's no extra build/loader plumbing. Components subscribe via `useT()`
// and re-render whenever the language changes.

import { useCallback, useEffect, useState } from "react";

export type Language =
  | "English"
  | "Русский"
  | "Español"
  | "Deutsch"
  | "Français"
  | "中文";

const STORAGE_KEY = "vibe_language";
const EVENT_NAME = "vibe-lang-change";

export function getCurrentLanguage(): Language {
  return (localStorage.getItem(STORAGE_KEY) as Language) || "English";
}

export function setCurrentLanguage(lang: Language): void {
  localStorage.setItem(STORAGE_KEY, lang);
  window.dispatchEvent(new Event(EVENT_NAME));
}

type Dict = Record<Language, string>;

export const translations: Record<string, Dict> = {
  // ===== Common =====
  "common.close": { English: "Close", Русский: "Закрыть", Español: "Cerrar", Deutsch: "Schließen", Français: "Fermer", 中文: "关闭" },
  "common.cancel": { English: "Cancel", Русский: "Отмена", Español: "Cancelar", Deutsch: "Abbrechen", Français: "Annuler", 中文: "取消" },
  "common.save": { English: "Save", Русский: "Сохранить", Español: "Guardar", Deutsch: "Speichern", Français: "Enregistrer", 中文: "保存" },
  "common.saving": { English: "saving…", Русский: "сохранение…", Español: "guardando…", Deutsch: "Speichern…", Français: "enregistrement…", 中文: "保存中…" },
  "common.saved": { English: "saved", Русский: "сохранено", Español: "guardado", Deutsch: "gespeichert", Français: "enregistré", 中文: "已保存" },
  "common.connect": { English: "Connect", Русский: "Подключить", Español: "Conectar", Deutsch: "Verbinden", Français: "Connecter", 中文: "连接" },
  "common.disconnect": { English: "Disconnect", Русский: "Отключить", Español: "Desconectar", Deutsch: "Trennen", Français: "Déconnecter", 中文: "断开" },
  "common.edit": { English: "Edit", Русский: "Изменить", Español: "Editar", Deutsch: "Bearbeiten", Français: "Modifier", 中文: "编辑" },
  "common.delete": { English: "Delete", Русский: "Удалить", Español: "Eliminar", Deutsch: "Löschen", Français: "Supprimer", 中文: "删除" },
  "common.rename": { English: "Rename", Русский: "Переименовать", Español: "Renombrar", Deutsch: "Umbenennen", Français: "Renommer", 中文: "重命名" },
  "common.remove": { English: "Remove", Русский: "Удалить", Español: "Quitar", Deutsch: "Entfernen", Français: "Retirer", 中文: "移除" },
  "common.back": { English: "Back", Русский: "Назад", Español: "Atrás", Deutsch: "Zurück", Français: "Retour", 中文: "返回" },
  "common.loading": { English: "loading…", Русский: "загрузка…", Español: "cargando…", Deutsch: "Laden…", Français: "chargement…", 中文: "加载中…" },
  "common.searching": { English: "searching…", Русский: "поиск…", Español: "buscando…", Deutsch: "Suche…", Français: "recherche…", 中文: "搜索中…" },
  "common.no_matches": { English: "no matches", Русский: "нет совпадений", Español: "sin coincidencias", Deutsch: "keine Treffer", Français: "aucun résultat", 中文: "无匹配项" },
  "common.thinking": { English: "thinking…", Русский: "думаю…", Español: "pensando…", Deutsch: "denke…", Français: "réflexion…", 中文: "思考中…" },
  "common.copied": { English: "copied", Русский: "скопировано", Español: "copiado", Deutsch: "kopiert", Français: "copié", 中文: "已复制" },
  "common.starting": { English: "starting…", Русский: "запуск…", Español: "iniciando…", Deutsch: "Starten…", Français: "démarrage…", 中文: "启动中…" },
  "common.untitled": { English: "Untitled", Русский: "Без названия", Español: "Sin título", Deutsch: "Unbenannt", Français: "Sans titre", 中文: "未命名" },

  // ===== Settings =====
  "settings.title": { English: "Settings", Русский: "Настройки", Español: "Configuración", Deutsch: "Einstellungen", Français: "Paramètres", 中文: "设置" },
  "settings.general": { English: "General", Русский: "Основные", Español: "General", Deutsch: "Allgemein", Français: "Général", 中文: "常规" },
  "settings.providers": { English: "Providers", Русский: "Провайдеры", Español: "Proveedores", Deutsch: "Anbieter", Français: "Fournisseurs", 中文: "提供商" },
  "settings.language": { English: "Language", Русский: "Язык", Español: "Idioma", Deutsch: "Sprache", Français: "Langue", 中文: "语言" },
  "settings.language_desc": { English: "Change the display language of OpenVibe", Русский: "Изменить язык интерфейса OpenVibe", Español: "Cambia el idioma de la interfaz de OpenVibe", Deutsch: "Ändert die Anzeigesprache von OpenVibe", Français: "Modifie la langue d'affichage d'OpenVibe", 中文: "更改 OpenVibe 的显示语言" },
  "settings.theme": { English: "Theme", Русский: "Тема", Español: "Tema", Deutsch: "Design", Français: "Thème", 中文: "主题" },
  "settings.theme_desc": { English: "Switch between dark and light appearance", Русский: "Переключение между тёмной и светлой темой", Español: "Cambia entre apariencia oscura y clara", Deutsch: "Wechseln zwischen hellem und dunklem Erscheinungsbild", Français: "Basculer entre l'apparence sombre et claire", 中文: "在深色与浅色外观间切换" },
  "settings.theme.dark": { English: "Dark", Русский: "Тёмная", Español: "Oscuro", Deutsch: "Dunkel", Français: "Sombre", 中文: "深色" },
  "settings.theme.light": { English: "Light", Русский: "Светлая", Español: "Claro", Deutsch: "Hell", Français: "Clair", 中文: "浅色" },
  "settings.avatar_shape": { English: "Project icon shape", Русский: "Форма иконок проектов", Español: "Forma del icono del proyecto", Deutsch: "Form der Projekt-Icons", Français: "Forme des icônes de projet", 中文: "项目图标形状" },
  "settings.avatar_shape_desc": { English: "Square or round avatars in the project rail", Русский: "Квадратные или круглые аватары в боковой панели проектов", Español: "Avatares cuadrados o redondos en la barra de proyectos", Deutsch: "Quadratische oder runde Avatare in der Projektleiste", Français: "Avatars carrés ou ronds dans la barre des projets", 中文: "项目侧栏头像为方形或圆形" },
  "settings.avatar_shape.square": { English: "Square", Русский: "Квадрат", Español: "Cuadrado", Deutsch: "Quadrat", Français: "Carré", 中文: "方形" },
  "settings.avatar_shape.round": { English: "Round", Русский: "Круг", Español: "Redondo", Deutsch: "Rund", Français: "Rond", 中文: "圆形" },
  "settings.composer_style": { English: "Composer style", Русский: "Стиль поля ввода", Español: "Estilo del compositor", Deutsch: "Eingabeleisten-Stil", Français: "Style du compositeur", 中文: "输入框样式" },
  "settings.composer_style_desc": { English: "Compact single-line bar or expanded multi-line box", Русский: "Компактная строка или расширенное многострочное поле", Español: "Barra compacta de una línea o cuadro extendido multilínea", Deutsch: "Kompakte einzeilige Leiste oder erweiterte mehrzeilige Box", Français: "Barre compacte sur une ligne ou bloc étendu multiligne", 中文: "紧凑单行栏或展开多行框" },
  "settings.composer_style.compact": { English: "Compact", Русский: "Компактный", Español: "Compacto", Deutsch: "Kompakt", Français: "Compact", 中文: "紧凑" },
  "settings.composer_style.expanded": { English: "Expanded", Русский: "Расширенный", Español: "Extendido", Deutsch: "Erweitert", Français: "Étendu", 中文: "展开" },
  "settings.terminal_shell": { English: "Terminal Shell", Русский: "Оболочка терминала", Español: "Shell del terminal", Deutsch: "Terminal-Shell", Français: "Shell du terminal", 中文: "终端 Shell" },
  "settings.terminal_shell_desc": { English: "Choose the shell used for new terminals. Existing terminals keep their current shell.", Русский: "Выберите оболочку для новых терминалов. Открытые терминалы сохранят текущую оболочку.", Español: "Elige el shell para nuevos terminales. Los terminales abiertos mantienen su shell actual.", Deutsch: "Wähle die Shell für neue Terminals. Bestehende Terminals behalten ihre Shell.", Français: "Choisissez le shell pour les nouveaux terminaux. Les terminaux ouverts conservent leur shell.", 中文: "为新终端选择 Shell。已打开的终端会保留原有 Shell。" },
  "settings.shell.powershell": { English: "PowerShell", Русский: "PowerShell", Español: "PowerShell", Deutsch: "PowerShell", Français: "PowerShell", 中文: "PowerShell" },
  "settings.shell.cmd": { English: "Command Prompt", Русский: "Командная строка", Español: "Símbolo del sistema", Deutsch: "Eingabeaufforderung", Français: "Invite de commandes", 中文: "命令提示符" },
  "settings.shell.bash": { English: "Bash", Русский: "Bash", Español: "Bash", Deutsch: "Bash", Français: "Bash", 中文: "Bash" },
  "settings.connected": { English: "Connected", Русский: "Подключено", Español: "Conectado", Deutsch: "Verbunden", Français: "Connecté", 中文: "已连接" },
  "settings.add_provider": { English: "Add provider", Русский: "Добавить провайдера", Español: "Añadir proveedor", Deutsch: "Anbieter hinzufügen", Français: "Ajouter un fournisseur", 中文: "添加提供商" },
  "settings.custom_provider": { English: "Custom provider", Русский: "Свой провайдер", Español: "Proveedor personalizado", Deutsch: "Eigener Anbieter", Français: "Fournisseur personnalisé", 中文: "自定义提供商" },
  "settings.custom_provider_desc": { English: "Any OpenAI-compatible endpoint", Русский: "Любой OpenAI-совместимый эндпоинт", Español: "Cualquier endpoint compatible con OpenAI", Deutsch: "Jeder OpenAI-kompatible Endpunkt", Français: "Tout endpoint compatible OpenAI", 中文: "任何兼容 OpenAI 的接口" },
  "settings.edit_provider": { English: "Edit provider", Русский: "Изменить провайдера", Español: "Editar proveedor", Deutsch: "Anbieter bearbeiten", Français: "Modifier le fournisseur", 中文: "编辑提供商" },
  "settings.connect_to": { English: "Connect your API key to {name} to use its models in OpenVibe", Русский: "Подключите API-ключ к {name}, чтобы использовать его модели в OpenVibe", Español: "Conecta tu clave API a {name} para usar sus modelos en OpenVibe", Deutsch: "Verbinde deinen API-Schlüssel mit {name}, um dessen Modelle in OpenVibe zu verwenden", Français: "Connectez votre clé API à {name} pour utiliser ses modèles dans OpenVibe", 中文: "连接你的 {name} API 密钥以在 OpenVibe 中使用其模型" },
  "settings.name": { English: "Name", Русский: "Имя", Español: "Nombre", Deutsch: "Name", Français: "Nom", 中文: "名称" },
  "settings.name_placeholder": { English: "My provider", Русский: "Мой провайдер", Español: "Mi proveedor", Deutsch: "Mein Anbieter", Français: "Mon fournisseur", 中文: "我的提供商" },
  "settings.base_url": { English: "Base URL", Русский: "Базовый URL", Español: "URL base", Deutsch: "Basis-URL", Français: "URL de base", 中文: "基础 URL" },
  "settings.api_key": { English: "API Key", Русский: "API-ключ", Español: "Clave API", Deutsch: "API-Schlüssel", Français: "Clé API", 中文: "API 密钥" },
  "settings.model": { English: "Model", Русский: "Модель", Español: "Modelo", Deutsch: "Modell", Français: "Modèle", 中文: "模型" },
  "settings.model_placeholder": { English: "model-id (e.g. gpt-4o)", Русский: "id модели (напр. gpt-4o)", Español: "id de modelo (p. ej. gpt-4o)", Deutsch: "Modell-ID (z. B. gpt-4o)", Français: "id du modèle (ex. gpt-4o)", 中文: "模型 ID（例如 gpt-4o）" },
  "settings.model_hint": { English: "Required. This will appear in /model list.", Русский: "Обязательно. Будет показано в /model.", Español: "Requerido. Aparecerá en la lista /model.", Deutsch: "Erforderlich. Erscheint in der /model-Liste.", Français: "Requis. Apparaîtra dans la liste /model.", 中文: "必填，将显示在 /model 列表中。" },

  // ===== App / Welcome =====
  "app.fatal_title": { English: "Couldn't start vibe", Русский: "Не удалось запустить vibe", Español: "No se pudo iniciar vibe", Deutsch: "vibe konnte nicht gestartet werden", Français: "Impossible de lancer vibe", 中文: "无法启动 vibe" },
  "app.fatal_hint_prefix": { English: "Set", Русский: "Укажите", Español: "Configura", Deutsch: "Setze", Français: "Définissez", 中文: "请设置" },
  "app.fatal_hint_suffix": { English: " in a .env next to vibe, in ~/.vibe/config, or as an environment variable.", Русский: " в .env рядом с vibe, в ~/.vibe/config или как переменную окружения.", Español: " en un .env junto a vibe, en ~/.vibe/config o como variable de entorno.", Deutsch: " in einer .env neben vibe, in ~/.vibe/config oder als Umgebungsvariable.", Français: " dans un .env à côté de vibe, dans ~/.vibe/config, ou comme variable d'environnement.", 中文: "请在 vibe 同目录的 .env、~/.vibe/config 或环境变量中设置。" },
  "welcome.no_project": { English: "No project open. Pick a folder to start a session in it.", Русский: "Нет открытого проекта. Выберите папку, чтобы начать сессию.", Español: "Ningún proyecto abierto. Elige una carpeta para empezar.", Deutsch: "Kein Projekt geöffnet. Wähle einen Ordner, um zu starten.", Français: "Aucun projet ouvert. Choisissez un dossier pour commencer.", 中文: "未打开项目。选择文件夹以开始会话。" },
  "welcome.open_project": { English: "Open Project", Русский: "Открыть проект", Español: "Abrir proyecto", Deutsch: "Projekt öffnen", Français: "Ouvrir un projet", 中文: "打开项目" },

  // ===== Tabs / toolbar =====
  "tabs.chat": { English: "Chat", Русский: "Чат", Español: "Chat", Deutsch: "Chat", Français: "Chat", 中文: "聊天" },
  "tabs.terminal": { English: "Terminal", Русский: "Терминал", Español: "Terminal", Deutsch: "Terminal", Français: "Terminal", 中文: "终端" },
  "tabs.editor": { English: "Editor", Русский: "Редактор", Español: "Editor", Deutsch: "Editor", Français: "Éditeur", 中文: "编辑器" },
  "tabs.toggle_files": { English: "Toggle files", Русский: "Показать файлы", Español: "Alternar archivos", Deutsch: "Dateien umschalten", Français: "Basculer les fichiers", 中文: "切换文件" },
  "tabs.mcp_servers": { English: "MCP Servers", Русский: "MCP-серверы", Español: "Servidores MCP", Deutsch: "MCP-Server", Français: "Serveurs MCP", 中文: "MCP 服务器" },
  "tabs.snapshots": { English: "Project Snapshots", Русский: "Снимки проекта", Español: "Instantáneas del proyecto", Deutsch: "Projekt-Snapshots", Français: "Instantanés du projet", 中文: "项目快照" },

  // ===== Slash help / commands =====
  "slash.help": { English: "/help    show this list\n/model   show active model and endpoint\n/new     create project from template\n/exit    quit", Русский: "/help    показать этот список\n/model   активная модель и эндпоинт\n/new     создать проект из шаблона\n/exit    выйти", Español: "/help    muestra esta lista\n/model   muestra el modelo y endpoint actuales\n/new     crear proyecto desde plantilla\n/exit    salir", Deutsch: "/help    zeigt diese Liste\n/model   aktives Modell und Endpunkt\n/new     Projekt aus Vorlage erstellen\n/exit    beenden", Français: "/help    affiche cette liste\n/model   modèle et endpoint actifs\n/new     créer un projet depuis un modèle\n/exit    quitter", 中文: "/help    显示此列表\n/model   显示当前模型和端点\n/new     从模板创建项目\n/exit    退出" },
  "slash.no_models": { English: "No models connected yet. Open Settings to add a provider.", Русский: "Модели не подключены. Откройте Настройки, чтобы добавить провайдера.", Español: "Aún no hay modelos conectados. Abre Configuración para añadir un proveedor.", Deutsch: "Noch keine Modelle verbunden. Öffne die Einstellungen, um einen Anbieter hinzuzufügen.", Français: "Aucun modèle connecté. Ouvrez les Paramètres pour ajouter un fournisseur.", 中文: "尚未连接模型。请打开设置以添加提供商。" },
  "slash.switched_to": { English: "Switched to: {model}", Русский: "Переключено на: {model}", Español: "Cambiado a: {model}", Deutsch: "Gewechselt zu: {model}", Français: "Basculé vers : {model}", 中文: "已切换到：{model}" },
  "slash.template_not_found": { English: "Template not found: {arg}", Русский: "Шаблон не найден: {arg}", Español: "Plantilla no encontrada: {arg}", Deutsch: "Vorlage nicht gefunden: {arg}", Français: "Modèle introuvable : {arg}", 中文: "未找到模板：{arg}" },
  "slash.unknown": { English: "unknown command: {cmd}", Русский: "неизвестная команда: {cmd}", Español: "comando desconocido: {cmd}", Deutsch: "Unbekannter Befehl: {cmd}", Français: "commande inconnue : {cmd}", 中文: "未知命令：{cmd}" },
  "slash.cmd.help": { English: "Show all slash commands", Русский: "Показать все слэш-команды", Español: "Mostrar todos los comandos /", Deutsch: "Alle Slash-Befehle anzeigen", Français: "Afficher toutes les commandes /", 中文: "显示所有斜杠命令" },
  "slash.cmd.clear": { English: "Clear conversation history and free context", Русский: "Очистить историю и контекст", Español: "Borrar historial y liberar contexto", Deutsch: "Verlauf leeren und Kontext freigeben", Français: "Effacer l'historique et libérer le contexte", 中文: "清除对话历史并释放上下文" },
  "slash.cmd.reset": { English: "Alias for /clear", Русский: "Псевдоним для /clear", Español: "Alias de /clear", Deutsch: "Alias für /clear", Français: "Alias de /clear", 中文: "/clear 的别名" },
  "slash.cmd.cwd": { English: "Print the current working directory", Русский: "Показать текущий каталог", Español: "Mostrar el directorio actual", Deutsch: "Aktuelles Arbeitsverzeichnis anzeigen", Français: "Afficher le répertoire courant", 中文: "显示当前工作目录" },
  "slash.cmd.model": { English: "Show the active model and endpoint", Русский: "Показать активную модель и эндпоинт", Español: "Mostrar modelo y endpoint activos", Deutsch: "Aktives Modell und Endpunkt anzeigen", Français: "Afficher le modèle et l'endpoint actifs", 中文: "显示当前模型和端点" },
  "slash.cmd.new": { English: "Create project from template", Русский: "Создать проект из шаблона", Español: "Crear proyecto desde plantilla", Deutsch: "Projekt aus Vorlage erstellen", Français: "Créer un projet depuis un modèle", 中文: "从模板创建项目" },
  "slash.cmd.exit": { English: "Quit vibe", Русский: "Выйти из vibe", Español: "Salir de vibe", Deutsch: "vibe beenden", Français: "Quitter vibe", 中文: "退出 vibe" },

  // ===== ChatSidebar =====
  "chatside.search": { English: "Search", Русский: "Поиск", Español: "Buscar", Deutsch: "Suchen", Français: "Rechercher", 中文: "搜索" },
  "chatside.new_session": { English: "New session", Русский: "Новая сессия", Español: "Nueva sesión", Deutsch: "Neue Sitzung", Français: "Nouvelle session", 中文: "新会话" },
  "chatside.no_matches": { English: "No matches", Русский: "Нет совпадений", Español: "Sin coincidencias", Deutsch: "Keine Treffer", Français: "Aucun résultat", 中文: "无匹配项" },
  "chatside.no_sessions": { English: "No sessions yet", Русский: "Сессий пока нет", Español: "Aún no hay sesiones", Deutsch: "Noch keine Sitzungen", Français: "Aucune session", 中文: "暂无会话" },
  "chatside.more": { English: "More", Русский: "Ещё", Español: "Más", Deutsch: "Mehr", Français: "Plus", 中文: "更多" },

  // ===== ChatRail =====
  "rail.toggle_sessions": { English: "Toggle sessions", Русский: "Переключить сессии", Español: "Alternar sesiones", Deutsch: "Sitzungen umschalten", Français: "Basculer les sessions", 中文: "切换会话" },
  "rail.show_sessions": { English: "Show sessions", Русский: "Показать сессии", Español: "Mostrar sesiones", Deutsch: "Sitzungen anzeigen", Français: "Afficher les sessions", 中文: "显示会话" },
  "rail.hide_sessions": { English: "Hide sessions", Русский: "Скрыть сессии", Español: "Ocultar sesiones", Deutsch: "Sitzungen ausblenden", Français: "Masquer les sessions", 中文: "隐藏会话" },
  "rail.open_folder": { English: "Open folder", Русский: "Открыть папку", Español: "Abrir carpeta", Deutsch: "Ordner öffnen", Français: "Ouvrir le dossier", 中文: "打开文件夹" },
  "rail.settings": { English: "Settings", Русский: "Настройки", Español: "Configuración", Deutsch: "Einstellungen", Français: "Paramètres", 中文: "设置" },
  "rail.close_project": { English: "Close project", Русский: "Закрыть проект", Español: "Cerrar proyecto", Deutsch: "Projekt schließen", Français: "Fermer le projet", 中文: "关闭项目" },
  "rail.open_project": { English: "Open project", Русский: "Открыть проект", Español: "Abrir proyecto", Deutsch: "Projekt öffnen", Français: "Ouvrir le projet", 中文: "打开项目" },
  "rail.reveal_explorer": { English: "Reveal in file explorer", Русский: "Показать в проводнике", Español: "Mostrar en el explorador", Deutsch: "Im Datei-Explorer anzeigen", Français: "Afficher dans l'explorateur", 中文: "在文件资源管理器中显示" },
  "rail.remove_from_list": { English: "Remove from list", Русский: "Удалить из списка", Español: "Quitar de la lista", Deutsch: "Aus Liste entfernen", Français: "Retirer de la liste", 中文: "从列表移除" },

  // ===== Composer =====
  "composer.placeholder": { English: "Ask anything, type / for commands", Русский: "Проси, что хочешь, для команд /", Español: "Pregunta lo que quieras, escribe / para comandos", Deutsch: "Frag, was du willst, / für Befehle", Français: "Demandez ce que vous voulez, / pour les commandes", 中文: "想问什么都行，输入 / 调用命令" },
  "composer.placeholder_thinking": { English: "thinking…", Русский: "думаю…", Español: "pensando…", Deutsch: "denke…", Français: "réflexion…", 中文: "思考中…" },
  "composer.stop": { English: "Stop generation", Русский: "Остановить генерацию", Español: "Detener generación", Deutsch: "Generierung stoppen", Français: "Arrêter la génération", 中文: "停止生成" },
  "composer.attach_image": { English: "Attach image", Русский: "Прикрепить изображение", Español: "Adjuntar imagen", Deutsch: "Bild anhängen", Français: "Joindre une image", 中文: "附加图片" },
  "composer.send": { English: "Send", Русский: "Отправить", Español: "Enviar", Deutsch: "Senden", Français: "Envoyer", 中文: "发送" },
  "composer.remove": { English: "Remove", Русский: "Удалить", Español: "Quitar", Deutsch: "Entfernen", Français: "Retirer", 中文: "移除" },
  "composer.hint": { English: "Enter to send · Shift+Enter for newline · @ for files · / for commands · drop or paste images", Русский: "Enter — отправить · Shift+Enter — новая строка · @ — файлы · / — команды · перетащите или вставьте изображение", Español: "Enter para enviar · Shift+Enter para nueva línea · @ para archivos · / para comandos · arrastra o pega imágenes", Deutsch: "Enter zum Senden · Shift+Enter für neue Zeile · @ für Dateien · / für Befehle · Bilder per Drop oder Paste", Français: "Entrée pour envoyer · Maj+Entrée pour nouvelle ligne · @ pour les fichiers · / pour les commandes · déposez ou collez des images", 中文: "回车发送 · Shift+回车换行 · @ 引用文件 · / 调用命令 · 拖放或粘贴图片" },

  // ===== Editor =====
  "editor.save": { English: "save", Русский: "сохранить", Español: "guardar", Deutsch: "speichern", Français: "enregistrer", 中文: "保存" },
  "editor.saving": { English: "saving…", Русский: "сохранение…", Español: "guardando…", Deutsch: "Speichern…", Français: "enregistrement…", 中文: "保存中…" },
  "editor.saved": { English: "saved", Русский: "сохранено", Español: "guardado", Deutsch: "gespeichert", Français: "enregistré", 中文: "已保存" },
  "editor.save_tooltip": { English: "Save (Ctrl+S)", Русский: "Сохранить (Ctrl+S)", Español: "Guardar (Ctrl+S)", Deutsch: "Speichern (Strg+S)", Français: "Enregistrer (Ctrl+S)", 中文: "保存（Ctrl+S）" },
  "editor.send_to_chat": { English: "Drag to chat input (select code first for line range)", Русский: "Перетащите в чат (выделите код для указания строк)", Español: "Arrastra al chat (selecciona código para incluir líneas)", Deutsch: "In den Chat ziehen (Code markieren für Zeilenbereich)", Français: "Glissez dans le chat (sélectionnez du code pour la plage de lignes)", 中文: "拖到聊天输入框（先选中代码可附加行号）" },
  "editor.preview": { English: "Toggle HTML preview", Русский: "Превью HTML", Español: "Vista previa HTML", Deutsch: "HTML-Vorschau", Français: "Aperçu HTML", 中文: "HTML 预览" },
  "editor.close_tab": { English: "Close", Русский: "Закрыть", Español: "Cerrar", Deutsch: "Schließen", Français: "Fermer", 中文: "关闭" },

  // ===== FileTree =====
  "ftree.new_file": { English: "New file", Русский: "Новый файл", Español: "Nuevo archivo", Deutsch: "Neue Datei", Français: "Nouveau fichier", 中文: "新建文件" },
  "ftree.new_folder": { English: "New folder", Русский: "Новая папка", Español: "Nueva carpeta", Deutsch: "Neuer Ordner", Français: "Nouveau dossier", 中文: "新建文件夹" },
  "ftree.refresh": { English: "Refresh", Русский: "Обновить", Español: "Actualizar", Deutsch: "Aktualisieren", Français: "Actualiser", 中文: "刷新" },
  "ftree.collapse_all": { English: "Collapse all", Русский: "Свернуть всё", Español: "Contraer todo", Deutsch: "Alle einklappen", Français: "Tout réduire", 中文: "全部折叠" },
  "ftree.cut": { English: "Cut", Русский: "Вырезать", Español: "Cortar", Deutsch: "Ausschneiden", Français: "Couper", 中文: "剪切" },
  "ftree.copy": { English: "Copy", Русский: "Копировать", Español: "Copiar", Deutsch: "Kopieren", Français: "Copier", 中文: "复制" },
  "ftree.paste": { English: "Paste", Русский: "Вставить", Español: "Pegar", Deutsch: "Einfügen", Français: "Coller", 中文: "粘贴" },
  "ftree.paste_here": { English: "Paste here", Русский: "Вставить сюда", Español: "Pegar aquí", Deutsch: "Hier einfügen", Français: "Coller ici", 中文: "粘贴到此处" },
  "ftree.copy_path": { English: "Copy path", Русский: "Копировать путь", Español: "Copiar ruta", Deutsch: "Pfad kopieren", Français: "Copier le chemin", 中文: "复制路径" },
  "ftree.rename": { English: "Rename", Русский: "Переименовать", Español: "Renombrar", Deutsch: "Umbenennen", Français: "Renommer", 中文: "重命名" },
  "ftree.delete": { English: "Delete", Русский: "Удалить", Español: "Eliminar", Deutsch: "Löschen", Français: "Supprimer", 中文: "删除" },
  "ftree.reveal_explorer": { English: "Reveal in file explorer", Русский: "Показать в проводнике", Español: "Mostrar en el explorador", Deutsch: "Im Datei-Explorer anzeigen", Français: "Afficher dans l'explorateur", 中文: "在文件资源管理器中显示" },
  "ftree.delete_confirm": { English: 'Delete "{name}"? This cannot be undone.', Русский: 'Удалить «{name}»? Действие необратимо.', Español: '¿Eliminar "{name}"? No se puede deshacer.', Deutsch: '"{name}" löschen? Dies kann nicht rückgängig gemacht werden.', Français: 'Supprimer « {name} » ? Action irréversible.', 中文: '删除 "{name}"？此操作无法撤销。' },
  "ftree.delete_failed": { English: "Delete failed: {err}", Русский: "Не удалось удалить: {err}", Español: "Error al eliminar: {err}", Deutsch: "Löschen fehlgeschlagen: {err}", Français: "Suppression échouée : {err}", 中文: "删除失败：{err}" },
  "ftree.rename_failed": { English: "Rename failed: {err}", Русский: "Не удалось переименовать: {err}", Español: "Error al renombrar: {err}", Deutsch: "Umbenennen fehlgeschlagen: {err}", Français: "Renommage échoué : {err}", 中文: "重命名失败：{err}" },

  // ===== Terminals =====
  "term.title": { English: "TERMINAL", Русский: "ТЕРМИНАЛ", Español: "TERMINAL", Deutsch: "TERMINAL", Français: "TERMINAL", 中文: "终端" },
  "term.new": { English: "New terminal", Русский: "Новый терминал", Español: "Nuevo terminal", Deutsch: "Neues Terminal", Français: "Nouveau terminal", 中文: "新建终端" },
  "term.close": { English: "Close", Русский: "Закрыть", Español: "Cerrar", Deutsch: "Schließen", Français: "Fermer", 中文: "关闭" },
  "term.close_tab": { English: "Close tab", Русский: "Закрыть вкладку", Español: "Cerrar pestaña", Deutsch: "Tab schließen", Français: "Fermer l'onglet", 中文: "关闭标签页" },

  // ===== Confirm =====
  "confirm.approve": { English: "Approve tool call:", Русский: "Подтвердить вызов инструмента:", Español: "Aprobar llamada de herramienta:", Deutsch: "Tool-Aufruf bestätigen:", Français: "Approuver l'appel d'outil :", 中文: "批准工具调用：" },
  "confirm.yes": { English: "Yes, run it", Русский: "Да, выполнить", Español: "Sí, ejecutar", Deutsch: "Ja, ausführen", Français: "Oui, exécuter", 中文: "是，执行" },
  "confirm.always": { English: "Always allow this tool", Русский: "Всегда разрешать этот инструмент", Español: "Permitir siempre esta herramienta", Deutsch: "Dieses Tool immer erlauben", Français: "Toujours autoriser cet outil", 中文: "始终允许此工具" },
  "confirm.no": { English: "No, skip", Русский: "Нет, пропустить", Español: "No, omitir", Deutsch: "Nein, überspringen", Français: "Non, ignorer", 中文: "否，跳过" },

  // ===== Titlebar =====
  "title.minimize": { English: "Minimize", Русский: "Свернуть", Español: "Minimizar", Deutsch: "Minimieren", Français: "Réduire", 中文: "最小化" },
  "title.maximize": { English: "Maximize", Русский: "Развернуть", Español: "Maximizar", Deutsch: "Maximieren", Français: "Agrandir", 中文: "最大化" },
  "title.close": { English: "Close", Русский: "Закрыть", Español: "Cerrar", Deutsch: "Schließen", Français: "Fermer", 中文: "关闭" },

  // ===== History =====
  "history.select_model": { English: "Select a model:", Русский: "Выберите модель:", Español: "Selecciona un modelo:", Deutsch: "Modell auswählen:", Français: "Choisir un modèle :", 中文: "选择模型：" },
  "history.templates": { English: "Project templates:", Русский: "Шаблоны проекта:", Español: "Plantillas de proyecto:", Deutsch: "Projektvorlagen:", Français: "Modèles de projet :", 中文: "项目模板：" },
  "history.click_to_copy": { English: "Click to copy", Русский: "Нажмите, чтобы скопировать", Español: "Clic para copiar", Deutsch: "Zum Kopieren klicken", Français: "Cliquer pour copier", 中文: "点击复制" },
  "history.revert": { English: "Revert changes", Русский: "Откатить изменения", Español: "Revertir cambios", Deutsch: "Änderungen zurücksetzen", Français: "Annuler les modifications", 中文: "撤销更改" },

  // ===== MCP Panel =====
  "mcp.title": { English: "MCP Servers", Русский: "MCP-серверы", Español: "Servidores MCP", Deutsch: "MCP-Server", Français: "Serveurs MCP", 中文: "MCP 服务器" },
  "mcp.empty": { English: "No MCP servers configured. Add one to extend the agent with external tools.", Русский: "MCP-серверы не настроены. Добавьте сервер, чтобы расширить агент внешними инструментами.", Español: "No hay servidores MCP configurados. Añade uno para ampliar el agente con herramientas externas.", Deutsch: "Keine MCP-Server konfiguriert. Füge einen hinzu, um den Agenten mit externen Tools zu erweitern.", Français: "Aucun serveur MCP configuré. Ajoutez-en un pour étendre l'agent avec des outils externes.", 中文: "尚未配置 MCP 服务器。添加一个以为代理扩展外部工具。" },
  "mcp.tools": { English: "{n} tools", Русский: "инструментов: {n}", Español: "{n} herramientas", Deutsch: "{n} Tools", Français: "{n} outils", 中文: "{n} 个工具" },
  "mcp.connected": { English: "Connected", Русский: "Подключено", Español: "Conectado", Deutsch: "Verbunden", Français: "Connecté", 中文: "已连接" },
  "mcp.disconnected": { English: "Disconnected", Русский: "Отключено", Español: "Desconectado", Deutsch: "Getrennt", Français: "Déconnecté", 中文: "已断开" },
  "mcp.command": { English: "Command", Русский: "Команда", Español: "Comando", Deutsch: "Befehl", Français: "Commande", 中文: "命令" },
  "mcp.command_placeholder": { English: "e.g. npx or uvx", Русский: "напр. npx или uvx", Español: "p. ej. npx o uvx", Deutsch: "z. B. npx oder uvx", Français: "ex. npx ou uvx", 中文: "例如 npx 或 uvx" },
  "mcp.args": { English: "Arguments (space-separated)", Русский: "Аргументы (через пробел)", Español: "Argumentos (separados por espacios)", Deutsch: "Argumente (durch Leerzeichen getrennt)", Français: "Arguments (séparés par des espaces)", 中文: "参数（空格分隔）" },
  "mcp.args_placeholder": { English: "e.g. -y @modelcontextprotocol/server-github", Русский: "напр. -y @modelcontextprotocol/server-github", Español: "p. ej. -y @modelcontextprotocol/server-github", Deutsch: "z. B. -y @modelcontextprotocol/server-github", Français: "ex. -y @modelcontextprotocol/server-github", 中文: "例如 -y @modelcontextprotocol/server-github" },
  "mcp.env": { English: "Environment variables (KEY=VALUE, one per line)", Русский: "Переменные окружения (KEY=VALUE, по одной в строке)", Español: "Variables de entorno (KEY=VALUE, una por línea)", Deutsch: "Umgebungsvariablen (KEY=VALUE, eine pro Zeile)", Français: "Variables d'environnement (KEY=VALUE, une par ligne)", 中文: "环境变量（KEY=VALUE，每行一个）" },
  "mcp.add_server": { English: "Add Server", Русский: "Добавить сервер", Español: "Añadir servidor", Deutsch: "Server hinzufügen", Français: "Ajouter un serveur", 中文: "添加服务器" },
  "mcp.add_button": { English: "+ Add MCP Server", Русский: "+ Добавить MCP-сервер", Español: "+ Añadir servidor MCP", Deutsch: "+ MCP-Server hinzufügen", Français: "+ Ajouter un serveur MCP", 中文: "+ 添加 MCP 服务器" },
  "mcp.name_placeholder": { English: "e.g. Postgres", Русский: "напр. Postgres", Español: "p. ej. Postgres", Deutsch: "z. B. Postgres", Français: "ex. Postgres", 中文: "例如 Postgres" },
  "mcp.env_placeholder": { English: "GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx", Русский: "GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx", Español: "GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx", Deutsch: "GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx", Français: "GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx", 中文: "GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx" },

  // ===== Snapshot Panel =====
  "snap.title": { English: "Project Snapshots", Русский: "Снимки проекта", Español: "Instantáneas del proyecto", Deutsch: "Projekt-Snapshots", Français: "Instantanés du projet", 中文: "项目快照" },
  "snap.desc": { English: "Create a zip backup of your entire project. Download anytime.", Русский: "Создайте zip-резервную копию всего проекта. Скачайте в любой момент.", Español: "Crea una copia zip de todo el proyecto. Descárgala cuando quieras.", Deutsch: "Erstelle ein Zip-Backup deines gesamten Projekts. Jederzeit herunterladbar.", Français: "Créez une sauvegarde zip de tout votre projet. Téléchargeable à tout moment.", 中文: "为整个项目创建 zip 备份，可随时下载。" },
  "snap.empty": { English: "No snapshots yet.", Русский: "Снимков пока нет.", Español: "Aún no hay instantáneas.", Deutsch: "Noch keine Snapshots.", Français: "Aucun instantané.", 中文: "暂无快照。" },
  "snap.show": { English: "Show", Русский: "Показать", Español: "Mostrar", Deutsch: "Anzeigen", Français: "Afficher", 中文: "显示" },
  "snap.create": { English: "Create Snapshot", Русский: "Создать снимок", Español: "Crear instantánea", Deutsch: "Snapshot erstellen", Français: "Créer un instantané", 中文: "创建快照" },
  "snap.creating": { English: "Creating...", Русский: "Создание...", Español: "Creando...", Deutsch: "Erstellen...", Français: "Création...", 中文: "创建中..." },

  // ===== Update Modal =====
  "update.title": { English: "Update Available", Русский: "Доступно обновление", Español: "Actualización disponible", Deutsch: "Update verfügbar", Français: "Mise à jour disponible", 中文: "有可用更新" },
  "update.version_info": { English: "v{current} → v{latest}", Русский: "v{current} → v{latest}", Español: "v{current} → v{latest}", Deutsch: "v{current} → v{latest}", Français: "v{current} → v{latest}", 中文: "v{current} → v{latest}" },
  "update.whats_new": { English: "What's new", Русский: "Что нового", Español: "Novedades", Deutsch: "Neuerungen", Français: "Quoi de neuf", 中文: "更新内容" },
  "update.download": { English: "Download", Русский: "Скачать", Español: "Descargar", Deutsch: "Herunterladen", Français: "Télécharger", 中文: "下载" },
  "update.not_now": { English: "Not now", Русский: "Не сейчас", Español: "Ahora no", Deutsch: "Später", Français: "Plus tard", 中文: "稍后" },
};

export function t(key: string, lang?: Language, vars?: Record<string, string | number>): string {
  const l = lang ?? getCurrentLanguage();
  const entry = translations[key];
  let raw = entry?.[l] ?? entry?.English ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      raw = raw.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
    }
  }
  return raw;
}

export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const [lang, setLang] = useState<Language>(getCurrentLanguage());

  useEffect(() => {
    const handler = (): void => setLang(getCurrentLanguage());
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  return useCallback(
    (key: string, vars?: Record<string, string | number>) => t(key, lang, vars),
    [lang],
  );
}
