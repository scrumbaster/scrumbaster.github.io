(function (global) {
  const STORAGE_KEY = "db";

  function getSourceData() {
    if (typeof global.data !== "undefined") {
      return global.data;
    }
    if (global.window && typeof global.window.data !== "undefined") {
      return global.window.data;
    }
    return null;
  }

  function saveDataToLocalStorage() {
    if (!global.localStorage) {
      throw new Error("Local storage is not available in this browser.");
    }

    const sourceData = getSourceData();
    if (!sourceData) {
      throw new Error("The data.js script was not loaded.");
    }

    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(sourceData));
    return { success: true, key: STORAGE_KEY };
  }

  function loadFromLocalStorage() {
    if (!global.localStorage) {
      throw new Error("Local storage is not available in this browser.");
    }

    const raw = global.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error("Stored data is not valid JSON: " + error.message);
    }
  }

  function clearLocalStorage() {
    if (!global.localStorage) {
      throw new Error("Local storage is not available in this browser.");
    }

    global.localStorage.removeItem(STORAGE_KEY);
    return { success: true, key: STORAGE_KEY, cleared: true };
  }

  function getTaskTemplateOnly() {
    const stored = loadFromLocalStorage();
    if (!stored || !stored.task_template) {
      return [];
    }

    return Object.keys(stored.task_template).map(function (taskName) {
      return { task_name: taskName };
    });
  }

  function saveDateToLocalStorage(dateValue) {
    if (!dateValue) {
      throw new Error("A date value is required.");
    }

    const stored = loadFromLocalStorage() || {};
    if (!stored.settings) {
      stored.settings = {};
    }

    stored.settings.CURDATE = { val: dateValue };

    if (!global.localStorage) {
      throw new Error("Local storage is not available in this browser.");
    }

    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return { success: true, key: STORAGE_KEY, CURDATE: dateValue };
  }

  function readDateFromLocalStorage() {
    const stored = loadFromLocalStorage();
    if (!stored || !stored.settings || !stored.settings.CURDATE) {
      return null;
    }

    return stored.settings.CURDATE.val;
  }

  function checkDailyTrigger() {
    const today = new Date();
    const todayString = today.toISOString().slice(0, 10);
    const storedDate = readDateFromLocalStorage();

    if (!storedDate) {
      saveDateToLocalStorage(todayString);
      return true;
    }

    if (storedDate !== todayString) {
      saveDateToLocalStorage(todayString);
      return true;
    }

    return false;
  }

  function getLocalStorageDataForDownload() {
    const stored = loadFromLocalStorage();
    if (stored !== null) {
      return stored;
    }

    const sourceData = getSourceData();
    return sourceData || {};
  }

  function ensureStorageInitialized() {
    const stored = loadFromLocalStorage();
    if (stored !== null) {
      return stored;
    }

    const sourceData = getSourceData();
    if (sourceData) {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(sourceData));
      return sourceData;
    }

    return null;
  }

  function getTaskItemsForUi() {
    const stored = ensureStorageInitialized();
    if (!stored || !stored.task_todo) {
      return [];
    }

    return Object.keys(stored.task_todo).map(function (taskName) {
      return {
        task_name: taskName,
        task_completed: Number(stored.task_todo[taskName].tc) || 0
      };
    }).sort(function (a, b) {
      const aState = a.task_completed > 4 ? 0 : a.task_completed < 2 ? 2 : 1;
      const bState = b.task_completed > 4 ? 0 : b.task_completed < 2 ? 2 : 1;

      if (aState !== bState) {
        return aState - bState;
      }

      if (aState === 1) {
        return b.task_completed - a.task_completed;
      }

      return a.task_name.localeCompare(b.task_name);
    });
  }

  function getTaskTemplatesInfo() {
    const stored = ensureStorageInitialized();
    if (!stored || !stored.task_template) {
      return [];
    }

    return Object.keys(stored.task_template).map(function (taskName) {
      const template = stored.task_template[taskName] || {};
      return {
        task_name: taskName,
        info: [template.tt, template.int].filter(function (value) {
          return value !== undefined && value !== null && value !== "";
        }).join(" / ")
      };
    });
  }

  function updateTaskCompletion(taskName, completionValue) {
    if (!taskName) {
      throw new Error("A task name is required.");
    }

    const stored = ensureStorageInitialized();
    if (!stored || typeof stored !== "object") {
      throw new Error("No data available to update.");
    }

    if (!stored.task_todo) {
      stored.task_todo = {};
    }

    const today = new Date().toISOString().slice(0, 10);
    stored.task_todo[taskName] = Object.assign({}, stored.task_todo[taskName] || { lud: today, tc: 0 }, {
      lud: stored.task_todo[taskName] && stored.task_todo[taskName].lud ? stored.task_todo[taskName].lud : today,
      tc: Number(completionValue)
    });

    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return getTaskItemsForUi();
  }

  function addTaskToTodo(taskName) {
    if (!taskName) {
      throw new Error("A task name is required.");
    }

    const stored = loadFromLocalStorage() || getSourceData() || {};
    if (!stored || typeof stored !== "object") {
      throw new Error("No data available to update.");
    }

    if (!stored.task_todo) {
      stored.task_todo = {};
    }

    const today = new Date().toISOString().slice(0, 10);
    stored.task_todo[taskName] = { lud: today, tc: 0 };

    if (!global.localStorage) {
      throw new Error("Local storage is not available in this browser.");
    }

    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return { success: true, taskName, lud: today, tc: 0 };
  }

  function addTemplate(taskName, intervalValue, taskType, currentDate) {
    if (!taskName) {
      throw new Error("A task name is required.");
    }

    if (typeof intervalValue === "undefined" || intervalValue === null || intervalValue === "") {
      throw new Error("An interval value is required.");
    }

    if (!taskType) {
      throw new Error("A task type is required.");
    }

    if (!currentDate) {
      throw new Error("A current date is required.");
    }

    const stored = loadFromLocalStorage() || getSourceData() || {};
    if (!stored || typeof stored !== "object") {
      throw new Error("No data available to update.");
    }

    if (!stored.task_template) {
      stored.task_template = {};
    }

    const intValue = Number(intervalValue);
    stored.task_template[taskName] = {
      int: intValue,
      lcd: currentDate,
      tt: taskType
    };

    if (!global.localStorage) {
      throw new Error("Local storage is not available in this browser.");
    }

    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return { success: true, taskName, int: intValue, lcd: currentDate, tt: taskType };
  }

  function deleteTask(taskName) {
    if (!taskName) {
      throw new Error("A task name is required.");
    }

    const stored = loadFromLocalStorage();
    if (!stored || !stored.task_todo) {
      return [];
    }

    if (stored.task_todo[taskName]) {
      delete stored.task_todo[taskName];
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    }

    const rows = Object.keys(stored.task_todo).map(function (name) {
      return { task_name: name };
    });

    rows.sort(function (a, b) {
      return a.task_name.localeCompare(b.task_name);
    });

    return rows;
  }

  function deleteTemplate(taskName) {
    if (!taskName) {
      throw new Error("A task name is required.");
    }

    const stored = loadFromLocalStorage();
    if (!stored) {
      return [];
    }

    if (stored.task_template && stored.task_template[taskName]) {
      delete stored.task_template[taskName];
    }

    if (stored.task_todo && stored.task_todo[taskName]) {
      delete stored.task_todo[taskName];
    }

    if (stored.task_template || stored.task_todo) {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    }

    const rows = Object.keys(stored.task_todo || {}).map(function (name) {
      return { task_name: name };
    });

    rows.sort(function (a, b) {
      return a.task_name.localeCompare(b.task_name);
    });

    return rows;
  }

  global.DataAccess = {
    STORAGE_KEY,
    saveDataToLocalStorage,
    loadFromLocalStorage,
    clearLocalStorage,
    getTaskTemplateOnly,
    saveDateToLocalStorage,
    readDateFromLocalStorage,
    checkDailyTrigger,
    ensureStorageInitialized,
    getTaskItemsForUi,
    getTaskTemplatesInfo,
    updateTaskCompletion,
    addTaskToTodo,
    addTemplate,
    deleteTask,
    deleteTemplate,
    getLocalStorageDataForDownload
  };

  global.saveDataToLocalStorage = saveDataToLocalStorage;
  global.loadFromLocalStorage = loadFromLocalStorage;
  global.clearLocalStorage = clearLocalStorage;
  global.getTaskTemplateOnly = getTaskTemplateOnly;
  global.saveDateToLocalStorage = saveDateToLocalStorage;
  global.readDateFromLocalStorage = readDateFromLocalStorage;
  global.checkDailyTrigger = checkDailyTrigger;
  global.ensureStorageInitialized = ensureStorageInitialized;
  global.getTaskItemsForUi = getTaskItemsForUi;
  global.getTaskTemplatesInfo = getTaskTemplatesInfo;
  global.updateTaskCompletion = updateTaskCompletion;
  global.addTaskToTodo = addTaskToTodo;
  global.addTemplate = addTemplate;
  global.deleteTask = deleteTask;
  global.deleteTemplate = deleteTemplate;
  global.getLocalStorageDataForDownload = getLocalStorageDataForDownload;
})(window);
